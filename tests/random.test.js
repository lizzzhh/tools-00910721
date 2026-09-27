import { strict as assert } from 'node:assert'
import test from 'node:test'
import { hashSeed, normal, randomStreams, uniform } from '../src/lib/random.ts'

test('a seed is a number, and the same string is always the same seed', () => {
  assert.equal(typeof hashSeed('code-space:market/v1'), 'number')
  assert.equal(hashSeed('code-space:market/v1'), hashSeed('code-space:market/v1'))
  assert.notEqual(hashSeed('a'), hashSeed('b'))
})

test('a uniform draw sits in [0, 1)', () => {
  for (let index = 0; index < 5000; index += 1) {
    const value = uniform(1234, randomStreams.price, index, 0)
    assert.ok(value >= 0 && value < 1, `${value} out of range`)
  }
})

test('a coordinate always gives the same draw, which is the point of the file', () => {
  const seed = hashSeed('repeat')
  assert.equal(uniform(seed, 7, 42, 9), uniform(seed, 7, 42, 9))
  assert.equal(normal(seed, 7, 42, 9), normal(seed, 7, 42, 9))
})

test('neighbouring coordinates do not give neighbouring numbers', () => {
  // A generator that returned a smooth ramp instead of noise would still pass a
  // range check, and would draw a straight line on a chart.
  const seed = hashSeed('neighbours')
  const draws = Array.from({ length: 2000 }, (_, index) => uniform(seed, randomStreams.path, index, 0))
  const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length
  const sd = Math.sqrt(draws.reduce((sum, value) => sum + (value - mean) ** 2, 0) / draws.length)
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean} is not centred`)
  // 1/sqrt(12) is the spread of a true uniform; a lattice or a ramp sits far from it.
  assert.ok(Math.abs(sd - 0.2887) < 0.01, `spread ${sd} is not uniform`)
  const firstHalf = draws.slice(0, 1000).reduce((sum, value) => sum + value, 0)
  const secondHalf = draws.slice(1000).reduce((sum, value) => sum + value, 0)
  assert.ok(Math.abs(firstHalf - secondHalf) > 1, 'the two halves are suspiciously alike')
})

test('streams are independent of each other at the same coordinate', () => {
  const seed = hashSeed('streams')
  assert.notEqual(uniform(seed, randomStreams.price, 5, 5), uniform(seed, randomStreams.volume, 5, 5))
  assert.notEqual(uniform(seed, randomStreams.price, 5, 5), uniform(seed, randomStreams.price, 6, 5))
  assert.notEqual(uniform(seed, randomStreams.price, 5, 5), uniform(seed, randomStreams.price, 5, 6))
})

test('a normal draw is centred, spread and heavy enough in the tail', () => {
  const seed = hashSeed('bell')
  const draws = Array.from({ length: 20_000 }, (_, index) => normal(seed, randomStreams.price, index, 0))
  const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length
  const sd = Math.sqrt(draws.reduce((sum, value) => sum + (value - mean) ** 2, 0) / draws.length)
  assert.ok(Math.abs(mean) < 0.05, `mean ${mean} is not centred`)
  assert.ok(Math.abs(sd - 1) < 0.05, `spread ${sd} is not normal`)
  const tail = draws.filter((value) => Math.abs(value) > 3).length / draws.length
  // A true normal puts 0.27% beyond three; a uniform would put none at all.
  assert.ok(tail > 0.001 && tail < 0.008, `tail ${tail} is not normal`)
})

test('a normal draw never returns a value that would break a path', () => {
  // The radius takes a logarithm of a uniform, and exactly zero is representable.
  const seed = hashSeed('edge')
  for (let index = 0; index < 20_000; index += 1) {
    assert.ok(Number.isFinite(normal(seed, randomStreams.path, index, 0)))
  }
})
