'use strict';

// TDub web server. It uses only built-in Node.js modules, so there is nothing extra to install.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('./lib/catalog');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE_NAME = 'tdub_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // the admin stays logged in for 12 hours
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_TRIES = 10;
const MAX_BODY_BYTES = 1024 * 1024;

const sessions = new Map(); // login token -> time it runs out
const failedLogins = new Map(); // visitor address -> { start, count }

// Clean web addresses for the pages
const PAGES = {
  '/': 'index.html',
  '/title': 'title.html',
  '/watch': 'watch.html',
  '/admin': 'admin.html',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// Rules for what the browser may load. Google ad scripts and frames are allowed; nothing else from outside.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://adservice.google.com https://www.googletagservices.com https://*.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  'frame-src https:',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
  res.end(text);
}

// Reads the data a page sent (JSON), with a size limit.
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(httpError(413, 'That request is too big.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'The request was not valid data.'));
      }
    });
    req.on('error', reject);
  });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function isAdmin(req) {
  const token = readCookie(req, COOKIE_NAME);
  const expires = token ? sessions.get(token) : undefined;
  if (!expires) return false;
  if (expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function passwordMatches(input) {
  if (typeof input !== 'string') return false;
  // Compare fixed-length fingerprints so the check does not leak the password length or content by timing.
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function tooManyFailedLogins(ip) {
  const rec = failedLogins.get(ip);
  if (!rec || Date.now() - rec.start > LOGIN_WINDOW_MS) return false;
  return rec.count >= LOGIN_MAX_TRIES;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const rec = failedLogins.get(ip);
  if (!rec || now - rec.start > LOGIN_WINDOW_MS) failedLogins.set(ip, { start: now, count: 1 });
  else rec.count += 1;
}

async function adminLogin(req, res) {
  if (!ADMIN_PASSWORD) {
    throw httpError(503, 'The admin page is locked. Set the ADMIN_PASSWORD setting and start the server again.');
  }
  const ip = req.socket.remoteAddress || 'unknown';
  if (tooManyFailedLogins(ip)) {
    throw httpError(429, 'Too many wrong tries. Wait 15 minutes and try again.');
  }
  const body = (await readJson(req)) || {};
  if (!passwordMatches(body.password)) {
    recordFailedLogin(ip);
    throw httpError(401, 'Wrong password.');
  }
  failedLogins.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`,
  });
}

function adminLogout(req, res) {
  sessions.delete(readCookie(req, COOKIE_NAME));
  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  });
}

// Every /api/ address goes through here.
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  let m;

  // ---- Public: anyone can read the library ----
  if (method === 'GET' && p === '/api/library') {
    return sendJson(res, 200, { series: catalog.listSeries() });
  }
  if (method === 'GET' && (m = p.match(/^\/api\/series\/([^/]+)$/))) {
    const series = catalog.getSeries(decodeURIComponent(m[1]));
    if (!series) throw httpError(404, 'That series was not found.');
    return sendJson(res, 200, { series });
  }

  // ---- Admin login ----
  if (method === 'POST' && p === '/api/admin/login') return adminLogin(req, res);
  if (method === 'POST' && p === '/api/admin/logout') return adminLogout(req, res);

  // ---- Admin only: everything below needs the admin login cookie ----
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) throw httpError(401, 'Please log in first.');

    if (method === 'GET' && p === '/api/admin/session') {
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'GET' && p === '/api/admin/series') {
      return sendJson(res, 200, { series: catalog.getAllSeries() });
    }
    if (method === 'POST' && p === '/api/admin/series') {
      const body = await readJson(req);
      return sendJson(res, 200, { series: catalog.saveSeries(body) });
    }
    if (method === 'POST' && p === '/api/admin/movies') {
      const body = await readJson(req);
      return sendJson(res, 200, { movie: catalog.saveMovie(body) });
    }
    if (method === 'DELETE' && (m = p.match(/^\/api\/admin\/series\/([^/]+)$/))) {
      catalog.deleteSeries(decodeURIComponent(m[1]));
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'POST' && (m = p.match(/^\/api\/admin\/series\/([^/]+)\/episodes$/))) {
      const body = await readJson(req);
      return sendJson(res, 200, { episode: catalog.saveEpisode(decodeURIComponent(m[1]), body) });
    }
    if (method === 'DELETE' && (m = p.match(/^\/api\/admin\/series\/([^/]+)\/episodes\/([^/]+)$/))) {
      catalog.deleteEpisode(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
      return sendJson(res, 200, { ok: true });
    }
  }

  throw httpError(404, 'Not found.');
}

// Serves the files in the public folder. Nothing outside that folder can be reached.
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed.');
  }
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return sendText(res, 400, 'Bad address.');
  }
  if (PAGES[rel]) rel = PAGES[rel];

  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendText(res, 404, 'Page not found.');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, 'Page not found.');
    const ext = path.extname(filePath).toLowerCase();
    const isAdminPage = path.basename(filePath) === 'admin.html';
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isAdminPage ? 'no-store' : 'no-cache',
      'X-Robots-Tag': isAdminPage ? 'noindex, nofollow' : 'index, follow',
      ...SECURITY_HEADERS,
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    if (err.status) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'Something went wrong on the server.' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`TDub is running at http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) {
    console.log('The admin page is locked. Set ADMIN_PASSWORD before starting to use it.');
  }
});
