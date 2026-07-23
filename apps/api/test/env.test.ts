import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/env.js'

const productionBase = {
  NODE_ENV: 'production',
  AUTH_SECRET: 'a-secure-production-secret-with-at-least-32-characters',
  APP_ORIGIN: 'https://app.example.com',
  DATABASE_URL: 'postgres://database.example.com/cybervett',
  DATABASE_SSL_MODE: 'require',
  DEMO_MODE: 'false',
  AI_PROVIDER: 'disabled',
}

describe('AI provider production configuration', () => {
  it('rejects deterministic demo evaluation in production', () => {
    expect(() => loadConfig({
      ...productionBase,
      AI_PROVIDER: 'demo',
    })).toThrow(/AI_PROVIDER=demo is not allowed in production/)
  })

  it('allows an explicit disabled human-review mode in production', () => {
    const config = loadConfig({ ...productionBase, DATABASE_SSL_CA: '' })
    expect(config.AI_PROVIDER).toBe('disabled')
    expect(config.DATABASE_SSL_CA).toBeUndefined()
  })
})

describe('database TLS configuration', () => {
  it('defaults to disabled locally and verify-full in production', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).DATABASE_SSL_MODE).toBe('disable')

    expect(() => loadConfig({
      ...productionBase,
      DATABASE_SSL_MODE: undefined,
    })).toThrow(/DATABASE_SSL_CA is required/)
  })

  it('rejects invalid modes and missing or invalid verify-full CA data', () => {
    expect(() => loadConfig({
      ...productionBase,
      DATABASE_SSL_MODE: 'insecure',
    })).toThrow()

    expect(() => loadConfig({
      ...productionBase,
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA: undefined,
    })).toThrow(/DATABASE_SSL_CA is required/)

    expect(() => loadConfig({
      ...productionBase,
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA: 'not a certificate',
    })).toThrow(/PEM-encoded certificate/)
  })

  it('accepts a PEM CA for verify-full', () => {
    const config = loadConfig({
      ...productionBase,
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\\nTEST-CA-DATA\\n-----END CERTIFICATE-----',
    })
    expect(config.DATABASE_SSL_MODE).toBe('verify-full')
    expect(config.DATABASE_SSL_CA).toContain('BEGIN CERTIFICATE')
    expect(config.DATABASE_SSL_CA).toContain('\n')
  })

  it.each([
    'sslmode=disable',
    'ssl=true',
    'sslrootcert=%2Ftmp%2Funtrusted-ca.pem',
    'uselibpqcompat=true',
  ])('rejects DATABASE_URL query parameter %s', (parameter) => {
    expect(() => loadConfig({
      ...productionBase,
      DATABASE_URL: `postgres://database.example.com/cybervett?${parameter}`,
    })).toThrow(/DATABASE_URL must not include SSL-related query parameters/)
  })
})
