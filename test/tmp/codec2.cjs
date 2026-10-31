const { createServer } = require('minecraft-protocol')
const s = createServer({ version: '1.20.1', port: 25798, 'online-mode': false })
s.on('playerJoin', client => {
  const proto = client.protocol
  console.log('client protocol?', !!proto)
  const write = (name, params) => {
    try { client.write(name, params); return { ok: true } } catch (e) { return { ok: false, err: String(e.message).split('\n')[0].slice(0,200) } }
  }
  // light masks ALL EMPTY so no sections are read from buffers
  console.log('map_chunk records:', JSON.stringify(write('map_chunk', { x:0,z:0, bitMap:0b1111000000, addBitMap:0, blocksBlockEntities:false, chunkData:{records:[{x:0,y:0,z:0,before:1,after:2}]}, blockEntities:[], lightMask:0, emptyLightMask:0xFFFFFFFF, skyLightMask:0, fullLightMask:0, fullSkyLightMask:0, emptySkyLightMask:0xFFFFFFFF })))
  console.log('map_chunk buffer:', JSON.stringify(write('map_chunk', { x:0,z:0, bitMap:0b1111000000, addBitMap:0, blocksBlockEntities:false, chunkData:Buffer.alloc(10), blockEntities:[], lightMask:0, emptyLightMask:0xFFFFFFFF, skyLightMask:0, fullLightMask:0, fullSkyLightMask:0, emptySkyLightMask:0xFFFFFFFF })))
  process.exit(0)
})
const mineflayer = require('mineflayer')
const bot = mineflayer.createBot({ host:'127.0.0.1', port: 25798, username:'CodecProbe', version:'1.20.1', auth:'offline' })
bot.on('error', e => console.log('bot err', String(e).slice(0,100)))
