"use strict";

var fs = require("fs");
var path = require("path");

var EV_KEY = 0x01;
var KEY_VALUE_RELEASE = 0;
var KEY_VALUE_PRESS = 1;
var KEY_VALUE_REPEAT = 2;

var KEY_NAMES = {
  28: "KEY_ENTER",
  57: "KEY_SPACE",
  113: "KEY_MUTE",
  114: "KEY_VOLUMEDOWN",
  115: "KEY_VOLUMEUP",
  103: "KEY_UP",
  105: "KEY_LEFT",
  106: "KEY_RIGHT",
  108: "KEY_DOWN",
  119: "KEY_PAUSE",
  128: "KEY_STOP",
  163: "KEY_NEXTSONG",
  164: "KEY_PLAYPAUSE",
  165: "KEY_PREVIOUSSONG",
  166: "KEY_STOPCD",
  207: "KEY_PLAY"
};

var DEFAULT_KEY_MAP = {
  KEY_RIGHT: "next",
  KEY_NEXTSONG: "next",
  KEY_LEFT: "previous",
  KEY_PREVIOUSSONG: "previous",
  KEY_SPACE: "playpause",
  KEY_PLAYPAUSE: "playpause",
  KEY_PLAY: "play",
  KEY_PAUSE: "pause",
  KEY_STOP: "stop",
  KEY_STOPCD: "stop",
  KEY_VOLUMEUP: "volumeup",
  KEY_VOLUMEDOWN: "volumedown",
  KEY_MUTE: "mute",
  KEY_UP: "play",
  KEY_DOWN: "stop"
};

var VALID_ACTIONS = {
  previous: true,
  next: true,
  playpause: true,
  play: true,
  pause: true,
  stop: true,
  volumeup: true,
  volumedown: true,
  mute: true
};

function getEventLayout() {
  var is32Bit = process.arch === "ia32" || process.arch === "arm";

  return is32Bit
    ? { size: 16, typeOffset: 8, codeOffset: 10, valueOffset: 12 }
    : { size: 24, typeOffset: 16, codeOffset: 18, valueOffset: 20 };
}

function getKeyName(code) {
  return KEY_NAMES[code] || "KEY_" + code;
}

function normalizeKeyMap(customKeyMap) {
  var keyMap = Object.assign({}, DEFAULT_KEY_MAP);

  if (!customKeyMap || typeof customKeyMap !== "object" || Array.isArray(customKeyMap)) {
    return keyMap;
  }

  Object.keys(customKeyMap).forEach(function(keyName) {
    var normalizedKey = String(keyName).trim().toUpperCase();
    var action = String(customKeyMap[keyName] || "").trim().toLowerCase();

    if (!normalizedKey || !VALID_ACTIONS[action]) {
      return;
    }

    keyMap[normalizedKey] = action;
  });

  return keyMap;
}

function splitDeviceList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.reduce(function(items, item) {
      return items.concat(splitDeviceList(item));
    }, []);
  }

  return String(value)
    .split(",")
    .map(function(item) {
      return item.trim();
    })
    .filter(Boolean);
}

function addDevice(devices, seen, device) {
  if (!device) {
    return;
  }

  var key = device;
  try {
    key = fs.realpathSync(device);
  } catch (err) {
    key = device;
  }

  if (!seen[key]) {
    seen[key] = true;
    devices.push(device);
  }
}

function addKeyboardLinks(devices, seen, directory, logger) {
  try {
    fs.readdirSync(directory)
      .filter(function(file) {
        return /event-kbd$/.test(file) || /kbd/i.test(file);
      })
      .sort()
      .forEach(function(file) {
        addDevice(devices, seen, path.join(directory, file));
      });
  } catch (err) {
    if (logger && logger.debug) {
      logger.debug("Keyboard discovery skipped for " + directory + ":", err.message);
    }
  }
}

function parseProcInputDevices() {
  var content;
  try {
    content = fs.readFileSync("/proc/bus/input/devices", "utf8");
  } catch (err) {
    return [];
  }

  return content.split(/\n\s*\n/).reduce(function(devices, block) {
    var nameMatch = block.match(/^N:\s+Name="([^"]+)"/m);
    var handlersMatch = block.match(/^H:\s+Handlers=(.+)$/m);

    if (!handlersMatch) {
      return devices;
    }

    var name = nameMatch ? nameMatch[1] : "";
    var handlers = handlersMatch[1];
    var eventMatch = handlers.match(/\bevent\d+\b/);

    if (!eventMatch || handlers.indexOf("kbd") === -1) {
      return devices;
    }

    if (/power button|sleep button|lid switch|pc speaker|video bus/i.test(name)) {
      return devices;
    }

    devices.push("/dev/input/" + eventMatch[0]);
    return devices;
  }, []);
}

function resolveKeyboardDevices(options, logger) {
  var devices = [];
  var seen = {};
  var configuredDevices = splitDeviceList(options.devices).concat(splitDeviceList(options.device));

  configuredDevices.forEach(function(device) {
    addDevice(devices, seen, device);
  });

  if (devices.length > 0) {
    return devices;
  }

  addKeyboardLinks(devices, seen, "/dev/input/by-id", logger);
  addKeyboardLinks(devices, seen, "/dev/input/by-path", logger);
  parseProcInputDevices().forEach(function(device) {
    addDevice(devices, seen, device);
  });

  return devices;
}

function parseInputEvents(buffer, layout) {
  var events = [];
  var offset = 0;

  while (offset + layout.size <= buffer.length) {
    events.push({
      type: buffer.readUInt16LE(offset + layout.typeOffset),
      code: buffer.readUInt16LE(offset + layout.codeOffset),
      value: buffer.readInt32LE(offset + layout.valueOffset)
    });
    offset += layout.size;
  }

  return {
    events: events,
    remaining: buffer.slice(offset)
  };
}

function startKeyboardInput(options) {
  options = options || {};

  var logger = options.logger || console;
  var devices = resolveKeyboardDevices(options, logger);
  var onAction = typeof options.onAction === "function" ? options.onAction : function() {};
  var debounceMs = Number(options.debounceMs);
  var keyMap = normalizeKeyMap(options.keyMap);
  var layout = getEventLayout();
  var lastActionAt = {};
  var streams = [];

  if (devices.length === 0) {
    logger.warn("Keyboard input enabled but no keyboard devices were configured or discovered.");
    return null;
  }

  devices.forEach(function(device) {
    var pending = Buffer.alloc(0);
    var stream;

    try {
      stream = fs.createReadStream(device, {
        flags: "r",
        highWaterMark: layout.size * 16
      });
    } catch (err) {
      logger.warn("Failed to open keyboard input device:", device, err.message);
      return;
    }

    logger.info("Keyboard input listener started:", device);
    streams.push({
      device: device,
      stream: stream
    });

    stream.on("data", function(chunk) {
      var parsed = parseInputEvents(Buffer.concat([pending, chunk]), layout);
      pending = parsed.remaining;

      parsed.events.forEach(function(inputEvent) {
        if (inputEvent.type !== EV_KEY || inputEvent.value !== KEY_VALUE_PRESS) {
          return;
        }

        var keyName = getKeyName(inputEvent.code);
        var action = keyMap[keyName] || keyMap[String(inputEvent.code).toUpperCase()];

        if (!action) {
          return;
        }

        var now = Date.now();
        if (debounceMs > 0 && lastActionAt[action] && now - lastActionAt[action] < debounceMs) {
          return;
        }

        lastActionAt[action] = now;
        onAction({
          action: action,
          keyName: keyName,
          code: inputEvent.code,
          value: inputEvent.value,
          device: device
        });
      });
    });

    stream.on("error", function(err) {
      logger.warn("Keyboard input listener error:", device, err.message);
    });

    stream.on("close", function() {
      logger.info("Keyboard input listener stopped:", device);
    });
  });

  if (streams.length === 0) {
    logger.warn("Keyboard input enabled but no configured or discovered devices could be opened.");
    return null;
  }

  return {
    devices: streams.map(function(item) {
      return item.device;
    }),
    stop: function() {
      streams.forEach(function(item) {
        item.stream.destroy();
      });
    }
  };
}

module.exports = {
  startKeyboardInput: startKeyboardInput,
  parseInputEvents: parseInputEvents,
  getEventLayout: getEventLayout,
  resolveKeyboardDevices: resolveKeyboardDevices,
  DEFAULT_KEY_MAP: DEFAULT_KEY_MAP,
  KEY_VALUE_RELEASE: KEY_VALUE_RELEASE,
  KEY_VALUE_PRESS: KEY_VALUE_PRESS,
  KEY_VALUE_REPEAT: KEY_VALUE_REPEAT
};
