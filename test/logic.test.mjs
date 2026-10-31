import assert from 'assert'
import { World } from '../src/world/world.js'
import { Chunk } from '../src/world/chunk.js'
import { LightEngine } from '../src/world/light.js'
import { AABB } from '../src/physics/aabb.js'
import { stepEntityPhysics } from '../src/physics/movement.js'
import { SimpleInventory, PlayerInventory, ContainerMenu, ItemStack } from '../src/inventory/container.js'
import { ShapedRecipe, ShapelessRecipe, SmeltingRecipe, RecipeBook } from '../src/recipe/recipes.js'
import { destroyTimeTicks } from '../src/block/breaking.js'
import { applyDamage, DMG, knockbackVector, WEAPON_DAMAGE } from '../src/entity/combat.js'
import { LivingEntity } from '../src/entity/entity.js'
import { defaultCommands } from '../src/command/parser.js'

let n = 0
const t = (name, fn) => { try { fn(); n++; console.log('ok -', name) } catch (e) { console.error('FAIL -', name, e.message); process.exitCode = 1 } }

t('chunk set/get block', () => {
  const w = new World()
  w.setBlock(3, 70, 5, 1)
  assert.strictEqual(w.getBlockAt(3, 70, 5).stateId, 1)
  assert.strictEqual(w.getBlockAt(3, 71, 5).stateId, 0)
})

t('light BFS decays with distance', () => {
  const w = new World()
  // 手动设置 world.lightOpacity 默认非空气为15、空气0（无blocks索引时 isAirLike 判定 stateId!==0 为实心）
  const le = new LightEngine(w)
  const map = le.computeBlockLight(0, 100, 0, 15, 5)
  assert.strictEqual(map.get('0,100,0'), 15)
  assert.ok((map.get('1,100,0') ?? 0) < 15)
})

t('aabb intersection & clip', () => {
  const a = AABB.ofCentered(0.5, 0, 0.5, 0.6, 1.8)
  const b = new AABB(0, 0, 0, 1, 1, 1)
  assert.ok(a.intersects(b))
  assert.ok(!a.intersects(new AABB(5, 5, 5, 6, 6, 6)))
})

t('entity falls and lands on ground block', () => {
  const w = new World()
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) w.setBlock(x, 64, z, 1)
  const e = new LivingEntity('test', 0.5, 67, 0.5)
  e.width = 0.6; e.height = 1.8
  let landed = false
  for (let i = 0; i < 100 && !landed; i++) { e.tick(w); if (e.onGround) landed = true }
  assert.ok(landed, 'should land')
  assert.ok(Math.abs(e.y - 65) < 0.01, `y=${e.y} should be 65`)
})

t('inventory add stacks then empties', () => {
  const inv = new SimpleInventory(5)
  const rem = inv.addItem(new ItemStack(259, 70)) // diamond sword id placeholder count 70 -> maxStack 64
  assert.strictEqual(inv.getItem(0).count, 64)
  assert.strictEqual(inv.getItem(1).count, 6)
  assert.strictEqual(rem, 0)
})

t('container quick move chest->player', () => {
  const p = new PlayerInventory()
  const chest = new SimpleInventory(27)
  chest.setItem(0, new ItemStack(1, 32))
  const menu = new ContainerMenu(0, p, chest)
  menu.quickMove(0)
  assert.strictEqual(chest.getItem(0), null)
  const found = p.items.find(i => i && i.itemId === 1)
  assert.ok(found && found.count === 32)
})

t('shaped recipe crafting stick', () => {
  const STICK = new ShapedRecipe('stick', 1, 2, { '#': ['oak_planks'] }, ['#', '#'], { itemId: 'stick', count: 4 })
  const book = new RecipeBook(); book.add(STICK)
  const grid = [['oak_planks'], ['oak_planks']]
  const r = book.craft(grid, 2, 2)
  assert.deepStrictEqual(r, { itemId: 'stick', count: 4 })
  const bad = [['oak_planks'], ['air']]
  assert.strictEqual(book.craft(bad, 2, 2), null)
})

t('shapeless + smelting', () => {
  const book = new RecipeBook()
  book.add(new ShapelessRecipe('bone_meal', [['bone']], { itemId: 'bone_meal', count: 3 }))
  book.add(new SmeltingRecipe('iron_ingot', ['raw_iron'], { itemId: 'iron_ingot', count: 1 }))
  assert.deepStrictEqual(book.craft([['bone', null], [null, null]], 2, 2), { itemId: 'bone_meal', count: 3 })
  assert.strictEqual(book.smelt('raw_iron').itemId, 'iron_ingot')
})

t('break time matches vanilla formula', () => {
  // stone hardness 1.5, hand speed 1, canHarvest false => ceil(1.5/(1/100))=150 ticks
  assert.strictEqual(destroyTimeTicks(1.5, 1, false), 150)
  // wooden pick speed 2, canHarvest true => ceil(1.5/(2/30))=ceil(22.5)=23
  assert.strictEqual(destroyTimeTicks(1.5, 2, true), 23)
  assert.strictEqual(destroyTimeTicks(-1, 5, true), Infinity)
})

t('combat damage armor reduction & invuln frames', () => {
  const victim = new LivingEntity('zombie', 2, 65, 0)
  victim.health = 20; victim.armorPoints = 10; victim.armorToughness = 0
  const attacker = new LivingEntity('player', 0, 65, 0)
  const d1 = applyDamage(victim, WEAPON_DAMAGE.diamond_sword, DMG.playerAttack(attacker))
  assert.ok(d1 > 0 && d1 < 7)
  const d2 = applyDamage(victim, 7, DMG.playerAttack(attacker))
  assert.strictEqual(d2, 0, 'invulnerable frame blocks same-source damage')
  knockbackVector(attacker, victim)
  assert.ok(victim.vx > 0)
})

t('commands parse tp/list/help', () => {
  const player = new LivingEntity('player', 0, 65, 0)
  player.username = 'Tester'
  const ctx = { players: [{ username: 'Tester' }], player, time: 0 }
  const cmds = defaultCommands(ctx)
  assert.deepStrictEqual(cmds.parse('/tp 10 70 -5').result.teleport, [10, 70, -5])
  assert.ok(cmds.parse('/list').result.message.includes('Tester'))
  assert.ok(cmds.parse('/gamemode creative').result.gamemode === 'creative')
  assert.ok(cmds.parse('/nope').error)
})

console.log(`\n${n} tests passed`)
