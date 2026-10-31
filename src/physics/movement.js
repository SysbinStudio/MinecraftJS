// 实体物理：重力、阻力、分轴碰撞扫描（对应 LivingEntity.travel / move 逻辑）
import { AABB } from './aabb.js'

export const GRAVITY = 0.08
export const DRAG_Y = 0.98
export const FRICTION_XZ = 0.6 // 地面摩擦（air 为 0.98 * 0.91）
export const TERMINAL_VELOCITY = -78.4

export function stepEntityPhysics (entity, world, dtTicks = 1) {
  // 1. 阻力与重力
  entity.vx *= FRICTION_XZ
  entity.vy = (entity.vy - GRAVITY) * DRAG_Y
  entity.vz *= FRICTION_XZ
  if (entity.vy < TERMINAL_VELOCITY) entity.vy = TERMINAL_VELOCITY

  // 2. 生成分轴移动的碰撞盒
  let box = AABB.ofCentered(entity.x, entity.y, entity.z, entity.width, entity.height)
  let dx = entity.vx * dtTicks, dy = entity.vy * dtTicks, dz = entity.vz * dtTicks
  const moved = { x: entity.x, y: entity.y, z: entity.z }
  let onGround = false

  const colliders = world.getCollidingBoxes(box.expand(dx, dy, dz).inflate(0.001, 0.001, 0.001))

  // Y 轴先算（决定 onGround）
  let yClip = dy
  for (const c of colliders) {
    if (box.expand(dx, yClip, dz).intersects(c)) {
      const clip = box.clipCollideY(c, yClip)
      if (Math.abs(clip) < Math.abs(yClip)) yClip = clip
    }
  }
  if (yClip !== dy && dy < 0) onGround = true
  moved.y += yClip
  box = box.expand(dx, yClip, dz)

  let xClip = dx
  for (const c of colliders) {
    if (box.expand(xClip, 0, dz).intersects(c)) {
      const clip = box.clipCollideX(c, xClip)
      if (Math.abs(clip) < Math.abs(xClip)) xClip = clip
    }
  }
  moved.x += xClip
  box = box.expand(xClip, 0, dz)

  let zClip = dz
  for (const c of colliders) {
    if (box.expand(0, 0, zClip).intersects(c)) {
      const clip = box.clipCollideZ(c, zClip)
      if (Math.abs(clip) < Math.abs(zClip)) zClip = clip
    }
  }
  moved.z += zClip

  entity.x = moved.x; entity.y = moved.y; entity.z = moved.z
  entity.onGround = onGround
  if (onGround) { entity.vy = 0 }
  return { collided: xClip !== dx || yClip !== dy || zClip !== dz, onGround }
}
