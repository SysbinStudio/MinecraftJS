import mineflayer from 'mineflayer'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'TestBot', version: '1.20.1', auth: 'offline' })
bot.on('login', () => console.log('EV: login'))
for (const ev of ['spawn','kicked','error','end']) bot.on(ev, (...a) => console.log('EV:', ev, ...a.map(x=>String(x).slice(0,400))))
setTimeout(() => { bot.quit() }, 10000)
