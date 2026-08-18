export function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function getUtf8ByteLength(value: string): number {
  let byteLength = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) byteLength += 1
    else if (codePoint <= 0x7ff) byteLength += 2
    else if (codePoint <= 0xffff) byteLength += 3
    else byteLength += 4
  }
  return byteLength
}
