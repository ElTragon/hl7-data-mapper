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

async function fillSourceSearch(page: Page, searchText: string) {
  const sourceSearch = page.getByLabel("Find a source")
  if (!(await sourceSearch.isVisible())) {
    await page.getByRole("button", { name: /Search by path or value/ }).click()
  }
  await sourceSearch.fill(searchText)
}

async function correctPatientName(page: Page) {
  await page.getByRole("button", { name: "Select Patient name" }).click()
  await page
    .getByRole("group", { name: "Map selected source to" })
    .getByRole("button", { name: "Middle" })
    .click()
  await fillSourceSearch(page, "PID-5.2")
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
  const text = (name: string) => {
    const entry = Object.entries(entries).find(([path]) =>
      path.endsWith(`/${name}`),
    )?.[1]
    expect(entry, `ZIP contains ${name}`).toBeDefined()
    return new TextDecoder().decode(entry)
  }
  return {
    manifest: json("manifest.json"),
    decisions: json("review-decisions.json"),
    items: json("hl7-items.json"),
    normalized: json("normalized-data.json"),
    validation: json("validation-results.json"),
    mappingSummary: text("mapping-summary.csv"),
  }
}

test("grid selection and a split value flow into a combined report field", async ({
  page,
}) => {
  await parseSample(page)
  await page.getByRole("button", { name: /Sender\/client information/ }).click()
  await page.getByRole("button", { name: "Select Message control ID" }).click()

  await page.getByRole("button", { name: "Browse message as a grid" }).click()
  const sourceGrid = page.getByRole("dialog", { name: "Browse HL7 message" })
  await sourceGrid.getByLabel("Segment").selectOption("PID")
  await sourceGrid.getByRole("spinbutton", { name: "Message row" }).fill("2")
  await sourceGrid
    .getByRole("button", { name: /PID message row 2, field 3:/ })
    .click()
  await sourceGrid
    .getByRole("button", { name: /PID\(row 2\) × 3\.1.*MRN-104892/ })
    .click()
  await sourceGrid.getByRole("button", { name: "Preview this source" }).click()

  await page.getByRole("textbox", { name: "Split by (optional)" }).fill("-")
  await page.getByRole("spinbutton", { name: "Take part" }).fill("2")
  await expect(page.locator("[data-selected-source-preview]")).toContainText(
    "104892",
  )
  await page.getByRole("button", { name: "Add to combined value" }).click()

  await fillSourceSearch(page, "MSH-3")
  await page
    .locator('[data-source-option="MSH-3"]')
    .getByRole("button", { name: "Select" })
    .click()
  await page.getByRole("button", { name: "Add to combined value" }).click()
  await page.getByRole("textbox", { name: "Join with" }).fill(" / ")
  await expect(page.getByText("104892 / NORTHSTAR_LIS")).toBeVisible()
  await page.getByRole("button", { name: "Use combined value" }).click()

  const messageControlIdCard = page.locator("[data-review-field-card]").filter({
    has: page.getByRole("button", { name: "Select Message control ID" }),
  })
  await expect(messageControlIdCard).toContainText("104892 / NORTHSTAR_LIS")
  await expect(messageControlIdCard).toContainText("Mapping changed")

  await page.reload()
  await page.getByRole("button", { name: "Parse message" }).click()
  await page.getByRole("button", { name: /Sender\/client information/ }).click()
  await expect(messageControlIdCard).toContainText("104892 / NORTHSTAR_LIS")

  const downloadPromise = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP" })
    .click()
  const report = await readZip(await downloadPromise)
  expect(report.normalized.message.controlId).toBe("104892 / NORTHSTAR_LIS")
  const exportedControlIdMapping = report.items.find(
    (item: { id: string }) => item.id === "message-control-id",
  )
  expect(exportedControlIdMapping.joinSeparator).toBe(" / ")
  expect(exportedControlIdMapping.sources).toEqual([
    expect.objectContaining({
      path: "PID-3.1",
      segmentIndex: 1,
      literalSplit: { separator: "-", partNumber: 2 },
    }),
    expect.objectContaining({ path: "MSH-3", segmentIndex: 0 }),
  ])
  const exportedControlIdDecision = report.decisions.find(
    (decision: { fieldId: string }) =>
      decision.fieldId === "message-control-id",
  )
  expect(exportedControlIdDecision.sourceReferences).toEqual(
    exportedControlIdMapping.sources,
  )
  expect(exportedControlIdDecision.joinSeparator).toBe(" / ")
  expect(report.mappingSummary).toContain('join with "" / ""')
})

test("separate parts of one plain name field keep their name roles", async ({
  page,
}) => {
  const sampleMessage = await readFile(fixture, "utf8")
  expect(sampleMessage).toContain("Lopez^Elena^M")

  await page.goto("/")
  await page
    .getByLabel("Editable HL7 message")
    .fill(sampleMessage.replace("Lopez^Elena^M", "Mario D. Lopez"))
  await page.getByRole("button", { name: "Parse message" }).click()
  await page.getByRole("button", { name: "Select Patient name" }).click()

  async function useNamePart(role: string, partNumber: number) {
    await page
      .getByRole("group", { name: "Map selected source to" })
      .getByRole("button", { name: role })
      .click()
    await page.getByRole("button", { name: "Browse message as a grid" }).click()
    const sourceGrid = page.getByRole("dialog", { name: "Browse HL7 message" })
    await sourceGrid.getByLabel("Segment").selectOption("PID")
    await sourceGrid.getByRole("spinbutton", { name: "Message row" }).fill("2")
    await sourceGrid
      .getByRole("button", { name: /PID message row 2, field 5:/ })
      .click()
    await sourceGrid
      .getByRole("button", { name: /PID\(row 2\) × 5 PID-5/ })
      .click()
    await sourceGrid
      .getByRole("button", { name: "Preview this source" })
      .click()
    await page.getByRole("textbox", { name: "Split by (optional)" }).fill(" ")
    await page
      .getByRole("spinbutton", { name: "Take part" })
      .fill(String(partNumber))
    await page.getByRole("button", { name: "Use this source" }).click()
  }

  await useNamePart("Family", 3)
  await useNamePart("Given", 1)
  await useNamePart("Middle", 2)

  const patientNameCard = page.locator("[data-review-field-card]").filter({
    has: page.getByRole("button", { name: "Select Patient name" }),
  })
  await expect(patientNameCard).toContainText("Lopez")
  await expect(patientNameCard).toContainText("Mario")
  await expect(patientNameCard).toContainText("D.")

  const currentSourceReads = page
    .getByText("Current source reads")
    .locator("..")
  await expect(
    currentSourceReads.getByText("Patient family name"),
  ).toBeVisible()
  await expect(currentSourceReads.getByText("Patient given name")).toBeVisible()
  await expect(
    currentSourceReads.getByText("Patient middle name or initial"),
  ).toBeVisible()
  await expect(
    currentSourceReads.getByText('Split on " ", part 3'),
  ).toBeVisible()
  await expect(
    currentSourceReads.getByText('Split on " ", part 1'),
  ).toBeVisible()
  await expect(
    currentSourceReads.getByText('Split on " ", part 2'),
  ).toBeVisible()

  const downloadPromise = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP" })
    .click()
  const report = await readZip(await downloadPromise)
  expect(report.normalized.patient.name).toMatchObject({
    family: "Lopez",
    given: "Mario",
    middle: "D.",
  })
})

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

test("an older review revision preserves correction history through reload and export", async ({
  page,
}) => {
  await parseSample(page)
  const nameCard = await correctPatientName(page)
  await nameCard.getByRole("button", { name: "Confirm" }).click()
  await page.evaluate((key) => {
    const snapshot = JSON.parse(localStorage.getItem(key)!)
    snapshot.reviewContext.engineRevision = "review-v4"
    localStorage.setItem(key, JSON.stringify(snapshot))
  }, storageKey)
  await page.reload()
  await page.getByRole("button", { name: "Parse message" }).click()
  await expect(nameCard).toContainText("Needs review")
  await nameCard.getByRole("button", { name: "Confirm" }).click()
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  )
  expect(saved.appliedCorrections).toHaveLength(1)
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(
    report.decisions.find(
      (entry: { fieldId: string }) => entry.fieldId === "patient-name",
    ),
  ).toMatchObject({ reviewStatus: "confirmed", correctionApplied: true })
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
  await page.getByRole("button", { name: "Browse message as a grid" }).click()
  const sourceGrid = page.getByRole("dialog", { name: "Browse HL7 message" })
  await expect(sourceGrid).toBeVisible()
  await sourceGrid.getByRole("spinbutton", { name: "Message row" }).fill("2")
  await expect(
    sourceGrid.getByRole("button", { name: /PID message row 2, field 5:/ }),
  ).toBeVisible()
  const gridOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(gridOverflow.documentWidth).toBeLessThanOrEqual(
    gridOverflow.viewportWidth,
  )
  await sourceGrid.screenshot({
    path: testInfo.outputPath("source-grid-phone.png"),
  })
  await page.keyboard.press("Escape")
  await page
    .getByRole("button", { name: "Reset demo draft" })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath("review-phone.png") })
})

test("a record field correction survives reload and export without changing siblings", async ({
  page,
}) => {
  await parseSample(page)
  await page
    .getByRole("button", {
      name: "Select Patient addresses: Record 1 · City",
      exact: true,
    })
    .click()
  await fillSourceSearch(page, "PID-11.4")
  await page
    .locator('[data-source-option="PID-11.4"]')
    .getByRole("button", { name: "Select", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Use this source", exact: true })
    .click()
  await page.reload()
  await page.getByRole("button", { name: "Parse message", exact: true }).click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(report.normalized.patient.addresses[0]).toMatchObject({
    city: "CA",
    state: "CA",
    street: "742 Evergreen Ave",
  })
})

test("a repeated address correction follows its source after the first repetition fills", async ({
  page,
}) => {
  const sample = await readFile(fixture, "utf8")
  const address = "742 Evergreen Ave^^Los Angeles^CA^90017^USA"
  const first = sample.replace(address, "~Second^^Two^NY^10001")
  const second = sample.replace(address, `${address}~Second^^Two^NY^10001`)
  await page.goto("/")
  await page.getByLabel("Editable HL7 message").fill(first)
  await page.getByRole("button", { name: "Parse message" }).click()
  await page
    .getByRole("button", {
      name: "Select Patient addresses: Record 1 · City",
      exact: true,
    })
    .click()
  await fillSourceSearch(page, "PID-11[2].4")
  await page
    .locator('[data-source-option="PID-11[2].4"]')
    .getByRole("button", { name: "Select", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Use this source", exact: true })
    .click()
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  )
  expect(stored).toContain("recordCorrectionIdentity")
  expect(stored).not.toContain("Second^^Two")
  await page.reload()
  await page.getByLabel("Editable HL7 message").fill(second)
  await page.getByRole("button", { name: "Parse message" }).click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(report.normalized.patient.addresses).toMatchObject([
    { city: "Los Angeles", street: "742 Evergreen Ave" },
    { city: "NY", street: "Second", state: "NY" },
  ])
  expect(report.validation.errors).not.toContainEqual(
    expect.objectContaining({ code: "unresolved-record-identity" }),
  )
})

test("a legacy record correction stays in the draft but blocks replay", async ({
  page,
}) => {
  await parseSample(page)
  await page
    .getByRole("button", {
      name: "Select Patient addresses: Record 1 · City",
      exact: true,
    })
    .click()
  await fillSourceSearch(page, "PID-11.4")
  await page
    .locator('[data-source-option="PID-11.4"]')
    .getByRole("button", { name: "Select", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Use this source", exact: true })
    .click()
  await page.evaluate((key) => {
    const snapshot = JSON.parse(localStorage.getItem(key)!)
    for (const profile of snapshot.draftProfiles)
      for (const item of profile.itemSet.items)
        delete item.recordCorrectionIdentity
    localStorage.setItem(key, JSON.stringify(snapshot))
  }, storageKey)
  await page.reload()
  await page.getByRole("button", { name: "Parse message" }).click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(report.normalized.patient.addresses[0].city).toBe("Los Angeles")
  expect(report.validation.errors).toContainEqual(
    expect.objectContaining({ code: "unresolved-record-identity" }),
  )
  expect(
    report.items.some(
      (item: { targetPath: string }) =>
        item.targetPath === "patient.addresses[0].city",
    ),
  ).toBe(true)
})

test("relocated and newly added corrections survive reload and completed export", async ({
  page,
}) => {
  test.setTimeout(90_000)
  const first = [
    "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
    "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F|||~Second^^Two^NY^10001",
    "ORC|NW|ORDER",
    "OBR|1|ORDER||CBC^CBC^LN",
    "SPM|1||S|BLD",
  ].join("\r")
  const second = first.replace("|||~Second", "|||First^^One^CA^90001~Second")
  async function parse(raw: string) {
    await page.getByLabel("Editable HL7 message").fill(raw)
    await page
      .getByRole("button", { name: "Parse message", exact: true })
      .click()
  }
  async function correctFirst(source: string) {
    const card = page.locator("[data-review-field-card]").filter({
      has: page.getByText("patient.addresses[0].city", { exact: true }),
    })
    await card.getByRole("button", { name: /^Select / }).click()
    await fillSourceSearch(page, source)
    await page
      .locator(`[data-source-option="${source}"]`)
      .getByRole("button", { name: "Select", exact: true })
      .click()
    await page
      .getByRole("button", { name: "Use this source", exact: true })
      .click()
    await expect(card).toContainText("Mapping changed")
  }
  async function exportCompleted() {
    for (const title of [
      "Patient information",
      "Sender/client information",
      "Coverage and guarantor",
      "Lab orders",
      "Warnings and missing fields",
    ]) {
      await page.getByRole("button", { name: new RegExp(title) }).click()
      for (const button of await page
        .getByRole("button", { name: "Confirm", exact: true })
        .all())
        await button.click()
    }
    const download = page.waitForEvent("download")
    await page
      .getByRole("button", {
        name: "Download completed report ZIP",
        exact: true,
      })
      .click()
    return readZip(await download)
  }
  await page.goto("/")
  await parse(first)
  await correctFirst("PID-11[2].4")
  await page.reload()
  await parse(second)
  for (const record of [1, 2]) {
    await expect(
      page.getByRole("button", {
        name: `Select Patient addresses: Record ${record} · City`,
        exact: true,
      }),
    ).toHaveCount(1)
  }
  const replayed = await exportCompleted()
  expect(replayed.manifest.review.status).toBe("completed")
  expect(
    replayed.items.find(
      (item: { recordCorrectionIdentity?: unknown }) =>
        item.recordCorrectionIdentity,
    ),
  ).toMatchObject({
    targetPath: "patient.addresses[1].city",
    label: "Patient addresses: Record 2 · City",
  })
  await page.getByRole("button", { name: /Patient information/ }).click()
  await correctFirst("PID-11[1].4")
  await page.reload()
  await parse(second)
  const report = await exportCompleted()
  expect(report.manifest.review).toMatchObject({
    status: "completed",
    unresolvedCount: 0,
  })
  expect(
    report.normalized.patient.addresses.map(
      (address: { city: string }) => address.city,
    ),
  ).toEqual(["CA", "NY"])
  expect(
    report.items.filter(
      (item: { recordCorrectionIdentity?: unknown }) =>
        item.recordCorrectionIdentity,
    ),
  ).toHaveLength(2)
})

test("two address corrections retain distinct review IDs when the first repetition empties", async ({
  page,
}) => {
  const sample = await readFile(fixture, "utf8")
  const address = "742 Evergreen Ave^^Los Angeles^CA^90017^USA"
  const first = sample.replace(address, `${address}~Second^^Two^NY^10001`)
  const second = sample.replace(address, "~Second^^Two^NY^10001")
  await page.goto("/")
  await page.getByLabel("Editable HL7 message").fill(first)
  await page.getByRole("button", { name: "Parse message" }).click()
  for (const [record, source] of [
    [1, "PID-11[1].4"],
    [2, "PID-11[2].4"],
  ] as const) {
    await page
      .getByRole("button", {
        name: `Select Patient addresses: Record ${record} · City`,
        exact: true,
      })
      .click()
    await fillSourceSearch(page, source)
    await page
      .locator(`[data-source-option="${source}"]`)
      .getByRole("button", { name: "Select", exact: true })
      .click()
    await page
      .getByRole("button", { name: "Use this source", exact: true })
      .click()
  }
  await page.reload()
  await page.getByLabel("Editable HL7 message").fill(second)
  await page.getByRole("button", { name: "Parse message" }).click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(report.normalized.patient.addresses[0].city).toBe("NY")
  expect(report.validation.errors).toContainEqual(
    expect.objectContaining({ code: "unresolved-record-identity" }),
  )
  expect(
    new Set(report.decisions.map((entry: { fieldId: string }) => entry.fieldId))
      .size,
  ).toBe(report.decisions.length)
})

test("reparsing closes an unsaved review editor", async ({ page }) => {
  await parseSample(page)
  const card = page.locator("[data-review-field-card]").filter({
    has: page.getByRole("button", {
      name: "Select Patient name",
      exact: true,
    }),
  })
  await card.getByRole("button", { name: "Incorrect", exact: true }).click()
  await expect(page.getByRole("button", { name: /save/i })).toBeVisible()
  await page.getByRole("button", { name: "Parse message", exact: true }).click()
  await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0)
})

test("switching review fields clears an uncommitted source selection", async ({
  page,
}) => {
  await parseSample(page)
  await page
    .getByRole("button", {
      name: "Select Patient addresses: Record 1 · City",
      exact: true,
    })
    .click()
  await fillSourceSearch(page, "PID-11.4")
  await page
    .locator('[data-source-option="PID-11.4"]')
    .getByRole("button", { name: "Select", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Use this source", exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Select Patient MRN", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Use this source", exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("button", {
      name: "Select Patient addresses: Record 1 · City",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("button", { name: "Use this source", exact: true }),
  ).toHaveCount(0)
})

test("a timestamp without a timezone keeps its precision in the report", async ({
  page,
}) => {
  await page.goto("/")
  const sample = (await readFile(fixture, "utf8")).replace(
    "20260706101500-0700",
    "202607061015",
  )
  await page.getByLabel("Editable HL7 message").fill(sample)
  await page.getByRole("button", { name: "Parse message", exact: true }).click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(report.normalized.message.sentAt).toBe("2026-07-06T10:15")
  expect(report.validation.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "missing-timezone" }),
    ]),
  )
})

test("record corrections preserve absent objects and clear corrected timestamp errors", async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto("/")
  await expect(page).toHaveTitle("HL7 Data Mapper")
  const raw = [
    "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
    "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F|||~Second^^Two^NY^10001",
    "ORC|NW|ORDER|||||||20260230100000",
    "OBR|1|ORDER||CBC^CBC^LN",
    "SPM|1||S|BLD",
  ].join("\r")
  await page.getByLabel("Editable HL7 message").fill(raw)
  await page.getByRole("button", { name: "Parse message", exact: true }).click()
  await page.getByRole("button", { name: /Lab orders/ }).click()
  await page
    .getByRole("button", {
      name: "Select Laboratory orders: Record 1 · Ordering Provider",
      exact: true,
    })
    .click()
  await fillSourceSearch(page, "PID-5.2")
  await expect(
    page
      .locator('[data-source-option="PID-5.2"]')
      .getByRole("button", { name: "Select", exact: true }),
  ).toBeDisabled()
  await page
    .getByRole("button", {
      name: "Select Laboratory orders: Record 1 · Transaction At",
      exact: true,
    })
    .click()
  await fillSourceSearch(page, "MSH-7")
  await page
    .locator('[data-source-option="MSH-7"]')
    .getByRole("button", { name: "Select", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Use this source", exact: true })
    .click()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download interim report ZIP", exact: true })
    .click()
  const report = await readZip(await download)
  expect(report.normalized.labOrders[0]).toMatchObject({
    transactionAt: "2026-07-06T10:15:00-07:00",
    orderingProvider: null,
  })
  expect(report.normalized.patient.addresses).toMatchObject([{ city: "Two" }])
  expect(report.validation.errors).toEqual([])
  expect(errors).toEqual([])
  await page
    .getByRole("button", {
      name: "Select Laboratory orders: Record 1 · Transaction At",
      exact: true,
    })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath("corrected-record.png") })
})
