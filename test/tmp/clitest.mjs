import mineflayer from 'mineflayer'
const bot = mineflayer.createBot({ host:'127.0.0.1', port:25608, username:'RefBot', version:'1.20.1', auth:'offline', checkTimeoutInterval: 30000 })
bot.on('login',()=>console.log('[CLI] login'))
bot.on('spawn',()=>{console.log('[CLI] SPAWN!'); process.exit(0)})
bot.on('kicked',r=>{console.log('[CLI] kicked', String(JSON.stringify(r)).slice(0,300)); process.exit(1)})
bot.on('error',e=>{console.log('[CLI] error', String(e.stack ?? e).slice(0,500)); process.exit(2)})
bot.on('packet', (d,n)=>{ console.log(`[CLI<-] ${n.state}/${n.name}`) })
setTimeout(()=>{console.log('[CLI] TIMEOUT'); process.exit(3)},30000)
