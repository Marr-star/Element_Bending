import type { AudioEngine } from './audioEngine'

const EXTENSIONS = ['ogg', 'mp3', 'wav', 'm4a']

/**
 * Loads an optional recording from public/sounds/<name>.<ext>, trying each extension in turn.
 * Resolves to null when there is none, so callers fall back to their synthesized sound.
 */
export async function loadSample(audio: AudioEngine, name: string): Promise<AudioBuffer | null> {
  for (const extension of EXTENSIONS) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.${extension}`)
      // The Vite dev server answers missing files with index.html, so check the type too.
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) continue
      return await audio.context.decodeAudioData(await response.arrayBuffer())
    } catch {
      // Missing or undecodable: try the next extension.
    }
  }
  return null
}
