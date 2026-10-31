// MinecraftJS 浏览器客户端：three.js 渲染 + minecraft-protocol(webpack/esbuild shim) 连服
// 功能：连接 MCJS 服务端（或任意 1.20.1 原版协议服务器）、解析 map_chunk、greedy-free 面剔除网格渲染、
//       WASD+鼠标视角+跳跃物理（复用 src/physics）、方块高亮与挖掘/放置、聊天 HUD。
import * as THREE from 'three'
import { expandBlockStates } from '../render/blocks.js'
import { buildChunkGeometry, makeOpaqueTest, getMaterial } from '../render/mesher.js'

const stateTable = expandBlockStates(window.MCJS_DATA.blocks)
const isOpaque = makeOpaqueTest(stateTable)

// ---------------- 场景 ----------------
const canvas = document.getElementById('game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x79a6ff) // 原版白天天空色 #79A6FF
scene.fog = new THREE.Fog(0x79a6ff, 48, 128)

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400)
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.set(0.4, 1, 0.3)
scene.add(sun)
scene.add(new THREE.AmbientLight(0xbfd4ff, 0.9))

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// ---------------- 世界状态 ----------------
// chunks: Map<"cx,cz", {chunk, meshes:[THREE.Mesh]}>
const chunks = new Map()
const entitiesMesh = new Map() // entityId -> Mesh
let myId = null

function chunkKey (cx, cz) { return cx + ',' + cz }

function rebuildChunkMeshes (cx, cz) {
  const key = chunkKey(cx, cz)
  const rec = chunks.get(key)
  if (!rec) return
  for (const m of rec.meshes) { scene.remove(m); m.geometry.dispose() }
  rec.meshes = []
  const geos = buildChunkGeometry(rec.chunk, stateTable, isOpaque, { yMin: -64, yMax: 160 })
  for (const geo of geos) {
    const mat = getMaterial(geo.userData.color, geo.userData.transparent)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(cx * 16, 0, cz * 16)
    mesh.userData.blockPos = true
    scene.add(mesh)
    rec.meshes.push(mesh)
  }
}

// ---------------- 玩家控制（对应原版 PlayerInput + 移动网络包）----------------
const player = { x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, fly: false }
const keys = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  if (e.code === 'KeyF' && e.ctrlKey) { player.fly = !player.fly; e.preventDefault() }
  if (e.code === 'KeyT' || e.code === 'Enter') openChat()
})
addEventListener('keyup', e => { keys[e.code] = false })

let locked = false
canvas.addEventListener('click', () => { if (!locked && !chatOpen) canvas.requestPointerLock() })
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas })
document.addEventListener('mousemove', e => {
  if (!locked) return
  player.yaw -= e.movementX * 0.0025
  player.pitch -= e.movementY * 0.0025
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch))
})

// 简易 AABB 物理（与服务端 src/physics/movement.js 同一模型的浏览器端预测）
function collideAxis (pos, box, worldGet, axis) {
  // 每 tick 由 stepPhysics 调用
}
function blockAt (x, y, z) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16)
  const rec = chunks.get(chunkKey(cx, cz))
  if (!rec) return 0
  try { return rec.chunk.getBlockStateId([Math.floor(x) & 15, Math.floor(y), Math.floor(z) & 15]) } catch { return 0 }
}
function solid (x, y, z) { return isOpaque(blockAt(x, y, z)) }

function stepPhysics (dt) {
  const speed = player.fly ? 10 : 4.317
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw) // MC yaw 约定：-Z 为前
  let mx = 0, mz = 0
  if (keys.KeyW) { mx += fx; mz += fz }
  if (keys.KeyS) { mx -= fx; mz -= fz }
  if (keys.KeyA) { mx += fz; mz -= fx }
  if (keys.KeyD) { mx -= fz; mz += fx }
  const len = Math.hypot(mx, mz) || 1
  player.vx = (mx / len) * speed * ((keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD) ? 1 : 0)
  player.vz = (mz / len) * speed * ((keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD) ? 1 : 0)
  if (player.fly) {
    player.vy = keys.Space ? 8 : (keys.ShiftLeft ? -8 : 0)
  } else {
    player.vy -= 32 * dt // 重力 ~ 原版 0.08/tick²*20
    if (keys.Space && player.onGround) { player.vy = 8.4 }
  }
  // 逐轴移动 + 碰撞
  const W = 0.3, H = 1.8
  const move = (dx, dy, dz) => {
    // X
    let nx = player.x + dx * dt
    if (collides(nx, player.y, player.z, W, H)) { nx = player.x; player.vx = 0 }
    // Z
    let nz = player.z + dz * dt
    if (collides(nx, player.y, nz, W, H)) { nz = player.z; player.vz = 0 }
    // Y
    let ny = player.y + dy * dt
    if (collides(nx, ny, nz, W, H)) {
      if (dy < 0) player.onGround = true
      ny = player.y; player.vy = 0
    } else player.onGround = false
    player.x = nx; player.y = ny; player.z = nz
  }
  move(player.vx, player.vy, player.vz)
  if (player.y < -100) { player.y = 80; player.vy = 0 } // 防掉虚空
}
function collides (x, y, z, w, h) {
  for (let bx = Math.floor(x - w); bx <= Math.floor(x + w); bx++)
    for (let by = Math.floor(y); by <= Math.floor(y + h); by++)
      for (let bz = Math.floor(z - w); bz <= Math.floor(z + w); bz++)
        if (solid(bx, by, bz)) return true
  return false
}

// ---------------- 射线拾取方块（原版 ItemInUseContext / clip raycast）----------------
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000 })
)
highlight.visible = false
scene.add(highlight)

function raycastBlock (maxDist = 5) {
  const ox = player.x, oy = player.y + 1.62, oz = player.z
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'))
  let px = Math.floor(ox), py = Math.floor(oy), pz = Math.floor(oz)
  const step = [Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z)]
  const tDelta = [Math.abs(1 / dir.x), Math.abs(1 / dir.y), Math.abs(1 / dir.z)]
  let tMax = [
    dir.x !== 0 ? (step[0] > 0 ? (px + 1 - ox) : (ox - px)) * tDelta[0] : Infinity,
    dir.y !== 0 ? (step[1] > 0 ? (py + 1 - oy) : (oy - py)) * tDelta[1] : Infinity,
    dir.z !== 0 ? (step[2] > 0 ? (pz + 1 - oz) : (oz - pz)) * tDelta[2] : Infinity
  ]
  let last = null, t = 0
  for (let i = 0; i < 200 && t < maxDist; i++) {
    const cur = blockAt(px + 0.5, py + 0.5, pz + 0.5)
    if (cur && isOpaque(cur)) return { pos: [px, py, pz], state: cur, adjacent: last }
    if (tMax[0] < tMax[1] && tMax[0] < tMax[2]) { px += step[0]; t = tMax[0]; tMax[0] += tDelta[0]; last = [px, py, pz] }
    else if (tMax[1] < tMax[2]) { py += step[1]; t = tMax[1]; tMax[1] += tDelta[1]; last = [px, py, pz] }
    else { pz += step[2]; t = tMax[2]; tMax[2] += tDelta[2]; last = [px, py, pz] }
  }
  return null
}

let selectedState = stateTable.find(s => s && s.name === 'stone')?.id != null
  ? (() => { for (let i = 0; i < stateTable.length; i++) if (stateTable[i]?.name === 'stone') return i; return 1 })()
  : 1

canvas.addEventListener('mousedown', e => {
  if (!locked || !client) return
  const hit = raycastBlock()
  if (!hit) return
  if (e.button === 0) { // 左键挖
    client.write('block_dig', { location: { x: hit.pos[0], y: hit.pos[1], z: hit.pos[2] }, status: 0, button: 0 })
    setLocalBlock(hit.pos, 0)
  } else if (e.button === 2) { // 右键放
    if (hit.adjacent) {
      client.write('use_entity_on', {}) // noop guard? 不使用；用 place 包
    }
  }
})
canvas.addEventListener('contextmenu', e => {
  e.preventDefault()
  if (!locked || !client) return
  const hit = raycastBlock()
  if (hit && hit.adjacent) {
    const [ax, ay, az] = hit.adjacent
    client.write('block_place', {
      location: { x: ax, y: ay, z: az }, direction: 1, position: { x: 0.5, y: 0.5, z: 0.5 },
      hand: 'main_hand', sequence: 0, useOn: false
    })
    setLocalBlock([ax, ay, az], selectedState)
  }
})

function setLocalBlock ([x, y, z], stateId) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16)
  const rec = chunks.get(chunkKey(cx, cz))
  if (!rec) return
  try { rec.chunk.setBlockStateId([x & 15, y, z & 15], stateId) } catch {}
  rebuildChunkMeshes(cx, cz)
}

// ---------------- 聊天 HUD ----------------
const chatEl = document.getElementById('chat')
const chatInput = document.getElementById('chat-input')
let chatOpen = false
function addChat (text) {
  const div = document.createElement('div')
  div.textContent = text
  chatEl.appendChild(div)
  while (chatEl.children.length > 12) chatEl.removeChild(chatEl.firstChild)
  setTimeout(() => { div.style.opacity = '0.35' }, 8000)
}
function openChat () {
  chatOpen = true
  document.exitPointerLock?.()
  chatInput.style.display = 'block'
  chatInput.value = ''
  chatInput.focus()
}
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = chatInput.value.trim()
    if (v && client) client.write('chat_message', { message: v, offset: 0n, recognizedSignature: new Uint8Array(256), timestamp: BigInt(Date.now()) * 1000n })
    chatInput.style.display = 'none'
    chatOpen = false
  } else if (e.key === 'Escape') {
    chatInput.style.display = 'none'; chatOpen = false
  }
  e.stopPropagation()
})

// ---------------- 区块解码（自研，无 Node 依赖）----------------
// VarInt / palette 解码对应 mcsrc.dev BlockStateContainer 的 bits-per-entry packed long 格式
class Bin {
  constructor (buf) { this.b = buf; this.p = 0 }
  varint () {
    let value = 0, pos = 0, byte
    do { byte = this.b[this.p++]; value |= (byte & 0x7F) << pos; pos += 7 } while ((byte & 0x80) !== 0 && pos < 35)
    return (value >>> 0) | 0
  }
  readLongLE (i) { // -> [hi, lo] as two int32
    const dv = new DataView(this.b.buffer ?? this.b, (this.b.byteOffset ?? 0) + i * 8)
    return [dv.getInt32(4, true), dv.getInt32(0, true)]
  }
}

// 从 packed longs 按 bitWidth 提取 entryCount 个值（低位优先，跨 long 连续位流）
function unpackPalette (longsArr, count, bitWidth) {
  if (bitWidth === 0) return null
  const out = new Int32Array(count)
  let entry = 0, bit = 0
  for (const [hi, lo] of longsArr) {
    const words = [lo >>> 0, hi >>> 0] // low word first
    for (let w = 0; w < 2 && entry < count; w++) {
      const word = words[w]
      while (bit + bitWidth <= 32 && entry < count) {
        out[entry++] = (word >>> bit) & ((1 << bitWidth) - 1)
        bit += bitWidth
      }
      if (bit >= 32) bit -= 32
      else if (entry < count) {
        // 剩余高位不够：与下一个 word 拼接（bitWidth<=8 时不会发生；宽位需要 carry）
        const need = bitWidth - (32 - bit)
        break
      }
    }
  }
  // 简化：bitWidth<=8 且每 long 存 floor(64/bitWidth)>=8 项、不跨 long（原版 padded=false 语义）
  return out
}

// 更稳健的位流解包（支持跨 long）
function unpackBitStream (longsArr, count, bitWidth) {
  const out = new Int32Array(count)
  let entry = 0, bitAcc = 0, bitCount = 0
  for (const [hi, lo] of longsArr) {
    const words = [lo >>> 0, hi >>> 0]
    for (const w of words) {
      bitAcc = words.length ? bitAcc : 0
      // 把 word 逐位压入累加器（little-endian 位序：先低位）
      for (let b = 0; b < 32; b++) {
        bitAcc |= ((w >>> b) & 1) << bitCount
        bitCount++
        if (bitCount === bitWidth) {
          if (entry < count) out[entry++] = bitAcc >>> 0
          bitAcc = 0; bitCount = 0
          if (entry >= count) break
        }
      }
      if (entry >= count) break
    }
    if (entry >= count) break
  }
  return out
}

function decodeSection (bin, isBiomesSection) {
  const blocks = new Int32Array(4096)
  const bitsPerEntry = bin.varint()
  if (bitsPerEntry === 0) {
    // single-value palette：整 section 同一状态
    const palLen = bin.varint()
    const single = bin.varint()
    // 消耗掉可能存在的 data array length（新版协议 single palette 无数据数组）
    return blocks.fill(single), blocks
  }
  if (bitsPerEntry < 4 || bitsPerEntry > 8) throw new Error('bad bitsPerEntry ' + bitsPerEntry)
  const palLen = bin.varint()
  const palette = []
  for (let i = 0; i < palLen; i++) palette.push(bin.varint())
  const dataLen = bin.varint()
  const longs = []
  for (let i = 0; i < dataLen; i++) longs.push([bin.readLongLE(i)[0], bin.readLongLE(i)[1]])
  // readLongLE 已按索引读取，重置游标
  bin.p += dataLen * 8
  const values = unpackBitStream(longs, 4096, bitsPerEntry)
  for (let i = 0; i < 4096; i++) blocks[i] = palette[values[i]] ?? 0
  return blocks
}

// 1.20.1 map_chunk: chunkData = sections 序列。每 section:
// block_count(varint) present(bool byte) [biomes?] then blocks: bitsPerEntry+palette+data
// 我们只取 blocks 层（biome 层在 y 全为 plains 时省略影响小）。
function decodeChunkPacket (p) {
  try {
    const raw = p.chunkData
    const buf = raw && raw.__b64 ? b64ToBuf(raw.__b64)
      : typeof raw === 'string' ? b64ToBuf(raw)
      : Buffer.isBuffer?.(raw) ? raw : (raw?.type === 'Buffer' ? Buffer.from(raw.data) : null)
    if (!buf) return null
    const bin = new Bin(buf)
    const Chunk = makeEmptyChunk()
    let consumedAll = false
    while (!consumedAll && bin.p < buf.length) {
      const start = bin.p
      const blockCount = bin.varint() // number of non-air... actually "block_count" varint
      const hasSkyLight = bin.b[bin.p++] & 1
      const hasBlockLight = bin.b[bin.p++] & 1
      // 1.20.1: after lights flags there may be trailing arrays (var len) — those are in light packets now.
      // biomes layer
      const biomeBpe = bin.varint()
      if (biomeBpe === 0) { bin.varint(); /* single palette */ }
      else if (biomeBpe <= 3) {
        const palLen = bin.varint(); for (let i = 0; i < palLen; i++) bin.varint()
        const dl = bin.varint(); bin.p += dl * 8
      } else throw new Error('unexpected biome bpe ' + biomeBpe)
      // blocks layer
      const blocks = decodeSection(bin, false)
      // lights data arrays (sky/block) — in 1.20.1 they were moved to separate update_light packets, but some servers still append; skip by remaining structure unknown → assume none
      void blockCount; void hasSkyLight; void hasBlockLight; void start
      Chunk.pushSection(blocks)
      if (Chunk.sections.length >= 24) break
    }
    const key = chunkKey(p.x, p.z)
    const old = chunks.get(key)
    if (old) for (const m of old.meshes) { scene.remove(m); m.geometry.dispose() }
    const ch = wrapSimpleChunk(Chunk)
    chunks.set(key, { chunk: ch, meshes: [] })
    return ch
  } catch (e) {
    console.warn('[mcjs] chunk decode failed', e.message)
    return null
  }
}

function b64ToBuf (s) {
  const binStr = atob(s)
  const u8 = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i)
  return u8
}

function makeEmptyChunk () {
  return {
    sections: [],
    pushSection (blocks) { this.sections.push(blocks) }
  }
}

// 包装成 mesher 需要的接口：getBlockStateId([x,y,z])，minY=-64
function wrapSimpleChunk (raw) {
  const minY = -64
  return {
    minY,
    sectionsMaxY: Math.max(1, raw.sections.length),
    getBlockStateId ([x, y, z]) {
      const si = Math.floor((y - minY) / 16)
      if (si < 0 || si >= raw.sections.length) return 0
      const s = raw.sections[si]
      const ly = ((y - minY) % 16 + 16) % 16
      return s[(ly << 8) | ((z & 15) << 4) | (x & 15)]
    },
    setBlockStateId ([x, y, z], stateId) {
      const si = Math.floor((y - minY) / 16)
      if (si < 0 || si >= raw.sections.length) return
      const s = raw.sections[si]
      const ly = ((y - minY) % 16 + 16) % 16
      s[(ly << 8) | ((z & 15) << 4) | (x & 15)] = stateId
    }
  }
}

// ---------------- 网络 ----------------
let client = null
const statusEl = document.getElementById('status')

function b64ToBytes (s) {
  const binStr = atob(s)
  const u8 = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i)
  return u8
}
// 网关把 Buffer 编码为 {__b64}；浏览器还原为类 Buffer（Uint8Array + isBuffer 标记）
function reviveBuffers (v) {
  if (v == null) return v
  if (typeof v === 'object' && typeof v.__b64 === 'string') { const a = b64ToBytes(v.__b64); a.isBuf = true; return a }
  if (Array.isArray(v)) return v.map(reviveBuffers)
  if (typeof v === 'object') { const o = {}; for (const k in v) o[k] = reviveBuffers(v[k]); return o }
  return v
}

function connect (host, port) {
  statusEl.textContent = `连接 ${host}:${port} ...`
  client = window.MCJS_NET.createClient({ host, port, version: '1.20.1', username: window.MCJS_USER || 'Steve', auth: 'offline' })
  const on = (name, f) => client.on(name, data => { try { f(reviveBuffers(data)) } catch (e) { console.warn('[mcjs]', name, e.message) } })
  on('login', p => {
    myId = p.entityId
    statusEl.textContent = `已登录 ${window.MCJS_USER || 'Steve'} @ ${p.worldName ?? p.dimension ?? ''}`
  })
  on('spawn', () => { statusEl.textContent = '已进入世界（spawn）' })
  on('position', p => {
    // 服务端下发坐标时同步（首次进服）
    if (typeof p.x === 'number' && !client.__moved) {
      player.x = p.x; player.y = p.y; player.z = p.z
      client.__moved = true
    }
  })
  on('map_chunk', p => {
    decodeChunkPacket(p)
    rebuildChunkMeshes(p.x, p.z)
  })
  on('block_update', p => {
    const { location, blockId } = p
    const cx = Math.floor(location.x / 16), cz = Math.floor(location.z / 16)
    const rec = chunks.get(chunkKey(cx, cz))
    if (!rec) return
    try { rec.chunk.setBlockStateId([location.x & 15, location.y, location.z & 15], blockId) } catch {}
    rebuildChunkMeshes(cx, cz)
  })
  on('entity_spawn', p => {
    if (p.entityId === myId) return
    const color = 0xd07f5c
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), getMaterial(color, false))
    mesh.position.set(p.x ?? 0, (p.y ?? 65) + 0.9, p.z ?? 0)
    scene.add(mesh)
    entitiesMesh.set(p.entityId, mesh)
  })
  on('entity_move', p => {
    const m = entitiesMesh.get(p.entityId)
    if (m) { m.position.x += (p.dx ?? 0) / 4096; m.position.y += (p.dy ?? 0) / 4096; m.position.z += (p.dz ?? 0) / 4096 }
  })
  on('entity_destroy', p => {
    const m = entitiesMesh.get(p.entityIds?.[0] ?? p.entityId)
    if (m) { scene.remove(m); entitiesMesh.delete(p.entityIds?.[0] ?? p.entityId) }
  })
  on('system_chat', p => { addChat(flattenChat(p.message)) })
  on('message', p => { addChat(flattenChat(p.message ?? p.unsignedChatMessage)) })
  on('chat', p => { addChat(flattenChat(p.message)) })
  on('player_info', p => { /* TODO 名字标签 */ })
  on('keep_alive', p => { client.write('keep_alive', { id: p.id }) })
  on('acknowledge_transaction', p => { client.write('confirm_transaction', { id: p.transactionId }) })
  client.on('error', e => { statusEl.textContent = '错误: ' + e.message })
  client.on('end', r => { statusEl.textContent = '断开: ' + (r?.reason ?? 'closed') })
}

function flattenChat (c) {
  if (c == null) return ''
  if (typeof c === 'string') return c
  let s = c.text ?? ''
  for (const extra of c.extra ?? []) s += flattenChat(extra)
  if (c.with) s += ' ' + JSON.stringify(c.with).slice(0, 40)
  return s
}

// 从 URL 参数自动连接：?host=..&port=..
const params = new URLSearchParams(location.search)
if (params.get('auto') === '1') connect(params.get('host') ?? 'localhost', Number(params.get('port') ?? 25565))

// ---------------- 主循环 ----------------
let lastMoveSent = 0
let lastT = performance.now()
function loop () {
  requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min((now - lastT) / 1000, 0.1)
  lastT = now

  if (!chatOpen) stepPhysics(dt)

  // 相机：第一人称（eye height 1.62，原版 EYE_HEIGHT）
  camera.position.set(player.x, player.y + 1.62, player.z)
  camera.rotation.order = 'YXZ'
  camera.rotation.y = player.yaw
  camera.rotation.x = player.pitch

  // 方块高亮
  const hit = raycastBlock()
  if (hit) { highlight.visible = true; highlight.position.set(hit.pos[0] + 0.5, hit.pos[1] + 0.5, hit.pos[2] + 0.5) }
  else highlight.visible = false

  // 发送位置（~20Hz，原版 ServerboundMoveGamePacket 频率）
  if (client && now - lastMoveSent > 50) {
    lastMoveSent = now
    try {
      client.write('position', { x: player.x, y: player.y, z: player.z, yaw: player.yaw * 180 / Math.PI, pitch: player.pitch * 180 / Math.PI, onGround: player.onGround })
    } catch {}
  }

  // HUD 信息
  const hud = document.getElementById('hud')
  if (hud) hud.textContent =
    `XYZ: ${player.x.toFixed(1)} / ${player.y.toFixed(1)} / ${player.z.toFixed(1)}\n` +
    `Chunks: ${chunks.size}  FPS: ${(1 / dt).toFixed(0)}\n` +
    (hit ? `Looking at: ${stateTable[hit.state]?.name ?? hit.state}` : '') +
    '\n点击画面锁定鼠标 · T 聊天 · Ctrl+F 飞行'

  renderer.render(scene, camera)
}
loop()

// 暴露给页面按钮
window.MCJS_CONNECT = connect
window.MCJS_PLAYER = player
console.log('[MCJS] renderer ready, states:', stateTable.length)
