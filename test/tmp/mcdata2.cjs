const md=require('minecraft-data')
console.log('exports keys:', Object.keys(md).slice(0,15))
try {
  const d = md.default ? md.default('pc','1.20.1') : null
  console.log('default fn works?', !!d, d && !!d.blocksByName)
} catch(e){ console.log('default err', e.message.slice(0,80)) }
// try subpath
try { const b=require('minecraft-data/data/pc/1.20.1/blocks.json'); console.log('direct blocks.json len', b.length, 'grass defaultState', b.find(x=>x.name==='grass_block').defaultState) } catch(e){ console.log('subpath err', e.message.slice(0,100)) }
