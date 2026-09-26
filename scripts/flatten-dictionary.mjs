export function flatten(source, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else if (value && typeof value === 'object') flatten(value, path, out)
  }
  return out
}
