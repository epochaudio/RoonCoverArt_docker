"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  saveArtwork,
  getImageStats,
  sanitizeFilename
} = require("../utils/imageStore");

async function createTempDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "coverart-image-store-"));
  t.after(function() {
    return fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("saveArtwork detects an identical image", async function(t) {
  const directory = await createTempDirectory(t);
  const options = { saveDir: directory, maxImages: 5, format: "jpg" };
  const image = Buffer.from("same-image");

  const first = await saveArtwork(image, "Album", "image-key", options);
  const second = await saveArtwork(image, "Album", "image-key", options);

  assert.equal(first.saved, true);
  assert.equal(second.saved, false);
  assert.equal(second.duplicate, true);
});

test("concurrent saves keep the image cap and valid metadata", async function(t) {
  const directory = await createTempDirectory(t);
  const options = { saveDir: directory, maxImages: 5, format: "jpg" };

  await Promise.all(Array.from({ length: 20 }, function(_, index) {
    return saveArtwork(
      Buffer.from("image-" + index),
      "Album " + index,
      "key-" + index,
      options
    );
  }));

  const files = await fs.readdir(directory);
  const imageFiles = files.filter(function(file) { return file.endsWith(".jpg"); });
  const temporaryFiles = files.filter(function(file) { return file.endsWith(".tmp"); });
  const metadata = JSON.parse(await fs.readFile(path.join(directory, "image_info.json"), "utf8"));
  const stats = await getImageStats(directory);

  assert.equal(imageFiles.length, 5);
  assert.equal(Object.keys(metadata).length, 5);
  assert.equal(stats.totalImages, 5);
  assert.deepEqual(temporaryFiles, []);
  imageFiles.forEach(function(filename) {
    assert.ok(metadata[filename], "metadata missing for " + filename);
  });
});

test("sanitizeFilename removes path characters and respects UTF-8 byte limits", function() {
  const filename = sanitizeFilename("../唱片/名称:*?<>|  test", 24);

  assert.equal(/[<>:"/\\|?*]/.test(filename), false);
  assert.ok(Buffer.byteLength(filename, "utf8") <= 24);
  assert.equal(filename.startsWith("."), false);
});
