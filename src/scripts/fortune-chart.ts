import * as echarts from 'echarts/core'
import { CandlestickChart, type CandlestickSeriesOption } from 'echarts/charts'
import {
  AriaComponent,
  GridSimpleComponent,
  TooltipComponent,
  type AriaComponentOption,
  type GridComponentOption,
  type TooltipComponentOption
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import {
  fortuneBarCount,
  fortuneDecimals,
  fortuneMax,
  generateFortuneCandles,
  localOffsetMs,
  type FortuneCandle
} from '../lib/fortune'
import { currentIntlLocale, currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'

/**
 * The fortune card's own chart: a candle every four hours, cut at the reader's
 * midnight, with the newest one still forming.
 *
 * The candles are redrawn on every tick rather than slid one bar at a time, and
 * that is affordable because the generator answers for the window in a fraction
 * of a millisecond and nothing about the window has to be remembered: the same
 * seed draws the same four days on a reload as it did a second ago.
 *
 * A sealed card draws the same candles it always did, and the seal is applied to
 * them in CSS. What the seal cannot reach from there is what the canvas hands
 * out on its own: the tooltip reads the open, high, low and close of whichever
 * bar is under the pointer, and the figure describes itself to assistive
 * technology with the peak. Both are therefore switched off here rather than
 * left to a blur to hide, because a redacted card that still answers a hover is
 * not sealed.
 */

// The simple grid is enough for a fixed grid: the full one also adds dragging
// and region zoom, which has no place on a read-only dashboard card.
echarts.use([CandlestickChart, GridSimpleComponent, TooltipComponent, AriaComponent, CanvasRenderer])

/** Only what a candle needs: the candles, a grid, a tooltip and a description. */
type FortuneOption = ComposeOption<
  CandlestickSeriesOption | GridComponentOption | TooltipComponentOption | AriaComponentOption
>

/** What ECharts hands a tooltip callback, read off the option type instead of a deep import. */
type TooltipParams = Parameters<Extract<NonNullable<TooltipComponentOption['formatter']>, (...args: never[]) => unknown>>[0]

type FortuneRoot = HTMLElement & { dataset: DOMStringMap & { bars?: string; peakKey?: string; label?: string } }

type FortuneMount = {
  chart: echarts.ECharts | undefined
  resize: ResizeObserver
  theme: MutationObserver
  /**
   * The seed the window was last drawn from, the moment it was drawn for, and
   * whether the card was sealed when it was drawn.
   *
   * A resize and a theme flip both redraw on their own, and none of them knows
   * whose fortune is on the card or whether the reader has opened it yet.
   * Without these the watchers would reach for the published seed and redraw
   * somebody else's day, which is a chart that changes its mind the moment the
   * window is resized, and would hand out a tooltip on a card that is meant to
   * be sealed.
   */
  seed: string | undefined
  until: number | undefined
  sealed: boolean
}

const plotPadding = { top: 12, right: 10, bottom: 20, left: 30 }
const splitNumber = 3

const mounts = new WeakMap<HTMLElement, FortuneMount>()
/** Kept beside the map because a swap has to reach every live chart to dispose it. */
const roots = new Set<HTMLElement>()

/** Reads a design token straight off the document, so the chart follows the theme. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Built once per locale, because an axis label is formatted on every draw. */
let labelFormatters: { day: Intl.DateTimeFormat; hour: Intl.DateTimeFormat } | undefined
let labelLocale = ''

function formattersFor() {
  const locale = currentIntlLocale()
  if (!labelFormatters || labelLocale !== locale) {
    labelFormatters = {
      day: new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }),
      hour: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
    }
    labelLocale = locale
  }
  return labelFormatters
}

/** The score exactly as the card prints it, wherever a number is read out. */
let numberFormatter: Intl.NumberFormat | undefined
let numberLocale = ''

function scoreText(value: number): string {
  const locale = currentIntlLocale()
  if (!numberFormatter || numberLocale !== locale) {
    numberFormatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fortuneDecimals,
      maximumFractionDigits: fortuneDecimals
    })
    numberLocale = locale
  }
  return numberFormatter.format(value)
}

/**
 * The axis labels of a four hour grid.
 *
 * A bar that opens a day says which day it is, and every other bar says only
 * what hour it opened at, because twenty-four labels of a full timestamp would
 * either be hidden or unreadable, and the day a bar belongs to is the one thing
 * the grid does not show by itself.
 */
function axisLabels(bars: FortuneCandle[]): string[] {
  const { day, hour } = formattersFor()
  return bars.map((bar, index) => {
    const date = new Date(bar.time)
    const previous = index === 0 ? undefined : bars[index - 1].time
    return index === 0 || (previous !== undefined && new Date(previous).getDate() !== date.getDate())
      ? day.format(date)
      : hour.format(date)
  })
}

function buildOption(bars: FortuneCandle[], description: string, sealed: boolean): FortuneOption {
  const up = token('--success')
  const down = token('--danger')
  const contentMeta = token('--content-meta')
  const divider = token('--line-divider')
  const border = token('--line-color')
  const panel = token('--float-panel-bg')
  const mono = token('--font-mono')

  return {
    // ECharts animates on its own canvas, so the global reduced-motion rule
    // cannot reach it and the query has to be asked for here. A sealed card
    // draws without it for a reason that is about cost rather than taste: the
    // plot is behind a blur, so every frame of a 200ms tween is another frame
    // of that blur to composite, five times a second, on a card whose numbers
    // are not meant to be read anyway. A still redraw every five seconds is
    // indistinguishable from a moving one at that blur radius.
    animation: sealed ? false : !prefersReducedMotion(),
    animationDuration: 200,
    animationEasing: 'cubicOut',
    // A canvas carries no text, so the chart describes itself here. ECharts
    // would otherwise write its description in English whatever the page says.
    // What it describes while sealed is the fact that there is a chart, and
    // nothing about what is on it.
    aria: { enabled: true, label: { description } },
    grid: { ...plotPadding, containLabel: false },
    xAxis: {
      type: 'category',
      data: axisLabels(bars),
      // A candle is a band, so the axis keeps the gaps ECharts would otherwise
      // take out of a category axis and halves each bar in them.
      boundaryGap: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: contentMeta, fontFamily: mono, fontSize: 9, hideOverlap: true }
    },
    yAxis: {
      type: 'value',
      scale: true,
      splitNumber,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: contentMeta, fontFamily: mono, fontSize: 9, formatter: (value: number) => String(value) },
      splitLine: { lineStyle: { color: divider, width: 1, type: 'solid' } }
    },
    series: [
      {
        type: 'candlestick',
        // ECharts reads a candle as `[open, close, low, high]`, which is not the
        // order anyone reads them in.
        data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
        itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down, borderWidth: 1 },
        emphasis: { itemStyle: { borderWidth: 1.5 } },
        // A sealed card is not interactive at all: the tooltip below reads four
        // numbers off whichever bar is under the pointer, so the series stops
        // reporting pointer events and the tooltip stops existing.
        silent: sealed
      }
    ],
    tooltip: {
      show: !sealed,
      trigger: 'axis',
      confine: true,
      // The panel follows the pointer, so it tracks it rather than chasing it
      // behind ECharts' default 0.4s left/top transition.
      transitionDuration: 0,
      backgroundColor: panel,
      borderColor: border,
      borderWidth: 1,
      padding: [6, 8],
      textStyle: { color: token('--deep-text'), fontFamily: mono, fontSize: 11 },
      axisPointer: {
        // A travelling dashed line re-phases its pattern as it goes and shimmers
        // under the pointer, so it snaps and stays solid instead.
        animation: false,
        lineStyle: { color: divider, width: 1, type: 'solid' }
      },
      formatter: (params: TooltipParams) => {
        const first = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined
        const bar = first && typeof first.dataIndex === 'number' ? bars[first.dataIndex] : undefined
        if (!bar) return ''
        const t = currentTranslator()
        const at = formattersFor()
        return `${at.day.format(new Date(bar.time))} ${at.hour.format(new Date(bar.time))} · ${t(
          'home.fortune.chart.candle',
          {
            open: scoreText(bar.open),
            high: scoreText(bar.high),
            low: scoreText(bar.low),
            close: scoreText(bar.close)
          }
        )}`
      }
    }
  }
}

/** One watcher per figure, kept alive so a resize or a theme flip is cheap. */
function mountFor(root: FortuneRoot, plot: HTMLElement): FortuneMount {
  const existing = mounts.get(root)
  if (existing) return existing
  const mount: FortuneMount = {
    chart: undefined,
    resize: new ResizeObserver(() => redraw(root)),
    theme: new MutationObserver(() => redraw(root)),
    seed: undefined,
    until: undefined,
    sealed: false
  }
  mount.resize.observe(plot)
  mount.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  mounts.set(root, mount)
  roots.add(root)
  return mount
}

/** Redraws the window exactly as it was last drawn, which is what a watcher wants. */
function redraw(root: FortuneRoot) {
  const mount = mounts.get(root)
  if (!mount || mount.seed === undefined) return
  renderFortuneChart(root, mount.until ?? Date.now(), mount.seed, mount.sealed)
}

/** The instance is made on first draw rather than on first watch, to keep zrender off an unmeasured box. */
function chartIn(mount: FortuneMount, plot: HTMLElement): echarts.ECharts {
  if (!mount.chart) mount.chart = echarts.init(plot, undefined, { renderer: 'canvas' })
  return mount.chart
}

/**
 * Draws the window of four hour bars ending with the one this moment falls in.
 * The figure describes itself: how many bars it wants and what to call the peak
 * arrive as data attributes, so the markup is the single description of the
 * chart and this only supplies the numbers.
 *
 * The seed is the reader's own, so every bar on the card belongs to the same
 * fortune as the number printed above it. It is remembered on the mount, because
 * the resize and theme watchers come back here on their own — and so is whether
 * the card is sealed, because the seal decides what the canvas is allowed to
 * hand out.
 *
 * A sealed card draws the same window as an open one. Blurring real candles is
 * the point: what the reader uncovers is the fortune that was already there,
 * not a different one substituted for it.
 */
export function renderFortuneChart(root: HTMLElement, until: number = Date.now(), seed?: string, sealed = false) {
  const figure = root as FortuneRoot
  const plot = figure.querySelector<HTMLElement>('[data-fortune-plot]')
  if (!plot) return
  const peak = figure.querySelector<HTMLElement>('[data-fortune-peak]')
  const wanted = Math.trunc(Number(figure.dataset.bars))
  const bars = generateFortuneCandles({
    count: wanted > 0 ? wanted : fortuneBarCount,
    until,
    offsetMs: localOffsetMs(new Date(until)),
    seed,
    live: true
  })
  if (bars.length === 0) return

  // The plot ships hidden so a card with nothing to draw shows no gap, but a
  // hidden element has no box: it has to be shown before it can be measured, or
  // ECharts is handed a zero sized canvas and draws nothing.
  plot.hidden = false
  const mount = mountFor(figure, plot)
  if (plot.clientWidth === 0) return
  mount.seed = seed
  mount.until = until
  mount.sealed = sealed
  const t = currentTranslator()
  const label = figure.dataset.label ?? ''
  const highest = bars.reduce((max, bar) => Math.max(max, bar.high), 0)
  // The peak is the one figure that survives on a sealed card in no form: it is
  // the highest score on the card, printed in the caption and written into the
  // canvas's own description, so it is simply not computed for the caption and
  // the description falls back to saying the chart is sealed instead.
  const reading = sealed ? '' : t(figure.dataset.peakKey as MessageKey, { value: scoreText(Math.min(highest, fortuneMax)) })
  const description = sealed ? `${label}: ${t('home.fortune.sealed')}` : `${label}: ${reading}`
  const chart = chartIn(mount, plot)
  chart.resize()
  chart.setOption(buildOption(bars, description, sealed))
  if (peak) {
    peak.textContent = reading
    peak.hidden = sealed
  }
}

/** zrender keeps window level handlers, so a chart that is about to be swapped out is disposed. */
document.addEventListener('astro:before-swap', () => {
  for (const root of roots) {
    const mount = mounts.get(root)
    if (!mount) continue
    mount.resize.disconnect()
    mount.theme.disconnect()
    mount.chart?.dispose()
  }
  roots.clear()
})