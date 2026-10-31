// 端到端：以原版协议(1.20.1)连接 MinecraftJS 服务端，验证登录时序与进服(spawn)
import mineflayer from 'mineflayer'
const port = Number(process.env.MCJS_PORT || 25565)
const bot = mineflayer.createBot({ host: '127.0.0.1', port, username: process.env.MCJS_USER || 'TestBot', version: '1.20.1', auth: 'offline' })
let spawned = false
bot.on('login', () => console.log('EV: login'))
bot.on('spawn', () => {
  spawned = true
  const p = bot.entity.position
  console.log(`EV: spawn pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`)
  const below = bot.blockAt(p.offset(0, -1, 0))
  console.log('BLOCK_BELOW:', below ? below.name : null)
  bot.chat('/help')
  bot.chat('hello minecraftjs')
  setTimeout(() => bot.quit(), 1500)
})
bot.on('kicked', r => { console.log('EV: kicked', String(JSON.stringify(r)).slice(0, 300)); process.exit(2) })
bot.on('error', e => { console.log('EV: error', String(e).slice(0, 300)); process.exit(3) })
setTimeout(() => { if (!spawned) { console.log('TIMEOUT_NO_SPAWN'); process.exit(4) } }, 20000)
