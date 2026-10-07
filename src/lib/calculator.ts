/**
 * The expression evaluator behind the scientific calculator.
 *
 * A recursive-descent parser rather than `eval`, for two reasons that matter
 * here: the result has to carry the position of whatever went wrong so the page
 * can point at it, and the set of things a reader can type has to be a decision
 * instead of a side effect of the host environment. Unknown names are errors,
 * not property lookups.
 */

export type AngleMode = 'deg' | 'rad'

/** Codes the UI maps to `toolUi.scientific-calculator.errors.*`. */
export type CalculatorErrorCode =
  | 'empty'
  | 'unexpected'
  | 'unbalanced'
  | 'unknownName'
  | 'badArguments'
  | 'notFinite'

export type CalculatorResult =
  | { ok: true; value: number }
  | { ok: false; code: CalculatorErrorCode; position: number }

type Token =
  | { kind: 'number'; value: number; at: number }
  | { kind: 'name'; value: string; at: number }
  | { kind: 'operator'; value: string; at: number }
  | { kind: 'open'; at: number }
  | { kind: 'close'; at: number }
  | { kind: 'comma'; at: number }

const functionArity: Record<string, number> = {
  sqrt: 1,
  abs: 1,
  exp: 1,
  ln: 1,
  log: 1,
  log2: 1,
  floor: 1,
  ceil: 1,
  round: 1,
  sign: 1,
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  sinh: 1,
  cosh: 1,
  tanh: 1,
  pow: 2,
  atan2: 2,
  min: -1,
  max: -1,
  hypot: -1
}

const constants: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2
}

const degreesToRadians = Math.PI / 180

function isDigit(character: string) {
  return character >= '0' && character <= '9'
}

export function tokenize(input: string): { tokens: Token[]; error?: CalculatorResult } {
  const tokens: Token[] = []
  let index = 0
  while (index < input.length) {
    const character = input[index]
    if (character === ' ' || character === '\t' || character === '\n') {
      index += 1
      continue
    }
    if (isDigit(character) || (character === '.' && isDigit(input[index + 1] ?? ''))) {
      const start = index
      while (index < input.length && (isDigit(input[index]) || input[index] === '.')) index += 1
      // Scientific notation, but only when the exponent really is there, so that
      // `2e` is read as the number 2 followed by the name `e`.
      if ((input[index] === 'e' || input[index] === 'E') && (isDigit(input[index + 1] ?? '') || ((input[index + 1] === '+' || input[index + 1] === '-') && isDigit(input[index + 2] ?? '')))) {
        index += 2
        while (index < input.length && isDigit(input[index])) index += 1
      }
      const value = Number(input.slice(start, index))
      if (!Number.isFinite(value)) return { tokens, error: { ok: false, code: 'notFinite', position: start } }
      tokens.push({ kind: 'number', value, at: start })
      continue
    }
    if (/[a-zA-Z_]/.test(character)) {
      const start = index
      while (index < input.length && /[a-zA-Z0-9_]/.test(input[index])) index += 1
      tokens.push({ kind: 'name', value: input.slice(start, index).toLowerCase(), at: start })
      continue
    }
    if (character === '(') {
      tokens.push({ kind: 'open', at: index })
      index += 1
      continue
    }
    if (character === ')') {
      tokens.push({ kind: 'close', at: index })
      index += 1
      continue
    }
    if (character === ',') {
      tokens.push({ kind: 'comma', at: index })
      index += 1
      continue
    }
    if ('+-*/%^'.includes(character)) {
      tokens.push({ kind: 'operator', value: character, at: index })
      index += 1
      continue
    }
    return { tokens, error: { ok: false, code: 'unexpected', position: index } }
  }
  return { tokens }
}

type Evaluated = { value: number } | { error: CalculatorResult }

function fail(code: CalculatorErrorCode, position: number): Evaluated {
  return { error: { ok: false, code, position } }
}

/** Trigonometry reads degrees or radians depending on the switch the reader set. */
function toRadians(value: number, mode: AngleMode) {
  return mode === 'deg' ? value * degreesToRadians : value
}

function fromRadians(value: number, mode: AngleMode) {
  return mode === 'deg' ? value / degreesToRadians : value
}

function applyFunction(name: string, args: number[], mode: AngleMode, at: number): Evaluated {
  const arity = functionArity[name]
  if (arity === undefined) return fail('unknownName', at)
  const variadic = arity < 0
  if (variadic ? args.length < 1 : args.length !== arity) return fail('badArguments', at)
  const one = args[0]
  switch (name) {
    case 'sqrt':
      return one < 0 ? fail('notFinite', at) : { value: Math.sqrt(one) }
    case 'abs':
      return { value: Math.abs(one) }
    case 'exp':
      return { value: Math.exp(one) }
    case 'ln':
      return one <= 0 ? fail('notFinite', at) : { value: Math.log(one) }
    case 'log':
      return one <= 0 ? fail('notFinite', at) : { value: Math.log10(one) }
    case 'log2':
      return one <= 0 ? fail('notFinite', at) : { value: Math.log2(one) }
    case 'floor':
      return { value: Math.floor(one) }
    case 'ceil':
      return { value: Math.ceil(one) }
    case 'round':
      return { value: Math.round(one) }
    case 'sign':
      return { value: Math.sign(one) }
    case 'sin':
      return { value: Math.sin(toRadians(one, mode)) }
    case 'cos':
      return { value: Math.cos(toRadians(one, mode)) }
    case 'tan':
      return { value: Math.tan(toRadians(one, mode)) }
    case 'asin':
      return Math.abs(one) > 1 ? fail('notFinite', at) : { value: fromRadians(Math.asin(one), mode) }
    case 'acos':
      return Math.abs(one) > 1 ? fail('notFinite', at) : { value: fromRadians(Math.acos(one), mode) }
    case 'atan':
      return { value: fromRadians(Math.atan(one), mode) }
    case 'sinh':
      return { value: Math.sinh(one) }
    case 'cosh':
      return { value: Math.cosh(one) }
    case 'tanh':
      return { value: Math.tanh(one) }
    case 'pow':
      return { value: one ** args[1] }
    case 'atan2':
      return { value: fromRadians(Math.atan2(one, args[1]), mode) }
    case 'min':
      return { value: Math.min(...args) }
    case 'max':
      return { value: Math.max(...args) }
    case 'hypot':
      return { value: Math.hypot(...args) }
    default:
      return fail('unknownName', at)
  }
}

class Parser {
  private index = 0
  private readonly tokens: Token[]
  private readonly mode: AngleMode

  constructor(tokens: Token[], mode: AngleMode) {
    this.tokens = tokens
    this.mode = mode
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private take(): Token | undefined {
    return this.tokens[this.index++]
  }

  /** Leaves an operator behind when it is not the one the caller wants. */
  private eatOperator(...wanted: string[]) {
    const token = this.peek()
    if (token?.kind === 'operator' && wanted.includes(token.value)) {
      this.index += 1
      return token
    }
    return null
  }

  expression(): Evaluated {
    let left = this.term()
    if ('error' in left) return left
    for (;;) {
      const operator = this.eatOperator('+', '-')
      if (!operator) return left
      const right = this.term()
      if ('error' in right) return right
      left = { value: operator.value === '+' ? left.value + right.value : left.value - right.value }
    }
  }

  term(): Evaluated {
    let left = this.power()
    if ('error' in left) return left
    for (;;) {
      const operator = this.eatOperator('*', '/', '%')
      if (!operator) return left
      const right = this.power()
      if ('error' in right) return right
      if ((operator.value === '/' || operator.value === '%') && right.value === 0) return fail('notFinite', operator.at)
      left = {
        value:
          operator.value === '*' ? left.value * right.value : operator.value === '/' ? left.value / right.value : left.value % right.value
      }
    }
  }

  /** Right-associative, so `2^3^2` is 512 the way a calculator reads it. */
  power(): Evaluated {
    const base = this.unary()
    if ('error' in base) return base
    const operator = this.eatOperator('^')
    if (!operator) return base
    const exponent = this.power()
    if ('error' in exponent) return exponent
    const value = base.value ** exponent.value
    return Number.isFinite(value) ? { value } : fail('notFinite', operator.at)
  }

  unary(): Evaluated {
    const operator = this.eatOperator('-', '+')
    if (operator) {
      const operand = this.unary()
      return 'error' in operand ? operand : { value: operator.value === '-' ? -operand.value : operand.value }
    }
    return this.primary()
  }

  private arguments(at: number): { args: number[]; error?: CalculatorResult } {
    if (this.peek()?.kind !== 'open') return { args: [], error: { ok: false, code: 'badArguments', position: at } }
    this.index += 1
    const args: number[] = []
    if (this.peek()?.kind === 'close') {
      this.index += 1
      return { args }
    }
    for (;;) {
      const argument = this.expression()
      if ('error' in argument) return { args, error: argument.error }
      args.push(argument.value)
      const next = this.take()
      if (next?.kind === 'comma') continue
      if (next?.kind === 'close') return { args }
      return { args, error: { ok: false, code: 'unbalanced', position: next?.at ?? at } }
    }
  }

  primary(): Evaluated {
    const token = this.take()
    if (!token) return fail('unexpected', Math.max(0, this.tokens.length ? this.tokens[this.tokens.length - 1].at : 0))
    const value = this.readPrimary(token)
    if ('error' in value) return value
    // A `%` that ends the expression is a percent sign, not a remainder: `50%` is
    // half of something, while `5%2` is a modulo. Position is the only thing
    // that tells the two apart, so the rule has to be position.
    const next = this.peek()
    if (next?.kind === 'operator' && next.value === '%' && this.index === this.tokens.length - 1) {
      this.take()
      return { value: value.value / 100 }
    }
    return value
  }

  private readPrimary(token: Token): Evaluated {
    if (!token) return fail('unexpected', Math.max(0, this.tokens.length ? this.tokens[this.tokens.length - 1].at : 0))
    if (token.kind === 'number') return { value: token.value }
    if (token.kind === 'open') {
      const inner = this.expression()
      if ('error' in inner) return inner
      const close = this.take()
      return close?.kind === 'close' ? inner : fail('unbalanced', token.at)
    }
    if (token.kind === 'name') {
      if (this.peek()?.kind === 'open') {
        const { args, error } = this.arguments(token.at)
        if (error) return { error }
        return applyFunction(token.value, args, this.mode, token.at)
      }
      const constant = constants[token.value]
      return constant === undefined ? fail('unknownName', token.at) : { value: constant }
    }
    return fail('unexpected', token.at)
  }

  finish(): Evaluated {
    const value = this.expression()
    if ('error' in value) return value
    const leftover = this.peek()
    return leftover ? fail('unexpected', leftover.at) : value
  }
}

export function evaluate(input: string, mode: AngleMode = 'rad'): CalculatorResult {
  if (!input.trim()) return { ok: false, code: 'empty', position: 0 }
  const { tokens, error } = tokenize(input)
  if (error) return error
  const outcome = new Parser(tokens, mode).finish()
  if ('error' in outcome) return outcome.error
  if (!Number.isFinite(outcome.value)) return { ok: false, code: 'notFinite', position: input.length }
  return { ok: true, value: outcome.value }
}

/**
 * Renders a result the way a calculator display does: no trailing zeros, no
 * exponent for values a person would just write out, and no `1e21` standing in
 * for a number this tool is supposed to have computed.
 */
export function formatValue(value: number, significant = 12): string {
  if (value === 0) return '0'
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞'
  const magnitude = Math.abs(value)
  if (magnitude >= 1e15 || magnitude < 1e-9) return value.toExponential(8).replace(/\.?0+e/, 'e')
  const rounded = Number(value.toPrecision(significant))
  return String(rounded)
}

/** The names offered as buttons, split by what they do rather than by keyboard order. */
export const calculatorFunctions = {
  power: ['sqrt', 'pow', 'exp', 'ln', 'log', 'log2'],
  trig: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2'],
  hyperbolic: ['sinh', 'cosh', 'tanh'],
  rounding: ['abs', 'floor', 'ceil', 'round', 'sign'],
  group: ['min', 'max', 'hypot']
} as const

export const calculatorConstants = ['pi', 'e', 'tau', 'phi'] as const

export const calculatorOperators = ['+', '-', '*', '/', '%', '^'] as const