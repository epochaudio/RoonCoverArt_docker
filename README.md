# Roon Cover Art Docker (16:9 with Track Info)

中文 | English

这是 `Roon Cover Art` 的 **16:9 显示版本（Docker）**，适合电视、宽屏显示器等 16:9 屏幕。

与方形画框版本不同，本版本重点是：
- 16:9 画面布局
- 播放时显示封面 + 曲目信息（标题 / 艺术家 / 专辑）
- 停止播放后自动切换 Art Wall（封面墙）

This is the **16:9 Docker edition** of `Roon Cover Art`, designed for TVs and wide displays.

Compared with the square-frame version, this build focuses on:
- 16:9 layout
- Now playing cover art + track info (title / artist / album)
- Auto-switch to Art Wall mode when playback stops

## 中文说明

### 功能特点

- 实时显示当前播放专辑封面
- 显示曲目信息（标题 / 艺术家 / 专辑）
- 根据封面提取主色调作为背景氛围色
- 播放停止后约 15 秒自动切换到 Art Wall 模式
- Art Wall 每 60 秒刷新 3 张图片
- 支持键盘、媒体键和带视觉反馈的触摸手势控制（左滑下一曲、右滑上一曲、上滑停止、下滑播放）
- 支持 Docker 后端直接监听宿主机 `/dev/input` 键盘事件来控制 Roon（无需浏览器）
- 自动保存播放过的专辑封面到 `images/`
- Roon 配对信息持久化（通过 `config.json`，避免重启后重复授权）

### Docker 镜像

- `epochaudio/coverart_docker:5.0.3`
- `epochaudio/coverart_docker:latest`

### 快速安装（Docker Run）

1. 最简准备（默认参数即可运行）

```bash
mkdir -p images
printf '%s\n' '{}' > config.json
```

说明：
- `images/` 用于保存封面缓存（建议持久化）
- `config.json` 用于保存 Roon 配对信息（建议持久化，由 Roon 授权后写入）
- `config/local.json` 是可选项，不创建也能启动（使用默认参数）

2. 运行容器（默认参数 + 配对信息持久化）

```bash
docker pull epochaudio/coverart_docker:latest

docker run -d \
  --name roon-coverart \
  --network host \
  --restart unless-stopped \
  -v $(pwd)/images:/app/images \
  -v $(pwd)/config.json:/app/config.json:rw \
  epochaudio/coverart_docker:latest
```

3. 打开页面

- 默认地址：`http://localhost:3666`
- 如果从局域网其他设备访问，请将 `localhost` 替换为宿主机 IP。

### Docker Compose（推荐）

```yaml
services:
  coverart:
    build:
      context: .
    image: roon-coverart:5.0.3-local
    container_name: roon-coverart
    network_mode: "host"
    restart: unless-stopped
    environment:
      - INPUT_GID=${INPUT_GID:-}
      - KEYBOARD_ENABLED=${KEYBOARD_ENABLED:-false}
      - KEYBOARD_DEVICE=${KEYBOARD_DEVICE:-}
      - KEYBOARD_DEVICES=${KEYBOARD_DEVICES:-}
      - KEYBOARD_DEBOUNCE_MS=${KEYBOARD_DEBOUNCE_MS:-180}
    devices:
      - /dev/input:/dev/input
    group_add:
      - "${INPUT_GID:-0}"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    volumes:
      - ./images:/app/images:rw
      - ./config.json:/app/config.json:rw
      - /dev/input/by-id:/dev/input/by-id:ro
      - /dev/input/by-path:/dev/input/by-path:ro
      # 可选：先创建 config/local.json，再取消下一行注释
      # - ./config/local.json:/app/config/local.json:ro
```

启动：

```bash
docker compose up -d
```

打开页面：`http://localhost:3666`

### 可选：使用 `config/local.json` 固化参数

如果你需要固定端口、封面保存格式等参数，再创建 `config/local.json` 并挂载：

```bash
mkdir -p config
cat > config/local.json <<'EOF'
{
  "server": {
    "port": 3666
  },
  "artwork": {
    "saveDir": "./images",
    "autoSave": true,
    "format": "jpg"
  },
  "access": {
    "allowedOrigins": []
  },
  "keyboard": {
    "enabled": false,
    "device": "",
    "devices": [],
    "debounceMs": 180,
    "keyMap": {}
  },
  "logging": {
    "level": "info"
  }
}
EOF
```

Docker Run 增加挂载：

```bash
-v $(pwd)/config/local.json:/app/config/local.json:ro
```

Docker Compose 增加：

```yaml
      # - ./config/local.json:/app/config/local.json:ro
```

### 配置说明（建议写入 `config/local.json`）

- `server.port`: Web 服务端口（默认 `3666`）
- `artwork.saveDir`: 封面保存目录（默认 `./images`）
- `artwork.autoSave`: 是否自动保存封面（默认 `true`）
- `artwork.format`: 保存格式（`jpg` 或 `png`，默认 `jpg`）
- `access.allowedOrigins`: 可选跨域来源白名单；环境变量中多个来源用逗号分隔
- `logging.level`: 日志级别，支持 `error` / `warn` / `info` / `debug`，默认 `info`

也支持环境变量（Docker）：
- `SERVER_PORT`
- `ARTWORK_SAVEDIR`
- `ARTWORK_AUTOSAVE`
- `ARTWORK_FORMAT`
- `ACCESS_ALLOWED_ORIGINS`
- `KEYBOARD_ENABLED`
- `KEYBOARD_DEVICE`
- `KEYBOARD_DEVICES`
- `KEYBOARD_DEBOUNCE_MS`
- `LOG_LEVEL`

说明：
- 固定参数建议放在 `config/local.json`
- Roon 配对信息由 Roon 授权后写入根目录 `config.json`（请保留）

### 可选：启用宿主机键盘控制

如果键盘插在运行 Docker 的宿主机上，可以让容器直接读取 `/dev/input` 事件并控制 Roon。默认关闭，需要显式启用。

1. 查宿主机 `input` 组 GID：

```bash
getent group input
```

例如输出 `input:x:106:`，则创建 `.env`：

```env
INPUT_GID=106
KEYBOARD_ENABLED=true
KEYBOARD_DEVICE=
KEYBOARD_DEVICES=
KEYBOARD_DEBOUNCE_MS=180
```

默认不指定 `KEYBOARD_DEVICE` / `KEYBOARD_DEVICES`，程序会自动扫描并监听所有可识别的键盘事件设备，包括 `/dev/input/by-id/`、`/dev/input/by-path/` 和 `/proc/bus/input/devices` 中的键盘。也可以显式指定一个或多个稳定路径：

```env
KEYBOARD_DEVICE=/dev/input/by-id/your-keyboard-event-kbd
KEYBOARD_DEVICES=/dev/input/by-id/kbd1-event-kbd,/dev/input/by-id/kbd2-event-kbd
```

优先使用 `/dev/input/by-id/...-event-kbd` 或 `/dev/input/by-path/...-event-kbd`，不要优先使用 `/dev/input/event3` 这类编号，因为重启后编号可能变化。可用下面命令查看：

```bash
ls -l /dev/input/by-id/
ls -l /dev/input/by-path/
```

默认按键映射：

- `KEY_RIGHT` / `KEY_NEXTSONG`: 下一曲
- `KEY_LEFT` / `KEY_PREVIOUSSONG`: 上一曲
- `KEY_SPACE` / `KEY_PLAYPAUSE`: 播放/暂停
- `KEY_UP` / `KEY_PLAY`: 播放
- `KEY_DOWN` / `KEY_STOP` / `KEY_STOPCD`: 停止
- `KEY_PAUSE`: 暂停

如果没有发现键盘，或某个设备打开失败，只会输出 warning，不影响网页和 Roon 扩展启动。

### Roon 设置步骤

1. 打开 Roon
2. 进入 `Settings` -> `Extensions`
3. 启用扩展（显示名：`CoverArt_docker`）
4. 在扩展设置中选择播放区（Zone）
5. 开始播放音乐，网页将显示封面与曲目信息

### 持久化与权限注意事项

- `config.json` 必须持久化挂载，否则容器重建/重启后可能需要重新授权
- `images/` 需要可写权限，用于保存专辑封面
- `network_mode: "host"` 用于 Roon 发现，也会让 `3666` 端口暴露在宿主机网络上
- 不要把 `config.json`、`config/local.json`、`.env`、`images/` 提交到 GitHub

### 常用命令

```bash
docker logs -f roon-coverart
docker restart roon-coverart
docker ps -a --filter name=roon-coverart
```

### 源码构建（可选）

```bash
docker build -t roon-coverart:5.0.3-local .
```

---

## English

### Features

- Real-time now-playing album art display
- Track info display (title / artist / album)
- Dominant color extraction for ambient background
- Automatically switches to Art Wall mode about 15s after playback stops
- Art Wall refreshes 3 images every 60 seconds
- Keyboard, media-key, and visual touch gesture controls (swipe left for next, right for previous, up to stop, down to play)
- Optional Docker-side host keyboard control via `/dev/input` (no browser required)
- Auto-saves played album art to `images/`
- Persistent Roon pairing state via `config.json` (avoids re-authorization after restart)

### Docker Images

- `epochaudio/coverart_docker:5.0.3`
- `epochaudio/coverart_docker:latest`

### Quick Start (Docker Run)

1. Minimal setup (defaults work out of the box)

```bash
mkdir -p images
printf '%s\n' '{}' > config.json
```

Notes:
- `images/` stores cached/saved artwork (recommended to persist)
- `config.json` stores Roon pairing state (recommended to persist, written after Roon authorization)
- `config/local.json` is optional (defaults are used if missing)

2. Run the container (default settings + persistent pairing state)

```bash
docker pull epochaudio/coverart_docker:latest

docker run -d \
  --name roon-coverart \
  --network host \
  --restart unless-stopped \
  -v $(pwd)/images:/app/images \
  -v $(pwd)/config.json:/app/config.json:rw \
  epochaudio/coverart_docker:latest
```

3. Open the UI

- Default URL: `http://localhost:3666`
- For LAN access from another device, replace `localhost` with the host IP address.

### Docker Compose (Recommended)

```yaml
services:
  coverart:
    build:
      context: .
    image: roon-coverart:5.0.3-local
    container_name: roon-coverart
    network_mode: "host"
    restart: unless-stopped
    environment:
      - INPUT_GID=${INPUT_GID:-}
      - KEYBOARD_ENABLED=${KEYBOARD_ENABLED:-false}
      - KEYBOARD_DEVICE=${KEYBOARD_DEVICE:-}
      - KEYBOARD_DEVICES=${KEYBOARD_DEVICES:-}
      - KEYBOARD_DEBOUNCE_MS=${KEYBOARD_DEBOUNCE_MS:-180}
    devices:
      - /dev/input:/dev/input
    group_add:
      - "${INPUT_GID:-0}"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    volumes:
      - ./images:/app/images:rw
      - ./config.json:/app/config.json:rw
      - /dev/input/by-id:/dev/input/by-id:ro
      - /dev/input/by-path:/dev/input/by-path:ro
      # Optional: create config/local.json first, then uncomment this mount.
      # - ./config/local.json:/app/config/local.json:ro
```

Start:

```bash
docker compose up -d
```

Open the UI: `http://localhost:3666`

### Optional: Persist fixed settings in `config/local.json`

If you want to pin the port or artwork settings, create `config/local.json` and mount it:

```bash
mkdir -p config
cat > config/local.json <<'EOF'
{
  "server": {
    "port": 3666
  },
  "artwork": {
    "saveDir": "./images",
    "autoSave": true,
    "format": "jpg"
  },
  "access": {
    "allowedOrigins": []
  },
  "keyboard": {
    "enabled": false,
    "device": "",
    "devices": [],
    "debounceMs": 180,
    "keyMap": {}
  },
  "logging": {
    "level": "info"
  }
}
EOF
```

Add this mount to Docker Run:

```bash
-v $(pwd)/config/local.json:/app/config/local.json:ro
```

Add this line to Docker Compose:

```yaml
      # - ./config/local.json:/app/config/local.json:ro
```

### Configuration (Recommended in `config/local.json`)

- `server.port`: Web server port (default `3666`)
- `artwork.saveDir`: Artwork save directory (default `./images`)
- `artwork.autoSave`: Enable auto-save (default `true`)
- `artwork.format`: Save format (`jpg` or `png`, default `jpg`)
- `access.allowedOrigins`: Optional CORS origin allowlist; comma-separated when set by env var
- `logging.level`: Log level, one of `error` / `warn` / `info` / `debug`, default `info`

Environment variables are also supported:
- `SERVER_PORT`
- `ARTWORK_SAVEDIR`
- `ARTWORK_AUTOSAVE`
- `ARTWORK_FORMAT`
- `ACCESS_ALLOWED_ORIGINS`
- `KEYBOARD_ENABLED`
- `KEYBOARD_DEVICE`
- `KEYBOARD_DEVICES`
- `KEYBOARD_DEBOUNCE_MS`
- `LOG_LEVEL`

Notes:
- Put stable parameters in `config/local.json`
- Keep root `config.json` for Roon pairing state written after Roon authorization

### Optional: Host Keyboard Control

If the keyboard is attached to the Docker host, the container can read `/dev/input` events and control Roon directly. This is disabled by default.

1. Find the host `input` group GID:

```bash
getent group input
```

If the output is `input:x:106:`, create `.env` like this:

```env
INPUT_GID=106
KEYBOARD_ENABLED=true
KEYBOARD_DEVICE=
KEYBOARD_DEVICES=
KEYBOARD_DEBOUNCE_MS=180
```

By default, leave `KEYBOARD_DEVICE` / `KEYBOARD_DEVICES` empty. The app scans and listens to all detected keyboard event devices from `/dev/input/by-id/`, `/dev/input/by-path/`, and `/proc/bus/input/devices`. You can also pin one or more stable paths:

```env
KEYBOARD_DEVICE=/dev/input/by-id/your-keyboard-event-kbd
KEYBOARD_DEVICES=/dev/input/by-id/kbd1-event-kbd,/dev/input/by-id/kbd2-event-kbd
```

Prefer `/dev/input/by-id/...-event-kbd` or `/dev/input/by-path/...-event-kbd` over `/dev/input/event3`, because event numbers can change after reboot:

```bash
ls -l /dev/input/by-id/
ls -l /dev/input/by-path/
```

Default key mapping:

- `KEY_RIGHT` / `KEY_NEXTSONG`: next
- `KEY_LEFT` / `KEY_PREVIOUSSONG`: previous
- `KEY_SPACE` / `KEY_PLAYPAUSE`: play/pause
- `KEY_UP` / `KEY_PLAY`: play
- `KEY_DOWN` / `KEY_STOP` / `KEY_STOPCD`: stop
- `KEY_PAUSE`: pause

If no keyboard is detected, or one device fails to open, the app only logs a warning and does not stop the web UI or Roon extension.

### Roon Setup

1. Open Roon
2. Go to `Settings` -> `Extensions`
3. Enable the extension (`CoverArt_docker`)
4. Select the playback zone in extension settings
5. Start playing music and open the web page

### Persistence & Permissions

- Persist `config.json`, or you may need to re-authorize after container recreation/restart
- `images/` must be writable so artwork can be saved
- `network_mode: "host"` is used for Roon discovery and exposes port `3666` on the host network
- Do not commit `config.json`, `config/local.json`, `.env`, or `images/` to GitHub

### Useful Commands

```bash
docker logs -f roon-coverart
docker restart roon-coverart
docker ps -a --filter name=roon-coverart
```

### Build From Source (Optional)

```bash
docker build -t roon-coverart:5.0.3-local .
```

## License

MIT (see `package.json`)
