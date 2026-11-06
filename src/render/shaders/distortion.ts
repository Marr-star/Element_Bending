/**
 * Shaders that bend the real webcam image. They sample the same mirrored video texture as the
 * background, at a position worked out from the fragment's scene coordinates, then offset it.
 */

/** Shared: scene position -> video UV, matching the mirrored, cover-scaled background plane. */
const videoUv = /* glsl */ `
uniform sampler2D uVideo;
uniform vec2 uPlane;
uniform float uBrightness;
vec3 videoAt(vec2 scenePosition) {
  vec2 planeUv = scenePosition / uPlane + 0.5;
  return texture2D(uVideo, vec2(1.0 - planeUv.x, planeUv.y)).rgb * uBrightness;
}
`

export const distortionVertex = /* glsl */ `
varying vec2 vUv;
varying vec2 vScene;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vScene = world.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/**
 * Air shockwave: an expanding ring that pushes the room's image outward, like a heat haze, with
 * a faint pale edge. Outside the ring the fragment is discarded and the background shows as is.
 */
export const shockwaveFragment = /* glsl */ `
${videoUv}
uniform float uRadius;
uniform float uStrength;
varying vec2 vUv;
varying vec2 vScene;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  // The ring sits at 85% of the quad; its band is 15% wide.
  float band = 1.0 - smoothstep(0.0, 0.15, abs(d - 0.85));
  if (band <= 0.001) discard;
  vec2 direction = d > 0.0 ? p / d : vec2(0.0);
  vec3 seen = videoAt(vScene - direction * uRadius * 0.12 * uStrength * band);
  vec3 color = seen + vec3(0.75, 0.95, 0.9) * band * band * 0.35 * uStrength;
  gl_FragColor = vec4(color, band);
  #include <colorspace_fragment>
}
`
