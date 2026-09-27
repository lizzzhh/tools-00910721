/**
 * Seeded noise, for the parts of the site that have to look random without ever
 * being random: the same seed has to give the same numbers on every device, on
 * every reload, forever, or a saved game would quietly change under the player.
 *
 * Addressed by position rather than drawn from a stream, which is the whole
 * point of this file. A sequential generator can only answer "what comes next",
 * so reaching the 900,000th value means drawing 900,000 times first. Here every
 * value is hashed from its own coordinates — which series, which day, which
 * step — so the market can answer for one minute of one day without first
 * replaying the years in front of it, and two different timeframes asking for
 * overlapping stretches get the identical path back.
 *
 * `Math.random` is deliberately absent. A generator that secretly mixed in an
 * unseeded draw would be worse than no generator at all, because the results
 * would look fine right up until they did not reproduce.
 */

/** Stream ids. Two streams with the same coordinates are independent series. */
export const randomStreams = {
  volatility: 0x1f3d,
  price: 0x2b7f,
  trend: 0x35a1,
  jump: 0x4c11,
  path: 0x51ed,
  volume: 0x6b43,
  burst: 0x7a17,
  tick: 0x3d4f,
  tickVolume: 0x8f21
} as const

/**
 * Folds one 32-bit word. This is the murmur3 finaliser: the low-cost
 * alternatives leave a visible lattice in the output, and a lattice in a
 * uniform draw shows up as a repeating pattern once the values are plotted.
 */
function mix(value: number): number {
  let hash = value | 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

/** A string to a 32-bit seed, so a seed can be a readable word rather than a number. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return mix(hash)
}

/** The golden ratio, so neighbouring coordinates land far apart in the hash. */
const scatter = 0x9e3779b1

/**
 * One uniform draw in [0, 1) at a coordinate.
 *
 * `stream` picks the series, `a` and `b` locate the value inside it. Every draw
 * at the same coordinate is the same number, and no two coordinates share one.
 */
export function uniform(seed: number, stream: number, a: number, b: number): number {
  let hash = mix(seed) ^ Math.imul(stream | 0, scatter)
  hash = mix(hash) ^ Math.imul(a | 0, scatter)
  hash = mix(hash) ^ Math.imul(b | 0, scatter)
  return mix(hash) / 4_294_967_296
}

/**
 * One standard normal draw at a coordinate, by Box-Muller.
 *
 * The radius and the angle are hashed separately, so a normal draw costs two
 * uniform draws and never has to remember what it drew last. A generator that
 * cached the second half of the pair would be cheaper, but the cache would have
 * to be keyed by coordinate to stay reproducible, which is the state this file
 * exists to avoid.
 */
export function normal(seed: number, stream: number, a: number, b: number): number {
  // `log` of exactly zero is -Infinity, which would poison the whole path with a
  // single unlucky coordinate, so the radius is floored just above zero.
  const radius = Math.sqrt(-2 * Math.log(Math.max(uniform(seed, stream, a, b), Number.EPSILON)))
  const angle = 2 * Math.PI * uniform(seed, stream ^ 0x27d4eb2d, a, b)
  return radius * Math.cos(angle)
}
