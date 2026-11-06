/**
 * Particles are simulated entirely on the GPU: each one stores where and when it was born and how
 * it moves, and the vertex shader works out its current position, size and colour from `uTime`.
 */

export const particleVertex = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;

attribute vec3 aVelocity;  // xy velocity (px/s), z drag (1/s)
attribute vec4 aExtra;     // xy acceleration (px/s^2), z turbulence (px), w random seed
attribute vec2 aTime;      // birth time, lifetime (s)
attribute vec2 aSize;      // start and end size (px)
attribute vec3 aColorA;    // colour at birth (may exceed 1 to feed bloom)
attribute vec3 aColorB;    // colour at death
attribute vec4 aOrbit;     // xy orbit centre, z spin (rad/s, 0 = no orbit), w inward speed (px/s)

varying vec3 vColor;
varying float vAlpha;

void main() {
  float age = uTime - aTime.x;
  float t = age / aTime.y;
  if (aTime.y <= 0.0 || t < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec2 p;
  if (aOrbit.z != 0.0) {
    vec2 rel = position.xy - aOrbit.xy;
    float radius = max(length(rel) - aOrbit.w * age, 0.0);
    float angle = atan(rel.y, rel.x) + aOrbit.z * age;
    p = aOrbit.xy + radius * vec2(cos(angle), sin(angle));
  } else {
    float drag = aVelocity.z;
    float travel = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
    p = position.xy + aVelocity.xy * travel + 0.5 * aExtra.xy * age * age;
  }
  float seed = aExtra.w * 6.2831;
  p += aExtra.z * t * vec2(sin(age * 7.0 + seed), cos(age * 5.3 + seed * 2.0));

  vColor = mix(aColorA, aColorB, t);
  vAlpha = smoothstep(1.0, 0.55, t) * min(1.0, t * 12.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z, 1.0);
  gl_PointSize = mix(aSize.x, aSize.y, t) * uPixelRatio;
}
`

export const particleFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float falloff = (1.0 - d) * (1.0 - d);
  gl_FragColor = vec4(vColor * falloff * vAlpha, 1.0);
}
`
