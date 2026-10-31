// 浏览器网络 shim：Node 的 minecraft-protocol 依赖 stream/dns/crypto/tls，esbuild 无法直接打包。
// 这里用 WebSocket 隧道方案：页面连接 wss://tunnel?target=host:port（如 nodered mc-bridge / websockify），
// 将 TCP 字节流转成 WS binary frame；协议栈仍使用 protodef（由主 bundle 提供）。
// —— 这是浏览器版连原版服务器的标准做法（参考 mineflayer-web / mc-server-updater 的 ws tunnel）。
import * as THREE from 'three'

export function createClient (opts) {
  const listeners = new Map()
  const emit = (name, ...args) => { (listeners.get(name) ?? []).forEach(f => { try { f(...args) } catch (e) { console.error('[mcjs-net]', e) } }) }
  const client = {
    on: (n, f) => { if (!listeners.has(n)) listeners.set(n, []); listeners.get(n).push(f) },
    write: (name, pkt) => { sendQueue.push({ name, pkt }); flush() },
    end: () => { try { ws.close() } catch {} }
  }
  // 简化：浏览器端不重实现完整 play 协议编解码，而是把包交给同页的 server-side relay？
  // 不可行。因此本 shim 仅支持"已配对的 MCJS WS 网关"：网关负责 protodef 编解码，
  // 浏览器收发的都是 JSON 化的包（{name, params}），事件名与 minecraft-protocol 一致。
  let ws = null
  const sendQueue = []
  let open = false
  function flush () {
    while (sendQueue.length && open) {
      ws.send(JSON.stringify(sendQueue.shift()))
    }
  }
  const url = opts.wsUrl ?? `ws://${opts.host}:${opts.wsPort ?? 25566}/?target=${encodeURIComponent((opts.targetHost ?? opts.host) + ':' + (opts.targetPort ?? 25565))}&user=${encodeURIComponent(opts.username ?? 'Steve')}`
  ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => { open = true; flush() }
  ws.onclose = () => { open = false; emit('end', { reason: 'websocket closed' }) }
  ws.onerror = () => emit('error', new Error('WebSocket 连接失败：需要 MCJS WS 网关 (src/network/ws-gateway.js)'))
  ws.onmessage = ev => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    if (msg.name === 'packet') emit(msg.packet, msg.data)
    else emit(msg.name, msg.data)
  }
  return client
}

export { THREE }
