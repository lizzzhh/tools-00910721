import * as echarts from 'echarts/core'
import { BarChart, CandlestickChart } from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { currentIntlLocale, currentTranslator } from '../i18n/client'
import {
  defaultSeed,
  defaultStartPrice,
  generateCandles,
  isTimeframe,
  marketEpoch,
  timeframeSeconds,
  type Candle,
  type Timeframe
} from '../lib/candles.ts'
import { labFields, changedCount, labPresets, overridesFrom, presetFields, type LabField } from '../lib/market-lab.ts'

echarts.use([
  CandlestickChart,
  BarChart,
  GridComponent,
  MarkLineComponent,
  MarkAreaComponent,
  TooltipComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  AriaComponent,
  CanvasRenderer
])

/** The most the page will draw at once, so a wide window cannot lock the tab up. */
const maxBars = 1500
/** How many bars the table shows, which is as many as fit without scrolling forever. */
const tableBars = 300

type LabRoot = HTMLElement & {
  dataset: DOMStringMap & { up?: string; seed?: string; startPrice?: string }
}

type LabState = {
  seed: string
  startPrice: number
  timeframe: Timeframe
  count: number
  future: number
  values: Map<string, number>
  chart: echarts.ECharts | null
  running: number | null
}

const fieldId = (field: LabField) => `${field.key}:${field.index ?? ''}`

/** The slider belonging to a field. Both halves of the name are needed, because a
 *  handful of knobs hold a list and each of their entries has its own slider. */
function findRange(panel: ParentNode, key: string, index: string): HTMLInputElement | null {
  for (const input of panel.querySelectorAll<HTMLInputElement>('[data-lab-range]')) {
    if (input.dataset.labRange === key && (input.dataset.labIndex ?? '') === index) return input
  }
  return null
}

/** One verdict from a self-check, and the sentence that explains it. */
type Check = { id: string; state: 'pass' | 'fail' | 'skipped'; detail: string }

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(currentIntlLocale(), { maximumFractionDigits }).format(value)
}

function formatTime(timeMs: number, timeframe: Timeframe): string {
  const days = timeframeSeconds[timeframe] >= 86400
  return new Intl.DateTimeFormat(currentIntlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(days ? {} : { hour: '2-digit', minute: '2-digit', hour12: false })
  }).format(new Date(timeMs))
}

/**
 * The window the reader asked for.
 *
 * `until` runs past the present on purpose: the market is a pure function of the
 * seed, so a bar dated tomorrow is not a guess, it is the value the chart will
 * draw tomorrow. The gap between the two is the whole reason this page exists.
 */
function windowFor(state: LabState, now: number) {
  const seconds = timeframeSeconds[state.timeframe]
  const last = now + state.future * seconds * 1000
  const count = Math.min(state.count + state.future, maxBars)
  return { until: last, count, seconds }
}

function readState(panel: LabRoot): LabState {
  const seedInput = panel.querySelector<HTMLInputElement>('[data-lab-seed]')
  const priceInput = panel.querySelector<HTMLInputElement>('[data-lab-start]')
  const timeframeInput = panel.querySelector<HTMLSelectElement>('[data-lab-timeframe]')
  const countInput = panel.querySelector<HTMLInputElement>('[data-lab-count]')
  const futureInput = panel.querySelector<HTMLInputElement>('[data-lab-future]')
  const values = new Map<string, number>()
  for (const field of labFields) {
    const input = findRange(panel, String(field.key), String(field.index ?? ''))
    if (!input) continue
    values.set(fieldId(field), Number(input.value))
  }
  const timeframe = timeframeInput?.value ?? '1h'
  return {
    seed: seedInput?.value.trim() || defaultSeed,
    startPrice: Math.max(Number(priceInput?.value) || defaultStartPrice, 1),
    timeframe: isTimeframe(timeframe) ? timeframe : '1h',
    count: clamp(Math.trunc(Number(countInput?.value) || 200), 2, maxBars),
    future: clamp(Math.trunc(Number(futureInput?.value) || 0), 0, maxBars),
    values,
    chart: null,
    running: null
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** What a difference between two prices is worth, as a percentage. */
function change(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100
}

/**
 * Everything the reader can check about a market, and every one of them is a
 * property the model claims rather than a number it reports. A check that cannot
 * run on the window that was asked for says so instead of quietly passing.
 */
function runChecks(
  state: LabState,
  bars: Candle[],
  request: { count: number; until: number },
  overrides: Record<string, unknown>
): Check[] {
  const t = currentTranslator()
  const hint = (id: string) => t(`lab.market.check${id}Hint` as never)
  const checks: Check[] = []
  const seconds = timeframeSeconds[state.timeframe]
  const untouched = Object.keys(overrides).length === 0

  // Open, high, low and close, in that order, for every bar on screen.
  const broken = bars.findIndex((bar) => bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close))
  checks.push({
    id: 'Ohlc',
    state: bars.length === 0 ? 'skipped' : broken < 0 ? 'pass' : 'fail',
    detail: broken < 0 ? hint('Ohlc') : `${hint('Ohlc')} · ${formatTime(bars[broken].time, state.timeframe)}`
  })

  // One day closes where the next opens, which is the one thing a 24x7 market
  // cannot do and a gap would break. Only daily bars can be asked.
  if (seconds >= 86400) {
    const gap = bars.findIndex((bar, index) => index > 0 && Math.abs(bar.open - bars[index - 1].close) > 0.011)
    checks.push({
      id: 'Bridge',
      state: gap < 0 ? 'pass' : 'fail',
      detail: gap < 0 ? hint('Bridge') : `${hint('Bridge')} · ${formatTime(bars[gap].time, state.timeframe)}`
    })
  } else {
    checks.push({ id: 'Bridge', state: 'skipped', detail: hint('Bridge') })
  }

  // A finer bar's extremes have to stay inside the bar that holds it. This is the
  // claim the whole "one path, many views" design rests on, so it is checked
  // against a parent window rather than the one on screen.
  const parent = parentFor(state.timeframe)
  if (parent && bars.length >= 2) {
    // One read of each window, used by both the containment check and the volume
    // check: asking the generator twice would only prove it is slow.
    const children = bars.slice(-Math.min(bars.length, 400))
    const parents = generateCandles({
      timeframe: parent,
      count: Math.ceil((children.length * seconds) / timeframeSeconds[parent]) + 2,
      until: request.until,
      seed: state.seed,
      startPrice: state.startPrice,
      params: overrides
    })
    const byTime = new Map(parents.map((bar) => [bar.time, bar]))
    let outside = 0
    for (const child of children) {
      const holder = byTime.get(parentStart(child.time, parent))
      if (!holder) continue
      // The seam the module documents: a minute candle resolves to ticks and its
      // parent does not, so the child is allowed to reach further than the parent
      // only when the pair crosses that line.
      if (crossesTickSeam(state.timeframe, parent)) continue
      if (child.high > holder.high || child.low < holder.low) outside += 1
    }
    checks.push({
      id: 'Contain',
      state: parents.length === 0 ? 'skipped' : outside === 0 ? 'pass' : 'fail',
      detail: outside === 0 ? hint('Contain') : `${hint('Contain')} · ${outside}`
    })
  } else {
    checks.push({ id: 'Contain', state: 'skipped', detail: hint('Contain') })
  }

  // The volume of the finer bars has to add up to the volume of the bar holding
  // them, because that is what makes a roll-up worth drawing.
  if (parent && bars.length >= 2) {
    const children = bars.slice(-Math.min(bars.length, 400))
    const parents = generateCandles({
      timeframe: parent,
      count: Math.ceil((children.length * seconds) / timeframeSeconds[parent]) + 2,
      until: request.until,
      seed: state.seed,
      startPrice: state.startPrice,
      params: overrides
    })
    const sums = new Map<number, number>()
    for (const bar of children) {
      const start = parentStart(bar.time, parent)
      sums.set(start, (sums.get(start) ?? 0) + bar.volume)
    }
    // Volume is rounded to the cent on every bar, so a parent that holds many
    // children carries a little rounding of its own. A tenth of a percent is as
    // tight as the arithmetic allows.
    const worst = Math.max(
      0,
      ...[...sums].map(([start, total]) => {
        const holder = parents.find((bar) => bar.time === start)
        if (!holder) return 0
        return holder.volume === 0 ? 0 : Math.abs(holder.volume - total) / holder.volume
      })
    )
    checks.push({
      id: 'Volume',
      state: sums.size === 0 ? 'skipped' : worst < 0.001 ? 'pass' : 'fail',
      detail: sums.size === 0 ? hint('Volume') : `${hint('Volume')} · ${(worst * 100).toFixed(3)}%`
    })
  } else {
    checks.push({ id: 'Volume', state: 'skipped', detail: hint('Volume') })
  }

  // The whole promise of a seeded market: ask twice, get the same answer.
  const again = generateCandles({
    timeframe: state.timeframe,
    count: Math.min(bars.length, 200),
    until: request.until,
    seed: state.seed,
    startPrice: state.startPrice,
    params: overrides
  })
  const same = JSON.stringify(again) === JSON.stringify(bars.slice(0, again.length))
  checks.push({ id: 'Deterministic', state: again.length < 2 ? 'skipped' : same ? 'pass' : 'fail', detail: hint('Deterministic') })

  // And the promise that matters to a reader: with nothing tuned, this is the
  // market the published page draws.
  if (untouched && state.seed === defaultSeed && state.startPrice === defaultStartPrice) {
    const published = generateCandles({
      timeframe: state.timeframe,
      count: bars.length,
      until: request.until,
      seed: state.seed,
      startPrice: state.startPrice
    })
    const equal = JSON.stringify(published) === JSON.stringify(bars)
    checks.push({ id: 'Published', state: equal ? 'pass' : 'fail', detail: hint('Published') })
  } else {
    checks.push({ id: 'Published', state: 'skipped', detail: hint('Published') })
  }

  return checks
}

/** The timeframe a bar of this length is a slice of, or nothing if it is the finest. */
function parentFor(timeframe: Timeframe): Timeframe | null {
  const seconds = timeframeSeconds[timeframe]
  if (seconds >= 604800) return null
  for (const candidate of ['1s', '1m', '5m', '1h', '1d', '1w'] as Timeframe[]) {
    if (timeframeSeconds[candidate] > seconds) return candidate
  }
  return null
}

const parentStart = (timeMs: number, parent: Timeframe) =>
  Math.floor((timeMs - marketEpoch) / (timeframeSeconds[parent] * 1000)) * timeframeSeconds[parent] * 1000 + marketEpoch

/**
 * Whether a pair of timeframes crosses the seam the module documents: a bar of a
 * minute or less is drawn from ticks and a longer one from the minute grid, so the
 * finer bar may reach outside the coarser one there and only there.
 */
function crossesTickSeam(child: Timeframe, parent: Timeframe): boolean {
  return timeframeSeconds[child] <= 60 && timeframeSeconds[parent] > 60
}

/** The numbers a reader wants to see about a window, computed from the bars themselves. */
function statsFor(bars: Candle[], timeframe: Timeframe, now: number) {
  const barsPerYear = (365 * 86400) / timeframeSeconds[timeframe]
  const returns: number[] = []
  let up = 0
  let drawdown = 0
  let rise = 0
  let peak = bars.length ? bars[0].high : 0
  let volume = 0
  let jumpDays = 0
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]
    volume += bar.volume
    if (bar.close > bar.open) up += 1
    // A day with a jump is one whose move is further from zero than a quiet day's
    // own volatility would explain, so the count is read off the same yardstick.
    if (timeframeSeconds[timeframe] >= 86400) {
      const move = Math.abs(Math.log(bar.close / bar.open))
      if (move > 0.06) jumpDays += 1
    }
    if (index === 0) continue
    const step = Math.log(bar.close / bars[index - 1].close)
    returns.push(step)
    if (bar.close > bars[index - 1].close) rise = Math.max(rise, change(bars[index - 1].close, bar.close))
    else drawdown = Math.min(drawdown, change(bars[index - 1].close, bar.close))
    peak = Math.max(peak, bar.high)
    drawdown = Math.min(drawdown, change(peak, bar.low))
  }
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
    : 0
  return {
    bars: bars.length,
    first: bars.length ? bars[0].time : now,
    last: bars.length ? bars[bars.length - 1].time : now,
    ret: bars.length ? change(bars[0].open, bars[bars.length - 1].close) : 0,
    vol: Math.sqrt(variance * barsPerYear) * 100,
    upRatio: bars.length ? (up / bars.length) * 100 : 0,
    drawdown,
    rise,
    avgVolume: bars.length ? volume / bars.length : 0,
    jumpDays,
    range: bars.length ? change(Math.min(...bars.map((bar) => bar.low)), Math.max(...bars.map((bar) => bar.high))) : 0
  }
}

function drawChart(state: LabState, bars: Candle[], now: number, up: string) {
  const t = currentTranslator()
  const plot = document.querySelector<HTMLElement>('[data-lab-plot]')
  if (!plot) return
  if (!state.chart || state.chart.isDisposed()) {
    state.chart = echarts.init(plot)
  }
  const rising = up === 'success'
  const last = bars.length ? bars[bars.length - 1].time : now
  const futureFrom = Math.floor((now - marketEpoch) / (timeframeSeconds[state.timeframe] * 1000)) *
    timeframeSeconds[state.timeframe] * 1000 + marketEpoch

  state.chart.setOption(
    {
      animation: false,
      backgroundColor: 'transparent',
      aria: { enabled: true },
      grid: [
        { left: 56, right: 18, top: 16, height: '58%' },
        { left: 56, right: 18, top: '74%', height: '16%' }
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        confine: true
      },
      xAxis: [
        { type: 'category', data: bars.map((bar) => formatTime(bar.time, state.timeframe)), gridIndex: 0, boundaryGap: true },
        { type: 'category', data: bars.map((bar) => formatTime(bar.time, state.timeframe)), gridIndex: 1, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, gridIndex: 0, splitLine: { lineStyle: { type: 'dashed' } } },
        { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { formatter: (value: number) => formatNumber(value, 0) } }
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
        { type: 'slider', xAxisIndex: [0, 1], bottom: 4, height: 18 }
      ],
      series: [
        {
          type: 'candlestick',
          name: t('lab.market.chartTitle'),
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
          itemStyle: {
            color: rising ? '#16a34a' : '#dc2626',
            color0: rising ? '#dc2626' : '#16a34a',
            borderColor: rising ? '#16a34a' : '#dc2626',
            borderColor0: rising ? '#dc2626' : '#16a34a'
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#888' },
            label: { show: true, formatter: t('lab.market.chartNote'), position: 'insideEndTop' },
            data: [{ xAxis: formatTime(futureFrom, state.timeframe) }]
          },
          markArea: last > futureFrom
            ? {
                silent: true,
                itemStyle: { color: 'rgba(127, 127, 127, 0.14)' },
                data: [[{ xAxis: formatTime(futureFrom, state.timeframe) }, { xAxis: formatTime(last, state.timeframe) }]]
              }
            : undefined
        },
        {
          type: 'bar',
          name: t('lab.market.unitVolume'),
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: bars.map((bar) => bar.volume)
        }
      ]
    },
    true
  )
  state.chart.resize()
}

function renderStats(panel: LabRoot, state: LabState, bars: Candle[], now: number) {
  const t = currentTranslator()
  const stats = statsFor(bars, state.timeframe, now)
  const target = panel.querySelector<HTMLElement>('[data-lab-stats]')
  const window_ = panel.querySelector<HTMLElement>('[data-lab-window]')
  if (window_) window_.textContent = bars.length ? `${formatTime(stats.first, state.timeframe)} → ${formatTime(stats.last, state.timeframe)}` : ''
  if (!target) return
  const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  const rows: [string, string][] = [
    [t('lab.market.statBars'), formatNumber(stats.bars, 0)],
    [t('lab.market.statReturn'), percent(stats.ret)],
    [t('lab.market.statAnnualVol'), `${stats.vol.toFixed(1)}%`],
    [t('lab.market.statUpRatio'), `${stats.upRatio.toFixed(1)}%`],
    [t('lab.market.statRange'), percent(stats.range)],
    [t('lab.market.statMaxRise'), percent(stats.rise)],
    [t('lab.market.statMaxDrop'), percent(stats.drawdown)],
    [t('lab.market.statAvgVolume'), formatNumber(stats.avgVolume, 2)],
    ...(timeframeSeconds[state.timeframe] >= 86400 ? [[t('lab.market.statJumpDays'), formatNumber(stats.jumpDays, 0)] as [string, string]] : [])
  ]
  target.innerHTML = rows
    .map(([label, value]) => `<div class="lab-stat"><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('')
}

function renderChecks(panel: LabRoot, checks: Check[]) {
  const t = currentTranslator()
  const target = panel.querySelector<HTMLElement>('[data-lab-checks]')
  if (!target) return
  const state = { pass: t('lab.market.pass'), fail: t('lab.market.fail'), skipped: t('lab.market.skipped') }
  target.innerHTML = checks
    .map(
      (check) =>
        `<li class="lab-check lab-check-${check.state}"><span class="lab-check-mark">${check.state === 'pass' ? '✓' : check.state === 'fail' ? '✕' : '–'}</span><span class="lab-check-body"><b>${t(`lab.market.check${check.id}` as never)}</b><small>${check.detail}</small></span><em>${state[check.state]}</em></li>`
    )
    .join('')
}

function renderTable(panel: LabRoot, state: LabState, bars: Candle[], now: number) {
  const t = currentTranslator()
  const body = panel.querySelector<HTMLElement>('[data-lab-table]')
  const hint = panel.querySelector<HTMLElement>('[data-lab-table-hint]')
  const shown = bars.slice(-tableBars)
  if (hint) hint.textContent = t('lab.market.tableLimit', { count: tableBars })
  if (!body) return
  const futureFrom = Math.floor((now - marketEpoch) / (timeframeSeconds[state.timeframe] * 1000)) *
    timeframeSeconds[state.timeframe] * 1000 + marketEpoch
  body.innerHTML = shown
    .map((bar, index) => {
      const previous = bars[bars.length - tableBars + index - 1]
      const step = previous ? change(previous.close, bar.close) : 0
      return `<tr${bar.time >= futureFrom ? ' class="lab-row-future"' : ''}><td>${formatTime(bar.time, state.timeframe)}</td><td>${formatNumber(bar.open)}</td><td>${formatNumber(bar.high)}</td><td>${formatNumber(bar.low)}</td><td>${formatNumber(bar.close)}</td><td class="${step >= 0 ? 'lab-up' : 'lab-down'}">${step >= 0 ? '+' : ''}${step.toFixed(2)}%</td><td>${formatNumber(bar.volume)}</td></tr>`
    })
    .join('')
}

function renderChanged(panel: LabRoot, state: LabState) {
  const t = currentTranslator()
  const target = panel.querySelector<HTMLElement>('[data-lab-changed]')
  if (!target) return
  const changed = changedCount(
    labFields.map((field) => ({ field, value: state.values.get(fieldId(field)) ?? field.fallback }))
  )
  target.textContent = changed === 0 ? t('lab.market.untouched') : t('lab.market.changed', { count: changed })
  target.classList.toggle('is-dirty', changed > 0)
}

function announce(panel: LabRoot, message: string) {
  const t = currentTranslator()
  const hint = panel.querySelector<HTMLElement>('[data-lab-chart-note]')
  if (hint) hint.textContent = message || t('lab.market.chartNote')
}

function update(panel: LabRoot, state: LabState) {
  const t = currentTranslator()
  const now = Date.now()
  const request = windowFor(state, now)
  if (request.count < 2) {
    announce(panel, t('lab.market.noBars'))
    renderStats(panel, state, [], now)
    renderChecks(panel, [])
    renderTable(panel, state, [], now)
    return
  }
  if (state.count + state.future > maxBars) announce(panel, t('lab.market.tooMany', { count: maxBars }))
  const fields = labFields.map((field) => ({ field, value: state.values.get(fieldId(field)) ?? field.fallback }))
  const overrides = overridesFrom(fields) as Record<string, unknown>

  const bars = generateCandles({
    timeframe: state.timeframe,
    count: request.count,
    until: request.until,
    seed: state.seed,
    startPrice: state.startPrice,
    params: overrides
  })

  if (state.future === 0) announce(panel, t('lab.market.chartNote'))
  drawChart(state, bars, now, panel.dataset.up ?? 'success')
  renderStats(panel, state, bars, now)
  renderChecks(panel, runChecks(state, bars, request, overrides))
  renderTable(panel, state, bars, now)
  renderChanged(panel, state)
}

/** Debounced so dragging a slider redraws once the drag pauses, not once per pixel. */
function schedule(panel: LabRoot, state: LabState) {
  if (state.running !== null) clearTimeout(state.running)
  state.running = window.setTimeout(() => {
    state.running = null
    update(panel, state)
  }, 120)
}

function syncInputs(panel: LabRoot, key: string, index: string, value: number) {
  const scope = index === '' ? '' : `[data-lab-index="${index}"]`
  const range = panel.querySelector<HTMLInputElement>(`[data-lab-range="${key}"]${scope}`)
  const number = panel.querySelector<HTMLInputElement>(`#lab-${key}${index === '' ? '' : index}`)
  if (range && Number(range.value) !== value) range.value = String(value)
  if (number && Number(number.value) !== value) number.value = String(value)
}

function initMarketLab(scope: ParentNode = document) {
  for (const panel of scope.querySelectorAll<HTMLElement>('[data-market-lab-panel]')) {
    if (panel.dataset.ready === 'true') continue
    panel.dataset.ready = 'true'
    const state = readState(panel as LabRoot)

    for (const input of panel.querySelectorAll<HTMLInputElement>('[data-lab-range]')) {
      input.addEventListener('input', () => {
        const key = input.dataset.labRange ?? ''
        const index = input.dataset.labIndex ?? ''
        const value = Number(input.value)
        state.values.set(`${key}:${index}`, value)
        syncInputs(panel as LabRoot, key, index, value)
        schedule(panel as LabRoot, state)
      })
    }
    for (const input of panel.querySelectorAll<HTMLInputElement>('.lab-slider-number')) {
      input.addEventListener('change', () => {
        const holder = input.closest<HTMLElement>('[data-lab-field]')
        if (!holder) return
        const key = holder.dataset.labField ?? ''
        const index = holder.dataset.labIndex ?? ''
        const value = Number(input.value)
        if (!Number.isFinite(value)) return
        state.values.set(`${key}:${index}`, value)
        syncInputs(panel as LabRoot, key, index, value)
        schedule(panel as LabRoot, state)
      })
    }
    for (const input of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-lab-seed], [data-lab-start], [data-lab-timeframe], [data-lab-count], [data-lab-future]'
    )) {
      input.addEventListener('change', () => {
        const fresh = readState(panel as LabRoot)
        fresh.chart = state.chart
        fresh.running = state.running
        Object.assign(state, fresh)
        schedule(panel as LabRoot, state)
      })
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-lab-preset]')) {
      button.addEventListener('click', () => {
        const preset = labPresets.find((candidate) => candidate.id === button.dataset.labPreset)
        if (!preset) return
        for (const { field, value } of presetFields(preset)) {
          state.values.set(fieldId(field), value)
          syncInputs(panel as LabRoot, String(field.key), String(field.index ?? ''), value)
        }
        for (const other of panel.querySelectorAll<HTMLButtonElement>('[data-lab-preset]')) {
          other.setAttribute('aria-pressed', String(other === button))
        }
        schedule(panel as LabRoot, state)
      })
    }
    for (const button of panel.querySelectorAll<HTMLElement>('[data-lab-group-reset]')) {
      const reset = () => {
        const group = button.dataset.labGroupReset ?? ''
        for (const field of labFields) {
          if (field.group !== group) continue
          state.values.set(fieldId(field), field.fallback)
          syncInputs(panel as LabRoot, String(field.key), String(field.index ?? ''), field.fallback)
        }
        for (const other of panel.querySelectorAll<HTMLButtonElement>('[data-lab-preset]')) {
          other.setAttribute('aria-pressed', String(other.dataset.labPreset === 'published'))
        }
        schedule(panel as LabRoot, state)
      }
      button.addEventListener('click', reset)
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') reset()
      })
    }
    const resetAll = panel.querySelector<HTMLElement>('[data-lab-reset]')
    resetAll?.addEventListener('click', () => {
      for (const field of labFields) {
        state.values.set(fieldId(field), field.fallback)
        syncInputs(panel as LabRoot, String(field.key), String(field.index ?? ''), field.fallback)
      }
      for (const other of panel.querySelectorAll<HTMLButtonElement>('[data-lab-preset]')) {
        other.setAttribute('aria-pressed', String(other.dataset.labPreset === 'published'))
      }
      schedule(panel as LabRoot, state)
    })
    const copy = panel.querySelector<HTMLButtonElement>('[data-lab-copy]')
    copy?.addEventListener('click', () => {
      const now = Date.now()
      const request = windowFor(state, now)
      const fields = labFields.map((field) => ({ field, value: state.values.get(fieldId(field)) ?? field.fallback }))
      const bars = generateCandles({
        timeframe: state.timeframe,
        count: request.count,
        until: request.until,
        seed: state.seed,
        startPrice: state.startPrice,
        params: overridesFrom(fields)
      })
      const payload = JSON.stringify({ seed: state.seed, timeframe: state.timeframe, params: overridesFrom(fields), candles: bars }, null, 2)
      void navigator.clipboard?.writeText(payload)
      announce(panel, currentTranslator()('lab.market.copiedJson', { count: bars.length }))
    })
    window.addEventListener('resize', () => state.chart?.resize())

    update(panel as LabRoot, state)
  }
}

document.addEventListener('astro:page-load', () => initMarketLab())
initMarketLab()
