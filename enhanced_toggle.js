// 增强版显示模式切换函数 - 替换原有的toggleDisplayMode
function toggleDisplayMode(isPlaying) {
    console.log('toggleDisplayMode 被调用，参数:', { isPlaying });
    
    const fullscreenContainer = document.querySelector('.fullscreen-container');
    const gridContainer = document.querySelector('.grid-container');
    
    console.log('DOM元素状态:', {
        fullscreenContainer: fullscreenContainer ? '存在' : '不存在',
        gridContainer: gridContainer ? '存在' : '不存在'
    });
    
    if (!fullscreenContainer || !gridContainer) {
        console.error('必要的DOM元素缺失，无法切换显示模式');
        return false;
    }
    
    // 记录切换前状态
    const beforeState = {
        fullscreenHidden: fullscreenContainer.classList.contains('hidden'),
        gridHidden: gridContainer.classList.contains('hidden')
    };
    console.log('切换前状态:', beforeState);
    
    if (isPlaying) {
        console.log('切换到播放模式 - 显示封面，隐藏网格');
        fullscreenContainer.classList.remove('hidden');
        gridContainer.classList.add('hidden');
    } else {
        console.log('切换到网格模式 - 隐藏封面，显示网格');
        fullscreenContainer.classList.add('hidden');
        gridContainer.classList.remove('hidden');
    }
    
    // 验证切换是否成功
    setTimeout(() => {
        const afterState = {
            fullscreenHidden: fullscreenContainer.classList.contains('hidden'),
            gridHidden: gridContainer.classList.contains('hidden')
        };
        console.log('切换后状态:', afterState);
        
        const switchedCorrectly = isPlaying ? 
            (!afterState.fullscreenHidden && afterState.gridHidden) :
            (afterState.fullscreenHidden && !afterState.gridHidden);
            
        console.log('模式切换验证:', {
            期望播放模式: isPlaying,
            切换成功: switchedCorrectly,
            网格可见: !afterState.gridHidden,
            封面可见: !afterState.fullscreenHidden
        });
        
        if (!switchedCorrectly) {
            console.error('模式切换失败，尝试强制修复');
            // 强制修复
            if (isPlaying) {
                fullscreenContainer.style.display = 'flex';
                gridContainer.style.display = 'none';
            } else {
                fullscreenContainer.style.display = 'none';
                gridContainer.style.display = 'grid';
            }
        }
    }, 100);
    
    return true;
}

// 将增强版本注入到全局作用域
if (typeof window !== 'undefined') {
    window.toggleDisplayMode = toggleDisplayMode;
    console.log('增强版 toggleDisplayMode 已注入到全局作用域');
}