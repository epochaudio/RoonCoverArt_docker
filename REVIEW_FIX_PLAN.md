# 代码审核修复计划

本文档记录当前运行镜像对应源码的审核发现、修复策略和验证方式。修复按风险优先级推进。

## 当前确认

- 目标版本：`5.0.2`
- 运行容器：`roon-coverart`
- 目标本地镜像：`roon-coverart:5.0.2-local`
- 当前服务已配对 Roon Core，`/api/status` 可返回播放状态

## 修复清单

### 1. 控制接口访问风险

状态：已修复

问题：

- 服务使用 host 网络运行，并默认对局域网暴露 `3666`。
- Socket.IO 控制事件可以直接控制 Roon 播放。
- HTTP CORS 允许任意来源。

修复结果：

- 增加 `access.token` 和 `access.allowedOrigins` 配置。
- HTTP CORS 默认只允许同源请求，可通过配置增加允许来源。
- Socket.IO 增加可选令牌校验；令牌未配置时保留兼容行为。
- 配置令牌后，可通过页面 URL `?token=` 传入，前端会保存到 `localStorage` 并用于 Socket.IO 连接。

验证：

- `node --check app.js`
- `docker compose config`

### 2. Android 8 WebView 语法兼容

状态：已修复

问题：

- 前端脚本使用 optional chaining，例如 `obj?.prop`。
- 旧 Android WebView 会在解析阶段报错，导致脚本整体失效。

修复结果：

- 移除业务脚本和备份脚本中的 optional chaining。
- 使用显式空值判断保持旧 WebView 可解析。

验证：

- `rg -n "\?\." public/js app.js` 无匹配
- `node --check public/js/index.js`
- `node --check public/js/main.js`

### 3. 运行日志过量

状态：已修复

问题：

- Roon zone seek 变化会高频进入日志。
- Docker 默认 json 日志可能持续增长。

修复结果：

- 增加 `logging.level` 配置。
- 默认 `info` 不再打印每秒 seek-only zone 变化。
- Compose 增加 Docker json 日志轮转：`10m * 3`。

验证：

- `node --check app.js`
- `docker compose config`

### 4. Compose 镜像来源不一致

状态：已修复

问题：

- 当前运行的是本地镜像。
- `docker-compose.yml` 原先使用 `epochaudio/coverart_docker:latest`，容易重建时跑到远端 latest。

修复结果：

- Compose 改为本地构建。
- 镜像标签改为 `roon-coverart:5.0.2-local`。
- 增加 `container_name: roon-coverart`，避免再次创建随机项目名容器。

验证：

- `docker compose config`

### 5. 停止播放后 Art Wall 切换不稳定

状态：已修复

问题：

- `notPlaying` 事件只在选中输出匹配时发送。
- 未选择输出或配置丢失时，前端可能只收到 `zoneStatus`，不会稳定启动 15 秒切换。

修复结果：

- 服务端统一计算当前 active zone。
- 播放、停止都从统一路径发 `zoneStatus`、`nowplaying` 或 `notPlaying`。
- 前端收到 `zoneStatus` 时也会根据 `zone.state` 启动或取消 15 秒切换。

验证：

- `node --check app.js`
- `node --check public/js/index.js`

### 6. 生产依赖安全风险

状态：已修复

问题：

- 运行容器内 `npm audit --omit=dev` 曾报告 19 个漏洞，其中包含 critical/high。

修复结果：

- 更新 `package-lock.json`。
- 升级 Socket.IO 到 `^4.8.3` 并改用 Socket.IO 4 的 `Server` 初始化方式。
- `npm audit --omit=dev` 当前返回 `found 0 vulnerabilities`。

验证：

- `npm audit --omit=dev`
- `docker exec roon-coverart npm audit --omit=dev`
- `node --check app.js`
- `node --check public/js/index.js`
- `node --check public/js/main.js`
- `docker compose build`
- `docker compose up -d`
- `/api/pair`、`/api/status`、`/api/images` 响应正常
