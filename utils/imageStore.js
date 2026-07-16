"use strict";

const fs = require("fs").promises;
const path = require("path");
const config = require("config");
const crypto = require("crypto");

const MAX_IMAGES = 300;
const IMAGE_INFO_FILE = "image_info.json";
const imageInfoCaches = new Map();
const saveQueues = new Map();

function getSaveDirectory(options) {
  const configuredDirectory = options && options.saveDir
    ? options.saveDir
    : (config.has("artwork.saveDir") ? config.get("artwork.saveDir") : "./images");
  return path.resolve(String(configuredDirectory));
}

function getArtworkFormat(options) {
  const rawFormat = options && options.format
    ? options.format
    : (config.has("artwork.format") ? config.get("artwork.format") : "jpg");
  const format = String(rawFormat).toLowerCase();
  return ["jpg", "jpeg", "png"].includes(format) ? format : "jpg";
}

function truncateUtf8(value, maxBytes) {
  const characters = Array.from(String(value));
  while (characters.length > 0 && Buffer.byteLength(characters.join(""), "utf8") > maxBytes) {
    characters.pop();
  }
  return characters.join("");
}

function sanitizeFilename(filename, maxBytes) {
  const sanitized = String(filename || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "")
    .trim();
  return truncateUtf8(sanitized, maxBytes || 160);
}

function calculateMD5(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

async function loadImageInfo(saveDir) {
  const directory = path.resolve(saveDir);
  if (imageInfoCaches.has(directory)) return imageInfoCaches.get(directory);

  const infoPath = path.join(directory, IMAGE_INFO_FILE);
  let imageInfo = {};
  try {
    imageInfo = JSON.parse(await fs.readFile(infoPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("图片元数据无法读取，将重新建立:", infoPath, error.message);
    }
  }

  imageInfoCaches.set(directory, imageInfo);
  return imageInfo;
}

async function writeFileAtomic(filepath, content) {
  const temporaryPath = filepath + "." + process.pid + "." + Date.now() + ".tmp";
  try {
    await fs.writeFile(temporaryPath, content);
    await fs.rename(temporaryPath, filepath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(function() {});
    throw error;
  }
}

async function saveImageInfo(saveDir, imageInfo) {
  const directory = path.resolve(saveDir);
  await writeFileAtomic(path.join(directory, IMAGE_INFO_FILE), JSON.stringify(imageInfo, null, 2));
  imageInfoCaches.set(directory, imageInfo);
}

async function getImageFiles(directory) {
  const files = await fs.readdir(directory);
  const imageInfo = await loadImageInfo(directory);
  const imageFiles = [];

  for (const file of files) {
    if (!/\.(jpg|jpeg|png)$/i.test(file)) continue;
    const filePath = path.join(directory, file);
    try {
      const stats = await fs.stat(filePath);
      const info = imageInfo[file] || {};
      imageFiles.push({
        name: file,
        path: filePath,
        createTime: stats.birthtimeMs || stats.mtimeMs,
        albumName: info.albumName,
        md5: info.md5
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return imageFiles.sort(function(a, b) { return b.createTime - a.createTime; });
}

async function manageImageCount(directory, maxImages) {
  const imageFiles = await getImageFiles(directory);
  const imageInfo = await loadImageInfo(directory);
  if (imageFiles.length < maxImages) return;

  for (const file of imageFiles.slice(maxImages - 1)) {
    await fs.unlink(file.path).catch(function(error) {
      if (error.code !== "ENOENT") throw error;
    });
    delete imageInfo[file.name];
  }

  await saveImageInfo(directory, imageInfo);
}

async function imageMatchesMetadata(filepath, md5) {
  const saveDir = path.dirname(filepath);
  const filename = path.basename(filepath);
  const imageInfo = await loadImageInfo(saveDir);
  if (!imageInfo[filename] || imageInfo[filename].md5 !== md5) return false;

  try {
    await fs.access(filepath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      delete imageInfo[filename];
      return false;
    }
    throw error;
  }
}

function enqueueSave(directory, task) {
  const previous = saveQueues.get(directory) || Promise.resolve();
  const current = previous.catch(function() {}).then(task);
  saveQueues.set(directory, current);
  return current.finally(function() {
    if (saveQueues.get(directory) === current) saveQueues.delete(directory);
  });
}

async function saveArtworkUnlocked(imageBuffer, albumName, imageKey, options) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new TypeError("封面数据必须是非空 Buffer");
  }

  const saveDir = getSaveDirectory(options);
  const format = getArtworkFormat(options);
  const maxImages = Number.isInteger(options && options.maxImages) && options.maxImages > 0
    ? options.maxImages
    : MAX_IMAGES;
  await fs.mkdir(saveDir, { recursive: true });

  const sanitizedName = sanitizeFilename(albumName || "unknown_album", 150) || "unknown_album";
  const sanitizedKey = sanitizeFilename(imageKey || "", 64);
  const keySuffix = sanitizedKey ? "_" + sanitizedKey : "";
  const filename = sanitizedName + keySuffix + "." + format;
  const filepath = path.join(saveDir, filename);
  const md5 = calculateMD5(imageBuffer);

  if (await imageMatchesMetadata(filepath, md5)) {
    return { saved: false, duplicate: true, filepath: filepath };
  }

  await manageImageCount(saveDir, maxImages);
  await writeFileAtomic(filepath, imageBuffer);

  const imageInfo = await loadImageInfo(saveDir);
  imageInfo[filename] = {
    albumName: albumName,
    md5: md5,
    savedAt: new Date().toISOString()
  };
  await saveImageInfo(saveDir, imageInfo);
  return { saved: true, duplicate: false, filepath: filepath };
}

function saveArtwork(imageBuffer, albumName, imageKey, options) {
  const saveDir = getSaveDirectory(options);
  return enqueueSave(saveDir, function() {
    return saveArtworkUnlocked(imageBuffer, albumName, imageKey, options || {});
  });
}

async function getImageStats(saveDir) {
  const directory = path.resolve(saveDir || getSaveDirectory());
  const entries = Object.values(await loadImageInfo(directory));
  const oldestImage = entries.reduce(function(oldest, current) {
    return !oldest || new Date(current.savedAt) < new Date(oldest.savedAt) ? current : oldest;
  }, null);

  return {
    totalImages: entries.length,
    oldestImage: oldestImage ? {
      albumName: oldestImage.albumName,
      savedAt: oldestImage.savedAt
    } : null
  };
}

module.exports = {
  saveArtwork: saveArtwork,
  getImageStats: getImageStats,
  sanitizeFilename: sanitizeFilename,
  MAX_IMAGES: MAX_IMAGES
};
