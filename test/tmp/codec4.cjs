const { createServer } = require('minecraft-protocol')
const s = createServer({ version: '1.20.1', port: 25800, 'online-mode': false })
s.on('playerJoin', client => {
  const write = (name, params) => { try { client.write(name, params); return { ok:true } } catch(e){ return { ok:false, err:String(e.message).split('\n')[0].slice(0,150) } } }
  console.log('C dump+fullMasks:', JSON.stringify(write('map_chunk', { x:0,z:0, bitMap:0b1111000000, addBitMap:0, blocksBlockEntities:false, chunkData:Buffer.alloc(64), blockEntities:[], lightMask:0xFFFF, emptyLightMask:0xFFFFFFE000, skyLightMask:0xFFFF, fullLightMask:0, fullSkyLightMask:0, emptySkyLightMask:0xFFFFFFE000 })))
  process.exit(0)
})
require('mineflayer').createBot({ host:'127.0.0.1', port:25800, username:'Probe4', version:'1.20.1', auth:'offline' }).on('error',()=>{})
