'use strict'
// Growing read/write byte buffer — the JS counterpart of Mojang's
// net.minecraft.network.FriendlyByteBuf (which wraps a Netty ByteBuf).
// All packet serialization in vanilla goes through FriendlyByteBuf, so this
// class implements the same method surface: readVarInt/writeVarInt,
// readUTF/writeUTF (with 32767 char limit check), read/writeNbt etc.

const { writeVarInt, readVarInt, varIntSize, writeVarLong, readVarLong } = require('./varint')
const nbt = require('../nbt/nbt')

class PacketBuffer {
  constructor (buffer) {
    this.buffer = buffer ? Buffer.from(buffer) : Buffer.alloc(0)
    this.readerIndex = 0
  }

  // --- low level ---
  get writerIndex () { return this.buffer.length }
  readableBytes () { return this.buffer.length - this.readerIndex }

  _ensure (extra) {
    if (extra <= 0) return
    const grown = Buffer.allocUnsafe(this.buffer.length + extra)
    this.buffer.copy(grown, 0)
    this.buffer = grown
  }

  ensure (extra) { this._ensure(extra); return this }

  write (buf) { this._ensure(buf.length); buf.copy(this.buffer, this.writerIndex); this._ensure(buf.length); /* writerIndex follows length */ this.buffer = Buffer.concat([this.buffer.slice(0, this.writerIndex), buf]); return this }

  // simpler & faster append used internally
  _append (buf) {
    const nb = Buffer.allocUnsafe(this.buffer.length + buf.length)
    this.buffer.copy(nb, 0)
    buf.copy(nb, this.buffer.length)
    this.buffer = nb
    return this
  }

  read (len) {
    if (this.readableBytes() < len) throw new Error(`Requested ${len} bytes but only ${this.readableBytes()} readable`)
    const out = this.buffer.slice(this.readerIndex, this.readerIndex + len)
    this.readerIndex += len
    return out
  }

  // --- primitives (FriendlyByteBuf parity) ---
  readBoolean () { return this.read(1)[0] !== 0 }
  writeBoolean (v) { return this._append(Buffer.from([v ? 1 : 0])) }

  readByte () { return this.read(1).readInt8(0) }
  writeByte (v) { const b = Buffer.alloc(1); b.writeInt8(v, 0); return this._append(b) }

  readUnsignedByte () { return this.read(1).readUInt8(0) }

  readShort () { return this.read(2).readInt16BE(0) }
  writeShort (v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return this._append(b) }

  readUnsignedShort () { return this.read(2).readUInt16BE(0) }
  writeUnsignedShort (v) { const b = Buffer.alloc(2); b.writeUInt16BE(v, 0); return this._append(b) }

  readInt () { return this.read(4).readInt32BE(0) }
  writeInt (v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return this._append(b) }

  readLong () { return this.read(8).readBigInt64BE(0) }
  writeLong (v) {
    const b = Buffer.alloc(8)
    // accept signed or unsigned 64-bit values (packed positions are unsigned in vanilla)
    b.writeBigUInt64BE(BigInt.asUintN(64, BigInt(v)), 0)
    return this._append(b)
  }

  readFloat () { return this.read(4).readFloatBE(0) }
  writeFloat (v) { const b = Buffer.alloc(4); b.writeFloatBE(v, 0); return this._append(b) }

  readDouble () { return this.read(8).readDoubleBE(0) }
  writeDouble (v) { const b = Buffer.alloc(8); b.writeDoubleBE(v, 0); return this._append(b) }

  // --- varints ---
  readVarInt () { const [v, n] = readVarInt(this.buffer, this.readerIndex); this.readerIndex += n; return v }
  writeVarInt (v) {
    const tmp = Buffer.alloc(5)
    const n = writeVarInt(v, tmp, 0)
    return this._append(tmp.slice(0, n))
  }

  readVarLong () { const [v, n] = readVarLong(this.buffer, this.readerIndex); this.readerIndex += n; return v }
  writeVarLong (v) {
    const tmp = Buffer.alloc(10)
    const n = writeVarLong(v, tmp, 0)
    return this._append(tmp.slice(0, n))
  }

  // --- strings: readUtf(int maxSize) with vanilla's "Packet was too big" guard ---
  readString (maxSize = 32767) {
    const len = this.readVarInt()
    if (len > maxSize * 4) throw new Error('String too long')
    const s = this.read(len).toString('utf8')
    if (s.length > maxSize) throw new Error('String too long')
    return s
  }

  writeString (s) {
    const b = Buffer.from(s, 'utf8')
    this.writeVarInt(b.length)
    return this._append(b)
  }

  // --- UUID (Mojang reads two longs) ---
  readUUID () {
    const msb = this.readLong()
    const lsb = this.readLong()
    const hex = msb.toString(16).padStart(16, '0') + lsb.toString(16).padStart(16, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  writeUUID (uuid) {
    const hex = uuid.replace(/-/g, '')
    const msb = BigInt('0x' + hex.slice(0, 16))
    const lsb = BigInt('0x' + hex.slice(16))
    const b = Buffer.alloc(16)
    b.writeBigUInt64BE(msb, 0)
    b.writeBigUInt64BE(lsb, 8)
    return this._append(b)
  }

  // --- position: packed into a single u64 like vanilla BlockPosition.asLong() ---
  readPosition () {
    const long = this.readLong()
    // vanilla: x = long >> 38; y = (long << 52) >> 52; z = (long << 26) >> 38
    const bx = BigInt.asUintN(64, long)
    const x = Number(BigInt.asIntN(26, bx >> 38n))
    const y = Number(BigInt.asIntN(12, bx << 52n >> 52n))
    const z = Number(BigInt.asIntN(26, bx << 26n >> 38n))
    return { x, y, z }
  }

  writePosition (x, y, z) {
    const packed = ((BigInt(x) & 0x3ffffffn) << 38n) | ((BigInt(z) & 0x3ffffffn) << 12n) | (BigInt(y) & 0xfffn)
    return this.writeLong(packed)
  }

  readOptionalPosition () {
    if (this.readBoolean()) return this.readPosition()
    return null
  }

  writeOptionalPosition (pos) {
    if (pos) { this.writeBoolean(true); this.writePosition(pos.x, pos.y, pos.z) } else this.writeBoolean(false)
    return this
  }

  // --- angle (rotation byte, 1/256th of a turn like MC rotation encoding) ---
  readAngle () { return this.readUnsignedByte() * 360 / 256 }
  writeAngle (deg) { const b = Buffer.alloc(1); b.writeUInt8(Math.round(((deg % 360) / 360) * 256) & 0xff, 0); return this._append(b) }

  // --- NBT ---
  readNBT (uncompressed = false) {
    const [data, size] = nbt.read(this.buffer.slice(this.readerIndex), uncompressed)
    this.readerIndex += size
    return data
  }

  writeNBT (tag, uncompressed = false) {
    return this._append(nbt.write(tag, uncompressed))
  }

  writeOptionalNBT (tag) {
    if (tag == null) return this.writeByte(0)
    this.writeNBT(tag)
    return this
  }

  // --- arrays ---
  readArray (reader) {
    const len = this.readVarInt()
    const out = []
    for (let i = 0; i < len; i++) out.push(reader(this))
    return out
  }

  writeArray (writer, arr) {
    this.writeVarInt(arr.length)
    for (const item of arr) writer(this, item)
    return this
  }

  readEnumValues (mapper) {
    const ordinal = this.readVarInt()
    const entry = Object.entries(mapper).find(([, v]) => v === ordinal)
    if (!entry) throw new Error(`Unknown enum value ${ordinal}`)
    return entry[0]
  }

  writeEnumValue (mapper, name) {
    if (!(name in mapper)) throw new Error(`Unknown enum ${name}`)
    return this.writeVarInt(mapper[name])
  }

  toBuffer () { return this.buffer.slice(this.readerIndex) }
}

module.exports = { PacketBuffer, varIntSize }
