// Device popup for the External Dashboard. Replaces the widget's own popup
// for on/off and dimmable devices (lights, plugs, TVs) with one card: power,
// brightness, colour or white, colour temperature and quick colours. It opens
// in the top dashboard window, so a popup from a floor plan (an iframe) covers
// the whole screen. Other device types keep their own popups, restyled by
// device-popup.css. Loaded only by the dashboard server: the widget inside the
// Homey app is unchanged.
(function () {
  'use strict';

  var isTop = window.top === window;
  // Renderers whose popup is replaced: switches and lights, and sensor readings.
  var POPUP_RENDERERS = ['onoff', 'dim', 'measure', 'sensor'];

  // The outermost same-origin window that has the popup (the dashboard page).
  function outermostHost(name) {
    name = name || 'SpaceyDevicePopup';
    var found = null;
    var w = window;
    for (var i = 0; i < 5; i++) {
      try { if (w[name]) found = w[name]; } catch (e) { break; }
      if (w.parent === w) break;
      w = w.parent;
    }
    return found;
  }

  // ---- patch the widget renderers (in this window) ----

  function patch() {
    var renderers = window.capabilityRenderers || {};
    Object.keys(renderers).forEach(function (key) {
      var renderer = renderers[key];
      // Speakers: the music player card (dashboard/public/music.js), when the
      // dashboard page has it; otherwise the widget's own volume popup stays.
      if (renderer && renderer.id === 'speaker' && typeof renderer.showVolumeModal === 'function' && !renderer.__spPopup) {
        var original = renderer.showVolumeModal;
        renderer.__spPopup = true;
        renderer.showVolumeModal = function (deviceEl) {
          var music = outermostHost('SpaceyMusicPopup');
          var homeyId = deviceEl.getAttribute('data-homey-id');
          if (!music || !homeyId) return original.call(this, deviceEl);
          music.open(homeyId);
        };
        return;
      }
      if (!renderer || POPUP_RENDERERS.indexOf(renderer.id) < 0 || typeof renderer.showDeviceModal !== 'function' || renderer.__spPopup) return;
      renderer.__spPopup = true;
      renderer.showDeviceModal = function (deviceEl) {
        var homeyId = deviceEl.getAttribute('data-homey-id');
        if (!homeyId) {
          try { homeyId = JSON.parse(deviceEl.getAttribute('data-device') || '{}').homeyId; } catch (e) { /* below */ }
        }
        (outermostHost() || window.SpaceyDevicePopup).open(homeyId || deviceEl.getAttribute('data-device-id'));
      };
    });
  }

  // ---- popup (used in the top window) ----

  var TEXT = {
    sv: { alarm: 'Larm', ok: 'OK', open: 'Öppen', closed: 'Stängd', motion: 'Rörelse', still: 'Ingen rörelse', noReadings: 'Inga mätvärden', on: 'På', off: 'Av', brightness: 'Ljusstyrka', temperature: 'Färgtemperatur', colour: 'Färg', white: 'Vitt',
      saturation: 'Mättnad', quick: 'Snabbval', close: 'Stäng', unavailable: 'Enheten svarar inte', failed: 'Gick inte att ändra: ' },
    en: { alarm: 'Alarm', ok: 'OK', open: 'Open', closed: 'Closed', motion: 'Motion', still: 'No motion', noReadings: 'No readings', on: 'On', off: 'Off', brightness: 'Brightness', temperature: 'Colour temperature', colour: 'Colour', white: 'White',
      saturation: 'Saturation', quick: 'Quick colours', close: 'Close', unavailable: 'Device is unavailable', failed: 'Could not change: ' }
  };

  function lang() {
    var chosen = window.__spLanguage;
    if (chosen === 'sv' || chosen === 'en') return chosen;
    return /^(sv|nb|no|da)/i.test(navigator.language || '') ? 'sv' : 'en';
  }

  // Homey: light_temperature 0 = cold, 1 = warm. Shown as Kelvin.
  var COLD_K = 6500;
  var WARM_K = 2200;
  function kelvin(t) { return Math.round((COLD_K - t * (COLD_K - WARM_K)) / 50) * 50; }

  var QUICK = [
    { label: 'Varmvitt', mode: 'temperature', temperature: 0.85, swatch: '#ffc477' },
    { label: 'Kallvitt', mode: 'temperature', temperature: 0.1, swatch: '#e4efff' },
    { label: 'Orange', mode: 'color', hue: 0.07, saturation: 0.9, swatch: '#ff8a2a' },
    { label: 'Röd', mode: 'color', hue: 0, saturation: 1, swatch: '#ff3b3b' },
    { label: 'Lila', mode: 'color', hue: 0.78, saturation: 0.85, swatch: '#a14dff' },
    { label: 'Blå', mode: 'color', hue: 0.62, saturation: 0.9, swatch: '#3d6bff' },
    { label: 'Grön', mode: 'color', hue: 0.33, saturation: 0.8, swatch: '#3ddc6b' }
  ];

  function h(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function symbol(name, className) { return h('span', 'material-symbols-outlined' + (className ? ' ' + className : ''), name); }

  async function api(method, path, body) {
    var options = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    var response = await fetch('/api' + path, options);
    if (response.status === 401) { location.href = '/login'; throw new Error('PIN required'); }
    var data = await response.json();
    if (!response.ok) throw new Error((data && data.error) || ('HTTP ' + response.status));
    return data;
  }

  function hsl(hue, sat) { return 'hsl(' + Math.round(hue * 360) + ', ' + Math.round(sat * 100) + '%, ' + Math.round(100 - sat * 50) + '%)'; }

  var current = null; // { homeyId, onUpdate }
  var listening = false;

  function listenForUpdates() {
    if (listening || !window.Homey || !window.Homey.on) return;
    listening = true;
    window.Homey.on('widget:' + window.Homey.clientId + ':deviceUpdate', function (data) {
      if (current && data && data.deviceId === current.homeyId) current.onUpdate(data.capability, data.value);
    });
  }

  function slider(className, value) {
    var input = h('input', 'sp-range ' + (className || ''));
    input.type = 'range'; input.min = 0; input.max = 100; input.step = 1;
    input.value = value;
    input.dragging = false;
    var fill = function () { input.style.setProperty('--fill', input.value + '%'); };
    input.addEventListener('pointerdown', function () { input.dragging = true; });
    input.addEventListener('input', fill);
    input.refill = fill;
    fill();
    return input;
  }

  function open(homeyId) {
    if (!homeyId) return;
    close();
    listenForUpdates();
    var T = TEXT[lang()];

    var overlay = h('div', 'sp-pop-overlay');
    var card = h('div', 'sp-pop');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    overlay.appendChild(card);

    var head = h('div', 'sp-pop-head');
    var iconBox = h('div', 'sp-pop-icon');
    iconBox.appendChild(symbol('lightbulb'));
    var titles = h('div', 'sp-pop-titles');
    var title = h('div', 'sp-pop-title', '…');
    var sub = h('div', 'sp-pop-sub', '');
    titles.appendChild(title); titles.appendChild(sub);
    var closeBtn = h('button', 'sp-pop-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', T.close);
    closeBtn.appendChild(symbol('close'));
    head.appendChild(iconBox); head.appendChild(titles); head.appendChild(closeBtn);
    card.appendChild(head);

    var body = h('div', 'sp-pop-body');
    card.appendChild(body);
    var status = h('div', 'sp-pop-status');
    status.hidden = true;
    card.appendChild(status);

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });

    current = { homeyId: homeyId, overlay: overlay, onUpdate: function () {} };

    api('GET', '/deviceDetail/' + encodeURIComponent(homeyId)).then(function (detail) {
      if (!current || current.overlay !== overlay) return;
      var light = Object.prototype.hasOwnProperty.call(detail.values, 'onoff') || Object.prototype.hasOwnProperty.call(detail.values, 'dim');
      (light ? build : buildReadings)(detail, { title: title, sub: sub, iconBox: iconBox, body: body, status: status, card: card, T: T });
    }).catch(function (error) {
      title.textContent = '';
      showStatus(status, error.message);
    });

  }

  function showStatus(status, text) {
    status.textContent = text;
    status.hidden = !text;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!current) return;
    var overlay = current.overlay;
    current = null;
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('open');
    setTimeout(function () { overlay.remove(); }, 180);
  }

  var READING_SYMBOLS = {
    measure_temperature: 'thermostat', measure_humidity: 'humidity_percentage', measure_luminance: 'light_mode',
    measure_power: 'bolt', meter_power: 'electric_meter', measure_co2: 'co2', measure_battery: 'battery_full',
    measure_pressure: 'compress', measure_noise: 'graphic_eq', measure_voltage: 'electrical_services',
    measure_current: 'electric_bolt', measure_wind_strength: 'air', measure_rain: 'rainy',
    alarm_motion: 'directions_run', alarm_contact: 'door_open', alarm_water: 'water_drop', alarm_smoke: 'detector_smoke',
    alarm_tamper: 'front_hand', alarm_battery: 'battery_alert', alarm_co: 'co2', alarm_generic: 'notifications'
  };

  function header(detail, ui) {
    ui.title.textContent = detail.name;
    ui.sub.textContent = [detail.floorName, detail.zoneName].filter(Boolean).join(' · ');
    if (detail.icon) {
      var img = h('img');
      img.alt = '';
      img.src = detail.icon;
      ui.iconBox.replaceChildren(img);
    }
    if (!detail.available) showStatus(ui.status, ui.T.unavailable);
  }

  function formatReading(r, T) {
    var cap = r.capability;
    var base = cap.split('.')[0];
    if (base.indexOf('alarm_') === 0) {
      if (base === 'alarm_contact') return { text: r.value ? T.open : T.closed, alert: !!r.value };
      if (base === 'alarm_motion') return { text: r.value ? T.motion : T.still, alert: false };
      return { text: r.value ? T.alarm : T.ok, alert: !!r.value };
    }
    if (typeof r.value !== 'number') return { text: '–', alert: false };
    var n = Math.round(r.value * 10) / 10;
    var text = String(n);
    if (lang() === 'sv') text = text.replace('.', ',');
    return { text: text + (r.units ? ' ' + r.units : ''), alert: false };
  }

  // Sensors: one card per reading (temperature, humidity, motion, ...).
  function buildReadings(detail, ui) {
    var T = ui.T;
    header(detail, ui);
    var grid = h('div', 'sp-pop-readings');
    var cells = {};
    if (!detail.readings.length) ui.body.appendChild(h('p', 'sp-pop-empty', T.noReadings));
    detail.readings.forEach(function (r) {
      var cell = h('div', 'sp-reading');
      cell.appendChild(symbol(READING_SYMBOLS[r.capability.split('.')[0]] || 'sensors'));
      var value = h('div', 'sp-reading-value');
      cell.appendChild(value);
      cell.appendChild(h('div', 'sp-reading-title', r.title));
      cells[r.capability] = { cell: cell, value: value, reading: r };
      grid.appendChild(cell);
    });
    ui.body.appendChild(grid);
    function paint(entry) {
      var f = formatReading(entry.reading, T);
      entry.value.textContent = f.text;
      entry.cell.classList.toggle('alert', f.alert);
    }
    Object.keys(cells).forEach(function (k) { paint(cells[k]); });
    if (window.Homey && window.Homey.api && detail.readings.length) {
      window.Homey.api('POST', '/subscribeToDevices', {
        widgetId: window.Homey.clientId,
        devices: detail.readings.map(function (r) { return { deviceId: detail.id, capability: r.capability }; })
      }).catch(function () { /* readings stay as loaded */ });
    }
    current.onUpdate = function (capability, value) {
      var entry = cells[capability];
      if (!entry || (value !== null && typeof value === 'object')) return;
      entry.reading.value = value;
      paint(entry);
    };
  }

  function build(detail, ui) {
    var T = ui.T;
    var v = detail.values;
    var has = function (cap) { return Object.prototype.hasOwnProperty.call(v, cap); };
    header(detail, ui);

    // live on/off and brightness for this device
    var live = ['onoff', 'dim'].filter(has).map(function (cap) { return { deviceId: detail.id, capability: cap }; });
    if (window.Homey && window.Homey.api && live.length) {
      window.Homey.api('POST', '/subscribeToDevices', { widgetId: window.Homey.clientId, devices: live })
        .catch(function () { /* the popup still works, just without live updates */ });
    }

    function send(capability, value) {
      v[capability] = value;
      showStatus(ui.status, detail.available ? '' : T.unavailable);
      return api('POST', '/deviceCapability', { deviceId: detail.id, capability: capability, value: value })
        .catch(function (error) { showStatus(ui.status, T.failed + error.message); });
    }

    var isOn = function () {
      if (has('onoff')) return v.onoff === true;
      return typeof v.dim === 'number' && v.dim > 0;
    };

    // power row
    var power = h('label', 'sp-pop-power');
    var powerText = h('span', 'sp-pop-power-text');
    var box = h('input');
    box.type = 'checkbox';
    var track = h('span', 'sp-switch');
    power.appendChild(powerText); power.appendChild(box); power.appendChild(track);
    ui.body.appendChild(power);
    box.addEventListener('change', function () {
      if (has('onoff')) send('onoff', box.checked);
      else send('dim', box.checked ? 1 : 0);
      paint();
    });

    var controls = h('div', 'sp-pop-controls');
    ui.body.appendChild(controls);

    // brightness
    var bright = null;
    var brightValue = null;
    if (has('dim')) {
      var row = h('div', 'sp-pop-row');
      var label = h('div', 'sp-pop-label');
      label.appendChild(symbol('light_mode'));
      label.appendChild(h('span', null, T.brightness));
      brightValue = h('span', 'sp-pop-value');
      label.appendChild(brightValue);
      bright = slider('sp-range-gold', Math.round((v.dim || 0) * 100));
      bright.addEventListener('input', function () { brightValue.textContent = bright.value + ' %'; });
      bright.addEventListener('change', function () {
        bright.dragging = false;
        var value = Number(bright.value) / 100;
        if (value === 0 && has('onoff')) send('onoff', false); else send('dim', value);
        if (value > 0 && has('onoff')) v.onoff = true;
        paint();
      });
      row.appendChild(label); row.appendChild(bright);
      controls.appendChild(row);
    }

    var hasColour = has('light_hue') && has('light_saturation');
    var hasWhite = has('light_temperature');
    var mode = v.light_mode === 'temperature' || !hasColour ? 'temperature' : 'color';
    if (!hasWhite) mode = 'color';

    var colourView = null;
    var whiteView = null;
    var tabs = null;
    var wheelThumb = null;
    var satSlider = null;
    var tempSlider = null;
    var tempValue = null;
    var satValue = null;

    if (hasColour && hasWhite) {
      tabs = h('div', 'sp-pop-tabs');
      [['color', T.colour, 'palette'], ['temperature', T.white, 'wb_sunny']].forEach(function (t) {
        var b = h('button', 'sp-pop-tab');
        b.type = 'button';
        b.dataset.mode = t[0];
        b.appendChild(symbol(t[2]));
        b.appendChild(h('span', null, t[1]));
        b.addEventListener('click', function () { mode = t[0]; showMode(); send('light_mode', t[0]); });
        tabs.appendChild(b);
      });
      controls.appendChild(tabs);
    }

    if (hasColour) {
      colourView = h('div', 'sp-pop-colour');
      var wheel = h('div', 'sp-wheel');
      wheelThumb = h('div', 'sp-wheel-thumb');
      wheel.appendChild(wheelThumb);
      colourView.appendChild(wheel);

      var satRow = h('div', 'sp-pop-row');
      var satLabel = h('div', 'sp-pop-label');
      satLabel.appendChild(symbol('water_drop'));
      satLabel.appendChild(h('span', null, T.saturation));
      satValue = h('span', 'sp-pop-value');
      satLabel.appendChild(satValue);
      satSlider = slider('sp-range-sat', Math.round((v.light_saturation || 0) * 100));
      satSlider.addEventListener('input', function () { satValue.textContent = satSlider.value + ' %'; v.light_saturation = Number(satSlider.value) / 100; placeThumb(); });
      satSlider.addEventListener('change', function () { satSlider.dragging = false; send('light_saturation', Number(satSlider.value) / 100); ensureColourMode(); });
      satRow.appendChild(satLabel); satRow.appendChild(satSlider);
      colourView.appendChild(satRow);
      controls.appendChild(colourView);

      // Hue is the angle (0 at the top, clockwise), saturation the distance from the centre.
      var pick = function (e, commit) {
        var rect = wheel.getBoundingClientRect();
        var x = e.clientX - (rect.left + rect.width / 2);
        var y = e.clientY - (rect.top + rect.height / 2);
        var radius = rect.width / 2;
        var angle = Math.atan2(x, -y);
        if (angle < 0) angle += Math.PI * 2;
        v.light_hue = angle / (Math.PI * 2);
        v.light_saturation = Math.min(1, Math.sqrt(x * x + y * y) / radius);
        placeThumb();
        if (commit) {
          send('light_hue', v.light_hue);
          send('light_saturation', v.light_saturation);
          ensureColourMode();
        }
      };
      var dragging = false;
      wheel.addEventListener('pointerdown', function (e) { dragging = true; wheel.setPointerCapture(e.pointerId); pick(e, false); });
      wheel.addEventListener('pointermove', function (e) { if (dragging) pick(e, false); });
      wheel.addEventListener('pointerup', function (e) { if (!dragging) return; dragging = false; pick(e, true); });
      wheel.addEventListener('pointercancel', function () { dragging = false; });
    }

    if (hasWhite) {
      whiteView = h('div', 'sp-pop-white');
      var tempRow = h('div', 'sp-pop-row');
      var tempLabel = h('div', 'sp-pop-label');
      tempLabel.appendChild(symbol('device_thermostat'));
      tempLabel.appendChild(h('span', null, T.temperature));
      tempValue = h('span', 'sp-pop-value');
      tempLabel.appendChild(tempValue);
      // left = warm, right = cold
      tempSlider = slider('sp-range-temp', Math.round((1 - (v.light_temperature || 0)) * 100));
      tempSlider.addEventListener('input', function () { tempValue.textContent = kelvin(1 - Number(tempSlider.value) / 100) + ' K'; });
      tempSlider.addEventListener('change', function () {
        tempSlider.dragging = false;
        v.light_temperature = 1 - Number(tempSlider.value) / 100;
        send('light_temperature', v.light_temperature);
        if (hasColour && mode !== 'temperature') { mode = 'temperature'; showMode(); send('light_mode', 'temperature'); }
      });
      tempRow.appendChild(tempLabel); tempRow.appendChild(tempSlider);
      whiteView.appendChild(tempRow);
      controls.appendChild(whiteView);
    }

    if (hasColour || hasWhite) {
      var quick = h('div', 'sp-pop-quick');
      quick.appendChild(h('div', 'sp-pop-quick-label', T.quick));
      var row2 = h('div', 'sp-pop-swatches');
      QUICK.filter(function (q) { return q.mode === 'color' ? hasColour : hasWhite; }).forEach(function (q) {
        var b = h('button', 'sp-swatch');
        b.type = 'button';
        b.title = q.label;
        b.setAttribute('aria-label', q.label);
        b.style.setProperty('--swatch', q.swatch);
        b.addEventListener('click', function () {
          if (has('onoff') && !v.onoff) send('onoff', true);
          if (q.mode === 'color') {
            v.light_hue = q.hue; v.light_saturation = q.saturation;
            send('light_hue', q.hue); send('light_saturation', q.saturation);
            if (hasWhite) send('light_mode', 'color');
            mode = 'color';
          } else {
            v.light_temperature = q.temperature;
            send('light_temperature', q.temperature);
            if (hasColour) send('light_mode', 'temperature');
            mode = 'temperature';
          }
          showMode();
          paint();
        });
        row2.appendChild(b);
      });
      quick.appendChild(row2);
      controls.appendChild(quick);
    }

    function ensureColourMode() {
      if (hasWhite && mode !== 'color') { mode = 'color'; showMode(); send('light_mode', 'color'); }
    }

    function placeThumb() {
      if (!wheelThumb) return;
      var angle = (v.light_hue || 0) * Math.PI * 2;
      var r = (v.light_saturation || 0) * 50;
      wheelThumb.style.left = (50 + Math.sin(angle) * r) + '%';
      wheelThumb.style.top = (50 - Math.cos(angle) * r) + '%';
      wheelThumb.style.background = hsl(v.light_hue || 0, v.light_saturation || 0);
      if (satSlider && !satSlider.dragging) { satSlider.value = Math.round((v.light_saturation || 0) * 100); satSlider.refill(); }
      if (satValue) satValue.textContent = Math.round((v.light_saturation || 0) * 100) + ' %';
      if (satSlider) satSlider.style.setProperty('--hue', Math.round((v.light_hue || 0) * 360));
    }

    function showMode() {
      if (colourView) colourView.hidden = mode !== 'color';
      if (whiteView) whiteView.hidden = hasColour && mode === 'color';
      if (tabs) Array.prototype.forEach.call(tabs.children, function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
    }

    function paint() {
      var on = isOn();
      box.checked = on;
      powerText.textContent = on ? T.on : T.off;
      ui.card.classList.toggle('is-on', on);
      controls.classList.toggle('dimmed', !on);
      if (bright && !bright.dragging) {
        bright.value = Math.round((on ? v.dim || 0 : 0) * 100);
        bright.refill();
      }
      if (brightValue) brightValue.textContent = (bright ? bright.value : 0) + ' %';
      if (tempSlider && !tempSlider.dragging) { tempSlider.value = Math.round((1 - (v.light_temperature || 0)) * 100); tempSlider.refill(); }
      if (tempValue) tempValue.textContent = kelvin(v.light_temperature || 0) + ' K';
      placeThumb();
    }

    current.onUpdate = function (capability, value) {
      if (capability === 'onoff' || capability === 'dim') { v[capability] = value; paint(); }
    };

    showMode();
    paint();
  }

  window.SpaceyDevicePopup = { open: open, close: close };

  // Renderer scripts are loaded before this file on the dashboard page; in the
  // floor plan iframe this runs right before the widget starts.
  patch();
  if (!isTop) document.addEventListener('DOMContentLoaded', patch);
})();
