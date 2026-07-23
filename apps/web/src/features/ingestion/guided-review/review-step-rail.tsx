import { AlertCircle, CheckCircle2, CircleDot } from "lucide-react"

import {
  type GuidedReviewStepId,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"
import { buildGuidedReviewNavigation } from "@hl7-data-mapper/mapping-engine"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import { getStepPercent } from "./review-workspace-model"

type ReviewStepRailProps = {
  readonly activeStepId: GuidedReviewStepId
  readonly fields: readonly ReviewableField[]
  readonly onActiveStepChange: (stepId: GuidedReviewStepId) => void
}

export function ReviewStepRail({
  activeStepId,
  fields,
  onActiveStepChange,
}: ReviewStepRailProps) {
  const navigation = buildGuidedReviewNavigation({
    fields,
    activeStepId,
  })

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Review sections</CardTitle>
        <CardDescription>Walk through each mapping area.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {navigation.steps.map((step) => (
          <button
            key={step.id}
            type="button"
            className={cn(
              "rounded-lg border p-3 text-left transition hover:border-teal-300",
              step.id === activeStepId
                ? "border-teal-500 bg-teal-50/70"
                : "bg-background",
            )}
            onClick={() => onActiveStepChange(step.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{step.title}</span>
              {step.hasBlockingIssues ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : step.isComplete ? (
                <CheckCircle2 className="size-4 text-teal-700" />
              ) : (
                <CircleDot className="size-4 text-muted-foreground" />
              )}
            </div>
            <Progress className="mt-3" value={getStepPercent(step.progress)} />
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{step.progress.confirmed} confirmed</span>
              <span>{step.progress.unreviewed} open</span>
              <span>{step.progress.mappingChanged} changed</span>
              <span>{step.progress.unavailable} unavailable</span>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
