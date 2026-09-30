import {
  applyPreset,
  currentQualityDial,
  buildFfmpegArgs,
  buildFfmpegCommand,
  describeFlags,
  filterPreview,
  isScreenRecording,
  qualityDial,
  retargetOutputName,
  suggestOutputName,
  validateFfmpegPlan,
  type FfmpegIssue,
  type FfmpegPlan,
  type FfmpegPresetId,
  type ScaleModeId
} from '../lib/ffmpeg'
import { currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, setDisabled, setText, setValue, showError, toggleHidden } from './tool-panel'

/** The starting point: a plain H.264/AAC transcode, which is what most asks are. */
const basePlan: FfmpegPlan = {
  preset: 'transcode',
  input: '',
  inputFormat: '',
  inputOptions: '',
  secondInput: '',
  screenSource: 'macos',
  output: '',
  container: 'mp4',
  mapMode: 'auto',
  start: '',
  duration: '',
  frameCount: '',
  speed: '',
  scaleMode: 'keep',
  width: '',
  height: '',
  fps: '',
  videoCodec: 'libx264',
  qualityMode: 'crf',
  crf: '23',
  videoBitrate: '',
  encoderPreset: 'medium',
  audioCodec: 'aac',
  audioBitrate: '192k',
  channels: 'default',
  volume: '',
  watermark: 'none',
  watermarkText: '',
  watermarkPosition: 'bottom-right',
  subtitle: '',
  gifPalette: true,
  shortest: false,
  overwrite: true,
  hideBanner: false,
  extra: ''
}

/**
 * Two fields break the one-name-one-element rule: the overlay image is the
 * second ffmpeg input, and the container select lives outside the field grid.
 * Everything else converts mechanically.
 */
/**
 * The form has no numbers to type, so every option is a choice with a fixed
 * meaning. These tables are the whole vocabulary the reader can reach, which is
 * what keeps a CRF or a demuxer name from ever having to be typed.
 */
const sizeChoices: Record<string, { scaleMode: ScaleModeId; width: string; height: string }> = {
  keep: { scaleMode: 'keep', width: '', height: '' },
  uhd: { scaleMode: 'width', width: '3840', height: '' },
  qhd: { scaleMode: 'width', width: '2560', height: '' },
  fhd: { scaleMode: 'width', width: '1920', height: '' },
  hd: { scaleMode: 'width', width: '1280', height: '' },
  sd: { scaleMode: 'width', width: '854', height: '' },
  portrait: { scaleMode: 'height', width: '', height: '1920' }
}

const fpsChoices: Record<string, string> = { keep: '', f24: '24', f25: '25', f30: '30', f60: '60' }
const speedChoices: Record<string, string> = { keep: '', slow: '0.5', slight: '0.75', quick: '1.5', double: '2', quad: '4' }
const volumeChoices: Record<string, string> = { keep: '', quiet: '0', half: '0.5', loud: '1.5', double: '2' }
const bitrateChoices: Record<string, string> = { auto: '', k96: '96k', k128: '128k', k192: '192k', k256: '256k' }
const startChoices: Record<string, string> = { begin: '', s5: '5', s10: '10', s30: '30', m1: '60', m2: '120' }
const durationChoices: Record<string, string> = { all: '', s5: '5', s15: '15', s30: '30', m1: '60', m2: '120' }

/** The choice that produced a value, so a recipe's number shows as the answer. */
function choiceOf(table: Record<string, string>, value: string, fallback: string): string {
  return Object.keys(table).find((key) => table[key] === value) ?? fallback
}

const controlId: Record<PlanField, string> = {
  ...(Object.fromEntries(
    (Object.keys(basePlan) as PlanField[]).map((field) => [field, `ffmpeg-${field.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`])
  ) as Record<PlanField, string>),
  secondInput: 'ffmpeg-watermark-image'
}

type PlanField = keyof FfmpegPlan

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.ffmpeg-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)
  const findAll = <T extends HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector))
  const pick = <T extends HTMLElement = HTMLElement>(id: string) => find<T>(`#${id}`)
  const text = (id: string) => find<HTMLInputElement>(`#${id}`)?.value ?? ''

  const generateButton = pick<HTMLButtonElement>('ffmpeg-generate')
  const resetButton = pick<HTMLButtonElement>('ffmpeg-reset')
  const errorBox = pick<HTMLElement>('ffmpeg-error')
  const resultCard = pick<HTMLElement>('ffmpeg-result')
  const resultStatus = pick<HTMLElement>('ffmpeg-result-status')
  const commandOutput = pick<HTMLTextAreaElement>('ffmpeg-output-command')
  const copyButton = pick<HTMLButtonElement>('ffmpeg-copy')
  const downloadButton = pick<HTMLButtonElement>('ffmpeg-download')
  const issuesBox = pick<HTMLElement>('ffmpeg-issues')
  const flagList = pick<HTMLElement>('ffmpeg-flag-list')
  const screenHint = pick<HTMLElement>('ffmpeg-screen-hint')
  const watermarkImageField = pick<HTMLElement>('ffmpeg-watermark-image-field')
  const watermarkTextField = pick<HTMLElement>('ffmpeg-watermark-text-field')
  const watermarkPositionField = pick<HTMLElement>('ffmpeg-watermark-position-field')
  const goalButtons = findAll<HTMLButtonElement>('[data-preset]')
  const dialButtons = findAll<HTMLButtonElement>('#ffmpeg-quality-dial [data-quality]')
  const previewBar = pick<HTMLElement>('ffmpeg-preview')
  const previewCommand = pick<HTMLElement>('ffmpeg-preview-command')
  const chainBox = pick<HTMLElement>('ffmpeg-chain')
  const chainCommand = pick<HTMLElement>('ffmpeg-chain-command')

  let processed = ''
  let usageRecorded = false
  /** Once the reader types in the output box, the suggestion stops second-guessing them. */
  let outputEdited = false

  function readPlan(): FfmpegPlan {
    const plan = { ...basePlan }
    for (const field of Object.keys(basePlan) as PlanField[]) {
      const id = controlId[field]
      // A field the form does not expose keeps whatever the recipe set for it,
      // which is why nothing here has to be typed to get a complete plan.
      if (typeof plan[field] === 'boolean') {
        const element = find<HTMLInputElement>(`#${id}`)
        if (element) plan[field] = element.checked as never
      } else if (typeof plan[field] === 'string') {
        const element = find<HTMLInputElement>(`#${id}`)
        if (element) plan[field] = element.value as never
      }
    }
    applyChoiceTables(plan)
    return plan
  }

  /**
   * The choice lists and the plan fields are two views of the same decision, so
   * the lists are read back into the fields the builder actually consumes.
   */
  function applyChoiceTables(plan: FfmpegPlan) {
    const size = sizeChoices[text('ffmpeg-size')] ?? sizeChoices.keep
    // Recording takes its capture size from these same numbers, so there is no
    // separate size to ask for and no rescale to emit.
    const recording = isScreenRecording(plan)
    plan.scaleMode = recording ? 'keep' : size.scaleMode
    plan.width = size.width
    plan.height = size.height
    plan.fps = fpsChoices[text('ffmpeg-fps')] ?? ''
    plan.speed = speedChoices[text('ffmpeg-speed')] ?? ''
    plan.volume = volumeChoices[text('ffmpeg-volume')] ?? ''
    plan.audioBitrate = bitrateChoices[text('ffmpeg-audio-bitrate')] ?? ''
    plan.start = startChoices[text('ffmpeg-start')] ?? ''
    plan.duration = durationChoices[text('ffmpeg-duration')] ?? ''
    return plan
  }

  /** The other direction, so a recipe's value is shown as the matching answer. */
  function syncChoiceControls(plan: FfmpegPlan) {
    const size = Object.keys(sizeChoices).find((key) => {
      const entry = sizeChoices[key]
      return entry.scaleMode === plan.scaleMode && entry.width === plan.width && entry.height === plan.height
    })
    writeSelect('ffmpeg-size', size ?? 'keep')
    writeSelect('ffmpeg-fps', choiceOf(fpsChoices, plan.fps, 'keep'))
    writeSelect('ffmpeg-speed', choiceOf(speedChoices, plan.speed, 'keep'))
    writeSelect('ffmpeg-volume', choiceOf(volumeChoices, plan.volume, 'keep'))
    writeSelect('ffmpeg-audio-bitrate', choiceOf(bitrateChoices, plan.audioBitrate, 'auto'))
    writeSelect('ffmpeg-start', choiceOf(startChoices, plan.start, 'begin'))
    writeSelect('ffmpeg-duration', choiceOf(durationChoices, plan.duration, 'all'))
  }

  /**
   * SelectField keeps the chosen value in a hidden input and paints the label on
   * a trigger, so both have to be written together or the control keeps showing
   * whatever it was last set to.
   */
  function writeSelect(id: string, selected: string) {
    const hidden = find<HTMLInputElement>(`#${id}`)
    const option = find<HTMLElement>(`#${id}-menu [data-value="${CSS.escape(selected)}"]`)
    const triggerLabel = find<HTMLElement>(`#${id}-trigger > span`)
    if (hidden) hidden.value = selected
    if (triggerLabel) triggerLabel.textContent = option?.textContent?.trim() ?? selected
  }

  function writeField(field: PlanField, next: string | boolean) {
    const id = controlId[field]
    if (typeof next === 'boolean') {
      const element = find<HTMLInputElement>(`#${id}`)
      if (element) element.checked = next
      return
    }
    if (find(`#${id}-trigger`)) {
      writeSelect(id, next)
      return
    }
    const element = find<HTMLInputElement>(`#${id}`)
    if (element) element.value = next
  }

  function applyPlan(next: FfmpegPlan) {
    for (const field of Object.keys(next) as PlanField[]) writeField(field, next[field])
    syncChoiceControls(next)
    syncVisibility(next)
    resetResult()
  }

  /** Picking a goal is an edit like any other: the command follows it. */
  function selectGoal(presetId: FfmpegPresetId) {
    const next = applyPreset(readPlan(), presetId)
    next.output = next.input ? retargetOutputName(next.output, next.container) : ''
    if (!next.output && next.input) next.output = suggestOutputName(next.input, next.container)
    applyPlan(next)
    afterEdit()
  }

  /** Only the fields the current preset or mode actually reads are shown. */
  function syncVisibility(current: FfmpegPlan) {
    const t = currentTranslator()
    const recording = isScreenRecording(current)
    toggleHidden(pick<HTMLElement>('ffmpeg-input-field'), recording)
    toggleHidden(pick<HTMLElement>('ffmpeg-screen-field'), !recording)
    setText(screenHint, recording ? t(`toolUi.ffmpeg-builder.screenHints.${current.screenSource}`) : '')

    toggleHidden(watermarkImageField, current.watermark !== 'image')
    toggleHidden(watermarkTextField, current.watermark !== 'text')
    toggleHidden(watermarkPositionField, current.watermark === 'none')
  }

  /**
   * The filter stage is a chain, so the stage shows the chain. Reading it here
   * keeps the displayed value the same string ffmpeg is handed, rather than a
   * second rendering of the options that could drift from the builder.
   */
  function renderChain(plan: FfmpegPlan) {
    if (!chainBox || !chainCommand) return
    const graph = filterPreview(plan)
    const parts: string[] = []
    if (graph.complex) parts.push(`-filter_complex \"${graph.complex}\"`)
    if (graph.video) parts.push(`-vf ${graph.video}`)
    if (graph.audio) parts.push(`-af ${graph.audio}`)
    setText(chainCommand, parts.join('  '))
    toggleHidden(chainBox, parts.length === 0)
  }

  function resetResult() {
    processed = ''
    toggleHidden(previewBar, true)
    toggleHidden(resultCard, true)
    setValue(commandOutput, '')
    setText(resultStatus, currentTranslator()('workspace.waiting'))
    setDisabled(copyButton, true)
    setDisabled(downloadButton, true)
    toggleHidden(issuesBox, true)
    setText(issuesBox, '')
    flagList?.replaceChildren()
  }

  /** A generated command is only useful if each flag can be read back. */
  function renderFlagList(args: readonly string[]) {
    if (!flagList) return
    const t = currentTranslator()
    const rows = describeFlags(args).map((row) => {
      const item = document.createElement('div')
      item.className = 'ffmpeg-flag-row'
      const flag = document.createElement('code')
      flag.className = 'ffmpeg-flag-name'
      flag.textContent = row.value ? `${row.flag} ${row.value}` : row.flag
      const note = document.createElement('span')
      note.className = 'ffmpeg-flag-note'
      note.textContent = t(row.key as MessageKey)
      item.append(flag, note)
      return item
    })
    flagList.replaceChildren(...rows)
  }

  /**
   * The validator reports a bare key so it does not have to know the dictionary
   * layout; the message lives under the level that described it.
   */
  function issueText(t: ReturnType<typeof currentTranslator>, issue: FfmpegIssue): string {
    return t(`toolUi.ffmpeg-builder.${issue.level === 'error' ? 'errors' : 'warnings'}.${issue.key}` as MessageKey)
  }

  function generate() {
    clearError(errorBox)
    const current = readPlan()
    const issues = validateFfmpegPlan(current)
    const t = currentTranslator()
    const errors = issues.filter((issue) => issue.level === 'error')

    if (errors.length > 0) {
      showError(errorBox, issueText(t, errors[0]))
      resetResult()
      return
    }

    const args = buildFfmpegArgs(current)
    const command = buildFfmpegCommand(current)

    processed = command
    setValue(commandOutput, command)
    setText(previewCommand, command)
    toggleHidden(previewBar, false)
    toggleHidden(resultCard, false)
    setText(resultStatus, t('toolUi.ffmpeg-builder.runtime.done'))
    setDisabled(copyButton, false)
    setDisabled(downloadButton, false)

    // Warnings are rendered as one block: they read as a checklist, and the
    // command is still valid enough to copy.
    const warnings = issues.filter((issue) => issue.level === 'warning')
    setText(issuesBox, warnings.map((issue) => `· ${issueText(t, issue)}`).join('\n'))
    toggleHidden(issuesBox, warnings.length === 0)

    renderFlagList(args)
    if (!usageRecorded) {
      usageRecorded = true
      recordToolUsage('ffmpeg-builder')
    }
  }

  /**
   * The browser will not hand over a real path, but it will hand over the name
   * of the file the reader actually chose, which is the part they would have had
   * to type. Everything after this is a choice, not a value to enter.
   */
  function bindFilePicker(pickerId: string, targetId: string) {
    const picker = find<HTMLInputElement>(`#${pickerId}`)
    picker?.addEventListener('change', () => {
      const file = picker.files?.[0]
      if (!file) return
      find<HTMLInputElement>(`#${targetId}`)!.value = file.name
      afterEdit()
    })
  }

  function suggestOutput() {
    if (outputEdited) return
    const source = text(controlId.input)
    if (!source.trim()) return
    const container = (text(controlId.container) || 'mp4') as FfmpegPlan['container']
    writeField('output', suggestOutputName(source, container))
  }

  goalButtons.forEach((button) =>
    button.addEventListener('click', () => {
      revealGoal(button)
      selectGoal((button.dataset.preset ?? 'custom') as FfmpegPresetId)
    })
  )

  /**
   * The chosen goal has to stay on screen, and the other list has to get out of
   * the way, so whichever disclosure holds the pressed card is the only one open.
   */
  function revealGoal(button: HTMLButtonElement) {
    for (const list of findAll<HTMLElement>('.ffmpeg-chips')) {
      const owner = list.closest('details')
      if (owner) owner.open = list.contains(button)
    }
  }

  // The dial is a shortcut onto the CRF field, not a second source of truth, so
  // it highlights whichever of the three the current number happens to match and
  // shows nothing selected once the CRF has been typed by hand.
  dialButtons.forEach((button) =>
    button.addEventListener('click', () => {
      const entry = qualityDial.find((item) => item.id === (button.dataset.quality ?? ''))
      if (!entry) return
      const next = readPlan()
      next.qualityMode = 'crf'
      next.crf = entry.crf
      applyPlan(next)
      afterEdit()
    })
  )

  function syncDial(current: FfmpegPlan) {
    const active = currentQualityDial(current)
    for (const button of dialButtons) {
      const on = button.dataset.quality === active
      button.classList.toggle('is-active', on)
      button.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
  }

  /** The chosen goal is the one card that looks pressed. */
  function syncGoal(current: FfmpegPlan) {
    for (const button of goalButtons) {
      const on = button.dataset.preset === current.preset
      button.classList.toggle('is-active', on)
      button.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
  }

  /**
   * Every change goes through here. The form is small and the command is cheap to
   * rebuild, so it is regenerated as soon as there is enough to build one from,
   * which turns the ordinary path into "type a filename, read the command"
   * instead of "fill in the form, then find the button".
   */
  function afterEdit() {
    clearError(errorBox)
    // The name is refreshed first, so the command below is built from the name the
    // reader is about to see rather than the one that was there a keystroke ago.
    suggestOutput()
    const current = readPlan()
    syncVisibility(current)
    syncGoal(current)
    syncDial(current)
    renderChain(current)
    if (current.input.trim() !== '' && current.output.trim() !== '') generate()
    else resetResult()
  }

  // Registered before the shared handler, so the first character typed into the
  // output box is recorded as the reader's own before the suggestion gets a say.
  find<HTMLInputElement>(`#${controlId.output}`)?.addEventListener('input', () => {
    outputEdited = true
  })

  findAll<HTMLInputElement>('.tool-card input').forEach((control) => {
    // A file picker is not a value: it names a file, so it fills a path instead
    // of being read as one.
    if (control.type === 'file') return
    control.addEventListener('input', afterEdit)
    control.addEventListener('change', afterEdit)
  })

  bindFilePicker('ffmpeg-input-file', controlId.input)
  bindFilePicker('ffmpeg-watermark-image-file', controlId.secondInput)
  bindFilePicker('ffmpeg-subtitle-file', controlId.subtitle)

  generateButton?.addEventListener('click', generate)
  resetButton?.addEventListener('click', () => {
    outputEdited = false
    applyPlan(applyPreset(basePlan, 'transcode'))
    afterEdit()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'ffmpeg-command.sh'))
  root.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      generate()
    }
  })

  // Usage is a visit, not a keystroke, so the auto-rebuild cannot inflate it.
  syncVisibility(readPlan())
  syncGoal(readPlan())
  syncDial(readPlan())
  renderChain(readPlan())
  resetResult()
}

document.addEventListener('astro:page-load', init)
init()