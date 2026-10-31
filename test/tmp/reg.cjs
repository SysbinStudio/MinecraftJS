const Registry=require('prismarine-registry')('1.20.1')
if(Registry.then){Registry.then? null:null}
Promise.resolve(Registry).then(r=>{
  console.log('registry keys:', Object.keys(r).slice(0,15))
  const blocks = r.blocks || r.blockStates
  console.log('has blocks?', !!r.blocks)
})
