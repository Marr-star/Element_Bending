export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 extends Vec2 {
  z: number
}

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Angle in degrees between the directions a->b and b->c (0 when the three points are in line). */
export function bendAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z
  const lengths = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz)
  if (lengths === 0) return 0
  const cos = (ux * vx + uy * vy + uz * vz) / lengths
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

/** Wraps an angle in radians to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (2 * Math.PI)
  return (wrapped < 0 ? wrapped + 2 * Math.PI : wrapped) - Math.PI
}
