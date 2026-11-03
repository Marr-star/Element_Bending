import { GestureRecognizer } from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import type { Handedness } from '../tracking/handState'
import type { Vec3 } from '../tracking/vec'
import type { Stage } from './scene'

/** Anything with landmarks in MediaPipe 0..1 coordinates: raw HandFrames or smoothed HandStates. */
interface SkeletonHand {
  landmarks: Vec3[]
  handedness: Handedness
}

const BONES = GestureRecognizer.HAND_CONNECTIONS
const POINTS_PER_HAND = 21

export const HAND_COLORS: Record<Handedness, string> = {
  Left: '#38bdf8',
  Right: '#fb923c',
}

/** One hand's 21 points and bone segments, with buffers allocated once and reused every frame. */
class HandSkeleton {
  readonly group = new THREE.Group()
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private readonly bones: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>

  constructor() {
    const pointGeometry = new THREE.BufferGeometry()
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS_PER_HAND * 3), 3))
    this.points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ size: 8, sizeAttenuation: false, depthTest: false }),
    )

    const boneGeometry = new THREE.BufferGeometry()
    boneGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 2 * 3), 3))
    this.bones = new THREE.LineSegments(
      boneGeometry,
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8, depthTest: false }),
    )

    this.points.frustumCulled = false
    this.bones.frustumCulled = false
    this.points.renderOrder = 11
    this.bones.renderOrder = 10
    this.group.add(this.bones, this.points)
  }

  update(hand: SkeletonHand, stage: Stage): void {
    const color = HAND_COLORS[hand.handedness]
    this.points.material.color.set(color)
    this.bones.material.color.set(color)

    const pointPositions = this.points.geometry.attributes.position as THREE.BufferAttribute
    hand.landmarks.forEach((landmark, i) => {
      const p = stage.toScene(landmark)
      pointPositions.setXYZ(i, p.x, p.y, 0)
    })
    pointPositions.needsUpdate = true

    const bonePositions = this.bones.geometry.attributes.position as THREE.BufferAttribute
    BONES.forEach(({ start, end }, i) => {
      bonePositions.setXYZ(i * 2, pointPositions.getX(start), pointPositions.getY(start), 0)
      bonePositions.setXYZ(i * 2 + 1, pointPositions.getX(end), pointPositions.getY(end), 0)
    })
    bonePositions.needsUpdate = true
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.points.material.dispose()
    this.bones.geometry.dispose()
    this.bones.material.dispose()
  }
}

/** Debug overlay: a 21-point skeleton per detected hand, one colour per handedness. */
export class SkeletonOverlay {
  private readonly stage: Stage
  private readonly hands = [new HandSkeleton(), new HandSkeleton()]
  private visible = true

  constructor(stage: Stage) {
    this.stage = stage
    this.hands.forEach((hand) => stage.scene.add(hand.group))
  }

  setVisible(visible: boolean): void {
    this.visible = visible
  }

  update(hands: SkeletonHand[]): void {
    this.hands.forEach((skeleton, i) => {
      const hand = hands[i]
      skeleton.group.visible = this.visible && hand !== undefined
      if (hand && this.visible) skeleton.update(hand, this.stage)
    })
  }

  dispose(): void {
    this.hands.forEach((hand) => {
      this.stage.scene.remove(hand.group)
      hand.dispose()
    })
  }
}
