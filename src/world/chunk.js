// 1.20.1 区块格式：16x16 列，垂直方向 24 个 16^3 section（y=-64..320）
import { Section } from './section.js'

export const CHUNK_WIDTH = 16
export const CHUNK_HEIGHT = 384 // 总高度 (min y = -64)
export const MIN_Y = -64
export const SECTION_COUNT = 24

export class Chunk {
  constructor (x, z) {
    this.x = x
    this.z = z
    this.sections = new Array(SECTION_COUNT).fill(null)
    this.blockEntities = new Map() // key: local index -> {x,y,z,id,nbt}
    this.biomes = null // 若为 null，则各 section 自带 biome 数组
    this.dirty = true
  }

  sectionIndex (y) {
    return Math.floor((y - MIN_Y) / 16)
  }

  getSection (y, create = false) {
    const i = this.sectionIndex(y)
    if (i < 0 || i >= SECTION_COUNT) return null
    if (!this.sections[i] && create) this.sections[i] = new Section(i)
    return this.sections[i]
  }

  getBlock (x, y, z) {
    const s = this.getSection(y)
    return s ? s.getBlock(x, y & 15, z) : 0
  }

  setBlock (x, y, z, stateId) {
    const s = this.getSection(y, true)
    s.setBlock(x, y & 15, z, stateId)
    this.dirty = true
  }
}

export class ChunkColumn { // 简单世界容器：chunkKey -> Chunk
  constructor () { this.chunks = new Map() }
  key (cx, cz) { return cx + ',' + cz }
  getChunk (cx, cz) { return this.chunks.get(this.key(cx, cz)) }
  ensureChunk (cx, cz) {
    let c = this.getChunk(cx, cz)
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(this.key(cx, cz), c) }
    return c
  }
}
