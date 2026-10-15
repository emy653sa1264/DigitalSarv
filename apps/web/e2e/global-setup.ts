import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

const E2E_DIR = import.meta.dirname
const WEB_ROOT = path.resolve(E2E_DIR, '..')
const API_ROOT = path.resolve(WEB_ROOT, '../api')
const REPO_ROOT = path.resolve(WEB_ROOT, '../..')
const ARTIFACTS = path.join(E2E_DIR, '.artifacts')
const PID_FILE = path.join(ARTIFACTS, 'pids.json')
const API_PORT = Number(process.env.E2E_API_PORT ?? 3999)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4199)
const LOG_CAP = 50 * 1024 * 1024

declare module 'vitest' {
  export interface ProvidedContext { origin: string }
}

function envPort(key: string, fallback: number): number {
  try {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)`, 'm').exec(readFileSync(path.join(REPO_ROOT, '.env'), 'utf8'))
    return m ? Number(m[1]) : fallback
  } catch {
    return fallback
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: '127.0.0.1', port })
    const done = (ok: boolean) => { s.destroy(); resolve(ok) }
    s.setTimeout(1000, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

/** One raw RESP command (no Redis client dependency in the web package). */
function redisCommand(port: number, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host: '127.0.0.1', port }, () => s.write(`*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('')}`))
    s.setTimeout(3000, () => { s.destroy(); reject(new Error('redis timeout')) })
    s.once('data', (d) => { s.end(); resolve(d.toString()) })
    s.once('error', reject)
  })
}

async function waitReady(url: string, ms: number, died: () => boolean): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (died()) throw new Error(`a child process exited during start-up (${url})`)
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not become ready within ${ms / 1000} s`)
}

function tail(file: string): string {
  try { return readFileSync(file, 'utf8').slice(-4000) } catch { return '' }
}

const alive = (c: ChildProcess) => c.pid !== undefined && c.exitCode === null && c.signalCode === null

/** Kills one child (its tree on Windows) — only a LIVE child this setup spawned; an exited PID may have been reused. */
function killChild(c: ChildProcess) {
  if (!alive(c)) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' })
  else {
    try { c.kill('SIGTERM') } catch { /* already gone */ }
  }
}

/** Starts the built API (port 3999) and the static proxy (4199) as child processes; the teardown stops exactly those two PIDs. */
export default async function setup(project: TestProject) {
  if (!existsSync(path.join(WEB_ROOT, 'dist/index.html'))) throw new Error('apps/web/dist is missing — run `pnpm --filter web build` first')
  if (!existsSync(path.join(API_ROOT, 'dist/main.js'))) throw new Error('apps/api/dist is missing — run `pnpm --filter api build` first')
  if (API_PORT === 3000 || WEB_PORT === 3000) throw new Error('E2E_API_PORT / E2E_WEB_PORT must not be 3000 (another program uses it)')
  if (API_PORT === WEB_PORT) throw new Error('E2E_API_PORT and E2E_WEB_PORT must differ')
  const mongo = envPort('MONGO_PORT', 27018)
  const redis = envPort('REDIS_PORT', 6380)
  if (!(await portOpen(mongo)) || !(await portOpen(redis))) throw new Error(`MongoDB (${mongo}) / Redis (${redis}) are not reachable — run \`pnpm db:up\` (and \`pnpm seed\` once)`)
  for (const p of [API_PORT, WEB_PORT]) if (await portOpen(p)) throw new Error(`port ${p} is busy — stop whatever uses it, or set E2E_API_PORT / E2E_WEB_PORT (a leftover run of this suite: PIDs are in e2e/.artifacts/pids.json — stop only those)`)
  // OTP requests are rate-limited per phone: clear this project's counters (dev Redis only — refuse any other Redis)
  if (redis !== envPort('REDIS_PORT', -1)) throw new Error('REDIS_PORT is not set in the root .env — refusing to clear OTP counters on an unknown Redis')
  await redisCommand(redis, ['EVAL', "for _,k in ipairs(redis.call('keys','otp:rl:*')) do redis.call('del',k) end return 1", '0'])

  mkdirSync(ARTIFACTS, { recursive: true })
  rmSync(path.join(ARTIFACTS, 'sessions.json'), { force: true }) // tokens are cached per run (OTP budget), never across runs
  const origin = `http://127.0.0.1:${WEB_PORT}`
  const apiLog = path.join(ARTIFACTS, 'api.log')
  const webLog = path.join(ARTIFACTS, 'static.log')
  const stoppedChildren = new Set<ChildProcess>()
  const children: { name: string; proc: ChildProcess; log: string }[] = []
  let stopped = false

  const start = (name: string, log: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => {
    const fd = openSync(log, 'w')
    const proc = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', fd, fd], windowsHide: true })
    closeSync(fd)
    children.push({ name, proc, log })
    writeFileSync(PID_FILE, JSON.stringify(Object.fromEntries(children.map((c) => [c.name, c.proc.pid]))))
    return proc
  }

  // a runaway log kills its process (cap: 50 MB per log)
  const watchdog = setInterval(() => {
    for (const c of children) {
      try {
        if (statSync(c.log).size > LOG_CAP) {
          console.error(`e2e: ${c.name} log exceeded 50 MB — killing it`)
          stoppedChildren.add(c.proc)
          killChild(c.proc)
        }
      } catch {
        // log not there yet
      }
    }
  }, 2000)
  watchdog.unref()

  const stopAll = async () => {
    if (stopped) return
    stopped = true
    clearInterval(watchdog)
    process.off('exit', onExit)
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    for (const c of children) if (!stoppedChildren.has(c.proc)) killChild(c.proc)
    await Promise.all(children.map((c) => (c.proc.exitCode === null && c.proc.signalCode === null
      ? new Promise<void>((r) => { c.proc.once('exit', () => r()); setTimeout(r, 5000) })
      : undefined)))
    rmSync(PID_FILE, { force: true })
  }

  function onExit() { if (!stopped) for (const c of children) killChild(c.proc) }
  function onSignal() { void stopAll().finally(() => process.exit(130)) }
  process.once('exit', onExit)
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    const api = start('api', apiLog, ['dist/main.js'], API_ROOT, {
      NODE_ENV: 'development', API_HOST: '127.0.0.1', PORT: String(API_PORT), DISPATCH_SCHEDULER: '0', OTP_DEV_CODE: '1', PAYMENT_DRIVER: 'mock',
      WEB_PUBLIC_URL: origin, API_PUBLIC_URL: origin, CORS_ORIGIN: origin,
    })
    await waitReady(`http://127.0.0.1:${API_PORT}/api/health/ready`, 60_000, () => api.exitCode !== null)
    const web = start('static', webLog, [path.join(E2E_DIR, 'server.ts')], WEB_ROOT, {
      E2E_STATIC_ROOT: path.join(WEB_ROOT, 'dist'), E2E_WEB_PORT: String(WEB_PORT), E2E_API_PORT: String(API_PORT),
    })
    await waitReady(`${origin}/robots.txt`, 20_000, () => web.exitCode !== null)
  } catch (err) {
    await stopAll()
    throw new Error(`${(err as Error).message}\n--- API log (tail) ---\n${tail(apiLog)}\n--- static log (tail) ---\n${tail(webLog)}`)
  }
  project.provide('origin', origin)

  return async () => {
    await stopAll()
  }
}
