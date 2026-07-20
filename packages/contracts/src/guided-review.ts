import { z } from "zod"

import { Hl7ItemSchema } from "./hl7-item.js"
import { TransformStepSchema } from "./normalized-field.js"
import { NormalizedOutputSectionSchema } from "./normalized-output.js"
import {
  ReviewDecisionReasonSchema,
  ReviewNoteSchema,
} from "./review-decision.js"
import { ReviewStatusSchema } from "./review-status.js"
import { SourceReferenceSchema } from "./source-reference.js"
import { ValidationIssueSchema } from "./validation.js"

export const GuidedReviewStepIdSchema = z.enum([
  "patient",
  "sender",
  "coverageGuarantor",
  "labOrders",
  "warnings",
])

export const GUIDED_REVIEW_STEPS = [
  {
    id: "patient",
    title: "Patient information",
    normalizedSections: ["patient"],
  },
  {
    id: "sender",
    title: "Sender/client information",
    normalizedSections: ["sender"],
  },
  {
    id: "coverageGuarantor",
    title: "Coverage and guarantor",
    normalizedSections: ["coverage", "guarantor"],
  },
  {
    id: "labOrders",
    title: "Lab orders",
    normalizedSections: ["labOrders"],
  },
  {
    id: "warnings",
    title: "Warnings and missing fields",
    normalizedSections: ["exceptions"],
  },
] as const

export const GuidedReviewStepSchema = z.object({
  id: GuidedReviewStepIdSchema,
  title: z.string().min(1),
  normalizedSections: z.array(NormalizedOutputSectionSchema).min(1),
})

export const ReviewSourceCandidateSchema = z.object({
  source: SourceReferenceSchema,
  rawSegment: z.string().nullable().optional(),
  previewValue: z.unknown().nullable().optional(),
  reason: z.string().nullable().optional(),
})

export const ReviewCorrectionIntentSchema = z.object({
  targetHl7ItemId: z.string().min(1),
  replacementSource: SourceReferenceSchema.nullable().optional(),
  replacementHl7Item: Hl7ItemSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const ReviewableFieldSchema = z.object({
  id: z.string().min(1),
  stepId: GuidedReviewStepIdSchema,
  section: NormalizedOutputSectionSchema,
  normalizedPath: z.string().min(1),
  label: z.string().min(1),
  value: z.unknown().nullable(),
  hl7ItemId: z.string().min(1).nullable(),
  primarySource: SourceReferenceSchema.nullable(),
  sources: z.array(SourceReferenceSchema).default([]),
  rawSegment: z.string().nullable().optional(),
  transformHistory: z.array(TransformStepSchema).default([]),
  validation: z.array(ValidationIssueSchema).default([]),
  warnings: z.array(z.string()).default([]),
  reviewStatus: ReviewStatusSchema.default("unreviewed"),
  reasonCode: ReviewDecisionReasonSchema.nullable().optional(),
  reviewNote: ReviewNoteSchema.nullable().optional(),
  sourceCandidates: z.array(ReviewSourceCandidateSchema).default([]),
  correctionIntent: ReviewCorrectionIntentSchema.nullable().optional(),
})

export const GuidedReviewProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  unreviewed: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  incorrect: z.number().int().nonnegative(),
  mappingChanged: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
})

export type GuidedReviewStepId = z.infer<typeof GuidedReviewStepIdSchema>
export type GuidedReviewStep = z.infer<typeof GuidedReviewStepSchema>
export type ReviewSourceCandidate = z.infer<typeof ReviewSourceCandidateSchema>
export type ReviewCorrectionIntent = z.infer<
  typeof ReviewCorrectionIntentSchema
>
export type ReviewableField = z.infer<typeof ReviewableFieldSchema>
export type GuidedReviewProgress = z.infer<typeof GuidedReviewProgressSchema>
