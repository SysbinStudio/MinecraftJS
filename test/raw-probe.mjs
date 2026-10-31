import net from 'net'
import mc from 'minecraft-protocol'
const client = mc.createClient({ host: '127.0.0.1', port: 25565, username: 'ProbeBot', version: '1.20.1', auth: 'offline' })
client.on('login', () => console.log('raw: login(success)'))
client.on('playerJoin', () => console.log('raw: playerJoin'))
client.on('game_event', p => console.log('raw: game_event', JSON.stringify(p)))
client.on('position', p => console.log('raw: position', JSON.stringify(p).slice(0,120)))
client.on('map_chunk', p => console.log('raw: map_chunk', p.x, p.z))
client.on('disconnect', p => console.log('raw: disconnect', JSON.stringify(p)))
client.on('set_slot', p => console.log('raw: set_slot'))
client.on('keep_alive', p => { console.log('raw: keep_alive'); client.write('keep_alive', { id: p.id ?? 0 }) })
client.on('error', e => console.log('raw: error', e.message))
setTimeout(() => process.exit(0), 8000)
