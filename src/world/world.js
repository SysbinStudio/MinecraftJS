// 世界容器：方块存取、碰撞盒查询、方块破坏/放置（对应 Level / WorldServer 简化）
import { ChunkColumn, MIN_Y } from './chunk.js'
import { AABB } from '../physics/aabb.js'

export class World extends ChunkColumn {
  constructor (blocks) { // blocks: minecraft-data blocksStates/blocks 索引
    super()
    this.blocks = blocks // { blocksState: [{id,name,block}...], blocksByStateId }
    this.blockEntitiesRegistry = new Map()
    this.tickets = [] // 区块加载票据
  }

  getBlockAt (x, y, z) {
    if (y < MIN_Y || y >= MIN_Y + 384) return null
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16)
    const c = this.getChunk(cx, cz)
    if (!c) return null
    const id = c.getBlock(x & 15, y, z & 15)
    return { stateId: id }
  }

  setBlock (x, y, z, stateId) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16)
    this.ensureChunk(cx, cz).setBlock(x & 15, y, z & 15, stateId)
  }

  blockInfo (stateId) {
    if (stateId === 0) return { name: 'air' }
    if (!this.blocks || !this.blocks.blocksStateIds) return { name: `block#${stateId}` } // 无数据索引时：非0视为实心
    return this.blocks.blocksStateIds[stateId] ?? { name: 'air' }
  }

  isAirLike (stateId) {
    const info = this.blockInfo(stateId)
    return info.name === 'air' || info.name === '' || (info.material && info.material.replace('minecraft:', '') === 'replaceable')
  }

  lightOpacity (stateId) {
    const info = this.blockInfo(stateId)
    return info.lightFilter ?? (this.isAirLike(stateId) ? 0 : 15)
  }

  // 查询与 box 相交的所有实心方块 AABB
  getCollidingBoxes (box) {
    const out = []
    const x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX)
    const y0 = Math.floor(box.minY), y1 = Math.floor(box.maxY)
    const z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const at = this.getBlockAt(x, y, z)
          if (!at || at.stateId === 0) continue
          const info = this.blockInfo(at.stateId)
          if (this.isAirLike(at.stateId)) continue
          const bb = info.boundingBox ?? { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 }
          out.push(new AABB(x + bb.minX, y + bb.minY, z + bb.minZ, x + bb.maxX, y + bb.maxY, z + bb.maxZ))
        }
      }
    }
    return out
  }

  // 破坏方块：返回掉落物名称，空气化并更新
  breakBlock (x, y, z) {
    const at = this.getBlockAt(x, y, z)
    if (!at || at.stateId === 0) return null
    const info = this.blockInfo(at.stateId)
    this.setBlock(x, y, z, 0)
    return { name: info.name, x, y, z }
  }

  placeBlock (x, y, z, stateId) {
    const at = this.getBlockAt(x, y, z)
    if (at && at.stateId !== 0) return false
    this.setBlock(x, y, z, stateId)
    return true
  }
}
