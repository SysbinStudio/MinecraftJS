// three.js 区块网格构建器：把 prismarine-chunk ChunkColumn（或等价 getBlockStateId 接口）
// 转换成带面剔除的 BufferGeometry —— 对应原版 chunk mesh builder 的最小实现。
// 每个 16x16x(sectionCount*16) 列生成一个 merged geometry，按 (颜色,形状) 分组多材质。
import * as THREE from 'three'
import { blockColor, renderShape } from './blocks.js'

const FACES = [
  // dir, corners(4个局部坐标), normal
  { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], n: [1, 0, 0], shade: 0.8 },   // +X
  { d: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], n: [-1, 0, 0], shade: 0.8 }, // -X
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], n: [0, 1, 0], shade: 1.0 },   // +Y
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], n: [0, -1, 0], shade: 0.5 }, // -Y
  { d: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], n: [0, 0, 1], shade: 0.9 },   // +Z
  { d: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], n: [0, 0, -1], shade: 0.9 }  // -Z
]

// 判断 stateId 是否"渲染为实心不透明"（决定面剔除）
export function makeOpaqueTest (stateTable) {
  return (stateId) => {
    if (stateId === 0 || stateId == null) return false
    const info = stateTable[stateId]
    if (!info) return true // 未知状态保守视为实心
    if (info.name === 'air' || info.name === 'cave_air' || info.name === 'void_air') return false
    if (info.transparent) return false
    if (/water|lava/.test(info.name)) return false
    return true
  }
}

// 从 chunk 对象读取指定 y 范围的面数据并生成几何体
// chunk: { min_y, sections... } 需暴露 getBlockStateId([x,y,z])（prismarine-chunk API）
export function buildChunkGeometry (chunk, stateTable, isOpaque, opts = {}) {
  const groups = new Map() // key: color<<2|shape -> {pos,nor,idx}
  const minY = chunk.minY ?? -64
  const maxY = minY + ((chunk.sectionsMaxY ?? 24) * 16)

  const get = (x, y, z) => {
    try { return chunk.getBlockStateId([x, y, z]) } catch { return 0 }
  }

  for (let y = Math.max(minY, opts.yMin ?? minY); y < Math.min(maxY, opts.yMax ?? maxY); y++) {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const sid = get(x, y, z)
        if (!sid) continue
        const info = stateTable[sid]
        if (!info) continue
        const name = info.name
        if (name === 'air' || name === 'cave_air' || name === 'void_air') continue
        const color = blockColor(name)
        if (color == null) continue
        const shape = renderShape(info)
        const transparent = !isOpaque(sid)
        const gkey = `${color}_${shape}_${transparent ? 1 : 0}`
        let g = groups.get(gkey)
        if (!g) { g = { color, shape, transparent, pos: [], nor: [], uv: [], idx: [] }; groups.set(gkey, g) }

        // 高度缩放：fluid=0.9 slab=0.5 cross=1(但用双面片)
        const hScale = shape === 'fluid' ? 0.9 : shape === 'half' ? 0.5 : 1

        for (const f of FACES) {
          const [dx, dy, dz] = f.d
          const nx = x + dx, ny = y + dy, nz = z + dz
          const nsid = get(nx, ny, nz)
          const neighborBlocksFace = nsid !== 0 && isOpaque(nsid)
          if (neighborBlocksFace) continue
          // 透明方块之间相邻时跳过同种方块面（水与水之间）
          if (transparent && nsid === sid) continue

          const base = g.pos.length / 3
          for (const [cx, cy, cz] of f.c) {
            g.pos.push(x + cx, y + cy * hScale, z + cz)
            g.nor.push(...f.n)
          }
          g.uv.push(0, 0, 0, 1, 1, 1, 1, 0)
          // two triangles, CCW when viewed from outside
          g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
        // cross 形状（火把/花）：两个对角面片
        if (shape === 'cross') {
          const base = g.pos.length / 3
          const quads = [
            [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]],
            [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]]
          ]
          for (const q of quads) {
            for (const [px, py, pz] of q) { g.pos.push(x + px, y + py, z + pz); g.nor.push(0, 1, 0) }
            g.uv.push(0, 0, 1, 0, 1, 1, 0, 1)
            g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
            g.idx.push(base + 2, base + 1, base, base + 3, base + 2, base) // 双面
          }
        }
      }
    }
  }

  const geometries = []
  for (const g of groups.values()) {
    if (g.pos.length === 0) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
    geo.setIndex(g.idx)
    geo.userData = { color: g.color, transparent: g.transparent, shape: g.shape }
    geometries.push(geo)
  }
  return geometries
}

// 材质缓存：每种颜色一个 MeshLambertMaterial（调试渲染无纹理方案）
const matCache = new Map()
export function getMaterial (color, transparent) {
  const key = `${color}_${transparent}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      transparent: !!transparent,
      opacity: transparent ? 0.7 : 1.0,
      side: THREE.DoubleSide
    })
    matCache.set(key, m)
  }
  return m
}
