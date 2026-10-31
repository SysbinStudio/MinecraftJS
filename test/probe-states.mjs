import { createServer } from '/workspace/src/network/server.js'
createServer({ port: 25632 })
await new Promise(r=>setTimeout(r,400))
import mc from 'minecraft-protocol'
const cl = mc.createClient({host:'127.0.0.1', port:25632, username:'Probe', version:'1.20.1'})
cl.on('error', e => console.log('[C] ERROR:', String(e && e.message || e).slice(0,900)))
let n=0; const iv=setInterval(()=>{ if(++n>8){clearInterval(iv);process.exit(0)} }, 500)
