import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { advancePreviewClicks, previewClicks, takePreviewRun } from '../src/lib/planned-preview.ts'
import { allTools, plannedTools, tools } from '../src/data/tools.ts'
import {
  applyPreset,
  atempoFactors,
  buildFfmpegArgs,
  buildFfmpegCommand,
  containerInfo,
  allFlags,
  currentQualityDial,
  describeFlags,
  filterPreview,
  escapeFilterPath,
  escapeFilterText,
  ffmpegPresets,
  ffmpegStages,
  qualityDial,
  quoteArgument,
  retargetOutputName,
  screenInputArgs,
  stageOfFlag,
  suggestOutputName,
  summarizeCommand,
  timeInSeconds,
  tokenizeOptions,
  validateFfmpegPlan
} from '../src/lib/ffmpeg.ts'

/** The starting point every case below patches, so a test only states what it cares about. */
function plan(overrides = {}) {
  return {
    preset: 'custom',
    input: 'input.mp4',
    inputFormat: '',
    inputOptions: '',
    secondInput: '',
    screenSource: 'macos',
    output: 'output.mp4',
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
    videoCodec: 'copy',
    qualityMode: 'default',
    crf: '23',
    videoBitrate: '',
    encoderPreset: 'medium',
    audioCodec: 'copy',
    audioBitrate: '',
    channels: 'default',
    volume: '',
    watermark: 'none',
    watermarkText: '',
    watermarkPosition: 'bottom-right',
    subtitle: '',
    gifPalette: false,
    shortest: false,
    overwrite: false,
    hideBanner: false,
    extra: '',
    ...overrides
  }
}

/** The flag/value pairs of an argument list, so a test can read as a command. */
function pairs(args) {
  const out = []
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('-')) continue
    out.push(args.slice(index, args[index + 1] && !args[index + 1].startsWith('-') ? index + 2 : index + 1).join(' '))
  }
  return out
}

function flagsOf(args) {
  return args.filter((argument) => argument.startsWith('-'))
}

// ------------------------------------------------------------------- vocabulary

test('every container reports an extension and what it can carry', () => {
  assert.equal(containerInfo('mp4').extension, 'mp4')
  assert.equal(containerInfo('mp4').kind, 'both')
  assert.equal(containerInfo('gif').kind, 'video')
  assert.equal(containerInfo('mp3').kind, 'audio')
  assert.equal(containerInfo('png').kind, 'image')
  // An unknown id must not take the whole form down.
  assert.equal(containerInfo('nope').id, 'mp4')
})

test('the goal list is presentable: unique icons, a fixed primary set', () => {
  // A goal is how the reader arrives, so two goals sharing a picture would make
  // the first screen look like a smaller list than it is.
  const ids = ffmpegPresets.map((preset) => preset.id)
  const icons = ffmpegPresets.map((preset) => preset.icon)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(icons).size, icons.length)
  for (const preset of ffmpegPresets) assert.match(preset.icon, /^lucide:[a-z0-9-]+$/)

  // `custom` is the blank starting point rather than a job, so it is never offered
  // as one.
  const primary = ffmpegPresets.filter((preset) => preset.primary)
  assert.equal(primary.some((preset) => preset.id === 'custom'), false)
  assert.equal(primary.length, 8)
  assert.equal(ffmpegPresets.filter((preset) => !preset.primary && preset.id !== 'custom').length, 7)
  // The first screen has to hold the jobs an ordinary ask arrives through, and in
  // the order someone would reach for them.
  const ordered = ffmpegPresets.filter((preset) => preset.id !== 'custom').sort((left, right) => left.order - right.order)
  assert.deepEqual(
    ordered.filter((preset) => preset.primary).map((preset) => preset.id),
    ['transcode', 'compress', 'extract-audio', 'extract-video', 'trim', 'resize', 'to-gif', 'screen-record']
  )
  // The rest follow in their own order, and `custom` is not one of them.
  assert.deepEqual(ordered.filter((preset) => !preset.primary).map((preset) => preset.id), [
    'extract-frame',
    'crop',
    'watermark',
    'subtitle',
    'concat',
    'image-sequence',
    'speed'
  ])
  assert.equal(new Set(ffmpegPresets.map((preset) => preset.order)).size, ffmpegPresets.length)
})

test('the quality dial offers three answers, smallest file last', () => {
  assert.deepEqual(
    qualityDial.map((entry) => entry.id),
    ['high', 'balanced', 'small']
  )
  // CRF counts backwards from worse to better, so a rising CRF is a falling file.
  const numbers = qualityDial.map((entry) => Number(entry.crf))
  assert.deepEqual(numbers, [...numbers].sort((left, right) => left - right))
  assert.equal(new Set(numbers).size, numbers.length)
})

test('the dial recognises its own numbers and nothing else', () => {
  for (const entry of qualityDial) {
    assert.equal(currentQualityDial(plan({ crf: entry.crf })), entry.id)
  }
  // A CRF typed by hand is not one of the three answers, so none is highlighted.
  assert.equal(currentQualityDial(plan({ crf: '31' })), null)
  assert.equal(currentQualityDial(plan({ crf: '' })), null)
})

test('a dial answer reaches the command', () => {
  for (const entry of qualityDial) {
    const args = buildFfmpegArgs(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: entry.crf }))
    assert.equal(args[args.indexOf('-crf') + 1], entry.crf, entry.id)
  }
})

test('preset ids are unique and all patch a plan', () => {
  const ids = ffmpegPresets.map((preset) => preset.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const preset of ffmpegPresets) {
    const next = applyPreset(plan(), preset.id)
    assert.equal(next.preset, preset.id)
    assert.equal(typeof next.input, 'string')
  }
})

// -------------------------------------------------------------------- arguments

test('puts the input first and the output last with nothing in front of it', () => {
  const args = buildFfmpegArgs(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: '23' }))
  assert.equal(args[0], '-i')
  assert.equal(args[1], 'input.mp4')
  assert.equal(args[args.length - 1], 'output.mp4')
})

test('seeks before the input so the seek happens in the demuxer', () => {
  const args = buildFfmpegArgs(plan({ start: '00:00:10', duration: '00:00:30' }))
  assert.deepEqual(args.slice(0, 5), ['-ss', '00:00:10', '-t', '00:00:30', '-i'])
})

test('omits seek flags that were left blank', () => {
  const flags = flagsOf(buildFfmpegArgs(plan({ container: 'mkv' })))
  assert.equal(flags.includes('-ss'), false)
  assert.equal(flags.includes('-t'), false)
  assert.equal(flags.includes('-frames:v'), false)
})

test('lets ffmpeg pick the encoders when they are left at the container default', () => {
  const args = buildFfmpegArgs(plan({ videoCodec: 'default', audioCodec: 'default' }))
  assert.equal(args.includes('-c:v'), false)
  assert.equal(args.includes('-c:a'), false)
})

test('writes a video filter chain for scale, frame rate and speed', () => {
  const args = buildFfmpegArgs(plan({ scaleMode: 'width', width: '1280', fps: '25', speed: '2' }))
  assert.equal(args[args.indexOf('-vf') + 1], 'scale=1280:-1:flags=lanczos,fps=25,setpts=0.5*PTS')
})

test('pads rather than stretches when asked to keep the aspect ratio', () => {
  const args = buildFfmpegArgs(plan({ scaleMode: 'pad', width: '1080', height: '1920' }))
  assert.equal(
    args[args.indexOf('-vf') + 1],
    'scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2'
  )
})

test('crops from the centre of the frame', () => {
  const args = buildFfmpegArgs(plan({ scaleMode: 'crop', width: '1080', height: '1080' }))
  assert.equal(args[args.indexOf('-vf') + 1], 'crop=1080:1080:(iw-ow)/2:(ih-oh)/2')
})

test('ignores a scale mode whose dimensions are missing', () => {
  const args = buildFfmpegArgs(plan({ scaleMode: 'exact', width: '', height: '' }))
  assert.equal(args.includes('-vf'), false)
})

test('moves the moov atom to the front only for the mp4 family', () => {
  assert.equal(buildFfmpegArgs(plan({ container: 'mp4' })).includes('-movflags'), true)
  assert.equal(buildFfmpegArgs(plan({ container: 'm4a' })).includes('-movflags'), true)
  assert.equal(buildFfmpegArgs(plan({ container: 'mkv' })).includes('-movflags'), false)
})

// --------------------------------------------------------------------- codecs

test('spells constant quality the way each encoder expects', () => {
  const crf = (videoCodec) => {
    const args = buildFfmpegArgs(plan({ videoCodec, qualityMode: 'crf', crf: '23' }))
    const flag = args.find((argument) => ['-crf', '-cq', '-global_quality', '-q:v'].includes(argument))
    return args[args.indexOf(flag) + 1]
  }
  assert.equal(crf('libx264'), '23')
  assert.equal(crf('libx265'), '23')
  assert.equal(crf('h264_nvenc'), '23')
  assert.equal(crf('h264_qsv'), '23')
  // VideoToolbox counts up to better, so the same intent is a different number.
  assert.equal(crf('h264_videotoolbox'), '54')
})

test('offers no quality flag to an encoder that re-encodes nothing', () => {
  for (const videoCodec of ['copy', 'none', 'default']) {
    const args = buildFfmpegArgs(plan({ videoCodec, qualityMode: 'crf', crf: '23' }))
    assert.equal(args.includes('-crf'), false, videoCodec)
  }
})

test('accepts CRF 0 because lossless is a real setting', () => {
  const args = buildFfmpegArgs(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: '0' }))
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-crf')), ['-crf 0'])
})

test('translates the encoder speed dial into each encoder own vocabulary', () => {
  const presetArg = (videoCodec, encoderPreset) => {
    const args = buildFfmpegArgs(plan({ videoCodec, encoderPreset }))
    for (const flag of ['-preset', '-cpu-used']) {
      if (args.includes(flag)) return `${flag} ${args[args.indexOf(flag) + 1]}`
    }
    return ''
  }
  assert.equal(presetArg('libx264', 'slow'), '-preset slow')
  assert.equal(presetArg('h264_nvenc', 'slow'), '-preset p5')
  assert.equal(presetArg('libaom-av1', 'ultrafast'), '-cpu-used 8')
  // VideoToolbox has no speed dial at all.
  assert.equal(presetArg('h264_videotoolbox', 'slow'), '')
})

test('forces 4:2:0 for the encoders a browser will actually decode', () => {
  const args = buildFfmpegArgs(plan({ videoCodec: 'libx265', qualityMode: 'crf', crf: '23' }))
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p')
})

test('uses the target bitrate only in bitrate mode', () => {
  const args = buildFfmpegArgs(plan({ videoCodec: 'libx264', qualityMode: 'bitrate', videoBitrate: '2M' }))
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-b')), ['-b:v 2M'])
  const none = buildFfmpegArgs(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: '23', videoBitrate: '2M' }))
  assert.equal(none.includes('-b:v'), false)
})

test('maps the channel count onto a flag rather than a bitrate', () => {
  assert.equal(buildFfmpegArgs(plan({ channels: 'mono' }))[buildFfmpegArgs(plan({ channels: 'mono' })).indexOf('-ac') + 1], '1')
  assert.equal(buildFfmpegArgs(plan({ channels: 'stereo' })).includes('-ac'), true)
  assert.equal(buildFfmpegArgs(plan({ channels: 'default' })).includes('-ac'), false)
})

// --------------------------------------------------------------------- streams

test('maps a single stream and drops the video encoder with it', () => {
  const args = buildFfmpegArgs(plan({ mapMode: 'audio', videoCodec: 'libx264', audioCodec: 'libmp3lame' }))
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-map')), ['-map 0:a:0'])
  assert.equal(args.includes('-c:v'), false)
  assert.equal(args.includes('-libx264'), false)
})

test('keeps the video and discards the audio when asked to mute', () => {
  const args = buildFfmpegArgs(plan({ mapMode: 'mute', audioCodec: 'aac' }))
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-map')), ['-map 0:v:0'])
  assert.equal(args.includes('-an'), true)
  assert.equal(args.includes('-c:a'), false)
})

test('drops the video stream entirely for an audio only extraction', () => {
  const args = buildFfmpegArgs(plan({ mapMode: 'audio', videoCodec: 'none', audioCodec: 'aac' }))
  assert.equal(args.includes('-vn'), false)
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-map')), ['-map 0:a:0'])
})

test('writes a single frame when a frame count is given', () => {
  const args = buildFfmpegArgs(plan({ frameCount: '1', container: 'jpg', videoCodec: 'default' }))
  assert.equal(args[args.indexOf('-frames:v') + 1], '1')
})

// --------------------------------------------------------------------- filters

test('keeps a single filter chain on -vf and -af', () => {
  const args = buildFfmpegArgs(plan({ volume: '1.5', scaleMode: 'width', width: '640' }))
  assert.equal(args[args.indexOf('-vf') + 1], 'scale=640:-1:flags=lanczos')
  assert.equal(args[args.indexOf('-af') + 1], 'volume=1.5')
  assert.equal(args.includes('-filter_complex'), false)
})

test('branches the graph to build a palette before making a GIF', () => {
  const args = buildFfmpegArgs(plan({ container: 'gif', gifPalette: true, scaleMode: 'width', width: '480', fps: '15' }))
  const graph = args[args.indexOf('-filter_complex') + 1]
  assert.match(graph, /split\[g0\]\[g1\]/)
  assert.match(graph, /palettegen=stats_mode=diff\[pal\]/)
  assert.match(graph, /paletteuse/)
  assert.equal(args.includes('-vf'), false)
})

test('overlays a second input through a labelled graph rather than mapping it twice', () => {
  const args = buildFfmpegArgs(plan({ watermark: 'image', secondInput: 'logo.png', volume: '0.8' }))
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-i')), ['-i input.mp4', '-i logo.png'])
  assert.deepEqual(pairs(args).filter((pair) => pair.startsWith('-map')), ['-map [vout]', '-map [aout]'])
  assert.equal(args.includes('-map 0:v:0'), false)
  assert.match(args[args.indexOf('-filter_complex') + 1], /overlay=W-w-10:H-h-10/)
})

test('sizes the watermark off the frame so it survives a 4K render', () => {
  const small = buildFfmpegArgs(plan({ watermark: 'text', watermarkText: 'Demo', width: '640' }))
  const large = buildFfmpegArgs(plan({ watermark: 'text', watermarkText: 'Demo', width: '3840' }))
  assert.match(small[small.indexOf('-vf') + 1], /fontsize=16/)
  assert.match(large[large.indexOf('-vf') + 1], /fontsize=96/)
})

test('escapes the characters drawtext would otherwise read as filter syntax', () => {
  const args = buildFfmpegArgs(plan({ watermark: 'text', watermarkText: 'a:b%{pts}' }))
  // The braces go too: escaping only the percent would still let drawtext expand it.
  assert.match(args[args.indexOf('-vf') + 1], /text='a\\:b\\%\\\{pts\\\}'/)
})

test('burns in a subtitle file as a filter rather than as a stream', () => {
  const args = buildFfmpegArgs(plan({ subtitle: 'C:\\media\\subs.srt' }))
  assert.equal(args[args.indexOf('-vf') + 1], "subtitles='C\\:/media/subs.srt'")
})

test('splits an audio speed outside the range a single atempo accepts', () => {
  assert.deepEqual(atempoFactors(2), [2])
  assert.deepEqual(atempoFactors(0.5), [0.5])
  assert.deepEqual(atempoFactors(4), [2, 2])
  assert.deepEqual(atempoFactors(8), [2, 2, 2])
  assert.deepEqual(atempoFactors(0.25), [0.5, 0.5])
  assert.deepEqual(atempoFactors(0), [])
  assert.deepEqual(atempoFactors(-1), [])
  const args = buildFfmpegArgs(plan({ speed: '4' }))
  assert.equal(args[args.indexOf('-af') + 1], 'atempo=2,atempo=2')
})

test('shortens the audio instead of speeding up the picture when asked to speed up', () => {
  const args = buildFfmpegArgs(plan({ speed: '2' }))
  assert.match(args[args.indexOf('-vf') + 1], /setpts=0\.5\*PTS/)
  assert.equal(args[args.indexOf('-af') + 1], 'atempo=2')
})

test('leaves the picture alone when the speed factor is not a number', () => {
  const args = buildFfmpegArgs(plan({ speed: 'fast' }))
  assert.equal(args.includes('-vf'), false)
  assert.equal(args.includes('-af'), false)
})

// ---------------------------------------------------------------------- inputs

test('splices a raw option string into the input section', () => {
  const args = buildFfmpegArgs(plan({ input: 'list.txt', inputFormat: 'concat', inputOptions: '-safe 0' }))
  assert.deepEqual(args.slice(0, 6), ['-f', 'concat', '-safe', '0', '-i', 'list.txt'])
})

test('reads an image sequence at the output frame rate', () => {
  const args = buildFfmpegArgs(plan({ preset: 'image-sequence', input: '%04d.png', fps: '25' }))
  assert.deepEqual(args.slice(0, 4), ['-framerate', '25', '-i', '%04d.png'])
  // The input flag already sets the rate, so a filter would restate it.
  assert.equal(args.includes('-vf'), false)
})

test('reads a time in either of the notations a reader would type', () => {
  assert.equal(timeInSeconds('12'), 12)
  assert.equal(timeInSeconds('1:30'), 90)
  assert.equal(timeInSeconds('01:02:03'), 3723)
  assert.equal(timeInSeconds('00:00:01.5'), 1.5)
  assert.equal(timeInSeconds('-5'), -5)
  assert.equal(timeInSeconds('  '), null)
  assert.equal(timeInSeconds('later'), null)
  assert.equal(timeInSeconds('1:2:3:4'), null)
  assert.equal(timeInSeconds(''), null)
})

test('leaves a seek to the start of the file out, since ffmpeg does it anyway', () => {
  assert.equal(buildFfmpegArgs(plan({ start: '00:00:00' })).includes('-ss'), false)
  assert.equal(buildFfmpegArgs(plan({ start: '00:00:01' })).includes('-ss'), true)
  // Counting back from the end is an instruction, not a no-op.
  assert.equal(buildFfmpegArgs(plan({ start: '-5' })).includes('-ss'), true)
  // An unreadable time is still passed through, and the validator says so.
  assert.equal(buildFfmpegArgs(plan({ start: 'later' })).includes('-ss'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ start: 'later' }))).includes('startInvalid'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ duration: 'soon' }))).includes('durationInvalid'), true)
  assert.deepEqual(keys(validateFfmpegPlan(plan({ start: '1:30', duration: '00:00:30' }))), [])
  assert.equal(buildFfmpegArgs(applyPreset(plan(), 'trim')).includes('-ss'), false)
})

test('opens a capture device instead of a file when recording the screen', () => {
  assert.deepEqual(screenInputArgs(plan({ screenSource: 'macos' })), [
    '-f', 'avfoundation', '-capture_cursor', '1', '-i', '1:none'
  ])
  assert.deepEqual(screenInputArgs(plan({ screenSource: 'linux', width: '1280', height: '720', fps: '30' })), [
    '-f', 'x11grab', '-framerate', '30', '-video_size', '1280x720', '-i', ':0.0'
  ])
  assert.deepEqual(screenInputArgs(plan({ screenSource: 'windows', fps: '60' })), [
    '-f', 'gdigrab', '-framerate', '60', '-i', 'desktop'
  ])
})

test('falls back to a sane capture geometry when none was typed', () => {
  const args = screenInputArgs(plan({ screenSource: 'linux' }))
  assert.equal(args[args.indexOf('-video_size') + 1], '1920x1080')
  assert.equal(args[args.indexOf('-framerate') + 1], '30')
})

test('reads the capture device rather than the input path when recording', () => {
  const args = buildFfmpegArgs(plan({ preset: 'screen-record', input: 'ignored.mp4', screenSource: 'windows' }))
  assert.equal(args.includes('ignored.mp4'), false)
  assert.equal(args.includes('desktop'), true)
})

// ------------------------------------------------------------------- escaping

test('quotes only what a shell would otherwise eat', () => {
  assert.equal(quoteArgument('input.mp4'), 'input.mp4')
  assert.equal(quoteArgument('-c:v'), '-c:v')
  assert.equal(quoteArgument('100%'), '100%')
  assert.equal(quoteArgument('my clip.mov'), "'my clip.mov'")
  assert.equal(quoteArgument(''), "''")
  assert.equal(quoteArgument('a"b'), `'a"b'`)
  // The classic quote-then-escape-then-quote dance, so an apostrophe survives.
  assert.equal(quoteArgument("it's"), "'it'\\''s'")
})

test('splits a raw option string the way a shell would', () => {
  assert.deepEqual(tokenizeOptions('-safe 0'), ['-safe', '0'])
  assert.deepEqual(tokenizeOptions('  -vf  "scale=1280:-1"  '), ['-vf', 'scale=1280:-1'])
  assert.deepEqual(tokenizeOptions("-metadata title='My Clip'"), ['-metadata', 'title=My Clip'])
  assert.deepEqual(tokenizeOptions('-map "0:a:0" -c:a copy'), ['-map', '0:a:0', '-c:a', 'copy'])
  assert.deepEqual(tokenizeOptions(''), [])
  assert.deepEqual(tokenizeOptions('   '), [])
})

test('escapes a filter path without breaking a Windows drive letter', () => {
  assert.equal(escapeFilterPath('C:\\media\\a.srt'), 'C\\:/media/a.srt')
  assert.equal(escapeFilterPath("it's.srt"), "it\\'s.srt")
  assert.equal(escapeFilterText('a:b%{x}'), 'a\\:b\\%\\{x\\}')
})

test('renders a command that quotes the filter graph but leaves plain paths alone', () => {
  // A graph with nothing a shell would eat is left bare, so the common command
  // stays readable.
  assert.match(buildFfmpegCommand(plan({ volume: '1.5' })), / -af volume=1\.5 /)
  // A graph carrying quotes or spaces has to survive the shell.
  assert.match(buildFfmpegCommand(plan({ subtitle: 'my subs.srt' })), / -vf 'subtitles=.*my subs\.srt'/)
  const spaced = buildFfmpegCommand(plan({ input: 'my clip.mov', output: 'my out.mov' }))
  assert.match(spaced, /^ffmpeg -i 'my clip\.mov' .* 'my out\.mov'$/)
})

test('adds the banner and overwrite switches only when asked', () => {
  assert.equal(buildFfmpegArgs(plan({ hideBanner: true })).includes('-hide_banner'), true)
  assert.equal(buildFfmpegArgs(plan({ overwrite: true })).includes('-y'), true)
  assert.deepEqual(flagsOf(buildFfmpegArgs(plan({ overwrite: true }))).slice(0, 1), ['-y'])
})

test('appends the reader own extra arguments verbatim and last', () => {
  const args = buildFfmpegArgs(plan({ extra: '-metadata title="My Clip"' }))
  assert.deepEqual(args.slice(-3), ['-metadata', 'title=My Clip', 'output.mp4'])
})

// ------------------------------------------------------------------ suggestions

test('renames the output after the input and its new extension', () => {
  assert.equal(suggestOutputName('input.mov', 'mp4'), 'input.mp4')
  assert.equal(suggestOutputName('input.mp4', 'mkv'), 'input.mkv')
  assert.equal(suggestOutputName('clips/2024.mp4', 'gif'), 'clips/2024.gif')
  assert.equal(suggestOutputName('C:\\clips\\a.mov', 'webm'), 'C:\\clips\\a.webm')
  assert.equal(suggestOutputName('', 'mp4'), '')
})

test('never suggests overwriting the file it is about to read', () => {
  assert.equal(suggestOutputName('clip.mp4', 'mp4'), 'clip-out.mp4')
})

test('does not try to derive a name from an image sequence pattern', () => {
  assert.equal(suggestOutputName('%04d.png', 'mp4'), 'out.mp4')
  assert.equal(suggestOutputName('.mp4', 'mp4'), 'out.mp4')
})

test('moves a typed name onto the extension the new container needs', () => {
  assert.equal(retargetOutputName('clip.mp4', 'mp3'), 'clip.mp3')
  assert.equal(retargetOutputName('clip.mp3', 'mkv'), 'clip.mkv')
  assert.equal(retargetOutputName('clips/a.webm', 'gif'), 'clips/a.gif')
  assert.equal(retargetOutputName('C:\\clips\\a.mov', 'mp4'), 'C:\\clips\\a.mp4')
  // The name the reader chose is kept, including the dot in its own stem.
  assert.equal(retargetOutputName('my.holiday.clip.mp4', 'webm'), 'my.holiday.clip.webm')
  assert.equal(retargetOutputName('clip.MP4', 'gif'), 'clip.gif')
  // A name whose extension is not a media one is left exactly as typed.
  assert.equal(retargetOutputName('report', 'gif'), 'report.gif')
  assert.equal(retargetOutputName('notes.txt', 'gif'), 'notes.txt')
  assert.equal(retargetOutputName('', 'gif'), '')
  // Retargeting only moves the extension, so it cannot turn the file being read
  // into the file being written; that guard belongs to suggestOutputName.
  assert.equal(retargetOutputName('input.mp4', 'mp4'), 'input.mp4')
  assert.equal(suggestOutputName('input.mp4', 'mp4'), 'input-out.mp4')
})

// ------------------------------------------------------------------- validation

function keys(issues) {
  return issues.map((issue) => issue.key)
}

test('blocks a command that cannot run at all', () => {
  assert.deepEqual(keys(validateFfmpegPlan(plan({ input: '', output: '' }))), ['noInput', 'noOutput'])
  assert.deepEqual(keys(validateFfmpegPlan(plan({ output: '' }))), ['noOutput'])
  assert.deepEqual(keys(validateFfmpegPlan(plan({ output: 'input.mp4' }))), ['sameFile'])
  assert.deepEqual(keys(validateFfmpegPlan(plan({ scaleMode: 'crop', width: '', height: '' }))), ['needWidth', 'needHeight'])
  assert.deepEqual(keys(validateFfmpegPlan(plan({ scaleMode: 'width', width: '', height: '1080' }))), ['needWidth'])
  assert.deepEqual(keys(validateFfmpegPlan(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: 'abc' }))), ['invalidCrf'])
})

test('a screen recording needs no input file', () => {
  const issues = validateFfmpegPlan(plan({ preset: 'screen-record', input: '', output: 'out.mp4' }))
  assert.equal(keys(issues).includes('noInput'), false)
})

test('a complete plan has nothing to report', () => {
  assert.deepEqual(validateFfmpegPlan(plan()), [])
  const transcode = applyPreset(plan(), 'transcode')
  assert.deepEqual(validateFfmpegPlan(transcode), [])
})

test('warns about a setting that will be silently dropped', () => {
  assert.equal(keys(validateFfmpegPlan(plan({ videoCodec: 'copy', qualityMode: 'crf', crf: '23' }))).includes('crfIgnored'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ videoCodec: 'libx264', qualityMode: 'bitrate', videoBitrate: '' }))).includes('bitrateMissing'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ watermark: 'image', secondInput: '' }))).includes('needWatermarkImage'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ watermark: 'text', watermarkText: '' }))).includes('needWatermarkText'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ speed: 'quick' }))).includes('speedInvalid'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ volume: 'loud' }))).includes('volumeInvalid'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ gifPalette: true, container: 'mp4' }))).includes('paletteNeedsGif'), true)
})

test('warns about a container that cannot carry the chosen stream', () => {
  assert.equal(keys(validateFfmpegPlan(plan({ container: 'gif', audioCodec: 'aac' }))).includes('audioInGif'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ container: 'mp3', audioCodec: 'aac' }))).includes('audioContainerNeedsAudioMap'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ container: 'png', videoCodec: 'default' }))).includes('needFrameCount'), true)
})

test('warns about a codec the container plays badly', () => {
  assert.equal(keys(validateFfmpegPlan(plan({ container: 'webm', videoCodec: 'libx264', qualityMode: 'default' }))).includes('h264InWebm'), true)
  assert.equal(keys(validateFfmpegPlan(plan({ container: 'mp4', videoCodec: 'libvpx-vp9', qualityMode: 'default' }))).includes('modernCodecInMp4'), true)
})

test('accepts a CRF above the usual range with a note rather than an error', () => {
  const issues = validateFfmpegPlan(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: '60' }))
  assert.deepEqual(keys(issues), ['crfRange'])
  assert.equal(issues[0].level, 'warning')
})

test('every preset is runnable as soon as a file name is typed', () => {
  // `custom` is the blank starting point rather than a scenario, so it is the one
  // entry that promises nothing. Every other preset has to stand on its own.
  for (const preset of ffmpegPresets.filter((item) => item.id !== 'custom')) {
    const next = applyPreset(plan(), preset.id)
    const issues = validateFfmpegPlan(next)
    assert.deepEqual(issues.filter((issue) => issue.level === 'error'), [], preset.id)

    // A preset is a change of intent, so the runtime re-points the extension the
    // preset's container implies while leaving the typed name alone.
    assert.equal(next.output, 'output.mp4', preset.id)
    const settled = { ...next, output: retargetOutputName(next.output, next.container) }
    assert.equal(settled.output, `output.${containerInfo(settled.container).extension}`, preset.id)
    assert.deepEqual(validateFfmpegPlan(settled), [], preset.id)

    const args = buildFfmpegArgs(settled)
    assert.equal(buildFfmpegCommand(settled).startsWith('ffmpeg '), true, preset.id)
    assert.equal(args[args.length - 1], settled.output, preset.id)
    // Every input the plan declares is opened exactly once. A screen recording
    // opens a capture device rather than the typed path.
    const opened = []
    for (let index = 0; index < args.length; index += 1) if (args[index] === '-i') opened.push(args[index + 1])
    assert.equal(opened.length, preset.id === 'watermark' ? 2 : 1, preset.id)
    if (preset.id === 'screen-record') assert.equal(opened[0], '1:none', preset.id)
    else assert.equal(opened[0], next.input, preset.id)
  }
})

test('every bare token in a command belongs to the flag before it', () => {
  // Only these four stand alone; every other flag the builder emits takes one
  // value. Anything else that looks like a word is an orphan ffmpeg will read as
  // an input path, so this catches a value pushed out of place.
  const standalone = new Set(['-hide_banner', '-y', '-an', '-shortest'])
  const samples = ffmpegPresets.map((preset) => applyPreset(plan(), preset.id))
  samples.push(
    plan({ volume: '2', channels: 'mono' }),
    plan({ speed: '4', subtitle: 'a.srt', fps: '30' }),
    plan({ watermark: 'image', secondInput: 'logo.png' }),
    plan({ preset: 'concat', input: 'list.txt', inputFormat: 'concat', inputOptions: '-safe 0' }),
    plan({ extra: '-metadata title=x -threads 4' }),
    plan({ start: '-5', duration: '10', frameCount: '1' })
  )
  for (const sample of samples) {
    const args = buildFfmpegArgs(sample)
    // A screen recording still opens one input: the capture device.
    const expectedInputs = sample.watermark === 'image' ? 2 : 1
    let inputs = 0
    for (let index = 0; index < args.length - 1; index += 1) {
      const token = args[index]
      if (token === '-i') {
        inputs += 1
        index += 1
        continue
      }
      if (!token.startsWith('-')) continue
      if (standalone.has(token)) continue
      index += 1
    }
    assert.equal(inputs, expectedInputs, buildFfmpegCommand(sample))
    // The output is the only trailing word, and it is the one the plan named.
    assert.equal(args[args.length - 1], sample.output, buildFfmpegCommand(sample))
  }
})

// -------------------------------------------------------------------- reporting

test('summarises the command for the stat row', () => {
  const args = buildFfmpegArgs(plan({ volume: '1.5', watermark: 'image', secondInput: 'logo.png' }))
  const summary = summarizeCommand(buildFfmpegCommand(plan()), args)
  assert.equal(summary.arguments, args.length)
  assert.equal(summary.inputs, 2)
  assert.equal(summary.filterComplex, true)
})

test('explains each emitted flag and ignores the output path', () => {
  const args = buildFfmpegArgs(plan({ videoCodec: 'libx264', qualityMode: 'crf', crf: '23', overwrite: true }))
  const rows = describeFlags(args)
  assert.deepEqual(
    rows.map((row) => (row.value ? `${row.flag} ${row.value}` : row.flag)),
    ['-y', '-i input.mp4', '-c:v libx264', '-c:a copy', '-crf 23', '-preset medium', '-pix_fmt yuv420p', '-movflags +faststart']
  )
  // The last token is the output file, not a flag, so it must not be described.
  assert.equal(rows.some((row) => row.flag === 'output.mp4'), false)
  for (const row of rows) assert.match(row.key, /^toolUi\.ffmpeg-builder\.flags\./)
})

test('does not mistake a negative filter value for a flag', () => {
  const rows = describeFlags(['-i', 'a.mp4', '-vf', 'scale=-1:720', 'out.mp4'])
  assert.deepEqual(rows.map((row) => row.value), ['a.mp4', 'scale=-1:720'])
})

test('translates every flag key the builder can emit', async () => {
  // A key with no dictionary entry falls back to rendering the key itself, which
  // would look like a bug to whoever reads the list.
  const emitted = new Set()
  const samples = [
    plan(),
    plan({ hideBanner: true, overwrite: true, start: '1', duration: '2', frameCount: '1', shortest: true }),
    plan({ preset: 'image-sequence', inputFormat: 'concat', inputOptions: '-safe 0' }),
    plan({ volume: '2', speed: '2', scaleMode: 'width', width: '64', fps: '10', subtitle: 'a.srt' }),
    plan({ watermark: 'image', secondInput: 'logo.png', gifPalette: true }),
    plan({ preset: 'screen-record' }),
    plan({ container: 'mp4', videoCodec: 'h264_nvenc', qualityMode: 'crf', crf: '20' }),
    plan({ container: 'mp4', videoCodec: 'h264_qsv', qualityMode: 'crf', crf: '20' }),
    plan({ container: 'mov', videoCodec: 'h264_videotoolbox', qualityMode: 'crf', crf: '20' }),
    plan({ videoCodec: 'libaom-av1', qualityMode: 'bitrate', videoBitrate: '1M', channels: 'mono', audioBitrate: '96k' })
  ]
  for (const sample of samples) {
    for (const row of describeFlags(buildFfmpegArgs(sample))) emitted.add(row.key)
  }
  const { translate } = await import('../src/i18n/index.ts')
  for (const key of emitted) {
    for (const locale of ['zh-CN', 'en', 'ja', 'zh-TW']) {
      const text = translate(locale, /** @type {never} */ (key))
      assert.notEqual(text, key, `${locale}: ${key} has no translation`)
    }
  }
})
// ---------------------------------------------------------------------- stages

test('splits the options into the groups the command line is read in', () => {
  // The form is a pipeline, so the groups have to be listed in the order ffmpeg
  // wants them on the command line, or the page contradicts the command.
  assert.deepEqual(ffmpegStages.map((stage) => stage.id), ['global', 'input', 'streams', 'filters', 'output'])
  for (const stage of ffmpegStages) assert.ok(stage.flags.length > 0, `${stage.id} owns no flag`)
  assert.equal(new Set(allFlags).size, allFlags.length, 'a flag is claimed by two stages')
  assert.equal(stageOfFlag('-i'), 'input')
  assert.equal(stageOfFlag('-vf'), 'filters')
  assert.equal(stageOfFlag('-crf'), 'output')
  assert.equal(stageOfFlag('-b:a'), 'output')
})

test('every emitted flag is explained and placed in a stage', () => {
  const samples = [
    plan({ hideBanner: true, overwrite: true, start: '1', duration: '2', frameCount: '1', shortest: true }),
    plan({ volume: '2', speed: '2', scaleMode: 'width', width: '64', fps: '10', subtitle: 'a.srt' }),
    plan({ watermark: 'image', secondInput: 'logo.png', gifPalette: true }),
    plan({ preset: 'image-sequence', inputFormat: 'concat', inputOptions: '-safe 0' }),
    plan({ videoCodec: 'libaom-av1', qualityMode: 'bitrate', videoBitrate: '1M', channels: 'mono' })
  ]
  for (const sample of samples) {
    for (const row of describeFlags(buildFfmpegArgs(sample))) {
      assert.ok(allFlags.includes(row.flag), `${row.flag} is emitted but belongs to no stage`)
      assert.equal(row.stage, stageOfFlag(row.flag))
    }
  }
})

test('shows the filter chain the plan actually builds', () => {
  assert.deepEqual(filterPreview(plan()), { video: '', audio: '', complex: '' })
  assert.equal(filterPreview(plan({ scaleMode: 'width', width: '1280' })).video, 'scale=1280:-1:flags=lanczos')
  assert.equal(filterPreview(plan({ volume: '1.5' })).audio, 'volume=1.5')
  // Speed and volume each land on both chains, which is the point of the hint
  // on the speed field.
  const both = filterPreview(plan({ speed: '2', volume: '2' }))
  assert.equal(both.video, 'setpts=0.5*PTS')
  assert.equal(both.audio, 'atempo=2,volume=2')
  // An overlay needs two inputs at once, so it becomes a filtergraph rather than
  // a -vf chain, and both chains end up inside it.
  const overlay = filterPreview(plan({ watermark: 'image', secondInput: 'logo.png' }))
  assert.equal(overlay.video, '')
  assert.match(overlay.complex, /\[1:v\]scale=iw\*0\.2:-1:flags=lanczos\[wm\]/)
  assert.match(overlay.complex, /overlay=[^\[]+\[vout\]/)

  const chained = filterPreview(plan({ watermark: 'image', secondInput: 'logo.png', scaleMode: 'width', width: '1280' }))
  assert.match(chained.complex, /^\[0:v\]scale=1280:-1:flags=lanczos\[vbase\];/)
})

// -------------------------------------------------------------------- the form

test('asks for no parameter to be typed', () => {
  // The reader is assumed to know nothing about ffmpeg, so the form may only
  // offer choices, switches and file pickers. The two kinds of text that remain
  // are the two the browser cannot fill in for them: a path, and the words of a
  // watermark.
  const markup = readFileSync(new URL('../src/components/tools/FfmpegTool.astro', import.meta.url), 'utf8')
  assert.equal(markup.includes('type="number"'), false, 'a number is still asked for')

  const typed = [...markup.matchAll(/id="([a-z-]+)" type="text"/g)].map((match) => match[1]).sort()
  assert.deepEqual(typed, [
    'ffmpeg-input',
    'ffmpeg-output',
    'ffmpeg-subtitle',
    'ffmpeg-watermark-image',
    'ffmpeg-watermark-text'
  ])

  // The demuxer, the raw option strings and the numbers behind the quality dial
  // are set by the recipe, so they must not be reachable by typing.
  for (const gone of ['ffmpeg-input-format', 'ffmpeg-input-options', 'ffmpeg-extra', 'ffmpeg-crf', 'ffmpeg-bitrate', 'ffmpeg-encoder-preset', 'ffmpeg-frame-count', 'ffmpeg-width', 'ffmpeg-height', 'ffmpeg-scale-mode']) {
    assert.equal(markup.includes(`id="${gone}"`), false, `${gone} is still a field`)
  }

  // What is left has to be pickable, so the form never depends on a keyboard.
  const pickers = [...markup.matchAll(/type="file"/g)].length
  const switches = [...markup.matchAll(/<CheckboxField/g)].length
  const choices = [...markup.matchAll(/<SelectField/g)].length
  assert.equal(pickers, 3)
  assert.equal(switches, 4)
  assert.ok(choices >= 11, `expected the options to be choices, found ${choices}`)
})

// ------------------------------------------------------------- the preview gate

test('opens a tool that is still in development after three clicks in a row', () => {
  // Three deliberate clicks open the preview; two do not, and a slow third one is
  // a fresh start rather than the third of a run.
  let sequence = { count: 0, last: -1 }
  const tap = (at) => {
    const run = takePreviewRun(advancePreviewClicks(sequence, at))
    sequence = run.sequence
    return run.reached
  }

  assert.equal(tap(0), false)
  assert.equal(tap(300), false)
  assert.equal(tap(600), true)
  assert.equal(previewClicks, 3)

  // A long pause breaks the run, so the next three taps have to be close together
  // again before the tool opens.
  const run = (...times) => times.reduce((state, at) => advancePreviewClicks(state, at), { count: 0, last: -1 })
  const opens = (...times) => takePreviewRun(run(...times)).reached
  assert.equal(opens(0, 5_000, 5_100), false)
  assert.equal(opens(0, 5_000, 5_100, 5_200), true)
  assert.equal(opens(0, 5_000, 9_000, 9_100), false)
})

test('only a tool with a page of its own can be opened before it is finished', () => {
  // A tool that is still being built stays shut. Having a page of its own is
  // what earns the badge an opt-in: such a tool sets `preview`, and the label
  // does not decide anything by itself. A planned tool has no page to open, so
  // no amount of tapping takes it anywhere.
  const previewable = allTools.filter((tool) => tool.preview)
  for (const tool of previewable) {
    assert.ok(tools.includes(tool), `${tool.id} is marked preview without a page of its own`)
    assert.equal(tool.available, false, 'a finished tool needs no preview')
  }
  assert.deepEqual(
    previewable.map((tool) => tool.id),
    tools.filter((tool) => !tool.available).map((tool) => tool.id),
    'every unfinished tool that has a page should be reachable from its badge'
  )
  for (const tool of plannedTools) assert.equal(tool.preview, undefined, `${tool.id} is not built, so it stays shut`)

  // A badge that does not name a tool is not wired to the sequence at all, which
  // is what keeps the other badges from being links. Both places a planned tool is
  // listed have to ask the tool first.
  for (const file of ['ToolCard.astro', 'Sidebar.astro']) {
    const markup = readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8')
    assert.match(markup, /tool\.preview/, `${file} ignores the opt-in`)
    assert.match(markup, /data-planned-preview=\{tool\.id\}/, `${file} has no preview badge`)
  }
  const script = readFileSync(new URL('../src/scripts/planned-preview.ts', import.meta.url), 'utf8')
  assert.match(script, /querySelectorAll<HTMLElement>\('\[data-planned-preview\]'\)/)
  assert.match(script, /\/tools\/\$\{toolId\}\//)
})
