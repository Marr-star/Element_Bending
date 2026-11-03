/**
 * Fireball core: a camera-facing quad with animated fractal noise. Noise scrolls downward in UV
 * space so flame features rise, and distorts the radius so the edge licks and flickers.
 * Colours exceed 1 at the centre so bloom picks them up.
 */

export const fireballVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const fireballFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;

varying vec2 vUv;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // Flames lick upward: the top of the ball reaches further than the bottom.
  float r = length(vec2(p.x, p.y * (p.y > 0.0 ? 0.8 : 1.05)));

  float n = fbm(vec3(p * 2.6 + vec2(uSeed, -uTime * 2.2), uTime * 0.7 + uSeed));
  float detail = fbm(vec3(p * 6.0 + vec2(-uSeed, -uTime * 3.5), uTime));

  float edge = 0.5 + 0.12 * uIntensity;
  float body = smoothstep(edge, edge - 0.4, r + (n - 0.5) * 0.45 + (detail - 0.5) * 0.15);
  // Noise contrast keeps darker orange streaks visible across even a large ball.
  float heat = clamp(body * (0.4 + 0.75 * n + 0.25 * detail), 0.0, 1.0);

  vec3 color = mix(vec3(0.7, 0.08, 0.01), vec3(1.0, 0.42, 0.04), smoothstep(0.05, 0.5, heat));
  color = mix(color, vec3(1.0, 0.8, 0.38), smoothstep(0.62, 0.95, heat));

  float halo = exp(-r * r * 5.0) * 0.08;
  vec3 glow = color * heat * 1.1 + vec3(1.0, 0.3, 0.04) * halo;
  // Premultiplied alpha: the body partly covers the webcam instead of adding to it, so the ball
  // stays orange over bright backgrounds; the halo still adds light.
  gl_FragColor = vec4(glow * uIntensity, clamp(body * 0.8, 0.0, 0.8));
}
`
