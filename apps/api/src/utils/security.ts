import { createHash, randomBytes } from 'node:crypto'

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

export function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function safeExcerpt(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`
}
