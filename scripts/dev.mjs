import { spawn } from 'node:child_process'

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Start this command through npm: npm run dev')

const workspaces = ['@cybervett/api', '@cybervett/web']
const children = workspaces.map((workspace) => spawn(
  process.execPath,
  [npmCli, 'run', 'dev', '--workspace', workspace],
  { stdio: 'inherit', env: process.env },
))

let stopping = false

function stop(exitCode) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exitCode = exitCode
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(error)
    stop(1)
  })
  child.on('exit', (code, signal) => {
    if (!stopping && (code !== 0 || signal)) stop(code ?? 1)
  })
}

process.on('SIGINT', () => stop(130))
process.on('SIGTERM', () => stop(143))
