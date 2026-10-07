import {
  parseColor,
  readableInk,
  relativeLuminance,
  roundTo,
  toHex,
  toHsl,
  toHslText,
  toOklchText,
  toRgbText,
} from '../lib/color'
import { mountWorkspace } from './tool-workspace'


mountWorkspace(
  'color-converter',
  (refs, run) => {
    const picker = refs.el<HTMLInputElement>('option-color')
    if (picker) {
      picker.addEventListener('input', () => {
        if (refs.input) refs.input.value = picker.value
      })
    }

    return () => {
      const source = refs.input?.value.trim() ?? ''
      if (source === '') {
        run.failure(run.t('toolUi.color-converter.emptyInput'))
        return
      }
      const parsed = parseColor(source)
      if (!parsed.ok) {
        run.failure(run.t(`toolUi.color-converter.errors.${parsed.code}`))
        return
      }
      const { rgb } = parsed
      const short = run.checked('shortHex')
      const alpha = run.checked('withAlpha')
      const hsl = toHsl(rgb)
      const ink = readableInk(rgb)

      run.stat('hex', toHex(rgb, { short, alpha }))
      run.stat('luminance', String(roundTo(relativeLuminance(rgb), 4)))
      run.stat('rgb', toRgbText(rgb))
      run.stat('hsl', `${roundTo(hsl.h, 1)}° ${roundTo(hsl.s, 1)}% ${roundTo(hsl.l, 1)}%`)
      run.stat('oklch', toOklchText(rgb))

      run.success(
        [
          toHex(rgb, { short, alpha }),
          toRgbText(rgb),
          toHslText(rgb),
          toOklchText(rgb),
          '',
          `${run.t('toolUi.color-converter.luminance')}: ${roundTo(relativeLuminance(rgb), 4)}`,
          `${run.t('toolUi.color-converter.readableInk')}: ${toRgbText(ink)} (${toHex(ink, { short })})`
        ].join('\n'),
        run.t('toolUi.color-converter.doneStatus')
      )
    }
  },
  { live: true, sample: '#3b82f6' }
)