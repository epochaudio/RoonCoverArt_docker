# CoverArt 16:9 维护记录

## 目的

本文件记录 2026-07-16 对 CoverArt Docker 项目的代码评审、修复范围、验收结果和后续维护约束。

评审基线：

- 仓库版本：5.0.4
- 当时运行容器版本：5.0.3
- 运行容器保持在线，本轮只修改和验证源码，不自动替换生产容器

## 评审摘要

项目可以长期运行，但早期多轮 AI 迭代留下了多套并行实现。主要风险不是语法错误，而是运行路径重复、状态源冲突、文件操作缺少并发保护，以及 Docker 构建上下文混入本地运行数据。

### P0：安全与数据一致性

- [x] Docker 构建排除 `backup/`，避免把 `config.json`、Roon 配对状态和历史封面打入镜像
- [x] Roon API 使用 `log_level: "none"`，禁止协议层把图片 Buffer 和完整 Zone 数据写入 Docker 日志
- [x] 封面保存改为按目录串行执行，避免并发删除、写图和写元数据竞争
- [x] `image_info.json` 使用临时文件加 rename 原子更新
- [x] 修复 `zones_removed`：兼容 Roon 返回的字符串 ID 数组

### P1：运行逻辑收敛

- [x] 前端只保留 Socket.IO 状态链路，删除无消费者的 5 秒 HTTP 轮询状态机
- [x] 同一播放事件只更新一次封面；歌曲信息在同专辑切歌时仍应更新
- [x] 当前控制 Zone 以服务端下发结果为准，不继续使用可能过期的 Cookie Zone ID
- [x] `artwork.saveDir` 同时用于保存、列表和 `/images` 静态服务
- [x] 删除没有调用者的 Browse、旧状态和旧控制接口

### P2：清理与镜像优化

- [x] 删除已确认未加载或仅用于早期调试的脚本、backup 页面和旧样式
- [x] 删除直接声明但活跃代码未使用的 `colorthief`、`body-parser`、jQuery、js-cookie 和 Browse 依赖
- [x] Docker 改为多阶段构建，运行阶段不保留 Git
- [x] 增加轻量 `/api/health` 和 Docker `HEALTHCHECK`
- [x] 更新 Node 版本约束和 npm scripts

### P3：测试与验收

- [x] Zone 增删改合并单元测试
- [x] 封面并发保存、数量上限和元数据 JSON 完整性测试
- [x] JavaScript 和 shell 语法检查
- [x] `docker compose config` 检查
- [x] Docker 镜像构建和容器健康检查

## 已确认的运行证据

评审时从正在运行的 5.0.3 容器中确认：

- 容器已运行约两周，无 OOM，内存约 72 MiB
- 日志累计约 22 MB，单行最大约 1.5 MB；图片 Buffer 被 Roon API 展开写入日志
- 日志出现过封面保存 `ENOENT`，原因是两个保存流程并发操作同一批旧文件
- 日志中的 `zones_removed` 为字符串数组，而旧代码按对象处理
- 镜像内存在约 90 MB 的 `backup/.../runtime-data.tgz`，其中包含 `config.json` 和历史图片

## 实施原则

1. Roon 设置中的输出选择是服务端唯一 Zone 来源；浏览器不再自行记忆另一个 Zone。
2. 一个状态事件只走一条 UI 更新路径。
3. 所有修改持久化元数据的操作必须串行且原子落盘。
4. Docker 构建上下文不得包含运行数据、备份、日志、测试材料或本机配置。
5. 删除代码前必须确认 HTML、Node 入口和仓库内均无调用者。
6. 生产容器升级必须显式执行，不由源码维护过程自动触发。

## 部署前注意事项

如果旧镜像曾被上传到公共镜像仓库，应把其中的 Roon 配对状态视为可能泄露：

1. 在 Roon 中停用旧扩展授权。
2. 使用清理后的源码重新构建并发布镜像。
3. 删除旧的 `config.json`，重新完成配对。
4. 不要复用曾被打入公开镜像的备份压缩包。

## 验收记录

实施完成后在本节记录具体命令、结果、未完成事项和生产升级步骤。

## 实施结果（2026-07-16）

### 代码收敛

- 后端拆为 `imageStore`、`zoneUtils`、`webRoutes` 三个职责单一模块；`app.js` 只保留配置、Roon 生命周期、控制和组装。
- Zone 删除同时兼容字符串 ID 和 Zone 对象；浏览器只使用服务端选择的活动 Zone。
- 封面写入按保存目录串行排队，图片和 `image_info.json` 使用临时文件加 rename 原子替换。
- 前端由多套 Socket/HTTP/Cookie 状态机收敛为一个 Socket.IO 状态机，同专辑切歌也更新曲目信息。
- 封面墙只在可见时加载和刷新；移除 Android 8 初始 WebView 不一定支持的 `Promise.allSettled` 和 `Promise.finally`。
- 图片代理增加参数校验、Core 未就绪和上游失败状态码；新增 `/api/health`。

### 清理结果

- 删除 18 个已确认无调用者的早期实现、调试脚本、备份页面、重复样式和被替代模块。
- 删除直接声明的 `body-parser`、服务端 `colorthief`、jQuery、js-cookie 和 Roon Browse 依赖（Express 自身仍会传递依赖 `body-parser`）。
- 历史 `OPTIMIZATION_PLAN.md` 已由本文件吸收并替代，避免两份清单继续冲突。

### Docker 与 Compose

- Dockerfile 改为 Node 20 Alpine 多阶段构建；Git 只存在于依赖阶段，运行阶段使用显式文件白名单。
- `.dockerignore` 排除 backup、配对配置、图片、日志、测试和文档。
- Compose 改为清晰的环境变量映射，增加 `init` 和停止宽限期，保留日志轮转。
- 实测确认 `devices: /dev/input:/dev/input` 不包含宿主机 `by-id`/`by-path` 符号链接，因此两个只读 volumes 必须保留；`group_add` 则由入口脚本动态 input 组逻辑替代。
- 新增 [`DOCKER.md`](DOCKER.md)，记录构建、持久化、健康检查、安全升级和回滚。

### 验收命令与结果

```text
npm test                 10/10 通过
npm run check            通过（全部自有活跃 JavaScript）
sh -n entrypoint.sh      通过
docker compose config    通过
docker build             通过
镜像内容白名单检查       通过
临时容器 HEALTHCHECK     healthy
```

- 最终构建上下文：约 55.46 KB。
- 新 review 镜像：146,884,255 bytes；原运行镜像：285,505,524 bytes，约减少 48.5%。
- 本地验收镜像标签：`roon-coverart:5.0.4-review`。
- 截至 2026-07-16 的源码维护阶段，运行容器仍为 5.0.3；实际升级结果见文末 2026-07-17 记录。

### 已知但未在本轮强行替换的上游项

- Roon 官方旧 Node API 依赖仍会在安装时提示 `node-uuid@1.4.8` deprecated。它属于上游依赖链，直接替换可能破坏 Roon 协议兼容性。
- 在宿主机 Node 22 执行测试时，`config` 依赖会提示旧 `util.is*` API deprecated；测试仍全部通过，生产镜像固定为 Node 20。
- 真实 Roon Core、实际显示屏/WebView 和物理键盘的端到端验收需要在显式升级生产容器后执行，步骤见 [`DOCKER.md`](DOCKER.md)。

## 后续升级检查表

1. 备份宿主机 `config.json`，确认 `images/` 可写。
2. 在维护窗口执行 `docker compose build`。
3. 执行 `docker compose up -d --no-deps coverart`，这是本轮没有自动执行的生产变更。
4. 用 `docker compose ps` 确认 `healthy`，再查看最近 100 行日志。
5. 在 Roon 扩展设置中确认配对和 Zone，验证播放、暂停、同专辑切歌、15 秒封面墙切换、触摸/媒体键和物理键盘。
6. 若旧镜像曾公开发布，撤销旧 Roon 扩展授权、删除旧配对文件并重新授权。

## 生产升级与在线测试（2026-07-17）

已按 [`DOCKER.md`](DOCKER.md) 的安全升级流程将运行容器从 `roon-coverart:5.0.3-local` 升级到 `roon-coverart:5.0.4-local`。

### 升级基线与保护

- 旧镜像 ID：`sha256:4c63789f002043555f1646fa22dde316a623ea9857c396e4f17a25fdf1ae85c2`
- 升级前 `config.json` SHA-256：`835c9fa3badf53f644670e922262977015ab277a1a0d386daa9cbbbbffa9f272`
- 临时回滚备份：`/tmp/roon-coverart-config.pre-5.0.4-20260717.json`
- 旧 5.0.3 镜像保留，可用于回滚；本次不需要回滚。

### 在线验收结果

```text
容器状态              running / healthy
镜像                  roon-coverart:5.0.4-local
镜像 ID               sha256:35b672bc55f9556f7a398bd5744d22bbe36fb3f02342b3d5760a01d505b4acd9
重启次数              0
OOM                    false
Roon 配对              true
活动 Zone              1 个，可用；测试时状态 paused
Socket.IO              pairStatus 与 zoneStatus 正常
主页                   200 text/html
新版前端               200 application/javascript
参数校验               无 image_key 返回 400 JSON
持久化封面列表         300 张
静态封面读取           200 image/jpeg，62,534 bytes
Roon 实时图片代理      200 image/jpeg，143,093 bytes
容器内存快照           23.61 MiB
```

- 升级后 `config.json` SHA-256 与升级前完全一致，Roon 自动恢复配对。
- 宿主机键盘通过 `/dev/input/by-path/platform-i8042-serio-0-event-kbd` 成功监听。
- 健康接口返回 `status=ok`、`paired=true`、`zoneAvailable=true`。
- 升级观察日志中 `ENOENT`、Buffer 展开、未捕获异常及错误模式计数均为 0。
- 当前生产容器已是 5.0.4；后续无需再执行文档中的首次升级命令。
