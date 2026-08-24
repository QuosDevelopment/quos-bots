import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("../github-pages-dashboard/", import.meta.url).pathname;
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = createServer(async (request, response) => {
  const path = normalize(join(root, request.url === "/" ? "index.html" : request.url.split("?")[0]));
  if (!path.startsWith(root)) return response.writeHead(403).end();
  try {
    const info = await stat(path);
    if (!info.isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    createReadStream(path).pipe(response);
  } catch { response.writeHead(404).end(); }
});
server.listen(Number(process.env.DASHBOARD_PREVIEW_PORT || 4174), () => console.log("GitHub Pages dashboard preview started."));
