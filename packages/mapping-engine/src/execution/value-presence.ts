export function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.every(isMissingValue)
  if (typeof value === "object")
    return Object.values(value).every(isMissingValue)
  return false
}
