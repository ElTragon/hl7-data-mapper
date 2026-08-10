export function setValueAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".")
  let cursor: Record<string, unknown> = target

  for (const [index, part] of parts.entries()) {
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
    const key = arrayMatch?.[1] ?? part
    const isLast = index === parts.length - 1

    if (!key) {
      return
    }

    if (arrayMatch) {
      const arrayIndex = Number(arrayMatch[2])
      const existing = cursor[key]
      const array = Array.isArray(existing) ? existing : []
      cursor[key] = array

      if (isLast) {
        array[arrayIndex] = value
        return
      }

      array[arrayIndex] =
        typeof array[arrayIndex] === "object" && array[arrayIndex] !== null
          ? array[arrayIndex]
          : {}
      cursor = array[arrayIndex] as Record<string, unknown>
      continue
    }

    if (isLast) {
      cursor[key] = value
      return
    }

    cursor[key] =
      typeof cursor[key] === "object" && cursor[key] !== null ? cursor[key] : {}
    cursor = cursor[key] as Record<string, unknown>
  }
}
