// 启动原版协议服务端：node examples/server.js —— 然后用 MC 1.20.1 客户端直连 localhost:25565
import { createServer } from '../src/network/server.js'
const { server } = createServer({ port: Number(process.env.PORT ?? 25565), onlineMode: false })
server.on('listening', () => console.log('[MinecraftJS] 服务器已监听，版本 1.20.1，端口', server.__port ?? process.env.PORT ?? 25565))
server.on('client_end', c => console.log('[MinecraftJS] 玩家离线:', c.username))
