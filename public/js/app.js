class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, data) {
        const callbacks = this.events[event];
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    off(event, callback) {
        const callbacks = this.events[event];
        if (callbacks) {
            this.events[event] = callbacks.filter(cb => cb !== callback);
        }
    }
}

class DisplayManager extends EventEmitter {
    constructor() {
        super();
        this.currentMode = 'normal';
        this.isFullscreen = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen = !!document.fullscreenElement;
            this.emit('fullscreenChange', this.isFullscreen);
        });
    }

    async toggleFullscreen() {
        try {
            if (!this.isFullscreen) {
                const elem = document.documentElement;
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) {
                    await elem.webkitRequestFullscreen();
                } else if (elem.msRequestFullscreen) {
                    await elem.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    await document.msExitFullscreen();
                }
            }
        } catch (error) {
            console.error('全屏切换失败:', error);
            this.emit('error', error);
        }
    }

    setMode(mode) {
        this.currentMode = mode;
        this.emit('modeChange', mode);
    }

    getMode() {
        return this.currentMode;
    }
}

const utils = {
    cookie: {
        get(name) {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        },
        set(name, value) {
            const date = new Date();
            date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000)); // 一年有效期
            document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
        }
    },
    device: {
        isTouch() {
            return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        }
    },
    dom: {
        $(selector) {
            return document.querySelector(selector);
        }
    }
};

const app = {
    EventEmitter,
    DisplayManager,
    utils,
    config: {
        version: '5.0.1'
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;
} else if (typeof window !== 'undefined') {
    window.app = app;
} 
