// 战斗伤害管线（对应 LivingEntity.hurt / DamageSource / invulnerableTime）
import { AABB } from '../physics/aabb.js'

export class DamageSource {
  constructor (type, cause = null) { this.type = type; this.direct = cause; this.causedByMagic = type.includes('magic') }
}
export const DMG = {
  playerAttack: p => new DamageSource('player', p),
  mobAttack: m => new DamageSource('mob', m),
  fall: () => new DamageSource('fall'),
  void: () => new DamageSource('out_of_world'),
  fire: () => new DamageSource('inFire')
}

// 玩家攻击伤害表（手持武器基础值，含暴击 ×1.5）
export const WEAPON_DAMAGE = { hand: 1, wooden_sword: 4, stone_sword: 5, iron_sword: 6, golden_sword: 4, diamond_sword: 7, netherite_sword: 8, wooden_axe: 7, stone_axe: 9, iron_axe: 9, diamond_axe: 11, netherite_axe: 13 }

export function applyDamage (target, base, source) {
  if (target.invulnerableTime > 0 && target.lastDamageSource?.type === source.type) return 0 // 无敌帧
  let dmg = base
  // 附魔护甲减免简化：armorValue * 2% + toughness 修正
  const armor = target.armorPoints ?? 0
  const reduction = Math.min(20, armor / 5 + (target.armorToughness ?? 0) / 4)
  dmg = dmg * (1 - reduction / 25)
  dmg = Math.max(dmg, 0.5) // 最低 0.5 点穿透
  target.health -= dmg
  target.invulnerableTime = 10
  target.lastDamageSource = source
  if (target.health <= 0) target.dead = true
  return dmg
}

// 击退向量（原版 knockback：attackStrength 参与）
export function knockbackVector (attacker, victim, strength = 0) {
  let dx = victim.x - attacker.x, dz = victim.z - attacker.z
  const len = Math.hypot(dx, dz) || 1
  dx /= len; dz /= len
  const mag = 0.4 + strength * 0.4
  victim.vx += dx * mag
  victim.vz += dz * mag
  victim.vy += 0.2
}

export function sweepDamage (attacker, entities, radius = 3) {
  const box = AABB.ofCentered(attacker.x, attacker.y, attacker.z, radius * 2, 2, radius * 2)
  return entities.filter(e => e !== attacker && !e.dead &&
    box.intersects(AABB.ofCentered(e.x, e.y, e.z, e.width ?? 0.6, e.height ?? 1.8)))
}
