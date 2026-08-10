import {
  GUIDED_REVIEW_STEPS,
  type GuidedReviewProgress,
  type GuidedReviewStepId,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"

export type GuidedReviewStepSummary = {
  readonly id: GuidedReviewStepId
  readonly title: string
  readonly progress: GuidedReviewProgress
  readonly isComplete: boolean
  readonly hasBlockingIssues: boolean
}

export type GuidedReviewNavigation = {
  readonly steps: readonly GuidedReviewStepSummary[]
  readonly activeStepId: GuidedReviewStepId
  readonly nextStepId: GuidedReviewStepId | null
}

export type BuildGuidedReviewNavigationInput = {
  readonly fields: readonly ReviewableField[]
  readonly activeStepId?: GuidedReviewStepId
}

export function calculateGuidedReviewProgress(
  fields: readonly ReviewableField[],
): GuidedReviewProgress {
  return {
    total: fields.length,
    unreviewed: fields.filter((field) => field.reviewStatus === "unreviewed")
      .length,
    confirmed: fields.filter((field) => field.reviewStatus === "confirmed")
      .length,
    incorrect: fields.filter((field) => field.reviewStatus === "incorrect")
      .length,
    mappingChanged: fields.filter(
      (field) => field.reviewStatus === "mapping_changed",
    ).length,
    unavailable: fields.filter((field) => field.reviewStatus === "unavailable")
      .length,
  }
}

export function buildGuidedReviewNavigation({
  fields,
  activeStepId = "patient",
}: BuildGuidedReviewNavigationInput): GuidedReviewNavigation {
  const steps = GUIDED_REVIEW_STEPS.map((step) => {
    const stepFields = fields.filter((field) => field.stepId === step.id)
    const progress = calculateGuidedReviewProgress(stepFields)
    const hasBlockingIssues = stepFields.some((field) =>
      field.validation.some((issue) => issue.severity === "error"),
    )

    return {
      id: step.id,
      title: step.title,
      progress,
      isComplete:
        progress.total > 0 &&
        progress.unreviewed === 0 &&
        progress.incorrect === 0 &&
        !hasBlockingIssues,
      hasBlockingIssues,
    }
  })
  const nextStepId =
    steps.find(
      (step) =>
        step.id !== activeStepId && !step.isComplete && step.progress.total > 0,
    )?.id ?? null

  return { steps, activeStepId, nextStepId }
}
