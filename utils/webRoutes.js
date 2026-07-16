"use strict";

const fs = require("fs").promises;

function registerWebRoutes(app, options) {
  const artworkSaveDir = options.artworkSaveDir;

  app.get("/roonapi/getImage", function(req, res) {
    const imageKey = typeof req.query.image_key === "string" ? req.query.image_key.trim() : "";
    const albumName = typeof req.query.albumName === "string"
      ? req.query.albumName.trim().slice(0, 300)
      : "";

    if (!imageKey || imageKey.length > 256) {
      res.status(400).json({ error: "image_key 参数无效" });
      return;
    }

    const core = options.getCore();
    if (!core || !core.services || !core.services.RoonApiImage) {
      res.status(503).json({ error: "Roon Core未就绪或未配对" });
      return;
    }

    const fallbackMimeType = options.getImageMimeType();
    core.services.RoonApiImage.get_image(
      imageKey,
      { scale: "fit", width: 1080, height: 1080, format: fallbackMimeType },
      function(error, contentType, body) {
        if (error || !body) {
          options.logWarn("获取Roon图片失败:", imageKey, error || "empty body");
          res.status(502).json({ error: "获取图片失败" });
          return;
        }

        if (options.isAutoSaveEnabled() && albumName) {
          options.saveArtwork(body, albumName, imageKey)
            .then(function(result) {
              options.logDebug(result.saved ? "专辑封面已保存:" : "专辑封面已存在:", result.filepath);
            })
            .catch(function(saveError) {
              console.error("保存专辑封面失败:", saveError);
            });
        }

        res.set("Cache-Control", "public, max-age=3600");
        res.status(200).type(contentType || fallbackMimeType).send(body);
      }
    );
  });

  app.get("/roonapi/artworkStatus", async function(req, res) {
    try {
      const stats = await options.getImageStats(artworkSaveDir);
      res.json(Object.assign({
        enabled: options.isAutoSaveEnabled(),
        saveDir: artworkSaveDir
      }, stats));
    } catch (error) {
      console.error("获取封面状态失败:", error);
      res.status(500).json({ error: "获取状态失败" });
    }
  });

  app.get("/api/images", async function(req, res) {
    try {
      await fs.mkdir(artworkSaveDir, { recursive: true });
      const files = await fs.readdir(artworkSaveDir);
      res.json(files.filter(function(file) {
        return /\.(jpg|jpeg|png)$/i.test(file);
      }));
    } catch (error) {
      console.error("获取图片列表失败:", error);
      res.status(500).json({ error: "获取图片列表失败" });
    }
  });

  app.get("/api/health", function(req, res) {
    res.json({
      status: "ok",
      paired: options.isPaired(),
      zoneAvailable: options.hasActiveZone(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  });
}

module.exports = registerWebRoutes;
