"use strict";

const GRID_UPDATE_INTERVAL = 60000;
const IMAGES_TO_UPDATE = 3;
const PLAYBACK_SWITCH_DELAY = 15000;
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity
});

let activeZoneId = null;
let currentImageKey = null;
let playbackSwitchPending = false;

class TimerManager {
  constructor() {
    this.timers = new Map();
  }

  set(name, callback, delay, interval) {
    this.clear(name);
    const timer = interval ? setInterval(callback, delay) : setTimeout(callback, delay);
    this.timers.set(name, { timer, interval: !!interval });
    return timer;
  }

  clear(name) {
    const entry = this.timers.get(name);
    if (!entry) return;
    if (entry.interval) clearInterval(entry.timer);
    else clearTimeout(entry.timer);
    this.timers.delete(name);
  }

  clearAll() {
    Array.from(this.timers.keys()).forEach(name => this.clear(name));
  }
}

class ImageLoader {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    this.cache = new Map();
    this.pending = new Map();
    this.lastAccess = new Map();
  }

  load(url) {
    this.lastAccess.set(url, Date.now());
    if (this.cache.has(url)) return Promise.resolve(this.cache.get(url));
    if (this.pending.has(url)) return this.pending.get(url);

    const request = new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => {
        image.src = "";
        reject(new Error("图片加载超时: " + url));
      }, 10000);

      image.onload = () => {
        clearTimeout(timeout);
        this.cache.set(url, image);
        this.trim();
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("图片加载失败: " + url));
      };
      image.src = url;
    }).then(
      image => {
        this.pending.delete(url);
        return image;
      },
      error => {
        this.pending.delete(url);
        throw error;
      }
    );

    this.pending.set(url, request);
    return request;
  }

  preload(urls) {
    return Promise.all(urls.map(url => this.load(url).catch(() => null)));
  }

  trim() {
    const urls = Array.from(this.lastAccess.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(this.maxEntries)
      .map(entry => entry[0]);

    urls.forEach(url => {
      const image = this.cache.get(url);
      if (image) image.src = "";
      this.cache.delete(url);
      this.lastAccess.delete(url);
    });
  }

  destroy() {
    this.cache.forEach(image => { image.src = ""; });
    this.cache.clear();
    this.pending.clear();
    this.lastAccess.clear();
  }
}

const timers = new TimerManager();
const imageLoader = new ImageLoader(30);

function getThreeLineValue(nowPlaying, lineName) {
  return nowPlaying && nowPlaying.three_line && nowPlaying.three_line[lineName]
    ? nowPlaying.three_line[lineName]
    : "";
}

function getAlbumName(nowPlaying) {
  return getThreeLineValue(nowPlaying, "line3") || (nowPlaying && nowPlaying.album) || "";
}

function imageUrlForFile(filename) {
  return "/images/" + encodeURIComponent(filename);
}

function isGridVisible() {
  const gridWrapper = document.querySelector(".grid-wrapper");
  return !!gridWrapper && !gridWrapper.classList.contains("hidden");
}

function toggleDisplayMode(isPlaying) {
  const playingContainer = document.querySelector(".playing-mode");
  const gridWrapper = document.querySelector(".grid-wrapper");
  if (!playingContainer || !gridWrapper) return;
  if (isPlaying) {
    timers.clear("gridUpdate");
    timers.clear("gridRecovery");
  }
  playingContainer.classList.toggle("hidden", !isPlaying);
  gridWrapper.classList.toggle("hidden", isPlaying);
}

async function fetchImageList() {
  const response = await fetch("/api/images");
  if (!response.ok) throw new Error("获取图片列表失败: " + response.status);
  return response.json();
}

function shuffled(values) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

async function initializeGridDisplay() {
  timers.clear("gridUpdate");
  try {
    const images = await fetchImageList();
    const gridItems = Array.from(document.querySelectorAll(".grid-item"));
    if (images.length === 0) return;

    const selected = [];
    while (selected.length < gridItems.length) {
      selected.push(...shuffled(images));
    }

    await Promise.all(gridItems.map(async (item, index) => {
      const image = item.querySelector("img");
      if (!image) return;
      try {
        image.src = (await imageLoader.load(imageUrlForFile(selected[index]))).src;
      } catch (error) {
        console.warn(error.message);
        image.src = "/img/transparent.png";
      }
    }));

    if (isGridVisible()) {
      timers.set("gridUpdate", updateRandomImages, GRID_UPDATE_INTERVAL, true);
    }
  } catch (error) {
    console.error("初始化封面墙失败:", error);
    if (isGridVisible()) {
      timers.set("gridRecovery", initializeGridDisplay, 5000, false);
    }
  }
}

async function updateRandomImages() {
  try {
    const images = await fetchImageList();
    const gridItems = Array.from(document.querySelectorAll(".grid-item"));
    if (images.length === 0 || gridItems.length === 0) return;

    const positions = shuffled(gridItems.map((item, index) => index)).slice(0, IMAGES_TO_UPDATE);
    const currentNames = new Set(gridItems.map(item => {
      const image = item.querySelector("img");
      return image ? decodeURIComponent(image.src.split("/").pop()) : "";
    }));
    const candidates = shuffled(images.filter(name => !currentNames.has(name)));
    const usable = candidates.length > 0 ? candidates : shuffled(images);
    const urls = positions.map((position, index) => imageUrlForFile(usable[index % usable.length]));
    await imageLoader.preload(urls);

    positions.forEach((position, index) => {
      const item = gridItems[position];
      const image = item.querySelector("img");
      const cached = imageLoader.cache.get(urls[index]);
      if (!image || !cached) return;
      item.classList.add("updating");
      timers.set("gridFade" + position, () => {
        image.src = cached.src;
        item.classList.remove("updating");
      }, 500, false);
    });
  } catch (error) {
    console.error("更新封面墙失败:", error);
  }
}

function applyDominantColor(image) {
  try {
    const dominantColor = new ColorThief().getColor(image);
    const background = document.getElementById("colorBackground");
    if (background) {
      background.style.background = `rgba(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]}, 0.19)`;
    }
  } catch (error) {
    console.warn("提取封面颜色失败:", error.message);
  }
}

function updateArtwork(imageKey, albumName) {
  const cover = document.getElementById("coverImage");
  if (!cover) return;
  if (!imageKey) {
    cover.src = "/img/transparent.png";
    return;
  }

  cover.onload = () => applyDominantColor(cover);
  cover.onerror = () => console.warn("当前封面加载失败:", imageKey);
  cover.src = "/roonapi/getImage?image_key=" + encodeURIComponent(imageKey)
    + "&albumName=" + encodeURIComponent(albumName || "");
}

function updateTrackInfo(nowPlaying) {
  const values = {
    trackText: getThreeLineValue(nowPlaying, "line1"),
    artistText: getThreeLineValue(nowPlaying, "line2"),
    albumText: getAlbumName(nowPlaying)
  };

  Object.keys(values).forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = values[id];
  });

  if (window.ResponsiveFonts) window.ResponsiveFonts.applyResponsiveFonts();
}

function updateMediaSession(nowPlaying) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: getThreeLineValue(nowPlaying, "line1") || "未知曲目",
      artist: getThreeLineValue(nowPlaying, "line2") || "未知艺术家",
      album: getAlbumName(nowPlaying) || "未知专辑",
      artwork: nowPlaying.image_key ? [{
        src: "/roonapi/getImage?image_key=" + encodeURIComponent(nowPlaying.image_key),
        sizes: "512x512"
      }] : []
    });
  } catch (error) {
    console.warn("更新媒体会话失败:", error.message);
  }
}

function cancelPlaybackSwitch() {
  timers.clear("playbackSwitch");
  playbackSwitchPending = false;
}

function schedulePlaybackSwitch() {
  if (playbackSwitchPending) return;
  playbackSwitchPending = true;
  timers.set("playbackSwitch", async () => {
    playbackSwitchPending = false;
    toggleDisplayMode(false);
    await initializeGridDisplay();
  }, PLAYBACK_SWITCH_DELAY, false);
}

function handleZoneStatus(zones) {
  if (!Array.isArray(zones) || zones.length === 0) {
    activeZoneId = null;
    schedulePlaybackSwitch();
    return;
  }

  const zone = zones[0];
  activeZoneId = zone.zone_id || null;
  if (zone.state !== "playing" || !zone.now_playing) {
    schedulePlaybackSwitch();
    return;
  }

  cancelPlaybackSwitch();
  toggleDisplayMode(true);
  updateTrackInfo(zone.now_playing);
  updateMediaSession(zone.now_playing);

  if (zone.now_playing.image_key !== currentImageKey) {
    currentImageKey = zone.now_playing.image_key;
    updateArtwork(currentImageKey, getAlbumName(zone.now_playing));
  }
}

function emitControl(eventName) {
  if (!activeZoneId) return false;
  socket.emit(eventName);
  return true;
}

function setupKeyboardControls() {
  const controls = {
    Space: "goPlayPause",
    ArrowLeft: "goPrev",
    ArrowRight: "goNext",
    KeyP: "goPlay",
    Escape: "goStop",
    MediaPlayPause: "goPlayPause",
    MediaTrackNext: "goNext",
    MediaTrackPrevious: "goPrev",
    MediaStop: "goStop"
  };

  document.addEventListener("keydown", event => {
    const control = controls[event.code];
    if (!control) return;
    event.preventDefault();
    emitControl(control);
  });
}

function feedbackLayer() {
  return document.getElementById("gestureFeedback");
}

function removeFeedback(node, delay) {
  timers.set("feedback" + Math.random(), () => node.remove(), delay, false);
}

function showTouchRipple(x, y) {
  const layer = feedbackLayer();
  if (!layer) return;
  const ripple = document.createElement("div");
  ripple.className = "gesture-ripple";
  ripple.style.left = x + "px";
  ripple.style.top = y + "px";
  layer.appendChild(ripple);
  removeFeedback(ripple, 620);
}

function showGestureCue(action) {
  const layer = feedbackLayer();
  if (!layer) return;
  const icons = { next: "›", prev: "‹", stop: "■", play: "▶" };
  const flash = document.createElement("div");
  flash.className = "gesture-flash " + action;
  const cue = document.createElement("div");
  cue.className = "gesture-cue " + action;
  cue.textContent = icons[action] || "";
  layer.append(flash, cue);
  removeFeedback(flash, 420);
  removeFeedback(cue, 820);
  if (navigator.vibrate) navigator.vibrate(20);
}

function setupGestureControls() {
  let start = null;
  document.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) {
      start = null;
      return;
    }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, false);

  document.addEventListener("touchend", event => {
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    start = null;
    showTouchRipple(touch.clientX, touch.clientY);
    if (elapsed > 1200 || Math.max(Math.abs(dx), Math.abs(dy)) < 60) return;

    let eventName;
    let action;
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      eventName = dx < 0 ? "goNext" : "goPrev";
      action = dx < 0 ? "next" : "prev";
    } else if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      eventName = dy < 0 ? "goStop" : "goPlay";
      action = dy < 0 ? "stop" : "play";
    }

    if (eventName && emitControl(eventName)) {
      showGestureCue(action);
      event.preventDefault();
    }
  }, false);
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const handlers = {
    play: "goPlay",
    pause: "goPause",
    previoustrack: "goPrev",
    nexttrack: "goNext",
    stop: "goStop"
  };
  Object.keys(handlers).forEach(action => {
    try {
      navigator.mediaSession.setActionHandler(action, () => emitControl(handlers[action]));
    } catch (error) {
      console.debug("浏览器不支持媒体动作:", action);
    }
  });
}

socket.on("connect_error", error => console.warn("Socket.IO连接失败:", error.message));
socket.on("pairStatus", payload => {
  const pairDisabled = document.getElementById("pairDisabled");
  const paired = !!(payload && payload.pairEnabled);
  if (pairDisabled) pairDisabled.style.display = paired ? "none" : "flex";
});
socket.on("zoneStatus", handleZoneStatus);
socket.on("serverError", payload => console.warn("服务端控制失败:", payload && payload.error));

document.addEventListener("DOMContentLoaded", () => {
  setupKeyboardControls();
  setupGestureControls();
  setupMediaSession();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) timers.clear("gridUpdate");
    else if (isGridVisible()) initializeGridDisplay();
  });
});

window.addEventListener("beforeunload", () => {
  timers.clearAll();
  imageLoader.destroy();
  socket.disconnect();
});
