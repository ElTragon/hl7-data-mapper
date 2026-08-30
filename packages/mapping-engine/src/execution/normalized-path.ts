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
      const array = cloneOwnDataArray(existing)
      setOwnValue(cursor, key, array)

      if (isLast) {
        setOwnValue(array, arrayIndex, value)
        return
      }

      const existingEntry = getOwnDataValue(array, arrayIndex)
      const nextEntry = cloneOwnDataRecord(existingEntry)
      setOwnValue(array, arrayIndex, nextEntry)
      cursor = nextEntry as Record<string, unknown>
      continue
    }

    if (isLast) {
      setOwnValue(cursor, key, value)
      return
    }

    const existing = getOwnDataValue(cursor, key)
    const nextCursor = cloneOwnDataRecord(existing)
    setOwnValue(cursor, key, nextCursor)
    cursor = nextCursor as Record<string, unknown>
  }
}

function getOwnDataValue(target: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)

  return descriptor && "value" in descriptor ? descriptor.value : undefined
}

function cloneOwnDataArray(value: unknown): unknown[] {
  const clone: unknown[] = []

  if (Array.isArray(value)) {
    copyOwnEnumerableDataProperties(value, clone)

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
    if (
      lengthDescriptor &&
      "value" in lengthDescriptor &&
      typeof lengthDescriptor.value === "number"
    ) {
      clone.length = lengthDescriptor.value
    }
  }

  return clone
}

function cloneOwnDataRecord(value: unknown): Record<string, unknown> {
  const clone: Record<string, unknown> = {}

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return clone
  }

  const prototype = Object.getPrototypeOf(value)

  if (prototype === Object.prototype || prototype === null) {
    copyOwnEnumerableDataProperties(value, clone)
  }

  return clone
}

function copyOwnEnumerableDataProperties(source: object, target: object): void {
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)

    if (descriptor?.enumerable && "value" in descriptor) {
      setOwnValue(target, key, descriptor.value)
    }
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
