// esbuild 浏览器注入 shim：为 Node-only 依赖提供最小 global/process/Buffer 垫片
import { Buffer } from 'buffer/'
globalThis.Buffer = Buffer
const process = globalThis.process ?? { env: {}, version: 'v20', nextTick: (f, ...a) => queueMicrotask(() => f(...a)), browser: true, platform: 'browser' }
globalThis.process = process
