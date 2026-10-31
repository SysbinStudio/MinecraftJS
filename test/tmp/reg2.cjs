const Registry=require('prismarine-registry')('1.20.1')
Promise.resolve(Registry).then(r=>{
  const g=r.blocksByName.grass_block, s=r.blocksByName.stone, d=r.blocksByName.dirt
  console.log('grass defaultState:', g.defaultState, 'stone:', s.defaultState, 'dirt:', d.defaultState)
})
