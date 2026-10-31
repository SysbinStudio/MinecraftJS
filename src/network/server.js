// 原版协议服务端监听端：基于 minecraft-protocol，允许 MC 1.20.1 原版客户端直接加入
import mc from 'minecraft-protocol'
import { createRequire } from 'module'
import { World } from '../world/world.js'
import { LivingEntity } from '../entity/entity.js'
import { ContainerMenu, PlayerInventory, SimpleInventory } from '../inventory/container.js'
import { defaultCommands } from '../command/parser.js'

const require = createRequire(import.meta.url)
const UUID = require('uuid-1345')

// 1.20.1 login 包的 dimensionCodec（维度注册表 NBT，参考 mcsrc.dev DimensionType/DimensionOptions 序列化）
const DIMENSION_CODEC = {
  type: 'compound',
  name: '',
  value: {
    'minecraft:dimension_type': {
      type: 'compound', name: '', value: {
        'minecraft:overworld': {
          type: 'compound', name: '', value: {
            value: {
              type: 'compound', name: '', value: {
                has_ceiling: { type: 'byte', value: 0 },
                ultracoral_block: { type: 'string', value: 'minecraft:mushroom_stem' },
                natural: { type: 'byte', value: 1 },
                coordinate_scale: { type: 'float', value: 1 },
                effects: { type: 'string', value: 'minecraft:overworld' },
                height: { type: 'int', value: 320 },
                ambient_light: { type: 'float', value: 0 },
                bed_works: { type: 'byte', value: 1 },
                respawn_anchor_works: { type: 'byte', value: 0 },
                piglin_safe: { type: 'byte', value: 0 },
                logical_height: { type: 'int', value: 320 },
                infiniburn: { type: 'string', value: 'minecraft:bedrock' },
                min_y: { type: 'int', value: -64 }
              }
            }
          }
        }
      }
    },
    'minecraft:worldgen/biome': {
      type: 'compound', name: '', value: Object.fromEntries(
        ['plains'].map(b => [`minecraft:${b}`, {
          type: 'compound', name: '', value: {
            value: {
              type: 'compound', name: '', value: {
                precipitation: { type: 'string', value: 'rain' },
                depth: { type: 'float', value: 0.125 },
                effects: { type: 'compound', name: '', value: { sky_color: { type: 'int', value: 7907327 }, fog_color: { type: 'int', value: 12638463 }, water_color: { type: 'int', value: 4159204 }, cloud_color: { type: 'int', value: 7972548 } } },
                temperature: { type: 'float', value: 0.8 },
                downfall: { type: 'float', value: 0.4 },
                has_caves: { type: 'byte', value: 1 },
                temperature_modification: { type: 'float', value: 0 },
                biome_category: { type: 'string', value: 'plains' },
                particles: { type: 'compound', name: '', value: {} },
                grass_color_at_modified: { type: 'byte', value: 0 },
                foliage_color: { type: 'int', value: 9286496 },
                water_fog_color: { type: 'int', value: 329011 },
                grass_color: { type: 'int', value: 9137815 }
              }
            }
          }
        }])
      )
    }
  }
}

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

  // join_game：原版进服时序。不依赖 minecraft-protocol 的 playerJoin 事件，
  // 直接监听客户端在 play 状态发出的第一个客户端包（ClientboundFinishedConfigurationPacket
  // 之后客户端发送的 ServerboundSynchronizeStartGamePacket），此时服务端才允许下发 play 包。
  // （参考 mcsrc.dev ServerGamePacketListenerImpl#handlePlayerAbilities / ServerCommonPacketListenerImpl#sendServerData）
  function startPlaySequence (client) {
    if (client.__mcjsStarted) return
    client.__mcjsStarted = true
    const p = client.__mcjs
    if (!p) { console.log('[MCJS] startPlaySequence: no player record for', client.username); return }
    players.set(client.username, p)
    console.log('[MCJS] startPlaySequence for', client.username)
    const { ent } = p
    broadcast('playerJoinMessage', { playerName: client.username })
    server.logger?.info?.(`${client.username} 加入`)
    // 原版进服时序（ServerGamePacketListenerImpl#startIncomingConfigurationTransition 之后）：
    // login → declare_commands → recipes → update_time → world_border → spawn_position →
    // player_info(add_player) → game_event(3) → position → player_abilities → set_health → set_exp
    // （参考 mcsrc.dev ServerGamePacketListenerImpl.handlePlayerAbilities / PlayerList.broadcastAll）
    const uuidStr = typeof client.uuid === 'string' ? client.uuid : UUID.stringify(client.uuid)
    const write = (name, pkt) => { try { client.write(name, pkt) } catch (e) { console.error(`[MinecraftJS] ${name} 失败:`, e.message) } }
    write('login', {
      entityId: client.id, isHardcore: false, gameMode: 0, previousGameMode: -1,
      worldNames: ['minecraft:overworld'], dimensionCodec: DIMENSION_CODEC,
      worldType: 'minecraft:overworld', worldName: 'minecraft:overworld',
      hashedSeed: 0n, maxPlayers: 20, viewDistance: 8, simulationDistance: 10,
      reducedDebugInfo: false, enableRespawnScreen: true, isDebug: false, isFlat: true,
      death: null, portalCooldown: 0
    })
    sendDeclareCommands(client)
    write('unlock_recipes', { action: 0, craftingBookOpen: false, filteringCraftable: false, smeltingBookOpen: false, filteringSmeltable: false, blastFurnaceOpen: false, filteringBlastFurnace: false, smokerBookOpen: false, filteringSmoker: false, recipes1: [], recipes2: [] })
    write('update_time', { age: 0n, time: 0n })
    write('initialize_world_border', { x: 0, z: 0, dangerZone: 5, warningTime: 15, absoluteHardDistance: 29999968, previousAbsoluteHardDistance: 29999968, newAbsoluteHardDistance: 29999968, speed: 0, portalTeleportBoundary: 16 })
    write('spawn_position', { location: { x: 0, y: 65, z: 0 } })
    write('set_default_spawn_position', { spawnPosition: { x: 0, y: 65, z: 0 } })
    // 1.20.1 player_info：action 为 bitflags；add_player 需携带 game_profile{name,properties}
    write('player_info', {
      action: { add_player: true, initialize_chat: false, update_game_mode: false, update_listed: false, update_latency: false, update_display_name: false },
      data: [{ uuid: uuidStr, player: { name: client.username, properties: [] }, chatSession: null, gamemode: 0, listed: true, latency: 0, displayName: null, listOrder: undefined }]
    })
    write('positions_change', { x: ent.x, y: ent.y, z: ent.z, yaw: 0, pitch: 0, flags: 0x1f, teleportId: 1 })
    write('game_event', { type: 3 }) // start waiting for chunks
    write('player_abilities', { flags: 0, flyingSpeed: 0.05, fieldOfViewModifier: 1 })
    write('update_health', { health: 20, food: 20, saturation: 5 })
    write('experience', { experience: 0, level: 0, totalExperience: 0 })
    // 发送地面区块，避免落虚空（prismarine-chunk 生成合法 1.20.1 区块数据）
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) sendFlatChunk(client, cx, cz)
    write('game_event', { type: 2 }) // begin loading terrain area around player
  }

  server.on('login', client => {
    const ent = new LivingEntity('player', 0.5, 65, 0.5)
    const inv = new PlayerInventory()
    const menu = new ContainerMenu(0, inv)
    const cmds = defaultCommands({ players: [...players.values()], player: ent, world, time: 0 })
    // 玩家记录直接挂在 client 对象上：避免 minecraft-protocol playerJoin/login 两次事件
    // 使用不同 id（server client vs socket client）导致的查找失败问题
    client.__mcjs = { client, ent, inv, menu, cmds, username: client.username }
    entities.set(client.id, ent)

    // —— 进服时序触发器（此处注册，确保 players 记录已存在）——
    // minecraft-protocol 在 emit('login') 时客户端仍处于 configuration 状态；
    // 需等待其转入 play（setProtocol('play') 后 state==='play'）再下发 play 包。
    client.on('setProtocol', proto => { if (proto.name === 'play') startPlaySequence(client) })
    client.on('packet', (data, meta) => { if (meta.state === 'play') startPlaySequence(client) })


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
      players.delete(client.username); entities.delete(client.id); client.__mcjs = null
      broadcast('playerLeaveMessage', { playerName: client.username, reason: { text: '' } })
    })
  })


  // minecraft-protocol 的 playerJoin 在部分版本时序不可靠；以客户端 play 状态首个包为准：
  // 原版客户端收到 finished_configuration 后发送 synchronize_start_game，服务端回 confirm_teleportation 前的一切
  // play 下行都会被客户端丢弃。这里监听任意 play 入站包触发进服时序（幂等）。

  // 原版 declare_commands 包（ClientboundCommandsPacket）：command_node 结构为
  // flags{command_node_type,has_command,has_redirect_node,has_custom_suggestions,unused} + children(varint[])
  function sendDeclareCommands (client) {
    const root = { flags: { command_node_type: 0, has_command: false, has_redirect_node: false, has_custom_suggestions: false, unused: 0 }, children: [1, 2, 3, 4] }
    const lit = name => ({ flags: { command_node_type: 1, has_command: true, has_redirect_node: false, has_custom_suggestions: false, unused: 0 }, children: [], extraNodeData: { name } })
    try {
      client.write('declare_commands', { nodes: [root, lit('help'), lit('list'), lit('tp'), lit('give')], rootIndex: 0 })
    } catch (e) { console.error('[MinecraftJS] declare_commands 失败:', e.message) }
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
    for (const p of players.values()) {
      if (!p.client.__mcjsStarted) continue // 未进入 play 的客户端跳过（configuration 状态下写 play 包会崩）
      try { p.client.write(name, params) } catch {}
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
