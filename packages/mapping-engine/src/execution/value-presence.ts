export function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}
