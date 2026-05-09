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

- `epochaudio/coverart_docker:5.0.4`
- `epochaudio/coverart_docker:latest`

### 5.0.4 更新

- 新增宿主机物理音量键控制：`KEY_VOLUMEUP`、`KEY_VOLUMEDOWN`、`KEY_MUTE`
- 新增 `KEYBOARD_VOLUME_STEP` / `keyboard.volumeStep`，默认每次调整 `5` 个 Roon volume step
- `latest` 已更新到 `5.0.4`

### 安装方式选择

OpenWrt / EpochBrain 系统推荐直接使用系统内置安装脚本：

```bash
install_coverart.sh
```

脚本默认行为：

- 容器名：`roon-coverart`
- 镜像：`epochaudio/coverart_docker:latest`
- 数据目录：`/cache/roon-coverart_data`
- Web 端口：`3666`
- 默认启用宿主机键盘监听：`KEYBOARD_ENABLED=true`
- 挂载 `/dev/input`，并在 Docker 支持时加入 `--device-cgroup-rule 'c 13:* rwm'`

键盘不需要在安装脚本里做强判断。没有键盘或没有可用设备时，Cover Art 主服务仍会正常启动；后续插入键盘后，执行：

```bash
docker restart roon-coverart
```

如果不需要宿主机键盘控制：

```bash
KEYBOARD_ENABLED=false install_coverart.sh
```

如果需要固定某个键盘设备：

```bash
KEYBOARD_DEVICE=/dev/input/by-id/your-keyboard-event-kbd install_coverart.sh
```

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

2. 运行容器（配对信息持久化 + 默认启用宿主机键盘监听）

```bash
docker pull epochaudio/coverart_docker:latest

docker run -d \
  --name roon-coverart \
  --network host \
  --restart unless-stopped \
  --device /dev/input:/dev/input \
  --device-cgroup-rule 'c 13:* rwm' \
  -e KEYBOARD_ENABLED=true \
  -e KEYBOARD_DEVICE= \
  -e KEYBOARD_DEVICES= \
  -e KEYBOARD_DEBOUNCE_MS=180 \
  -e KEYBOARD_VOLUME_STEP=5 \
  -v $(pwd)/images:/app/images \
  -v $(pwd)/config.json:/app/config.json:rw \
  -v /dev/input/by-id:/dev/input/by-id:ro \
  -v /dev/input/by-path:/dev/input/by-path:ro \
  epochaudio/coverart_docker:latest
```

如果宿主机没有 `/dev/input/by-id` 或 `/dev/input/by-path`，删除对应 `-v` 行即可。如果 Docker 不支持 `--device-cgroup-rule`，删除该行即可；键盘已在容器启动前插好时，普通 `/dev/input` 挂载通常已经足够。

3. 打开页面

- 默认地址：`http://localhost:3666`
- 如果从局域网其他设备访问，请将 `localhost` 替换为宿主机 IP。

### Docker Compose（推荐）

```yaml
services:
  coverart:
    build:
      context: .
    image: roon-coverart:5.0.4-local
    container_name: roon-coverart
    network_mode: "host"
    restart: unless-stopped
    environment:
      - INPUT_GID=${INPUT_GID:-}
      - KEYBOARD_ENABLED=${KEYBOARD_ENABLED:-true}
      - KEYBOARD_DEVICE=${KEYBOARD_DEVICE:-}
      - KEYBOARD_DEVICES=${KEYBOARD_DEVICES:-}
      - KEYBOARD_DEBOUNCE_MS=${KEYBOARD_DEBOUNCE_MS:-180}
      - KEYBOARD_VOLUME_STEP=${KEYBOARD_VOLUME_STEP:-5}
    devices:
      - /dev/input:/dev/input
    device_cgroup_rules:
      - "c 13:* rwm"
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
    "enabled": true,
    "device": "",
    "devices": [],
    "debounceMs": 180,
    "volumeStep": 5,
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
- `keyboard.enabled`: 是否启用宿主机键盘监听（安装脚本和 compose 默认通过环境变量启用）
- `keyboard.device`: 固定一个键盘设备路径，例如 `/dev/input/by-id/...-event-kbd`
- `keyboard.devices`: 固定多个键盘设备路径
- `keyboard.debounceMs`: 按键防抖时间，默认 `180`
- `keyboard.volumeStep`: 音量键每次调整的 Roon relative_step 步数，默认 `5`
- `keyboard.keyMap`: 自定义按键到控制动作的映射
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
- `KEYBOARD_VOLUME_STEP`
- `LOG_LEVEL`

说明：
- 固定参数建议放在 `config/local.json`
- Roon 配对信息由 Roon 授权后写入根目录 `config.json`（请保留）

### 可选：启用宿主机键盘控制

如果键盘插在运行 Docker 的宿主机上，可以让容器直接读取 `/dev/input` 事件并控制 Roon。推荐安装脚本和本仓库 `docker-compose.yml` 默认启用 `KEYBOARD_ENABLED=true`。如果启动时没有键盘，应用只会记录 warning，不影响网页和 Roon 扩展启动。

普通 Linux 主机建议查宿主机 `input` 组 GID：

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
KEYBOARD_VOLUME_STEP=5
```

OpenWrt 常见情况是 `/dev/input/event*` 为 `root:root 600`，系统安装脚本会用容器运行参数处理读取权限；如果你手写 `docker run`，可以参考上面的 Docker Run 示例。

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
- `KEY_VOLUMEUP`: 音量增加
- `KEY_VOLUMEDOWN`: 音量降低
- `KEY_MUTE`: 静音/取消静音

如果没有发现键盘，或某个设备打开失败，只会输出 warning，不影响网页和 Roon 扩展启动。

键盘扫描发生在容器启动时，不会一直轮询新设备。典型场景：

- 启动前已插键盘：容器启动后直接监听
- 启动后才插键盘：执行 `docker restart roon-coverart`
- 拔掉后重新插入：如果 event 编号变化，执行 `docker restart roon-coverart`
- 多个输入设备：优先用 `KEYBOARD_DEVICE` 或 `KEYBOARD_DEVICES` 指定 `/dev/input/by-id/...` 稳定路径

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
docker build -t roon-coverart:5.0.4-local .
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

- `epochaudio/coverart_docker:5.0.4`
- `epochaudio/coverart_docker:latest`

### 5.0.4 Changes

- Added host physical volume-key controls: `KEY_VOLUMEUP`, `KEY_VOLUMEDOWN`, and `KEY_MUTE`
- Added `KEYBOARD_VOLUME_STEP` / `keyboard.volumeStep`, defaulting to `5` Roon volume steps per key press
- Updated `latest` to `5.0.4`

### Installation Options

On OpenWrt / EpochBrain systems, use the built-in installer:

```bash
install_coverart.sh
```

Defaults:

- Container: `roon-coverart`
- Image: `epochaudio/coverart_docker:latest`
- Data directory: `/cache/roon-coverart_data`
- Web port: `3666`
- Host keyboard listening enabled with `KEYBOARD_ENABLED=true`
- Mounts `/dev/input` and adds `--device-cgroup-rule 'c 13:* rwm'` when Docker supports it

If no keyboard is attached, the web UI and Roon extension still start. Plug in a keyboard later, then run:

```bash
docker restart roon-coverart
```

Disable host keyboard control:

```bash
KEYBOARD_ENABLED=false install_coverart.sh
```

Pin one keyboard device:

```bash
KEYBOARD_DEVICE=/dev/input/by-id/your-keyboard-event-kbd install_coverart.sh
```

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

2. Run the container (persistent pairing state + host keyboard enabled by default)

```bash
docker pull epochaudio/coverart_docker:latest

docker run -d \
  --name roon-coverart \
  --network host \
  --restart unless-stopped \
  --device /dev/input:/dev/input \
  --device-cgroup-rule 'c 13:* rwm' \
  -e KEYBOARD_ENABLED=true \
  -e KEYBOARD_DEVICE= \
  -e KEYBOARD_DEVICES= \
  -e KEYBOARD_DEBOUNCE_MS=180 \
  -e KEYBOARD_VOLUME_STEP=5 \
  -v $(pwd)/images:/app/images \
  -v $(pwd)/config.json:/app/config.json:rw \
  -v /dev/input/by-id:/dev/input/by-id:ro \
  -v /dev/input/by-path:/dev/input/by-path:ro \
  epochaudio/coverart_docker:latest
```

If `/dev/input/by-id` or `/dev/input/by-path` does not exist on the host, remove the matching `-v` line. If Docker does not support `--device-cgroup-rule`, remove that line; mounting `/dev/input` is usually enough when the keyboard is attached before container startup.

3. Open the UI

- Default URL: `http://localhost:3666`
- For LAN access from another device, replace `localhost` with the host IP address.

### Docker Compose (Recommended)

```yaml
services:
  coverart:
    build:
      context: .
    image: roon-coverart:5.0.4-local
    container_name: roon-coverart
    network_mode: "host"
    restart: unless-stopped
    environment:
      - INPUT_GID=${INPUT_GID:-}
      - KEYBOARD_ENABLED=${KEYBOARD_ENABLED:-true}
      - KEYBOARD_DEVICE=${KEYBOARD_DEVICE:-}
      - KEYBOARD_DEVICES=${KEYBOARD_DEVICES:-}
      - KEYBOARD_DEBOUNCE_MS=${KEYBOARD_DEBOUNCE_MS:-180}
      - KEYBOARD_VOLUME_STEP=${KEYBOARD_VOLUME_STEP:-5}
    devices:
      - /dev/input:/dev/input
    device_cgroup_rules:
      - "c 13:* rwm"
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
    "enabled": true,
    "device": "",
    "devices": [],
    "debounceMs": 180,
    "volumeStep": 5,
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
- `keyboard.enabled`: Enable host keyboard listening; the installer and compose enable it through env vars by default
- `keyboard.device`: Pin one keyboard device path, for example `/dev/input/by-id/...-event-kbd`
- `keyboard.devices`: Pin multiple keyboard device paths
- `keyboard.debounceMs`: Key debounce time, default `180`
- `keyboard.volumeStep`: Roon relative_step count for each volume key press, default `5`
- `keyboard.keyMap`: Custom key-to-action mapping
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
- `KEYBOARD_VOLUME_STEP`
- `LOG_LEVEL`

Notes:
- Put stable parameters in `config/local.json`
- Keep root `config.json` for Roon pairing state written after Roon authorization

### Optional: Host Keyboard Control

If the keyboard is attached to the Docker host, the container can read `/dev/input` events and control Roon directly. The OpenWrt installer and this repository's `docker-compose.yml` enable it by default with `KEYBOARD_ENABLED=true`. If no keyboard is detected, the app logs a warning and the web UI/Roon extension keep running.

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
KEYBOARD_VOLUME_STEP=5
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
- `KEY_VOLUMEUP`: volume up
- `KEY_VOLUMEDOWN`: volume down
- `KEY_MUTE`: mute/unmute

If no keyboard is detected, or one device fails to open, the app only logs a warning and does not stop the web UI or Roon extension.

Keyboard devices are scanned at container startup; the app does not continuously poll for newly attached devices. Typical cases:

- Keyboard attached before startup: it is listened to immediately
- Keyboard attached after startup: run `docker restart roon-coverart`
- Keyboard unplugged and replugged: restart the container if the event number changes
- Multiple input devices: prefer `KEYBOARD_DEVICE` or `KEYBOARD_DEVICES` with stable `/dev/input/by-id/...` paths

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
docker build -t roon-coverart:5.0.4-local .
```

## License

MIT (see `package.json`)
