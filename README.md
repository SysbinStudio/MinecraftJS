# MinecraftJS 🧱⛏️

用 JavaScript 复刻的 Minecraft 1.20.1 —— 目标是逐模块移植原版特性（参考 [mcsrc.dev](https://mcsrc.dev) 反编译源码），并通过实现原版网络协议直接加入正版/离线服务器。

> ⚠️ 项目处于早期阶段：目前完成的是**协议与数据底层**（VarInt / PacketBuffer / NBT），游戏逻辑、渲染与联网功能正在开发中。

## 当前进度

| 模块 | 状态 | 说明 |
|---|---|---|
| `src/protocol/varint.js` | ✅ 完成 | VarInt / VarLong 编解码（1:1 对应 Mojang `VarInt`） |
| `src/protocol/buffer.js` | ✅ 完成 | `FriendlyByteBuf` 移植：BlockPosition、UUID、String、NBT 序列化 |
| `src/nbt/` | ✅ 完成 | NBT 读写器（SNBT + 二进制，含网络压缩格式） |
| `web/index.html` + Pages | ✅ 完成 | GitHub Pages 主页与 Actions 自动部署 |
| `src/network/framing.js` | 🔜 进行中 | TCP 分帧 + zlib 压缩（连接服务器的第一步） |
| 握手 / Login / AES-128-CFB8 | ⬜ 计划 | 加入原版服务器所需的状态机与加密 |
| 世界 / 区块 / 光照 | ⬜ 计划 | Chunk 解析、方块状态、光照引擎 |
| 实体 / 物理 / 碰撞 | ⬜ 计划 | AABB、重力、移动包管线 |
| 合成 / 容器 / 战斗 | ⬜ 计划 | 配方匹配、Inventory 交互、伤害管线 |

## 目录结构

```
src/
  protocol/    # VarInt、PacketBuffer（FriendlyByteBuf 移植）
  nbt/         # NBT 标签定义与 SNBT/二进制读写
  network/     # (规划) 分帧、压缩、加密、客户端状态机
  world/       # (规划) 区块、方块、光照
  entity/      # (规划) 实体、物理、AI
web/           # GitHub Pages 站点
.github/workflows/deploy-pages.yml
scripts/       # minecraft-data 校验脚本
test/          # 单元测试
```

## 快速开始

要求 Node.js ≥ 18。

```bash
npm install
node --test test/          # 运行现有测试
```

## 如何加入原版服务器（路线图）

1. **协议层**：复用已完成的 `varint.js` / `buffer.js`；
2. **分帧与压缩**：实现 Length-Prefixed 帧 + `zlib.inflateRawSync/deflateRawSync`；
3. **Handshake → Status**：可先做 Ping/Pong 查询服务器信息；
4. **Login**：`login_start` → RSA 密钥交换（`crypto.generateKeyPairSync`）→ `encryption_request` 后开启 AES-128-CFB8；
5. **Play**：绑定 `protodef`（基于 `minecraft-data` 的 1.20.1 协议定义）收发游戏包。

## GitHub Pages

站点已通过 `.github/workflows/deploy-pages.yml` 配置自动部署。推送后在仓库
**Settings → Pages → Source** 选择 **GitHub Actions**，即可访问
`https://<用户名>.github.io/<仓库名>/`。

## License

MIT