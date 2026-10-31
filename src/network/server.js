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
    players.set(client.id, { client, ent, inv, menu, cmds, username: client.username })
    entities.set(client.id, ent)

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


  // join_game：原版进服时序。不依赖 minecraft-protocol 的 playerJoin 事件，
  // 直接监听客户端在 play 状态发出的第一个客户端包（ClientboundFinishedConfigurationPacket
  // 之后客户端发送的 ServerboundSynchronizeStartGamePacket），此时服务端才允许下发 play 包。
  // （参考 mcsrc.dev ServerGamePacketListenerImpl#handlePlayerAbilities / ServerCommonPacketListenerImpl#sendServerData）
  function startPlaySequence (client) {
    if (client.__mcjsStarted) return
    client.__mcjsStarted = true
    const p = players.get(client.id)
    if (!p) return
    console.log('[MCJS] startPlaySequence for', client.username)
    const { ent } = p
    broadcast('playerJoinMessage', { playerName: client.username })
    server.logger?.info?.(`${client.username} 加入`)
    // 原版进服时序（ServerGamePacketListenerImpl.sendPlayerInfo / PlayerList.broadcastAll）：
    // declare_commands + recipes + update_time + world_border + spawn_position + player_info +
    // game_event(start_waiting) + position + set_health + set_exp —— health 包触发客户端真正进入世界
    try {
      const md = require('minecraft-data')('pc', '1.20.1')
      client.write('declare_commands', { nodes: buildCommandNodes(md) })
    } catch (e) { console.error('[MinecraftJS] declare_commands 失败:', e.message) }
    for (const [name, pkt] of [
      ['update_time', { age: 0n, time: 0n }],
      ['initialize_world_border', { x: 0, z: 0, dangerZone: 5, warningTime: 15, absoluteHardDistance: 29999968, previousAbsoluteHardDistance: 29999968, newAbsoluteHardDistance: 29999968, speed: 0, portalTeleportBoundary: 16 }],
      ['spawn_position', { location: { x: 0, y: 65, z: 0 } }],
      ['set_default_spawn_position', { spawnPosition: { x: 0, y: 65, z: 0 } }],
      ['player_info', { action: 0, data: [{ UUID: client.uuid, name: client.username, properties: [] }] }],
      ['game_event', { type: 3 }],
      ['position', { x: ent.x, y: ent.y, z: ent.z, yaw: 0, pitch: 0, flags: 0x1f, teleportId: 1 }],
      ['game_event', { type: 2 }],
      ['update_health', { health: 20, food: 20, saturation: 5 }],
      ['experience', { experience: 0, level: 0, totalExperience: 0 }]
    ]) {
      try { client.write(name, pkt) } catch (e) { console.error(`[MinecraftJS] ${name} 失败:`, e.message) }
    }
    // 发送地面区块，避免落虚空（prismarine-chunk 生成合法 1.20.1 区块数据）
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) sendFlatChunk(client, cx, cz)
    try { client.write('player_abilities', { flags: 0 }) } catch (e) { console.error('[MinecraftJS] player_abilities 失败:', e.message) }
  }

  // minecraft-protocol 的 playerJoin 在部分版本时序不可靠；以客户端 play 状态首个包为准：
  // 原版客户端收到 finished_configuration 后发送 synchronize_start_game，服务端回 confirm_teleportation 前的一切
  // play 下行都会被客户端丢弃。这里监听任意 play 入站包触发进服时序（幂等）。
  server.on('playerJoin', client => startPlaySequence(client))
  const playPackets = ['synchronize_start_game', 'confirm_teleportation', 'move', 'look', 'position', 'transaction', 'chat', 'arm_animation', 'keep_alive', 'client_command']
  server.on('login', client => {
    for (const name of playPackets) {
      client.on(name, () => startPlaySequence(client))
    }
  })

  // 最小 BRIGADIER 命令节点树（根节点 + help/list/tp/give），供客户端补全
  function buildCommandNodes (md) {
    const root = { node: { type: 'root', children: [] }, executable: true }
    const leaf = (name, children = []) => ({ node: { type: 'literal', name, executable: true }, children })
    root.node.children.push(leaf('help'), leaf('list'), leaf('tp'), leaf('give'))
    return [root]
  }

  let _flatChunkBuf = null
  function sendFlatChunk (client, cx, cz) {
    try {
      if (!_flatChunkBuf) _flatChunkBuf = buildFlatChunkData()
      client.write('map_chunk', {
        x: cx, z: cz,
        bitMap: 0b0000001111000000,
        addBitMap: 0,
        blocksBlockEntities: false,
        chunkData: _flatChunkBuf,
        blockEntities: [],
        lightMask: 0b1111111111111111,
        emptyLightMask: 0b1111111111111111000000000000,
        skyLightMask: 0b1111111111111111,
        fullLightMask: 0,
        fullSkyLightMask: 0,
        emptySkyLightMask: 0b1111111111111111000000000000
      })
    } catch (e) { server.logger?.warn?.('map_chunk 失败:', e.message) }
  }

  function buildFlatChunkData () {
    const ChunkColumn = require('prismarine-chunk')('1.20.1')
    const mcdata = require('minecraft-data')('pc', '1.20.1')
    const c = new ChunkColumn()
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      c.setBlockStateId([x, 64, z], mcdata.blocksByName.grass_block.defaultState)
      for (let y = 58; y < 64; y++) c.setBlockStateId([x, y, z], mcdata.blocksByName.stone.defaultState)
      c.setBlockStateId([x, 63, z], mcdata.blocksByName.dirt.defaultState)
      c.setBlockStateId([x, 62, z], mcdata.blocksByName.dirt.defaultState)
    }
    if (c.initializeSync) c.initializeSync()
    return c.dump(false)
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
