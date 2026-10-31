'use strict'
// 协议层：protodef + minecraft-data 的 1.20.1 (protocol 763) 编解码，自研实现（不依赖 node-minecraft-protocol）
const { ProtoDefCompiler, CompiledProtodef } = require('protodef').Compiler
const nbt = require('prismarine-nbt')

const PROTOCOL_VERSION = 763 // 1.20.1

// 复刻 minecraft-protocol 的 datatypes/minecraft.js 中的专有类型（read/write/sizeOf 三元组格式）
const [rVarInt, wVarInt, sVarInt] = require('protodef').types.varint
const { PartialReadError } = require('protodef').utils
const zlib = require('zlib')
const UUIDMOD = require('uuid-1345')

function readVarLong (b, o) { return rVarInt(b, o) }
function writeVarLong (v, b, o) { return wVarInt(v, b, o) }
function sizeOfVarLong (v) { return sVarInt(v) }
function readUUID (buffer, offset) {
  if (offset + 16 > buffer.length) throw new PartialReadError()
  return { value: UUIDMOD.stringify(buffer.slice(offset, 16 + offset)), size: 16 }
}
function writeUUID (value, buffer, offset) {
  const buf = value.length === 32 ? Buffer.from(value, 'hex') : UUIDMOD.parse(value)
  buf.copy(buffer, offset)
  return offset + 16
}
function readRestBuffer (buffer, offset) { return { value: buffer.subarray(offset), size: buffer.length - offset } }
function writeRestBuffer (value, buffer, offset) { value.copy(buffer, offset); return offset + value.length }
function sizeOfRestBuffer (value) { return value.length }
function readCompressedNbt (buffer, offset) {
  const length = buffer.readInt16BE(offset)
  if (length === -1) return { size: 2, value: undefined }
  const compressedNbt = buffer.slice(offset + 2, offset + 2 + length)
  const nbtBuffer = zlib.gunzipSync(compressedNbt)
  const results = nbt.proto.read(nbtBuffer, 0, 'nbt')
  return { size: length + 2, value: results.value }
}
function writeCompressedNbt (value, buffer, offset) {
  if (value === undefined || value === null) { buffer.writeInt16BE(-1, offset); return offset + 2 }
  const nbtBuf = nbt.proto.write(value, 'nbt')
  const compressed = zlib.gzipSync(nbtBuf)
  compressed.copy(buffer, offset + 2)
  buffer.writeInt16BE(compressed.length, offset)
  return offset + 2 + compressed.length
}
function sizeOfCompressedNbt (value) {
  if (value == null) return 2
  const nbtBuf = nbt.proto.write(value, 'nbt')
  return 2 + zlib.gzipSync(nbtBuf).length
}
function readTopBitSetTerminatedArray (buffer, offset, { type }) {
  const value = []
  let cursor = offset
  while (true) {
    const b = buffer[cursor]
    const terminated = !!(b & 0x80)
    buffer[cursor] &= 0x7f
    const r = this.read(buffer, cursor, type, {})
    cursor += r.size
    value.push(r.value)
    if (terminated) break
  }
  return { value, size: cursor - offset }
}
function writeTopBitSetTerminatedArray (value, buffer, offset, { type }) {
  let cursor = offset
  for (let i = 0; i < value.length; i++) {
    cursor = this.write(value[i], buffer, cursor, type, {})
    buffer[cursor - 1] |= 0x80
  }
  return cursor
}
function sizeOfTopBitSetTerminatedArray (value, { type }, rootNode) {
  let size = 0
  for (const v of value) size += this.sizeOf(v, type, rootNode)
  return size
}
function readEntityMetadataLoop (buffer, offset, { entityType, endVal }, rootNode) {
  const metadata = []
  let cursor = offset
  while (true) {
    let type = buffer.readUInt8(cursor)
    if (type === endVal) { cursor++; return { value: metadata, size: cursor - offset } }
    cursor++
    const item = this.read(buffer, cursor, entityType, { parent: rootNode, val: type })
    cursor += item.size
    metadata.push(item.value)
  }
}
function writeEntityMetadataLoop (value, buffer, offset, { entityType, endVal }, rootNode) {
  let cursor = offset
  for (const item of value) {
    buffer.writeUInt8(item.key, cursor++)
    cursor = this.write(item.value, buffer, cursor, entityType, { parent: rootNode, val: item.key })
  }
  buffer.writeUInt8(endVal, cursor++)
  return cursor
}
function sizeOfEntityMetadataLoop (value, { entityType }, rootNode) {
  let size = 1
  for (const item of value) {
    size += 1
    size += this.sizeOf(item.value, entityType, { parent: rootNode, val: item.key })
  }
  return size
}
function readArrayWithLengthOffset (buffer, offset, typeArgs, rootNode) {
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
}
function writeArrayWithLengthOffset (value, buffer, offset, typeArgs, rootNode) {
  let cursor = offset
  for (const v of value) cursor = this.write(v, buffer, cursor, typeArgs.type, rootNode)
  return cursor
}
function sizeOfArrayWithLengthOffset (value, { type }, rootNode) {
  let size = 0
  for (const v of value) size += this.sizeOf(v, type, rootNode)
  return size
}

const minecraftTypes = {
  varlong: [readVarLong, writeVarLong, sizeOfVarLong],
  UUID: [readUUID, writeUUID, 16],
  compressedNbt: [readCompressedNbt, writeCompressedNbt, sizeOfCompressedNbt],
  restBuffer: [readRestBuffer, writeRestBuffer, sizeOfRestBuffer],
  entityMetadataLoop: [readEntityMetadataLoop, writeEntityMetadataLoop, sizeOfEntityMetadataLoop],
  topBitSetTerminatedArray: [readTopBitSetTerminatedArray, writeTopBitSetTerminatedArray, sizeOfTopBitSetTerminatedArray],
  arrayWithLengthOffset: [readArrayWithLengthOffset, writeArrayWithLengthOffset, sizeOfArrayWithLengthOffset]
}

function createProtocol (mcVersion = '1.20.1') {
  const md = require('minecraft-data')(mcVersion)
  const definitions = md.protocol

  function build (state, dir) {
    const compiler = new ProtoDefCompiler()
    compiler.addTypes(require('./datatypes-minecraft'))
    nbt.addTypesToCompiler('big', compiler)
    compiler.addProtocol(definitions, [state, dir])
    return compiler.compileProtoDefSync()
  }

  const cache = {}
  function get (state, dir) {
    const key = state + ';' + dir
    if (!cache[key]) cache[key] = build(state, dir)
    return cache[key]
  }

  // 编码：{name, params} -> Buffer（含包 ID VarInt，不含帧长度前缀）
  function encodePacket (state, dir, packet) {
    return get(state, dir).createPacketBuffer(packet)
  }

  // 解码：Buffer -> {name, params}
  function decodePacket (state, dir, buf) {
    return get(state, dir).parsePacketBuffer(buf, 0).data
  }

  function packetId (state, dir, name) {
    const map = definitions[state][dir]
    for (const [id, n] of Object.entries(map)) if (n === name) return parseInt(id)
    throw new Error(`unknown packet ${name} in ${state}/${dir}`)
  }

  return { md, encodePacket, decodePacket, packetId, definitions, PROTOCOL_VERSION }
}

module.exports = { createProtocol, PROTOCOL_VERSION }
