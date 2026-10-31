import { createClient } from 'minecraft-protocol'
const s = createClient({ host: '127.0.0.1', port: Number(process.env.MCJS_PORT||25601), username: 'Probe', version: '1.20.1', auth: 'offline' })
s.on('playerJoin', () => console.log('CLIENT playerJoin (config done, in play)'))
for (const p of ['login','join_game','position','map_chunk','game_event','player_info','update_health','experience','declare_commands','update_time','spawn_position','initialize_world_border','set_default_spawn_position'])
  s.on(p, pkt => console.log('RECV', p))
s.on('keep_alive', p => { s.write('keep_alive', { id: p.id }); console.log('KEEPALIVE->ack') })
s.on('disconnect', p => console.log('DISCONNECT', JSON.stringify(p).slice(0,400)))
s.on('error', e => console.log('ERROR', String(e).slice(0,500)))
setTimeout(()=>process.exit(0), 9000)
