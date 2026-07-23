export function hasMeaningfulValue(value: unknown): boolean {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasMeaningfulValue(entry))
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      hasMeaningfulValue(entry),
    )
  }

  return true
}
