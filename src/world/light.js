// 光照引擎：天空光向下直透 + BFS 衰减（对应原版 SkyBlockLightEngine / BlockLightEngine）
import { MIN_Y } from './chunk.js'

const AIR_LIKE = new Set([0]) // stateId 0 = air（简化：由 world.isAirLike 判断）

export class LightEngine {
  constructor (world) { this.world = world }

  // 计算某世界坐标的光照值（blockLight），BFS 从光源扩散，半径受限
  computeBlockLight (sx, sy, sz, level = 15, radius = 14) {
    const visited = new Map()
    const queue = [[sx, sy, sz, level]]
    while (queue.length) {
      const [x, y, z, l] = queue.shift()
      const k = x + ',' + y + ',' + z
      const prev = visited.get(k)
      if (prev !== undefined && prev >= l) continue
      visited.set(k, l)
      if (l <= 1) continue
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz
        if (Math.abs(nx - sx) + Math.abs(ny - sy) + Math.abs(nz - sz) > radius) continue
        const at = this.world.getBlockAt(nx, ny, nz)
        if (at === null) continue
        const opacity = this.world.lightOpacity(at.stateId)
        const nl = l - 1 - opacity
        if (nl > 0) queue.push([nx, ny, nz, nl])
      }
    }
    return visited
  }

  // 天空光：垂直向下传播，遇到不透明方块停止（原版简化模型）
  skyLightVisible (x, y, z) {
    for (let yy = 320; yy > y; yy--) {
      const at = this.world.getBlockAt(x, yy, z)
      if (at === null) return false
      if (this.world.lightOpacity(at.stateId) >= 15) return false
    }
    return true
  }
}
