import {
  allZones,
  convert,
  crossesDay,
  formatZoned,
  instantIn,
  isValidZone,
  localZone,
  offsetLabel,
  offsetMinutes,
  type ZoneId
} from '../lib/timezone'
import { mountWorkspace } from './tool-workspace'

/** `datetime-local` gives `YYYY-MM-DDTHH:MM[:SS]`, read as a wall clock time. */
function readInstant(source: string, zone: ZoneId): Date | null {
  const at = source.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!at) return null
  const instant = instantIn(zone, {
    year: Number(at[1]),
    month: Number(at[2]),
    day: Number(at[3]),
    hour: Number(at[4]),
    minute: Number(at[5]),
    second: Number(at[6] ?? 0),
    weekday: 0
  })
  return Number.isFinite(instant.getTime()) ? instant : null
}

const write = (parts: ReturnType<typeof formatZoned>) => parts.replace(' ', 'T')

mountWorkspace(
  'timezone-converter',
  (refs, run) => {
    const moment = refs.el<HTMLInputElement>('option-moment')
    const source = refs.el<HTMLInputElement>('option-source')
    const target = refs.el<HTMLInputElement>('option-target')
    const list = refs.el<HTMLDataListElement>('zones')
    if (list) list.innerHTML = allZones().map((id) => `<option value="${id}"></option>`).join('')
    const now = new Date()
    if (moment && moment.value === '') moment.value = write(formatZoned(convert(now, localZone(), 'UTC').source))
    if (source && source.value === '') source.value = localZone()
    if (target && target.value === '') target.value = 'UTC'

    return () => {
      const from = source?.value.trim() ?? ''
      const to = target?.value.trim() ?? ''
      if (from === '' || !isValidZone(from) || !isValidZone(to)) {
        run.failure(run.t('toolUi.timezone-converter.errors.badZone', { zone: from === '' || !isValidZone(from) ? from : to }))
        return
      }
      const at = readInstant(moment?.value ?? '', from)
      if (!at) {
        run.failure(run.t('toolUi.timezone-converter.errors.badDate'))
        return
      }
      const result = convert(at, from, to)
      const shifted = crossesDay(result.source, result.target)

      run.stat('source', formatZoned(result.source))
      run.stat('target', formatZoned(result.target))
      run.stat('sourceOffset', offsetLabel(from, at))
      run.stat('targetOffset', offsetLabel(to, at))
      run.stat('difference', `${result.shiftMinutes >= 0 ? '+' : ''}${Math.round(result.shiftMinutes / 60)}h`)
      run.stat('dayShift', shifted ? run.t('toolUi.timezone-converter.dayShifted') : run.t('toolUi.timezone-converter.sameDay'))

      const targetOffset = offsetMinutes(to, at)
      const neighbours = allZones().filter((id) => offsetMinutes(id, at) === targetOffset).slice(0, 14)
      const rows = [to, ...neighbours]
        .filter((id, index, all) => all.indexOf(id) === index)
        .map((id) => `${id.padEnd(24)} ${formatZoned(convert(at, from, id).target)}${crossesDay(result.source, convert(at, from, id).target) ? ' ←' : ''}`)

      run.success(
        [`${formatZoned(result.source)} ${from}`, `${formatZoned(result.target)} ${to}`, '', ...rows].join('\n'),
        run.t('toolUi.timezone-converter.doneStatus', { zone: to })
      )
    }
  },
  { live: true }
)