export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null
  }

  const compactDate = value.slice(0, 8)

  if (!/^\d{8}$/.test(compactDate)) {
    return null
  }

  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
}

export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?([+-]\d{4})?$/,
  )

  if (!match) {
    return null
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match
  const offset = formatTimezoneOffset(match[7])

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`
}

function formatTimezoneOffset(offset: string | undefined): string {
  if (!offset) {
    return "Z"
  }

  return `${offset.slice(0, 3)}:${offset.slice(3)}`
}
