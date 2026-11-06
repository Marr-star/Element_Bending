# Elements Bending

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
| Pointing (any direction) | Index straight, other fingers curled; else MediaPipe `Pointing_Up`. The label shows the direction |
| Two fingers | Index and middle straight, ring and pinky curled; else MediaPipe `Victory` |
| Pinch | Thumb tip to index tip under 0.25 hand sizes (ends above 0.35) |
| Rotate | Roll changes more than 60° within 0.5 s (ends below 30°) |
| Push | Apparent hand size grows more than 25% within 0.3 s |
| Hands apart / together | Palm distance grows (shrinks) by 2 hand sizes within 0.5 s; a hand lost for a few frames keeps its last position. Hands held close often merge into one detection; reappearing apart within 2 s still counts as apart. The stats panel shows the live gap |

MediaPipe labels count only above 60% confidence. `Thumb_Up`, `Thumb_Down` and `ILoveYou` are
ignored: in testing, pointing down was read as Thumb_Up and ILoveYou was not recognized at all.
A pose must hold for 4 frames to start or end. All thresholds live in `gestures/settings.ts`.

## Elements

Pick an element with the buttons at the bottom of the screen or keys `1`–`4`; only the active
element responds to your hands, and switching clears the previous one's effects.

### 1 · Fire

| Do this | Effect |
|---|---|
| Make a fist | A fireball charges up and follows your hand |
| Open your hand while moving it | Throws the fireball; it explodes at the screen edge or after 1.5 s |
| Open your hand while holding still | Releases it; it drifts up and fades |
| Push toward the camera | Launches it at you: it swells and bursts with a flash and screen shake |
| Two fists together | The balls merge into one that grows (up to 2.5×) while you hold |

### 2 · Water

Being redesigned. Choosing water currently does nothing.

### 3 · Lightning

| Do this | Effect |
|---|---|
| Point (any direction) | A bolt leaps from your index fingertip along the finger, re-jagging every 50–80 ms |
| Two fingers | The bolt splits into 2–4 forks, some forking again |
| Pinch and hold | An energy sphere grows between thumb and index finger, with arcs crawling over it |
| Release the pinch | It discharges: arcs burst outward with a flash, a shake and thunder (bigger after a longer charge) |

### 4 · Air

| Do this | Effect |
|---|---|
| Open hand | A stream of air streaks leaves the palm the way the hand moves |
| Twist your wrist | A vortex: air spirals into the palm, spinning the way you turn |
| Bring both hands close | Air is drawn in and packed into a glowing ball between them |
| Snap them apart | A shockwave ring that warps the room as it expands (stronger after compressing) |

Effects share one GPU particle system (5,000 particles in a ring buffer, motion computed in the
shader) and an UnrealBloomPass glow. The webcam is dimmed below the bloom threshold so only
effects glow.

## Sound

The AudioContext is created in the Start click, since browsers keep it silent otherwise.

- Routing: sound -> gain -> stereo panner -> element bus -> master -> compressor -> speakers.
- **Holding a fireball** plays `public/sounds/fire-hold.m4a`: the audio track of the project's own
  campfire video, copied out of the video without re-encoding, editing or volume changes. It plays
  from the start at its recorded volume and loops if a ball is held longer than its 54 s. Nothing
  else is mixed in while holding.
- One-shots (ignite, whoosh, explosion) are synthesized in `audio/synth.ts` and get a fresh source
  each time with a random playback rate (0.9–1.1), panned to where the fireball is.
- Every level change ramps with `setTargetAtTime`, so nothing clicks when sounds start or stop.
- `AudioEngine` already has master volume, per-element volume and mute for the Phase 6 sliders.

### Using real recordings

Files in `public/sounds/` (`.ogg`, `.mp3`, `.wav` or `.m4a`) replace the synthesized sounds;
anything missing stays synthesized.

| File name | Used for |
|---|---|
| `fire-hold` | The sound while holding a fireball (without it, a synthesized wood-fire crackle plays) |
| `fire-ignite`, `fire-whoosh`, `fire-explosion` | Fire's one-shots |
| `lightning-buzz`, `lightning-zap`, `lightning-strike` | The live bolt's buzz, a bolt leaping out, the discharge's thunder |
| `air-wind`, `air-shockwave` | Wind that swells with airflow and vortices, the shockwave's thump |

Check the licence of anything you add. CC0 or similar avoids attribution requirements.

**Keys:** `1`–`4` pick fire, water, lightning or air, `S` toggles the skeleton, `B` toggles glow (bloom), `M` toggles sound, `R` starts/stops a landmark recording. Stopping downloads a
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
