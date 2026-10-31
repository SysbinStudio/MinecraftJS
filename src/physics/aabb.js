// AxisAlignedBB —— 对应 net.minecraft.world.phys.AABB
export class AABB {
  constructor (minX, minY, minZ, maxX, maxY, maxZ) {
    this.minX = minX; this.minY = minY; this.minZ = minZ
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ
  }
  static ofCentered (x, y, z, width, height) {
    const hw = width / 2
    return new AABB(x - hw, y, z - hw, x + hw, y + height, z + hw)
  }
  inflate (x, y, z) {
    return new AABB(this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z)
  }
  expand (x, y, z) {
    return new AABB(this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z)
  }
  intersects (o) {
    return !(o.minX > this.maxX || o.maxX < this.minX ||
             o.minY > this.maxY || o.maxY < this.minY ||
             o.minZ > this.maxZ || o.maxZ < this.minZ)
  }
  clipCollideX (o, x) { return x > 0 ? o.minX - this.maxX : o.maxX - this.minX }
  clipCollideY (o, y) { return y > 0 ? o.minY - this.maxY : o.maxY - this.minY }
  clipCollideZ (o, z) { return z > 0 ? o.minZ - this.maxZ : o.maxZ - this.minZ }
}
