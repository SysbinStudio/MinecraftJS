// 原始协议探测：走完整 handshake->login(离线)->configuration，打印收到的每个包与状态切换
import net from 'net'
import { createClient } from 'minecraft-protocol'
const port = Number(process.env.MCJS_PORT || 25601)
const s = createClient({ host: '127.0.0.1', port, username: 'Probe', version: '1.20.1', auth: 'offline', state: 'handshaking' })
s.on('state', st => console.log('STATE:', st.state))
s.on('success', p => console.log('LOGIN_SUCCESS uuid=', p.uuid))
s.on('login', p => console.log('PLAY_LOGIN(dimension?) keys=', Object.keys(p)))
s.on('join_game', () => console.log('JOIN_GAME'))
s.on('position', p => console.log('POSITION', p.x, p.y, p.z))
s.on('map_chunk', p => console.log('MAP_CHUNK', p.x, p.z))
s.on('player_info', p => console.log('PLAYER_INFO'))
s.on('game_event', p => console.log('GAME_EVENT', p.type))
s.on('disconnect', p => console.log('DISCONNECT', JSON.stringify(p).slice(0, 300)))
s.on('kick', r => console.log('KICK', JSON.stringify(r).slice(0, 400)))
s.on('error', e => console.log('ERROR', String(e).slice(0, 400)))
s.on('end', r => console.log('END', r))
setTimeout(() => process.exit(0), 12000)
