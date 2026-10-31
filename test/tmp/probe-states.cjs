const fs = require('fs')
const dir = '/workspace/node_modules/minecraft-data/minecraft-data/data/pc/1.20'
const blocks = JSON.parse(fs.readFileSync(dir + '/blocks.json', 'utf8'))
// 模拟 minecraft-data 的 blocksStates 展开逻辑（state id = 顺序展开每个 block 的 states）
let states = []
for (const b of blocks) {
  const props = Object.keys(b.states)
  if (props.length === 0) { states.push({ ...b, states: {} }); continue }
  // cartesian product in order of keys as stored
  let combos = [{}]
  for (const p of props) {
    const next = []
    for (const c of combos) for (const v of b.states[p]) next.push({ ...c, [p]: v })
    for (const c of next) states.push({ ...b, states: c })
  }
}
console.log('total states:', states.length)
for (const n of ['air','stone','grass_block','dirt','water','glass','oak_log','torch','bedrock']) {
  const i = blocks.findIndex(b => b.name === n)
  console.log(n, 'defaultState=', blocks[i].defaultState, JSON.stringify(states[blocks[i].defaultState]).slice(0, 300))
}
