'use strict'
// protodef Compiler 格式的 minecraft 专有类型：{ Read:{}, Write:{}, SizeOf:{} }
const [rVarInt, wVarInt, sVarInt] = require('protodef').types.varint
const { PartialReadError } = require('protodef').utils
const zlib = require('zlib')
const UUIDMOD = require('uuid-1345')
const nbt = require('prismarine-nbt')

module.exports = {
  Read: {
    varlong: ['native', (buffer, offset) => rVarInt(buffer, offset)],
    UUID: ['native', (buffer, offset) => {
      if (offset + 16 > buffer.length) throw new PartialReadError()
      return { value: UUIDMOD.stringify(buffer.slice(offset, offset + 16)), size: 16 }
    }],
    restBuffer: ['native', (buffer, offset) => ({ value: buffer.subarray(offset), size: buffer.length - offset })],
    compressedNbt: ['native', (buffer, offset) => {
      const length = buffer.readInt16BE(offset)
      if (length === -1) return { size: 2, value: undefined }
      const nbtBuffer = zlib.gunzipSync(buffer.slice(offset + 2, offset + 2 + length))
      const r = nbt.proto.read(nbtBuffer, 0, 'nbt')
      return { size: length + 2, value: r.value }
    }],
    entityMetadataLoop: ['native', function (buffer, offset, { entityType, endVal }, rootNode) {
      const metadata = []
      let cursor = offset
      while (true) {
        const type = buffer.readUInt8(cursor)
        cursor++
        if (type === endVal) return { value: metadata, size: cursor - offset }
        const item = this.read(buffer, cursor, entityType, { parent: rootNode, val: type })
        cursor += item.size
        metadata.push(item.value)
      }
    }],
    topBitSetTerminatedArray: ['native', function (buffer, offset, { type }) {
      const value = []
      let cursor = offset
      while (true) {
        const b = buffer[cursor]
        const terminated = !!(b & 0x80)
        buffer[cursor] &= 0x7f
        const r = this.read(buffer, cursor, type, {})
        cursor += r.size
        value.push(r.value)
        if (terminated) return { value, size: cursor - offset }
      }
    }],
    arrayWithLengthOffset: ['native', function (buffer, offset, typeArgs, rootNode) {
      const count = rootNode.typeArgs.count + typeArgs.offset
      const arrLen = rootNode.attributes[count]
      const arr = []
      let cursor = offset
      for (let i = 0; i < arrLen; i++) {
        const { value, size } = this.read(buffer, cursor, typeArgs.type, rootNode)
        cursor += size
        arr.push(value)
      }
      return { value: arr, size: cursor - offset }
    }]
  },
  Write: {
    varlong: ['native', (value, buffer, offset) => wVarInt(value, buffer, offset)],
    UUID: ['native', (value, buffer, offset) => {
      const buf = value.length === 32 ? Buffer.from(value, 'hex') : UUIDMOD.parse(value)
      buf.copy(buffer, offset)
      return offset + 16
    }],
    restBuffer: ['native', (value, buffer, offset) => { value.copy(buffer, offset); return offset + value.length }],
    compressedNbt: ['native', (value, buffer, offset) => {
      if (value == null) { buffer.writeInt16BE(-1, offset); return offset + 2 }
      const compressed = zlib.gzipSync(nbt.proto.write(value, 'nbt'))
      compressed.copy(buffer, offset + 2)
      buffer.writeInt16BE(compressed.length, offset)
      return offset + 2 + compressed.length
    }],
    entityMetadataLoop: ['native', function (value, buffer, offset, { entityType, endVal }, rootNode) {
      let cursor = offset
      for (const item of value) {
        buffer.writeUInt8(item.key, cursor++)
        cursor = this.write(item.value, buffer, cursor, entityType, { parent: rootNode, val: item.key })
      }
      buffer.writeUInt8(endVal, cursor++)
      return cursor
    }],
    topBitSetTerminatedArray: ['native', function (value, buffer, offset, { type }) {
      let cursor = offset
      for (let i = 0; i < value.length; i++) {
        cursor = this.write(value[i], buffer, cursor, type, {})
        buffer[cursor - 1] |= 0x80
      }
      return cursor
    }],
    arrayWithLengthOffset: ['native', function (value, buffer, offset, typeArgs) {
      let cursor = offset
      for (const v of value) cursor = this.write(v, buffer, cursor, typeArgs.type, {})
      return cursor
    }]
  },
  SizeOf: {
    varlong: ['native', (value) => sVarInt(value)],
    UUID: ['native', 16],
    restBuffer: ['native', (value) => value.length],
    compressedNbt: ['native', (value) => value == null ? 2 : 2 + zlib.gzipSync(nbt.proto.write(value, 'nbt')).length],
    entityMetadataLoop: ['native', function (value, { entityType }, rootNode) {
      let size = 1
      for (const item of value) size += 1 + this.sizeOf(item.value, entityType, { parent: rootNode, val: item.key })
      return size
    }],
    topBitSetTerminatedArray: ['native', function (value, { type }, rootNode) {
      let size = 0
      for (const v of value) size += this.sizeOf(v, type, rootNode)
      return size
    }],
    arrayWithLengthOffset: ['native', function (value, { type }, rootNode) {
      let size = 0
      for (const v of value) size += this.sizeOf(v, type, rootNode)
      return size
    }]
  }
}
