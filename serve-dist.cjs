const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "dist");
const port = Number(process.env.PORT || 5173);
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml"
};

http.createServer((request, response) => {
  const url = decodeURIComponent((request.url || "/").split("?")[0]);
  const target = path.join(root, url === "/" ? "index.html" : url);

  if (!target.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      fs.readFile(path.join(root, "index.html"), (indexError, indexData) => {
        if (indexError) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        response.setHeader("Content-Type", "text/html");
        response.end(indexData);
      });
      return;
    }

    response.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving dist at http://127.0.0.1:${port}/`);
});
