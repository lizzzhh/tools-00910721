import {
  addDays,
  addMonths,
  age,
  businessDays,
  diffDays,
  diffMonths,
  isLeapYear,
  isWeekend,
  parseDay,
  toDate,
  today,
  weekdayOf
} from '../lib/date-calc'
import { mountWorkspace } from './tool-workspace'

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (value: number) => String(value).padStart(2, '0')
const write = (day: { year: number; month: number; day: number }) => `${day.year}-${pad(day.month)}-${pad(day.day)}`
const stamp = (day: { year: number; month: number; day: number }) =>
  `${write(day)} ${weekdayNames[weekdayOf(day)]}${isWeekend(day) ? ' · weekend' : ''}`

/** ISO-8601 week number and week-year, which is what a planner actually wants. */
function isoWeek(day: { year: number; month: number; day: number }): { week: number; year: number } {
  const at = toDate(day)
  const thursday = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()))
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  const year = thursday.getUTCFullYear()
  const first = new Date(Date.UTC(year, 0, 1))
  return { week: Math.ceil(((thursday.getTime() - first.getTime()) / 86_400_000 + 1) / 7), year }
}

mountWorkspace(
  'date-calculator',
  (refs, run) => {
    const from = refs.el<HTMLInputElement>('option-from')
    const to = refs.el<HTMLInputElement>('option-to')
    if (from && from.value === '') from.value = write(today())
    if (to && to.value === '') to.value = write(addDays(today(), 30))

    return () => {
      const start = parseDay(from?.value ?? '')
      const end = parseDay(to?.value ?? '')
      if (!start.ok) {
        run.failure(run.t(`toolUi.date-calculator.errors.${start.code}`))
        return
      }
      if (!end.ok) {
        run.failure(run.t(`toolUi.date-calculator.errors.${end.code}`))
        return
      }
      const amount = Math.trunc(run.number('amount', 30))
      const operation = run.option('operation')
      const first = start.day
      const second = end.day
      const days = diffDays(first, second)
      const weeks = Math.trunc(days / 7)
      const life = age(first, today())
      const week = isoWeek(first)

      let result = ''
      let label = ''
      if (operation === 'plusDays') {
        result = stamp(addDays(first, amount))
        label = run.t('toolUi.date-calculator.results.plusDays', { amount })
      } else if (operation === 'plusMonths') {
        result = stamp(addMonths(first, amount))
        label = run.t('toolUi.date-calculator.results.plusMonths', { amount })
      } else if (operation === 'age') {
        result = `${life.years}y ${life.months}m ${life.days}d · ${life.totalDays} ${run.t('toolUi.date-calculator.days')}`
        label = run.t('toolUi.date-calculator.results.age')
      } else if (operation === 'business') {
        result = String(businessDays(first, second))
        label = run.t('toolUi.date-calculator.results.business')
      } else if (operation === 'isoWeek') {
        result = `${week.week} · ${run.t('toolUi.date-calculator.results.weekYear')}: ${week.year}`
        label = run.t('toolUi.date-calculator.results.isoWeek')
      } else {
        const months = diffMonths(first, second)
        result = `${Math.abs(days)} ${run.t('toolUi.date-calculator.days')} · ${Math.abs(months.months)} ${run.t('toolUi.date-calculator.results.months')} ${Math.abs(months.days)} ${run.t('toolUi.date-calculator.results.restDays')}`
        label = run.t('toolUi.date-calculator.results.diff')
      }

      run.stat('result', result.length > 18 ? run.t('toolUi.date-calculator.results.summary') : result)
      run.stat('days', String(Math.abs(days)))
      run.stat('weeks', String(Math.abs(weeks)))
      run.stat('weekday', weekdayNames[weekdayOf(first)])
      run.stat('isoWeek', `${week.week} / ${week.year}`)

      run.success(
        [
          `${label}: ${result}`,
          '',
          `${run.t('toolUi.date-calculator.line.start')}: ${stamp(first)}`,
          `${run.t('toolUi.date-calculator.line.end')}: ${stamp(second)}`,
          `${run.t('toolUi.date-calculator.line.epoch')}: ${Math.floor(toDate(first).getTime() / 1000)}`,
          `${run.t('toolUi.date-calculator.line.leap')}: ${isLeapYear(first.year) ? run.t('common.yes') : run.t('common.no')}`
        ].join('\n'),
        run.t('toolUi.date-calculator.doneStatus')
      )
    }
  },
  { live: true }
)