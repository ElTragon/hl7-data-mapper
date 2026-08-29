import { NormalizedTargetPathSchema } from "@hl7-data-mapper/contracts"

export function setValueAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parsedPath = NormalizedTargetPathSchema.parse(path)
  const parts = parsedPath.split(".")
  let cursor: Record<string, unknown> = target

  for (const [index, part] of parts.entries()) {
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
    const key = arrayMatch?.[1] ?? part
    const isLast = index === parts.length - 1

    if (arrayMatch) {
      const arrayIndex = Number(arrayMatch[2])
      const existing = Object.hasOwn(cursor, key) ? cursor[key] : undefined
      const array = Array.isArray(existing) ? existing : []
      setOwnValue(cursor, key, array)

      if (isLast) {
        setOwnValue(array, arrayIndex, value)
        return
      }

      const existingEntry = Object.hasOwn(array, arrayIndex)
        ? array[arrayIndex]
        : undefined
      const nextEntry =
        typeof existingEntry === "object" && existingEntry !== null
          ? existingEntry
          : {}
      setOwnValue(array, arrayIndex, nextEntry)
      cursor = nextEntry as Record<string, unknown>
      continue
    }

    if (isLast) {
      setOwnValue(cursor, key, value)
      return
    }

    const existing = Object.hasOwn(cursor, key) ? cursor[key] : undefined
    const nextCursor =
      typeof existing === "object" && existing !== null ? existing : {}
    setOwnValue(cursor, key, nextCursor)
    cursor = nextCursor as Record<string, unknown>
  }
}

function setOwnValue(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}
