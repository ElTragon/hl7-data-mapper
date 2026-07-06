import {
  ArrowRight,
  Braces,
  CheckCircle2,
  FileCheck2,
  FileText,
  ShieldCheck,
  Waypoints,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const workflow = [
  {
    title: "Provide a message",
    description: "Upload, paste, or generate a synthetic HL7 v2 lab order.",
    icon: FileText,
  },
  {
    title: "Verify the extraction",
    description: "Review every value beside its segment, field, and component.",
    icon: FileCheck2,
  },
  {
    title: "Publish the mapping",
    description:
      "Save versioned, client-specific hl7Items and export the report.",
    icon: Waypoints,
  },
]

function App() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
          <a
            className="flex items-center gap-3"
            href="/"
            aria-label="HL7 Data Mapper home"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-teal-300">
              H7
            </span>
            <span>
              <strong className="block text-sm leading-tight">
                HL7 Data Mapper
              </strong>
              <span className="block text-xs text-muted-foreground">
                Client mapping workspace
              </span>
            </span>
          </a>
          <Badge variant="outline">
            <ShieldCheck data-icon="inline-start" />
            Synthetic data only
          </Badge>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,oklch(0.9_0.08_190_/_0.45),transparent_35%)]" />
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:py-28">
            <div>
              <Badge className="mb-5" variant="secondary">
                HL7 v2 onboarding
              </Badge>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Turn messy HL7 messages into verified client mappings.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                Inspect source data, confirm every extracted field, and preserve
                the exact mapping recipe used for each client.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href="#workflow">
                    Explore the workflow
                    <ArrowRight data-icon="inline-end" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#architecture">View the approach</a>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-teal-600" />
                  Field-level provenance
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-teal-600" />
                  Versioned client rules
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-teal-600" />
                  Reproducible reports
                </span>
              </div>
            </div>

            <Card className="border-0 bg-slate-950 text-slate-100 ring-slate-800">
              <CardHeader className="border-b border-slate-800">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                  <Braces className="size-4 text-teal-300" />
                  Mapping preview
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Every output value remains traceable to its source.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto text-xs leading-6 text-slate-300 sm:text-sm">
                  <code>{`{
  "target": "patient.name.family",
  "operation": "extract",
  "source": {
    "segment": "PID",
    "field": 5,
    "component": 1
  },
  "transform": "trim"
}`}</code>
                </pre>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-8 border-b py-20">
          <div className="mx-auto max-w-6xl px-5 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-teal-700">
                Guided implementation
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                One clear path from message to handoff.
              </h2>
              <p className="mt-4 text-muted-foreground">
                The workflow mirrors how a solutions engineer investigates,
                validates, and documents a new healthcare integration.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {workflow.map(({ title, description, icon: Icon }, index) => (
                <Card key={title}>
                  <CardHeader>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        0{index + 1}
                      </span>
                    </div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="architecture" className="scroll-mt-8 py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="text-sm font-medium text-teal-700">
                Built deliberately
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Explainable by default.
              </h2>
            </div>
            <p className="leading-7 text-muted-foreground">
              Client mappings are modeled as small, testable operations instead
              of hidden overrides. The public demo uses synthetic messages and
              avoids persisting uploaded patient data.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>HL7 Data Mapper</span>
          <span>HIPAA-aware design · Synthetic portfolio data only</span>
        </div>
      </footer>
    </div>
  )
}

export default App
