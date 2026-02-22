// 快速测试脚本 - 模拟notPlaying事件
console.log('=== 快速测试脚本 ===');

// 检查是否已连接Socket.IO
if (typeof socket !== 'undefined' && socket.connected) {
    console.log('Socket.IO已连接，可以测试');
    
    // 手动触发notPlaying事件
    console.log('手动触发notPlaying事件测试');
    
    // 模拟接收notPlaying事件
    if (typeof isPlaybackTimerActive !== 'undefined') {
        console.log('当前isPlaybackTimerActive状态:', isPlaybackTimerActive);
        
        // 强制重置状态
        if (typeof window !== 'undefined') {
            window.isPlaybackTimerActive = false;
        }
        
        // 手动调用notPlaying处理函数
        const testData = { state: 'stopped' };
        console.log('模拟notPlaying事件:', testData);
        
        // 直接调用处理逻辑
        try {
            if (!isPlaybackTimerActive) {
                console.log('设置15秒切换定时器');
                isPlaybackTimerActive = true;
                if (typeof timerManager !== 'undefined') {
                    timerManager.clearTimer('playbackTimer');
                    timerManager.setTimer('playbackTimer', async () => {
                        console.log('15秒已到，切换到网格显示');
                        try {
                            if (typeof toggleDisplayMode !== 'undefined') {
                                toggleDisplayMode(false);
                            }
                            if (typeof initializeGridDisplay !== 'undefined') {
                                await initializeGridDisplay();
                            }
                            console.log('网格显示初始化完成');
                        } catch (error) {
                            console.error('切换到网格显示时出错:', error);
                        }
                        isPlaybackTimerActive = false;
                    }, 15000);
                    console.log('15秒定时器已设置');
                } else {
                    console.error('timerManager未定义');
                }
            }
        } catch (error) {
            console.error('测试notPlaying处理时出错:', error);
        }
    } else {
        console.error('isPlaybackTimerActive未定义');
    }
    
} else {
    console.log('Socket.IO未连接，无法测试');
}

// 添加快速切换函数
window.quickTest = {
    // 强制切换到网格模式
    forceGrid: function() {
        console.log('强制切换到网格模式');
        const fullscreen = document.querySelector('.fullscreen-container');
        const grid = document.querySelector('.grid-container');
        
        if (fullscreen) fullscreen.classList.add('hidden');
        if (grid) grid.classList.remove('hidden');
        
        if (typeof initializeGridDisplay !== 'undefined') {
            initializeGridDisplay();
        }
    },
    
    // 触发15秒定时器
    trigger15s: function() {
        console.log('触发15秒定时器测试');
        if (typeof timerManager !== 'undefined' && typeof toggleDisplayMode !== 'undefined') {
            timerManager.setTimer('testTimer', async () => {
                console.log('测试：15秒到达，切换到网格');
                toggleDisplayMode(false);
                if (typeof initializeGridDisplay !== 'undefined') {
                    await initializeGridDisplay();
                }
            }, 2000); // 2秒用于测试
        }
    },
    
    // 检查状态
    checkStatus: function() {
        console.log('=== 状态检查 ===');
        console.log('Socket连接:', typeof socket !== 'undefined' ? socket.connected : '未定义');
        console.log('定时器活跃:', typeof isPlaybackTimerActive !== 'undefined' ? isPlaybackTimerActive : '未定义');
        console.log('网格容器:', document.querySelector('.grid-container') ? '存在' : '不存在');
        console.log('全屏容器:', document.querySelector('.fullscreen-container') ? '存在' : '不存在');
        
        const grid = document.querySelector('.grid-container');
        if (grid) {
            console.log('网格状态:', grid.classList.contains('hidden') ? '隐藏' : '显示');
        }
    }
};

console.log('快速测试函数已加载:');
console.log('- quickTest.forceGrid() - 强制切换到网格');
console.log('- quickTest.trigger15s() - 触发15秒定时器测试');
console.log('- quickTest.checkStatus() - 检查当前状态');