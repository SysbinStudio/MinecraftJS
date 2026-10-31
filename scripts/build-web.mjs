// 构建浏览器游戏 bundle：
// 1) 生成 web/game/data.js（blocks.json 预展开为 window.MCJS_DATA，避免打包整个 minecraft-data）
// 2) esbuild 打包 main.js -> web/dist/minecraftjs-game.js（three 从 node_modules 解析，IIFE 输出）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ---- 1. 方块状态数据 ----
const mdDir = path.dirname(require.resolve('minecraft-data'))
const blocksPath = path.join(mdDir, 'minecraft-data/data/pc/1.20/blocks.json')
const blocks = JSON.parse(fs.readFileSync(blocksPath, 'utf8'))
fs.writeFileSync(path.join(root, 'web/game/data.js'),
  `window.MCJS_DATA = { version: "1.20.1", blocks: ${JSON.stringify(blocks)} };\n`)
console.log('[build-web] data.js written,', blocks.length, 'blocks')

// ---- 2. prismarine-chunk UMD（浏览器区块解析）----
let pcBundle = null
try {
  const pcEntry = require.resolve('prismarine-chunk')
  const out = path.join(root, 'web/game/prismarine-chunk.js')
  await build({
    entryPoints: [pcEntry], bundle: true, format: 'iife', globalName: 'prismarineChunkShim',
    platform: 'browser', outfile: out, minify: true, logLevel: 'error',
    define: { global: 'window', 'process.env': '{}', 'process.version': '"v20"' },
    inject: [path.join(root, 'scripts/browser-shims.js')]
  })
  // prismarine-chunk 默认导出是函数 (version)=>ChunkColumn；globalName 包装后取 .default
  fs.appendFileSync(out, '\nwindow.prismarineChunk = (typeof prismarineChunkShim==="function"?prismarineChunkShim:prismarineChunkShim.default)&&undefined;window.prismarineChunk=window.prismarineChunk||((...a)=>prismarineChunkShim(...a));\n')
  pcBundle = out
  console.log('[build-web] prismarine-chunk bundled')
} catch (e) {
  console.warn('[build-web] prismarine-chunk 打包失败（浏览器将退化为无区块解析）:', e.message)
}

// ---- 3. 主 bundle ----
await build({
  entryPoints: [path.join(root, 'web/game/main.js')],
  bundle: true, format: 'iife', platform: 'browser',
  outfile: path.join(root, 'web/dist/minecraftjs-game.js'),
  minify: false, sourcemap: false, logLevel: 'info',
  define: { global: 'window', 'process.env.NODE_ENV': '"production"', 'process.version': '"v20"' }
})
console.log('[build-web] done -> web/dist/minecraftjs-game.js')
