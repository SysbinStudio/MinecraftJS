// 方块状态表：从 minecraft-data (pc/1.20 ≈ 1.20.1) 的 blocks.json 展开 stateId -> {name, states}
// 与原版 StateRegistry / BlockState 的映射对应（参考 mcsrc.dev BuiltInRegistries.BLOCK）
// 浏览器端通过 window.MCJS_DATA.blocks 注入；Node 端由构建脚本预生成 JSON。

export function expandBlockStates (blocksJson) {
  const list = []
  for (const b of blocksJson) {
    const props = b.states ?? []
    let combos = [{}]
    for (const p of props) {
      const vals = p.num_values === 1
        ? [(p.values ? p.values[0] : false)]
        : Array.from({ length: p.num_values }, (_, i) => (p.values ? p.values[i] : i))
      const next = []
      for (const c of combos) for (const v of vals) next.push({ ...c, [p.name]: v })
      combos = next
    }
    // minStateId..maxStateId 顺序即笛卡尔积顺序（minecraft-data 约定）
    for (let k = 0; k < combos.length; k++) {
      list[b.minStateId + k] = {
        id: b.id, name: b.name, states: combos[k],
        hardness: b.hardness, transparent: !!b.transparent,
        emitLight: b.emitLight ?? 0, filterLight: b.filterLight ?? 15,
        material: b.material
      }
    }
  }
  return list
}

// 常见方块近似颜色（无纹理时的调试配色，取自 MC 物品图标主色调）
export const BLOCK_COLORS = {
  air: null, cave_air: null, void_air: null,
  stone: 0x8a8a8a,
  grass_block: 0x6ab04c,
  dirt: 0x79553a,
  coarse_dirt: 0x7d5226,
  podzol: 0x564124,
  farmland: 0x6b4f2a,
  sand: 0xdbd0a1,
  red_sand: 0xbe6a24,
  gravel: 0x847e7e,
  water: 0x3f76e4,
  lava: 0xe06100,
  oak_log: 0xa08050,
  birch_log: 0xd7c6a0,
  spruce_log: 0x6d5134,
  glass: 0xcdeced,
  bedrock: 0x363232,
  coal_ore: 0x575757,
  iron_ore: 0xb9a08a,
  gold_ore: 0xdcba82,
  diamond_ore: 0x62d8d8,
  emerald_ore: 0x3fb963,
  obsidian: 0x150c1d,
  snow_block: 0xf0f3f5,
  ice: 0xbce4fe,
  clay: 0xa4b8c9,
  torch: 0xffd070,
  crafting_table: 0x9b7f5e,
  furnace: 0x6f6f6f,
  chest: 0x9b7d43,
  tnt: 0xc93b32,
  bookshelf: 0x6f5638,
  mossy_cobblestone: 0x6d7a5a,
  cobblestone: 0x707070,
  sandstone: 0xdad2a1,
  netherrack: 0x802d28,
  soul_sand: 0x5a4134,
  glowstone: 0xf9d979,
  granite: 0x9d7562,
  diorite: 0xbec2c5,
  andesite: 0x828886,
  deepslate: 0x4b4b52,
  copper_ore: 0xac8260,
  pumpkin: 0xd4831a,
  melon: 0xa9bf5a,
  bricks: 0x965f4d,
  prismarine: 0x61a794,
  white_wool: 0xdcdcf1
}

// 名称模式匹配（leaves*/planks*/log* 等变体统一着色）
export function blockColor (name) {
  if (!name || name === 'air' || name === 'cave_air' || name === 'void_air') return null
  if (BLOCK_COLORS[name] !== undefined) return BLOCK_COLORS[name]
  if (/leaves/.test(name)) return 0x2d6a1a
  if (/planks|wood/.test(name)) return 0xb4935a
  if (/log/.test(name)) return 0xa08050
  if (/wool|carpet|bed/.test(name)) return 0xdcdcf1
  if (/concrete/.test(name)) return 0x8fb3c8
  if (/terracotta/.test(name)) return 0xd07f5c
  if (/slab|stairs|wall|fence/.test(name)) return blockColor(name.replace(/s?_(slab|stairs|wall|fence)$/, '')) ?? 0x909090
  if (/grass$/.test(name)) return 0x6ab04c
  if (/ice/.test(name)) return 0xbce4fe
  if (/sand$/.test(name)) return 0xdbd0a1
  if (/ore$/.test(name)) return 0x6f6f6f
  return 0x9a8f7c
}

// 渲染形状分类：full(整立方)/cross(火把类十字)/half(半高 slab)/fluid(水/熔岩低一格)
export function renderShape (info) {
  if (!info) return 'none'
  const n = info.name
  if (/torch$|sapling$|flower$|sugar_cane|cactus|dead_bush|vine|mushroom$/.test(n)) return 'cross'
  if (n === 'water' || n === 'lava') return 'fluid'
  if (/(_slab|_carpet)$/.test(n) && !/double/.test(n)) return 'half'
  return 'full'
}
