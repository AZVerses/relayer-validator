import { ApiError } from '../../types/api'

export interface LocalValidator {
  validatorAddress: string
}

export async function fetchLocalValidator(baseUrl: string): Promise<LocalValidator> {
  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/validator`, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    throw new ApiError(-1, `Validator service unreachable: ${e instanceof Error ? e.message : 'request failed'}`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text || `Validator service error: ${res.status}`)
  }

  return res.json() as Promise<LocalValidator>
}
