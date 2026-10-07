/**
 * The small amount of wiring every preview tool repeats.
 *
 * These tools all have the same shape: something in, an option or two, a result
 * and a copy button. What differs is only the middle, so the ends live here and
 * each tool's script is left with the part that is actually its own.
 */

import type { MessageKey } from '../i18n'
import { currentTranslator } from '../i18n/client'
import { clearError, copyText, downloadText, setDisabled, setStat, setValue, showError, toggleHidden } from './tool-panel'
import { recordToolUsage } from './usage'

export type WorkspaceRefs = {
  root: HTMLElement
  input: HTMLTextAreaElement | null
  output: HTMLTextAreaElement | null
  error: HTMLElement | null
  result: HTMLElement | null
  status: HTMLElement | null
  copy: HTMLButtonElement | null
  download: HTMLButtonElement | null
  run: HTMLButtonElement | null
  /** The optional second action, for tools with a mode besides formatting. */
  secondary: HTMLButtonElement | null
  clear: HTMLButtonElement | null
  /** Any other element in the workspace, by the name after the tool's prefix. */
  el: <T extends HTMLElement = HTMLElement>(name: string) => T | null
}

export type WorkspaceRun = {
  /** Reads an option input, e.g. `run.option('indent')`. */
  option: (name: string) => string
  checked: (name: string) => boolean
  number: (name: string, fallback: number) => number
  /** Shows the result, and counts as one use of the tool. */
  success: (value: string, status: string) => void
  /** Explains why there is no result; the message goes in the error box. */
  failure: (message: string, status?: string) => void
  /** Writes one value into the stats row, by its name after the tool's prefix. */
  stat: (name: string, value: string) => void
  /** The page's translator, so a tool can say what went wrong in this language. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  copy: () => void
  download: (filename: string) => void
}

/**
 * What a tool hands back: the handler for the run button, a changed option and
 * Cmd/Ctrl+Enter, and optionally a second action.
 *
 * Both are plain functions rather than a closure `mountWorkspace` rebuilds, so
 * nothing they read changes underneath them.
 */
export type WorkspaceActions = { run?: () => void; secondary?: () => void }

export type WorkspaceSetup = (refs: WorkspaceRefs, run: WorkspaceRun) => WorkspaceActions | (() => void) | void

export type MountOptions = {
  /** Re-run as the input is typed, for tools where the result is cheap to keep up to date. */
  live?: boolean
  /** Puts the sample in the input on arrival. */
  sample?: string
}

/** One set for the whole page, because `astro:page-load` fires on every navigation. */
const mounted = new WeakSet<HTMLElement>()

/**
 * Finds the workspace and wires up the parts that are the same everywhere.
 *
 * Element ids are the tool's own id with a suffix: `#yaml-format-input`,
 * `#yaml-format-output`, `#yaml-format-stat-keys`, and so on.
 */
export function mountWorkspace(tool: string, setup: WorkspaceSetup, options: MountOptions = {}) {
  const init = () => {
    const root = document.querySelector<HTMLElement>(`.${tool}-workspace`)
    if (!root || mounted.has(root)) return
    mounted.add(root)

    const el = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`#${tool}-${name}`)
    const refs: WorkspaceRefs = {
      root,
      input: el<HTMLTextAreaElement>('input'),
      output: el<HTMLTextAreaElement>('output'),
      error: el('error'),
      result: el('result'),
      status: el('status'),
      copy: el<HTMLButtonElement>('copy'),
      download: el<HTMLButtonElement>('download'),
      run: el<HTMLButtonElement>('run'),
      secondary: el<HTMLButtonElement>('secondary'),
      clear: el<HTMLButtonElement>('clear'),
      el
    }

    let used = false
    const run: WorkspaceRun = {
      option: (name) => refs.el<HTMLInputElement>(name)?.value ?? '',
      checked: (name) => refs.el<HTMLInputElement>(name)?.checked ?? false,
      number: (name, fallback) => {
        const value = Number(refs.el<HTMLInputElement>(name)?.value ?? '')
        return Number.isFinite(value) ? value : fallback
      },
      success: (value, status) => {
        clearError(refs.error)
        setValue(refs.output, value)
        toggleHidden(refs.result, false)
        setDisabled(refs.copy, value.length === 0)
        setDisabled(refs.download, value.length === 0)
        if (refs.status) refs.status.textContent = status
        if (!used && value !== '') {
          used = true
          recordToolUsage(tool)
        }
      },
      failure: (message, status) => {
        setValue(refs.output, '')
        setDisabled(refs.copy, true)
        setDisabled(refs.download, true)
        showError(refs.error, message)
        if (status && refs.status) refs.status.textContent = status
      },
      stat: (name, value) => setStat(refs.root, `${tool}-stat-${name}`, value),
      t: currentTranslator(),
      copy: () => void copyText(refs.output?.value ?? ''),
      download: (filename) => downloadText(refs.output?.value ?? '', filename)
    }

    if (options.sample && refs.input && refs.input.value === '') refs.input.value = options.sample

    const given = setup(refs, run)
    const actions: WorkspaceActions = typeof given === 'function' ? { run: given } : (given ?? {})
    const fire = () => actions.run?.()

    refs.run?.addEventListener('click', () => refs.root.dispatchEvent(new CustomEvent('tool:run')))
    refs.secondary?.addEventListener('click', () => actions.secondary?.())
    refs.clear?.addEventListener('click', () => {
      setValue(refs.input, '')
      refs.input?.focus()
      refs.root.dispatchEvent(new CustomEvent('tool:run'))
    })
    refs.copy?.addEventListener('click', () => run.copy())
    refs.download?.addEventListener('click', () => run.download(`${tool}.txt`))
    refs.input?.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        refs.root.dispatchEvent(new CustomEvent('tool:run'))
      }
    })
    if (options.live && refs.input) {
      let timer = 0
      refs.input.addEventListener('input', () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => refs.root.dispatchEvent(new CustomEvent('tool:run')), 220)
      })
    }
    root.addEventListener('change', () => refs.root.dispatchEvent(new CustomEvent('tool:run')))
    root.addEventListener('tool:run', fire)
    refs.root.dispatchEvent(new CustomEvent('tool:run'))
  }

  document.addEventListener('astro:page-load', init)
  init()
}