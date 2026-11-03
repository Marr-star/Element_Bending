// Copies MediaPipe's WASM runtime into public/wasm so the app never depends on a CDN.
// Runs on postinstall, so the files always match the installed @mediapipe/tasks-vision version.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const dest = join(root, 'public', 'wasm')

if (!existsSync(src)) {
  console.warn('[copy-wasm] @mediapipe/tasks-vision not installed yet, skipping')
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('[copy-wasm] copied MediaPipe WASM to public/wasm')
