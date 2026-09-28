export const MAX_MESSAGE_BYTES = 1024 * 1024
export const INPUT_SIZE_ERROR =
  "Message exceeds the 1 MiB (1,048,576 byte) limit. Shorten the text or choose a smaller file."

export function exceedsMessageLimit(text: string): boolean {
  return new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES
}
