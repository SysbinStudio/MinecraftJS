'use strict'
// Full NBT reader/writer — JS translation of net.minecraft.nbt.* :
//   NbtIo.read/write, TypedJsonToNbt, and the TagType size table.
// Supports network NBT (unnamed root) used in 1.20.1 packets and
// file NBT (named root) used by region/anvil saves.

const zlib = require('zlib')
const T = require('./tags')

class Tag {
  constructor (type, value, name = '') {
    this.type = type
    this.value = value
    this.name = name
  }
}

const compound = (obj = {}, name = '') => new Tag(T.TAG_COMPOUND, obj, name)

// ---------- reading ----------
class Reader {
  constructor (buf) { this.buf = buf; this.pos = 0 }
  u8 () { return this.buf.readUInt8(this.pos++) }
  i8 () { return this.buf.readInt8(this.pos++) }
  u16 () { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v }
  i16 () { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v }
  i32 () { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v }
  f32 () { const v = this.buf.readFloatBE(this.pos); this.pos += 4; return v }
  i64 () { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return v }
  f64 () { const v = this.buf.readDoubleBE(this.pos); this.pos += 8; return v }
  str () { const len = this.u16(); const s = this.buf.slice(this.pos, this.pos + len).toString('utf8'); this.pos += len; return s }
  bytes (n) { const b = this.buf.slice(this.pos, this.pos + n); this.pos += n; return b }

  readPayload (type) {
    switch (type) {
      case T.TAG_BYTE: return this.i8()
      case T.TAG_SHORT: return this.i16()
      case T.TAG_INT: return this.i32()
      case T.TAG_LONG: return this.i64()
      case T.TAG_FLOAT: return this.f32()
      case T.TAG_DOUBLE: return this.f64()
      case T.TAG_BYTE_ARRAY: { const n = this.i32(); return this.bytes(n) }
      case T.TAG_STRING: return this.str()
      case T.TAG_LIST: {
        const elemType = this.u8()
        const n = this.i32()
        const list = []
        for (let i = 0; i < n; i++) list.push(this.readPayload(elemType))
        return { type: elemType, value: list }
      }
      case T.TAG_COMPOUND: {
        const out = {}
        for (;;) {
          const t = this.u8()
          if (t === T.TAG_END) break
          const name = this.str()
          out[name] = this.readPayload(t)
          out[name]._type = undefined // types tracked via wrapper below
          out[name] = { __type: t, value: out[name] }
        }
        return out
      }
      case T.TAG_INT_ARRAY: { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.i32()); return a }
      case T.TAG_LONG_ARRAY: { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.i64()); return a }
      default: throw new Error('Unknown NBT tag type ' + type)
    }
  }
}

/** Read one full named-tag structure (root). Returns [plainObject, bytesConsumed]. */
function read (buffer, uncompressed = false) {
  let buf = buffer
  // gzip sniff is not part of vanilla NBT (vanilla handles compression at stream level),
  // but we accept it for convenience with region files.
  if (!uncompressed && buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf)
  else if (!uncompressed && buf.length > 1 && buf[0] === 0x78) { try { buf = zlib.inflateSync(buf) } catch (e) {} }
  const r = new Reader(buf)
  const rootType = r.u8()
  if (rootType !== T.TAG_COMPOUND) throw new Error('Root NBT tag must be compound')
  const name = r.str()
  const payload = r.readPayload(T.TAG_COMPOUND)
  return [unwrap(payload, name), r.pos]
}

// Convert internal {__type, value} wrappers into a plain JS object tree
function unwrap (payload, name) {
  const out = { type: T.TAG_COMPOUND, name, value: {} }
  for (const [k, v] of Object.entries(payload)) {
    if (!v || typeof v !== 'object' || !('__type' in v)) continue
    out.value[k] = convert(v.__type, v.value, k)
  }
  return out
}

function convert (type, value, name) {
  switch (type) {
    case T.TAG_COMPOUND: {
      const c = { type, name, value: {} }
      for (const [k, v] of Object.entries(value)) {
        if (v && typeof v === 'object' && '__type' in v) c.value[k] = convert(v.__type, v.value, k)
      }
      return c
    }
    case T.TAG_LIST:
      return { type, name, value: value.value.map((el, i) => ({ type: value.type, name: String(i), value: value.type === T.TAG_COMPOUND ? convert(T.TAG_COMPOUND, el, String(i)).value : el })) }
    case T.TAG_LONG: return { type, name, value: Number(value) }
    default: return { type, name, value }
  }
}

// ---------- writing ----------
class Writer {
  constructor () { this.chunks = []; this.len = 0 }
  push (b) { this.chunks.push(b); this.len += b.length }
  u8 (v) { const b = Buffer.alloc(1); b.writeUInt8(v, 0); this.push(b) }
  i8 (v) { const b = Buffer.alloc(1); b.writeInt8(v, 0); this.push(b) }
  u16 (v) { const b = Buffer.alloc(2); b.writeUInt16BE(v, 0); this.push(b) }
  i16 (v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); this.push(b) }
  i32 (v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); this.push(b) }
  f32 (v) { const b = Buffer.alloc(4); b.writeFloatBE(v, 0); this.push(b) }
  i64 (v) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v), 0); this.push(b) }
  f64 (v) { const b = Buffer.alloc(8); b.writeDoubleBE(v, 0); this.push(b) }
  str (s) { const b = Buffer.from(s, 'utf8'); this.u16(b.length); this.push(b) }
  bytes (b) { this.push(Buffer.isBuffer(b) ? b : Buffer.from(b)) }

  writePayload (type, value) {
    switch (type) {
      case T.TAG_BYTE: return this.i8(value)
      case T.TAG_SHORT: return this.i16(value)
      case T.TAG_INT: return this.i32(value)
      case T.TAG_LONG: return this.i64(value)
      case T.TAG_FLOAT: return this.f32(value)
      case T.TAG_DOUBLE: return this.f64(value)
      case T.TAG_BYTE_ARRAY: this.i32(value.length); return this.bytes(value)
      case T.TAG_STRING: return this.str(value)
      case T.TAG_LIST: {
        const list = value.value ?? value
        const elemType = value.type ?? (list.length ? guessType(list[0].value ?? list[0]) : T.TAG_END)
        this.u8(elemType)
        this.i32(list.length)
        for (const el of list) {
          if (elemType === T.TAG_COMPOUND) { this._compoundBody(el.value ?? el) } else this.writePayload(elemType, el.value ?? el)
        }
        return
      }
      case T.TAG_COMPOUND: return this._compoundBody(value)
      case T.TAG_INT_ARRAY: this.i32(value.length); for (const x of value) this.i32(x); return
      case T.TAG_LONG_ARRAY: this.i32(value.length); for (const x of value) this.i64(x); return
      default: throw new Error('Unknown NBT type ' + type)
    }
  }

  _compoundBody (obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) continue
      const type = v.type ?? guessType(v)
      if (type === T.TAG_END) continue
      this.u8(type)
      this.str(k)
      if (type === T.TAG_COMPOUND) this._compoundBody(v.value)
      else this.writePayload(type, v.value ?? v)
    }
    this.u8(T.TAG_END)
  }

  toBuffer () { return Buffer.concat(this.chunks, this.len) }
}

function guessType (v) {
  if (typeof v === 'number') return Number.isInteger(v) ? T.TAG_INT : T.TAG_DOUBLE
  if (typeof v === 'bigint') return T.TAG_LONG
  if (typeof v === 'string') return T.TAG_STRING
  if (typeof v === 'boolean') return T.TAG_BYTE
  if (Buffer.isBuffer(v)) return T.TAG_BYTE_ARRAY
  return T.TAG_COMPOUND
}

/** Serialize an NBT tree. `named=true` writes the root name (file format). */
function write (tag, uncompressed = true, named = false) {
  const w = new Writer()
  w.u8(tag.type ?? T.TAG_COMPOUND)
  if (named) w.str(tag.name ?? '')
  else w.str('') // network NBT: empty root name
  if ((tag.type ?? T.TAG_COMPOUND) === T.TAG_COMPOUND) w._compoundBody(tag.value)
  else w.writePayload(tag.type, tag.value)
  const buf = w.toBuffer()
  return uncompressed ? buf : zlib.gzipSync(buf)
}

module.exports = { read, write, Tag, compound, T }
