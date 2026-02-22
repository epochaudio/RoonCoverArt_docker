// 状态监控脚本 - 监听所有状态变化
console.log('=== 状态监控脚本已加载 ===');

// 监听所有socket事件
if (typeof socket !== 'undefined') {
    // 保存原始的emit和on方法
    const originalEmit = socket.emit;
    const originalOn = socket.on;
    
    // 重写emit方法以记录所有发出的事件
    socket.emit = function(event, ...args) {
        console.log('🔵 发送事件:', event, args);
        return originalEmit.apply(this, [event, ...args]);
    };
    
    // 添加通用事件监听器
    const originalOnevent = socket.onevent;
    socket.onevent = function(packet) {
        console.log('🔴 接收事件:', packet.data[0], packet.data.slice(1));
        return originalOnevent.call(this, packet);
    };
    
    // 专门监听zone相关事件
    socket.on('zoneStatus', function(data) {
        console.log('📊 Zone状态更新:', data);
        if (data && data.length > 0) {
            const zone = data[0];
            console.log('Zone详情:', {
                state: zone.state,
                display_name: zone.display_name,
                is_playing: zone.state === 'playing',
                has_now_playing: !!zone.now_playing
            });
            
            // 如果状态不是playing，手动触发切换逻辑
            if (zone.state !== 'playing') {
                console.log('⚠️ 检测到非播放状态，手动触发切换逻辑');
                
                // 检查是否已经有定时器在运行
                if (typeof isPlaybackTimerActive !== 'undefined' && !isPlaybackTimerActive) {
                    console.log('设置手动15秒切换定时器');
                    
                    if (typeof timerManager !== 'undefined') {
                        window.isPlaybackTimerActive = true;
                        timerManager.clearTimer('manualPlaybackTimer');
                        timerManager.setTimer('manualPlaybackTimer', async () => {
                            console.log('手动定时器：15秒已到，切换到网格显示');
                            try {
                                if (typeof toggleDisplayMode !== 'undefined') {
                                    toggleDisplayMode(false);
                                }
                                if (typeof initializeGridDisplay !== 'undefined') {
                                    await initializeGridDisplay();
                                }
                                console.log('手动定时器：网格显示初始化完成');
                            } catch (error) {
                                console.error('手动定时器：切换出错', error);
                            }
                            window.isPlaybackTimerActive = false;
                        }, 15000);
                    }
                }
            } else if (zone.state === 'playing') {
                // 如果开始播放，取消定时器
                if (typeof timerManager !== 'undefined') {
                    timerManager.clearTimer('manualPlaybackTimer');
                    window.isPlaybackTimerActive = false;
                }
            }
        }
    });
    
    console.log('✅ Socket事件监控已启用');
} else {
    console.log('❌ Socket未定义，无法启用监控');
}

// 定期检查播放状态的备用方案
let lastPlayingState = null;
setInterval(() => {
    fetch('/api/status')
        .then(r => r.json())
        .then(status => {
            const isPlaying = status.is_playing;
            
            if (lastPlayingState !== null && lastPlayingState !== isPlaying) {
                console.log('🔄 播放状态变化:', { 
                    从: lastPlayingState ? '播放' : '非播放', 
                    到: isPlaying ? '播放' : '非播放' 
                });
                
                if (!isPlaying && typeof isPlaybackTimerActive !== 'undefined' && !isPlaybackTimerActive) {
                    console.log('💡 通过API检测到停止播放，启动切换逻辑');
                    
                    if (typeof timerManager !== 'undefined') {
                        window.isPlaybackTimerActive = true;
                        timerManager.clearTimer('apiPlaybackTimer');
                        timerManager.setTimer('apiPlaybackTimer', async () => {
                            console.log('API定时器：15秒已到，切换到网格显示');
                            try {
                                if (typeof toggleDisplayMode !== 'undefined') {
                                    toggleDisplayMode(false);
                                }
                                if (typeof initializeGridDisplay !== 'undefined') {
                                    await initializeGridDisplay();
                                }
                                console.log('API定时器：网格显示初始化完成');
                            } catch (error) {
                                console.error('API定时器：切换出错', error);
                            }
                            window.isPlaybackTimerActive = false;
                        }, 15000);
                    }
                }
            }
            
            lastPlayingState = isPlaying;
        })
        .catch(err => console.log('状态检查失败:', err));
}, 5000); // 每5秒检查一次

console.log('✅ 定期状态检查已启用（每5秒）');

// 导出监控控制函数
window.statusMonitor = {
    getCurrentState: function() {
        return fetch('/api/status').then(r => r.json());
    },
    
    forceCheck: function() {
        console.log('🔍 强制检查当前状态');
        return this.getCurrentState().then(status => {
            console.log('当前状态:', status);
            return status;
        });
    },
    
    simulateStop: function() {
        console.log('🎭 模拟停止播放');
        lastPlayingState = true; // 假设之前在播放
        // 在下次检查时会检测到变化
    }
};

console.log('监控控制函数已加载:');
console.log('- statusMonitor.getCurrentState() - 获取当前状态');
console.log('- statusMonitor.forceCheck() - 强制检查状态');
console.log('- statusMonitor.simulateStop() - 模拟停止播放');