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
      const existing = getOwnDataValue(cursor, key)
      const array = isSafeWritableArray(existing) ? existing : []
      setOwnValue(cursor, key, array)

      if (isLast) {
        setOwnValue(array, arrayIndex, value)
        return
      }

      const existingEntry = getOwnDataValue(array, arrayIndex)
      const nextEntry = isSafeWritableRecord(existingEntry) ? existingEntry : {}
      setOwnValue(array, arrayIndex, nextEntry)
      cursor = nextEntry as Record<string, unknown>
      continue
    }

    if (isLast) {
      setOwnValue(cursor, key, value)
      return
    }

    const existing = getOwnDataValue(cursor, key)
    const nextCursor = isSafeWritableRecord(existing) ? existing : {}
    setOwnValue(cursor, key, nextCursor)
    cursor = nextCursor as Record<string, unknown>
  }
}

function getOwnDataValue(target: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)

  return descriptor && "value" in descriptor ? descriptor.value : undefined
}

function isSafeWritableArray(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    !isPrototypeObject(value)
  )
}

function isSafeWritableRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)

  return (
    (prototype === Object.prototype || prototype === null) &&
    !isPrototypeObject(value)
  )
}

function isPrototypeObject(value: object): boolean {
  const constructorDescriptor = Object.getOwnPropertyDescriptor(
    value,
    "constructor",
  )

  return (
    constructorDescriptor !== undefined &&
    "value" in constructorDescriptor &&
    typeof constructorDescriptor.value === "function" &&
    constructorDescriptor.value.prototype === value
  )
}

function setOwnValue(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}
