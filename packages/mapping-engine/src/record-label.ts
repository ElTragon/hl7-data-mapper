/** Label a record leaf relative to its array composer, using current indices. */
export function recordFieldLabel(
  parentLabel: string,
  parentPath: string,
  path: string,
): string {
  const suffix = path
    .slice(parentPath.length)
    .replace(/\[(\d+)\]/g, (_, index: string) => `.Record ${Number(index) + 1}`)
    .split(".")
    .filter(Boolean)
    .map((part) => {
      const words = part.replace(/([a-z])([A-Z])/g, "$1 $2")
      return words.charAt(0).toUpperCase() + words.slice(1)
    })
    .join(" · ")
  return `${parentLabel}: ${suffix}`
}
