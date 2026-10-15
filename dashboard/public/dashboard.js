// The dashboard page: picks a dashboard for this device, renders one page at
// a time as a stack of blocks, and reuses the widget's capability renderers
// (in their "tile" view) for device blocks.
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var KEY_DASHBOARD = 'sp_dashboard';
  var KEY_ROOM = 'sp_room';
  var KEY_PAGE = 'sp_page_';

  // Renderers read a global `widgetId`.
  window.widgetId = window.Homey.clientId;

  var state = {
    dashboards: [],
    zones: [],
    dashboard: null,
    pageIndex: 0,
    renderToken: 0
  };

  var els = {
    topbar: document.getElementById('topbar'),
    clock: document.getElementById('clock'),
    clockTime: document.getElementById('clockTime'),
    clockDate: document.getElementById('clockDate'),
    weather: document.getElementById('weather'),
    title: document.getElementById('title'),
    menuButton: document.getElementById('menuButton'),
    menu: document.getElementById('menu'),
    page: document.getElementById('page'),
    dots: document.getElementById('dots'),
    saver: document.getElementById('saver'),
    saverClock: document.getElementById('saverClock')
  };

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: the device just forgets its choice */ }
    return null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function symbol(name) {
    return el('span', 'material-symbols-outlined', name);
  }

  function message(text, detail) {
    els.page.replaceChildren();
    var box = el('div', 'message');
    box.appendChild(el('h2', null, text));
    if (detail) box.appendChild(el('p', null, detail));
    els.page.appendChild(box);
    els.dots.replaceChildren(); els.dots.hidden = true;
  }

  // ---- renderers ----

  var rendererManager = new window.CapabilityRendererManager();
  rendererManager.setWidgetId(window.Homey.clientId);
  Object.values(window.capabilityRenderers || {}).forEach(function (renderer) {
    rendererManager.registerRenderer(renderer);
  });

  window.Homey.on('widget:' + window.Homey.clientId + ':deviceUpdate', function (data) {
    statusTiles.forEach(function (entry) {
      if (entry.deviceId === data.deviceId && entry.caps.indexOf(data.capability) >= 0) {
        entry.values[data.capability] = data.value;
        paintStatus(entry);
      }
    });
    document.querySelectorAll('[data-device-id="' + data.deviceId + '"]').forEach(function (deviceEl) {
      var renderer = rendererManager.getRenderer(deviceEl.getAttribute('data-capability'));
      if (renderer && typeof renderer.handleDeviceUpdate === 'function') {
        renderer.handleDeviceUpdate(deviceEl, data.value, data.capability);
      }
    });
  });

  // ---- theme / accent ----

  function applyLook(dashboard) {
    var root = document.documentElement;
    if (dashboard.theme === 'light' || dashboard.theme === 'dark') root.setAttribute('data-theme', dashboard.theme);
    else root.removeAttribute('data-theme');
    if (dashboard.accent) root.style.setProperty('--accent', dashboard.accent);
    else root.style.removeProperty('--accent');
  }

  // ---- blocks ----

  // The tile shows the device's own icon; the floor-plan pin stays in the DOM,
  // hidden, because it carries the tap behaviour (toggle, long press, ...).
  function decorateTile(deviceEl, device) {
    var tile = deviceEl && deviceEl.parentNode;
    if (!tile || !tile.classList.contains('tile')) return;
    deviceEl.style.display = 'none';
    var src = device.iconObj && (device.iconObj.base64 || device.iconObj.url);
    if (!src) return;
    var img = el('img', 'tile-icon');
    img.src = src;
    img.alt = '';
    tile.insertBefore(img, tile.firstChild);
  }

  // ---- tile status text (like "On", "60 %", "21.4 °C") ----

  var HOMEY_CAPABILITY = {
    onoff: 'onoff', dim: 'dim', lock: 'locked', windowcovering: 'windowcoverings_set',
    thermostat: 'target_temperature', speaker: 'speaker_playing'
  };
  var UNITS = { measure_temperature: ' °C', measure_humidity: ' %', measure_battery: ' %', measure_power: ' W',
    meter_power: ' kWh', measure_luminance: ' lx', measure_co2: ' ppm', measure_wind_strength: ' m/s' };
  var statusTiles = [];

  function statusCapabilities(device) {
    if (device.capability === 'measure') {
      return device.measureType === 'combined' ? (device.measureTypes || []) : [device.measureType];
    }
    if (device.capability === 'sensor') return [device.sensorType];
    return HOMEY_CAPABILITY[device.capability] ? [HOMEY_CAPABILITY[device.capability]] : [];
  }

  function formatNumber(value) {
    return typeof value === 'number' ? String(Math.round(value * 10) / 10) : String(value);
  }

  // Returns { text, active } for the current values of a tile.
  function describeStatus(entry) {
    var caps = entry.caps;
    var values = entry.values;
    var first = caps[0];
    var value = values[first];
    if (value === undefined || value === null) return { text: '', active: false };

    if (first === 'onoff') return { text: value ? 'On' : 'Off', active: !!value };
    if (first === 'dim') return { text: value > 0 ? Math.round(value * 100) + ' %' : 'Off', active: value > 0 };
    if (first === 'locked') return { text: value ? 'Locked' : 'Unlocked', active: !!value };
    if (first === 'windowcoverings_set') return { text: Math.round(value * 100) + ' %', active: value > 0 };
    if (first === 'speaker_playing') return { text: value ? 'Playing' : 'Paused', active: !!value };
    if (first === 'target_temperature') return { text: formatNumber(value) + ' °C', active: false };
    if (first.indexOf('alarm_') === 0) return { text: value ? 'Alarm' : 'OK', active: !!value };
    var parts = caps.filter(function (c) { return values[c] !== undefined && values[c] !== null; })
      .map(function (c) { return formatNumber(values[c]) + (UNITS[c] || ''); });
    return { text: parts.join(' · '), active: false };
  }

  function paintStatus(entry) {
    var status = describeStatus(entry);
    entry.statusEl.textContent = status.text;
    entry.tile.classList.toggle('on', status.active);
  }

  async function attachStatus(deviceEl, device) {
    var tile = deviceEl && deviceEl.parentNode;
    if (!tile || !tile.classList.contains('tile')) return;
    var caps = statusCapabilities(device);
    var statusEl = el('div', 'tile-status');
    tile.appendChild(statusEl);
    if (!caps.length) return;

    var entry = { tile: tile, statusEl: statusEl, deviceId: device.homeyId, caps: caps, values: {} };
    statusTiles.push(entry);
    await Promise.all(caps.map(async function (cap) {
      try {
        var value = await window.Homey.api('GET', '/devices/' + encodeURIComponent(device.homeyId) + '/capabilities/' + encodeURIComponent(cap));
        if (value && typeof value === 'object' && 'value' in value) value = value.value;
        entry.values[cap] = value;
      } catch (error) {
        statusEl.title = 'Status unavailable: ' + error.message;
      }
    }));
    paintStatus(entry);
  }

  function flowTile(item) {
    var tile = el('button', 'tile button-tile');
    tile.appendChild(symbol(item.icon || 'play_arrow'));
    tile.appendChild(el('div', 'tile-name', item.label || ''));
    tile.appendChild(el('div', 'tile-status', 'Flow'));
    tile.addEventListener('click', async function () {
      tile.classList.add('pressed');
      try {
        await window.Homey.api('POST', '/flowButtons/' + encodeURIComponent(item.id) + '/press', {});
      } catch (error) {
        tile.classList.add('failed');
        tile.title = error.message;
      }
      setTimeout(function () { tile.classList.remove('pressed'); }, 400);
    });
    return tile;
  }

  function gridFor(block) {
    var grid = el('div', 'grid');
    grid.style.setProperty('--cols', Math.min(Math.max(parseInt(block.columns, 10) || 2, 1), 4));
    return grid;
  }

  async function renderTiles(devices, grid, token) {
    for (var i = 0; i < devices.length; i++) {
      if (token !== state.renderToken) return;
      var device = devices[i];
      if (device.missing) {
        var gone = el('div', 'tile tile-missing');
        gone.appendChild(el('div', 'tile-name', 'Missing device'));
        grid.appendChild(gone);
        continue;
      }
      try {
        var rendered = await rendererManager.renderDevice(device, grid, { view: 'tile' });
        decorateTile(rendered, device);
        attachStatus(rendered, device);
      } catch (error) {
        var broken = el('div', 'tile tile-missing');
        broken.appendChild(el('div', 'tile-name', device.name + ': ' + error.message));
        grid.appendChild(broken);
      }
    }
  }

  var blockRenderers = {
    heading: function (block) {
      return el('h2', 'block-heading', block.text || '');
    },

    spacer: function (block) {
      var spacer = el('div', 'block-spacer');
      spacer.style.height = (parseInt(block.height, 10) || 24) + 'px';
      return spacer;
    },

    link: function (block) {
      var button = el('button', 'link-button');
      if (block.icon) button.appendChild(symbol(block.icon));
      button.appendChild(el('span', null, block.label || 'Go'));
      button.addEventListener('click', function () {
        var index = state.dashboard.pages.findIndex(function (p) { return p.id === block.pageId; });
        if (index >= 0) showPage(index);
      });
      return button;
    },

    // Flow buttons are plain tiles. A button that controls a device is the
    // device's own tile (icon, live status, tap to toggle).
    buttons: async function (block, token) {
      var wrap = el('section', 'block');
      if (block.title) wrap.appendChild(el('h3', 'block-title', block.title));
      var grid = gridFor(block);
      wrap.appendChild(grid);
      var items = block.items || [];

      var deviceItems = items.filter(function (i) { return i.kind === 'device' && i.homeyId; });
      var described = [];
      if (deviceItems.length) {
        described = await window.Homey.api('POST', '/describeDevices', {
          items: deviceItems.map(function (i) { return { homeyId: i.homeyId, capability: i.capability || 'onoff' }; })
        });
        if (token !== state.renderToken) return wrap;
      }

      var next = 0;
      for (var n = 0; n < items.length; n++) {
        var item = items[n];
        if (item.kind === 'device') {
          var device = item.homeyId ? described[next++] : null;
          if (device && item.label) device.name = item.label;
          await renderTiles([device || { missing: true }], grid, token);
          continue;
        }
        grid.appendChild(flowTile(item));
      }
      return wrap;
    },

    floorplan: function (block) {
      var frame = el('iframe', 'floorplan-frame' + (block.background ? ' with-background' : ''));
      frame.setAttribute('scrolling', 'no');
      var height = Math.round(window.innerHeight * 0.7);
      frame.style.height = height + 'px';
      frame.src = '/widget/?floor=' + encodeURIComponent(block.floorId) +
        '&slot=' + encodeURIComponent(block.id) + '&h=' + height;
      frame.setAttribute('title', 'Floor plan');
      return frame;
    },

    room: async function (block, token) {
      var wrap = el('section', 'block');
      var zoneId = block.zoneId;
      if (!zoneId || zoneId === '*') zoneId = store(KEY_ROOM);

      if (!zoneId) {
        wrap.appendChild(el('p', 'hint', 'Choose a room in the menu to fill this block.'));
        return wrap;
      }
      var zone = state.zones.find(function (z) { return z.id === zoneId; });
      wrap.appendChild(el('h3', 'block-title', (block.title || (zone && zone.name) || 'Room')));
      var grid = gridFor(block);
      wrap.appendChild(grid);
      var devices = await window.Homey.api('GET', '/zones/' + encodeURIComponent(zoneId) + '/devices');
      if (token !== state.renderToken) return wrap;
      if (devices.length === 0) wrap.appendChild(el('p', 'hint', 'No supported devices in this room.'));
      renderTiles(devices, grid, token);
      return wrap;
    },

    devices: async function (block, token) {
      var wrap = el('section', 'block');
      if (block.title) wrap.appendChild(el('h3', 'block-title', block.title));
      var grid = gridFor(block);
      wrap.appendChild(grid);
      var items = (block.items || []).map(function (i) { return { homeyId: i.homeyId, capability: i.capability }; });
      var devices = await window.Homey.api('POST', '/describeDevices', { items: items });
      if (token !== state.renderToken) return wrap;
      renderTiles(devices, grid, token);
      return wrap;
    }
  };

  // ---- pages ----

  async function showPage(index) {
    var pages = state.dashboard.pages;
    if (pages.length === 0) {
      message('This dashboard has no pages yet', 'Add pages in the editor.');
      return;
    }
    state.pageIndex = Math.min(Math.max(index, 0), pages.length - 1);
    store(KEY_PAGE + state.dashboard.id, pages[state.pageIndex].id);

    var token = ++state.renderToken;
    var page = pages[state.pageIndex];
    els.title.hidden = true;
    els.page.replaceChildren();
    renderDots();

    for (var i = 0; i < page.blocks.length; i++) {
      var block = page.blocks[i];
      var render = blockRenderers[block.type];
      if (!render) continue;
      try {
        var node = await render(block, token);
        if (token !== state.renderToken) return;
        if (block.visibleOn === 'small') node.classList.add('only-small');
        if (block.visibleOn === 'large') node.classList.add('only-large');
        var span = parseInt(block.span, 10);
        if (span >= 1 && span < 12) node.style.gridColumn = 'span ' + span;
        els.page.appendChild(node);
      } catch (error) {
        var failed = el('p', 'hint error', block.type + ' block failed: ' + error.message);
        els.page.appendChild(failed);
      }
    }
  }

  // Page switcher: only shown when the dashboard has more than one page.
  function renderDots() {
    els.dots.replaceChildren(); els.dots.hidden = true;
    var pages = state.dashboard.pages;
    els.dots.hidden = pages.length < 2;
    if (pages.length < 2) return;
    pages.forEach(function (page, i) {
      var tab = el('button', 'page-tab' + (i === state.pageIndex ? ' active' : ''), page.name);
      tab.addEventListener('click', function () { showPage(i); });
      els.dots.appendChild(tab);
    });
  }

  // Horizontal swipe changes page.
  (function () {
    var startX = null;
    var startY = null;
    document.addEventListener('touchstart', function (e) {
      if (e.target.closest('iframe, input, [role="slider"]')) { startX = null; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (startX === null || !state.dashboard) return;
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      startX = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      showPage(state.pageIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  // The floor plan iframe reports the height it wants.
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || !event.data || event.data.type !== 'sp-height') return;
    document.querySelectorAll('.floorplan-frame').forEach(function (frame) {
      if (frame.contentWindow === event.source) frame.style.height = event.data.height + 'px';
    });
  });

  // ---- menu ----

  function closeMenu() {
    els.menu.hidden = true;
  }

  // The room choice only matters when a room block follows the device's room.
  function usesDeviceRoom() {
    return !!state.dashboard && state.dashboard.pages.some(function (p) {
      return p.blocks.some(function (b) { return b.type === 'room' && (!b.zoneId || b.zoneId === '*'); });
    });
  }

  function openMenu() {
    els.menu.replaceChildren();

    if (state.dashboards.length > 1) {
      els.menu.appendChild(el('div', 'menu-label', 'Dashboard'));
      state.dashboards.forEach(function (dashboard) {
        var item = el('button', 'menu-item' + (state.dashboard && dashboard.id === state.dashboard.id ? ' active' : ''), dashboard.name);
        item.addEventListener('click', function () { closeMenu(); chooseDashboard(dashboard); });
        els.menu.appendChild(item);
      });
    }

    if (state.zones.length && usesDeviceRoom()) {
      els.menu.appendChild(el('div', 'menu-label', 'Room for room blocks'));
      var current = store(KEY_ROOM);
      var none = el('button', 'menu-item' + (!current ? ' active' : ''), 'None');
      none.addEventListener('click', function () { closeMenu(); store(KEY_ROOM, null); showPage(state.pageIndex); });
      els.menu.appendChild(none);
      state.zones.forEach(function (zone) {
        var item = el('button', 'menu-item' + (zone.id === current ? ' active' : ''), zone.name);
        item.addEventListener('click', function () { closeMenu(); store(KEY_ROOM, zone.id); showPage(state.pageIndex); });
        els.menu.appendChild(item);
      });
    }

    var fullscreen = el('button', 'menu-item', 'Fullscreen');
    fullscreen.addEventListener('click', function () {
      closeMenu();
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    });
    els.menu.appendChild(fullscreen);

    var editor = el('a', 'menu-item', 'Editor');
    editor.href = '/editor';
    els.menu.appendChild(editor);

    var signOut = el('button', 'menu-item', 'Sign out');
    signOut.addEventListener('click', async function () {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* the login page will tell */ }
      location.href = '/login';
    });
    els.menu.appendChild(signOut);

    var about = el('div', 'menu-about');
    var supports = function (property, value) { try { return window.CSS && CSS.supports(property, value); } catch (e) { return false; } };
    about.textContent = 'Screen ' + window.innerWidth + '×' + window.innerHeight +
      ' · 8-digit hex ' + (supports('color', '#00000080') ? 'yes' : 'no') +
      ' · aspect-ratio ' + (supports('aspect-ratio', '1 / 1') ? 'yes' : 'no') +
      ' · color-mix ' + (supports('color', 'color-mix(in srgb, red 50%, blue)') ? 'yes' : 'no');
    els.menu.appendChild(about);
    els.menu.appendChild(el('div', 'menu-about', navigator.userAgent));

    els.menu.hidden = false;
  }

  els.menuButton.addEventListener('click', function (e) {
    e.stopPropagation();
    if (els.menu.hidden) openMenu(); else closeMenu();
  });
  document.addEventListener('click', function (e) {
    if (!els.menu.hidden && !els.menu.contains(e.target)) closeMenu();
  });

  // ---- dashboard choice (saved on this device) ----

  function chooseDashboard(dashboard) {
    state.dashboard = dashboard;
    store(KEY_DASHBOARD, dashboard.id);
    applyLook(dashboard);
    applyHeader(dashboard);
    resetSaverTimer();

    var savedPage = store(KEY_PAGE + dashboard.id);
    var index = dashboard.pages.findIndex(function (p) { return p.id === savedPage; });
    showPage(index >= 0 ? index : 0);
  }

  function showPicker() {
    state.dashboard = null;
    els.title.textContent = 'Choose a dashboard';
    els.title.hidden = false;
    els.page.replaceChildren();
    els.dots.replaceChildren(); els.dots.hidden = true;
    var grid = el('div', 'grid');
    grid.style.setProperty('--cols', 2);
    state.dashboards.forEach(function (dashboard) {
      var tile = el('button', 'tile button-tile');
      tile.appendChild(symbol('dashboard'));
      tile.appendChild(el('div', 'tile-name', dashboard.name));
      tile.addEventListener('click', function () { chooseDashboard(dashboard); });
      grid.appendChild(tile);
    });
    els.page.appendChild(grid);
  }

  // ---- header clock and weather ----

  var headerTimer = null;
  var weatherTimer = null;

  function tickHeader() {
    var now = new Date();
    els.clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    els.clockDate.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  }

  async function refreshWeather(deviceId) {
    try {
      var value = await window.Homey.api('GET', '/devices/' + encodeURIComponent(deviceId) + '/capabilities/measure_temperature');
      if (value && typeof value === 'object') value = value.value;
      var number = typeof value === 'string' ? parseFloat(value) : value;
      if (typeof number === 'number' && isFinite(number)) {
        els.weather.textContent = Math.round(number * 10) / 10 + ' °C';
        els.weather.title = '';
      } else {
        els.weather.textContent = '';
        els.weather.title = 'Temperature unavailable: unexpected value ' + JSON.stringify(value);
      }
    } catch (error) {
      els.weather.textContent = '';
      els.weather.title = 'Temperature unavailable: ' + error.message;
    }
  }

  function applyHeader(dashboard) {
    clearInterval(headerTimer);
    clearInterval(weatherTimer);
    els.weather.textContent = '';
    els.clock.hidden = !dashboard.showClock;
    if (!dashboard.showClock) return;
    tickHeader();
    headerTimer = setInterval(tickHeader, 15000);
    if (dashboard.weatherDeviceId) {
      refreshWeather(dashboard.weatherDeviceId);
      weatherTimer = setInterval(function () { refreshWeather(dashboard.weatherDeviceId); }, 300000);
    }
  }

  // ---- screensaver ----

  var saverTimer = null;
  function resetSaverTimer() {
    clearTimeout(saverTimer);
    els.saver.hidden = true;
    var minutes = state.dashboard && parseInt(state.dashboard.screensaverMinutes, 10);
    if (!minutes) return;
    saverTimer = setTimeout(function () {
      els.saver.hidden = false;
      tickClock();
    }, minutes * 60000);
  }

  function tickClock() {
    if (els.saver.hidden) return;
    els.saverClock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTimeout(tickClock, 15000);
  }

  ['touchstart', 'mousedown', 'keydown'].forEach(function (name) {
    document.addEventListener(name, resetSaverTimer, { passive: true });
  });

  // ---- start ----

  async function start() {
    try {
      var results = await Promise.all([
        window.Homey.api('GET', '/dashboards'),
        window.Homey.api('GET', '/zones')
      ]);
      state.dashboards = results[0] || [];
      state.zones = (results[1] || []).sort(function (a, b) { return a.name.localeCompare(b.name); });
    } catch (error) {
      message('Could not load the dashboard', error.message);
      return;
    }

    if (state.dashboards.length === 0) {
      message('No dashboards yet', 'Add floors in the Spacey Plan settings or create a dashboard in the editor.');
      return;
    }

    // ?d=<id or name> picks (and remembers) a dashboard for this device.
    var wanted = params.get('d');
    var byParam = wanted && state.dashboards.find(function (d) {
      return d.id === wanted || d.name.toLowerCase() === wanted.toLowerCase();
    });
    var byStore = state.dashboards.find(function (d) { return d.id === store(KEY_DASHBOARD); });

    if (byParam) chooseDashboard(byParam);
    else if (byStore) chooseDashboard(byStore);
    else if (state.dashboards.length === 1) chooseDashboard(state.dashboards[0]);
    else showPicker();
  }

  start();
})();
