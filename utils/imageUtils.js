const fs = require('fs');
const path = require('path');
const config = require('config');
const crypto = require('crypto');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

// 最大保存图片数量
const MAX_IMAGES = 300;

// 保存图片信息的文件
const IMAGE_INFO_FILE = 'image_info.json';

// 图片信息缓存
let imageInfoCache = null;

function getArtworkFormat() {
    const rawFormat = config.has('artwork.format') ? String(config.get('artwork.format')) : 'jpg';
    const format = rawFormat.toLowerCase();
    return ['jpg', 'jpeg', 'png'].includes(format) ? format : 'jpg';
}

// 清理文件名，移除非法字符
function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .trim();
}

// 计算文件的MD5哈希值
async function calculateMD5(buffer) {
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
}

// 加载图片信息
async function loadImageInfo(saveDir) {
    if (imageInfoCache) return imageInfoCache;

    const infoPath = path.join(saveDir, IMAGE_INFO_FILE);
    try {
        const data = await readFileAsync(infoPath, 'utf8');
        imageInfoCache = JSON.parse(data);
    } catch (error) {
        imageInfoCache = {};
    }
    return imageInfoCache;
}

// 保存图片信息
async function saveImageInfo(saveDir, imageInfo) {
    const infoPath = path.join(saveDir, IMAGE_INFO_FILE);
    await writeFileAsync(infoPath, JSON.stringify(imageInfo, null, 2));
    imageInfoCache = imageInfo;
}

// 确保目录存在
async function ensureDirectoryExists(directory) {
    try {
        await mkdirAsync(directory, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

// 获取目录中的所有图片文件信息
async function getImageFiles(directory) {
    const files = await readdirAsync(directory);
    const imageFiles = [];
    const imageInfo = await loadImageInfo(directory);

    for (const file of files) {
        if (/\.(jpg|jpeg|png)$/i.test(file)) {
            const filePath = path.join(directory, file);
            const stats = await statAsync(filePath);
            const info = imageInfo[file] || {};
            
            imageFiles.push({
                name: file,
                path: filePath,
                createTime: stats.birthtime,
                albumName: info.albumName,
                md5: info.md5
            });
        }
    }

    // 按时间排序，最新的在前面
    return imageFiles.sort((a, b) => b.createTime - a.createTime);
}

// 管理图片文件数量
async function manageImageCount(directory) {
    const imageFiles = await getImageFiles(directory);
    const imageInfo = await loadImageInfo(directory);
    
    // 如果超过最大数量，删除最旧的文件
    if (imageFiles.length >= MAX_IMAGES) {
        const filesToDelete = imageFiles.slice(MAX_IMAGES - 1);
        for (const file of filesToDelete) {
            try {
                await unlinkAsync(file.path);
                // 从图片信息中删除
                delete imageInfo[file.name];
                console.log(`删除旧图片: ${file.path}`);
            } catch (error) {
                console.error(`删除文件失败: ${file.path}`, error);
            }
        }
        // 保存更新后的图片信息
        await saveImageInfo(directory, imageInfo);
    }
}

// 检查图片是否已存在
async function isImageExists(filepath, imageBuffer, albumName) {
    try {
        const saveDir = path.dirname(filepath);
        const filename = path.basename(filepath);
        const imageInfo = await loadImageInfo(saveDir);
        
        // 计算当前图片的MD5
        const currentMD5 = await calculateMD5(imageBuffer);
        
        // 检查文件是否存在且MD5匹配
        if (imageInfo[filename]) {
            return imageInfo[filename].md5 === currentMD5;
        }
        
        return false;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

// 保存图片
async function saveArtwork(imageBuffer, albumName, imageKey) {
    try {
        // 获取配置的保存目录，如果没有配置则使用默认值
        const saveDir = config.has('artwork.saveDir') 
            ? config.get('artwork.saveDir') 
            : './images';
        const format = getArtworkFormat();
        
        // 确保目录存在
        await ensureDirectoryExists(saveDir);

        // 清理并构建文件名
        const sanitizedName = sanitizeFilename(albumName || 'unknown_album') || 'unknown_album';
        const keySuffix = imageKey ? `_${sanitizeFilename(String(imageKey))}` : '';
        const filename = `${sanitizedName}${keySuffix}.${format}`;
        const filepath = path.join(saveDir, filename);

        // 计算MD5并检查是否已存在
        if (await isImageExists(filepath, imageBuffer, albumName)) {
            console.log(`专辑封面已存在且内容相同，跳过保存: ${filepath}`);
            return true;
        }

        // 管理图片数量
        await manageImageCount(saveDir);

        // 保存文件
        await writeFileAsync(filepath, imageBuffer);
        
        // 更新图片信息
        const imageInfo = await loadImageInfo(saveDir);
        imageInfo[filename] = {
            albumName,
            md5: await calculateMD5(imageBuffer),
            savedAt: new Date().toISOString()
        };
        await saveImageInfo(saveDir, imageInfo);

        console.log(`专辑封面已保存: ${filepath}`);
        return true;
    } catch (error) {
        console.error('保存专辑封面失败:', error);
        return false;
    }
}

// 获取已保存的图片统计信息
async function getImageStats(saveDir) {
    const imageInfo = await loadImageInfo(saveDir);
    const totalImages = Object.keys(imageInfo).length;
    const oldestImage = Object.values(imageInfo)
        .reduce((oldest, current) => 
            (!oldest || new Date(current.savedAt) < new Date(oldest.savedAt)) 
                ? current 
                : oldest
        , null);
    
    return {
        totalImages,
        oldestImage: oldestImage ? {
            albumName: oldestImage.albumName,
            savedAt: oldestImage.savedAt
        } : null
    };
}

module.exports = {
    saveArtwork,
    getImageStats,
    MAX_IMAGES
}; 
