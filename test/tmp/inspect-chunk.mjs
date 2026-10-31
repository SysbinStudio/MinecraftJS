import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const proto = require('minecraft-protocol')
// get protocol data via minecraft-data through the protocol module internals
const md = require('minecraft-data')
const version = md.versions.find(v => v.minecraftVersion === '1.20.1' && v.type === 'pc')
console.log('version info:', version?.info, version?.version)
