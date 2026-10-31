import { createServer } from '../../src/network/server.js'
const s = createServer({ port: 25608 })
s.server.on('playerJoin', c => {
  console.log('[SRV] playerJoin:', c.username)
  const origWrite = Object.getPrototypeOf(c) // patch at proto level? no, instance
})
// patch all clients on login to log writes with errors visible
s.server.on('login', client => {
  const orig = client.write.bind(client)
  client.write = (name, params) => {
    try { orig(name, params); console.log('[SRV->] OK', name) }
    catch (e) { console.log('[SRV->] FAIL', name, '::', String(e.message).slice(0,300)) }
  }
})
process.on('uncaughtException', e => console.log('[SRV] UNCAUGHT:', String(e.stack ?? e).slice(0,1200)))
setTimeout(() => process.exit(0), 40000)
