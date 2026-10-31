// 实体基类 + 活体实体（对应 Entity / LivingEntity 字段与 tick 循环）
import { stepEntityPhysics } from '../physics/movement.js'

let NEXT_ID = 1
export class Entity {
  constructor (type, x = 0, y = 0, z = 0) {
    this.id = NEXT_ID++
    this.entityType = type
    this.x = x; this.y = y; this.z = z
    this.vx = 0; this.vy = 0; this.vz = 0
    this.yaw = 0; this.pitch = 0
    this.width = 0.6; this.height = 1.8
    this.onGround = false
    this.ticksExisted = 0
    this.uuid = cryptoRandomId()
  }
  tick (world) {
    this.ticksExisted++
    stepEntityPhysics(this, world)
  }
}

export class LivingEntity extends Entity {
  constructor (type, x, y, z) {
    super(type, x, y, z)
    this.health = 20; this.maxHealth = 20
    this.invulnerableTime = 0
    this.armorPoints = 0; this.armorToughness = 0
    this.dead = false
    this.fallDistance = 0
  }
  tick (world) {
    const wasOnGround = this.onGround
    super.tick(world)
    if (this.invulnerableTime > 0) this.invulnerableTime--
    // 摔落伤害（原版：distance-3 后每格 1 点）
    if (!wasOnGround && this.onGround && this.fallDistance > 3) {
      this.health -= Math.floor(this.fallDistance - 3)
      this.fallDistance = 0
      if (this.health <= 0) this.dead = true
    }
    if (!this.onGround) this.fallDistance -= this.vy // 简化累计
  }
}

function cryptoRandomId () {
  try { return crypto.randomUUID() } catch { return Math.random().toString(36).slice(2) }
}
