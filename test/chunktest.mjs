import { createServer } from '/workspace/src/network/server.js'
import mineflayer from 'mineflayer'
const PORT = 25611
createServer({ port: PORT })
await new Promise(r => setTimeout(r, 800))
const bot = mineflayer.createBot({ host: '127.0.0.1', port: PORT, username: 'ChunkBot', version: '1.20.1', auth: 'offline', checkTimeoutInterval: 120000 })
bot.on('spawn', () => setTimeout(() => {
  console.log('spawn pos', bot.entity.position)
  const ch = bot.world.getColumn(0, 0)
  console.log('chunk exists?', !!ch)
  if (ch) {
    for (const y of [64, 63, 62]) {
      try { console.log(`stateId [0,${y},0]:`, ch.getBlockStateId([0,y,0])) } catch(e){ console.log('err', e.message) }
    }
  }
  try {
    const sid = ch ? ch.getBlockStateId([0,64,0]) : null
    const b = sid==null ? null : bot.registry.blocks.find(x => x.minStateId === sid || (x.states||[]).some(s=>s.id===sid))
    console.log('block name at 0,64,0:', b ? b.name : `unknown state ${sid}`)
    const below = bot.blockAt(bot.entity.position.offset(0,-1,0))
    console.log('blockAt below:', below ? below.name : null)
  } catch(e){ console.log('lookup err', e.message) }
  process.exit(0)
}, 1500))
bot.on('death', () => console.log('EV death'))
bot.on('error', e => { console.log('err', String(e).slice(0,300)); process.exit(1) })
setTimeout(()=>{ console.log('TIMEOUT'); process.exit(2) }, 30000)
