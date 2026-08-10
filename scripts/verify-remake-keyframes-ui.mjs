import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'

const databaseUrl = 'mysql://root:root@127.0.0.1:3307/waoowaoo_test'
const redisPort = '6380'
const required = { DATABASE_URL: databaseUrl, REDIS_PORT: redisPort }
for (const [key, value] of Object.entries(required)) {
  if (process.env[key] && process.env[key] !== value) throw new Error(`${key} must be ${value}; refusing to target a different service`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_PORT: redisPort, ...options.env } })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}

async function unusedPort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  server.close()
  return port
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next exited before becoming ready (${child.exitCode})`)
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

let app
try {
  run('docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', 'mysql', 'redis'])
  run('npx', ['prisma', 'migrate', 'deploy'])
  const seed = spawnSync('npx', ['tsx', '-e', "import { seedRemakeKeyframeProject } from './tests/e2e/fixtures/remake-keyframe-project'; seedRemakeKeyframeProject().then((value) => console.log(JSON.stringify(value)))"], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_PORT: redisPort, NEXTAUTH_SECRET: 'remake-keyframe-e2e-secret' } })
  if (seed.status !== 0) throw new Error(seed.stderr || 'fixture seed failed')
  const fixture = JSON.parse(seed.stdout.trim().split('\n').at(-1))
  const port = await unusedPort()
  const baseUrl = `http://127.0.0.1:${port}`
  app = spawn('npx', ['next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl, REDIS_PORT: redisPort, NEXTAUTH_URL: baseUrl, NEXTAUTH_SECRET: 'remake-keyframe-e2e-secret', BILLING_MODE: 'OFF' } })
  await waitForServer(baseUrl, app)
  run('npx', ['playwright', 'test', 'tests/e2e/remake-keyframes.spec.ts', '--project=desktop', '--project=mobile'], { env: { PLAYWRIGHT_BASE_URL: baseUrl, REMAKE_KEYFRAME_E2E_BASE_URL: baseUrl, REMAKE_KEYFRAME_E2E_PROJECT_ID: fixture.projectId, REMAKE_KEYFRAME_E2E_SESSION_TOKEN: fixture.sessionToken, REMAKE_KEYFRAME_E2E_START_TRACK_ID: fixture.startTrackId, REMAKE_KEYFRAME_E2E_ORIGINAL_MEDIA_IDS: Object.values(fixture.originalMediaIds).join(','), NEXTAUTH_SECRET: 'remake-keyframe-e2e-secret' } })
} finally {
  if (app && app.exitCode === null) app.kill('SIGTERM')
}
