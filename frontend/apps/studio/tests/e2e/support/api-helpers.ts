import type { APIRequestContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
export const PROJECT_API = `${API_URL}/platform/project-api/${PROJECT_REF}`

/** Pull the dashboard access token out of the Playwright storage-state file. */
export function readAccessToken(): string {
  const authPath = path.resolve(__dirname, '..', '.auth/user.json')
  const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'))
  for (const origin of raw.origins || []) {
    for (const item of origin.localStorage || []) {
      if (item.name === 'supabase.dashboard.auth.token') {
        const session = JSON.parse(item.value)
        if (session?.access_token) return session.access_token as string
      }
    }
  }
  throw new Error('Could not find dashboard auth token in storage state (key: supabase.dashboard.auth.token)')
}

const BEARER = readAccessToken()
export const authHeader = { Authorization: `Bearer ${BEARER}` }

export async function apiPost<T>(request: APIRequestContext, p: string, body: unknown): Promise<T> {
  const res = await request.post(`${PROJECT_API}${p}`, { data: body, headers: authHeader })
  if (!res.ok()) throw new Error(`POST ${p} -> ${res.status()}: ${await res.text()}`)
  return res.json()
}

export async function apiGet<T>(request: APIRequestContext, p: string): Promise<T> {
  const res = await request.get(`${PROJECT_API}${p}`, { headers: authHeader })
  if (!res.ok()) throw new Error(`GET ${p} -> ${res.status()}: ${await res.text()}`)
  return res.json()
}

/** Like apiGet but returns status + body without throwing on non-2xx responses. */
export async function apiGetRaw(
  request: APIRequestContext,
  p: string
): Promise<{ status: number; body: unknown }> {
  const res = await request.get(`${PROJECT_API}${p}`, { headers: authHeader })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status(), body }
}

export async function apiPatch<T>(request: APIRequestContext, p: string, body: unknown): Promise<T> {
  const res = await request.patch(`${PROJECT_API}${p}`, { data: body, headers: authHeader })
  if (!res.ok()) throw new Error(`PATCH ${p} -> ${res.status()}: ${await res.text()}`)
  return res.json()
}

export async function apiDelete(request: APIRequestContext, p: string): Promise<void> {
  const res = await request.delete(`${PROJECT_API}${p}`, { headers: authHeader })
  if (!res.ok() && res.status() !== 404) throw new Error(`DELETE ${p} -> ${res.status()}: ${await res.text()}`)
}
