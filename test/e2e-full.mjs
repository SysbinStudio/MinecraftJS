import { createServer } from '/workspace/src/network/server.js'
import mineflayer from 'mineflayer'
const PORT = Number(process.env.E2E_PORT || 25601)
createServer({ port: PORT })
await new Promise(r => setTimeout(r, 800))
console.log('[test] server up, connecting bot...')
const bot = mineflayer.createBot({ host: '127.0.0.1', port: PORT, username: 'TestBot', version: '1.20.1', auth: 'offline', checkTimeoutInterval: 120000 })
let spawned = false
bot.on('login', () => console.log('[test] EV: login'))
bot.on('spawn', () => {
  spawned = true
  const p = bot.entity.position
  console.log(`[test] EV: SPAWN pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`)
  const below = bot.blockAt(p.offset(0, -1, 0))
  console.log('[test] BLOCK_BELOW:', below ? below.name : null)
  bot.once('chat', m => console.log('[test] CHAT_RECV:', m.toString().slice(0, 80)))
  bot.chat('/help'); bot.chat('hello minecraftjs')
  setTimeout(() => { try { bot.quit() } catch {}; process.exit(0) }, 2000)
})
bot.on('kicked', r => { console.log('[test] EV: kicked', String(JSON.stringify(r)).slice(0, 300)); process.exit(2) })
bot.on('error', e => { console.log('[test] EV: error', String(e).slice(0, 300)); process.exit(3) })
setTimeout(() => { console.log('[test] TIMEOUT_NO_SPAWN'); process.exit(spawned ? 0 : 4) }, Number(process.env.E2E_WAIT || 90000))
