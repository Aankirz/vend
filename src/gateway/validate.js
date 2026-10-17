// Minimal JSON-Schema subset: top-level object, `required`, and per-property `type`.
// ponytail: no nested schemas/enums/formats; swap in a real validator if sellers need them.
const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
}

const matches = (type, value) => [].concat(type).some((t) => TYPE_CHECKS[t]?.(value) ?? true)

// Returns an error string, or null when the input is acceptable.
export function validateInput(schema = {}, input) {
  if (!TYPE_CHECKS.object(input)) return 'body must be a JSON object'
  for (const key of schema.required || []) {
    if (!(key in input)) return `missing required field "${key}"`
  }
  for (const [key, prop] of Object.entries(schema.properties || {})) {
    if (key in input && prop?.type && !matches(prop.type, input[key])) return `field "${key}" must be ${[].concat(prop.type).join(' or ')}`
  }
  return null
}
