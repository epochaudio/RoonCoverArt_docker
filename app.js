"use strict";
// Setup general variables
var defaultListenPort = 3666;

var core = null;
var transport = null;
var pairStatus = false;
var zoneStatus = [];

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
var path = require("path");
var {
  saveArtwork,
  getImageStats
} = require("./utils/imageStore");
var {
  applyZoneChanges,
  hasZoneListChanges
} = require("./utils/zoneUtils");
var {
  startKeyboardInput
} = require("./utils/keyboardInput");

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

function getObjectConfig(path, fallbackValue) {
  if (!config.has(path)) {
    return fallbackValue;
  }

  var value = config.get(path);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
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
var artworkSaveDir = path.resolve(getStringConfig("artwork.saveDir", "./images"));
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
app.use(express.static("public"));

// 添加 images 目录的静态文件服务
app.use("/images", express.static(artworkSaveDir, { maxAge: "1h" }));

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

function getClientZoneStatus() {
    var activeZone = getActiveZone();
    return activeZone ? [activeZone] : [];
}

function emitPlaybackState(zone) {
    io.emit("zoneStatus", zone ? [zone] : []);
}

// 创建 Roon API 实例
var roon = new RoonApi({
    extension_id:        "com.epochaudio.coverart",
    display_name:        "CoverArt_docker",
    display_version:     "5.0.4",
    publisher:           "门耳朵制作",
    email:              "masked",
    website:            "https://shop236654229.taobao.com/",
    log_level:          "none",

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
            if (!isSeekOnlyZoneChange(data)) {
                logDebug('收到zones订阅响应:', cmd, data);
            }
            
            try {
                if (cmd === "Subscribed") {
                    zoneStatus = data.zones || [];
                    emitPlaybackState(getActiveZone());
                } else if (cmd === "Changed" && hasZoneListChanges(data)) {
                    zoneStatus = applyZoneChanges(zoneStatus, data);
                    emitPlaybackState(getActiveZone());
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
    required_services: [RoonApiTransport, RoonApiImage],
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

var transportControlMap = {
  previous: "previous",
  next: "next",
  playpause: "playpause",
  play: "play",
  pause: "pause",
  stop: "stop"
};

var volumeControlMap = {
  volumeup: 1,
  volumedown: -1
};

function getDefaultControlZoneId() {
  var activeZone = getActiveZone();
  return activeZone ? activeZone.zone_id : null;
}

function getDefaultControlOutput() {
  var activeZone = getActiveZone();
  var outputs = activeZone && Array.isArray(activeZone.outputs) ? activeZone.outputs : [];

  if (settings.output && settings.output.output_id) {
    var selectedOutput = outputs.find(function(output) {
      return output && output.output_id === settings.output.output_id;
    });

    if (selectedOutput) {
      return selectedOutput;
    }

    if (outputs.length === 0) {
      return settings.output;
    }
  }

  return outputs.find(function(output) {
    return output && output.output_id && output.volume;
  }) || outputs[0] || null;
}

function isKeyboardVolumeAction(action) {
  return action === "volumeup" || action === "volumedown" || action === "mute";
}

function runRoonControl(action, zoneId, callback) {
  var command = transportControlMap[action];

  if (!command) {
    var invalidActionError = new Error("不支持的控制命令: " + action);
    if (callback) {
      callback(invalidActionError);
    }
    return false;
  }

  if (!transport) {
    var transportError = new Error("未连接到 Roon Core");
    if (callback) {
      callback(transportError);
    }
    return false;
  }

  var targetZoneId = zoneId || getDefaultControlZoneId();
  if (!targetZoneId) {
    var zoneError = new Error("没有可控制的播放区域");
    if (callback) {
      callback(zoneError);
    }
    return false;
  }

  try {
    transport.control({ zone_id: targetZoneId }, command, function(error) {
      if (error) {
        logWarn("Roon控制命令执行失败:", action, targetZoneId, error);
      } else {
        logDebug("Roon控制命令已发送:", action, targetZoneId);
      }

      if (callback) {
        callback(error || null);
      }
    });
  } catch (err) {
    if (callback) {
      callback(err);
    }
    return false;
  }

  return true;
}

function runRoonVolumeControl(action, callback) {
  var direction = volumeControlMap[action];

  if (action !== "mute" && !direction) {
    var invalidActionError = new Error("不支持的音量命令: " + action);
    if (callback) {
      callback(invalidActionError);
    }
    return false;
  }

  if (!transport) {
    var transportError = new Error("未连接到 Roon Core");
    if (callback) {
      callback(transportError);
    }
    return false;
  }

  var output = getDefaultControlOutput();
  if (!output || !output.output_id) {
    var outputError = new Error("没有可控制音量的输出设备");
    if (callback) {
      callback(outputError);
    }
    return false;
  }

  try {
    if (action === "mute") {
      if (typeof transport.mute !== "function") {
        var muteUnsupportedError = new Error("当前 Roon Transport 不支持静音控制");
        if (callback) {
          callback(muteUnsupportedError);
        }
        return false;
      }

      var muteMode = output.volume && output.volume.is_muted ? "unmute" : "mute";
      transport.mute(output, muteMode, function(error) {
        if (error) {
          logWarn("Roon静音命令执行失败:", output.output_id, error);
        } else {
          logDebug("Roon静音命令已发送:", output.output_id, muteMode);
        }

        if (callback) {
          callback(error || null);
        }
      });
      return true;
    }

    var volumeSettings = output.volume || {};
    var isIncrementalVolume = volumeSettings.type === "incremental";
    var volumeStep = getKeyboardSettings().volumeStep;
    var how = isIncrementalVolume ? "relative" : "relative_step";
    var value = isIncrementalVolume ? direction : direction * volumeStep;

    transport.change_volume(output, how, value, function(error) {
      if (error) {
        logWarn("Roon音量命令执行失败:", action, output.output_id, error);
      } else {
        logDebug("Roon音量命令已发送:", action, output.output_id, how, value);
      }

      if (callback) {
        callback(error || null);
      }
    });
  } catch (err) {
    if (callback) {
      callback(err);
    }
    return false;
  }

  return true;
}

function getKeyboardSettings() {
  return {
    enabled: getBooleanConfig("keyboard.enabled", false),
    device: getStringConfig("keyboard.device", ""),
    devices: getListConfig("keyboard.devices", []),
    debounceMs: getNumericConfig("keyboard.debounceMs", 180),
    volumeStep: getNumericConfig("keyboard.volumeStep", 5),
    keyMap: getObjectConfig("keyboard.keyMap", {})
  };
}

function startKeyboardControls() {
  var keyboardSettings = getKeyboardSettings();

  if (!keyboardSettings.enabled) {
    logInfo("宿主机键盘监听未启用");
    return null;
  }

  return startKeyboardInput({
    device: keyboardSettings.device,
    devices: keyboardSettings.devices,
    debounceMs: keyboardSettings.debounceMs,
    keyMap: keyboardSettings.keyMap,
    logger: {
      debug: logDebug,
      info: logInfo,
      warn: logWarn
    },
    onAction: function(event) {
      logInfo("收到宿主机键盘控制:", event.keyName, "->", event.action);
      var onControlComplete = function(error) {
        if (error) {
          logWarn("宿主机键盘控制失败:", error.message);
        }
      };

      if (isKeyboardVolumeAction(event.action)) {
        runRoonVolumeControl(event.action, onControlComplete);
      } else {
        runRoonControl(event.action, null, onControlComplete);
      }
    }
  });
}

startKeyboardControls();

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

  function runSocketControl(actionName, controlAction) {
    runTransportAction(actionName, function() {
      runRoonControl(controlAction, null, function(error) {
        if (error) {
          socket.emit("serverError", { error: error.message || "执行操作失败" });
        }
      });
    });
  }

  // 发送当前配对状态
  socket.emit("pairStatus", { pairEnabled: pairStatus });
  
  // 如果已配对且有区域信息，发送区域状态
  if (pairStatus) {
    socket.emit("zoneStatus", getClientZoneStatus());
  }



  socket.on("goPrev", function() {
    runSocketControl("goPrev", "previous");
  });

  socket.on("goNext", function() {
    runSocketControl("goNext", "next");
  });

  socket.on("goPlayPause", function() {
    runSocketControl("goPlayPause", "playpause");
  });

  socket.on("goPlay", function() {
    runSocketControl("goPlay", "play");
  });

  socket.on("goPause", function() {
    runSocketControl("goPause", "pause");
  });

  socket.on("goStop", function() {
    runSocketControl("goStop", "stop");
  });
});

// Web routes
var registerWebRoutes = require("./utils/webRoutes");
registerWebRoutes(app, {
  artworkSaveDir: artworkSaveDir,
  getCore: function() { return core; },
  getImageMimeType: getRoonImageFormatMime,
  isAutoSaveEnabled: function() { return getBooleanConfig("artwork.autoSave", true); },
  saveArtwork: saveArtwork,
  getImageStats: getImageStats,
  isPaired: function() { return pairStatus; },
  hasActiveZone: function() { return !!getActiveZone(); },
  logDebug: logDebug,
  logWarn: logWarn
});
