// Stand-in for a client's Webflow site, on its own origin (localhost:4000) like a real one.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4000);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const file = path === "/" ? "index.html" : extname(path) ? path.slice(1) : `${path.slice(1)}.html`;
  const full = normalize(join(root, file));
  if (!full.startsWith(root)) return res.writeHead(400).end();
  try {
    const body = await readFile(full);
    res.writeHead(200, { "content-type": types[extname(full)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}).listen(port, () => console.log(`demo site on http://localhost:${port}`));
