/**
 * Turning a JSON sample into TypeScript declarations.
 *
 * The shape is built first and rendered second, and the order matters: a nested
 * object has to be named and declared on its own, because an `interface` nested
 * inside a member list is not TypeScript. So the walker gives every object a name
 * derived from the path that reaches it, and the renderer emits one declaration per
 * name, children before parents.
 *
 * A single sample cannot know whether a key is always present, so the sample's own
 * shape is what gets reported. Where two objects disagree, the union of both is
 * emitted rather than a guess at which one is right.
 */

export type TypeFlavour = 'interface' | 'type'
export type NullPolicy = 'optional' | 'union'

export type TypeOptions = {
  /** Name of the root declaration. */
  root?: string
  /** Set when the document's root is a list or a scalar and needs an alias. */
  rootAlias?: string | null
  flavour?: TypeFlavour
  /** `optional` marks a null field with `?`; `union` writes `T | null`. */
  nullPolicy?: NullPolicy
  readonly?: boolean
  semicolons?: boolean
  indent?: string
  exports?: boolean
}

export type TypeErrorCode = 'empty' | 'badName'

export type TypeResult =
  | {
      ok: true
      code: string
      names: string[]
      fieldCount: number
      nullableFields: number
      warnings: string[]
    }
  | { ok: false; code: TypeErrorCode }

/**
 * One node of the inferred shape. `name` is set only where a declaration is
 * generated, which is what tells the renderer to reference the name instead of
 * expanding the node in place.
 */
type Shape = {
  name: string | null
  /** Primitives and unions, without the object case. */
  types: string[]
  members?: Map<string, Shape>
  /** The element shape, for arrays. */
  items?: Shape
  /** Present in one sample of the shape and absent (or null) in another. */
  nullable: boolean
  optional: boolean
}

const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** `customer_name` and `customerName` both have to survive as type names. */
function pascal(text: string) {
  const cleaned = text
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  if (!cleaned) return 'Value'
  return /^[0-9]/.test(cleaned) ? `Value${cleaned}` : cleaned
}

const propertyKey = (key: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key))

/** Keeps generated names unique so two `items` in different arrays do not collide. */
class Names {
  private readonly taken = new Set<string>()

  claim(preferred: string): string {
    let name = preferred
    let suffix = 2
    while (this.taken.has(name)) {
      name = `${preferred}${suffix}`
      suffix += 1
    }
    this.taken.add(name)
    return name
  }
}

const unknownShape = (): Shape => ({ name: null, types: ['unknown'], nullable: false, optional: false })

function primitiveOf(value: unknown): string | null {
  if (value === null || Array.isArray(value)) return null
  const type = typeof value
  if (type === 'boolean' || type === 'string') return type
  // A float and an integer are both `number`; the distinction is not in the type.
  if (type === 'number') return 'number'
  return null
}

/** The names taken so far, the counts to report, and the odd shapes found on the way. */
type Context = {
  names: Names
  stats: { nullable: number; warnings: string[] }
  /** Shapes a mixed array forced into a standalone declaration. */
  extras: Shape[]
}

function shapeOf(value: unknown, name: string, ctx: Context): Shape {
  if (value === null) {
    // `null` is an observation, not a type: the field is nullable and the type is
    // whatever else the sample shows. Left as `null` it would be a declaration that
    // only ever accepts null.
    ctx.stats.nullable += 1
    return { name: null, types: ['null'], nullable: true, optional: false }
  }
  const primitive = primitiveOf(value)
  if (primitive !== null) return { name: null, types: [primitive], nullable: false, optional: false }

  if (Array.isArray(value)) {
    // One shape per distinct element shape, so a list of a hundred equal objects
    // still yields one declaration.
    const byShape = new Map<string, Shape>()
    for (const item of value) {
      const key = describe(item)
      if (!byShape.has(key)) byShape.set(key, shapeOf(item, name, ctx))
    }
    const elements = [...byShape.values()]
    if (elements.length === 0) {
      // Nothing to go on, and `unknown[]` is the honest answer rather than `any[]`.
      return { name: null, types: [], items: unknownShape(), nullable: false, optional: false }
    }
    if (elements.length === 1) {
      return { name: null, types: [], items: elements[0], nullable: false, optional: false }
    }
    // A mixed array cannot be one type. It becomes a union of the element types,
    // with each object shape declared on its own.
    const union: Shape = { name: null, types: [], nullable: false, optional: false }
    for (const element of elements) {
      if (element.members || element.items) {
        // The element already claimed its own name while it was built, so it is
        // reused; claiming it again here is what produced `Item2`.
        union.types.push(element.name ?? inlineType(element, settingsOf(ctx)))
        ctx.extras.push(element)
      } else {
        union.types.push(...element.types.filter((type) => type !== 'null'))
      }
    }
    ctx.stats.warnings.push('mixedArray')
    return { name: null, types: [], items: union, nullable: false, optional: false }
  }

  if (typeof value === 'object' && value !== null) {
    const members = new Map<string, Shape>()
    const shape: Shape = { name: ctx.names.claim(name), types: [], members, nullable: false, optional: false }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const existing = members.get(key)
      const described = shapeOf(child, `${shape.name}${pascal(key)}`, ctx)
      if (existing) merge(existing, described, ctx.stats)
      else members.set(key, described)
    }
    return shape
  }

  return { name: null, types: ['unknown'], nullable: false, optional: false }
}

/** Naming defaults, used only where the caller has not chosen a flavour yet. */
const settingsOf = (_ctx: Context): Required<TypeOptions> => ({
  root: 'Root',
  rootAlias: null,
  flavour: 'interface',
  nullPolicy: 'optional',
  readonly: false,
  semicolons: true,
  indent: '  ',
  exports: false
})

/**
 * Combines two samples of the same field. A type seen in only one of them becomes
 * `T | undefined`, which is why the members map is keyed on the field: by the time
 * the second sample arrives the first shape is already in it.
 */
function merge(into: Shape, other: Shape, stats: { nullable: number; warnings: string[] }) {
  if (other.name !== null && into.name !== other.name) stats.warnings.push('shapeConflict')
  const types = new Set([...into.types, ...other.types])
  if (into.types.length > 0 && other.types.length > 0 && types.size > 1) {
    into.types = [...types].sort()
    if (!into.types.includes('null')) into.types.push('null')
  } else if (into.types.length === 0) {
    into.types = other.types
  }
  if (into.items && other.items) {
    if (into.items.name === null && other.items.name !== null) into.items = other.items
  } else if (into.items === undefined && other.items !== undefined) {
    into.items = other.items
  }
  if (other.members && into.members) {
    for (const [key, shape] of other.members) {
      const existing = into.members.get(key)
      if (existing) merge(existing, shape, stats)
      else into.members.set(key, shape)
    }
  }
  into.nullable = into.nullable || other.nullable
  into.optional = into.optional || other.optional
}

/**
 * A stable key for the shape of one array element, so a hundred objects of the same
 * shape produce one shape rather than a hundred identical ones.
 *
 * Keyed on the type rather than the value: `[[1, 2], [3, 4]]` has two element
 * shapes or one depending on the answer, and it is one.
 */
function describe(value: unknown): string {
  if (Array.isArray(value)) return `[${[...new Set(value.map(describe))].sort().join(',')}]`
  if (value === null) return 'null'
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `${key}:${describe(child)}`)
      .sort()
    return `{${entries.join(',')}}`
  }
  return typeof value
}

function inlineType(shape: Shape, options: Required<TypeOptions>): string {
  if (shape.members) return shape.name ?? 'Record<string, unknown>'
  if (shape.items) return `Array<${inlineType(shape.items, options)}>`
  const types = shape.types.filter((type) => type !== 'null')
  if (types.length === 0) return 'unknown'
  return types.join(' | ')
}

/** The type as it appears in a member position, with `null` where it belongs. */
function memberType(shape: Shape, options: Required<TypeOptions>): string {
  const base = inlineType(shape, options)
  // `unknown` already includes null, so writing `unknown | null` only says less.
  if (!shape.nullable || options.nullPolicy === 'optional' || base === 'unknown') return base
  return `${base} | null`
}

/** One declaration per named shape, children first so the file reads top down. */
function renderShape(shape: Shape, options: Required<TypeOptions>, out: string[]): void {
  if (shape.items) renderShape(shape.items, options, out)
  // A list or a scalar has no members to hang a name on; the root alias that
  // covers it is emitted by the caller, which is the only place that knows it.
  if (!shape.members) return
  if (shape.name === null) return
  for (const child of shape.members.values()) renderShape(child, options, out)

  const rows: string[] = []
  for (const [key, child] of shape.members) {
    const optional = child.optional || (child.nullable && options.nullPolicy === 'optional') ? '?' : ''
    const prefix = options.readonly ? 'readonly ' : ''
    const tail = options.semicolons ? ';' : ''
    rows.push(`${options.indent}${prefix}${propertyKey(key)}${optional}: ${memberType(child, options)}${tail}`)
  }
  if (rows.length === 0) {
    out.push(`${options.exports ? 'export ' : ''}type ${shape.name} = Record<string, never>${options.semicolons ? ';' : ''}`)
    return
  }
  // Both flavours are written across several lines: `{ a: string b: number }` on
  // one line is not valid TypeScript, and a body that long is not readable anyway.
  const keyword = options.flavour === 'interface' ? `interface ${shape.name}` : `type ${shape.name} =`
  out.push(`${options.exports ? 'export ' : ''}${keyword} {\n${rows.join('\n')}\n}`)
}

export function inferTypes(value: unknown, options: TypeOptions = {}): TypeResult {
  // A JSON document can be a list or a single scalar, and both are worth typing,
  // so only a missing value is refused.
  if (value === undefined) return { ok: false, code: 'empty' }
  const root = options.root ?? 'Root'
  if (!identifier.test(root)) return { ok: false, code: 'badName' }

  const settings: Required<TypeOptions> = {
    root,
    rootAlias: null,
    flavour: options.flavour ?? 'interface',
    nullPolicy: options.nullPolicy ?? 'optional',
    readonly: options.readonly ?? false,
    semicolons: options.semicolons ?? true,
    indent: options.indent ?? '  ',
    exports: options.exports ?? false
  }

  const stats = { nullable: 0, warnings: [] as string[] }
  const ctx: Context = { names: new Names(), stats, extras: [] }
  const shape = shapeOf(value, pascal(root), ctx)

  const out: string[] = []
  if (shape.members) {
    renderShape(shape, settings, out)
  } else {
    // `interface` cannot describe a bare value, so a document whose root is a list
    // or a scalar gets a `type` alias and nothing else.
    const body = shape.items ? `Array<${inlineType(shape.items, settings)}>` : inlineType(shape, settings)
    out.push(`${settings.exports ? 'export ' : ''}type ${pascal(root)} = ${body}${settings.semicolons ? ';' : ''}`)
  }
  // A mixed array's element shapes have no path of their own, so they are declared
  // here, after everything the document itself contained.
  for (const extra of ctx.extras) {
    if (extra.name === null) continue
    renderShape(extra, settings, out)
  }

  const code = `${out.join('\n\n')}\n`
  const declared = [...code.matchAll(/(?:interface|type)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1])
  const fieldCount = (code.match(/^\s+(?:readonly\s+)?"?[\w$-]+"?\??:/gm) ?? []).length
  return {
    ok: true,
    code,
    names: declared,
    fieldCount,
    nullableFields: stats.nullable,
    warnings: [...new Set(stats.warnings)]
  }
}