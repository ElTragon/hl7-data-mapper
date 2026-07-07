import { z } from "zod"

import { Hl7ItemSetSchema } from "./hl7-item.js"

export const ClientProfileStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
])

export const ClientProfileSchema = z
  .object({
    clientId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.number().int().positive(),
    status: ClientProfileStatusSchema,
    displayName: z.string().min(1),
    description: z.string().nullable().optional(),
    hl7Version: z.literal("2.5.1"),
    messageType: z.literal("OML^O21"),
    messageStructure: z.literal("OML_O21"),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    publishedAt: z.string().nullable().optional(),
    archivedAt: z.string().nullable().optional(),
    basedOnProfileVersion: z.number().int().positive().nullable().optional(),
    itemSet: Hl7ItemSetSchema,
  })
  .superRefine((profile, context) => {
    if (profile.itemSet.clientId !== profile.clientId) {
      context.addIssue({
        code: "custom",
        message: `Profile itemSet clientId "${profile.itemSet.clientId}" does not match profile clientId "${profile.clientId}".`,
        path: ["itemSet", "clientId"],
      })
    }

    if (profile.itemSet.hl7Version !== profile.hl7Version) {
      context.addIssue({
        code: "custom",
        message: `Profile itemSet HL7 version "${profile.itemSet.hl7Version}" does not match profile HL7 version "${profile.hl7Version}".`,
        path: ["itemSet", "hl7Version"],
      })
    }

    if (profile.itemSet.messageType !== profile.messageType) {
      context.addIssue({
        code: "custom",
        message: `Profile itemSet message type "${profile.itemSet.messageType}" does not match profile message type "${profile.messageType}".`,
        path: ["itemSet", "messageType"],
      })
    }

    if (profile.status === "draft") {
      if (profile.publishedAt) {
        context.addIssue({
          code: "custom",
          message: "Draft profiles must not have publishedAt set.",
          path: ["publishedAt"],
        })
      }

      if (profile.archivedAt) {
        context.addIssue({
          code: "custom",
          message: "Draft profiles must not have archivedAt set.",
          path: ["archivedAt"],
        })
      }
    }

    if (profile.status === "published" && !profile.publishedAt) {
      context.addIssue({
        code: "custom",
        message: "Published profiles must have publishedAt set.",
        path: ["publishedAt"],
      })
    }

    if (profile.status === "published" && profile.archivedAt) {
      context.addIssue({
        code: "custom",
        message: "Published profiles must not have archivedAt set.",
        path: ["archivedAt"],
      })
    }

    if (profile.status === "archived") {
      if (!profile.publishedAt) {
        context.addIssue({
          code: "custom",
          message: "Archived profiles must have publishedAt set.",
          path: ["publishedAt"],
        })
      }

      if (!profile.archivedAt) {
        context.addIssue({
          code: "custom",
          message: "Archived profiles must have archivedAt set.",
          path: ["archivedAt"],
        })
      }
    }
  })

export function canEditClientProfile(profile: ClientProfile): boolean {
  return profile.status === "draft"
}

export function canExecuteClientProfile(profile: ClientProfile): boolean {
  return profile.status === "draft" || profile.status === "published"
}

export type ClientProfileStatus = z.infer<typeof ClientProfileStatusSchema>
export type ClientProfile = z.infer<typeof ClientProfileSchema>
