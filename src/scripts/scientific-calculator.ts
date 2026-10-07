import { evaluate, formatValue } from '../lib/calculator'
import { mountWorkspace } from './tool-workspace'

const sample = 'sqrt(144) / 0.5 + sin(30) ^ 2'

mountWorkspace(
  'scientific-calculator',
  (refs, run) => {
    return () => {
      const source = refs.input?.value ?? ''
      if (source.trim() === '') {
        run.failure(run.t('toolUi.scientific-calculator.emptyInput'))
        return
      }
      const mode = run.option('angle') === 'rad' ? 'rad' : 'deg'
      const result = evaluate(source, mode)
      if (!result.ok) {
        run.failure(
          `${run.t(`toolUi.scientific-calculator.errors.${result.code}`)} · ${run.t('toolUi.scientific-calculator.atChar', { position: result.position })}`
        )
        return
      }
      const significant = run.number('precision', 12)
      const exact = String(result.value)
      const shown = formatValue(result.value, significant)
      run.stat('value', shown)
      run.stat('degree', mode === 'deg' ? run.t('toolUi.scientific-calculator.modes.deg') : '—')
      run.stat('radian', mode === 'rad' ? run.t('toolUi.scientific-calculator.modes.rad') : '—')
      run.stat('expression', source.trim().replace(/\s+/g, ' ').slice(0, 22))

      const rows = [shown, '', `${run.t('toolUi.scientific-calculator.exact')}: ${exact}`]
      if (exact !== shown) rows.push(`${run.t('toolUi.scientific-calculator.precisionUsed')}: ${significant}`)
      run.success(rows.join('\n'), run.t('toolUi.scientific-calculator.doneStatus'))
    }
  },
  { live: true, sample }
)