import { strict as assert } from 'node:assert'
import test from 'node:test'
import { describeDate, formatTimestamp, getTimezoneOffset, parseDateInput, parseTimestamp } from '../src/lib/datetime.ts'

test('parses second and millisecond timestamps', () => {
  const seconds = parseTimestamp('1767225600')
  const milliseconds = parseTimestamp('1767225600123', 'milliseconds')
  const forced = parseTimestamp('1767225600123', 'seconds')

  assert.equal(seconds.ok && seconds.unit, 'seconds')
  assert.equal(seconds.ok && seconds.output, '2026-01-01T00:00:00.000Z')
  assert.equal(milliseconds.ok && milliseconds.output, '2026-01-01T00:00:00.123Z')
  assert.equal(forced.ok, false)
})

test('parses dates with and without an explicit zone', () => {
  const zoned = parseDateInput('2026-01-31T08:30:00Z')
  const offset = parseDateInput('2026-01-31 16:30:00+08:00')
  const dateOnly = parseDateInput('2026-01-31', true)
  const timestamp = parseDateInput('1767225600')

  assert.equal(zoned.ok && zoned.output, '2026-01-31T08:30:00.000Z')
  assert.equal(offset.ok && offset.output, '2026-01-31T08:30:00.000Z')
  assert.equal(dateOnly.ok && dateOnly.output, '2026-01-31T00:00:00.000Z')
  assert.equal(timestamp.ok && timestamp.output, '2026-01-01T00:00:00.000Z')
})

test('supports fractional seconds and missing components', () => {
  const fraction = parseDateInput('2026-01-31T08:30:00.25Z')
  const short = parseDateInput('2026-01-31 08:30Z')

  assert.equal(fraction.ok && fraction.output, '2026-01-31T08:30:00.250Z')
  assert.equal(short.ok && short.output, '2026-01-31T08:30:00.000Z')
})

test('rejects invalid timestamps and dates', () => {
  const text = parseTimestamp('yesterday')
  const unsafe = parseTimestamp('9'.repeat(20))
  const broken = parseDateInput('2026/01/31')
  const outOfRange = parseDateInput('2026-13-01')

  assert.equal(text.ok, false)
  if (!text.ok) assert.match(text.message, /整数/)
  assert.equal(unsafe.ok, false)
  if (!unsafe.ok) assert.match(unsafe.message, /安全整数范围/)
  assert.equal(broken.ok, false)
  if (!broken.ok) assert.match(broken.message, /格式无法识别/)
  assert.equal(outOfRange.ok, false)
  if (!outOfRange.ok) assert.match(outOfRange.message, /有效范围/)
})

test('describes a date in ISO, UTC and local forms', () => {
  const date = new Date('2026-01-31T08:30:00.000Z')
  const parts = describeDate(date)

  assert.equal(parts.iso, '2026-01-31T08:30:00.000Z')
  assert.equal(parts.utc, 'Sat, 31 Jan 2026 08:30:00 GMT')
  assert.equal(parts.unixSeconds, '1769848200')
  assert.equal(parts.unixMilliseconds, '1769848200000')
  assert.equal(parts.local, `${parts.date} ${parts.time}`)
  assert.equal(parts.weekday, '星期六')
  assert.equal(parts.offset, getTimezoneOffset(date))
  assert.ok(parts.timezone.length > 0)
})

test('formats timestamps with and without milliseconds', () => {
  const date = new Date('2026-01-31T08:30:00.123Z')

  assert.equal(formatTimestamp(date), '2026-01-31T08:30:00Z')
  assert.equal(formatTimestamp(date, { milliseconds: true }), '2026-01-31 08:30:00.123 UTC')
})
