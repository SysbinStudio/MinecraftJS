const path = require('path')
const base = path.join(__dirname, '..', 'node_modules', 'minecraft-data', 'minecraft-data', 'data', 'pc', '1.20')
const protocol = require(path.join(base, 'protocol.json'))
console.log('play.toClient type:', typeof protocol.play.toClient)
if (Array.isArray(protocol.play.toClient)) console.log('len', protocol.play.toClient.length, JSON.stringify(protocol.play.toClient[0]))
else console.log('keys sample:', Object.keys(protocol.play.toClient).slice(0, 5), JSON.stringify(Object.entries(protocol.play.toClient)[0]).slice(0, 200))
const ProtoDef = require('protodef')
const pd = new ProtoDef()
pd.addTypes(protocol.types)
try {
  const buf = pd.createPacketBuffer('packet', { name: 'keep_alive', params: { id: 7n } })
  console.log('encode keep_alive OK:', buf)
} catch (e) { console.log('encode err:', e.message.slice(0, 300)) }
