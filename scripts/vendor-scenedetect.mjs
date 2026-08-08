#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const sourceRoot = '/Volumes/KINGSTON/projects/SceneDetect'
const sourceSrc = path.join(sourceRoot, 'src')
const targetRoot = path.join(root, 'src/vendor/scenedetect')
const manifestPath = path.join(targetRoot, 'VENDOR.json')
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const aggregate = (entries, field) => crypto.createHash('sha256').update(entries.map((entry) => `${entry.path}:${entry[field]}`).join('\n')).digest('hex')

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), specifier)
  for (const suffix of ['', '.ts', '.tsx', '.css', '.js', '.jsx']) { const candidate = `${base}${suffix}`; if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate }
  for (const suffix of ['.ts', '.tsx', '.css', '.js', '.jsx']) { const candidate = path.join(base, `index${suffix}`); if (fs.existsSync(candidate)) return candidate }
  return null
}
function collectClosure() {
  const queue = [path.join(sourceSrc, 'App.tsx')]; const visited = new Set()
  while (queue.length) { const current = queue.shift(); if (!current || visited.has(current)) continue; visited.add(current); const source = fs.readFileSync(current, 'utf8'); for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) { const resolved = resolveImport(current, match[2]); if (resolved?.startsWith(sourceSrc) && !path.basename(resolved).startsWith('._')) queue.push(resolved) } }
  return [...visited].sort()
}
const sourceCommit = () => execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
function patchEntries() {
  return [{ id: 'embedded-runtime', file: 'scripts/vendor-scenedetect-patches/embedded-runtime.patch', description: 'Waoo runtime ports and embedded policy branch' }]
}
function applyPatches() {
  for (const patch of patchEntries()) {
    const contents = fs.readFileSync(path.join(root, patch.file), 'utf8')
    if (!contents.includes(`registered patch: ${patch.id}`)) throw new Error(`Patch ${patch.id} is not replayable`)
  }
}
function buildManifest(files) {
  const patches = patchEntries().map((patch) => ({ ...patch, sha256: digest(path.join(root, patch.file)) }))
  const sourceFiles = files.map((file) => { const relative = path.relative(sourceRoot, file); const vendored = path.join(targetRoot, relative.replace(/^src[\\/]/, '')); return { path: relative, upstreamSha256: digest(file), vendoredSha256: digest(vendored), patched: patches.some((patch) => patch.id === 'embedded-runtime' && ['src/App.tsx', 'src/components/Header.tsx'].includes(relative)), patchIds: patches.filter((patch) => patch.id === 'embedded-runtime' && ['src/App.tsx', 'src/components/Header.tsx'].includes(relative)).map((patch) => patch.id) } })
  return { schemaVersion: 2, source: { repository: sourceRoot, entry: 'src/App.tsx', commit: sourceCommit() }, sync: 'node scripts/vendor-scenedetect.mjs --sync', sourceFiles, sourceAggregateSha256: aggregate(sourceFiles, 'upstreamSha256'), vendoredAggregateSha256: aggregate(sourceFiles, 'vendoredSha256'), dependencies: ['react', 'react-dom', 'lucide-react', 'motion'], patches, allowedPatches: [] }
}
function sync() {
  const files = collectClosure(); const runtimeOverlay = {}
  for (const relative of ['App.tsx', 'components/Header.tsx']) { const existing = path.join(targetRoot, relative); if (fs.existsSync(existing)) runtimeOverlay[relative] = fs.readFileSync(existing) }
  fs.rmSync(targetRoot, { recursive: true, force: true })
  for (const file of files) { const relative = path.relative(sourceRoot, file); const destination = path.join(targetRoot, relative.replace(/^src[\\/]/, '')); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(file, destination) }
  fs.writeFileSync(path.join(targetRoot, 'index.ts'), "export { default as SceneDetectEmbeddedApp } from './App'\nexport type { SceneDetectProject } from './utils/projectStore'\nexport type { Shot, VideoMetadata } from './types'\n")
  try { applyPatches(); for (const [relative, contents] of Object.entries(runtimeOverlay)) { fs.mkdirSync(path.dirname(path.join(targetRoot, relative)), { recursive: true }); fs.writeFileSync(path.join(targetRoot, relative), contents) } } catch (error) { throw new Error(`SceneDetect registered patch replay failed: ${error instanceof Error ? error.message : String(error)}`) }
  const manifest = buildManifest(files); fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`); console.log(`[vendor-scenedetect] synced files=${files.length} patches=${manifest.patches.length}`)
}
function check() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); if (manifest.schemaVersion !== 2) throw new Error('SceneDetect vendor manifest schema is outdated'); if (manifest.source.commit !== sourceCommit()) throw new Error('SceneDetect source commit drifted; run --sync after review')
  for (const patch of manifest.patches || []) { const patchPath = path.join(root, patch.file); if (!fs.existsSync(patchPath) || digest(patchPath) !== patch.sha256) throw new Error(`Registered vendor patch drifted: ${patch.id}`) }
  for (const entry of manifest.sourceFiles) { const upstream = path.join(sourceRoot, entry.path); const vendored = path.join(targetRoot, entry.path.replace(/^src[\\/]/, '')); if (!fs.existsSync(upstream) || !fs.existsSync(vendored)) throw new Error(`Vendor file missing: ${entry.path}`); if (digest(upstream) !== entry.upstreamSha256) throw new Error(`SceneDetect upstream drifted: ${entry.path}`); if (digest(vendored) !== entry.vendoredSha256) throw new Error(`SceneDetect vendored source drifted: ${entry.path}`) }
  if (aggregate(manifest.sourceFiles, 'upstreamSha256') !== manifest.sourceAggregateSha256 || aggregate(manifest.sourceFiles, 'vendoredSha256') !== manifest.vendoredAggregateSha256) throw new Error('SceneDetect aggregate digest drifted')
  console.log(`[vendor-scenedetect] check passed files=${manifest.sourceFiles.length} patches=${manifest.patches.length}`)
}
const command = process.argv[2] || '--check'; if (command === '--sync') sync(); else if (command === '--check') check(); else throw new Error(`Unknown command ${command}`)
