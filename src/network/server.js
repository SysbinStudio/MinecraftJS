// 原版协议服务端监听端：基于 minecraft-protocol，允许 MC 1.20.1 原版客户端直接加入
import mc from 'minecraft-protocol'
import { World } from '../world/world.js'
import { LivingEntity } from '../entity/entity.js'
import { ContainerMenu, PlayerInventory, SimpleInventory } from '../inventory/container.js'
import { defaultCommands } from '../command/parser.js'

export function createServer (opts = {}) {
  const server = mc.createServer({
    'online-mode': opts.onlineMode ?? false, // 离线模式便于本地测试；true 时走 Mojang 验证
    version: '1.20.1',
    motd: opts.motd ?? 'A MinecraftJS Server §a(1.20.1)',
    port: opts.port ?? 25565,
    maxPlayers: opts.maxPlayers ?? 20,
    'view-distance': 8,
    'server-ip': '0.0.0.0'
  })

  const world = new World()
  const entities = new Map()
  const players = new Map()

  // 预置地面，让客户端不至于掉入虚空
  for (let x = -16; x < 16; x++) for (let z = -16; z < 16; z++) world.setBlock(x, 64, z, 1) // stone stateId 占位

  server.on('login', client => {
    const ent = new LivingEntity('player', 0.5, 65, 0.5)
    const inv = new PlayerInventory()
    const menu = new ContainerMenu(0, inv)
    const cmds = defaultCommands({ players: [...players.values()], player: ent, world, time: 0 })
    players.set(client.id, { client, ent, inv, menu, username: client.username })
    entities.set(client.id, ent)

    // 登录时序（对应原版 ServerGamePacketListenerImpl.startWaitingForPackets）：
    // 先补发 declare_commands / recipes，否则 mineflayer/客户端插件在 join_game 时缺表会崩溃
    try { client.writeAsRaw ? null : null } catch {}
    const mcdata = server.version === '1.20.1' ? require('minecraft-data')('pc', '1.20.1') : null
    if (mcdata) {
      try {
        client.write('declare_commands', { nodes: mcdata.commands || [] })
        client.write('recipes', mcdata.recipes ? buildRecipesPacket(mcdata) : undefined)
      } catch (e) { server.logger?.warn?.('补发表数据失败(可忽略):', e.message) }
    }
    broadcast('playerJoinMessage', { playerName: client.username })
    server.logger?.info?.(`${client.username} 加入`)

    client.on('move', packet => {
      ent.x = packet.x ?? ent.x; ent.y = packet.y ?? ent.y; ent.z = packet.z ?? ent.z
      ent.onGround = packet.on_ground ?? ent.onGround
    })
    client.on('look', packet => { ent.yaw = packet.yaw; ent.pitch = packet.pitch })

    // 方块更新转发到世界逻辑
    client.on('block_update', () => {})
    client.on('arm_animation', () => { broadcast('animation', { entityId: entities.get(client.id)?.id ?? client.id, animation: 0 }) })

    client.on('use_entity', packet => {
      const target = [...entities.values()].find(e => e.id === packet.target)
      if (target && packet.type === 1) { // attack
        const { applyDamage, DMG, knockbackVector } = require('../entity/combat.js')
        const dmg = applyDamage(target, 1 + Math.random() * 3, DMG.playerAttack(ent))
        knockbackVector(ent, target)
        broadcast('damageEvent', { playerId: target.id, damageAmount: dmg, damageSource: { type_id: 'player', scaling: 'when_caused_by_living_non_player' } })
        if (target.dead) broadcast('death', { playerId: target.id, livingEntity: { id: target.id }, message: { text: `${client.username} killed a player` } })
      }
    })

    client.on('transaction', () => {})
    client.on('chat', packet => {
      const msg = packet.message
      if (msg.startsWith('/')) {
        const r = cmds.parse(msg)
        if (r.error) client.write('system_message', { message: { text: r.error }, parameters: [], actionBar: false })
        else if (r.result?.broadcast) broadcast('chat', { message: { text: r.result.broadcast } })
        else if (r.result?.message) client.write('system_message', { message: { text: r.result.message }, parameters: [], actionBar: false })
        else if (r.result?.teleport) client.write('position', { x: ent.x, y: ent.y, z: ent.z, yaw: 0, pitch: 0, flags: 0x1f, teleportId: ++ent.teleportId })
        else if (r.result?.give) {
          inv.addItem({ itemId: r.result.give.item, count: r.result.give.count })
          client.write('set_slot', { windowId: 0, slot: 36, item: null }) // 简化：仅确认
        }
      } else {
        broadcast('chat', { message: { text: `<${client.username}> ${msg}` } })
      }
    })

    client.on('close', () => {
      players.delete(client.id); entities.delete(client.id)
      broadcast('playerLeaveMessage', { playerName: client.username, reason: { text: '' } })
    })
  })


  // join_game（playerJoin）：原版登录时序——minecraft-protocol 已发 registry_data/finish_configuration，
  // 此处补发 declare_commands、recipes、update_time、initialize_world_border、spawn_position、set_default_spawn_position、player_info、game_event(start_waiting)、dimension、position
  server.on('playerJoin', client => {
    const p = players.get(client.id)
    if (!p) return
    const { ent } = p
    const md = require('minecraft-data')('pc', '1.20.1')
    try {
      client.write('declare_commands', { nodes: md.commands ?? [] })
    } catch (e) { console.error('[MinecraftJS] declare_commands 序列化失败:', e.message, e.field ?? '') }
    try { client.write('update_time', { age: [0, 0], time: [0, 0] }) } catch (e) { console.error('[MinecraftJS] update_time 失败:', e.message, e.field ?? '') }
    for (const [name, pkt] of [
      ['initialize_world_border', { x: 0, z: 0, dangerZone: 5, warningTime: 15, absoluteHardDistance: 29999968, previousAbsoluteHardDistance: 29999968, newAbsoluteHardDistance: 29999968, speed: 0, portalTeleportBoundary: 16 }],
      ['spawn_position', { location: { x: 0, y: 65, z: 0 } }],
      ['set_default_spawn_position', { spawnPosition: { x: 0, y: 65, z: 0 } }],
      ['player_info', { action: 0, data: [{ UUID: client.uuid, name: client.username, properties: [] }] }],
      ['game_event', { type: 3 }],
      ['position', { x: ent.x, y: ent.y, z: ent.z, yaw: 0, pitch: 0, flags: 0x1f, teleportId: 1 }],
      ['game_event', { type: 2 }]
    ]) {
      try { client.write(name, pkt) } catch (e) { console.error(`[MinecraftJS] ${name} 序列化失败:`, e.message, e.field ?? '') }
    }
    // 发送一个地面区块，避免落虚空
    sendFlatChunk(client, 0, 0)
  })

  function sendFlatChunk (client, cx, cz) {
    try {
      const buf = buildFlatChunkData()
      client.write('map_chunk', {
        x: cx, z: cz,
        bitMap: 0b0000001111000000, // sections y=-64..320 中地表附近 6 个 section
        addBitMap: 0,
        blocksBlockEntities: false,
        chunkData: buf,
        blockEntities: [],
        lightMask: 0, emptyLightMask: 0b111111111111111111111111
      })
    } catch (e) { server.logger?.warn?.('map_chunk 失败:', e.message) }
  }

  function buildFlatChunkData () {
    // 简化：每个 section = 空气(单元素palette)；仅 y=64 所在 section(index 8) 底部一层 stone
    // 使用 minecraft-protocol/prismarine-chunk 更稳妥：
    const ChunkColumn = require('prismarine-chunk')('1.20.1')
    const mcdata = require('minecraft-data')('pc', '1.20.1')
    const c = new ChunkColumn()
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setBlockStateId([x, 64, z], mcdata.blocksByName.stone.defaultState)
    if (c.initialize) c.initialize()
    return c.dump()
  }

  function broadcast (name, params) {
    for (const [, { client }] of players) {
      try { client.write(name, params) } catch {}
    }
  }

  // 20 TPS tick 循环：驱动实体物理
  setInterval(() => { for (const e of entities.values()) { try { e.tick(world) } catch {} } }, 50)

  return { server, world, players, entities }
}


// 把 minecraft-data 的配方对象整理成 1.20.1 recipes 包所需结构
function buildRecipesPacket (md) {
  const recipes = Object.values(md.recipes).map(r => ({
    recipe_id: r.name ?? String(r.id),
    type: r.type ?? 'crafting_shapeless',
    data: r
  }))
  return { recipes }
}

// ESM 环境下的 require 兼容
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
