# Docker 构建与 Compose 维护说明

本文档说明本仓库 `Dockerfile`、`.dockerignore` 和 `docker-compose.yml` 的设计约束、验证方法与安全升级流程。代码评审和修复记录见 [`MAINTENANCE.md`](MAINTENANCE.md)。

## Dockerfile 设计

镜像使用 Node 20 Alpine 多阶段构建：

1. `dependencies` 阶段安装 Git，并通过 `npm ci --omit=dev` 安装生产依赖。Roon Node API 来自 GitHub，因此构建阶段需要 Git。
2. `runtime` 阶段只安装 `su-exec`，不包含 Git、测试代码或整个源码构建上下文。
3. 应用文件采用 `COPY` 白名单：只复制入口、配置模板、前端、后端工具模块及依赖。
4. `entrypoint.sh` 先以 root 修复挂载路径权限、按需配置宿主机 input 组，然后用 `su-exec` 降权为 `node` 用户运行应用。
5. Docker 健康检查请求容器内的 `/api/health`；端口遵循 `SERVER_PORT`，默认 `3666`。

`.dockerignore` 还会排除 `backup/`、`config.json`、`config/local.json`、`images/`、日志、测试和文档。即使忽略规则以后被误改，Dockerfile 的复制白名单仍是第二道保护，避免 Roon 配对状态和历史封面进入镜像。

## 持久化路径

运行时只有两个必须持久化的可写路径：

- `/app/config.json`：Roon 配对状态；丢失后通常需要重新授权。
- `/app/images`：自动保存的封面和 `image_info.json`。

可选的 `/app/config/local.json` 应以只读方式挂载。不要把上述本机文件提交到 Git，也不要放入公开镜像。

首次运行前：

```bash
mkdir -p images
printf '%s\n' '{}' > config.json
```

## Compose 设计

`docker-compose.yml` 默认从当前已评审源码构建 `roon-coverart:5.0.4-local`。

- 使用 `network_mode: host`，因为 Roon Core 发现依赖局域网 multicast；因此不再配置 `ports`。
- `devices` 中的 `/dev/input` 映射提供 `event*` 设备节点；Docker 不会随之带入符号链接目录，因此 `by-id` 和 `by-path` 仍需分别只读挂载。
- `INPUT_GID` 由入口脚本动态加入 `node` 用户，不再同时使用 Compose `group_add`。
- 日志轮转限制为 `10m × 3`。
- `init: true` 用于可靠回收子进程和转发停止信号。
- 镜像内置健康检查，`docker compose ps` 会显示 `starting`、`healthy` 或 `unhealthy`。

如果不需要宿主机物理键盘：

1. 设置 `KEYBOARD_ENABLED=false`。
2. 从自己的 Compose 覆盖文件中移除 `devices`、`device_cgroup_rules` 以及两个 `/dev/input/by-*` volumes。

如果需要键盘，建议在 `.env` 中配置：

```env
INPUT_GID=106
KEYBOARD_ENABLED=true
KEYBOARD_DEVICE=
KEYBOARD_DEVICES=
KEYBOARD_DEBOUNCE_MS=180
KEYBOARD_VOLUME_STEP=5
```

`INPUT_GID` 可用 `getent group input` 查询。OpenWrt 等系统的权限模型可能不同，应以实际 `/dev/input/event*` 所有者和权限为准。

## 构建前验证

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
sh -n entrypoint.sh
docker compose config
docker compose build
```

构建后检查镜像没有本地敏感数据：

```bash
docker run --rm --entrypoint sh roon-coverart:5.0.4-local -c \
  'test ! -e /app/backup && test ! -e /app/test && test "$(cat /app/config.json)" = "{}"'
```

## 安全升级当前容器

构建和测试不会影响正在运行的容器。确认维护窗口后再显式部署：

```bash
docker compose build
docker compose up -d --no-deps coverart
docker compose ps
docker compose logs --tail=100 coverart
```

升级前先备份宿主机上的 `config.json`。若新容器异常，恢复上一镜像标签并重新执行 `docker compose up -d --no-deps coverart`。不要直接删除 `images/` 或 `config.json`。

## 发布镜像

发布时使用不可变版本标签，不要只依赖 `latest`：

```bash
docker build -t your-registry/roon-coverart:5.0.4 .
docker push your-registry/roon-coverart:5.0.4
```

发布前应确认构建上下文没有本机配对数据，并按上面的镜像内容检查再次验证。
