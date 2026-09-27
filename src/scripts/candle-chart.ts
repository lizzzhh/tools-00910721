import * as echarts from 'echarts/core'
import { BarChart, CandlestickChart, type BarSeriesOption, type CandlestickSeriesOption } from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  type AriaComponentOption,
  type AxisPointerComponentOption,
  type DataZoomComponentOption,
  type GridComponentOption,
  type MarkLineComponentOption,
  type MarkPointComponentOption,
  type TooltipComponentOption
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import { candleIndexAt, generateCandles, timeframeSeconds, type Candle, type Timeframe } from '../lib/candles'
import { readValue, whenStorageReady, writeValue } from '../lib/storage'
import { marketKeys } from '../lib/storage-schema'
import { priceUnit, tradedAsset } from '../lib/units.ts'
import { currentIntlLocale } from '../i18n/client'

echarts.use([
  CandlestickChart,
  BarChart,
  GridComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  AriaComponent,
  CanvasRenderer
])

/** Only what a price chart needs: candles, volume bars, two grids, a zoom and a crosshair. */
type CandleOption = ComposeOption<
  | CandlestickSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | MarkLineComponentOption
  | MarkPointComponentOption
  | TooltipComponentOption
  | AxisPointerComponentOption
  | DataZoomComponentOption
  | AriaComponentOption
>

/** The part of the window the reader is looking at, as percentages of it. */
type Zoom = { start: number; end: number }

/**
 * The prices worth seeing on the axis: where the market is now, and where each open
 * position would be closed out. Drawn as lines rather than left to the tooltip
 * because a position is a commitment — the entry and the liquidation price are
 * thresholds the reader watches, not numbers they go looking for.
 */
/**
 * One horizontal threshold on the chart.
 *
 * The label is deliberately short — a two or three letter mark rather than a word —
 * because they sit in a chip on the chart itself, where a word would cover the
 * bars the line is there to explain.
 */
export type ChartLevel = {
  value: number
  label: string
  kind: 'entry' | 'liquidation' | 'open' | 'stopLoss' | 'takeProfit'
}

/**
 * A fill the reader made, placed on the bar it happened in. A record of trades is
 * no use to anyone who has to find a moment in it by eye, so every fill gets a
 * triangle under or over the bar: buys below, sells above, the way a reader
 * expects, and never on top of the candle body it belongs to.
 */
export type ChartMark = { at: number; side: 'buy' | 'sell'; purpose: 'open' | 'close' | 'liquidation' }
export type ChartLevels = { price: number; levels: ChartLevel[]; marks: ChartMark[] }

type CandleRoot = HTMLElement & {
  dataset: DOMStringMap & { timeframe?: string; up?: string; count?: string }
}

type CandleMount = {
  chart: echarts.ECharts | undefined
  timeframe: Timeframe
  /** The window on screen. It slides rather than being rebuilt, so a tick costs
   * one bar instead of the whole history. */
  bars: Candle[]
  lastIndex: number
  tick: number | undefined
  resize: ResizeObserver
  theme: MutationObserver
  /** Where the account is, redrawn on every data update so it cannot be lost. */
  levels: ChartLevels
  /** Set when the reader is looking at a past moment instead of the live market. */
  until: number | undefined
}

/** How many bars the chart asks for at each timeframe. */
const barCounts: Record<Timeframe, number> = {
  '1s': 240,
  '5s': 240,
  '10s': 240,
  '15s': 240,
  '30s': 240,
  '1m': 240,
  '3m': 240,
  '5m': 240,
  '15m': 240,
  '30m': 240,
  '1h': 240,
  '2h': 240,
  '4h': 240,
  '6h': 240,
  '8h': 240,
  '12h': 240,
  '1d': 200,
  '1w': 150
}

/** How many bars fit on screen at a comfortable zoom. */
const visibleBars = 110

/**
 * How often the window is checked. A second is quick enough for the one second
 * candles and costs nothing at the other end, because a tick that finds no new
 * bar returns before generating anything.
 */
const tickMs = 1000

const mounts = new WeakMap<HTMLElement, CandleMount>()
const roots = new Set<HTMLElement>()

/** A second bar carries no date, so the label has to say which one it is. */
function labelFor(timeMs: number, timeframe: Timeframe, locale: string): string {
  const seconds = timeframeSeconds[timeframe]
  const date = new Date(timeMs)
  if (seconds >= 86_400) {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC'
    }).format(date)
  }
  if (seconds >= 60) {
    return new Intl.DateTimeFormat(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    }).format(date)
  }
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(date)
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** A token with somewhere to land if the theme has not defined it. */
function tokenOr(name: string, fallback: string): string {
  return token(name) || fallback
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, options)
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/**
 * The strip along the bottom that the zoom bar lives in, as a distance from the
 * foot of the canvas. The volume grid stops above it, which is what keeps the
 * drag handle from sitting on top of the bars it is meant to be dragging.
 */
const zoomBar = 34

/** The default window: the most recent stretch, ending at the newest bar. */
function defaultZoom(count: number): Zoom {
  return { start: 100 - (Math.min(count, visibleBars) / Math.max(count, 1)) * 100, end: 100 }
}

/**
 * What the reader has zoomed to, which is theirs to keep: an update must not
 * quietly put the view back where it started.
 */
function currentZoom(chart: echarts.ECharts | undefined, count: number): Zoom {
  const option = chart?.getOption() as { dataZoom?: { start?: number; end?: number }[] } | undefined
  const first = option?.dataZoom?.[0]
  if (!first || typeof first.start !== 'number' || typeof first.end !== 'number') return defaultZoom(count)
  return { start: first.start, end: first.end }
}

/**
 * The chart without any data in it. Everything that describes how the plot looks
 * lives here, and it is only sent when something about the look changes, so a
 * price tick cannot disturb a zoom or a drag.
 */
/**
 * The strip the x axis labels keep on the left.
 *
 * There is no second margin for the level labels. One was kept for them, and it
 * left a band of empty canvas down the left of every chart — a wide hole for three
 * letters, in a panel that is already narrow. The labels are anchored just inside
 * the plot instead, so they sit over the oldest bars rather than beside nothing.
 */
const leftMargin = 6

/**
 * Which token means a gain on this chart. The panel can be set either way round,
 * and every colour on the chart resolves through here, or the number in the corner
 * ends up contradicting the bars sitting beside it.
 */
function upDownFor(root: CandleRoot): { up: string; down: string } {
  const upIsSuccess = root.dataset.up === 'success'
  return {
    up: token(upIsSuccess ? '--success' : '--danger'),
    down: token(upIsSuccess ? '--danger' : '--success')
  }
}

function buildShell(root: CandleRoot, zoom: Zoom, priceMargin: number): CandleOption {
  const { up, down } = upDownFor(root)
  // `--content-text` is never defined by the theme, so it came back empty and the
  // chart fell back to ECharts' own dark grey for its axis pointer, tooltip and
  // price readout. `--deep-text` is defined in both themes.
  const text = tokenOr('--deep-text', '#1f2430')
  const meta = token('--content-meta')
  const divider = token('--line-divider')
  const line = token('--line-color')
  const mono = token('--font-mono')
  const axisLabel = { color: meta, fontFamily: mono, fontSize: 10 }
  const price = numberFormat(currentIntlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const compact = numberFormat(currentIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 })

  return {
    animation: !prefersReducedMotion(),
    backgroundColor: 'transparent',
    textStyle: { color: text, fontFamily: mono },
    aria: { enabled: true },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      label: { backgroundColor: line, color: text, fontFamily: mono, fontSize: 10 }
    },
    tooltip: {
      trigger: 'axis',
      // Confined to the plot, so following the cursor to the last candle cannot
      // drag a floating box out over the text underneath.
      confine: true,
      axisPointer: { type: 'cross', crossStyle: { color: meta }, lineStyle: { color: meta } },
      backgroundColor: token('--float-panel-bg'),
      borderColor: line,
      textStyle: { color: text, fontFamily: mono, fontSize: 11 }
    },
    // Price on top, volume underneath, sharing one time axis. The bottom of the
    // plot is left empty on purpose: that strip belongs to the zoom bar, and
    // percentage heights cannot know how tall that bar will be, so the grids are
    // given a floor in pixels instead and never reach down into it.
    grid: [
      { left: leftMargin, right: priceMargin, top: 8, bottom: '36%', containLabel: false },
      { left: leftMargin, right: priceMargin, top: '72%', bottom: zoomBar, containLabel: false }
    ],
    xAxis: [
      { type: 'category', gridIndex: 0, boundaryGap: true, axisLine: { lineStyle: { color: divider } }, axisTick: { show: false }, axisLabel: { ...axisLabel, hideOverlap: true }, splitLine: { show: false } },
      // The second axis exists only so the volume bars have a floor to stand on.
      { type: 'category', gridIndex: 1, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } }
    ],
    yAxis: [
      {
        scale: true,
        gridIndex: 0,
        position: 'right',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, formatter: (value: number) => price.format(value) },
        splitLine: { lineStyle: { color: divider, type: 'dashed' } }
      },
      {
        scale: true,
        gridIndex: 1,
        position: 'right',
        splitNumber: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, formatter: (value: number) => compact.format(value) },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: zoom.start, end: zoom.end },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        // Aligned with the plots above it rather than the full canvas, so the
        // handles do not wander under the price axis.
        left: 8,
        right: priceMargin,
        bottom: 6,
        height: 20,
        start: zoom.start,
        end: zoom.end,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        // ECharts hands this to the canvas, which knows nothing about color-mix.
        fillerColor: token('--btn-regular-bg'),
        handleStyle: { color: line, borderColor: line },
        moveHandleStyle: { color: line },
        dataBackground: { lineStyle: { color: divider }, areaStyle: { color: divider } },
        selectedDataBackground: { lineStyle: { color: line }, areaStyle: { color: line } },
        textStyle: { color: meta, fontFamily: mono, fontSize: 9 }
      }
    ],
    series: [
      {
        name: 'price',
        type: 'candlestick',
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down, borderWidth: 1 }
      },
      {
        name: 'volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        large: true,
        // A flat opacity keeps the volume a backdrop to the candles.
        itemStyle: { opacity: 0.4 }
      }
    ]
  }
}

/**
 * The lines the account asked for: the live price across the plot, a vertical
 * marker at the newest bar so the eye always knows where now is, and one line per
 * open position for its entry and the price that would close it out.
 *
 * The liquidation line is the one that matters, so it is the loudest of the three.
 */
function buildLevels(bars: Candle[], levels: ChartLevels): MarkLineComponentOption {
  const up = token('--success')
  const down = token('--danger')
  const meta = token('--content-meta')
  // The price line takes its colour from the text token for the same reason the
  // shell does: an empty colour string draws no line at all.
  const text = tokenOr('--deep-text', '#1f2430')
  const warn = tokenOr('--warning', '#e2a03f')
  const accent = tokenOr('--accent', '#3b6fd4')
  const last = bars[bars.length - 1]
  const data: Record<string, unknown>[] = []

  if (levels.price > 0 && last && bars.length > 0) {
    data.push({
      yAxis: levels.price,
      lineStyle: { color: text, width: 1, type: 'solid', opacity: 0.9 },
      label: {
        show: true,
        // Past the end of the line, in the margin the y axis already keeps clear.
        // Inside the plot it sat on top of the newest candles, which is the one
        // place on a price chart a reader most needs to see through.
        position: 'end',
        distance: 5,
        verticalAlign: 'middle',
        formatter: () => numberFormat(currentIntlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(levels.price),
        // The chip is the text colour, so the writing on it has to be the card
        // behind the chart instead: a light chip needs dark writing on it.
        color: tokenOr('--card-bg', '#fff'),
        backgroundColor: text,
        padding: [2, 4],
        fontSize: 9
      }
    })
    // The vertical edge of the market, which is where the last trade happened.
    data.push({
      xAxis: bars.length - 1,
      lineStyle: { color: meta, width: 1, type: 'dashed', opacity: 0.8 },
      label: { show: false }
    })
  }

  for (const level of levels.levels) {
    if (!Number.isFinite(level.value)) continue
    const danger = level.kind === 'liquidation'
    // A stop and a target are the two prices the reader chose, so they take the
    // accent rather than a gain-or-loss colour: which of them is up and which is
    // down depends on the side, and the label already says which is which.
    const chosen = level.kind === 'stopLoss' || level.kind === 'takeProfit'
    const colour = chosen ? accent : danger ? warn : level.kind === 'open' ? up : down
    data.push({
      yAxis: level.value,
      lineStyle: {
        color: colour,
        width: 1,
        // Solid for the levels the reader set, dashed for the one the market set.
        // They are told apart by weight rather than by colour, which is the cue
        // that survives both a monochrome print and a colour-blind reader.
        type: chosen ? 'solid' : danger ? 'dashed' : 'dotted',
        opacity: danger ? 0.95 : 0.7
      },
      label: {
        show: true,
        // Inside the left edge of the plot rather than beside it. The right margin
        // belongs to the price axis, and the oldest bars are the ones a reader is
        // least likely to be reading, so the chip overlaps them and nothing else.
        position: 'start',
        distance: 2,
        align: 'left',
        verticalAlign: 'middle',
        formatter: `${level.label} ${numberFormat(currentIntlLocale(), { maximumFractionDigits: 2 }).format(level.value)}`,
        color: colour,
        // A chip of its own, so a threshold stays readable where it crosses the
        // candles instead of being lost among them.
        backgroundColor: tokenOr('--card-bg', '#fff'),
        padding: [1, 3],
        fontSize: 9
      }
    })
  }

  return { symbol: 'none', silent: true, animation: false, data }
}

/**
 * Puts a triangle on every fill inside the window. The x axis is a category of bar
 * labels, so a fill is placed by arithmetic on the window's own spacing rather than
 * by searching for a label that may be scrolled off, and a fill that falls outside
 * the window is dropped instead of pinned to an edge.
 */
function buildMarks(bars: Candle[], timeframe: Timeframe, marks: ChartMark[]): MarkPointComponentOption {
  const up = token('--success')
  const down = token('--danger')
  const span = timeframeMs(timeframe)
  const origin = bars[0]?.time ?? 0
  const data: NonNullable<MarkPointComponentOption['data']> = []

  for (const mark of marks) {
    const index = Math.floor((mark.at - origin) / span)
    const bar = bars[index]
    if (!bar || mark.at < bar.time || mark.at >= bar.time + span) continue
    const buying = mark.side === 'buy'
    data.push({
      name: `${buying ? 'buy' : 'sell'} ${mark.purpose}`,
      coord: [index, buying ? bar.low : bar.high],
      symbol: 'triangle',
      symbolRotate: buying ? 0 : 180,
      symbolSize: 8,
      // Clear of the wick, so the shape never sits on the bar it is marking.
      symbolOffset: [0, buying ? 11 : -11],
      itemStyle: { color: buying ? up : down, borderWidth: 0 },
      label: { show: false }
    })
  }

  return { data, silent: true, animation: false, tooltip: { show: false } }
}

/**
 * The moving part: which bars are on screen, how they are labelled and what the
 * crosshair reads. A tooltip has to be rebuilt with the data, because the
 * formatter it was given last time closed over the prices of that time.
 */
function buildData(root: CandleRoot, bars: Candle[], timeframe: Timeframe, levels: ChartLevels): CandleOption {
  const locale = currentIntlLocale()
  const { up, down } = upDownFor(root)
  const price = numberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const compact = numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
  const signed = numberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always'
  })
  const labels = bars.map((bar) => labelFor(bar.time, timeframe, locale))

  return {
    tooltip: {
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params]
        const first = items[0] as { dataIndex?: number } | undefined
        if (!first || typeof first.dataIndex !== 'number') return ''
        const bar = bars[first.dataIndex]
        if (!bar) return ''
        const change = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0
        const colour = bar.close >= bar.open ? up : down
        return [
          `<b>${labels[first.dataIndex]}</b>`,
          `O ${price.format(bar.open)}&nbsp;&nbsp;H ${price.format(bar.high)}`,
          `L ${price.format(bar.low)}&nbsp;&nbsp;C ${price.format(bar.close)}`,
          `<span style="color:${colour}">${signed.format(change)}%</span>`,
          `Vol ${compact.format(bar.volume)} ${tradedAsset}`
        ].join('<br/>')
      }
    },
    xAxis: [{ data: labels }, { data: labels }],
    series: [
      {
        // ECharts reads a candle as open, close, low, high, which is not the
        // order the bars are stored in.
        data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
        markLine: buildLevels(bars, levels),
        markPoint: buildMarks(bars, timeframe, levels.marks)
      },
      {
        data: bars.map((bar) => ({
          value: bar.volume,
          itemStyle: { color: bar.close >= bar.open ? up : down, opacity: 0.4 }
        }))
      }
    ]
  }
}

/** The seed is on the element so a page can hand out its own market. */
function seedFor(root: CandleRoot): string {
  return root.dataset.seed || 'code-space:market/v1'
}

function chartIn(mount: CandleMount, plot: HTMLElement): echarts.ECharts {
  if (!mount.chart) mount.chart = echarts.init(plot, undefined, { renderer: 'canvas' })
  return mount.chart
}

/** A hidden element has no box, and ECharts draws nothing on a zero sized canvas. */
function ready(plot: HTMLElement): boolean {
  plot.hidden = false
  return plot.clientWidth > 0
}

/**
 * Sends the data on its own, which is what a tick wants. The zoom is left out
 * unless the window actually moved, so a reader who has dragged or zoomed keeps
 * exactly the view they had.
 */
function paintData(chart: echarts.ECharts, root: CandleRoot, mount: CandleMount, moved: boolean) {
  chart.setOption(buildData(root, mount.bars, mount.timeframe, mount.levels))
  if (!moved) return
  // One bar left the window and one arrived, so the same stretch of market stays
  // under the reader's eyes instead of the view snapping back to the newest bar.
  const step = 100 / Math.max(mount.bars.length, 1)
  const zoom = currentZoom(chart, mount.bars.length)
  const start = clamp(zoom.start + step, 0, 100)
  const end = clamp(zoom.end + step, 0, 100)
  chart.setOption({ dataZoom: [{ start, end }, { start, end }] })
}

/**
 * Room for the widest price label, measured rather than guessed. A market quoted
 * in the tens of thousands needs more digits than one quoted in the hundreds, and
 * a fixed margin either clips the price or wastes the plot.
 */
function priceMarginFor(bars: Candle[]): number {
  const prices = bars.flatMap((bar) => [bar.high, bar.low])
  if (prices.length === 0) return 58
  const format = numberFormat(currentIntlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const widest = Math.max(
    ...prices.map((price) => format.format(price).length),
    // Enough for the axis to say something even before there is any data.
    6,
  )
  return Math.ceil(widest * 6.2) + 12
}

/** Rebuilds the whole chart, keeping the reader's window. */
function paintAll(root: CandleRoot, plot: HTMLElement, mount: CandleMount) {
  if (!ready(plot)) return
  const chart = chartIn(mount, plot)
  chart.resize()
  const zoom = currentZoom(mount.chart, mount.bars.length)
  chart.setOption(buildShell(root, zoom, priceMarginFor(mount.bars)), {
    notMerge: true
  })
  chart.setOption(buildData(root, mount.bars, mount.timeframe, mount.levels))
}

function mountFor(root: CandleRoot, plot: HTMLElement, timeframe: Timeframe): CandleMount {
  const existing = mounts.get(root)
  if (existing) {
    existing.timeframe = timeframe
    return existing
  }
  const mount: CandleMount = {
    timeframe,
    chart: undefined,
    bars: [],
    lastIndex: Number.NEGATIVE_INFINITY,
    tick: undefined,
    // A resize only changes the size of the canvas, so it never needs the option
    // sent again, and so never risks moving a zoom the reader set.
    resize: new ResizeObserver(() => mount.chart?.resize()),
    theme: new MutationObserver(() => paintAll(root, plot, mount)),
    levels: { price: 0, levels: [], marks: [] },
    until: undefined
  }
  mount.resize.observe(plot)
  mount.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  mounts.set(root, mount)
  roots.add(root)
  return mount
}

/** Refills the window from scratch, which is what switching timeframe does. */
function reload(root: CandleRoot, mount: CandleMount) {
  const count = barCounts[mount.timeframe]
  mount.bars = generateCandles({
    timeframe: mount.timeframe,
    count,
    seed: seedFor(root),
    ...(mount.until === undefined ? {} : { until: mount.until })
  })
  mount.lastIndex = candleIndexAt(mount.until ?? Date.now(), mount.timeframe)
}

/**
 * Publishes the current price on the element itself, so the account can follow the
 * market without the chart having to know that accounts exist.
 */
function publishPrice(root: CandleRoot, mount: CandleMount) {
  const last = mount.bars[mount.bars.length - 1]
  if (!last) return
  mount.levels = { ...mount.levels, price: last.close }
  root.dispatchEvent(
    new CustomEvent('candle:price', {
      bubbles: true,
      detail: { price: last.close, at: last.time + timeframeMs(mount.timeframe), live: mount.until === undefined }
    })
  )
}

function updateReadout(root: CandleRoot, mount: CandleMount) {
  const readout = root.querySelector<HTMLElement>('[data-candle-price]')
  const last = mount.bars[mount.bars.length - 1]
  const first = mount.bars[0]
  if (!readout || !last || !first) return
  const locale = currentIntlLocale()
  // A price on its own is an incomplete price: this one is dollars per TMZB, and
  // the unit is written next to it rather than left for the reader to assume.
  const price = numberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const signed = numberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always'
  })
  const change = ((last.close - first.open) / first.open) * 100
  const { up, down } = upDownFor(root)
  readout.textContent = `${price.format(last.close)} ${priceUnit}  ${signed.format(change)}%`
  // Through the same resolver as the candles, so a reader who has set red for a
  // gain does not get a green number beside red bars for the very same move.
  readout.style.color = change >= 0 ? up : down
  publishPrice(root, mount)
}

const timeframeMs = (timeframe: Timeframe): number => timeframeSeconds[timeframe] * 1000

/**
 * Moves the window on by however many bars have closed, and re-reads the bar that
 * is still forming. The market is fixed by its seed, so a bar does not change once
 * it exists; what changes is which bar is the newest one, and how much of it has
 * happened. Generating only the new bars keeps a tick cheap: a daily chart costs
 * nothing for a whole day, and a one second chart one bar a second.
 */
function tick(root: CandleRoot, plot: HTMLElement, mount: CandleMount) {
  if (document.hidden) return
  const index = candleIndexAt(Date.now(), mount.timeframe)
  const count = barCounts[mount.timeframe]
  const wasFull = mount.bars.length >= count
  let moved = false

  if (index === mount.lastIndex) {
    // The bar in hand is still forming, so only its open end is redrawn.
    const forming = generateCandles({ timeframe: mount.timeframe, count: 1, seed: seedFor(root), live: true })
    if (forming.length === 0) return
    if (mount.bars.length > 0) mount.bars[mount.bars.length - 1] = forming[0]
    else mount.bars = forming
  } else if (index > mount.lastIndex) {
    const fresh = generateCandles({
      timeframe: mount.timeframe,
      count: Math.min(index - mount.lastIndex, count),
      seed: seedFor(root),
      live: true
    })
    if (fresh.length === 0) return
    mount.bars = mount.bars.concat(fresh).slice(-count)
    mount.lastIndex = index
    moved = wasFull
  } else {
    // The clock went backwards, so the window is rebuilt from the seed.
    reload(root, mount)
    moved = true
  }

  if (!ready(plot)) return
  // A window sitting on a past moment does not move, so it is only redrawn when
  // the reader is watching the market itself.
  if (mount.until !== undefined && !moved) return
  paintData(chartIn(mount, plot), root, mount, moved)
  updateReadout(root, mount)
}

function render(root: CandleRoot, timeframe: Timeframe) {
  const plot = root.querySelector<HTMLElement>('[data-candle-plot]')
  if (!plot) return
  const mount = mountFor(root, plot, timeframe)
  reload(root, mount)
  paintAll(root, plot, mount)
  updateReadout(root, mount)
  if (mount.tick !== undefined) window.clearInterval(mount.tick)
  mount.tick = window.setInterval(() => tick(root, plot, mount), tickMs)
}

/**
 * Looks at a past moment instead of the live market, which is how a trade in the
 * record is reproduced: the same seed, the same window, stopped where it happened.
 */
function focusAt(root: CandleRoot, at: number) {
  const plot = root.querySelector<HTMLElement>('[data-candle-plot]')
  if (!plot) return
  const mount = mounts.get(root)
  if (!mount) return
  mount.until = at
  reload(root, mount)
  paintAll(root, plot, mount)
  updateReadout(root, mount)
  root.dataset.candleMode = 'history'
}

function goLive(root: CandleRoot) {
  const plot = root.querySelector<HTMLElement>('[data-candle-plot]')
  if (!plot) return
  const mount = mounts.get(root)
  if (!mount) return
  mount.until = undefined
  reload(root, mount)
  paintAll(root, plot, mount)
  updateReadout(root, mount)
  delete root.dataset.candleMode
}

/** Reads the requested timeframe off the markup and switches to it on demand. */
export function initCandleCharts(scope: ParentNode = document) {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-candle-chart]')) {
    const element = root as CandleRoot
    const timeframe = (element.dataset.timeframe || '1d') as Timeframe
    if (!(timeframe in timeframeSeconds)) continue
    // The period is a setting and is remembered; where in the chart the reader is
    // looking is not, because that is a place they left rather than a choice they
    // made. So the remembered period is read once the table is ready, and a chart
    // that has not been chosen yet is drawn at the page's own default meanwhile.
    whenStorageReady(() => {
      const remembered = readValue(marketKeys.timeframe)
      if (!remembered || remembered === element.dataset.timeframe) return
      if (!(remembered in timeframeSeconds)) return
      element.dataset.timeframe = remembered
      for (const button of element.querySelectorAll('[data-candle-timeframe]')) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-candle-timeframe') === remembered))
      }
      render(element, remembered as Timeframe)
    })
    render(element, timeframe)

    // The account asks for the levels to be drawn, and for a moment to be shown.
    // The account panel lets the reader choose which colour means a gain, and the
    // candles take the same one, or the two would disagree about the same move.
    element.addEventListener('candle:up', (event) => {
      const next = (event as CustomEvent<{ up?: string }>).detail?.up
      if (next !== 'success' && next !== 'danger') return
      element.dataset.up = next
      const mount = mounts.get(element)
      const plot = element.querySelector<HTMLElement>('[data-candle-plot]')
      if (mount && plot) paintAll(element, plot, mount)
    })
    element.addEventListener('candle:levels', (event) => {
      const detail = (event as CustomEvent<ChartLevels>).detail
      const mount = mounts.get(element)
      if (!mount || !detail) return
      mount.levels = { ...detail, marks: detail.marks ?? [] }
      const plot = element.querySelector<HTMLElement>('[data-candle-plot]')
      if (plot && mount.chart) paintData(mount.chart, element, mount, false)
    })
    element.addEventListener('candle:focus', (event) => {
      const detail = (event as CustomEvent<{ at: number }>).detail
      if (detail) focusAt(element, detail.at)
    })
    element.addEventListener('candle:live', () => goLive(element))

    for (const button of element.querySelectorAll<HTMLButtonElement>('[data-candle-timeframe]')) {
      button.addEventListener('click', () => {
        const requested = button.dataset.candleTimeframe as Timeframe
        if (!(requested in timeframeSeconds)) return
        for (const other of element.querySelectorAll('[data-candle-timeframe]')) {
          other.setAttribute('aria-pressed', String(other === button))
        }
        element.dataset.timeframe = requested
        writeValue(marketKeys.timeframe, requested)
        render(element, requested)
      })
    }
  }
}

initCandleCharts()

document.addEventListener('astro:page-load', () => initCandleCharts())

/** zrender keeps window level handlers, so a chart that is about to be swapped out is disposed. */
document.addEventListener('astro:before-swap', () => {
  for (const root of roots) {
    const mount = mounts.get(root)
    if (!mount) continue
    if (mount.tick !== undefined) window.clearInterval(mount.tick)
    mount.resize.disconnect()
    mount.theme.disconnect()
    mount.chart?.dispose()
  }
  roots.clear()
})
