const { createServer } = require('minecraft-protocol')
const protodef = require('protodef')
const s = createServer({ version: '1.20.1', port: 0, 'online-mode': false })
s.on('listening', () => {
  const proto = s.protocol
  console.log('has protocol?', !!proto)
  const compiler = new protodef.Compiler(proto.dataType, proto.play.toClient)
  globalThis.__compiler = compiler
  // try serializing map_chunk with light masks all empty
  const write = (name, params) => {
    try {
      const b = compiler.createSerializerBuffer ? null : null
      const buf = compiler.createSerializer('play.toClient')({ name: 'packet_' + name, params })
      return { ok: true, len: buf.length }
    } catch (e) { return { ok: false, err: e.message.split('\n')[0] } }
  }
  console.log('map_chunk v1:', JSON.stringify(write('map_chunk', { x:0,z:0, bitMap:0b1111000000, addBitMap:0, blocksBlockEntities:false, chunkData:{records:[{x:0,y:0,z:0,before:1,after:2}]}, blockEntities:[], lightMask:0xFFFF, emptyLightMask:0, skyLightMask:0xFFFF, fullLightMask:0, fullSkyLightMask:0, emptySkyLightMask:0 })))
  s.close()
})
