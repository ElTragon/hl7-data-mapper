import { readFile } from "node:fs/promises"
import { expect, test, type Download, type Page } from "@playwright/test"
import { unzipSync } from "fflate"

const fixture = new URL(
  "../../../../fixtures/valid/oml-o21-basic.hl7",
  import.meta.url,
)
const storageKey = "hl7-data-mapper:demo-storage:v3"
const uploadedMrn = "MRN-UPLOADED-001"

async function uploadDistinctSample(page: Page) {
  const sample = await readFile(fixture, "utf8")
  expect(sample).toContain("MRN-104892")
  await page.getByLabel("Upload HL7 file").setInputFiles({
    name: "synthetic.hl7",
    mimeType: "text/plain",
    buffer: Buffer.from(sample.replace("MRN-104892", uploadedMrn)),
  })
  await expect(page.getByLabel("Editable HL7 message")).toHaveValue(
    new RegExp(uploadedMrn),
  )
}

async function parseSample(page: Page) {
  await page.goto("/")
  await page.getByRole("button", { name: "Parse message" }).click()
  await expect(page.getByText("Message can continue to review")).toBeVisible()
}

async function correctPatientName(page: Page) {
  await page.getByRole("button", { name: "Select Patient name" }).click()
  await page
    .getByRole("group", { name: "Map selected source to" })
    .getByRole("button", { name: "Middle" })
    .click()
  await page.getByLabel("Find a source").fill("PID-5.2")
  await page
    .locator('[data-source-option="PID-5.2"]')
    .getByRole("button", { name: "Select" })
    .click()
  await page.getByRole("button", { name: "Use this source" }).click()
  const nameCard = page
    .locator("[data-review-field-card]")
    .filter({ has: page.getByRole("button", { name: "Select Patient name" }) })
  await expect(nameCard).toContainText("Mapping changed")
  return nameCard
}

async function readZip(download: Download) {
  const entries = unzipSync(
    new Uint8Array(await readFile(await download.path())),
  )
  const json = (name: string) => {
    const entry = Object.entries(entries).find(([path]) =>
      path.endsWith(`/${name}`),
    )?.[1]
    expect(entry, `ZIP contains ${name}`).toBeDefined()
    return JSON.parse(new TextDecoder().decode(entry))
  }
  return {
    manifest: json("manifest.json"),
    decisions: json("review-decisions.json"),
    items: json("hl7-items.json"),
    normalized: json("normalized-data.json"),
    validation: json("validation-results.json"),
  }
}

test("upload, correct, reload, and export retain the reviewed source", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto("/")
  expect(await page.title()).toBe("HL7 Data Mapper")
  await uploadDistinctSample(page)
  await expect(page.getByLabel("Editable HL7 message")).toContainText("OML^O21")
  await page.getByRole("button", { name: "Parse message" }).click()
  const nameCard = await correctPatientName(page)
  await nameCard.getByRole("button", { name: "Confirm" }).click()
  await expect(nameCard).toContainText("Confirmed")
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  )
  expect(stored).not.toContain("MSH|")

  await page.reload()
  await uploadDistinctSample(page)
  await page.getByRole("button", { name: "Parse message" }).click()
  await expect(nameCard).toContainText("Confirmed")
  const downloadPromise = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP" })
    .click()
  const report = await readZip(await downloadPromise)
  expect(report.manifest.review.status).toBe("interim")
  expect(
    report.decisions.find(
      (decision: { fieldId: string }) => decision.fieldId === "patient-name",
    ),
  ).toMatchObject({ reviewStatus: "confirmed", correctionApplied: true })
  expect(
    report.items.find((item: { id: string }) => item.id === "patient-name")
      .sources,
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: "PID-5.2" })]),
  )
  expect(report.validation).toHaveProperty("warnings")
  expect(report.normalized.patient.identifiers[0].value).toBe(uploadedMrn)
  expect(report.normalized.patient.name.middle).toBe("Elena")
  expect(pageErrors).toEqual([])
  await nameCard.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath("review-desktop.png") })
})

test("two tabs detect a stale save and reload the newer review", async ({
  context,
}) => {
  const first = await context.newPage()
  const second = await context.newPage()
  await parseSample(first)
  await parseSample(second)
  const firstName = first
    .locator("[data-review-field-card]")
    .filter({ has: first.getByRole("button", { name: "Select Patient name" }) })
  const secondMrn = second
    .locator("[data-review-field-card]")
    .filter({ has: second.getByRole("button", { name: "Select Patient MRN" }) })
  await firstName.getByRole("button", { name: "Confirm" }).click()
  await expect(firstName).toContainText("Confirmed")
  await expect(first.getByText("Browser storage issue")).toBeVisible()
  const unchanged = await first.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  )
  expect(
    unchanged.reviewDecisions.find(
      (decision: { fieldId: string }) => decision.fieldId === "patient-name",
    ).reviewStatus,
  ).toBe("unreviewed")
  await secondMrn.getByRole("button", { name: "Confirm" }).click()
  await expect(secondMrn).toContainText("Confirmed")
  await first.getByRole("button", { name: "Reload stored review" }).click()
  await expect(first.getByText("Browser storage issue")).toHaveCount(0)
  await expect(firstName).toContainText("Needs review")
  const firstMrn = first
    .locator("[data-review-field-card]")
    .filter({ has: first.getByRole("button", { name: "Select Patient MRN" }) })
  await expect(firstMrn).toContainText("Confirmed")
  const snapshot = await first.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  )
  expect(
    snapshot.reviewDecisions.find(
      (decision: { fieldId: string }) =>
        decision.fieldId === "patient-identifier-mrn",
    ).reviewStatus,
  ).toBe("confirmed")
})

test("reset clears stored decisions and corrections after reload", async ({
  page,
}) => {
  await parseSample(page)
  const nameCard = await correctPatientName(page)
  await nameCard.getByRole("button", { name: "Confirm" }).click()
  await expect(nameCard).toContainText("Confirmed")
  const beforeReset = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  )
  expect(beforeReset.appliedCorrections).toHaveLength(1)
  await page.getByRole("button", { name: "Reset demo draft" }).click()
  const snapshot = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  )
  expect(snapshot.reviewDecisions).toEqual([])
  expect(snapshot.correctionIntents).toEqual([])
  expect(snapshot.appliedCorrections).toEqual([])
  await page.reload()
  await page.getByRole("button", { name: "Parse message" }).click()
  await expect(nameCard).toContainText("Needs review")
})

test("review controls remain usable at a phone width", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await parseSample(page)
  await expect(
    page.getByRole("button", { name: "Reset demo draft" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Download interim report", exact: true }),
  ).toBeVisible()
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1,
      )
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className}`),
  }))
  expect(
    overflow.documentWidth,
    overflow.offenders.join("\n"),
  ).toBeLessThanOrEqual(overflow.viewportWidth)
  await page
    .getByRole("button", { name: "Reset demo draft" })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath("review-phone.png") })
})
