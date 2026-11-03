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
  tracking/   One Euro smoothing and per-hand HandState (palm, size, velocity, roll)
  gestures/   gesture rules, stabilizer, event engine, settings, recorder/replay
  elements/   fire/ water/ lightning/ air/ - controller, visuals, sounds per element
  render/     Three.js stage, coordinate helpers, skeleton overlay, particles, post-fx, shaders
  audio/      Web Audio engine, synths, samples (Phase 4)
  ui/         React: start screen, control panel, gesture badges, stats
public/
  models/     gesture_recognizer.task (served locally, no CDN)
  wasm/       MediaPipe runtime, copied on install (git-ignored)
  sounds/
```

## Gestures

| Gesture | How it is detected |
|---|---|
| Fist, open palm | Landmark rule (all fingers curled / straight), else MediaPipe's label |
| Pointing (any direction) | Index straight, other fingers curled; else MediaPipe `Pointing_Up` |
| Two fingers | Index and middle straight, ring and pinky curled; else MediaPipe `Victory` |
| Pinch | Thumb tip to index tip under 0.25 hand sizes (ends above 0.35) |
| Rotate | Roll changes more than 60° within 0.5 s (ends below 30°) |
| Push | Apparent hand size grows more than 25% within 0.3 s |
| Hands apart / together | Palm distance changes faster than 8 hand sizes per second |

MediaPipe labels count only above 60% confidence. `Thumb_Up`, `Thumb_Down` and `ILoveYou` are
ignored: in testing, pointing down was read as Thumb_Up and ILoveYou was not recognized at all.
A pose must hold for 4 frames to start or end. All thresholds live in `gestures/settings.ts`.

**Keys:** `S` toggles the skeleton, `R` starts/stops a landmark recording. Stopping downloads a
JSON file; put it in `src/gestures/fixtures/` and replay it in a test with `replay()` from
`gestures/recorder.ts` to tune thresholds without the camera.

## Conventions

- **One model.** The Gesture Recognizer returns landmarks, handedness and a label per hand; `numHands: 2`.
- **Per-frame data stays out of React.** Landmarks and effect state live in plain objects inside
  `core/runtime.ts`; React renders menus and polls `stats` a few times a second.
- **One coordinate system.** Scene units are CSS pixels, origin at the viewport center, +y up.
  Place anything at a landmark with `stage.toScene(landmark)` — it applies the mirror.
- **Handedness.** MediaPipe's Left/Right labels are correct on the raw webcam feed (verified
  with a real left hand), so `SWAP_HANDEDNESS` in `tracking/handState.ts` is `false`.
