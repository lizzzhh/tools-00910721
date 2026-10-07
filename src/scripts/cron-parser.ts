import { describeField, describeFrequency, nextRuns, parseCron, type CronFrequency } from '../lib/cron'
import { mountWorkspace } from './tool-workspace'

export type CronFrequencyLabel =
  | 'everySecond'
  | 'everyMinute'
  | 'everyHour'
  | 'everyDay'
  | 'everyWeek'
  | 'everyMonth'
  | 'everyYear'
  | 'custom'

/** How often the expression fires, in words a person would use. */
function frequencyName(frequency: CronFrequency): CronFrequencyLabel {
  if (frequency.perMatchingDay >= 86_400) return 'everySecond'
  if (frequency.perMatchingDay >= 1_440) return 'everyMinute'
  if (frequency.perMatchingDay >= 24) return 'everyHour'
  if (frequency.matchingDays >= 360) return 'everyDay'
  if (frequency.matchingDays === 7) return 'everyWeek'
  if (frequency.matchingDays === 31) return 'everyMonth'
  if (frequency.matchingDays === 365) return 'everyYear'
  return 'custom'
}

mountWorkspace(
  'cron-parser',
  (refs, run) => {
    const expression = refs.el<HTMLInputElement>('option-expression')
    const preset = refs.el<HTMLInputElement>('option-preset')
    preset?.addEventListener('change', () => {
      if (expression) expression.value = preset.value
    })

    return () => {
      const source = expression?.value.trim() ?? ''
      if (source === '') {
        run.failure(run.t('toolUi.cron-parser.emptyExpression'))
        return
      }
      const parsed = parseCron(source)
      if (!parsed.ok) {
        run.failure(
          `${run.t(`toolUi.cron-parser.errors.${parsed.code}`)}${parsed.position === undefined ? '' : ` · ${run.t('workspace.charPosition', { position: parsed.position })}`}`
        )
        return
      }
      const runs = nextRuns(parsed.fields, new Date(), 5)
      const frequency = describeFrequency(parsed.fields)

      run.stat('fields', String(Object.values(parsed.fields).reduce((total, values) => total + values.length, 0)))
      run.stat('matches', String(runs.length))
      run.stat('frequency', run.t(`toolUi.cron-parser.frequencies.${frequencyName(frequency)}`))
      run.stat('seconds', frequency.perMatchingDay >= 86_400 ? run.t('common.yes') : run.t('common.no'))

      const fields = (Object.keys(parsed.raw) as (keyof typeof parsed.raw)[]).map(
        (id) => `${id}: ${describeField(id, parsed.raw[id], parsed.fields[id])}`
      )
      const lines = runs.map((at, index) => `${index + 1}. ${at.toISOString()}`)
      run.success([...fields, '', ...lines].join('\n'), run.t('toolUi.cron-parser.doneStatus'))
    }
  },
  { sample: '0 9 * * 1-5' }
)