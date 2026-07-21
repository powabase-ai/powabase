import path from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from '@/lib/api/apiWrapper'
import { IS_PLATFORM } from '@/lib/constants'

// Self-host-only server-side proxy for the AI data path (Agents / Sources /
// KnowledgeBases / Workflows / Orchestrations / Copilot / ... — everything
// lib/ai-api.ts addresses at /platform/project-api/{ref}/{endpoint}).
//
// Mirrors the verified self-host pattern (lib/api/self-hosted/query.ts,
// settings.ts): a same-origin Studio-server route holds the privileged
// `service_role` credential and talks straight to the local backend — no
// per-user browser token, no control plane. `[ref]` is accepted only for
// URL-shape parity with the platform base URL (getProjectApiBaseUrl) and is
// otherwise ignored: self-host (oss-edition/docker-compose.yml) is always a
// single-project stack.
//
// Target + header shape mirror the control plane's own project-api proxy
// (agentic-control-plane/src/agentic_control_plane/routes/database.py,
// `proxy_project_api`, :826-): both route through Kong at `/api/<subpath>`
// and send BOTH headers:
//  - `apikey`: every project-api-* route in oss-edition/volumes/api/kong.yml
//    carries Kong's key-auth plugin, which (with no `key_in_header`
//    override) reads the key from `apikey`, NOT from Authorization — omitting
//    this header makes Kong itself 401 the request before it ever reaches
//    project-service.
//  - `Authorization: Bearer <service_role>`: the project-service's own JWT
//    check (packages/agentic-project-service/.../auth.py:47-48) accepts the
//    raw SERVICE_ROLE_KEY string as a service-role bearer token.
//
// SECURITY INVARIANT: service_role never reaches the browser. It is read
// from `process.env.SUPABASE_SERVICE_KEY` here, server-side only, and this
// handler OVERRIDES (never forwards) whatever Authorization header the
// browser sent — an inbound Authorization header is never trusted or
// relayed upstream.

export const config = {
  api: {
    // Forward the request body byte-for-byte (JSON, multipart file uploads)
    // rather than relying on Next's built-in JSON-only parser, which would
    // silently drop multipart bodies (sourcesApi.upload).
    bodyParser: false,
  },
}

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// Bodies are only read for methods the control-plane proxy itself reads a
// body for (database.py proxy_project_api: `request.method in ["POST",
// "PUT", "PATCH"]`) — matches every ai-api.ts call shape (DELETE/GET never
// send a body) and avoids attempting to read a body that will never arrive.
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH'])

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Prod never uses this route — the control plane owns /platform/project-api
  // routing there. Hard no-op so this file can never become a prod code path.
  if (IS_PLATFORM) {
    res.status(404).json({ error: { message: 'Not found' } })
    return
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const supabaseUrl = process.env.SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    res.status(500).json({
      error: {
        message:
          'Self-host project-api proxy is not configured (SUPABASE_SERVICE_KEY / SUPABASE_URL)',
      },
    })
    return
  }

  const pathParam = req.query.path
  const segments = Array.isArray(pathParam) ? pathParam : pathParam ? [pathParam] : []
  // Reject `.`/`..` segments outright, and reject any segment that smuggles
  // a traversal via an embedded slash — Next's catch-all splits on literal
  // '/' in the URL *before* decoding each segment, so a percent-encoded
  // slash (e.g. `a%2f..%2f..%2fb`) survives as a single segment that decodes
  // to `a/../../b` rather than three separate segments. Normalizing against
  // a sentinel base (not bare `/`, which would just silently clamp excess
  // `..` at the filesystem root instead of surfacing the escape) and
  // checking the result still starts with that base catches both forms.
  const joined = segments.join('/')
  const normalized = path.posix.normalize(`/__base__/${joined}`)
  const escapesBase =
    segments.some((s) => s === '.' || s === '..') ||
    (normalized !== '/__base__' && !normalized.startsWith('/__base__/'))
  if (escapesBase) {
    res.status(400).json({ error: { message: 'Invalid path' } })
    return
  }
  const subpath = joined
  const search = new URL(req.url ?? '', 'http://internal').search
  const targetUrl = `${supabaseUrl}/api/${subpath}${search}`

  const method = req.method ?? 'GET'
  const headers: Record<string, string> = {
    apikey: serviceKey,
    // OVERRIDE — never trust/forward the browser's inbound Authorization.
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
  const contentType = req.headers['content-type']
  if (contentType) headers['Content-Type'] = contentType

  const body = METHODS_WITH_BODY.has(method) ? await readRawBody(req) : undefined

  let upstream: Response
  try {
    // Node's Buffer is a Uint8Array at runtime (a valid BodyInit for
    // fetch/undici) but its type doesn't structurally satisfy the DOM
    // BodyInit union — cast, not a behavior change.
    upstream = await fetch(targetUrl, { method, headers, body: body as BodyInit | undefined })
  } catch (err) {
    res.status(503).json({
      error: {
        message: `project-api unreachable: ${err instanceof Error ? err.message : String(err)}`,
      },
    })
    return
  }

  res.status(upstream.status)
  const upstreamContentType = upstream.headers.get('content-type')
  if (upstreamContentType) res.setHeader('Content-Type', upstreamContentType)
  const contentRange = upstream.headers.get('content-range')
  if (contentRange) res.setHeader('Content-Range', contentRange)

  // Stream SSE (agent-run / copilot-chat) chunk-by-chunk instead of
  // buffering — mirrors the control plane's own `generate()` passthrough.
  if (upstreamContentType?.includes('text/event-stream') && upstream.body) {
    const reader = upstream.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
    } finally {
      res.end()
    }
    return
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  res.end(buf)
}
