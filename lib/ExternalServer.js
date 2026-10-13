'use strict';

// External Dashboard server: serves the dashboard, the editor and the widget
// frontend over plain HTTP on the LAN, and exposes the same handlers the
// widget API uses (lib/handlers.js) as JSON routes under /api. Live updates
// go out over Server-Sent Events, fed by SubscriptionManager.addOutput().

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const handlers = require('./handlers');
const HaShim = require('./HaShim');

const ROOT = path.join(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard', 'public');
const WIDGET_DIR = path.join(ROOT, 'widgets', 'spacey-plan', 'public');
// The runner strips widget.compose.json; its api section lives on in app.json.
const APP_MANIFEST = path.join(ROOT, 'app.json');

const COOKIE_NAME = 'sp_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10;
const HEARTBEAT_MS = 25000;
// How long a browser's subscriptions survive without an open SSE stream, so
// a reconnect does not need to resubscribe every device.
const UNSUBSCRIBE_GRACE_MS = 60000;
const MAX_BODY_BYTES = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Routes that exist only on the dashboard server (not in the widget API).
const EXTRA_API_ROUTES = [
  { method: 'GET', path: '/dashboards', handler: 'getDashboards' },
  { method: 'POST', path: '/dashboards', handler: 'saveDashboards' },
  { method: 'GET', path: '/zones', handler: 'getZones' },
  { method: 'GET', path: '/dashboardDevices', handler: 'getDashboardDeviceList' },
  { method: 'GET', path: '/zones/:zoneId/devices', handler: 'getZoneDevices' },
  { method: 'POST', path: '/describeDevices', handler: 'describeDevices' },
  { method: 'GET', path: '/flowButtons', handler: 'getFlowButtons' },
  { method: 'POST', path: '/flowButtons/:buttonId/press', handler: 'pressFlowButton' }
];

function compilePath(routePath) {
  const names = [];
  const pattern = routePath.replace(/:([a-zA-Z]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}$`), names };
}

class ExternalServer {
  constructor(app) {
    this.app = app;
    this.server = null;
    this.port = null;
    this.pin = null;
    this.secret = null;
    this.sseClients = new Map(); // clientId -> Set<res>
    this.pendingUnsubscribe = new Map(); // clientId -> timer
    this.failures = new Map(); // ip -> { count, lockedUntil, lockMs }
    this.fileCache = new Map(); // file -> { mtimeMs, etag, body }
    this.routes = this.buildRoutes();
    this.haShim = new HaShim(app);
    this.heartbeat = null;
  }

  buildRoutes() {
    const compose = JSON.parse(fs.readFileSync(APP_MANIFEST, 'utf8')).widgets['spacey-plan'];
    const routes = [];
    for (const [name, def] of Object.entries(compose.api || {})) {
      if (typeof handlers[name] !== 'function') continue;
      routes.push({ method: def.method, handler: name, ...compilePath(def.path) });
    }
    for (const def of EXTRA_API_ROUTES) {
      if (typeof handlers[def.handler] !== 'function') {
        throw new Error(`Missing handler for ${def.method} ${def.path}: ${def.handler}`);
      }
      routes.push({ method: def.method, handler: def.handler, ...compilePath(def.path) });
    }
    return routes;
  }

  // ---- lifecycle ----

  async start({ port, pin, secret }) {
    if (this.server) await this.stop();
    if (!pin) throw new Error('External Dashboard needs a PIN before it can start');

    this.port = port;
    this.pin = String(pin);
    this.secret = secret;

    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch(error => {
        this.app.error('External Dashboard request failed:', error);
        if (!res.headersSent) this.sendJson(res, 500, { error: error.message });
        else res.end();
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '0.0.0.0', () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    this.haShim.attach(this.server);
    // Keep a late runtime error from crashing the app.
    this.server.on('error', error => this.app.error('External Dashboard server error:', error));

    this.heartbeat = setInterval(() => this.broadcastRaw(': heartbeat\n\n'), HEARTBEAT_MS);
    this.app.log(`External Dashboard listening on port ${port}`);
  }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const timer of this.pendingUnsubscribe.values()) clearTimeout(timer);
    this.pendingUnsubscribe.clear();
    for (const clients of this.sseClients.values()) {
      for (const res of clients) res.end();
    }
    this.sseClients.clear();

    this.haShim.detach();
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise(resolve => server.close(resolve));
      this.app.log('External Dashboard stopped');
    }
  }

  isRunning() {
    return this.server !== null;
  }

  // ---- auth ----

  authToken() {
    return crypto.createHmac('sha256', this.secret).update(this.pin).digest('hex');
  }

  isAuthed(req) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name !== COOKIE_NAME) continue;
      const given = Buffer.from(rest.join('='));
      const expected = Buffer.from(this.authToken());
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    }
    return false;
  }

  // Returns the remaining lockout in ms, or 0 when the ip may try.
  lockedFor(ip) {
    const entry = this.failures.get(ip);
    if (!entry || !entry.lockedUntil) return 0;
    return Math.max(0, entry.lockedUntil - Date.now());
  }

  recordFailure(ip) {
    const entry = this.failures.get(ip) || { count: 0, lockedUntil: 0, lockMs: 60000 };
    entry.count += 1;
    if (entry.count >= 5) {
      entry.lockedUntil = Date.now() + entry.lockMs;
      entry.lockMs = Math.min(entry.lockMs * 2, 15 * 60000);
      entry.count = 0;
    }
    this.failures.set(ip, entry);
  }

  async login(req, res) {
    const ip = req.socket.remoteAddress;
    const wait = this.lockedFor(ip);
    if (wait > 0) {
      res.setHeader('Retry-After', Math.ceil(wait / 1000));
      return this.sendJson(res, 429, { error: 'Too many attempts', retryAfterMs: wait });
    }

    const body = await this.readBody(req);
    const given = Buffer.from(String(body.pin || ''));
    const expected = Buffer.from(this.pin);
    const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);

    if (!ok) {
      this.recordFailure(ip);
      return this.sendJson(res, 401, { error: 'Wrong PIN' });
    }

    this.failures.delete(ip);
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${this.authToken()}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`);
    return this.sendJson(res, 200, { success: true });
  }

  // ---- request handling ----

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    // Home Assistant handshake for Shelly Wall Display: must be reachable
    // without our PIN, and it never exposes anything but generic answers.
    if (await this.haShim.handle(req, res, pathname, url)) return;

    if (pathname === '/auth/login' && req.method === 'POST') return this.login(req, res);
    if (pathname === '/login' || pathname === '/login.html') {
      return this.serveFile(req, res, path.join(DASHBOARD_DIR, 'login.html'));
    }
    if (pathname === '/login.js' || pathname === '/dashboard.css') {
      return this.serveFile(req, res, path.join(DASHBOARD_DIR, pathname));
    }

    if (!this.isAuthed(req)) {
      if (pathname.startsWith('/api/') || pathname === '/events') {
        return this.sendJson(res, 401, { error: 'PIN required' });
      }
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }

    if (pathname === '/events') return this.openEventStream(req, res, url);
    if (pathname.startsWith('/api/')) return this.handleApi(req, res, pathname.slice(4), url);

    if (pathname === '/' || pathname === '/index.html') {
      return this.serveFile(req, res, path.join(DASHBOARD_DIR, 'index.html'));
    }
    if (pathname === '/editor') {
      return this.serveFile(req, res, path.join(DASHBOARD_DIR, 'editor.html'));
    }
    if (pathname === '/homey-shim.js') {
      return this.serveFile(req, res, path.join(DASHBOARD_DIR, 'homey-shim.js'));
    }
    // The widget frontend, served untouched except for the shim injection.
    if (pathname === '/widget' || pathname === '/widget/') {
      return this.serveFile(req, res, path.join(WIDGET_DIR, 'index.html'), { injectShim: true });
    }
    if (pathname.startsWith('/widget/')) {
      return this.serveFile(req, res, path.join(WIDGET_DIR, pathname.slice('/widget/'.length)));
    }
    return this.serveFile(req, res, path.join(DASHBOARD_DIR, pathname));
  }

  async handleApi(req, res, apiPath, url) {
    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = route.regex.exec(apiPath);
      if (!match) continue;

      const params = {};
      route.names.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
      const query = Object.fromEntries(url.searchParams);
      const body = req.method === 'GET' ? {} : await this.readBody(req);

      try {
        const result = await handlers[route.handler]({ homey: this.app.homey, params, query, body });
        return this.sendJson(res, 200, result === undefined ? null : result);
      } catch (error) {
        // Handlers already log; the client must see the failure.
        return this.sendJson(res, 500, { error: error.message || String(error) });
      }
    }
    return this.sendJson(res, 404, { error: `No route for ${req.method} ${apiPath}` });
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error('Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': MIME['.json'],
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store'
    });
    res.end(body);
  }

  // ---- static files ----

  serveFile(req, res, filePath, { injectShim = false } = {}) {
    const resolved = path.resolve(filePath);
    const allowed = [DASHBOARD_DIR, WIDGET_DIR].some(dir => resolved.startsWith(dir + path.sep));
    if (!allowed) return this.sendJson(res, 403, { error: 'Forbidden' });

    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch (error) {
      return this.sendJson(res, 404, { error: 'Not found' });
    }
    if (!stat.isFile()) return this.sendJson(res, 404, { error: 'Not found' });

    const cacheKey = `${resolved}|${injectShim}`;
    let entry = this.fileCache.get(cacheKey);
    if (!entry || entry.mtimeMs !== stat.mtimeMs) {
      let body = fs.readFileSync(resolved);
      if (injectShim) {
        // Shim first (defines window.Homey), then start the widget the way
        // Homey's runtime would, once all widget scripts have loaded.
        const html = body.toString('utf8')
          .replace('<head>', '<head>\n<script src="/homey-shim.js"></script>')
          .replace('</body>', '<script>window.__startWidget && window.__startWidget();</script>\n</body>');
        body = Buffer.from(html);
      }
      const etag = `"${crypto.createHash('md5').update(body).digest('hex')}"`;
      entry = { mtimeMs: stat.mtimeMs, etag, body };
      this.fileCache.set(cacheKey, entry);
    }

    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, { ETag: entry.etag });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Content-Length': entry.body.length,
      ETag: entry.etag,
      'Cache-Control': 'no-cache'
    });
    res.end(entry.body);
  }

  // ---- SSE ----

  openEventStream(req, res, url) {
    const clientId = url.searchParams.get('clientId');
    if (!clientId) return this.sendJson(res, 400, { error: 'clientId required' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');

    const pending = this.pendingUnsubscribe.get(clientId);
    if (pending) {
      clearTimeout(pending);
      this.pendingUnsubscribe.delete(clientId);
    }

    if (!this.sseClients.has(clientId)) this.sseClients.set(clientId, new Set());
    this.sseClients.get(clientId).add(res);

    req.on('close', () => {
      const clients = this.sseClients.get(clientId);
      if (!clients) return;
      clients.delete(res);
      if (clients.size > 0) return;
      this.sseClients.delete(clientId);
      const timer = setTimeout(() => {
        this.pendingUnsubscribe.delete(clientId);
        this.app.subscriptionManager.unsubscribeWidget(clientId)
          .catch(error => this.app.error('Unsubscribe after SSE close failed:', error));
      }, UNSUBSCRIBE_GRACE_MS);
      this.pendingUnsubscribe.set(clientId, timer);
    });
  }

  broadcastRaw(chunk) {
    for (const clients of this.sseClients.values()) {
      for (const res of clients) res.write(chunk);
    }
  }

  // Output for SubscriptionManager.addOutput(). Subscriptions are keyed by
  // the browser's client id, the same way the widget uses its instance id.
  pushDeviceUpdate(clientId, payload) {
    const clients = this.sseClients.get(clientId);
    if (!clients) return;
    const chunk = `event: deviceUpdate\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(chunk);
  }
}

module.exports = ExternalServer;
