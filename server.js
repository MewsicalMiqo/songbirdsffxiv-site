/* Minimal local preview server: node server.js (or PORT=9000 node server.js) */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer(function (req, res) {
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url.split("?")[0]);
    } catch (err) {
      res.writeHead(400).end("Bad request");
      return;
    }
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, function (err, data) {
      if (err) {
        res.writeHead(404).end("Not found: " + urlPath);
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, function () {
    console.log("Songbirds preview: http://localhost:" + port);
  });
