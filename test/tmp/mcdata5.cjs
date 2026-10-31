const md=require('minecraft-data')
const d = md('pc','1.20.1')
console.log('d keys:', Object.keys(d).slice(0,20))
console.log('blocks?', !!d.blocks, 'blocksByName?', !!d.blocksByName)
// maybe blocks data file missing for 1.20.1 in this trimmed install
try { const b=require('minecraft-data/minecraft-data/data/pc/1.20.1/blocks.json'); console.log('direct json len', b.length) } catch(e){ console.log('direct err:', e.code) }
