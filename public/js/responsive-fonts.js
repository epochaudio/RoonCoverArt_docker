/**
 * Android风格响应式字体计算
 * 基于MainActivity.kt中的字体计算逻辑
 */

// 文本元素类型
const TextElement = {
    TITLE: 'TITLE',      // 歌曲名
    SUBTITLE: 'SUBTITLE', // 艺术家
    CAPTION: 'CAPTION',   // 专辑名
    NORMAL: 'NORMAL'
};

// 屏幕类型检测
function getScreenType() {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 3840) return 'UHD_4K';
    if (screenWidth >= 2560) return 'QHD_2K';
    if (screenWidth >= 1920) return 'FHD_PLUS';
    if (screenWidth >= 1080) return 'FHD';
    return 'HD';
}

// 响应式字体大小计算 - 复刻Android逻辑
function getResponsiveFontSize(baseSp, textElement = TextElement.NORMAL) {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const density = window.devicePixelRatio || 1;
    const isLandscape = screenWidth > screenHeight;
    
    // 基于屏幕尺寸的基础缩放
    const screenSizeRatio = Math.min(screenWidth, screenHeight) / 1080;
    
    // 基于密度的调整 - 考虑实际物理尺寸
    let densityAdjustment;
    if (density > 3.0) {
        densityAdjustment = 0.8; // 高密度屏幕减小字体
    } else if (density < 1.5) {
        densityAdjustment = 1.3; // 低密度屏幕增大字体
    } else {
        densityAdjustment = 1.0; // 标准密度
    }
    
    // 根据文本类型调整
    let textTypeMultiplier;
    switch (textElement) {
        case TextElement.TITLE:
            textTypeMultiplier = 1.0; // 歌曲名保持完整
            break;
        case TextElement.SUBTITLE:
            textTypeMultiplier = 0.85; // 艺术家稍小
            break;
        case TextElement.CAPTION:
            textTypeMultiplier = 0.75; // 专辑名更小
            break;
        default:
            textTypeMultiplier = 1.0;
    }
    
    // 考虑文字区域可用空间
    const textAreaHeight = isLandscape ? screenHeight * 0.65 : screenHeight * 0.35;
    const spaceConstraint = Math.min(1.8, Math.max(0.7, textAreaHeight / 350));
    
    // 综合计算最终字体大小
    const finalSize = baseSp * screenSizeRatio * densityAdjustment * textTypeMultiplier * spaceConstraint;
    
    // 设置合理的字体大小范围
    const minSize = Math.min(16, baseSp * 0.8);
    const maxSize = baseSp * 2.5;
    
    return Math.min(maxSize, Math.max(minSize, finalSize));
}

// 获取响应式边距
function getResponsiveMargin() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    return Math.min(screenWidth, screenHeight) * 0.02;
}

// 应用响应式字体
function applyResponsiveFonts() {
    console.log('应用Android风格响应式字体');
    
    // 计算字体大小
    const titleSize = getResponsiveFontSize(32, TextElement.TITLE);
    const subtitleSize = getResponsiveFontSize(28, TextElement.SUBTITLE);
    const captionSize = getResponsiveFontSize(24, TextElement.CAPTION);
    const responsiveMargin = getResponsiveMargin();
    
    console.log('计算的字体大小:', {
        title: titleSize + 'px',
        subtitle: subtitleSize + 'px',
        caption: captionSize + 'px',
        margin: responsiveMargin + 'px'
    });
    
    // 应用到DOM元素
    const trackElement = document.getElementById('trackText');
    const artistElement = document.getElementById('artistText');
    const albumElement = document.getElementById('albumText');
    
    if (trackElement) {
        trackElement.style.fontSize = titleSize + 'px';
        trackElement.style.marginBottom = (responsiveMargin / 3) + 'px';
    }
    
    if (artistElement) {
        artistElement.style.fontSize = subtitleSize + 'px';
        artistElement.style.marginBottom = (responsiveMargin / 3) + 'px';
    }
    
    if (albumElement) {
        albumElement.style.fontSize = captionSize + 'px';
    }
}

// 监听屏幕尺寸变化
window.addEventListener('resize', function() {
    setTimeout(applyResponsiveFonts, 100);
});

// 监听屏幕方向变化
window.addEventListener('orientationchange', function() {
    setTimeout(applyResponsiveFonts, 200);
});

// 页面加载完成后应用字体
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(applyResponsiveFonts, 100);
});

// 导出函数供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getResponsiveFontSize,
        getResponsiveMargin,
        applyResponsiveFonts,
        TextElement
    };
} else if (typeof window !== 'undefined') {
    window.ResponsiveFonts = {
        getResponsiveFontSize,
        getResponsiveMargin,
        applyResponsiveFonts,
        TextElement
    };
}