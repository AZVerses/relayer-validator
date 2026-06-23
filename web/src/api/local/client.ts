import { ApiError } from '../../types/api'

interface LocalRequestResult<T> {
  status: number
  body: T
}

export async function localPost<T>(baseUrl: string, path: string, body: unknown): Promise<LocalRequestResult<T>> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  } catch (e) {
    throw new ApiError(-1, `Validator service unreachable: ${e instanceof Error ? e.message : 'request failed'}`)
  }

  const text = await res.text()
  let parsed: unknown
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, `Invalid response from validator service (status ${res.status})`)
    }
  }

  if (res.status >= 400) {
    const message = extractErrorMessage(parsed) ?? `Validator service error: ${res.status}`
    throw new ApiError(res.status, message)
  }

  return { status: res.status, body: parsed as T }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as { msg?: unknown; error?: unknown; message?: unknown }
  if (typeof candidate.msg === 'string') return candidate.msg
  if (typeof candidate.error === 'string') return candidate.error
  if (typeof candidate.message === 'string') return candidate.message
  return null
}
