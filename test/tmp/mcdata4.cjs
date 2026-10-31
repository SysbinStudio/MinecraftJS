const md=require('minecraft-data')
// minecraft-data index.js: module.exports = (type, versionOrCo...) but ESM interop may put it on default
console.log('typeof md:', typeof md)
console.log('typeof md.default:', typeof md.default)
const f = typeof md==='function'?md:(typeof md.default==='function'?md.default:null)
if(f){ const d=f('pc','1.20.1'); console.log('via fn blocksByName?', !!d?.blocksByName) }
