// 命令解析器（对应 Commands / CommandDispatcher 简化版）：支持 /gamemode /tp /give /time /help
export class CommandParser {
  constructor () { this.commands = new Map() }
  register (name, handler, help) { this.commands.set(name.toLowerCase(), { handler, help }) ; return this }
  parse (line) {
    if (!line.startsWith('/')) return { error: '不是命令' }
    const parts = tokenize(line.slice(1))
    const name = parts[0]?.toLowerCase()
    const cmd = this.commands.get(name)
    if (!cmd) return { error: `未知命令: /${name}` }
    try { return { result: cmd.handler(parts.slice(1)) } } catch (e) { return { error: e.message } }
  }
}

function tokenize (s) {
  const out = []
  let cur = '', q = null
  for (const ch of s) {
    if (q) { if (ch === q) { q = null } else cur += ch }
    else if (ch === '"' || ch === "'") q = ch
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = '' } }
    else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

export function defaultCommands (ctx) { // ctx: { players, world, broadcast, time }
  const p = new CommandParser()
  p.register('help', () => ({ message: [...p.commands.keys()].join(', ') }))
  p.register('list', () => ({ message: `在线玩家(${ctx.players.length}): ${ctx.players.map(x => x.username).join(', ')}` }))
  p.register('tp', ([x, y, z]) => {
    if (x == null) throw new Error('用法: /tp <x> <y> <z>')
    ctx.player.x = +x; ctx.player.y = +y; ctx.player.z = +z
    return { teleport: [ctx.player.x, ctx.player.y, ctx.player.z] }
  })
  p.register('give', ([item, count = '1']) => {
    if (!item) throw new Error('用法: /give <物品> [数量]')
    return { give: { item, count: +count } }
  })
  p.register('time', ([set, v]) => {
    if (set === 'set') { const named = { day: 1000, noon: 6000, night: 13000 }; ctx.time = named[v] ?? (+v || ctx.time); return { time: ctx.time } }
    return { time: ctx.time }
  })
  p.register('gamemode', ([m]) => { ctx.gamemode = m; return { gamemode: m } })
  p.register('kill', () => { ctx.player.health = 0; return { killed: true } })
  p.register('say', ([...w]) => ({ broadcast: `${ctx.player.username} ${w.join(' ')}` }))
  return p
}
