import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiClientError } from './api'

describe('API client response handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects SPA HTML returned for an API route instead of treating it as data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><title>SPA</title>', {
      status: 200,
      headers: { 'content-type': 'text/html', 'x-request-id': 'request-1' },
    })))

    await expect(api('/dashboard')).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      status: 502,
      requestId: 'request-1',
    })
  })

  it('retains stable API error codes and request identifiers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: { code: 'INVITATION_EXPIRED', message: 'Expired', requestId: 'request-2' },
    }, { status: 410 })))

    const error = await api('/public/invitations/token').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({
      code: 'INVITATION_EXPIRED',
      status: 410,
      requestId: 'request-2',
    })
  })
})
