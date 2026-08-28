import { z } from "zod"

export const MAX_NORMALIZED_TARGET_ARRAY_INDEX = 1023

const NORMALIZED_TARGET_ROOTS = new Set([
  "message",
  "sender",
  "patient",
  "coverages",
  "guarantor",
  "labOrders",
])
const FORBIDDEN_NORMALIZED_TARGET_COMPONENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
])
const NORMALIZED_TARGET_COMPONENT_PATTERN =
  /^([a-z][A-Za-z0-9]*)(?:\[(0|[1-9]\d*)\])?$/

export const NormalizedTargetPathSchema = z
  .string()
  .superRefine((path, context) => {
    const components = path.split(".")
    const parsedComponents: RegExpMatchArray[] = []

    for (const component of components) {
      const key = component.replace(/\[.*$/, "")

      if (FORBIDDEN_NORMALIZED_TARGET_COMPONENTS.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Normalized target path component "${key}" is not allowed.`,
        })
        return
      }

      const parsedComponent = component.match(
        NORMALIZED_TARGET_COMPONENT_PATTERN,
      )
      if (!parsedComponent) {
        context.addIssue({
          code: "custom",
          message:
            "Normalized target paths must use lower-camel dot components with optional canonical array indexes.",
        })
        return
      }

      parsedComponents.push(parsedComponent)
    }

    const root = parsedComponents[0]?.[1]
    if (!root || !NORMALIZED_TARGET_ROOTS.has(root)) {
      context.addIssue({
        code: "custom",
        message: `Normalized target path root "${root ?? ""}" is not allowed.`,
      })
      return
    }

    for (const parsedComponent of parsedComponents) {
      const arrayIndex = parsedComponent[2]
      if (
        arrayIndex !== undefined &&
        Number(arrayIndex) > MAX_NORMALIZED_TARGET_ARRAY_INDEX
      ) {
        context.addIssue({
          code: "custom",
          message: `Normalized target array indexes must not exceed ${MAX_NORMALIZED_TARGET_ARRAY_INDEX}.`,
        })
        return
      }
    }
  })

export type NormalizedTargetPath = z.infer<typeof NormalizedTargetPathSchema>
