import * as echarts from 'echarts/core'
import { LineChart, type LineSeriesOption } from 'echarts/charts'
import { AriaComponent, GridSimpleComponent, TooltipComponent, type AriaComponentOption, type GridComponentOption, type TooltipComponentOption } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import { dayFromKey, shortDayLabel, trendDays, type DaySeries } from '../lib/day-series'
import { currentIntlLocale, currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'

// The simple grid is enough for a fixed grid: the full one also adds dragging
// and region zoom, which has no place on a read-only dashboard card. Only the
// full grid ships an option type, and the keys used here are the same either way.
echarts.use([LineChart, GridSimpleComponent, TooltipComponent, AriaComponent, CanvasRenderer])

/** Only the parts a day axis needs: a line, a grid, a tooltip and a description. */
type TrendOption = ComposeOption<
  LineSeriesOption | GridComponentOption | TooltipComponentOption | AriaComponentOption
>

/** What ECharts hands a tooltip callback, read off the option type instead of a deep import. */
type TooltipParams = Parameters<Extract<NonNullable<TooltipComponentOption['formatter']>, (...args: never[]) => unknown>>[0]

type TrendFigure = HTMLElement & {
  dataset: DOMStringMap & { window?: string; fill?: string; max?: string; peakKey?: string; label?: string }
}

type TrendMount = {
  chart: echarts.ECharts | undefined
  series: DaySeries
  resize: ResizeObserver
  theme: MutationObserver
}

const plotPadding = { top: 12, right: 10, bottom: 20, left: 26 }
const splitNumber = 4

const mounts = new WeakMap<HTMLElement, TrendMount>()
/** Kept beside the map because a swap has to reach every live chart to dispose it. */
const figures = new Set<HTMLElement>()

/** Reads a design token straight off the document, so the chart follows the theme. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Built once per locale, because a tooltip formats a day on every hover. */
let dayFormatter: Intl.DateTimeFormat | undefined
let dayFormatterLocale = ''

function formatDay(key: string): string {
  const locale = currentIntlLocale()
  if (!dayFormatter || dayFormatterLocale !== locale) {
    dayFormatter = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' })
    dayFormatterLocale = locale
  }
  return dayFormatter.format(dayFromKey(key))
}

function buildOption(
  figure: TrendFigure,
  categories: string[],
  values: (number | null)[],
  peak: string
): TrendOption {
  const primary = token('--primary')
  const primaryStrong = token('--primary-strong')
  const contentMeta = token('--content-meta')
  const deepText = token('--deep-text')
  const divider = token('--line-divider')
  const border = token('--line-color')
  const card = token('--card-bg')
  const panel = token('--float-panel-bg')
  const mono = token('--font-mono')
  const fixedMax = Number(figure.dataset.max)

  return {
    // ECharts animates on its own canvas, so the global reduced-motion rule
    // cannot reach it and the query has to be asked for here.
    animation: !prefersReducedMotion(),
    animationDuration: 200,
    animationEasing: 'cubicOut',
    // A canvas carries no text, so the chart describes itself here. ECharts
    // would otherwise write its description in English whatever the page says.
    aria: { enabled: true, label: { description: `${figure.dataset.label ?? ''}: ${peak}` } },
    grid: { ...plotPadding, containLabel: false },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: contentMeta, fontFamily: mono, fontSize: 9, hideOverlap: true, formatter: shortDayLabel }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: fixedMax > 0 ? fixedMax : undefined,
      splitNumber,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: contentMeta, fontFamily: mono, fontSize: 9 },
      splitLine: { lineStyle: { color: divider, width: 1, type: 'solid' } }
    },
    series: [
      {
        type: 'line',
        data: values,
        // A day nobody recorded is a hole in the line, not a straight join.
        connectNulls: false,
        showAllSymbol: 'auto',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: primary, width: 1.75, cap: 'butt', join: 'miter' },
        itemStyle: { color: card, borderColor: primary, borderWidth: 1.5 },
        areaStyle: { color: primary, opacity: 0.12 },
        // Colour only, and never a scale: anything that re-strokes or re-shapes
        // the curve under the pointer repaints it, which is what flickers.
        emphasis: { scale: false, lineStyle: { color: primaryStrong } },
        z: 2
      }
    ],
    tooltip: {
      trigger: 'axis',
      confine: true,
      // The panel follows the pointer, so it tracks it rather than chasing it
      // behind ECharts' default 0.4s left/top transition.
      transitionDuration: 0,
      backgroundColor: panel,
      borderColor: border,
      borderWidth: 1,
      padding: [6, 8],
      textStyle: { color: deepText, fontFamily: mono, fontSize: 11 },
      axisPointer: {
        type: 'line',
        // A day axis gives a band wider than ECharts' own 15px threshold, which
        // switches the guide to animating between days by itself. A travelling
        // dashed line re-phases its pattern as it goes and shimmers under the
        // pointer, so it snaps and stays solid instead.
        animation: false,
        lineStyle: { color: divider, width: 1, type: 'solid' }
      },
      formatter: (params: TooltipParams) => {
        const first = (Array.isArray(params) ? params[0] : params) as { axisValue?: string; value?: number | null } | undefined
        if (!first || first.value === null || first.value === undefined) return ''
        return `${formatDay(String(first.axisValue))} · ${first.value}`
      }
    }
  }
}

function paint(figure: TrendFigure, plot: HTMLElement, empty: HTMLElement, peak: HTMLElement | null, series: DaySeries) {
  const days = Math.max(Math.trunc(Number(figure.dataset.window)) || 0, 1)
  const fill = figure.dataset.fill === 'recorded' ? 'recorded' : 'zero'
  const { categories, values, highest } = trendDays(series, days, new Date(), fill)

  if (highest <= 0) {
    plot.hidden = true
    if (peak) {
      peak.hidden = true
      peak.textContent = ''
    }
    empty.hidden = false
    return
  }

  // The plot ships hidden so a card with nothing to draw shows no gap, but a
  // hidden element has no box: it has to be shown before it can be measured, or
  // ECharts is handed a zero sized canvas and draws nothing.
  plot.hidden = false
  empty.hidden = true
  const reading = currentTranslator()(figure.dataset.peakKey as MessageKey, { value: highest })
  // Watching is done whether or not there is anything to draw yet, so a card
  // that is still off screen is drawn by the observer once it gets a box.
  const mount = mountFor(figure, plot, series)
  if (plot.clientWidth === 0) return
  const chart = chartIn(mount, plot)
  chart.resize()
  chart.setOption(buildOption(figure, categories, values, reading))
  if (peak) {
    peak.textContent = reading
    peak.hidden = false
  }
}

/** One watcher per figure, kept alive so a resize or a theme flip is cheap. */
function mountFor(figure: TrendFigure, plot: HTMLElement, series: DaySeries): TrendMount {
  const existing = mounts.get(figure)
  if (existing) {
    existing.series = series
    return existing
  }
  const mount: TrendMount = {
    series,
    chart: undefined,
    resize: new ResizeObserver(() => renderTrend(figure, mount.series)),
    theme: new MutationObserver(() => renderTrend(figure, mount.series))
  }
  mount.resize.observe(plot)
  mount.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  mounts.set(figure, mount)
  figures.add(figure)
  return mount
}

/** The instance is made on first draw rather than on first watch, to keep zrender off an unmeasured box. */
function chartIn(mount: TrendMount, plot: HTMLElement): echarts.ECharts {
  if (!mount.chart) mount.chart = echarts.init(plot, undefined, { renderer: 'canvas' })
  return mount.chart
}

/**
 * Draws one day axis for a stored series. The figure describes itself: the
 * window, the fill and the fixed top all arrive as data attributes, so the
 * markup is the single description of the chart and this only supplies numbers.
 */
export function renderTrend(figure: HTMLElement, series: DaySeries) {
  const plot = figure.querySelector<HTMLElement>('[data-trend-plot]')
  const empty = figure.querySelector<HTMLElement>('[data-trend-empty]')
  if (!plot || !empty) return
  const peak = figure.querySelector<HTMLElement>('[data-trend-peak]')
  paint(figure as TrendFigure, plot, empty, peak, series)
}

/** zrender keeps window level handlers, so a chart that is about to be swapped out is disposed. */
document.addEventListener('astro:before-swap', () => {
  for (const figure of figures) {
    const mount = mounts.get(figure)
    if (!mount) continue
    mount.resize.disconnect()
    mount.theme.disconnect()
    mount.chart?.dispose()
  }
  figures.clear()
})
