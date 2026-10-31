"use strict";

// src/protocol/varint.js
var MAX_VARINT_BYTES = 5;
var MAX_VARLONG_BYTES = 10;
function writeVarInt(value, buffer, offset) {
  let v = value | 0;
  for (let i = 0; i < MAX_VARINT_BYTES; i++) {
    const temp = v & 127;
    v >>>= 7;
    if (v !== 0) {
      buffer.writeUInt8(temp | 128, offset + i);
    } else {
      buffer.writeUInt8(temp, offset + i);
      return i + 1;
    }
  }
  throw new Error("VarInt too big");
}
function readVarInt(buffer, offset = 0) {
  let value = 0;
  let position = 0;
  let currentByte;
  do {
    if (offset + position >= buffer.length) throw new Error("VarInt did not terminate after 5 bytes");
    currentByte = buffer.readUInt8(offset + position);
    value |= (currentByte & 127) << position * 7;
    position++;
    if (position > MAX_VARINT_BYTES) throw new Error("VarInt is too big");
  } while ((currentByte & 128) === 128);
  return [value, position];
}
function varIntSize(value) {
  let v = value ^ value >> 31;
  v = Math.abs(value | 0);
  if (v < 128) return 1;
  if (v < 16384) return 2;
  if (v < 2097152) return 3;
  if (v < 268435456) return 4;
  return 5;
}
function writeVarLong(value, buffer, offset) {
  let v = BigInt.asUintN(64, BigInt(value));
  let i = 0;
  while ((v & ~0x7fn) !== 0n) {
    buffer.writeUInt8(Number(v & 0x7fn) | 128, offset + i);
    v >>= 7n;
    i++;
    if (i >= MAX_VARLONG_BYTES) throw new Error("VarLong too big");
  }
  buffer.writeUInt8(Number(v), offset + i);
  return i + 1;
}
function readVarLong(buffer, offset = 0) {
  let value = 0n;
  let position = 0;
  let currentByte;
  do {
    if (offset + position >= buffer.length) throw new Error("VarLong did not terminate");
    currentByte = buffer.readUInt8(offset + position);
    value |= BigInt(currentByte & 127) << BigInt(position * 7);
    position++;
    if (position > MAX_VARLONG_BYTES) throw new Error("VarLong is too big");
  } while ((currentByte & 128) === 128);
  return [BigInt.asIntN(64, value), position];
}
module.exports = { writeVarInt, readVarInt, varIntSize, writeVarLong, readVarLong, MAX_VARINT_BYTES, MAX_VARLONG_BYTES };
