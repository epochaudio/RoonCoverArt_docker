"use strict";

var http = require("http");

var request = http.get(
  {
    host: "127.0.0.1",
    port: Number(process.env.SERVER_PORT) || 3666,
    path: "/api/health",
    timeout: 2500
  },
  function(response) {
    response.resume();
    process.exit(response.statusCode === 200 ? 0 : 1);
  }
);

request.on("timeout", function() {
  request.destroy();
});

request.on("error", function() {
  process.exit(1);
});
