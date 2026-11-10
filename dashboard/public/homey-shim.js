// Implements the slice of window.Homey that the widget frontend and the
// capability renderers use, on top of fetch + Server-Sent Events, so
// widgets/spacey-plan/public/* runs unchanged outside the Homey app.
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);

  function safeStorage() {
    try { return window.localStorage; } catch (e) { return null; }
  }
  var storage = safeStorage();

  // One id per browser, remembered on the device. It is the "widget id" the
  // server keys subscriptions and SSE streams on. An embedded floor plan
  // (iframe) adds its slot so every stream has its own id.
  function baseClientId() {
    var id = storage && storage.getItem('sp_client_id');
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      if (storage) storage.setItem('sp_client_id', id);
    }
    return id;
  }

  var slot = params.get('slot');
  var clientId = slot ? baseClientId() + ':' + slot : baseClientId();
  var forcedFloorId = params.get('floor');
  var selectedFloors = {};
  if (forcedFloorId) selectedFloors[clientId] = { floorId: forcedFloorId };

  var listeners = {}; // event -> [callbacks]
  var source = null;
  var UPDATE_EVENT = 'widget:' + clientId + ':deviceUpdate';

  // An embedded floor plan uses the dashboard page's stream instead of its
  // own: browsers allow few connections per host, and every open stream holds
  // one. Its subscriptions go through the page, so they are restored with it.
  var host = null;
  if (window.parent !== window) {
    try { if (window.parent.Homey && window.parent.Homey.__shared) host = window.parent.Homey.__shared; } catch (e) { host = null; }
  }
  var hostOffs = [];
  window.addEventListener('pagehide', function () { hostOffs.forEach(function (off) { off(); }); hostOffs = []; });

  // Everything this page subscribed to, to restore after a reconnect.
  var subscribed = {}; // 'deviceId|capability' -> { deviceId, capability }
  var hadError = false;
  var hiddenAt = 0;

  function dispatch(eventName, payload) {
    (listeners[eventName] || []).slice().forEach(function (cb) {
      try { cb(payload); } catch (e) { console.error('Homey listener failed', e); }
    });
  }

  function openStream() {
    if (source) return;
    source = new EventSource('/events?clientId=' + encodeURIComponent(clientId));
    source.onopen = function () {
      if (hadError) resync();
      hadError = false;
    };
    source.addEventListener('deviceUpdate', function (e) {
      var payload = JSON.parse(e.data);
      dispatch('widget:' + clientId + ':deviceUpdate', payload);
    });
    // EventSource reconnects by itself; a 401 means the PIN is gone.
    source.onerror = function () {
      hadError = true;
      // A failed reconnect (server restarting, bad response) closes the
      // stream for good; open a new one shortly.
      if (source && source.readyState === 2) {
        source = null;
        setTimeout(openStream, 3000);
      }
      fetch('/api/dashboards', { credentials: 'same-origin' }).then(function (r) {
        if (r.status === 401) location.href = '/login';
      }).catch(function () {});
    };
  }

  // After the stream was down (panel asleep, wifi gone) the server may have
  // dropped this page's subscriptions and updates were missed: subscribe
  // again and replay the current values as updates. Only status is fetched.
  function resync() {
    var devices = Object.keys(subscribed).map(function (k) { return subscribed[k]; });
    if (!devices.length) return;
    api('POST', '/subscribeToDevices', { widgetId: clientId, devices: devices })
      .then(function () { return api('POST', '/deviceValues', { devices: devices }); })
      .then(function (values) {
        (values || []).forEach(function (v) { dispatch(UPDATE_EVENT, v); });
      })
      .catch(function (error) { console.error('Status resync failed', error); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!host && hiddenAt && Date.now() - hiddenAt > 60000) resync();
    hiddenAt = 0;
  });

  async function api(method, path, body) {
    if (host && path === '/subscribeToDevices') {
      return host.subscribe(body && body.devices);
    }
    if (!host && path === '/subscribeToDevices' && body && Array.isArray(body.devices)) {
      body.devices.forEach(function (d) { subscribed[d.deviceId + '|' + d.capability] = { deviceId: d.deviceId, capability: d.capability }; });
    }
    // The floor plan inside a dashboard is pinned to one floor; remember a
    // switch made inside it in memory only.
    if (path === '/selectedFloors') {
      if (method === 'GET') return selectedFloors;
      selectedFloors[clientId] = { floorId: body && body.floorId };
      return { success: true };
    }

    var options = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined && method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    var response = await fetch('/api' + path, options);
    if (response.status === 401) {
      location.href = '/login';
      throw new Error('PIN required');
    }
    var text = await response.text();
    var data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error((data && data.error) || ('HTTP ' + response.status));
    }
    return data;
  }

  window.Homey = {
    api: api,
    on: function (eventName, cb) {
      if (host && eventName === UPDATE_EVENT) { hostOffs.push(host.onUpdate(cb)); return; }
      (listeners[eventName] = listeners[eventName] || []).push(cb);
      if (eventName.indexOf('widget:') === 0) openStream();
    },
    removeAllListeners: function (eventName) {
      delete listeners[eventName];
    },
    ready: function () {},
    setHeight: function (px) {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'sp-height', slot: slot, height: px }, location.origin);
      }
      return Promise.resolve();
    },
    getSettings: function () {
      var h = parseInt(params.get('h'), 10);
      return { widgetHeight: h > 0 ? h : Math.round(window.innerHeight * 0.8) };
    },
    getWidgetInstanceId: function () {
      return Promise.resolve(clientId);
    },
    // Dashboard-only extras (not part of the Homey widget API).
    clientId: clientId,
    streamState: function () { return source ? ['connecting', 'open', 'closed'][source.readyState] : (host ? 'shared' : 'none'); }
  };

  if (!host) {
    window.Homey.__shared = {
      onUpdate: function (cb) {
        (listeners[UPDATE_EVENT] = listeners[UPDATE_EVENT] || []).push(cb);
        openStream();
        return function () {
          var list = listeners[UPDATE_EVENT] || [];
          var at = list.indexOf(cb);
          if (at >= 0) list.splice(at, 1);
        };
      },
      subscribe: function (devices) {
        return api('POST', '/subscribeToDevices', { widgetId: clientId, devices: devices || [] });
      }
    };
  }

  // Homey's runtime calls onHomeyReady once the widget scripts are loaded;
  // the server injects a call to this after the widget's own scripts.
  window.__startWidget = function () {
    if (typeof window.onHomeyReady === 'function') window.onHomeyReady(window.Homey);
  };
})();

// When the widget is embedded in a dashboard page, take over the page's
// colour scheme. A framed document whose scheme differs from its embedder
// gets an opaque white canvas, which showed as a white box in dark themes.
(function () {
  if (window.parent === window) return;
  try {
    var root = document.documentElement;
    root.style.colorScheme = window.parent.getComputedStyle(window.parent.document.documentElement).colorScheme;
    root.style.background = 'transparent';
    // The frame is sized to the content; an inner scrollbar only gets in the way.
    var style = document.createElement('style');
    // The dashboard's own page tabs replace the widget's floor dropdown.
    style.textContent = 'html, body { overflow: hidden !important; } #floorSwitcher { display: none !important; }';
    document.head.appendChild(style);
  } catch (e) { /* cross-origin parent: leave as is */ }
})();

// Rendering diagnostics: 10 s after a floor plan frame loads, report how the
// browser applied the icon colours (glow) to a few devices. Read at GET /diag.
(function () {
  if (window.parent === window) return;
  setTimeout(function () {
    try {
      var supports = function (p, v) { try { return !!(window.CSS && CSS.supports(p, v)); } catch (e) { return 'error'; } };
      var devices = Array.prototype.slice.call(document.querySelectorAll('[data-homey-id]'), 0, 6).map(function (el) {
        var wrap = el.querySelector('.icon-wrapper');
        var icon = wrap && wrap.querySelector('img, .material-symbols-outlined');
        var cs = getComputedStyle(el);
        return {
          name: el.getAttribute('data-name'),
          capability: el.getAttribute('data-capability'),
          state: el.getAttribute('data-state'),
          inline: (el.getAttribute('style') || '').replace(/\s+/g, ' ').slice(0, 400),
          computedBg: cs.backgroundColor,
          computedShadow: cs.boxShadow,
          opacity: cs.opacity,
          wrapInline: wrap ? (wrap.getAttribute('style') || '') : null,
          wrapBg: wrap ? getComputedStyle(wrap).backgroundColor : null,
          iconFilter: icon ? getComputedStyle(icon).filter : null,
          iconInlineFilter: icon ? icon.style.filter : null,
          rules: (function () { try { return (JSON.parse(el.getAttribute('data-device') || '{}').rules || []).map(function (r) { return { type: r.type, config: r.config }; }); } catch (e) { return 'unparsable'; } })()
        };
      });
      var body = JSON.stringify({
        href: location.href,
        screen: innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio,
        hex8: supports('color', '#00000080'),
        filterDropShadow: supports('filter', 'drop-shadow(0 0 4px red)'),
        cssSupports: !!(window.CSS && CSS.supports),
        bgSetterPatched: (function () { var d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'backgroundColor'); return !!(d && d.set && String(d.set).indexOf('fix') >= 0); })(),
        devices: devices
      });
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/diag');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body);
    } catch (e) { /* diagnostics only */ }
  }, 10000);
})();
