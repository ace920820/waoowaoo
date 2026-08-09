import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const allowEnvironmentSkip = process.env.REMAKE_PROMPT_ALLOW_ENV_SKIP === '1'
const requireRealCodex = process.env.REMAKE_PROMPT_REQUIRE_REAL_CODEX === '1'

function failOrSkip(reason) {
  if (allowEnvironmentSkip) {
    console.log(`SKIP[ENV]: ${reason}`)
    process.exit(0)
  }
  console.error(`REMAKE_PROMPT_PRECHECK_FAILED: ${reason}`)
  process.exit(1)
}

function run(command, args) {
  try {
    return execFileSync(command, args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const detail = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    throw new Error(detail || `${command} ${args.join(' ')} failed`)
  }
}

async function pingLocalServices() {
  const [{ default: Redis }, mysql] = await Promise.all([import('ioredis'), import('mysql2/promise')])
  const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || '6380'), maxRetriesPerRequest: 1, lazyConnect: true })
  try {
    await redis.connect()
    if (await redis.ping() !== 'PONG') throw new Error('Redis did not return PONG')
  } finally {
    redis.disconnect()
  }
  const database = new URL(process.env.DATABASE_URL || 'mysql://root:root@127.0.0.1:3307/waoowaoo_test')
  const connection = await mysql.createConnection({ host: database.hostname, port: Number(database.port || 3306), user: decodeURIComponent(database.username), password: decodeURIComponent(database.password), database: database.pathname.slice(1), connectTimeout: 5_000 })
  try {
    await connection.query('SELECT 1')
  } finally {
    await connection.end()
  }
}

async function waitForLocalServices() {
  let lastError
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await pingLocalServices()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError
}

async function main() {
  try {
    run('docker', ['info'])
    run('docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', '--remove-orphans'])
    await waitForLocalServices()
    for (const workerFile of ['src/lib/workers/prompt-image.worker.ts', 'src/lib/workers/handlers/remake-prompt.ts']) {
      if (!existsSync(path.resolve(workerFile))) throw new Error(`Prompt worker is unavailable: ${workerFile}`)
    }
    const { chromium } = await import('@playwright/test')
    if (!existsSync(chromium.executablePath())) throw new Error('Playwright Chromium is not installed')
    if (requireRealCodex && process.env.REMAKE_PROMPT_REAL_CODEX !== '1') throw new Error('REMAKE_PROMPT_REAL_CODEX=1 is required for a phase-closing real Codex run')
    console.log('REMAKE_PROMPT_PRECHECK_OK: Docker, MySQL, Redis, Prompt workers, and Playwright are ready')
  } catch (error) {
    failOrSkip(error instanceof Error ? error.message : String(error))
  }
}

await main()
