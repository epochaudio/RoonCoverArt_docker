"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const registerWebRoutes = require("../utils/webRoutes");

async function startTestServer(t) {
  const artworkSaveDir = await fs.mkdtemp(path.join(os.tmpdir(), "coverart-routes-"));
  const app = express();
  registerWebRoutes(app, {
    artworkSaveDir,
    getCore: function() { return null; },
    getImageMimeType: function() { return "image/jpeg"; },
    isAutoSaveEnabled: function() { return true; },
    saveArtwork: async function() {},
    getImageStats: async function() { return { totalImages: 0, oldestImage: null }; },
    isPaired: function() { return false; },
    hasActiveZone: function() { return false; },
    logDebug: function() {},
    logWarn: function() {}
  });

  const server = await new Promise(function(resolve) {
    const listener = app.listen(0, "127.0.0.1", function() { resolve(listener); });
  });
  t.after(async function() {
    await new Promise(function(resolve, reject) {
      server.close(function(error) { error ? reject(error) : resolve(); });
    });
    await fs.rm(artworkSaveDir, { recursive: true, force: true });
  });

  return {
    artworkSaveDir,
    baseUrl: "http://127.0.0.1:" + server.address().port
  };
}

test("health route reports liveness separately from pairing readiness", async function(t) {
  const fixture = await startTestServer(t);
  const response = await fetch(fixture.baseUrl + "/api/health");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.paired, false);
  assert.equal(body.zoneAvailable, false);
  assert.equal(typeof body.uptimeSeconds, "number");
});

test("image proxy validates parameters and Roon readiness", async function(t) {
  const fixture = await startTestServer(t);

  const missingKey = await fetch(fixture.baseUrl + "/roonapi/getImage");
  const unavailableCore = await fetch(fixture.baseUrl + "/roonapi/getImage?image_key=cover-1");

  assert.equal(missingKey.status, 400);
  assert.equal(unavailableCore.status, 503);
});

test("image list exposes only supported artwork files", async function(t) {
  const fixture = await startTestServer(t);
  await fs.writeFile(path.join(fixture.artworkSaveDir, "one.jpg"), "image");
  await fs.writeFile(path.join(fixture.artworkSaveDir, "two.png"), "image");
  await fs.writeFile(path.join(fixture.artworkSaveDir, "image_info.json"), "{}");

  const response = await fetch(fixture.baseUrl + "/api/images");
  const files = (await response.json()).sort();

  assert.equal(response.status, 200);
  assert.deepEqual(files, ["one.jpg", "two.png"]);
});
