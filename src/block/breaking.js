// 方块破坏时间与挖掘等级（对应 Block.getDestroySpeed / Player.hasCorrectToolForDrops）
// 公式（原版）：damagePerTick = speed / hardness / (canHarvest ? 30 : 100)；>=1 即一击破坏
export function destroyTimeTicks (blockHardness, toolSpeed, canHarvest) {
  if (blockHardness < 0) return Infinity // bedrock
  const div = canHarvest ? 30 : 100
  return Math.ceil(blockHardness / (toolSpeed / div))
}

export function computeBreakProgress (ticksHeld, blockHardness, toolSpeed, canHarvest) {
  const t = destroyTimeTicks(blockHardness, toolSpeed, canHarvest)
  return Math.min(1, ticksHeld / t)
}

const TIER_ORDER = ['wood', 'stone', 'iron', 'diamond', 'netherite']
export function tierLevel (mat) { return mat ? TIER_ORDER.indexOf(mat.replace('_tier', '').replace('minecraft:', '')) + 1 : 0 }
export function canMine (requiredTier, toolTier) { return toolTier >= requiredTier }
