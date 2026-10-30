const md = require('minecraft-data')({ version: '1.20', majorVersion: '1.20', minecraftVersion: '1.20.1', type: 'pc' })
console.log('blocks:', md.blocks.length, 'items:', md.items.length, 'biomes:', md.biomes.length)
