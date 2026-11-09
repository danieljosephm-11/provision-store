/*
 * Lightweight production preview server.
 *
 * The Vite dev server cannot start on this machine because an application
 * control policy blocks Rollup's native binary. This server serves the built
 * web app from apps/web/dist and proxies the API to the backend, so the
 * application can still be opened at http://localhost:5173 after `npm run build`.
 *
 * Usage:
 *   node scripts/serve-web.mjs
 *   PORT=5173 API_URL=http://localhost:4000 node scripts/serve-web.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'apps', 'web', 'dist');
const port = Number(process.env.PORT ?? 5173);
const apiUrl = new URL(process.env.API_URL ?? 'http://localhost:4000');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function proxy(req, res) {
  const target = new URL(req.url, apiUrl);
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `API unreachable: ${error.message}` }));
  });
  req.pipe(upstream);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
    proxy(req, res);
    return;
  }

  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const candidate = path.join(root, path.normalize(pathname));
  const resolved = candidate.startsWith(root) ? candidate : path.join(root, 'index.html');

  fs.stat(resolved, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, resolved);
      return;
    }
    // Single-page application fallback.
    sendFile(res, path.join(root, 'index.html'));
  });
});

server.listen(port, () => {
  console.log(`Provision Store web app on http://localhost:${port}`);
  console.log(`Serving ${root}`);
  console.log(`Proxying /api and /uploads to ${apiUrl.origin}`);
});
