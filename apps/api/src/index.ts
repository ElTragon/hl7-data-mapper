export interface Env {
  DEMO_DATA_POLICY: "synthetic-only"
  REPORT_MAX_BYTES: string
}

const securityHeaders = {
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...securityHeaders,
      "cache-control": "no-store",
      ...init.headers,
    },
  })
}

const worker: ExportedHandler<Env> = {
  fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "hl7-data-mapper-api",
        demoDataPolicy: env.DEMO_DATA_POLICY,
        reportMaxBytes: Number(env.REPORT_MAX_BYTES),
      })
    }

    return jsonResponse(
      {
        error: "not_found",
        message: "This endpoint is not available in the Phase 2 scaffold.",
      },
      { status: 404 },
    )
  },
}

export default worker
