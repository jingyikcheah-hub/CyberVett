import { randomUUID } from 'node:crypto'
import { hash } from 'bcryptjs'
import { Pool } from 'pg'
import { loadConfig } from '../config/env.js'

const [email, name, organizationName] = process.argv.slice(2)
if (!email || !name || !organizationName) {
  throw new Error('Usage: npm run create-admin -- email "Full Name" "Organization Name"')
}

const password = process.env.ADMIN_PASSWORD
if (!password || password.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters.')
const config = loadConfig({ ...process.env, DEMO_MODE: 'false' })
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required.')

const pool = new Pool({ connectionString: config.DATABASE_URL })
const client = await pool.connect()
try {
  await client.query('begin')
  const organizationId = randomUUID()
  await client.query('insert into organizations (id, name) values ($1, $2)', [organizationId, organizationName])
  await client.query(
    `insert into users (id, organization_id, name, email, role, account_mode, password_hash)
     values ($1, $2, $3, lower($4), 'admin', 'trainer', $5)`,
    [randomUUID(), organizationId, name, email, await hash(password, 12)],
  )
  await client.query('commit')
  process.stdout.write(`Created admin user ${email}\n`)
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  client.release()
  await pool.end()
}
