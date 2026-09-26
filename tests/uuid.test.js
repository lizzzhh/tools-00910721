import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createUuid,
  createUuids,
  describeUuid,
  formatUuid,
  isUuid,
  isUuidVersion,
  normalizeUuid,
  parseUuidList,
  splitUuidInput,
  uuidNamespaces,
  uuidVersionMap,
  uuidVersions
} from '../src/lib/uuid.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const dnsNamespace = '6ba7b8109dad11d180b400c04fd430c8'
const urlNamespace = '6ba7b8119dad11d180b400c04fd430c8'
const timestamp = Date.UTC(2026, 0, 31, 8, 30, 15, 250)

test('exposes the eight standard versions', () => {
  assert.deepEqual(
    uuidVersions.map((spec) => spec.version),
    [1, 2, 3, 4, 5, 6, 7, 8]
  )
  for (const spec of uuidVersions) {
    assert.equal(spec.nameId, `v${spec.version}`)
    assert.equal(spec.summaryId, `v${spec.version}`)
  }
  assert.equal(isUuidVersion(4), true)
  assert.equal(isUuidVersion(9), false)
})

test('generates unique version 4 identifiers', () => {
  const values = new Set(Array.from({ length: 200 }, () => createUuid()))

  assert.equal(values.size, 200)
  for (const value of values) {
    assert.match(value, uuidPattern)
    assert.equal(value[14], '4')
    assert.match(value[19], /[89ab]/)
  }
})

test('generates the requested version in the right slot for every version', () => {
  for (const spec of uuidVersions) {
    const value = createUuid({ version: spec.version, namespace: dnsNamespace, name: 'example', now: timestamp })
    assert.match(value, uuidPattern)
    assert.equal(value[14], String(spec.version), `version ${spec.version} nibble`)
    assert.match(value[19], /[89ab]/)
  }
})

test('matches known name based vectors for version 3 and version 5', () => {
  const vectors = [
    [3, dnsNamespace, 'www.example.com', '5df41881-3aed-3515-88a7-2f4a814cf09e'],
    [5, dnsNamespace, 'www.example.com', '2ed6657d-e927-568b-95e1-2665a8aea6a2'],
    [3, urlNamespace, 'http://python.org/', '9fe8e8c4-aaa8-32a9-a55c-4535a88b748d'],
    [5, urlNamespace, 'http://python.org/', '4c565f0d-3f5a-5890-b41b-20cf47701c5e'],
    [3, '6ba7b8129dad11d180b400c04fd430c8', '1.2.3.4', '267d565d-5590-301c-9a3c-44d16c9ebb99'],
    [3, '6ba7b8149dad11d180b400c04fd430c8', 'cn=example', '9b49c4b4-a548-3cfa-99c8-55ee79cd0903'],
    [5, '6ba7b8149dad11d180b400c04fd430c8', 'cn=example', '3ecc4f45-80bb-593a-be98-00e146377827']
  ]

  for (const [version, namespace, name, expected] of vectors) {
    assert.equal(createUuid({ version, namespace, name }), expected)
  }
})

test('derives name based identifiers the same way as the node crypto digest', () => {
  const name = '订单 2026::user-42'
  const namespaceBytes = Buffer.from(dnsNamespace, 'hex')
  const nameBytes = Buffer.from(name, 'utf8')
  const reference = (version, algorithm) => {
    const bytes = Buffer.from(createHash(algorithm).update(Buffer.concat([namespaceBytes, nameBytes])).digest().subarray(0, 16))
    bytes[6] = (bytes[6] & 0x0f) | (version << 4)
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    return bytes.toString('hex')
  }

  assert.equal(createUuid({ version: 3, namespace: dnsNamespace, name }).replace(/-/g, ''), reference(3, 'md5'))
  assert.equal(createUuid({ version: 5, namespace: dnsNamespace, name }).replace(/-/g, ''), reference(5, 'sha1'))
})

test('accepts a namespace written in standard form', () => {
  const standard = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

  assert.equal(createUuid({ version: 3, namespace: standard, name: 'www.example.com' }), '5df41881-3aed-3515-88a7-2f4a814cf09e')
})

test('rejects invalid namespaces and empty names', () => {
  assert.equal(createUuids({ version: 3, namespace: 'abc', name: 'x' }).code, 'namespaceInvalid')
  assert.equal(createUuids({ version: 5, namespace: dnsNamespace, name: '' }).code, 'nameRequired')
  assert.equal(createUuid({ version: 3, namespace: dnsNamespace, name: 'a' }).length, 36)
})

test('exposes the standard namespace values', () => {
  assert.deepEqual(
    uuidNamespaces.filter((item) => item.hex).map((item) => item.hex),
    [
      '6ba7b8109dad11d180b400c04fd430c8',
      '6ba7b8119dad11d180b400c04fd430c8',
      '6ba7b8129dad11d180b400c04fd430c8',
      '6ba7b8149dad11d180b400c04fd430c8'
    ]
  )
})

test('round trips the gregorian timestamp of version 1 and version 2', () => {
  for (const version of [1, 2]) {
    const value = createUuid({ version, now: timestamp })
    const described = describeUuid(value)

    assert.equal(described?.version, version)
    assert.equal(described?.timestamp, new Date(timestamp).toISOString())
    assert.equal(described?.kind, 'time')
    assert.equal(described?.multicast, true)
    assert.match(described?.node ?? '', /^[0-9A-F]{12}$/)
    assert.match(described?.clockSequence ?? '', /^[0-9A-F]{4}$/)
  }
})

test('keeps version 1 and version 2 monotonic inside the same millisecond', () => {
  const values = createUuids({ version: 1, count: 50, now: timestamp }).values

  assert.equal(new Set(values).size, 50)
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] > values[index - 1], `${values[index]} > ${values[index - 1]}`)
  }
})

test('writes the local domain into the low clock sequence byte of version 2', () => {
  const personal = describeUuid(createUuid({ version: 2, domain: 0, now: timestamp }))
  const group = describeUuid(createUuid({ version: 2, domain: 64, now: timestamp }))
  const org = describeUuid(createUuid({ version: 2, domain: 128, now: timestamp }))

  assert.equal(personal?.dceDomain, 0)
  assert.equal(group?.dceDomain, 64)
  assert.equal(org?.dceDomain, 128)
  assert.equal(personal?.versionLabelId, 'v2')
})

test('lays out the version 6 timestamp in front for sorting', () => {
  const earlier = createUuid({ version: 6, now: timestamp })
  const later = createUuid({ version: 6, now: timestamp + 1000 })

  assert.ok(later > earlier)
  assert.match(later[19], /[89ab]/)
  assert.equal(later[0], '1')

  const parsed = describeUuid(earlier)?.timestampMs ?? 0
  assert.equal(parsed, timestamp)
  assert.equal(describeUuid(later)?.timestampMs, timestamp + 1000)
})

test('generates time ordered version 7 identifiers', () => {
  const result = createUuids({ version: 7, count: 3, now: timestamp })

  assert.equal(result.values.length, 3)
  for (const value of result.values) {
    assert.match(value, uuidPattern)
    assert.equal(value[14], '7')
  }
  const described = describeUuid(result.values[0])
  assert.equal(described?.version, 7)
  assert.equal(described?.timestamp, new Date(timestamp).toISOString())
  assert.equal(new Set(result.values).size, 3)
  assert.ok(createUuid({ version: 7, now: timestamp - 1000 }) < result.values[0])
  for (let index = 1; index < result.values.length; index += 1) {
    assert.ok(result.values[index] > result.values[index - 1])
  }
})

test('keeps version 8 on the millisecond prefix with custom payload', () => {
  const first = createUuid({ version: 8, now: timestamp })
  const second = createUuid({ version: 8, now: timestamp + 5000 })

  assert.equal(describeUuid(first)?.versionLabelId, 'v8')
  assert.equal(describeUuid(first)?.kind, 'custom')
  assert.equal(describeUuid(first)?.timestamp, new Date(timestamp).toISOString())
  assert.notEqual(describeUuid(first)?.randomTail, describeUuid(second)?.randomTail)
  assert.ok(second > first)
})

test('applies casing, hyphen, brace and prefix formatting', () => {
  const raw = '0123456789abcdef0123456789abcdef'

  assert.equal(formatUuid(raw), '01234567-89ab-cdef-0123-456789abcdef')
  assert.equal(formatUuid(raw, { form: 'compact' }), raw)
  assert.equal(formatUuid(raw, { casing: 'upper' }), '01234567-89AB-CDEF-0123-456789ABCDEF')
  assert.equal(formatUuid(raw, { form: 'braces' }), '{01234567-89ab-cdef-0123-456789abcdef}')
  assert.equal(formatUuid(raw, { form: 'braces', casing: 'upper', prefix: 'id-' }), 'id-{01234567-89AB-CDEF-0123-456789ABCDEF}')
  assert.equal(formatUuid(raw, { form: 'compact', casing: 'upper', prefix: 'id-' }), 'id-0123456789ABCDEF0123456789ABCDEF')
  assert.equal(formatUuid('not-a-uuid'), 'not-a-uuid')
})

test('clamps the requested amount of identifiers', () => {
  const result = createUuids({ count: 0, version: 4, form: 'compact' })

  assert.equal(result.ok, true)
  assert.equal(result.ok && result.values.length, 1)
  assert.equal(result.output.includes('-'), false)
  assert.equal(createUuids({ count: 5000 }).values.length, 1000)
  assert.equal(createUuids({ count: -5 }).values.length, 1)
  assert.equal(createUuids({ count: 2.7 }).values.length, 2)
})

test('normalizes decorated identifiers and detects validity', () => {
  assert.equal(normalizeUuid(' {6BA7B810-9DAD-11D1-80B4-00C04FD430C8} '), dnsNamespace)
  assert.equal(normalizeUuid('urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8'), dnsNamespace)
  assert.equal(isUuid('urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8'), true)
  assert.equal(isUuid('id_6ba7b8109dad11d180b400c04fd430c8'), true)
  assert.equal(isUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c'), false)
  assert.equal(isUuid('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'), false)
})

test('describes variant, node and entropy of a random identifier', () => {
  const described = describeUuid('{01234567-89ab-4def-8123-456789abcdef}')

  assert.equal(described?.version, 4)
  assert.equal(described?.variant, 'RFC 4122')
  assert.equal(described?.node, null)
  assert.equal(described?.clockSequence, null)
  assert.equal(described?.timestamp, null)
  assert.equal(described?.entropy, '0123456789AB0DEF0123456789ABCDEF')
  assert.equal(described?.kind, 'random')
})

test('detects every variant and the special forms', () => {
  assert.equal(describeUuid('00000000-0000-0000-0000-000000000000')?.form, 'nil')
  assert.equal(describeUuid('00000000-0000-0000-0000-000000000000')?.versionLabelId, 'nil')
  assert.equal(describeUuid('ffffffff-ffff-ffff-ffff-ffffffffffff')?.form, 'max')
  assert.equal(describeUuid('ffffffff-ffff-ffff-ffff-ffffffffffff')?.versionLabelId, 'max')
  assert.equal(describeUuid('01234567-89ab-cdef-0123-456789abcdef')?.variant, 'NCS')
  assert.equal(describeUuid('01234567-89ab-4def-4123-456789abcdef')?.variant, 'Future')
  assert.equal(describeUuid('01234567-89ab-4def-c123-456789abcdef')?.variant, 'Microsoft')
  assert.equal(describeUuid('01234567-89ab-4def-8123-456789abcdef')?.variant, 'RFC 4122')
  assert.equal(describeUuid('01234567-89ab-0def-8123-456789abcdef')?.versionLabelId, 'unknown')
  assert.equal(describeUuid('01234567-89ab-0def-8123-456789abcdef')?.unknownVersion, '0x0')
})

test('reports unknown versions without throwing', () => {
  const described = describeUuid('01234567-89ab-cdef-0123-456789abcdef')

  assert.equal(described?.version, 12)
  assert.equal(described?.kind, 'none')
  assert.equal(described?.versionLabelId, 'unknown')
  assert.equal(described?.unknownVersion, '0xc')
  assert.equal(describeUuid('not-a-uuid'), null)
  assert.equal(describeUuid(''), null)
})

test('maps version metadata for the interface', () => {
  assert.equal(uuidVersionMap[7].nameId, 'v7')
  assert.equal(uuidVersionMap[7].kind, 'time')
  assert.equal(uuidVersionMap[3].kind, 'name')
  assert.equal(uuidVersionMap[8].kind, 'custom')
})

test('splits batch input on whitespace and separators', () => {
  assert.deepEqual(splitUuidInput('a b,c;d\n e '), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(splitUuidInput('   '), [])
})

test('parses a batch and reports invalid entries', () => {
  const report = parseUuidList(
    ['6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'not-a-uuid', '{01234567-89ab-4def-8123-456789abcdef}'].join('\n')
  )

  assert.equal(report.rows.length, 3)
  assert.equal(report.valid, 2)
  assert.equal(report.invalid, 1)
  assert.equal(report.rows[0].index, 1)
  assert.equal(report.rows[0].details?.version, 1)
  assert.equal(report.rows[1].details, null)
  assert.equal(report.rows[1].error?.code, 'invalidBatchItem')
  assert.equal(report.rows[1].error?.params.index, 2)
  assert.equal(report.rows[2].details?.version, 4)
  assert.equal(parseUuidList('').rows.length, 0)
})
