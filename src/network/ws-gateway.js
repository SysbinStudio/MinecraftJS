// MCJS WebSocket 网关：浏览器客户端 <-> 原版 TCP 协议服务器（含本仓库服务端）之间的桥。
// 职责：WS(JSON {name,pkt}) <-> minecraft-protocol(TCP protodef) 双向翻译；
//       chunkData 等 Buffer 字段序列化为 base64，供浏览器 prismarine-chunk 重建。
// 用法：node src/network/ws-gateway.js [tcpHost] [tcpPort] [wsPort]
import mc from 'minecraft-protocol'
import http from 'http'
import { WebSocketServer } from 'ws'

const tcpHost = process.argv[2] ?? '127.0.0.1'
const tcpPort = Number(process.argv[3] ?? 25565)
const wsPort = Number(process.argv[4] ?? 25566)

const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('MCJS WS Gateway OK') })
const wss = new WebSocketServer({ server })

// Buffer -> base64（浏览器端用 atob 还原 Uint8Array）
function encodePkt (data) {
  return JSON.parse(JSON.stringify(data, (k, v) => {
    if (v && v.type === 'Buffer' && Array.isArray(v.data)) return { __b64: Buffer.from(v.data).toString('base64') }
    if (typeof v === 'bigint') return String(v)
    if (v && v.buffer && ArrayBuffer.isView(v)) return { __b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') }
    return v
  }))
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x')
  const [host, port] = (url.searchParams.get('target') ?? `${tcpHost}:${tcpPort}`).split(':')
  const user = url.searchParams.get('user') ?? 'Steve'
  console.log(`[gw] browser ${user} -> ${host}:${port}`)

  const client = mc.createClient({ host, port: Number(port), username: user, version: '1.20.1', auth: 'offline' })

  // TCP -> WS：转发所有 play 包事件 + 生命周期事件
  const forwardEvents = ['login', 'spawn', 'position', 'map_chunk', 'block_update', 'entity_spawn', 'entity_move',
    'entity_destroy', 'system_chat', 'message', 'chat', 'keep_alive', 'player_info', 'game_event', 'named_sound_effect',
    'acknowledge_transaction', 'update_health', 'experience', 'set_slot', 'window_items', 'respawn', 'kick']
  for (const ev of forwardEvents) {
    client.on(ev, data => {
      if (ws.readyState !== 1) return
      try { ws.send(JSON.stringify({ name: 'packet', packet: ev, data: encodePkt(data) })) } catch (e) { /* 忽略不可序列化事件 */ }
    })
  }
  client.on('error', e => { try { ws.send(JSON.stringify({ name: 'error', data: { message: String(e.message ?? e) } })) } catch {} })
  client.on('end', r => { try { ws.send(JSON.stringify({ name: 'end', data: { reason: String(r?.reason ?? 'closed') } })) } catch {}; ws.close() })

  // WS -> TCP
  ws.on('message', raw => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    try { client.write(msg.name, decodePkt(msg.pkt)) } catch (e) { console.log('[gw] write fail', msg.name, e.message) }
  })
  ws.on('close', () => { try { client.end() } catch {} })
})

function decodePkt (data) {
  if (data == null) return data
  return JSON.parse(JSON.stringify(data, (k, v) => {
    if (v && typeof v === 'object' && typeof v.__b64 === 'string') return Buffer.from(v.__b64, 'base64')
    return v
  }))
}

server.listen(wsPort, () => console.log(`[gw] WebSocket gateway listening on :${wsPort} (TCP target ${tcpHost}:${tcpPort})`))
