export type TemporalPrecision =
  "year" | "month" | "day" | "hour" | "minute" | "second" | "fraction"
export type TemporalValue = {
  readonly value: string
  readonly precision: TemporalPrecision
  readonly offset: string | null
}

// Do not use Date: it normalizes impossible calendar dates and assumes a zone.
export function parseTemporal(value: unknown): TemporalValue | null {
  if (typeof value !== "string") return null
  const match =
    /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\.\d{1,4})?([+-]\d{4})?$/.exec(
      value,
    )
  if (!match || match[0] !== value) return null
  const [, year, month, day, hour, minute, second, fraction, zone] = match
  if (!year || Number(year) === 0 || (fraction && !second) || (zone && !hour))
    return null
  const y = Number(year),
    m = Number(month),
    d = Number(day)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month && (m < 1 || m > 12)) return null
  if (day && (d < 1 || d > days[m - 1]!)) return null
  if (hour && Number(hour) > 23) return null
  if (minute && Number(minute) > 59) return null
  // Leap seconds are not supported by the demo's normalized representation.
  if (second && Number(second) > 59) return null
  let offset: string | null = null
  if (zone) {
    const hours = Number(zone.slice(1, 3)),
      minutes = Number(zone.slice(3))
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null
    offset = `${zone.slice(0, 3)}:${zone.slice(3)}`
  }
  const normalized =
    year +
    (month ? `-${month}` : "") +
    (day ? `-${day}` : "") +
    (hour ? `T${hour}` : "") +
    (minute ? `:${minute}` : "") +
    (second ? `:${second}` : "") +
    (fraction ?? "") +
    (offset ?? "")
  const precision: TemporalPrecision = fraction
    ? "fraction"
    : second
      ? "second"
      : minute
        ? "minute"
        : hour
          ? "hour"
          : day
            ? "day"
            : month
              ? "month"
              : "year"
  return { value: normalized, precision, offset }
}

export function normalizeDate(value: unknown): string | null {
  const parsed = parseTemporal(value)
  return parsed ? parsed.value.split("T")[0]! : null
}

export function normalizeTimestamp(value: unknown): string | null {
  return parseTemporal(value)?.value ?? null
}
