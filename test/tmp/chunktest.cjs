const ChunkColumn=require('prismarine-chunk')('1.20.1')
const mcdata=require('minecraft-data')('pc','1.20.1')
console.log('grass defaultState:', mcdata.blocksByName.grass_block.defaultState)
const c=new ChunkColumn()
for(let x=0;x<16;x++)for(let z=0;z<16;z++){
  c.setBlockStateId([x,64,z],mcdata.blocksByName.grass_block.defaultState)
  c.setBlockStateId([x,63,z],mcdata.blocksByName.dirt.defaultState)
  for(let y=57;y<63;y++)c.setBlockStateId([x,y,z],mcdata.blocksByName.stone.defaultState)
}
if(typeof c.initializeProxy==='function')c.initializeProxy()
else if(typeof c.initializeNonIndexedPrimitiveArrays==='function')c.initializeNonIndexedPrimitiveArrays()
const d=c.dump(false)
console.log('dump type:',d.constructor.name,'len',d.length)
const ld = typeof c.dumpLight==='function'? c.dumpLight():null
console.log('dumpLight:', ld?JSON.stringify(Object.keys(ld)):'none')
if (ld) { console.log('sky len:', ld.skyLight?.length, 'blk len:', ld.blockLight?.length) }
