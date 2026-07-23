import type { ApiError } from '@cybervett/contracts'

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1'
let csrfToken: string | null = null

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message)
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (csrfToken && options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('x-csrf-token', csrfToken)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiClientError('CyberVett cannot reach its API. Make sure the backend is running, then try again.', 'API_UNAVAILABLE', 0)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiError | null
    throw new ApiClientError(
      payload?.error.message ?? 'The request could not be completed.',
      payload?.error.code ?? 'REQUEST_FAILED',
      response.status,
      payload?.error.requestId ?? response.headers.get('x-request-id') ?? undefined,
    )
  }
  if (response.status === 204) return undefined as T
  try {
    return await response.json() as T
  } catch {
    throw new ApiClientError(
      'The API returned an invalid response. Check the deployment routing and try again.',
      'INVALID_API_RESPONSE',
      502,
      response.headers.get('x-request-id') ?? undefined,
    )
  }
}

export async function candidateApi<T>(path: string, accessToken: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('authorization', `Bearer ${accessToken}`)
  return api<T>(path, { ...options, headers })
}
