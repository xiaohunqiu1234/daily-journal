'use strict';

// 极简零依赖本地服务器：
//   1. 提供静态文件（index.html / css / js）
//   2. 提供日志数据的读写接口，数据持久化到项目目录下的 data/journal.json
//
// 启动： node server.js   （可选端口： PORT=8080 node server.js）

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'journal.json');
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}\n', 'utf8');
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeData(obj) {
  // 原子写入：先写临时文件再重命名，避免写入中断导致文件损坏
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 50 * 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 防止路径穿越
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // ===== 数据接口 =====
  if (urlPath === '/api/journal') {
    if (req.method === 'GET') {
      sendJSON(res, 200, readData());
      return;
    }
    // PUT（保存）/ POST（sendBeacon 兜底）均整体覆盖写入
    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const body = await readBody(req);
        const obj = JSON.parse(body);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid');
        writeData(obj);
        sendJSON(res, 200, { ok: true, count: Object.keys(obj).length });
      } catch (e) {
        sendJSON(res, 400, { ok: false, error: String(e.message || e) });
      }
      return;
    }
    res.writeHead(405); res.end('Method Not Allowed');
    return;
  }

  // ===== 静态文件 =====
  serveStatic(req, res);
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`每日日志已启动： http://localhost:${PORT}`);
  console.log(`数据文件： ${DATA_FILE}`);
});
