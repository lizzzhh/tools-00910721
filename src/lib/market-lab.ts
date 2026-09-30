import { marketDefaults, type MarketParams } from './candles.ts'
import type { MessageKey } from '../i18n'

/**
 * What the lab lets a reader turn.
 *
 * The list is the model's own knobs and nothing else, and every one of them is
 * optional: a field the reader has not touched is absent from the overrides, so a
 * half-finished session still generates the published market for everything they
 * have not moved. The ranges are the ones that produce a market worth looking at —
 * a volatility of 30 or a daily jump chance of 1 is not a wilder market, it is a
 * broken page.
 */

export type LabGroupId = 'volatility' | 'trend' | 'jumps' | 'burst' | 'volume' | 'activity' | 'grid'

export type LabField = {
  /** Which knob this field writes, or which slot of an array-valued knob. */
  key: keyof MarketParams
  /** The index inside the knob, for the ones that hold a list. */
  index?: number
  /**
   * The number inside a list entry, for a knob whose entries are objects rather
   * than numbers. The activity peaks are `{ hour, amp, width }`, and a slider can
   * only hold the one of the three the reader is allowed to change.
   */
  property?: string
  group: LabGroupId
  label: MessageKey
  min: number
  max: number
  step: number
  /** The value shown when the field is untouched. */
  fallback: number
}

export const labGroups: { id: LabGroupId; label: MessageKey; note: MessageKey }[] = [
  { id: 'volatility', label: 'lab.market.group.volatility', note: 'lab.market.groupNote.volatility' },
  { id: 'trend', label: 'lab.market.group.trend', note: 'lab.market.groupNote.trend' },
  { id: 'jumps', label: 'lab.market.group.jumps', note: 'lab.market.groupNote.jumps' },
  { id: 'burst', label: 'lab.market.group.burst', note: 'lab.market.groupNote.burst' },
  { id: 'volume', label: 'lab.market.group.volume', note: 'lab.market.groupNote.volume' },
  { id: 'activity', label: 'lab.market.group.activity', note: 'lab.market.groupNote.activity' },
  { id: 'grid', label: 'lab.market.group.grid', note: 'lab.market.groupNote.grid' }
]

/**
 * The defaults, in the order a reader would reach for them, with each one's
 * published value as its starting point. The grid group is last because changing
 * it costs a redraw of every bar, which is worth doing deliberately.
 */
export const labFields: LabField[] = [
  {
    key: 'dailyVolatility',
    group: 'volatility',
    label: 'lab.market.field.dailyVolatility',
    // The upper end has to admit the wildest preset, or choosing it would put the
    // thumb outside the track and the first drag would silently clip it back.
    min: 0.0005,
    max: 0.08,
    step: 0.0001,
    fallback: marketDefaults.dailyVolatility
  },
  {
    key: 'volatilityHalfLife',
    group: 'volatility',
    label: 'lab.market.field.volatilityHalfLife',
    min: 3600,
    max: 30 * 86400,
    step: 3600,
    fallback: marketDefaults.volatilityHalfLife
  },
  {
    key: 'volatilitySpread',
    group: 'volatility',
    label: 'lab.market.field.volatilitySpread',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: marketDefaults.volatilitySpread
  },
  {
    key: 'driftPerDay',
    group: 'trend',
    label: 'lab.market.field.driftPerDay',
    min: -0.005,
    max: 0.005,
    step: 0.00005,
    fallback: marketDefaults.driftPerDay
  },
  {
    key: 'trendAmp',
    group: 'trend',
    label: 'lab.market.field.trendAmp',
    min: 0,
    max: 0.03,
    step: 0.0005,
    fallback: marketDefaults.trendAmp
  },
  {
    key: 'trendDecay',
    group: 'trend',
    label: 'lab.market.field.trendDecay',
    min: 0.2,
    max: 6,
    step: 0.1,
    fallback: marketDefaults.trendDecay
  },
  ...[0, 1, 2].map((index) => ({
    key: 'trendPeriods' as keyof MarketParams,
    index,
    group: 'trend' as const,
    label: `lab.market.field.trendPeriod${index + 1}` as MessageKey,
    min: 2,
    max: 400,
    step: 1,
    fallback: marketDefaults.trendPeriods[index]
  })),
  {
    key: 'jumpChancePerDay',
    group: 'jumps',
    label: 'lab.market.field.jumpChancePerDay',
    min: 0,
    max: 0.5,
    step: 0.002,
    fallback: marketDefaults.jumpChancePerDay
  },
  {
    key: 'jumpLow',
    group: 'jumps',
    label: 'lab.market.field.jumpLow',
    min: 0,
    max: 0.3,
    step: 0.001,
    fallback: marketDefaults.jumpLow
  },
  {
    key: 'jumpHigh',
    group: 'jumps',
    label: 'lab.market.field.jumpHigh',
    min: 0,
    max: 0.5,
    step: 0.001,
    fallback: marketDefaults.jumpHigh
  },
  {
    key: 'intradayJumpsPerDay',
    group: 'jumps',
    label: 'lab.market.field.intradayJumpsPerDay',
    min: 0,
    max: 40,
    step: 0.5,
    fallback: marketDefaults.intradayJumpsPerDay
  },
  {
    key: 'intradayJumpLow',
    group: 'jumps',
    label: 'lab.market.field.intradayJumpLow',
    min: 0,
    max: 0.1,
    step: 0.0005,
    fallback: marketDefaults.intradayJumpLow
  },
  {
    key: 'intradayJumpHigh',
    group: 'jumps',
    label: 'lab.market.field.intradayJumpHigh',
    min: 0,
    max: 0.2,
    step: 0.0005,
    fallback: marketDefaults.intradayJumpHigh
  },
  {
    key: 'burstHalfLife',
    group: 'burst',
    label: 'lab.market.field.burstHalfLife',
    min: 60,
    max: 4 * 3600,
    step: 60,
    fallback: marketDefaults.burstHalfLife
  },
  {
    key: 'burstBlockSeconds',
    group: 'burst',
    label: 'lab.market.field.burstBlockSeconds',
    min: 30,
    max: 60 * 60,
    step: 30,
    fallback: marketDefaults.burstBlockSeconds
  },
  {
    key: 'burstSpread',
    group: 'burst',
    label: 'lab.market.field.burstSpread',
    min: 0,
    max: 3,
    step: 0.05,
    fallback: marketDefaults.burstSpread
  },
  {
    key: 'baseDailyVolume',
    group: 'volume',
    label: 'lab.market.field.baseDailyVolume',
    min: 0,
    max: 500_000,
    step: 500,
    fallback: marketDefaults.baseDailyVolume
  },
  {
    key: 'volumeMoveBoost',
    group: 'volume',
    label: 'lab.market.field.volumeMoveBoost',
    min: 0,
    max: 20,
    step: 0.5,
    fallback: marketDefaults.volumeMoveBoost
  },
  {
    key: 'volumeWobble',
    group: 'volume',
    label: 'lab.market.field.volumeWobble',
    min: 0,
    max: 2,
    step: 0.02,
    fallback: marketDefaults.volumeWobble
  },
  {
    key: 'activityBase',
    group: 'activity',
    label: 'lab.market.field.activityBase',
    min: 0,
    max: 3,
    step: 0.02,
    fallback: marketDefaults.activityBase
  },
  ...marketDefaults.activityPeaks.map((peak, index) => ({
    key: 'activityPeaks' as keyof MarketParams,
    index,
    property: 'amp',
    group: 'activity' as const,
    label: `lab.market.field.activityPeak${index + 1}` as MessageKey,
    min: 0,
    max: 2,
    step: 0.02,
    fallback: peak.amp
  })),
  {
    key: 'coarseSteps',
    group: 'grid',
    label: 'lab.market.field.coarseSteps',
    min: 60,
    max: 2880,
    step: 60,
    fallback: marketDefaults.coarseSteps
  },
  {
    key: 'tickRate',
    group: 'grid',
    label: 'lab.market.field.tickRate',
    min: 1,
    max: 60,
    step: 1,
    fallback: marketDefaults.tickRate
  },
  {
    key: 'priceDecimals',
    group: 'grid',
    label: 'lab.market.field.priceDecimals',
    min: 0,
    max: 6,
    step: 1,
    fallback: marketDefaults.priceDecimals
  }
]

/** The published value of one field, which is what "reset" puts back. */
export function fieldDefault(field: LabField): number {
  return field.fallback
}

function entryNumber(item: unknown, field: LabField): number | null {
  if (typeof item === 'number') return item
  if (field.property && item && typeof item === 'object') {
    const inner = (item as Record<string, unknown>)[field.property]
    if (typeof inner === 'number') return inner
  }
  return null
}

/** How a field's value is read out of a finished set of knobs. */
export function fieldValue(params: MarketParams, field: LabField): number {
  const value = params[field.key]
  if (Array.isArray(value)) {
    return entryNumber(value[field.index ?? 0], field) ?? field.fallback
  }
  return typeof value === 'number' ? value : field.fallback
}

/**
 * A finished set of knobs from the values the fields currently hold.
 *
 * Only the fields that differ from the published value are sent, so an untouched
 * field cannot be the reason a market is different from the one the site serves.
 */
export function overridesFrom(
  fields: { field: LabField; value: number }[],
  base: MarketParams = marketDefaults
): Partial<MarketParams> {
  const overrides: Record<string, unknown> = {}
  for (const { field, value } of fields) {
    const published = fieldDefault(field)
    if (value === published && fieldValue(base, field) === published) continue
    if (typeof base[field.key] === 'number') {
      overrides[field.key] = value
      continue
    }
    // A list-valued knob keeps every entry the reader did not touch, including the
    // parts of an entry that are not on a slider, so tuning one crowd cannot quietly
    // move its hour or its width.
    const list = [...((overrides[field.key] as unknown[]) ?? (base[field.key] as unknown[]))]
    const index = field.index ?? 0
    const item = list[index]
    list[index] = field.property && item && typeof item === 'object' ? { ...item, [field.property]: value } : value
    overrides[field.key] = list
  }
  return overrides as Partial<MarketParams>
}

/** How many fields differ from the published market, which is what the badge counts. */
export function changedCount(fields: { field: LabField; value: number }[]): number {
  return fields.filter(({ field, value }) => value !== fieldDefault(field)).length
}

/**
 * Named starting points, so a reader can see what a setting does without first
 * having to imagine it. Each is a handful of overrides and nothing else, and every
 * one of them is reachable by moving the sliders by hand.
 */
export type LabPreset = { id: string; label: MessageKey; params: Partial<MarketParams> }

export const labPresets: LabPreset[] = [
  { id: 'published', label: 'lab.market.preset.published', params: {} },
  {
    id: 'calm',
    label: 'lab.market.preset.calm',
    params: { dailyVolatility: 0.45 / Math.sqrt(365) / 3, volatilitySpread: 0.2, jumpChancePerDay: 1 / 400 }
  },
  {
    id: 'wild',
    label: 'lab.market.preset.wild',
    params: {
      dailyVolatility: (0.45 / Math.sqrt(365)) * 2.6,
      volatilitySpread: 1.1,
      jumpChancePerDay: 1 / 12,
      intradayJumpsPerDay: 8
    }
  },
  {
    id: 'crash',
    label: 'lab.market.preset.crash',
    params: { driftPerDay: -0.004, trendAmp: 0.012, jumpChancePerDay: 1 / 20, jumpLow: 0.04, jumpHigh: 0.16 }
  },
  {
    id: 'thin',
    label: 'lab.market.preset.thin',
    params: { baseDailyVolume: 900, volumeMoveBoost: 9, volumeWobble: 0.7 }
  },
  {
    id: 'chain',
    label: 'lab.market.preset.chain',
    params: { intradayJumpsPerDay: 0, intradayJumpLow: 0, intradayJumpHigh: 0, burstSpread: 0.2, driftPerDay: 0.0015 }
  }
]

/** The field values a preset puts on screen, so choosing one fills the sliders. */
export function presetFields(preset: LabPreset, fields: LabField[] = labFields) {
  const params = { ...marketDefaults, ...preset.params } as MarketParams
  return fields.map((field) => ({ field, value: fieldValue(params, field) }))
}
