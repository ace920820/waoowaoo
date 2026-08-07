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

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), specifier)
  for (const suffix of ['', '.ts', '.tsx', '.css', '.js', '.jsx']) {
    const candidate = `${base}${suffix}`
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  for (const suffix of ['.ts', '.tsx', '.css', '.js', '.jsx']) {
    const candidate = path.join(base, `index${suffix}`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function collectClosure() {
  const queue = [path.join(sourceSrc, 'App.tsx')]
  const visited = new Set()
  while (queue.length) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)
    const source = fs.readFileSync(current, 'utf8')
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) {
      const resolved = resolveImport(current, match[2])
      if (resolved && resolved.startsWith(sourceSrc) && !path.basename(resolved).startsWith('._')) queue.push(resolved)
    }
  }
  return [...visited].sort()
}

function currentSourceCommit() {
  return execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function buildManifest(files) {
  const entries = files.map((file) => {
    const relative = path.relative(sourceRoot, file)
    return { path: relative, sha256: hashFile(file) }
  })
  const aggregate = crypto.createHash('sha256').update(entries.map((entry) => `${entry.path}:${entry.sha256}`).join('\n')).digest('hex')
  return {
    schemaVersion: 1,
    source: { repository: sourceRoot, entry: 'src/App.tsx', commit: currentSourceCommit() },
    sync: 'node scripts/vendor-scenedetect.mjs --sync',
    sourceFiles: entries,
    aggregateSha256: aggregate,
    dependencies: ['react', 'react-dom', 'lucide-react', 'motion'],
    allowedPatches: [],
  }
}

function sync() {
  const files = collectClosure()
  fs.rmSync(targetRoot, { recursive: true, force: true })
  for (const file of files) {
    const relative = path.relative(sourceRoot, file)
    const destination = path.join(targetRoot, relative.replace(/^src[\\/]/, ''))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(file, destination)
  }
  fs.writeFileSync(path.join(targetRoot, 'index.ts'), "export { default as SceneDetectEmbeddedApp } from './App'\nexport type { SceneDetectProject } from './utils/projectStore'\nexport type { Shot, VideoMetadata } from './types'\n")
  fs.writeFileSync(manifestPath, `${JSON.stringify(buildManifest(files), null, 2)}\n`)
  console.log(`[vendor-scenedetect] synced files=${files.length}`)
}

function check() {
  if (!fs.existsSync(manifestPath)) throw new Error('VENDOR.json is missing')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.source.commit !== currentSourceCommit()) throw new Error('SceneDetect source commit drifted; run --sync after review')
  const expected = buildManifest(manifest.sourceFiles.map((entry) => path.join(sourceRoot, entry.path)))
  if (JSON.stringify(expected) !== JSON.stringify(manifest)) throw new Error('SceneDetect vendor manifest/hash drifted')
  for (const entry of manifest.sourceFiles) {
    const vendored = path.join(targetRoot, entry.path.replace(/^src[\\/]/, ''))
    if (!fs.existsSync(vendored) || hashFile(path.join(sourceRoot, entry.path)) !== entry.sha256) throw new Error(`Vendored source drifted: ${entry.path}`)
  }
  if (!fs.existsSync(path.join(targetRoot, 'index.ts'))) throw new Error('Canonical SceneDetect index is missing')
  console.log(`[vendor-scenedetect] check passed files=${manifest.sourceFiles.length}`)
}

const command = process.argv[2] || '--check'
if (command === '--sync') sync()
else if (command === '--check') check()
else throw new Error(`Unknown command: ${command}`)
