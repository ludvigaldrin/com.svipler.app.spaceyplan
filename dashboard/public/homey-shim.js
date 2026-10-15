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

  function dispatch(eventName, payload) {
    (listeners[eventName] || []).slice().forEach(function (cb) {
      try { cb(payload); } catch (e) { console.error('Homey listener failed', e); }
    });
  }

  function openStream() {
    if (source) return;
    source = new EventSource('/events?clientId=' + encodeURIComponent(clientId));
    source.addEventListener('deviceUpdate', function (e) {
      var payload = JSON.parse(e.data);
      dispatch('widget:' + clientId + ':deviceUpdate', payload);
    });
    // EventSource reconnects by itself; a 401 means the PIN is gone.
    source.onerror = function () {
      fetch('/api/dashboards', { credentials: 'same-origin' }).then(function (r) {
        if (r.status === 401) location.href = '/login';
      }).catch(function () {});
    };
  }

  async function api(method, path, body) {
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
    clientId: clientId
  };

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
    style.textContent = 'html, body { overflow: hidden !important; }';
    document.head.appendChild(style);
  } catch (e) { /* cross-origin parent: leave as is */ }
})();
