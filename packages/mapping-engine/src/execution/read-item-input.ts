import type { Hl7Item } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { readSource } from "../source-lookup.js"
import type { ItemInput } from "./types.js"

export function readItemInput(
  item: Hl7Item,
  parsedMessage: ParsedHl7Message,
  itemOutputs: ReadonlyMap<string, unknown>,
): ItemInput {
  if (item.sources.length > 0) {
    const sourceReads = item.sources.map((source) =>
      readSource(parsedMessage, source),
    )

    return {
      values: sourceReads.map((sourceRead) => sourceRead.value),
      sourceReads,
    }
  }

  return {
    values: item.dependsOn.map((dependencyId) => itemOutputs.get(dependencyId)),
    sourceReads: [],
  }
}
