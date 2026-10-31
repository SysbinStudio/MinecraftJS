// 容器/物品栏（对应 Inventory / Container / ItemStack）
export class ItemStack {
  constructor (itemId, count = 1, nbt = null) {
    this.itemId = itemId
    this.count = count
    this.nbt = nbt
    this.maxStack = 64
  }
  isEmpty () { return this.itemId === 0 || this.count <= 0 }
}

export class Slot {
  constructor (index, x, y, inventory) {
    this.index = index; this.xPos = x; this.yPos = y
    this.inventory = inventory
  }
  getItem () { return this.inventory.getItem(this.index) }
  setItem (s) { this.inventory.setItem(this.index, s) }
  hasItem () { const it = this.getItem(); return it && !it.isEmpty() }
  getMaxStackSize () { const it = this.getItem(); return it ? it.maxStack : 64 }
}

export class SimpleInventory {
  constructor (size, title = 'chest') {
    this.size = size
    this.title = title
    this.items = new Array(size).fill(null)
    this.listeners = new Set()
  }
  getItem (i) { return this.items[i] }
  setItem (i, stack) {
    this.items[i] = stack
    for (const l of this.listeners) l.onSlotChanged?.(i, stack)
  }
  addItem (stack) { // 先叠加后空槽（自动拆分超堆叠）；返回剩余数量
    if (stack.count > stack.maxStack) {
      let remaining = stack.count
      while (remaining > 0) {
        const chunk = new ItemStack(stack.itemId, Math.min(remaining, stack.maxStack), stack.nbt)
        const notFit = this._addSingle(chunk)
        if (notFit > 0) break // 库存已满
        remaining -= chunk.count
      }
      return remaining
    }
    return this._addSingle(stack)
  }
  _addSingle (stack) { // 单堆（<=maxStack）放入：先叠加后空槽
    for (let i = 0; i < this.size; i++) {
      const cur = this.items[i]
      if (cur && !cur.isEmpty() && cur.itemId === stack.itemId && cur.count < cur.maxStack) {
        const space = cur.maxStack - cur.count
        const put = Math.min(space, stack.count)
        cur.count += put; stack.count -= put
        this.setItem(i, cur)
        if (stack.count === 0) return 0
      }
    }
    for (let i = 0; i < this.size; i++) {
      if (!this.items[i] || this.items[i].isEmpty()) {
        this.setItem(i, stack); return 0
      }
    }
    return stack.count
  }
  _full () { return this.items.every(x => x && !x.isEmpty()) }
  takeIfPresent (slotIndex) { const it = this.getItem(slotIndex); this.setItem(slotIndex, null); return it }
  addListener (l) { this.listeners.add(l) }
}

// 玩家 36 格背包：0-8 快捷栏, 9-26 主背包, 27-35 盔甲（原版内部顺序为盔甲在前，此处采用客户端布局映射）
export class PlayerInventory extends SimpleInventory {
  constructor () {
    super(36, 'inventory')
    this.selected = 0
    this.craftResult = new SimpleInventory(1)
    this.cursor = null // 鼠标持有物品
  }
  hotbarIndex (serverSlot) { return serverSlot >= 9 ? serverSlot - 9 : serverSlot + 27 }
  swapHotbar (a, b) {
    const ia = a + 36 - 9, ib = b + 36 - 9 // 简化映射
    const t = this.items[ia]; this.items[ia] = this.items[ib]; this.items[ib] = t
  }
}

// 容器交互状态机：左/右击、拖拽 split-stack（对应 ServerboundContainerClickPacket 处理）
export class ContainerMenu {
  constructor (containerId, playerInv, targetInv = null) {
    this.id = containerId
    this.playerInv = playerInv
    this.targetInv = targetInv // 箱子等
    this.stateId = 0
  }
  slotInventory (slotNum) {
    if (this.targetInv && slotNum < this.targetInv.size) return { inv: this.targetInv, index: slotNum }
    return { inv: this.playerInv, index: slotNum - (this.targetInv ? this.targetInv.size : 0) }
  }
  click (slotNum, button, mode /* 0=pickup 1=quickMove 2=swap */) {
    // 简化实现：pickup 取放整个槽，shift-click 在两个库存间转移
    if (mode === 1) return this.quickMove(slotNum)
    const { inv, index } = this.slotInventory(slotNum)
    if (mode === 0) {
      if (button === 0) { // 左击
        if (this.playerInv.cursor == null) {
          this.playerInv.cursor = inv.takeIfPresent(index)
        } else if (inv.getItem(index)?.isEmpty?.() !== false) {
          inv.setItem(index, this.playerInv.cursor); this.playerInv.cursor = null
        }
      }
    }
    return { changed: [slotNum] }
  }
  quickMove (slotNum) {
    const { inv, index } = this.slotInventory(slotNum)
    const item = inv.getItem(index)
    if (!item || item.isEmpty()) return { changed: [] }
    const dest = inv === this.playerInv ? this.targetInv : this.playerInv
    if (!dest) return { changed: [] }
    const rem = dest.addItem(new ItemStack(item.itemId, item.count, item.nbt))
    if (rem === 0) inv.setItem(index, null)
    else item.count = rem
    return { changed: [slotNum] }
  }
}
