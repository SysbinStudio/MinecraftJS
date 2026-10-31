// palette + bit-packed block states（与原版 section 格式一致的简化实现）
export class Section {
  constructor (yIndex) {
    this.yIndex = yIndex
    this.data = new Uint16Array(16 * 16 * 16).fill(0) // 直接存 stateId（简化版 palette）
    this.blockLight = new Uint8Array(4096)
    this.skyLight = new Uint8Array(4096).fill(15)
    this.nonEmptyAirCount = 4096
  }
  static idx (x, y, z) { return (y << 8) | (z << 4) | x }
  getBlock (x, y, z) { return this.data[Section.idx(x, y, z)] }
  setBlock (x, y, z, stateId) {
    const i = Section.idx(x, y, z)
    const old = this.data[i]
    if (old === 0 && stateId !== 0) this.nonEmptyAirCount--
    if (old !== 0 && stateId === 0) this.nonEmptyAirCount++
    this.data[i] = stateId
  }
  isEmpty () { return this.nonEmptyAirCount === 0 }
}
