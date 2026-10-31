// 合成系统：形状/无序/熔炼配方匹配（对应 RecipeManager / CraftingRecipe）
export class ShapedRecipe {
  constructor (id, width, height, key, pattern, result) {
    this.id = id; this.type = 'crafting_shaped'
    this.width = width; this.height = height
    this.key = key // { 'X': [itemIds] }
    this.pattern = pattern // 字符串数组
    this.result = result // { itemId, count }
  }
  static fromJSON (j) {
    return new ShapedRecipe(j.name, j.width ?? j.pattern?.[0]?.length ?? 1, j.height ?? j.pattern?.length ?? 1, j.key, j.pattern, j.result)
  }
  matches (grid, gw, gh) { // grid: 二维数组，元素为 itemId|null
    for (let ox = 0; ox + this.width <= gw; ox++) {
      for (let oy = 0; oy + this.height <= gh; oy++) {
        if (this.matchesAt(grid, ox, oy)) return true
      }
    }
    return false
  }
  matchesAt (grid, ox, oy) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const ch = this.pattern[y]?.[x] ?? ' '
        const cell = grid[oy + y]?.[ox + x]
        if (ch === ' ') { if (cell != null) return false; continue }
        const accept = Array.isArray(this.key[ch]) ? this.key[ch] : [this.key[ch]]
        if (cell == null || !accept.includes(cell)) return false
      }
    }
    // 检查网格其余部分必须为空
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
        const inRec = x >= ox && x < ox + this.width && y >= oy && y < oy + this.height
        if (!inRec && grid[y][x] != null) return false
      }
    }
    return true
  }
}

export class ShapelessRecipe {
  constructor (id, ingredients, result) {
    this.id = id; this.type = 'crafting_shapeless'; this.ingredients = ingredients; this.result = result
  }
  matches (grid) {
    const present = []
    for (const row of grid) for (const c of row) if (c != null) present.push(c)
    if (present.length !== this.ingredients.length) return false
    const pool = [...present]
    for (const ing of this.ingredients) {
      const accept = Array.isArray(ing) ? ing : [ing]
      const i = pool.findIndex(p => accept.includes(p))
      if (i === -1) return false
      pool.splice(i, 1)
    }
    return true
  }
}

export class SmeltingRecipe {
  constructor (id, input, result, time = 200, xp = 0.1) {
    this.id = id; this.type = 'smelting'; this.input = input; this.result = result; this.cookTime = time; this.xp = xp
  }
  matches (itemId) {
    const accept = Array.isArray(this.input) ? this.input : [this.input]
    return accept.includes(itemId)
  }
}

export class RecipeBook {
  constructor () { this.shaped = []; this.shapeless = []; this.smelting = [] }
  add (r) {
    if (r.type === 'crafting_shaped') this.shaped.push(r)
    else if (r.type === 'crafting_shapeless') this.shapeless.push(r)
    else this.smelting.push(r)
  }
  craft (grid, gw, gh) { // 返回结果或 null
    for (const r of this.shaped) if (r.matches(grid, gw, gh)) return { ...r.result }
    for (const r of this.shapeless) if (r.matches(grid)) return { ...r.result }
    return null
  }
  smelt (itemId) {
    for (const r of this.smelting) if (r.matches(itemId)) return { ...r.result, cookTime: r.cookTime }
    return null
  }
}
