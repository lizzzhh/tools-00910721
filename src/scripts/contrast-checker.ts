import {
  composite,
  parseColor,
  contrastRatio,
  gradeContrast,
  readableInk,
  relativeLuminance,
  requiredRatio,
  roundTo,
  toHex,
  toRgbText,
  type Rgb
} from '../lib/color'
import { mountWorkspace } from './tool-workspace'

/** Hex, rgb(), hsl() and the two paper words the page offers. */
function readRgb(value: string): Rgb | null {
  const trimmed = value.trim()
  const named: Record<string, string> = { white: '#ffffff', black: '#000000', ink: '#111827', paper: '#f8fafc' }
  const parsed = parseColor(named[trimmed.toLowerCase()] ?? trimmed)
  return parsed.ok ? parsed.rgb : null
}

mountWorkspace(
  'contrast-checker',
  (refs, run) => {
    const foreground = refs.el<HTMLInputElement>('option-foreground')
    const background = refs.el<HTMLInputElement>('option-background')
    if (foreground && foreground.value === '') foreground.value = '#1f2937'
    if (background && background.value === '') background.value = '#ffffff'

    return () => {
      const top = readRgb(foreground?.value ?? '')
      const base = readRgb(background?.value ?? '')
      if (!top || !base) {
        run.failure(run.t('toolUi.contrast-checker.errors.notAColor'))
        return
      }
      const opaque = composite(base, top)
      const ratio = contrastRatio(opaque, base)
      const large = run.option('textSize') === 'large'
      const grade = gradeContrast(ratio, large)
      const ink = readableInk(base)
      const inkRatio = contrastRatio(ink, base)
      const flipped = contrastRatio(composite(base, ink), opaque)

      run.stat('ratio', String(ratio))
      run.stat('grade', run.t(`toolUi.contrast-checker.grades.${grade}`))
      run.stat('foreground', toHex(top, { short: true }))
      run.stat('background', toHex(base, { short: true }))

      const rows = [
        `${run.t('toolUi.contrast-checker.row.foreground')}: ${toRgbText(top)}`,
        `${run.t('toolUi.contrast-checker.row.background')}: ${toRgbText(base)}`,
        `${run.t('toolUi.contrast-checker.row.composited')}: ${toRgbText(opaque)}`,
        `${run.t('toolUi.contrast-checker.row.luminance')}: ${roundTo(relativeLuminance(opaque), 4)} / ${roundTo(relativeLuminance(base), 4)}`,
        '',
        `${run.t('toolUi.contrast-checker.row.grade')}: ${run.t(`toolUi.contrast-checker.grades.${grade}`)}`,
        `${run.t('toolUi.contrast-checker.row.required')}: ${grade === 'fail' ? (large ? '3' : '4.5') : requiredRatio(grade === 'aaa' ? 'aaa' : large ? 'aa-large' : 'aa')}`,
        `${run.t('toolUi.contrast-checker.row.ink')}: ${toRgbText(ink)} ${inkRatio}:1`,
        `${run.t('toolUi.contrast-checker.row.flipped')}: ${flipped}:1`
      ]
      run.success(rows.join('\n'), run.t('toolUi.contrast-checker.doneStatus', { ratio }))
    }
  },
  { live: true }
)