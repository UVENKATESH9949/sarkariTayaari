import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal static file server — no Express, no framework — for the video
 * library page. Serves library/ at "/" and output/ at "/output/" so the
 * page's <video src="/output/<id>.mp4"> tags resolve directly to the real
 * rendered files. Supports HTTP Range requests so video scrubbing works.
 */

const PORT = 4321;
const REPO_ROOT = process.cwd();
const LIBRARY_DIR = path.join(REPO_ROOT, "library");
const OUTPUT_DIR = path.join(REPO_ROOT, "output");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function resolveRequestedPath(pathname: string): string | null {
  const normalized = pathname === "/" ? "/index.html" : pathname;

  const root = normalized.startsWith("/output/") ? OUTPUT_DIR : LIBRARY_DIR;
  const relative = normalized.startsWith("/output/") ? normalized.slice("/output/".length) : normalized.slice(1);
  const resolved = path.join(root, relative);

  // Prevent path traversal outside the two allowed roots.
  const rootWithSep = root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const filePath = resolveRequestedPath(decodeURIComponent(url.pathname));

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  let info;
  try {
    info = await stat(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const type = contentTypeFor(filePath);
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : info.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${info.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": type,
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": info.size,
    "Accept-Ranges": "bytes",
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Video library running at http://localhost:${PORT}`);
});
