import { ApiError } from '../types/api'
import type { ApiEnvelope } from '../types/api'
import { getApiBase } from '../config/chains'

async function request<T>(chainId: number, path: string, options?: RequestInit): Promise<T> {
  const base = getApiBase(chainId)
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
  } catch (e) {
    throw new ApiError(-1, `Network error: ${e instanceof Error ? e.message : 'request failed'}`)
  }

  if (!res.ok && res.status >= 500) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text || `Server error: ${res.status}`)
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = await res.json()
  } catch {
    throw new ApiError(-1, `Invalid response from server (status ${res.status})`)
  }

  if (envelope.code !== 0) {
    throw new ApiError(envelope.code, envelope.msg)
  }
  return envelope.data
}

export function adminGet<T>(chainId: number, path: string, params?: Record<string, unknown>): Promise<T> {
  let url = path
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value))
      }
    }
    const qs = searchParams.toString()
    if (qs) url = `${path}?${qs}`
  }
  return request<T>(chainId, url)
}

export function adminPost<T>(chainId: number, path: string, body?: unknown): Promise<T> {
  return request<T>(chainId, path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}
