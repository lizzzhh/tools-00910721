/**
 * Assembling an ffmpeg command line.
 *
 * ffmpeg's grammar is positional and unforgiving. An option belongs to the file
 * that follows it, `-ss` before `-i` means something different from `-ss` after
 * it, and the output is always last with no flag in front of it. So everything
 * here is a pure function from a plan to an argument list, and the ordering is
 * asserted in tests rather than eyeballed in a browser.
 *
 * Nothing in this file knows about the DOM or about translations; issues come
 * back as message keys for the caller to resolve.
 */

// --------------------------------------------------------------------- shape

export type FfmpegPresetId =
  | 'custom'
  | 'transcode'
  | 'extract-audio'
  | 'extract-video'
  | 'extract-frame'
  | 'to-gif'
  | 'compress'
  | 'trim'
  | 'resize'
  | 'crop'
  | 'watermark'
  | 'subtitle'
  | 'concat'
  | 'image-sequence'
  | 'speed'
  | 'screen-record'

export type ContainerId =
  | 'mp4'
  | 'mkv'
  | 'mov'
  | 'webm'
  | 'ts'
  | 'gif'
  | 'mp3'
  | 'm4a'
  | 'wav'
  | 'flac'
  | 'opus'
  | 'png'
  | 'jpg'
  | 'webp'

/** Which streams a container is able to carry at all. */
export type ContainerKind = 'both' | 'video' | 'audio' | 'image'

/** `auto` lets ffmpeg pick; the rest pin the mapping down explicitly. */
export type MapModeId = 'auto' | 'video' | 'audio' | 'mute'

export type VideoCodecId =
  | 'default'
  | 'none'
  | 'copy'
  | 'libx264'
  | 'libx265'
  | 'libvpx-vp9'
  | 'libaom-av1'
  | 'mpeg4'
  | 'h264_nvenc'
  | 'hevc_nvenc'
  | 'h264_qsv'
  | 'h264_videotoolbox'

export type AudioCodecId = 'default' | 'none' | 'copy' | 'aac' | 'libmp3lame' | 'libopus' | 'flac' | 'pcm_s16le'

/** `crf` is constant quality, `bitrate` is constant size, `default` says nothing. */
export type QualityModeId = 'default' | 'crf' | 'bitrate'

export type EncoderPresetId = 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow' | 'veryslow'

export type ScaleModeId = 'keep' | 'width' | 'height' | 'exact' | 'pad' | 'crop'

export type ChannelModeId = 'default' | 'mono' | 'stereo'

export type WatermarkModeId = 'none' | 'image' | 'text'

export type WatermarkPositionId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export type ScreenSourceId = 'macos' | 'linux' | 'windows'

export type FfmpegPlan = {
  preset: FfmpegPresetId
  input: string
  /** `-f` placed before `-i`; the demuxer to read the input with. */
  inputFormat: string
  /** Raw options spliced in before `-i`, such as concat's `-safe 0`. */
  inputOptions: string
  /** The overlay image, or the only source when concatenating. */
  secondInput: string
  screenSource: ScreenSourceId
  output: string
  container: ContainerId
  mapMode: MapModeId
  start: string
  duration: string
  frameCount: string
  speed: string
  scaleMode: ScaleModeId
  width: string
  height: string
  fps: string
  videoCodec: VideoCodecId
  qualityMode: QualityModeId
  crf: string
  videoBitrate: string
  encoderPreset: EncoderPresetId
  audioCodec: AudioCodecId
  audioBitrate: string
  channels: ChannelModeId
  volume: string
  watermark: WatermarkModeId
  watermarkText: string
  watermarkPosition: WatermarkPositionId
  subtitle: string
  /** Two-pass palette so a GIF keeps its colours instead of dithering badly. */
  gifPalette: boolean
  shortest: boolean
  overwrite: boolean
  hideBanner: boolean
  extra: string
}

// ------------------------------------------------------------------ vocabularies

export const containers: { id: ContainerId; extension: string; kind: ContainerKind }[] = [
  { id: 'mp4', extension: 'mp4', kind: 'both' },
  { id: 'mkv', extension: 'mkv', kind: 'both' },
  { id: 'mov', extension: 'mov', kind: 'both' },
  { id: 'webm', extension: 'webm', kind: 'both' },
  { id: 'ts', extension: 'ts', kind: 'both' },
  { id: 'gif', extension: 'gif', kind: 'video' },
  { id: 'mp3', extension: 'mp3', kind: 'audio' },
  { id: 'm4a', extension: 'm4a', kind: 'audio' },
  { id: 'wav', extension: 'wav', kind: 'audio' },
  { id: 'flac', extension: 'flac', kind: 'audio' },
  { id: 'opus', extension: 'opus', kind: 'audio' },
  { id: 'png', extension: 'png', kind: 'image' },
  { id: 'jpg', extension: 'jpg', kind: 'image' },
  { id: 'webp', extension: 'webp', kind: 'image' }
]

export const videoCodecs: VideoCodecId[] = [
  'default',
  'none',
  'copy',
  'libx264',
  'libx265',
  'libvpx-vp9',
  'libaom-av1',
  'mpeg4',
  'h264_nvenc',
  'hevc_nvenc',
  'h264_qsv',
  'h264_videotoolbox'
]

export const audioCodecs: AudioCodecId[] = ['default', 'none', 'copy', 'aac', 'libmp3lame', 'libopus', 'flac', 'pcm_s16le']

export const encoderPresets: EncoderPresetId[] = ['ultrafast', 'veryfast', 'fast', 'medium', 'slow', 'veryslow']

export const scaleModes: ScaleModeId[] = ['keep', 'width', 'height', 'exact', 'pad', 'crop']

export const watermarkPositions: WatermarkPositionId[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']

export const screenSources: ScreenSourceId[] = ['macos', 'linux', 'windows']

/** `-preset` on libvpx/libx26x; hardware encoders get their own vocabulary. */
const nvencPresetLevels: Record<EncoderPresetId, string> = {
  ultrafast: 'p1',
  veryfast: 'p2',
  fast: 'p3',
  medium: 'p4',
  slow: 'p5',
  veryslow: 'p7'
}

/** libaom trades speed for size through `-cpu-used`, where lower is slower. */
const aomCpuUsed: Record<EncoderPresetId, string> = {
  ultrafast: '8',
  veryfast: '7',
  fast: '6',
  medium: '5',
  slow: '3',
  veryslow: '1'
}

/**
 * Where a watermark sits, in the coordinates the filters understand. `W`/`H` are
 * the main input and `w`/`h` the overlay, which is why `W-w-10` is the inset
 * from the right edge rather than a plain number.
 */
const overlayCoordinates: Record<WatermarkPositionId, string> = {
  'top-left': '10:10',
  'top-right': 'W-w-10:10',
  'bottom-left': '10:H-h-10',
  'bottom-right': 'W-w-10:H-h-10',
  center: '(W-w)/2:(H-h)/2'
}

/** Only these muxers move the moov atom to the front for progressive playback. */
const fastStartContainers: ContainerId[] = ['mp4', 'm4a']

/** The extensions a container name is recognised by, used to re-point a filename. */
const knownOutputExtensions = new Set<string>([
  ...containers.map((container) => container.extension),
  'm4v',
  'mts',
  'ts',
  'vob',
  '3gp',
  'mpeg',
  'mpg',
  'm2ts',
  'ape',
  'wma',
  'aiff',
  'aif',
  'tif',
  'tiff'
])

export function containerInfo(id: ContainerId) {
  return containers.find((container) => container.id === id) ?? containers[0]
}

// ---------------------------------------------------------------------- presets

/**
 * Every preset is a patch laid over the current plan rather than a whole plan,
 * so picking one keeps the file names and the odds and ends already typed in.
 */
/**
 * `icon` and `primary` are presentation, not ffmpeg semantics, but they describe
 * the same list: a goal is how the reader arrives, so the way it is offered
 * belongs beside the flags it sets.
 */
export type FfmpegPreset = {
  id: FfmpegPresetId
  patch: Partial<FfmpegPlan>
  icon: string
  /** The handful of goals offered before anyone has to look for the rest. */
  primary: boolean
  /** Reading order, so a goal added later does not land in an arbitrary slot. */
  order: number
}

export const ffmpegPresets: FfmpegPreset[] = [
  { id: 'custom', icon: 'lucide:settings', primary: false, order: 99, patch: {} },
  {
    id: 'transcode',
    icon: 'lucide:repeat',
    primary: true,
    order: 1,
    patch: {
      container: 'mp4',
      mapMode: 'auto',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      encoderPreset: 'medium',
      audioCodec: 'aac',
      audioBitrate: '192k'
    }
  },
  {
    id: 'extract-audio',
    icon: 'lucide:music',
    primary: true,
    order: 3,
    patch: {
      container: 'mp3',
      mapMode: 'audio',
      videoCodec: 'none',
      qualityMode: 'default',
      audioCodec: 'libmp3lame',
      audioBitrate: '192k'
    }
  },
  {
    id: 'extract-video',
    icon: 'lucide:volume-x',
    primary: true,
    order: 4,
    patch: {
      container: 'mp4',
      mapMode: 'mute',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      audioCodec: 'none'
    }
  },
  {
    id: 'extract-frame',
    icon: 'lucide:camera',
    primary: false,
    order: 9,
    patch: {
      container: 'jpg',
      mapMode: 'video',
      videoCodec: 'default',
      qualityMode: 'default',
      audioCodec: 'none',
      start: '00:00:05',
      frameCount: '1'
    }
  },
  {
    id: 'to-gif',
    icon: 'lucide:film',
    primary: true,
    order: 7,
    patch: {
      container: 'gif',
      mapMode: 'video',
      videoCodec: 'default',
      qualityMode: 'default',
      audioCodec: 'none',
      scaleMode: 'width',
      width: '480',
      fps: '15',
      gifPalette: true
    }
  },
  {
    id: 'compress',
    icon: 'lucide:minimize',
    primary: true,
    order: 2,
    patch: {
      container: 'mp4',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '28',
      encoderPreset: 'slow',
      audioCodec: 'aac',
      audioBitrate: '128k'
    }
  },
  {
    id: 'trim',
    icon: 'lucide:scissors',
    primary: true,
    order: 5,
    patch: {
      container: 'mp4',
      start: '',
      duration: '00:00:30',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      audioCodec: 'aac'
    }
  },
  {
    id: 'resize',
    icon: 'lucide:maximize',
    primary: true,
    order: 6,
    patch: {
      container: 'mp4',
      scaleMode: 'width',
      width: '1280',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23'
    }
  },
  {
    id: 'crop',
    icon: 'lucide:crop',
    primary: false,
    order: 10,
    patch: {
      container: 'mp4',
      scaleMode: 'crop',
      width: '1080',
      height: '1920',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23'
    }
  },
  {
    id: 'watermark',
    icon: 'lucide:stamp',
    primary: false,
    order: 11,
    patch: {
      container: 'mp4',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      watermark: 'image',
      secondInput: 'logo.png',
      watermarkPosition: 'bottom-right'
    }
  },
  {
    id: 'subtitle',
    icon: 'lucide:captions',
    primary: false,
    order: 12,
    patch: {
      container: 'mp4',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      subtitle: 'subtitles.srt'
    }
  },
  {
    id: 'concat',
    icon: 'lucide:combine',
    primary: false,
    order: 13,
    patch: {
      container: 'mp4',
      input: 'list.txt',
      inputFormat: 'concat',
      inputOptions: '-safe 0',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      shortest: true
    }
  },
  {
    id: 'image-sequence',
    icon: 'lucide:images',
    primary: false,
    order: 14,
    patch: {
      container: 'mp4',
      input: '%04d.png',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '20',
      fps: '25',
      audioCodec: 'none'
    }
  },
  {
    id: 'speed',
    icon: 'lucide:gauge',
    primary: false,
    order: 15,
    patch: {
      container: 'mp4',
      speed: '2',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      audioCodec: 'aac'
    }
  },
  {
    id: 'screen-record',
    icon: 'lucide:monitor',
    primary: true,
    order: 8,
    patch: {
      container: 'mp4',
      videoCodec: 'libx264',
      qualityMode: 'crf',
      crf: '23',
      fps: '30',
      audioCodec: 'aac'
    }
  }
]

export function applyPreset(plan: FfmpegPlan, presetId: FfmpegPresetId): FfmpegPlan {
  const preset = ffmpegPresets.find((entry) => entry.id === presetId)
  if (!preset) return plan
  return { ...plan, preset: presetId, ...preset.patch }
}

/** Recording reads a capture device rather than a file, which the plan cannot express as a path. */
export function isScreenRecording(plan: FfmpegPlan) {
  return plan.preset === 'screen-record'
}

/** An image sequence is read by the image2 demuxer at the output frame rate. */
export function usesImageSequence(plan: FfmpegPlan) {
  return plan.preset === 'image-sequence'
}

// ------------------------------------------------------------------ primitives

const trimmed = (value: string) => value.trim()

function positiveNumber(value: string): number | null {
  const raw = trimmed(value)
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** CRF 0 is lossless, so unlike a width it is allowed to be zero. */
function nonNegativeNumber(value: string): number | null {
  const raw = trimmed(value)
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * atempo only stretches audio between 0.5x and 2x, so anything outside that is
 * split into a chain of legal steps. `-af atempo=2,atempo=2` really does run 4x.
 */
export function atempoFactors(factor: number): number[] {
  if (!Number.isFinite(factor) || factor <= 0) return []
  const factors: number[] = []
  let remaining = factor
  while (remaining > 2) {
    factors.push(2)
    remaining /= 2
  }
  while (remaining < 0.5) {
    factors.push(0.5)
    remaining /= 0.5
  }
  factors.push(Number(remaining.toFixed(6)))
  return factors
}

/** Percentages such as 1/3 would otherwise print as 0.3333333333333333. */
/** `12`, `1:30` and `01:02:03.5` all have to read as one number of seconds. */
export function timeInSeconds(value: string): number | null {
  const raw = trimmed(value)
  if (!raw) return null
  const parts = raw.split(':')
  if (parts.length > 3) return null
  let total = 0
  for (const part of parts) {
    if (part === '' || !Number.isFinite(Number(part))) return null
    total = total * 60 + Number(part)
  }
  return total
}

function tidyNumber(value: number): string {
  return String(Number(value.toFixed(6)))
}

// ---------------------------------------------------------------- quality dial

/**
 * CRF is a knob almost nobody can predict. These three answers are the ones a
 * person actually has, so they are named after the trade-off rather than after
 * the number, and the number is filled in behind them.
 */
export type QualityDialId = 'high' | 'balanced' | 'small'

export const qualityDial: { id: QualityDialId; crf: string }[] = [
  { id: 'high', crf: '18' },
  { id: 'balanced', crf: '23' },
  { id: 'small', crf: '28' }
]

/** Which of the three named answers the current CRF matches, or null for a custom one. */
export function currentQualityDial(plan: FfmpegPlan): QualityDialId | null {
  const crf = trimmed(plan.crf)
  return qualityDial.find((entry) => entry.crf === crf)?.id ?? null
}

export function escapeFilterText(text: string): string {
  // drawtext expands %{...} and its argument syntax eats : \ and quotes.
  return text.replace(/[\\':%{}]/g, (character) => `\\${character}`)
}

export function escapeFilterPath(path: string): string {
  // Filter arguments split on : and \ , and a Windows drive letter has both.
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/**
 * Splits a raw option string the way a POSIX shell would, so `-vf "scale=1280:-1"`
 * typed into a text box still arrives as the two arguments ffmpeg expects.
 */
export function tokenizeOptions(value: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '\\' && quote !== "'" && index + 1 < value.length) {
      current += value[index + 1]
      started = true
      index += 1
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (/\s/.test(character)) {
      if (started) tokens.push(current)
      current = ''
      started = false
      continue
    }
    current += character
    started = true
  }
  if (started) tokens.push(current)
  return tokens
}

/** The one shell-quoting rule that matters: only a plainly safe word goes bare. */
export function quoteArgument(value: string): string {
  if (value === '') return "''"
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildFfmpegCommand(plan: FfmpegPlan): string {
  return ['ffmpeg', ...buildFfmpegArgs(plan)].map(quoteArgument).join(' ')
}

// ----------------------------------------------------------------------- stages

/**
 * ffmpeg's own documentation splits its options into the groups its argument
 * order follows, and a command is read the same way: global switches, then the
 * options that belong in front of each `-i`, then what to do with the streams,
 * then the filtergraph, then the options that describe the output file. The form
 * is built out of these groups, so reading the form is reading the command.
 */
export type FfmpegStageId = 'global' | 'input' | 'streams' | 'filters' | 'output'

export const ffmpegStages: { id: FfmpegStageId; flags: string[] }[] = [
  { id: 'global', flags: ['-hide_banner', '-y'] },
  { id: 'input', flags: ['-ss', '-t', '-framerate', '-f', '-i'] },
  { id: 'streams', flags: ['-map', '-an'] },
  { id: 'filters', flags: ['-filter_complex', '-vf', '-af'] },
  {
    id: 'output',
    flags: [
      '-c:v',
      '-c:a',
      '-crf',
      '-cq',
      '-global_quality',
      '-q:v',
      '-b:v',
      '-b:a',
      '-preset',
      '-cpu-used',
      '-pix_fmt',
      '-ac',
      '-frames:v',
      '-movflags',
      '-shortest'
    ]
  }
]

/** Which group a flag belongs to, so a form section can name the flags it owns. */
export function stageOfFlag(flag: string): FfmpegStageId | null {
  return ffmpegStages.find((stage) => stage.flags.includes(flag))?.id ?? null
}

// ----------------------------------------------------------------------- input

/**
 * A capture device is opened with its own demuxer and its own geometry, so it
 * cannot be expressed as an `-i <path>` pair and gets its own branch.
 */
export function screenInputArgs(plan: FfmpegPlan): string[] {
  const fps = positiveNumber(plan.fps) ? trimmed(plan.fps) : '30'
  const width = positiveNumber(plan.width)
  const height = positiveNumber(plan.height)
  const size = width && height ? `${width}x${height}` : '1920x1080'

  if (plan.screenSource === 'linux') return ['-f', 'x11grab', '-framerate', fps, '-video_size', size, '-i', ':0.0']
  if (plan.screenSource === 'windows') return ['-f', 'gdigrab', '-framerate', fps, '-i', 'desktop']
  return ['-f', 'avfoundation', '-capture_cursor', '1', '-i', '1:none']
}

// ----------------------------------------------------------------------- video

function scaleOps(plan: FfmpegPlan): string[] {
  const width = positiveNumber(plan.width)
  const height = positiveNumber(plan.height)
  if (plan.scaleMode === 'keep') return []
  if (plan.scaleMode === 'width' && width) return [`scale=${width}:-1:flags=lanczos`]
  if (plan.scaleMode === 'height' && height) return [`scale=-1:${height}:flags=lanczos`]
  if (plan.scaleMode === 'exact' && width && height) return [`scale=${width}:${height}:flags=lanczos`]
  if (plan.scaleMode === 'pad' && width && height) {
    // Shrink to fit inside the box, then pad the remainder rather than stretch.
    return [`scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`]
  }
  if (plan.scaleMode === 'crop' && width && height) return [`crop=${width}:${height}:(iw-ow)/2:(ih-oh)/2`]
  return []
}

/** Text watermark size follows the frame so it does not vanish on a 4K render. */
function watermarkFontSize(plan: FfmpegPlan): number {
  const width = positiveNumber(plan.width)
  if (!width) return 24
  return Math.min(96, Math.max(12, Math.round(width / 40)))
}

function drawtextOp(plan: FfmpegPlan): string | null {
  const text = trimmed(plan.watermarkText)
  if (!text) return null
  const position = overlayCoordinates[plan.watermarkPosition] ?? overlayCoordinates['bottom-right']
  return `drawtext=text='${escapeFilterText(text)}':fontcolor=white:fontsize=${watermarkFontSize(plan)}:x=${position}:box=1:boxcolor=black@0.45:boxborderw=12`
}

function videoFilterOps(plan: FfmpegPlan): string[] {
  const ops = scaleOps(plan)
  const fps = positiveNumber(plan.fps)
  // A sequence is already read at the requested rate by the input flag, so the
  // filter would only say the same thing a second time.
  if (fps && !usesImageSequence(plan)) ops.push(`fps=${tidyNumber(fps)}`)
  const speed = Number(trimmed(plan.speed))
  if (trimmed(plan.speed) && Number.isFinite(speed) && speed > 0) ops.push(`setpts=${tidyNumber(1 / speed)}*PTS`)
  const drawtext = drawtextOp(plan)
  if (drawtext) ops.push(drawtext)
  const subtitle = trimmed(plan.subtitle)
  if (subtitle) ops.push(`subtitles='${escapeFilterPath(subtitle)}'`)
  return ops
}

function audioFilterOps(plan: FfmpegPlan): string[] {
  const ops: string[] = []
  const speed = Number(trimmed(plan.speed))
  if (trimmed(plan.speed) && Number.isFinite(speed) && speed > 0) {
    for (const factor of atempoFactors(speed)) ops.push(`atempo=${tidyNumber(factor)}`)
  }
  const volume = Number(trimmed(plan.volume))
  if (trimmed(plan.volume) && Number.isFinite(volume)) ops.push(`volume=${tidyNumber(volume)}`)
  return ops
}

/**
 * The filtergraph as ffmpeg will receive it, so the filter stage can show the
 * chain it is building rather than only the controls that shape it.
 */
export function filterPreview(plan: FfmpegPlan): { video: string; audio: string; complex: string } {
  const videoEnabled = plan.videoCodec !== 'none' && plan.mapMode !== 'audio'
  const audioEnabled = plan.audioCodec !== 'none' && plan.mapMode !== 'mute'
  const graph = buildFilterGraph(plan, videoEnabled, audioEnabled)
  return { video: graph.videoFilter, audio: graph.audioFilter, complex: graph.complex.join(';') }
}

// --------------------------------------------------------------------- codecs

/** Codecs that re-encode nothing have no quality knob to turn. */
const softwareCrfCodecs: VideoCodecId[] = ['libx264', 'libx265', 'libvpx-vp9', 'libaom-av1', 'mpeg4']

/** 4:2:0 is what every browser and phone player will actually decode. */
const pixFmtCodecs: VideoCodecId[] = ['libx264', 'libx265', 'libvpx-vp9', 'libaom-av1', 'mpeg4', 'h264_nvenc', 'hevc_nvenc', 'h264_qsv']

function qualityArgs(plan: FfmpegPlan): string[] {
  if (plan.videoCodec === 'default' || plan.videoCodec === 'copy' || plan.videoCodec === 'none') return []

  if (plan.qualityMode === 'bitrate') {
    const bitrate = trimmed(plan.videoBitrate)
    return bitrate ? ['-b:v', bitrate] : []
  }
  if (plan.qualityMode !== 'crf') return []

  const crf = nonNegativeNumber(plan.crf)
  if (crf === null) return []
  const level = Math.round(crf)

  // Hardware encoders spell constant quality differently, and VideoToolbox
  // inverts the scale: its -q:v counts up to better, not down.
  if (plan.videoCodec === 'h264_nvenc' || plan.videoCodec === 'hevc_nvenc') return ['-cq', String(level)]
  if (plan.videoCodec === 'h264_qsv') return ['-global_quality', String(level)]
  if (plan.videoCodec === 'h264_videotoolbox') return ['-q:v', String(Math.min(100, Math.max(1, Math.round(100 - level * 2))))]
  if (softwareCrfCodecs.includes(plan.videoCodec)) return ['-crf', String(level)]
  return []
}

function encoderPresetArgs(plan: FfmpegPlan): string[] {
  const preset = plan.encoderPreset
  if (plan.videoCodec === 'libx264' || plan.videoCodec === 'libx265' || plan.videoCodec === 'libvpx-vp9') return ['-preset', preset]
  if (plan.videoCodec === 'libaom-av1') return ['-cpu-used', aomCpuUsed[preset]]
  if (plan.videoCodec === 'h264_nvenc' || plan.videoCodec === 'hevc_nvenc') return ['-preset', nvencPresetLevels[preset]]
  if (plan.videoCodec === 'h264_qsv') return ['-preset', preset]
  return []
}

// ---------------------------------------------------------------------- filters

type FilterGraph = {
  complex: string[]
  videoFilter: string
  audioFilter: string
  videoLabel: string
  audioLabel: string
}

/**
 * Filters live on one chain per stream unless they have to branch. A palette
 * pass and an overlay both need two inputs flowing at once, which is exactly
 * what `-filter_complex` is for; everything else stays on the simpler `-vf`/`-af`
 * so the emitted command remains readable.
 */
function buildFilterGraph(plan: FfmpegPlan, videoEnabled: boolean, audioEnabled: boolean): FilterGraph {
  const videoOps = videoEnabled ? videoFilterOps(plan) : []
  const audioOps = audioEnabled ? audioFilterOps(plan) : []
  const overlayInput = plan.watermark === 'image' ? trimmed(plan.secondInput) : ''
  const needsComplex = (plan.gifPalette && videoEnabled) || (overlayInput !== '' && videoEnabled)

  if (!needsComplex) {
    return { complex: [], videoFilter: videoOps.join(','), audioFilter: audioOps.join(','), videoLabel: '', audioLabel: '' }
  }

  const complex: string[] = []
  let videoSource = '0:v'
  if (videoOps.length > 0) {
    complex.push(`[0:v]${videoOps.join(',')}[vbase]`)
    videoSource = 'vbase'
  }
  if (plan.gifPalette && videoEnabled) {
    // Split the frame, build one optimal palette from it, then re-apply it to
    // every frame. Without this a GIF dithers 256 colours chosen at random.
    complex.push(`[${videoSource}]split[g0][g1]`)
    complex.push('[g0]palettegen=stats_mode=diff[pal]')
    complex.push('[g1][pal]paletteuse=dither=bayer:bayer_scale=3[vpal]')
    videoSource = 'vpal'
  }
  if (overlayInput !== '' && videoEnabled) {
    complex.push('[1:v]scale=iw*0.2:-1:flags=lanczos[wm]')
    complex.push(`[${videoSource}][wm]overlay=${overlayCoordinates[plan.watermarkPosition] ?? overlayCoordinates['bottom-right']}[vout]`)
    videoSource = 'vout'
  }

  let audioLabel = ''
  if (audioOps.length > 0) {
    complex.push(`[0:a]${audioOps.join(',')}[aout]`)
    audioLabel = '[aout]'
  }

  return { complex, videoFilter: '', audioFilter: '', videoLabel: videoSource === '0:v' ? '' : `[${videoSource}]`, audioLabel }
}

// ---------------------------------------------------------------------- builder

export function buildFfmpegArgs(plan: FfmpegPlan): string[] {
  const args: string[] = []
  const recording = isScreenRecording(plan)

  if (plan.hideBanner) args.push('-hide_banner')
  if (plan.overwrite) args.push('-y')

  // ---- inputs.
  // Input options go before the `-i` they describe: `-ss` there is a demuxer
  // seek that lands in a keyframe, rather than decoding and discarding the head
  // of the file, which is the difference between instant and slow on a long clip.
  // Seeking to zero is what ffmpeg does regardless, so the flag is left out
  // rather than shown as a setting that does nothing. A negative start is a real
  // instruction (count back from the end) and stays. An unreadable time is passed
  // through as typed, because dropping it would quietly start from the beginning
  // instead of telling the reader their time was not understood.
  const start = timeInSeconds(plan.start)
  if (trimmed(plan.start) !== '' && start !== 0) args.push('-ss', trimmed(plan.start))
  if (trimmed(plan.duration)) args.push('-t', trimmed(plan.duration))
  if (usesImageSequence(plan)) {
    const fps = positiveNumber(plan.fps)
    if (fps) args.push('-framerate', tidyNumber(fps))
  }
  if (trimmed(plan.inputFormat)) args.push('-f', trimmed(plan.inputFormat))
  args.push(...tokenizeOptions(plan.inputOptions))
  if (recording) args.push(...screenInputArgs(plan))
  else args.push('-i', trimmed(plan.input))

  const overlayInput = plan.watermark === 'image' ? trimmed(plan.secondInput) : ''
  if (overlayInput !== '') args.push('-i', overlayInput)

  const videoEnabled = plan.videoCodec !== 'none' && plan.mapMode !== 'audio'
  const audioEnabled = plan.audioCodec !== 'none' && plan.mapMode !== 'mute'

  // ---- stream mapping, then filters.
  // A filtered stream needs `-map [label]` instead of `-map 0:v`, and mapping the
  // same input twice would duplicate the track rather than relabel it.
  const filters = buildFilterGraph(plan, videoEnabled, audioEnabled)
  if (filters.complex.length > 0) {
    if (filters.videoLabel) args.push('-map', filters.videoLabel)
    else if (plan.mapMode === 'video' || plan.mapMode === 'mute') args.push('-map', '0:v:0')
    if (filters.audioLabel) args.push('-map', filters.audioLabel)
    else if (plan.mapMode === 'audio') args.push('-map', '0:a:0')
    args.push('-filter_complex', filters.complex.join(';'))
  } else {
    if (plan.mapMode === 'video' || plan.mapMode === 'mute') args.push('-map', '0:v:0')
    if (plan.mapMode === 'audio') args.push('-map', '0:a:0')
    if (filters.videoFilter) args.push('-vf', filters.videoFilter)
    if (filters.audioFilter) args.push('-af', filters.audioFilter)
  }

  // ---- codecs.
  if (plan.mapMode === 'mute') args.push('-an')
  if (videoEnabled && plan.videoCodec !== 'default') args.push('-c:v', plan.videoCodec)
  if (audioEnabled && plan.audioCodec !== 'default') args.push('-c:a', plan.audioCodec)

  if (videoEnabled) args.push(...qualityArgs(plan))
  if (videoEnabled) args.push(...encoderPresetArgs(plan))
  if (videoEnabled && pixFmtCodecs.includes(plan.videoCodec)) args.push('-pix_fmt', 'yuv420p')
  if (audioEnabled && trimmed(plan.audioBitrate)) args.push('-b:a', trimmed(plan.audioBitrate))
  if (audioEnabled && plan.channels === 'mono') args.push('-ac', '1')
  if (audioEnabled && plan.channels === 'stereo') args.push('-ac', '2')

  // ---- output framing.
  if (trimmed(plan.frameCount)) args.push('-frames:v', trimmed(plan.frameCount))
  if (fastStartContainers.includes(plan.container)) args.push('-movflags', '+faststart')
  if (plan.shortest) args.push('-shortest')
  args.push(...tokenizeOptions(plan.extra))

  args.push(trimmed(plan.output))
  return args
}

// ------------------------------------------------------------------ suggestions

/**
 * A container change usually invalidates the filename, so the output is renamed
 * after the input. Two cases need care: an image sequence pattern such as
 * `%04d.png` is a pattern rather than a filename, and re-suggesting the file
 * that is already being read would hand ffmpeg a command that destroys it.
 */
export function suggestOutputName(input: string, container: ContainerId): string {
  const source = trimmed(input)
  const extension = containerInfo(container).extension
  if (!source) return ''
  if (source.includes('%')) return `out.${extension}`

  const separator = Math.max(source.lastIndexOf('/'), source.lastIndexOf('\\'))
  const directory = source.slice(0, separator + 1)
  const stem = source.slice(separator + 1).replace(/\.[^.]+$/, '')
  if (!stem) return `out.${extension}`

  const candidate = `${directory}${stem}.${extension}`
  return candidate === source ? `${directory}${stem}-out.${extension}` : candidate
}

/**
 * Keeps the name the reader typed but moves it onto the extension the container
 * actually needs. Switching to a preset is a change of intent, so a leftover
 * `clip.mp4` after choosing "extract audio" would be a file ffmpeg refuses to
 * open. A name with no recognisable extension is left alone rather than guessed
 * at, and the input is never re-touched.
 */
export function retargetOutputName(name: string, container: ContainerId): string {
  const source = trimmed(name)
  if (!source) return ''
  const extension = containerInfo(container).extension
  if (!knownOutputExtensions.has(extension)) return source

  const separator = Math.max(source.lastIndexOf('/'), source.lastIndexOf('\\'))
  const stem = source.slice(separator + 1)
  const dot = stem.lastIndexOf('.')
  if (dot <= 0) return `${source}.${extension}`

  const current = stem.slice(dot + 1).toLowerCase()
  if (!knownOutputExtensions.has(current)) return source
  return `${source.slice(0, source.length - current.length)}${extension}`
}

// ------------------------------------------------------------------ validation

export type FfmpegIssue = {
  level: 'error' | 'warning'
  /** A `toolUi.ffmpeg-builder.*` key, resolved by the caller. */
  key: string
}

/**
 * The failures worth warning about are the ones ffmpeg only complains about
 * halfway through a long render, or complains about not at all and produces a
 * file the player will not open.
 */
export function validateFfmpegPlan(plan: FfmpegPlan): FfmpegIssue[] {
  const issues: FfmpegIssue[] = []
  const add = (level: FfmpegIssue['level'], key: string) => issues.push({ level, key })
  const container = containerInfo(plan.container)
  const recording = isScreenRecording(plan)
  const input = trimmed(plan.input)
  const output = trimmed(plan.output)

  if (!recording && input === '') add('error', 'noInput')
  if (output === '') add('error', 'noOutput')
  if (input !== '' && output !== '' && input === output) add('error', 'sameFile')

  const width = positiveNumber(plan.width)
  const height = positiveNumber(plan.height)
  if (plan.scaleMode !== 'keep' && plan.scaleMode !== 'width' && plan.scaleMode !== 'height') {
    if (!width) add('error', 'needWidth')
    if (!height) add('error', 'needHeight')
  }
  if (plan.scaleMode === 'width' && !width) add('error', 'needWidth')
  if (plan.scaleMode === 'height' && !height) add('error', 'needHeight')

  const crf = nonNegativeNumber(plan.crf)
  if (plan.qualityMode === 'crf') {
    if (crf === null) add('error', 'invalidCrf')
    else if (crf > 51) add('warning', 'crfRange')
    if (plan.videoCodec === 'copy' || plan.videoCodec === 'default' || plan.videoCodec === 'none') add('warning', 'crfIgnored')
  }
  if (plan.qualityMode === 'bitrate' && trimmed(plan.videoBitrate) === '') add('warning', 'bitrateMissing')

  const speed = Number(trimmed(plan.speed))
  if (trimmed(plan.speed) !== '' && (!Number.isFinite(speed) || speed <= 0)) add('warning', 'speedInvalid')
  const volume = Number(trimmed(plan.volume))
  if (trimmed(plan.volume) !== '' && !Number.isFinite(volume)) add('warning', 'volumeInvalid')
  if (trimmed(plan.start) !== '' && timeInSeconds(plan.start) === null) add('warning', 'startInvalid')
  if (trimmed(plan.duration) !== '' && timeInSeconds(plan.duration) === null) add('warning', 'durationInvalid')

  if (plan.watermark === 'image' && trimmed(plan.secondInput) === '') add('warning', 'needWatermarkImage')
  if (plan.watermark === 'text' && trimmed(plan.watermarkText) === '') add('warning', 'needWatermarkText')
  if (plan.mapMode === 'audio' && plan.videoCodec !== 'none' && plan.videoCodec !== 'default') add('warning', 'videoCodecIgnored')
  if (container.kind === 'audio' && plan.mapMode !== 'audio') add('warning', 'audioContainerNeedsAudioMap')
  const mapsVideo = plan.mapMode !== 'audio' && plan.videoCodec !== 'none'
  if (container.kind === 'audio' && mapsVideo) add('warning', 'videoInAudioContainer')
  if (container.kind === 'image' && trimmed(plan.frameCount) === '') add('warning', 'needFrameCount')
  if (container.id === 'gif' && plan.audioCodec !== 'none') add('warning', 'audioInGif')
  if (plan.gifPalette && container.id !== 'gif') add('warning', 'paletteNeedsGif')
  if (container.id === 'webm' && plan.videoCodec === 'libx264') add('warning', 'h264InWebm')
  if ((container.id === 'mp4' || container.id === 'mov') && (plan.videoCodec === 'libvpx-vp9' || plan.videoCodec === 'libaom-av1')) {
    add('warning', 'modernCodecInMp4')
  }

  return issues
}

// -------------------------------------------------------------------- reporting

export type CommandSummary = {
  arguments: number
  length: number
  inputs: number
  filterComplex: boolean
}

export function summarizeCommand(command: string, args: readonly string[]): CommandSummary {
  return {
    arguments: args.length,
    length: command.length,
    inputs: args.filter((argument) => argument === '-i').length,
    filterComplex: args.includes('-filter_complex')
  }
}

/**
 * One line of plain reasoning per emitted flag. A generated command is only
 * useful if the reader can tell what each flag is doing to their file.
 */
export type FlagDescription = { flag: string; value: string; key: string; stage: FfmpegStageId }

/** Every flag the builder can emit, taken from the stages rather than restated. */
export const allFlags = ffmpegStages.flatMap((stage) => stage.flags)

export function describeFlags(args: readonly string[]): FlagDescription[] {
  const known = new Set(allFlags)

  const rows: FlagDescription[] = []
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (!known.has(flag)) continue
    // A filter argument can itself start with `-`; only a token that is not one
    // of the flags is treated as this flag's value.
    const next = args[index + 1]
    const value = next !== undefined && !next.startsWith('-') ? next : ''
    if (value) index += 1
    const key = `toolUi.ffmpeg-builder.flags.${flag.replace(/^-/, '').replace(/[:.]/g, '-')}`
    rows.push({ flag, value, key, stage: stageOfFlag(flag) ?? 'output' })
  }
  return rows
}