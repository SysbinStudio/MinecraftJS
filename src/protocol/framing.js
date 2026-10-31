'use strict'
// 1.20.1 网络分帧：Length-Prefixed (VarInt) packets + optional zlib
const { readVarInt, writeVarInt, varIntSize } = require('./varint')

class PacketFramer extends require('stream').Transform {
  constructor () {
    super()
    this._buf = Buffer.alloc(0)
  }

  _transform (chunk, enc, cb) {
    this._buf = Buffer.concat([this._buf, chunk])
    let offset = 0
    while (true) {
      let value = 0, size = 0, shift = 0, i = offset, ok = false
      while (i < this._buf.length) {
        const b = this._buf[i]
        value |= (b & 0x7f) << shift
        i++
        if ((b & 0x80) === 0) { ok = true; break }
        shift += 7
        if (shift > 28) return cb(new Error('VarInt too big'))
      }
      if (!ok) break
      const headerLen = i - offset
      if (this._buf.length - i < value) break
      this.push(this._buf.subarray(i, i + value))
      offset = i + value
    }
    this._buf = this._buf.subarray(offset)
    cb()
  }
}

function framePacket (payload) {
  return Buffer.concat([writeVarInt(payload.length), payload])
}

module.exports = { PacketFramer, framePacket }
