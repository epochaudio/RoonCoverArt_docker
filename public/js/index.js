"use strict";

// 全局变量和常量定义
function getUrlParameter(name) {
    const query = window.location.search ? window.location.search.substring(1).split('&') : [];
    for (let i = 0; i < query.length; i++) {
        const parts = query[i].split('=');
        if (decodeURIComponent(parts[0] || '') === name) {
            return decodeURIComponent((parts[1] || '').replace(/\+/g, ' '));
        }
    }
    return '';
}

function getSocketAccessToken() {
    const urlToken = getUrlParameter('token');
    if (urlToken) {
        try {
            localStorage.setItem('coverartToken', urlToken);
        } catch (error) {
            console.warn('保存访问令牌失败:', error);
        }
        return urlToken;
    }

    try {
        return localStorage.getItem('coverartToken') || '';
    } catch (error) {
        return '';
    }
}

const socketOptions = {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
};
const socketAccessToken = getSocketAccessToken();
if (socketAccessToken) {
    socketOptions.query = {
        token: socketAccessToken
    };
}
const socket = io(socketOptions);
let currentImageKey = null;
let mouseTimer;
const imageCache = new Map();  // 图片缓存池
const maxPoolSize = 50;       // 最大缓存数量 (增加以支持15个网格)
const IMAGE_TIMEOUT = 10000;  // 图片加载超时时间（10秒）
let updateInterval = null;
let playbackTimer = null;
let isPlaybackTimerActive = false;  // 添加定时器状态追踪
const GRID_UPDATE_INTERVAL = 60000; // 60秒更新周期
const IMAGES_TO_UPDATE = 3; // 每次更新3张图片

// 设置相关
const settings = {
  theme: readCookie("settings['theme']") || 'dark',
  zoneID: readCookie("settings['zoneID']") || null
};

// 样式相关
const css = {
  backgroundColor: '#232629',
  foregroundColor: '#eff0f1',
  colorBackground: '#000000'
};

// 定时器管理类
class TimerManager {
    constructor() {
        this.timers = new Map();
        this.debounceTimers = new Map();
        this.animationFrames = new Map();
        this.timerStates = new Map();
    }

    // 设置定时器
    setTimer(name, callback, delay = 0, options = {}) {
        this.clearTimer(name); // 先清除同名定时器
        
        const timerType = options.type || 'timeout';
        const isDebounce = options.debounce || false;
        
        if (isDebounce) {
            return this.debounce(name, callback, delay);
        }

        let timer;
        switch (timerType) {
            case 'interval':
                timer = setInterval(callback, delay);
                break;
            case 'animation':
                timer = requestAnimationFrame(callback);
                this.animationFrames.set(name, timer);
                break;
            case 'timeout':
            default:
                timer = setTimeout(callback, delay);
        }

        this.timers.set(name, timer);
        this.timerStates.set(name, {
            type: timerType,
            createdAt: Date.now(),
            delay
        });

        return timer;
    }

    // 防抖功能
    debounce(name, callback, delay) {
        if (this.debounceTimers.has(name)) {
            clearTimeout(this.debounceTimers.get(name));
        }

        const timer = setTimeout(() => {
            callback();
            this.debounceTimers.delete(name);
        }, delay);

        this.debounceTimers.set(name, timer);
        return timer;
    }

    // 清除特定定时器
    clearTimer(name) {
        // 清除普通定时器
        if (this.timers.has(name)) {
            const timer = this.timers.get(name);
            const state = this.timerStates.get(name);
            
            if (timer) {
                if (state && state.type === 'interval') {
                    clearInterval(timer);
                } else {
                    clearTimeout(timer);
                }
            }
            this.timers.delete(name);
            this.timerStates.delete(name);
        }

        // 清除防抖定时器
        if (this.debounceTimers.has(name)) {
            clearTimeout(this.debounceTimers.get(name));
            this.debounceTimers.delete(name);
        }

        // 清除动画帧
        if (this.animationFrames.has(name)) {
            cancelAnimationFrame(this.animationFrames.get(name));
            this.animationFrames.delete(name);
        }
    }

    // 清除所有定时器
    clearAll() {
        // 清除所有普通定时器
        this.timers.forEach((timer, name) => {
            this.clearTimer(name);
        });
        
        // 清除所有防抖定时器
        this.debounceTimers.forEach((timer) => {
            clearTimeout(timer);
        });
        
        // 清除所有动画帧
        this.animationFrames.forEach((frame) => {
            cancelAnimationFrame(frame);
        });

        // 清空所有Map
        this.timers.clear();
        this.debounceTimers.clear();
        this.animationFrames.clear();
        this.timerStates.clear();
    }

    // 获取定时器状态
    getTimerState(name) {
        return this.timerStates.get(name);
    }

    // 检查定时器是否存在
    hasTimer(name) {
        return this.timers.has(name) || 
               this.debounceTimers.has(name) || 
               this.animationFrames.has(name);
    }
}

// 创建全局定时器管理器实例
const timerManager = new TimerManager();

// 图片加载和缓存管理
class ImageLoader {
    constructor() {
        this.imagePool = new Map();
        this.maxPoolSize = 30;
        this.loadTimeout = 10000;
        this.lastAccessTime = new Map();
        this.preloadQueue = new Set();  // 预加载队列
        this.isPreloading = false;      // 预加载状态
        
        // 每30秒清理一次缓存
        this.cleanupInterval = setInterval(() => this.cleanImagePool(), 30000);
    }

    // 预加载一批图片
    async preloadImages(urls) {
        if (this.isPreloading) return;
        this.isPreloading = true;

        try {
            // 将新的URL添加到预加载队列
            urls.forEach(url => this.preloadQueue.add(url));
            
            // 开始预加载过程
            const preloadPromises = Array.from(this.preloadQueue).map(url => {
                if (this.imagePool.has(url)) {
                    this.preloadQueue.delete(url);
                    return Promise.resolve();
                }
                return this.loadImage(url).catch(err => {
                    console.warn('预加载图片失败:', url, err);
                });
            });

            await Promise.all(preloadPromises);
            this.preloadQueue.clear();
        } catch (error) {
            console.error('预加载过程出错:', error);
        } finally {
            this.isPreloading = false;
        }
    }

    async loadImage(url) {
        this.lastAccessTime.set(url, Date.now());
        
        if (this.imagePool.has(url)) {
            console.log('从缓存加载图片:', url);
            return Promise.resolve(this.imagePool.get(url));
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                img.src = '';
                reject(new Error('图片加载超时'));
            }, this.loadTimeout);

            img.onload = () => {
                clearTimeout(timeout);
                this.imagePool.set(url, img);
                this.cleanImagePool();
                resolve(img);
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error(`加载图片失败: ${url}`));
            };

            img.src = url;
        });
    }

    cleanImagePool() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5分钟未使用就清理
        
        // 按最后访问时间排序
        const entries = Array.from(this.lastAccessTime.entries())
            .sort((a, b) => b[1] - a[1]);
        
        // 删除超过最大数量的条目
        if (entries.length > this.maxPoolSize) {
            console.log('缓存池超出大小限制，开始清理');
            const toRemove = entries.slice(this.maxPoolSize);
            toRemove.forEach(([url]) => {
                this.removeFromCache(url);
            });
        }
        
        // 删除过期的条目
        entries.forEach(([url, lastAccess]) => {
            if (now - lastAccess > maxAge) {
                console.log('删除过期缓存:', url);
                this.removeFromCache(url);
            }
        });
    }

    removeFromCache(url) {
        const img = this.imagePool.get(url);
        if (img) {
            // 清理图片资源
            const currentSrc = img.src;
            img.src = '';
            if (currentSrc && currentSrc.indexOf('blob:') === 0) {
                URL.revokeObjectURL(currentSrc);
            }
        }
        this.imagePool.delete(url);
        this.lastAccessTime.delete(url);
    }

    destroy() {
        // 清理定时器
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // 清理所有缓存的图片
        this.imagePool.forEach((img, url) => {
            this.removeFromCache(url);
        });
        
        this.imagePool.clear();
        this.lastAccessTime.clear();
    }
}

// 创建全局图片加载器实例
const imageLoader = new ImageLoader();

// 修改现有的图片加载相关函数
async function loadImage(url) {
    try {
        return await imageLoader.loadImage(url);
    } catch (error) {
        console.error('图片加载失败:', error);
        throw error;
    }
}

// 内存监控
function monitorMemory() {
    if (window.performance && window.performance.memory) {
        const memory = window.performance.memory;
        console.log('内存使用情况:', {
            限制: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + 'MB',
            已分配: Math.round(memory.totalJSHeapSize / 1024 / 1024) + 'MB',
            已使用: Math.round(memory.usedJSHeapSize / 1024 / 1024) + 'MB'
        });

        if (memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.8) {
            console.log('内存使用过高，开始清理');
            imageLoader.cleanImagePool();
        }
    }
}

// 错误恢复机制
function attemptRecovery() {
    console.log('开始执行恢复程序');
    imageLoader.cleanImagePool();
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    setTimeout(() => {
        console.log('尝试重新初始化显示');
        initializeGridDisplay();
    }, 5000);
}

// 设备检测
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

function isIOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform)
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function getThreeLineValue(nowPlaying, lineName) {
    if (nowPlaying && nowPlaying.three_line && nowPlaying.three_line[lineName]) {
        return nowPlaying.three_line[lineName];
    }
    return "";
}

function getAlbumName(nowPlaying) {
    return getThreeLineValue(nowPlaying, "line3") || (nowPlaying && nowPlaying.album) || "";
}

// 显示模式切换
function toggleDisplayMode(isPlaying) {
    const fullscreenContainer = document.querySelector('.playing-mode');
    const gridWrapper = document.querySelector('.grid-wrapper');
    
    if (isPlaying) {
        fullscreenContainer.classList.remove('hidden');
        gridWrapper.classList.add('hidden');
    } else {
        fullscreenContainer.classList.add('hidden');
        gridWrapper.classList.remove('hidden');
    }
}

// 图片更新相关函数
async function initializeGridDisplay() {
    timerManager.clearTimer('gridUpdate');

    try {
        await updateGridImages();
        timerManager.setTimer('gridUpdate', updateRandomImages, GRID_UPDATE_INTERVAL, { 
            type: 'interval'
        });
        console.log('设置了定时更新，间隔:', GRID_UPDATE_INTERVAL);
    } catch (error) {
        console.error('初始化网格显示失败:', error);
        attemptRecovery();
    }
}

async function updateGridImages() {
    console.log('开始获取图片列表');
    const response = await fetch('/api/images');
    if (!response.ok) {
        throw new Error('获取图片列表失败');
    }
    const images = await response.json();
    console.log('获取到的图片列表:', images);
    
    if (images.length === 0) {
        console.log('没有可用的图片');
        return;
    }
    
    // 预加载下一批图片
    const nextBatchSize = IMAGES_TO_UPDATE * 2; // 预加载两批更新量的图片
    const preloadUrls = [];
    for (let i = 0; i < nextBatchSize && i < images.length; i++) {
        const randomIndex = Math.floor(Math.random() * images.length);
        const imageUrl = `/images/${images[randomIndex]}`;
        preloadUrls.push(imageUrl);
    }
    
    // 开始预加载
    imageLoader.preloadImages(preloadUrls);
    
    const gridItems = document.querySelectorAll('.grid-item');
    console.log('找到的网格元素数量:', gridItems.length);
    
    const selectedImages = [];
    const usedIndices = new Set();
    
    while (selectedImages.length < gridItems.length) {
        const randomIndex = Math.floor(Math.random() * images.length);
        if (!usedIndices.has(randomIndex)) {
            usedIndices.add(randomIndex);
            selectedImages.push(images[randomIndex]);
        }
        if (usedIndices.size === images.length && selectedImages.length < gridItems.length) {
            usedIndices.clear();
        }
    }
    
    const loadPromises = Array.from(gridItems).map(async (gridItem, index) => {
        try {
            if (index < selectedImages.length) {
                const imageUrl = `/images/${selectedImages[index]}`;
                console.log('加载图片:', imageUrl);
                const loadedImg = await loadImage(imageUrl);
                const img = gridItem.querySelector('img');
                if (img) img.src = loadedImg.src;
            } else {
                const img = gridItem.querySelector('img');
                if (img) img.src = '/img/transparent.png';
            }
        } catch (error) {
            console.error('加载图片失败:', error);
            const img = gridItem.querySelector('img');
            if (img) img.src = '/img/transparent.png';
        }
    });

    await Promise.all(loadPromises);
}

async function updateRandomImages() {
    console.log('开始随机更新图片...');
    try {
        const response = await fetch('/api/images');
        if (!response.ok) {
            throw new Error('获取图片列表失败');
        }
        const images = await response.json();
        
        // 预加载下一批图片
        const nextBatchSize = IMAGES_TO_UPDATE * 2;
        const preloadUrls = [];
        for (let i = 0; i < nextBatchSize && i < images.length; i++) {
            const randomIndex = Math.floor(Math.random() * images.length);
            const imageUrl = `/images/${images[randomIndex]}`;
            preloadUrls.push(imageUrl);
        }
        
        // 异步预加载，不等待完成
        imageLoader.preloadImages(preloadUrls);
        
        // 继续原有的更新逻辑
        console.log('可用图片总数:', images.length);
        if (images.length === 0) return;

        // 获取当前显示的所有图片
        const gridItems = document.querySelectorAll('.grid-item:not(.clock)');
        console.log('网格图片元素数量:', gridItems.length);
        
        const currentImages = Array.from(gridItems).map(item => {
            const img = item.querySelector('img');
            const path = img.src.split('/').pop();
            return path === 'transparent.png' ? null : path;
        });
        console.log('当前显示的图片:', currentImages);

        // 随机选择位置进行更新
        const positions = Array.from({ length: gridItems.length }, (_, i) => i)
            .filter(i => !gridItems[i].closest('.clock')); 
        
        const updatePositions = [];
        for (let i = 0; i < IMAGES_TO_UPDATE && positions.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * positions.length);
            updatePositions.push(positions.splice(randomIndex, 1)[0]);
        }
        console.log('将要更新的位置:', updatePositions);

        // 预加载所有新图片
        const updates = await Promise.all(updatePositions.map(async position => {
            let newImage;
            let attempts = 0;
            const maxAttempts = 10;
            
            // 尝试找到一个未使用的图片
            do {
                const randomIndex = Math.floor(Math.random() * images.length);
                newImage = images[randomIndex];
                attempts++;
            } while (currentImages.includes(newImage) && attempts < maxAttempts);
            
            const imageUrl = `/images/${newImage}`;
            try {
                const loadedImg = await loadImage(imageUrl);
                return { position, newImage, loadedImg };
            } catch (error) {
                console.error(`位置 ${position} 预加载失败:`, error);
                return { position, error: true };
            }
        }));

        // 批量执行淡入淡出动画 - 替换原有的3D翻转效果以提升Android 8.0兼容性
        // 使用简单的opacity过渡，避免复杂的3D变换，确保在旧版WebView中稳定运行
        const fadeDuration = 500; // 与 CSS transition 时间匹配
        
        for (const update of updates) {
            if (update.error) continue;

            const gridItem = gridItems[update.position];
            const img = gridItem.querySelector('img');
            
            // 执行淡出动画
            console.log(`对位置 ${update.position} 应用淡出效果`);
            gridItem.classList.add('updating');
            
            // 等待淡出完成后更换图片并淡入
            await new Promise(resolve => {
                setTimeout(() => {
                    img.src = update.loadedImg.src;
                    gridItem.classList.remove('updating');
                    resolve();
                }, fadeDuration);
            });
            
            // 在每次更新之间添加小延迟，使动画更流畅
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error('更新随机图片失败:', error);
    }
}

// 图片更新函数
function updateImage(imageKey, albumName) {
    console.log('开始更新图片:', { imageKey, albumName });
    if (!imageKey) {
        console.log('无图片key，使用默认图片');
        $('#coverImage').attr('src', '/img/transparent.png');
        $('#colorBackground').css('background-color', '#000000');
        return;
    }

    // 检查DOM元素
    const coverImage = $('#coverImage');
    const colorBackground = $('#colorBackground');

    console.log('DOM元素状态:', {
        coverImage: coverImage.length ? '存在' : '不存在',
        colorBackground: colorBackground.length ? '存在' : '不存在'
    });

    const imageUrl = '/roonapi/getImage?image_key=' + imageKey + 
        '&albumName=' + encodeURIComponent(albumName || '') +
        '&scale=full&format=image/jpeg&quality=100';
    console.log('图片URL:', imageUrl);
    
    coverImage.attr('src', imageUrl);
    
    // 创建临时图片和ColorThief实例
    const colorThief = new ColorThief();
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = function() {
        console.log('图片加载完成，开始提取颜色');
        try {
            // 创建临时 canvas 用于颜色提取
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const dominantColor = colorThief.getColor(img);
            console.log('提取的主色调:', dominantColor);
            const [r, g, b] = dominantColor;
            const backgroundColor = `rgba(${r}, ${g}, ${b}, 0.19)`;
            colorBackground.css({
                'background': backgroundColor,
                'transition': 'background 1s ease'
            }).show();
            
            // 清理临时资源
            tempCanvas.remove();
            if (img.src && img.src.indexOf('blob:') === 0) {
                URL.revokeObjectURL(img.src);
            }
        } catch (error) {
            console.error('提取颜色失败:', error);
        }
    };
    
    img.onerror = function(error) {
        console.error('图片加载失败:', error);
        if (img.src && img.src.indexOf('blob:') === 0) {
            URL.revokeObjectURL(img.src);
        }
    };
    
    img.src = imageUrl;
}

// Cookie 相关函数
function readCookie(name) {
    return Cookies.get(name);
}

function setCookie(name, value) {
    Cookies.set(name, value, { expires: 365 });
}

// 主题设置
function setTheme(theme) {
    settings.theme = theme;
    if (theme === 'dark') {
        $('body').css('background-color', '#232629');
        $('#colorBackground').show().css('background-color', '#232629');
        $('#coverBackground').hide();
    }
    updateImage(currentImageKey);
}

// 键盘控制功能
function emitZoneControl(eventName, label) {
    if (!settings.zoneID) {
        console.log('未选择区域，无法控制播放');
        return false;
    }

    const zoneMsg = { zone_id: settings.zoneID };
    console.log(label, '区域ID:', settings.zoneID);
    socket.emit(eventName, zoneMsg);
    return true;
}

function getGestureFeedbackLayer() {
    return document.getElementById('gestureFeedback');
}

function removeFeedbackNode(node, delay) {
    setTimeout(function() {
        if (node && node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }, delay);
}

function showTouchRipple(x, y) {
    var layer = getGestureFeedbackLayer();
    if (!layer) return;

    var ripple = document.createElement('div');
    ripple.className = 'gesture-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    layer.appendChild(ripple);
    removeFeedbackNode(ripple, 620);
}

function getGestureIcon(action) {
    if (action === 'next') return '›';
    if (action === 'prev') return '‹';
    if (action === 'stop') return '■';
    if (action === 'play') return '▶';
    return '';
}

function showGestureCue(action) {
    var layer = getGestureFeedbackLayer();
    if (!layer) return;

    var flash = document.createElement('div');
    flash.className = 'gesture-flash ' + action;
    layer.appendChild(flash);
    removeFeedbackNode(flash, 420);

    var cue = document.createElement('div');
    cue.className = 'gesture-cue ' + action;
    cue.textContent = getGestureIcon(action);
    layer.appendChild(cue);
    removeFeedbackNode(cue, 820);
}

function confirmGestureAction(action) {
    showGestureCue(action);
    if (navigator.vibrate) {
        navigator.vibrate(20);
    }
}

function setupKeyboardControls() {
    document.addEventListener('keydown', function(event) {
        console.log('键盘事件:', event.code, '区域ID:', settings.zoneID);
        
        switch(event.code) {
            case 'Space':
                event.preventDefault();
                emitZoneControl('goPlayPause', '播放/暂停切换');
                break;
            case 'ArrowLeft':
                event.preventDefault();
                emitZoneControl('goPrev', '上一曲');
                break;
            case 'ArrowRight':
                event.preventDefault();
                emitZoneControl('goNext', '下一曲');
                break;
            case 'KeyP':
                event.preventDefault();
                emitZoneControl('goPlay', '播放');
                break;
            case 'Escape':
                event.preventDefault();
                emitZoneControl('goStop', '停止');
                break;
            // 媒体键支持
            case 'MediaPlayPause':
                event.preventDefault();
                emitZoneControl('goPlayPause', '媒体键: 播放/暂停');
                break;
            case 'MediaTrackNext':
                event.preventDefault();
                emitZoneControl('goNext', '媒体键: 下一曲');
                break;
            case 'MediaTrackPrevious':
                event.preventDefault();
                emitZoneControl('goPrev', '媒体键: 上一曲');
                break;
            case 'MediaStop':
                event.preventDefault();
                emitZoneControl('goStop', '媒体键: 停止');
                break;
        }
    });
}

// 触摸手势控制
function setupGestureControls() {
    var gestureStart = null;
    var minDistance = 60;
    var maxDuration = 1200;
    var directionRatio = 1.2;

    document.addEventListener('touchstart', function(event) {
        if (!event.touches || event.touches.length !== 1) {
            gestureStart = null;
            return;
        }

        var touch = event.touches[0];
        gestureStart = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now()
        };
    }, false);

    document.addEventListener('touchend', function(event) {
        if (!gestureStart || !event.changedTouches || event.changedTouches.length !== 1) {
            gestureStart = null;
            return;
        }

        var touch = event.changedTouches[0];
        var dx = touch.clientX - gestureStart.x;
        var dy = touch.clientY - gestureStart.y;
        var elapsed = Date.now() - gestureStart.time;
        var absX = Math.abs(dx);
        var absY = Math.abs(dy);
        showTouchRipple(touch.clientX, touch.clientY);

        var eventName = null;
        var label = null;
        var action = null;

        gestureStart = null;

        if (elapsed > maxDuration || Math.max(absX, absY) < minDistance) {
            return;
        }

        if (absX > absY * directionRatio) {
            if (dx < 0) {
                eventName = 'goNext';
                label = '左滑：下一曲';
                action = 'next';
            } else {
                eventName = 'goPrev';
                label = '右滑：上一曲';
                action = 'prev';
            }
        } else if (absY > absX * directionRatio) {
            if (dy < 0) {
                eventName = 'goStop';
                label = '上滑：停止';
                action = 'stop';
            } else {
                eventName = 'goPlay';
                label = '下滑：播放';
                action = 'play';
            }
        }

        if (eventName && emitZoneControl(eventName, label)) {
            confirmGestureAction(action);
            event.preventDefault();
        }
    }, false);

    document.addEventListener('touchcancel', function() {
        gestureStart = null;
    }, false);
}

// Media Session API 支持
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        console.log('设置 Media Session API 支持');
        
        navigator.mediaSession.setActionHandler('play', () => {
            console.log('Media Session: 播放');
            if (settings.zoneID) {
                socket.emit('goPlay', { zone_id: settings.zoneID });
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            console.log('Media Session: 暂停');
            if (settings.zoneID) {
                socket.emit('goPause', { zone_id: settings.zoneID });
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            console.log('Media Session: 上一曲');
            if (settings.zoneID) {
                socket.emit('goPrev', { zone_id: settings.zoneID });
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            console.log('Media Session: 下一曲');
            if (settings.zoneID) {
                socket.emit('goNext', { zone_id: settings.zoneID });
            }
        });

        navigator.mediaSession.setActionHandler('stop', () => {
            console.log('Media Session: 停止');
            if (settings.zoneID) {
                socket.emit('goStop', { zone_id: settings.zoneID });
            }
        });
    } else {
        console.log('浏览器不支持 Media Session API');
    }
}

// 更新媒体会话元数据
function updateMediaSessionMetadata(nowPlaying) {
    if ('mediaSession' in navigator && nowPlaying) {
        try {
            const title = getThreeLineValue(nowPlaying, "line1") || '未知曲目';
            const artist = getThreeLineValue(nowPlaying, "line2") || '未知艺术家';
            const album = getAlbumName(nowPlaying) || '未知专辑';
            
            console.log('更新媒体会话元数据:', { title, artist, album });
            
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: album,
                artwork: [{
                    src: `/roonapi/getImage?image_key=${nowPlaying.image_key}&scale=fit&width=512&height=512`,
                    sizes: '512x512',
                    type: 'image/jpeg'
                }]
            });
        } catch (error) {
            console.error('更新媒体会话元数据失败:', error);
        }
    }
}

// 事件监听器设置
document.addEventListener('DOMContentLoaded', function() {
    const isTouch = isTouchDevice();
    initializeGridDisplay();
    
    // 设置键盘和媒体控制
    setupKeyboardControls();
    setupGestureControls();
    setupMediaSession();
    
    // 添加页面卸载时的清理
    window.addEventListener('beforeunload', () => {
        timerManager.clearAll();
        imageLoader.destroy();
        // 断开 Socket.IO 连接
        socket.disconnect();
    });
    
    // 添加页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 页面隐藏时暂停更新
            timerManager.clearTimer('gridUpdate');
        } else {
            // 页面可见时恢复更新
            const gridWrapper = document.querySelector('.grid-wrapper');
            if (gridWrapper && !gridWrapper.classList.contains('hidden')) {
                initializeGridDisplay();
            }
        }
    });
});

// Socket.IO 连接状态处理
socket.on('connect', () => {
    console.log('Socket.IO 连接成功');
    // 连接成功后请求配对状态
    socket.emit('getPairStatus');
});

socket.on('disconnect', () => {
    console.log('Socket.IO 连接断开');
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO 连接错误:', error);
});

function cancelPlaybackSwitchTimer() {
    if (isPlaybackTimerActive) {
        console.log('取消15秒切换定时器');
        timerManager.clearTimer('playbackTimer');
        isPlaybackTimerActive = false;
    }
}

function schedulePlaybackSwitch(data) {
    console.log('收到非播放状态事件:', data, '当前定时器状态:', isPlaybackTimerActive);
    try {
        if (!isPlaybackTimerActive) {
            console.log('设置15秒切换定时器');
            isPlaybackTimerActive = true;
            timerManager.clearTimer('playbackTimer');
            timerManager.setTimer('playbackTimer', async () => {
                console.log('15秒已到，切换到网格显示');
                try {
                    toggleDisplayMode(false);
                    // 确保网格正确初始化
                    await initializeGridDisplay();
                    console.log('网格显示初始化完成');
                } catch (error) {
                    console.error('切换到网格显示时出错:', error);
                    // 尝试恢复
                    attemptRecovery();
                }
                isPlaybackTimerActive = false;
            }, 15000);
        } else {
            console.log('定时器已经在运行中，跳过设置');
        }
    } catch (error) {
        console.error('处理非播放状态事件时出错:', error);
        isPlaybackTimerActive = false;  // 发生错误时重置状态
    }
}

// Socket.IO 事件处理
socket.on('pairStatus', function(payload) {
    console.log('收到配对状态:', payload);
    const pairDisabled = document.getElementById('pairDisabled');
    if (payload && payload.pairEnabled === true) {
        if (pairDisabled) pairDisabled.style.display = 'none';
        console.log('发送getZone请求:', settings.zoneID || true);
        socket.emit("getZone", settings.zoneID || true);
    } else {
        if (pairDisabled) pairDisabled.style.display = 'flex';
    }
});

socket.on('zoneStatus', function(payload) {
    console.log('收到区域状态:', payload);
    if (payload && payload.length > 0) {
        if (!settings.zoneID) {
            settings.zoneID = payload[0].zone_id;
            console.log('设置新的zoneID:', settings.zoneID);
            setCookie("settings['zoneID']", settings.zoneID);
        }
        
        const zone = payload.find(z => z.zone_id === settings.zoneID) || payload[0];
        console.log('当前zone详细信息:', {
            zone_id: zone.zone_id,
            display_name: zone.display_name,
            now_playing: zone.now_playing ? {
                image_key: zone.now_playing.image_key,
                three_line: zone.now_playing.three_line,
                album: zone.now_playing.album
            } : '无播放信息'
        });

        if (zone.state && zone.state !== 'playing') {
            schedulePlaybackSwitch({ state: zone.state });
            return;
        }

        if (zone.state === 'playing') {
            cancelPlaybackSwitchTimer();
            toggleDisplayMode(true);
        }

        if (zone.now_playing && zone.now_playing.image_key !== currentImageKey) {
            const nowPlaying = zone.now_playing;
            console.log('更新图片key:', nowPlaying.image_key);
            currentImageKey = nowPlaying.image_key;
            
            // 获取专辑名称
            const albumName = getAlbumName(nowPlaying);
            
            console.log('专辑信息:', {
                albumName,
                来源: getThreeLineValue(nowPlaying, "line3") ? 'three_line.line3' : 'album字段',
                原始数据: {
                    three_line: nowPlaying.three_line,
                    album: nowPlaying.album
                }
            });
            
            if (albumName) {
                updateImage(currentImageKey, albumName);
            // 更新Android风格的曲目信息显示
            updateAndroidTrackInfo(nowPlaying);
            } else {
                console.warn("警告：无法获取专辑名称，完整数据:", nowPlaying);
                updateImage(currentImageKey);
            }
            
            // 更新媒体会话元数据
            updateMediaSessionMetadata(nowPlaying);
            
            // 确保显示模式正确
            toggleDisplayMode(true);
        }
    } else {
        console.log('未收到区域信息或区域列表为空');
    }
});

socket.on('notPlaying', function(data) {
    schedulePlaybackSwitch(data);
});

socket.on('nowplaying', function(data) {
    console.log('收到开始播放事件:', data);
    try {
        cancelPlaybackSwitchTimer();
        if (data && data.image_key) {
            console.log('更新当前播放封面');
            currentImageKey = data.image_key;
            
            // 获取专辑名称
            const albumName = getAlbumName(data);
            
            if (albumName) {
                updateImage(data.image_key, albumName);
            } else {
                console.warn('警告：无法获取专辑名称，完整数据:', data);
                updateImage(data.image_key);
            }
            
            // 更新Android风格的曲目信息显示
            updateAndroidTrackInfo(data);
            
            // 更新媒体会话元数据
            updateMediaSessionMetadata(data);
            
            // 立即切换到播放显示模式
            toggleDisplayMode(true);
        }
    } catch (error) {
        console.error('处理播放事件时出错:', error);
    }
});


// 画屏设备检测逻辑
function getDisplayMode() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    console.log("检测屏幕尺寸:", { width, height });
    
    // 21.5寸大画屏检测 (1080*1920)
    if (width === 1080 && height === 1920) {
        console.log("检测到大画屏模式: 21.5寸 1080*1920");
        return 'large-display';
    }
    // 10寸小画屏检测 (800*1280)
    else if (width === 800 && height === 1280) {
        console.log("检测到小画屏模式: 10寸 800*1280");
        return 'small-display';
    }
    // 其他设备保持原逻辑
    else {
        console.log("使用默认模式");
        return 'default';
    }
}

// 大小画屏专用配置对象
const DISPLAY_CONFIGS = {
    'large-display': {
        // 21.5寸大画屏配置 (远距离观看优化)
        trackSize: 80,
        artistSize: 55,
        albumSize: 40,
        lineHeight: 1.2,
        textMargin: 18,
        coverRatio: 0.65,
        textRatio: 0.35,
        horizontalMargin: '8%',
        fontWeight: {
            track: '700',  // 粗体
            artist: '600', // 半粗体
            album: '500'   // 中等字重
        },
        opacity: {
            track: 1.0,
            artist: 0.90,
            album: 0.75
        }
    },
    'small-display': {
        // 10寸小画屏配置 (近距离观看优化)
        trackSize: 55,
        artistSize: 40,
        albumSize: 30,
        lineHeight: 1.3,
        textMargin: 15,
        coverRatio: 0.70,
        textRatio: 0.30,
        horizontalMargin: '6%',
        fontWeight: {
            track: '700', // 粗体
            artist: '500', // 中等字重
            album: '400'   // 正常字重
        },
        opacity: {
            track: 0.95,
            artist: 0.80,
            album: 0.65
        }
    }
};

// 差异化字体应用逻辑
function applyDisplayModeStyles() {
    const mode = getDisplayMode();
    
    if (mode === 'default') {
        // 使用原有响应式逻辑
        if (typeof window.ResponsiveFonts !== "undefined") {
            window.ResponsiveFonts.applyResponsiveFonts();
        }
        return;
    }
    
    const config = DISPLAY_CONFIGS[mode];
    if (!config) return;
    
    console.log("应用画屏模式样式:", mode, config);
    
    // 获取DOM元素
    const elements = {
        track: document.getElementById('trackText'),
        artist: document.getElementById('artistText'), 
        album: document.getElementById('albumText'),
        container: document.getElementById('playingContainer')
    };
    
    // 为容器添加画屏模式类名
    if (elements.container) {
        elements.container.classList.add('display-mode', mode);
    }
    
    // 应用字体样式
    if (elements.track) {
        elements.track.style.fontSize = config.trackSize + 'px';
        elements.track.style.lineHeight = config.lineHeight;
        elements.track.style.marginBottom = config.textMargin + 'px';
        elements.track.style.fontWeight = config.fontWeight.track;
        elements.track.style.opacity = config.opacity.track;
    }
    
    if (elements.artist) {
        elements.artist.style.fontSize = config.artistSize + 'px';
        elements.artist.style.lineHeight = config.lineHeight;
        elements.artist.style.marginBottom = (config.textMargin * 0.7) + 'px';
        elements.artist.style.fontWeight = config.fontWeight.artist;
        elements.artist.style.opacity = config.opacity.artist;
    }
    
    if (elements.album) {
        elements.album.style.fontSize = config.albumSize + 'px';
        elements.album.style.lineHeight = config.lineHeight;
        elements.album.style.fontWeight = config.fontWeight.album;
        elements.album.style.opacity = config.opacity.album;
    }
}

// Android风格曲目信息更新函数
function updateAndroidTrackInfo(nowPlaying) {
    console.log("更新Android风格曲目信息:", nowPlaying);
    
    try {
        // 获取曲目信息文本元素
        const trackTextElement = document.getElementById("trackText");
        const artistTextElement = document.getElementById("artistText");
        const albumTextElement = document.getElementById("albumText");
        
        // 映射Roon数据到显示格式：曲目名称 → 艺术家 → 专辑名称
        const trackText = getThreeLineValue(nowPlaying, "line1"); // 曲目名称（第一行显示）- 来自Roon API的line1
        const artistText = getThreeLineValue(nowPlaying, "line2"); // 艺术家（第二行显示）- 来自Roon API的line2
        const albumText = getAlbumName(nowPlaying); // 专辑名称（第三行显示）- 来自Roon API的line3
        
        console.log("映射的曲目信息:", { trackText, artistText, albumText });
        
        // 更新文本内容
        if (trackTextElement) {
            trackTextElement.textContent = trackText;
            console.log("更新歌曲标题:", trackText);
        }
        if (artistTextElement) {
            artistTextElement.textContent = artistText;
            console.log("更新艺术家:", artistText);
        }
        if (albumTextElement) {
            albumTextElement.textContent = albumText;
            console.log("更新专辑名称:", albumText);
        }
        
        // 更新完文本后应用画屏模式样式
        applyDisplayModeStyles();
        
    } catch (error) {
        console.error("更新Android风格曲目信息时出错:", error);
    }
}
