'use strict'
// VarInt / VarLong codec — mirrors Mojang's Netty implementations
// (io.netty.handler.codec.minecraft.MinecraftVarIntFrameDecoder / MinecraftFraming.java)
// Reference: mcsrc.dev 1.20.1 net.minecraft.network.protocol.PacketEncoder & Frame class

const MAX_VARINT_BYTES = 5
const MAX_VARLONG_BYTES = 10

/** Write a 32-bit VarInt into `buffer` at `offset`. Returns bytes written. */
function writeVarInt (value, buffer, offset) {
  let v = value | 0
  for (let i = 0; i < MAX_VARINT_BYTES; i++) {
    const temp = v & 0x7f
    v >>>= 7 // unsigned shift keeps sign bits out
    if (v !== 0) {
      buffer.writeUInt8(temp | 0x80, offset + i)
    } else {
      buffer.writeUInt8(temp, offset + i)
      return i + 1
    }
  }
  throw new Error('VarInt too big')
}

/** Read a VarInt from `buffer` starting at `offset`. Returns [value, bytesRead]. */
function readVarInt (buffer, offset = 0) {
  let value = 0
  let position = 0
  let currentByte
  do {
    if (offset + position >= buffer.length) throw new Error('VarInt did not terminate after 5 bytes')
    currentByte = buffer.readUInt8(offset + position)
    // NB: must shift by position*7 (Mojang: value |= (b & 0x7F) << i * 7)
    value |= (currentByte & 0x7f) << (position * 7)
    position++
    if (position > MAX_VARINT_BYTES) throw new Error('VarInt is too big')
  } while ((currentByte & 0x80) === 0x80)
  return [value, position]
}

/** Number of bytes a VarInt would occupy. */
function varIntSize (value) {
  let v = value ^ (value >> 31) // zigzag-ish size calc like Netty ByteBufUtil.varInt
  v = Math.abs(value | 0)
  if (v < 0x80) return 1
  if (v < 0x4000) return 2
  if (v < 0x200000) return 3
  if (v < 0x10000000) return 4
  return 5
}

/** VarLong (64-bit) — BigInt based, used for entity ids / keep-alive ids in 1.20.1. */
function writeVarLong (value, buffer, offset) {
  let v = BigInt.asUintN(64, BigInt(value))
  let i = 0
  while ((v & ~0x7fn) !== 0n) {
    buffer.writeUInt8(Number(v & 0x7fn) | 0x80, offset + i)
    v >>= 7n
    i++
    if (i >= MAX_VARLONG_BYTES) throw new Error('VarLong too big')
  }
  buffer.writeUInt8(Number(v), offset + i)
  return i + 1
}

function readVarLong (buffer, offset = 0) {
  let value = 0n
  let position = 0
  let currentByte
  do {
    if (offset + position >= buffer.length) throw new Error('VarLong did not terminate')
    currentByte = buffer.readUInt8(offset + position)
    value |= BigInt(currentByte & 0x7f) << BigInt(position * 7)
    position++
    if (position > MAX_VARLONG_BYTES) throw new Error('VarLong is too big')
  } while ((currentByte & 0x80) === 0x80)
  return [BigInt.asIntN(64, value), position]
}

module.exports = { writeVarInt, readVarInt, varIntSize, writeVarLong, readVarLong, MAX_VARINT_BYTES, MAX_VARLONG_BYTES }
