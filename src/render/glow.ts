import * as THREE from 'three'
import type { Vec2 } from '../tracking/vec'

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float core = exp(-r * r * 18.0);
  float halo = exp(-r * r * 4.0) * 0.45;
  vec3 color = mix(uColor, vec3(1.0), core * 0.6) * (core * 1.6 + halo);
  gl_FragColor = vec4(color * uIntensity, 1.0);
  #include <colorspace_fragment>
}
`

/** A soft additive glow: an energy orb, a compressed air ball, a highlight. */
export class GlowSprite {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

  constructor(scene: THREE.Scene, color: THREE.ColorRepresentation, renderOrder = 7) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0 } },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.mesh.position.z = 12
    this.mesh.renderOrder = renderOrder
    this.mesh.visible = false
    scene.add(this.mesh)
  }

  /** `radius` is the visible core; the halo reaches about twice as far. */
  update(position: Vec2, radius: number, intensity: number): void {
    this.mesh.visible = intensity > 0.001 && radius > 0.5
    this.mesh.position.set(position.x, position.y, 12)
    this.mesh.scale.setScalar(radius * 4)
    this.mesh.material.uniforms.uIntensity.value = intensity
  }

  hide(): void {
    this.mesh.visible = false
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
