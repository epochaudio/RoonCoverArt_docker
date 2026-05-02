"use strict";
// Setup general variables
var defaultListenPort = 3666;

var core = null;
var transport = null;
var pairStatus = false;
var zoneStatus = [];
var zoneList = [];

// Change to working directory
try {
  process.chdir(__dirname);
  console.log(`Working directory: ${process.cwd()}`);
} catch (err) {
  console.error(`chdir: ${err}`);
}

// Read command line options
var commandLineArgs = require("command-line-args");
var getUsage = require("command-line-usage");

var optionDefinitions = [
  {
    name: "help",
    alias: "h",
    description: "Display this usage guide.",
    type: Boolean
  },
  {
    name: "port",
    alias: "p",
    description: "Specify the port the server listens on.",
    type: Number
  }
];

var options = commandLineArgs(optionDefinitions, { partial: true });

var usage = getUsage([
  {
    header: "Roon Cover Art",
    content:
      "Roon封面艺术.\n\nUsage: {bold node app.js <options>}"
  },
  {
    header: "Options",
    optionList: optionDefinitions
  },
  {
    content:
      "Project home: {underline https://shop236654229.taobao.com/}"
  }
]);

if (options.help) {
  console.log(usage);
  process.exit();
}

// Read config file
var config = require("config");
var fsPromises = require("fs").promises;
var {
  saveArtwork,
  getImageStats
} = require("./utils/imageUtils");

function getBooleanConfig(path, fallbackValue) {
  if (!config.has(path)) {
    return fallbackValue;
  }

  var value = config.get(path);
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    var normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  return !!value;
}

function getNumericConfig(path, fallbackValue) {
  if (!config.has(path)) {
    return fallbackValue;
  }

  var rawValue = config.get(path);
  var numericValue = Number(rawValue);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue;
  }

  return fallbackValue;
}

function getStringConfig(path, fallbackValue) {
  if (!config.has(path)) {
    return fallbackValue;
  }

  var value = config.get(path);
  if (typeof value === "undefined" || value === null) {
    return fallbackValue;
  }

  return String(value).trim();
}

function getListConfig(path, fallbackValue) {
  if (!config.has(path)) {
    return fallbackValue;
  }

  var value = config.get(path);
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return String(item).trim();
    }).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map(function(item) {
      return item.trim();
    }).filter(Boolean);
  }

  return fallbackValue;
}

function getArtworkFormat() {
  if (!config.has("artwork.format")) {
    return "jpg";
  }

  var rawValue = String(config.get("artwork.format")).toLowerCase();
  if (rawValue === "png") {
    return "png";
  }

  return "jpg";
}

function getRoonImageFormatMime() {
  return getArtworkFormat() === "png" ? "image/png" : "image/jpeg";
}

var configPort = getNumericConfig("server.port", defaultListenPort);
var allowedOrigins = getListConfig("access.allowedOrigins", []);
var configuredLogLevel = getStringConfig("logging.level", "info").toLowerCase();
var logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};
var activeLogLevel = Object.prototype.hasOwnProperty.call(logLevels, configuredLogLevel)
  ? configuredLogLevel
  : "info";

function shouldLog(level) {
  return logLevels[level] <= logLevels[activeLogLevel];
}

function logDebug() {
  if (shouldLog("debug")) {
    console.log.apply(console, arguments);
  }
}

function logInfo() {
  if (shouldLog("info")) {
    console.log.apply(console, arguments);
  }
}

function logWarn() {
  if (shouldLog("warn")) {
    console.warn.apply(console, arguments);
  }
}

function isSeekOnlyZoneChange(data) {
  var keys = Object.keys(data || {});
  return keys.length > 0 && keys.every(function(key) {
    return key === "zones_seek_changed";
  });
}

function normalizeOrigin(origin) {
  return String(origin || "").replace(/\/+$/, "");
}

function getRequestOrigin(req) {
  var forwardedProto = req.headers["x-forwarded-proto"];
  var proto = forwardedProto ? String(forwardedProto).split(",")[0].trim() : "http";
  var host = req.headers.host || "";
  return host ? proto + "://" + host : "";
}

function isRequestOriginAllowed(req) {
  var origin = req.headers.origin;
  var allowAnyOrigin = allowedOrigins.indexOf("*") !== -1;

  if (!origin || allowAnyOrigin) {
    return true;
  }

  if (normalizeOrigin(origin) === normalizeOrigin(getRequestOrigin(req))) {
    return true;
  }

  return allowedOrigins.indexOf(origin) !== -1;
}

// Determine listen port
if (options.port) {
  var listenPort = options.port;
} else if (configPort) {
  var listenPort = configPort;
} else {
  var listenPort = defaultListenPort;
}
// Setup Express
var express = require("express");
var http = require("http");
var bodyParser = require("body-parser");

var app = express();
app.use(function(req, res, next) {
  var origin = req.headers.origin;
  var allowAnyOrigin = allowedOrigins.indexOf("*") !== -1;
  var originAllowed = isRequestOriginAllowed(req);

  if (originAllowed) {
    if (origin) {
      res.header("Access-Control-Allow-Origin", allowAnyOrigin ? "*" : origin);
      res.header("Vary", "Origin");
    } else if (allowAnyOrigin) {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  } else {
    logWarn("拒绝未允许来源的跨域请求:", origin);
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(originAllowed ? 204 : 403);
    return;
  }

  next();
});
app.use(express.static("public", {
    setHeaders: function(res, path) {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));
app.use(bodyParser.json());

// 添加 images 目录的静态文件服务
app.use('/images', express.static('images'));

// Setup Socket IO
var server = http.createServer(app);
var SocketIOServer = require("socket.io").Server;
var io = new SocketIOServer(server, {
	  cors: {
	    origin: true,
	    methods: ["GET", "POST"],
	    allowedHeaders: ["Content-Type"]
	  },
  allowRequest: function(req, callback) {
    callback(null, isRequestOriginAllowed(req));
  }
	});

server.listen(listenPort, function() {
  console.log("Listening on port " + listenPort);
});

// Setup Roon
var RoonApi = require("node-roon-api");
var RoonApiImage = require("node-roon-api-image");
var RoonApiStatus = require("node-roon-api-status");
var RoonApiTransport = require("node-roon-api-transport");
var RoonApiBrowse = require("node-roon-api-browse");
var RoonApiSettings = require("node-roon-api-settings");

// 定义设置变量
var settings = {
    output: undefined
};

// 创建设置布局
function makelayout(settings) {
    var l = {
        values:    settings,
        layout:    [],
        has_error: false
    };

    l.layout.push({
        type:    "zone",
        title:   "选择播放区域",
        setting: "output",
    });

    return l;
}

function zoneHasSelectedOutput(zone) {
    return !!(settings.output && zone && zone.outputs && zone.outputs.some(function(output) {
        return output.output_id === settings.output.output_id;
    }));
}

function getActiveZone() {
    if (!zoneStatus || zoneStatus.length === 0) {
        return null;
    }

    if (settings.output) {
        return zoneStatus.find(zoneHasSelectedOutput) || null;
    }

    return zoneStatus[0];
}

function emitPlaybackState(zone) {
    if (!zone) {
        io.emit("zoneStatus", []);
        io.emit("notPlaying", { state: "unavailable" });
        return;
    }

    if (settings.output) {
        io.emit("zoneStatus", [zone]);
    } else {
        io.emit("zoneStatus", zoneStatus);
    }

    if (zone.state === "playing" && zone.now_playing) {
        logDebug('播放信息:', {
            image_key: zone.now_playing.image_key,
            three_line: zone.now_playing.three_line,
            state: zone.state
        });
        io.emit("nowplaying", {
            ...zone.now_playing,
            state: "playing"
        });
    } else {
        io.emit("notPlaying", { state: zone.state || "unknown" });
    }
}

// 创建 Roon API 实例
var roon = new RoonApi({
    extension_id:        "com.epochaudio.coverart",
    display_name:        "CoverArt_docker",
    display_version:     "5.0.2",
    publisher:           "门耳朵制作",
    email:              "masked",
    website:            "https://shop236654229.taobao.com/",

    core_paired: function(_core) {
        console.log('Roon Core 配对成功');
        core = _core;
        pairStatus = true;

        // 初始化 transport 服务
        transport = _core.services.RoonApiTransport;
        if (!transport) {
            console.error('Transport service 不可用');
            svc_status.set_status("Transport服务不可用", true);
            return;
        }

        // 订阅 zones 变化
        transport.subscribe_zones((cmd, data) => {
            var hasPlaybackRelevantChange = false;

            if (!isSeekOnlyZoneChange(data)) {
                logDebug('收到zones订阅响应:', cmd, data);
            }
            
            try {
                if (cmd == "Subscribed") {
                    zoneStatus = data.zones || [];
                    emitPlaybackState(getActiveZone());
                } else if (cmd == "Changed") {
                    if (data.zones_removed) {
                        data.zones_removed.forEach(zone => {
                            zoneStatus = zoneStatus.filter(z => z.zone_id !== zone.zone_id);
                        });
                        hasPlaybackRelevantChange = true;
                    }
                    if (data.zones_added) {
                        zoneStatus = [...zoneStatus, ...data.zones_added];
                        hasPlaybackRelevantChange = true;
                    }
                    if (data.zones_changed) {
                        data.zones_changed.forEach(changed => {
                            const idx = zoneStatus.findIndex(z => z.zone_id === changed.zone_id);
                            if (idx !== -1) {
                                zoneStatus[idx] = changed;
                                hasPlaybackRelevantChange = true;
                                logDebug("处理zone变更:", {
                                    zone_id: changed.zone_id,
                                    state: changed.state,
                                    has_settings_output: !!settings.output
                                });
                            }
                        });
                    }

                    if (hasPlaybackRelevantChange) {
                        emitPlaybackState(getActiveZone());
                    }
                }
            } catch (err) {
                console.error('处理zones更新时出错:', err);
            }
        });

        // 通知客户端
        io.emit("pairStatus", { pairEnabled: true });
        svc_status.set_status("已连接到Roon Core", false);
    },

    core_unpaired: function(_core) {
        console.log('Roon Core 配对断开');
        
        // 重置状态
        core = null;
        transport = null;
        pairStatus = false;
        zoneStatus = [];
        zoneList = [];
        
        // 通知客户端
        io.emit("pairStatus", { pairEnabled: false });
        svc_status.set_status("等待配对", true);
    }
});

// 创建状态服务
var svc_status = new RoonApiStatus(roon);

// 创建设置服务
var svc_settings = new RoonApiSettings(roon, {
    get_settings: function(cb) {
        cb(makelayout(settings));
    },
    save_settings: function(req, isdryrun, new_settings) {
        let l = makelayout(new_settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });

        if (!l.has_error && !isdryrun) {
            settings = l.values;
            roon.save_config("settings", settings);
            
            // 如果已配对，更新区域状态
            if (pairStatus) {
                console.log('更新选中的区域:', settings.output);
                emitPlaybackState(getActiveZone());
            }
        }
    }
});

// 初始化服务
roon.init_services({
    required_services: [RoonApiTransport, RoonApiImage, RoonApiBrowse],
    provided_services: [svc_settings, svc_status]
});

// 设置初始状态
svc_status.set_status("扩展已启用", false);

// 加载保存的设置
settings = roon.load_config("settings") || {
    output: undefined
};

// 开始发现 Roon Core
roon.start_discovery();

// Remove duplicates from zoneList array
function removeDuplicateList(array, property) {
  var x;
  var new_array = [];
  var lookup = {};
  for (x in array) {
    lookup[array[x][property]] = array[x];
  }

  for (x in lookup) {
    new_array.push(lookup[x]);
  }

  zoneList = new_array;
  io.emit("zoneList", zoneList);
}

// Remove duplicates from zoneStatus array
function removeDuplicateStatus(array, property) {
  var x;
  var new_array = [];
  var lookup = {};
  for (x in array) {
    lookup[array[x][property]] = array[x];
  }

  for (x in lookup) {
    new_array.push(lookup[x]);
  }

  zoneStatus = new_array;
  io.emit("zoneStatus", zoneStatus);
}

function refresh_browse(zone_id, options, callback) {
  options = Object.assign(
    {
      hierarchy: "browse",
      zone_or_output_id: zone_id
    },
    options
  );

  core.services.RoonApiBrowse.browse(options, function(error, payload) {
    if (error) {
      console.log(error, payload);
      return;
    }

    if (payload.action == "list") {
      var items = [];
      if (payload.list.display_offset > 0) {
        var listoffset = payload.list.display_offset;
      } else {
        var listoffset = 0;
      }
      core.services.RoonApiBrowse.load(
        {
          hierarchy: "browse",
          offset: listoffset,
          set_display_offset: listoffset
        },
        function(error, payload) {
          callback(payload);
        }
      );
    }
  });
}

function load_browse(listoffset, callback) {
  core.services.RoonApiBrowse.load(
    {
      hierarchy: "browse",
      offset: listoffset,
      set_display_offset: listoffset
    },
    function(error, payload) {
      callback(payload);
    }
  );
}

function isBrowseServiceReady() {
  return !!(core && core.services && core.services.RoonApiBrowse);
}

// ---------------------------- WEB SOCKET --------------
io.on("connection", function(socket) {
  function runTransportAction(actionName, fn) {
    if (!transport) {
      console.log("忽略Socket操作，transport未就绪:", actionName);
      socket.emit("serverError", { error: "未连接到 Roon Core" });
      return;
    }

    try {
      fn();
    } catch (err) {
      console.error("执行Socket操作失败:", actionName, err);
      socket.emit("serverError", { error: "执行操作失败" });
    }
  }

  // 发送当前配对状态
  socket.emit("pairStatus", { pairEnabled: pairStatus });
  
  // 如果已配对且有区域信息，发送区域状态
  if (pairStatus && zoneStatus.length > 0) {
    var activeZone = getActiveZone();
    socket.emit("zoneStatus", settings.output && activeZone ? [activeZone] : zoneStatus);
  }

  socket.on("getZone", function() {
    if (pairStatus && zoneStatus.length > 0) {
      var activeZone = getActiveZone();
      socket.emit("zoneStatus", settings.output && activeZone ? [activeZone] : zoneStatus);
    } else {
      console.log('Zones未就绪或为空');
      socket.emit("zoneStatus", []);
    }
  });

  socket.on("getPairStatus", function() {
    socket.emit("pairStatus", { pairEnabled: pairStatus });
  });

  socket.on("changeVolume", function(msg) {
    runTransportAction("changeVolume", function() {
      if (!msg || !msg.output_id || typeof msg.volume === "undefined") {
        throw new Error("changeVolume参数无效");
      }
      transport.change_volume(msg.output_id, "absolute", msg.volume);
    });
  });

  socket.on("changeSetting", function(msg) {
    var transportSettings = {};

    if (!msg || !msg.zone_id || !msg.setting) {
      socket.emit("serverError", { error: "changeSetting参数无效" });
      return;
    }

    if (msg.setting == "shuffle") {
      transportSettings.shuffle = msg.value;
    } else if (msg.setting == "auto_radio") {
      transportSettings.auto_radio = msg.value;
    } else if (msg.setting == "loop") {
      transportSettings.loop = msg.value;
    } else {
      socket.emit("serverError", { error: "不支持的设置项" });
      return;
    }

    runTransportAction("changeSetting", function() {
      transport.change_settings(msg.zone_id, transportSettings, function(error) {
        if (error) {
          console.error("change_settings失败:", error);
          socket.emit("serverError", { error: "修改设置失败" });
        }
      });
    });
  });

  socket.on("goPrev", function(msg) {
    runTransportAction("goPrev", function() {
      transport.control(msg, "previous");
    });
  });

  socket.on("goNext", function(msg) {
    runTransportAction("goNext", function() {
      transport.control(msg, "next");
    });
  });

  socket.on("goPlayPause", function(msg) {
    runTransportAction("goPlayPause", function() {
      transport.control(msg, "playpause");
    });
  });

  socket.on("goPlay", function(msg) {
    runTransportAction("goPlay", function() {
      transport.control(msg, "play");
    });
  });

  socket.on("goPause", function(msg) {
    runTransportAction("goPause", function() {
      transport.control(msg, "pause");
    });
  });

  socket.on("goStop", function(msg) {
    runTransportAction("goStop", function() {
      transport.control(msg, "stop");
    });
  });
});

// Web Routes
app.get("/", function(req, res) {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/roonapi/getImage", function(req, res) {
  console.log('收到图片请求:', {
    image_key: req.query.image_key,
    albumName: req.query.albumName
  });

  if (!core || !core.services || !core.services.RoonApiImage) {
    console.log('Roon Core未就绪或未配对');
    res.status(500).json({ error: 'Roon Core未就绪或未配对' });
    return;
  }

  var imageMimeType = getRoonImageFormatMime();
  core.services.RoonApiImage.get_image(
    req.query.image_key,
    { scale: "fit", width: 1080, height: 1080, format: imageMimeType },
    async function(cb, contentType, body) {
      console.log('获取图片结果:', {
        success: !!body,
        contentType,
        size: body ? body.length : 0
      });

      if (!body) {
        console.log('获取图片失败');
        res.status(500).json({ error: '获取图片失败' });
        return;
      }

      // 检查是否启用了自动保存功能
      const autoSave = getBooleanConfig("artwork.autoSave", true);
      console.log('自动保存状态:', {
        autoSave,
        hasAlbumName: !!req.query.albumName,
        image_key: req.query.image_key
      });
      
      if (autoSave && req.query.albumName) {
        try {
          console.log('开始保存专辑封面:', req.query.albumName);
          await saveArtwork(body, req.query.albumName, req.query.image_key);
          console.log('专辑封面保存流程完成');
        } catch (error) {
          console.error('保存专辑封面时出错:', error);
        }
      }
      
      res.contentType = contentType;
      res.writeHead(200, { "Content-Type": contentType || imageMimeType });
      res.end(body, "binary");
    }
  );
});

app.get("/roonapi/getImage4k", function(req, res) {
  if (!core || !core.services || !core.services.RoonApiImage) {
    console.log('Roon Core未就绪或未配对');
    res.status(500).json({ error: 'Roon Core未就绪或未配对' });
    return;
  }
  
  var imageMimeType = getRoonImageFormatMime();
  core.services.RoonApiImage.get_image(
    req.query.image_key,
    { scale: "fit", width: 2160, height: 2160, format: imageMimeType },
    function(cb, contentType, body) {
      if (!body) {
        console.log('获取图片失败');
        res.status(500).json({ error: '获取图片失败' });
        return;
      }
      
      res.contentType = contentType;
      res.writeHead(200, { "Content-Type": contentType || imageMimeType });
      res.end(body, "binary");
    }
  );
});

app.post("/roonapi/goRefreshBrowse", function(req, res) {
  if (!isBrowseServiceReady()) {
    res.status(503).json({ error: "Roon Browse服务未就绪" });
    return;
  }
  refresh_browse(req.body.zone_id, req.body.options, function(payload) {
    res.send({ data: payload });
  });
});

app.post("/roonapi/goLoadBrowse", function(req, res) {
  if (!isBrowseServiceReady()) {
    res.status(503).json({ error: "Roon Browse服务未就绪" });
    return;
  }
  load_browse(req.body.listoffset, function(payload) {
    res.send({ data: payload });
  });
});

app.use(
  "/jquery/jquery.min.js",
  express.static(__dirname + "/node_modules/jquery/dist/jquery.min.js")
);

app.use(
  "/js-cookie/js.cookie.js",
  express.static(__dirname + "/node_modules/js-cookie/src/js.cookie.js")
);

// 添加状态查看路由
app.get("/roonapi/artworkStatus", async function(req, res) {
  try {
    const saveDir = config.has('artwork.saveDir') 
      ? config.get('artwork.saveDir') 
      : './images';
    
    const stats = await getImageStats(saveDir);
    res.json({
      enabled: getBooleanConfig("artwork.autoSave", true),
      saveDir: saveDir,
      ...stats
    });
  } catch (error) {
    console.error('获取状态失败:', error);
    res.status(500).json({ error: '获取状态失败' });
  }
});

// 添加获取图片列表的路由
app.get("/api/images", async function(req, res) {
  try {
    const saveDir = config.has('artwork.saveDir') ? config.get('artwork.saveDir') : './images';
    await fsPromises.mkdir(saveDir, { recursive: true });
    const files = await fsPromises.readdir(saveDir);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    res.json(imageFiles);
  } catch (error) {
    console.error('获取图片列表失败:', error);
    res.status(500).json({ error: '获取图片列表失败' });
  }
});

app.get("/api/status", function(req, res) {
    if (!core || !transport) {
        res.status(500).json({ error: "未连接到 Roon Core" });
        return;
    }

    // 如果有选定的区域，返回其状态
    if (settings.output) {
        const zone = zoneStatus.find(z => 
            z.outputs.some(o => o.output_id === settings.output.output_id)
        );
        
        if (zone && zone.state === "playing" && zone.now_playing) {
            res.json({
                is_playing: true,
                ...zone.now_playing
            });
            return;
        }
    }
    
    res.json({ is_playing: false });
});

app.get("/api/pair", function(req, res) {
    res.json({ pairEnabled: pairStatus });
});

app.get("/api/zones", function(req, res) {
    if (!core || !transport) {
        res.status(500).json({ error: "未连接到 Roon Core" });
        return;
    }
    res.json(zoneStatus);
});
