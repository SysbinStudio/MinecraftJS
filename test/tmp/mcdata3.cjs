const md=require('minecraft-data')
console.log('versions type:', typeof md.versions, Array.isArray(md.versions))
if (Array.isArray(md.versions)) {
  const v = md.versions.find(x=>x.minecraftVersion==='1.20.1'&&x.type==='pc')
  console.log('found version entry:', !!v, v?.version)
} else if (md.supportedVersions) {
  console.log('supported pc sample:', Object.keys(md.supportedVersions.pc||{}).slice(0,5))
}
// index.js of minecraft-data exports function? check package main
const pkg=require('minecraft-data/package.json')
console.log('main:', pkg.main, 'exports keys:', Object.keys(pkg.exports||{}).slice(0,8))
