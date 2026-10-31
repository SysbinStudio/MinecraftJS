import { createServer } from '../src/network/server.js'
const { server } = createServer({ port: 25599 })
console.log('SERVER_LISTENING')
setTimeout(() => process.exit(1), 30000)
