# ELEMENTAL AI

Bend fire, water, lightning and air with hand gestures in the browser. A webcam feeds
MediaPipe's Gesture Recognizer, and the effects render with Three.js on top of the live video.

## Run it

```bash
npm install      # also copies MediaPipe's WASM into public/wasm
npm run dev      # open http://localhost:5173 and click Start
npm test         # Vitest
npm run build    # type-check and production build into dist/
```

The camera only works on `localhost` or over HTTPS.

## Layout

```
src/
  core/       camera, recognizer (GPU -> CPU fallback), the single rAF loop, runtime wiring
  tracking/   per-hand data read from MediaPipe results (smoothing + HandState in Phase 2)
  gestures/   gesture rules, stabilizer, event engine (Phase 2)
  elements/   fire/ water/ lightning/ air/ - controller, visuals, sounds per element
  render/     Three.js stage, coordinate helpers, skeleton overlay, particles, post-fx, shaders
  audio/      Web Audio engine, synths, samples (Phase 4)
  ui/         React: start screen, control panel, gesture badges, stats
public/
  models/     gesture_recognizer.task (served locally, no CDN)
  wasm/       MediaPipe runtime, copied on install (git-ignored)
  sounds/
```

## Conventions

- **One model.** The Gesture Recognizer returns landmarks, handedness and a label per hand; `numHands: 2`.
- **Per-frame data stays out of React.** Landmarks and effect state live in plain objects inside
  `core/runtime.ts`; React renders menus and polls `stats` a few times a second.
- **One coordinate system.** Scene units are CSS pixels, origin at the viewport center, +y up.
  Place anything at a landmark with `stage.toScene(landmark)` — it applies the mirror.
- **Handedness.** MediaPipe labels assume a mirrored input; we feed it raw frames, so
  `SWAP_HANDEDNESS` in `tracking/handState.ts` flips them. Verify with your real left hand.
