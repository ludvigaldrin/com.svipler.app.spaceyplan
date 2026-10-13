'use strict';

// Just enough of Home Assistant's HTTP/WebSocket handshake for a Shelly Wall
// Display to accept this server as an "HA instance". It does not implement
// HA's entity model. Once the display has accepted the address it loads our
// dashboard as an ordinary webview (which asks for the PIN as usual).
//
// Endpoint shapes and responses are adapted from the WallDisplay app
// (com.walldisplay.dashboard-main, MIT-licensed per its README): /api/,
// /api/config, /api/discovery_info, /auth/*, and the WebSocket
// auth_required -> auth_ok handshake.

const os = require('os');
const WebSocket = require('ws');

const HA_VERSION = '2024.1.0';

function lanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

class HaShim {
  constructor(app) {
    this.app = app;
    this.wss = null;
  }

  // Attach to the HTTP server's upgrade event.
  attach(server) {
    this.wss = new WebSocket.Server({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname !== '/api/websocket') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, ws => this.onSocket(ws));
    });
  }

  detach() {
    if (!this.wss) return;
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
    this.wss = null;
  }

  onSocket(ws) {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: HA_VERSION }));
    let authenticated = false;

    ws.on('message', data => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (error) {
        return;
      }

      if (msg.type === 'auth') {
        authenticated = true;
        ws.send(JSON.stringify({ type: 'auth_ok', ha_version: HA_VERSION }));
        return;
      }
      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Not authenticated' }));
        return;
      }
      if (msg.id) {
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: null }));
      }
    });
    ws.on('error', error => this.app.error('HA shim WebSocket error:', error.message));
  }

  // Returns true when the request was answered here.
  async handle(req, res, pathname) {
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return true;
    };

    if (pathname === '/api/' || pathname === '/api') {
      return json(200, { message: 'API running.' });
    }
    if (pathname === '/api/config') {
      return json(200, {
        components: [],
        config_dir: '/config',
        elevation: 0,
        latitude: 0,
        longitude: 0,
        location_name: 'Homey',
        time_zone: 'Europe/Amsterdam',
        unit_system: { length: 'km', mass: 'g', temperature: '°C', volume: 'L' },
        version: HA_VERSION,
        state: 'RUNNING'
      });
    }
    if (pathname === '/api/discovery_info') {
      const host = req.headers.host || `${lanAddress() || 'homey.local'}`;
      return json(200, {
        base_url: `http://${host}`,
        installation_type: 'Home Assistant OS',
        requires_api_password: false,
        uuid: 'homey-spacey-plan',
        version: HA_VERSION,
        location_name: 'Homey'
      });
    }
    if (pathname === '/auth/providers') {
      return json(200, {
        providers: [{ name: 'Home Assistant Local', id: null, type: 'homeassistant' }],
        preselect_remember_me: true
      });
    }
    if (pathname === '/auth/login_flow' && req.method === 'POST') {
      return json(200, {
        type: 'form',
        flow_id: Math.random().toString(36).substring(2),
        handler: ['homeassistant', null],
        step_id: 'init',
        data_schema: [
          { name: 'username', type: 'string' },
          { name: 'password', type: 'string', required: true }
        ],
        errors: {}
      });
    }
    if (/^\/auth\/login_flow\/[^/]+$/.test(pathname) && req.method === 'POST') {
      return json(200, {
        type: 'create_entry',
        result: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        title: 'Homey'
      });
    }
    if (pathname === '/auth/token' && req.method === 'POST') {
      return json(200, {
        access_token: 'homey-token',
        expires_in: 1800,
        refresh_token: 'homey-refresh',
        token_type: 'Bearer'
      });
    }
    if (pathname === '/auth/authorize') {
      res.writeHead(302, { Location: '/' });
      res.end();
      return true;
    }
    return false;
  }
}

module.exports = HaShim;
