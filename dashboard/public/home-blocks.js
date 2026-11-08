// "Home" blocks for the dashboard: hero image with clock and weather, outdoor
// weather, indoor climate and lighting (summary card that opens a sheet with
// floor plans and per-room controls). dashboard.js calls these through
// window.SpaceyHomeBlocks with a small context object (see makeContext there).
(function () {
  'use strict';

  // ---- language ----

  var TEXT = {
    en: {
      lighting: 'Lighting', lightsOn: function (n) { return n === 1 ? '1 light on' : n + ' lights on'; },
      allOff: 'All lights off', weather: 'Weather', indoor: 'Indoors', rooms: 'Rooms', outdoor: 'Outdoors',
      outdoorLights: 'Outdoor lighting', turnAllOff: 'All off', turnAllOn: 'All on', close: 'Close',
      noLights: 'No lights found. Lights are found through the rooms of devices placed on the floor plan.',
      ofOn: function (on, all) { return on + ' of ' + all + ' on'; },
      failed: function (n) { return n === 1 ? '1 light did not respond' : n + ' lights did not respond'; },
      unavailable: 'Unavailable', missing: 'Missing device', chooseSensor: 'Choose temperature sensors in the editor.',
      chooseImage: 'Upload an image in the editor.',
      codes: {
        0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog',
        51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
        61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
        71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
        80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers',
        95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
      }
    },
    sv: {
      lighting: 'Belysning', lightsOn: function (n) { return n === 1 ? '1 lampa på' : n + ' lampor på'; },
      allOff: 'Alla lampor släckta', weather: 'Väder ute', indoor: 'Inomhus', rooms: 'Rum', outdoor: 'Ute',
      outdoorLights: 'Utebelysning', turnAllOff: 'Släck allt', turnAllOn: 'Tänd allt', close: 'Stäng',
      noLights: 'Inga lampor hittades. Lampor hittas via rummen för enheter som är placerade på planritningen.',
      ofOn: function (on, all) { return on + ' av ' + all + ' på'; },
      failed: function (n) { return n === 1 ? '1 lampa svarade inte' : n + ' lampor svarade inte'; },
      unavailable: 'Ej tillgänglig', missing: 'Enhet saknas', chooseSensor: 'Välj temperaturgivare i editorn.',
      chooseImage: 'Ladda upp en bild i editorn.',
      codes: {
        0: 'Klart', 1: 'Mestadels klart', 2: 'Halvklart', 3: 'Mulet', 45: 'Dimma', 48: 'Dimma',
        51: 'Duggregn', 53: 'Duggregn', 55: 'Duggregn', 56: 'Underkylt duggregn', 57: 'Underkylt duggregn',
        61: 'Lätt regn', 63: 'Regn', 65: 'Kraftigt regn', 66: 'Underkylt regn', 67: 'Underkylt regn',
        71: 'Lätt snöfall', 73: 'Snöfall', 75: 'Kraftigt snöfall', 77: 'Kornsnö',
        80: 'Regnskurar', 81: 'Regnskurar', 82: 'Kraftiga skurar', 85: 'Snöbyar', 86: 'Snöbyar',
        95: 'Åska', 96: 'Åska', 99: 'Åska'
      }
    }
  };

  function language(dashboard) {
    if (dashboard && (dashboard.language === 'sv' || dashboard.language === 'en')) return dashboard.language;
    return /^(sv|nb|no|da)/i.test(navigator.language || '') ? 'sv' : 'en';
  }

  function weatherSymbol(code, isDay) {
    if (code === 0 || code === 1) return isDay ? 'clear_day' : 'bedtime';
    if (code === 2) return isDay ? 'partly_cloudy_day' : 'partly_cloudy_night';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'foggy';
    if (code >= 71 && code <= 77) return 'weather_snowy';
    if (code === 85 || code === 86) return 'weather_snowy';
    if (code >= 95) return 'thunderstorm';
    if (code >= 51) return 'rainy';
    return 'cloud';
  }

  // Homey zone icon -> Material Symbol
  var ZONE_SYMBOLS = {
    livingRoom: 'weekend', kitchen: 'restaurant', diningRoom: 'dining', bedroomSingle: 'single_bed',
    bedroomDouble: 'bed', bedroom: 'bed', kidsBedroom: 'crib', bathroom: 'bathtub', toilet: 'wc',
    office: 'desk', study: 'desk', garage: 'garage', garden: 'park', gardenShed: 'cottage', shed: 'cottage',
    hallway: 'door_front', entrance: 'door_front', stairs: 'stairs', laundryRoom: 'local_laundry_service',
    basement: 'stairs', attic: 'roofing', terrace: 'deck', balcony: 'balcony', driveway: 'road',
    pool: 'pool', gym: 'fitness_center', cinema: 'theaters', sauna: 'hot_tub', home: 'home', default: 'home'
  };

  function zoneSymbol(icon, fallback) { return ZONE_SYMBOLS[icon] || fallback || 'light'; }

  function round1(n) { return Math.round(n * 10) / 10; }

  function formatTemp(value, lang) {
    if (typeof value !== 'number' || !isFinite(value)) return '–';
    var text = String(round1(value));
    return (lang === 'sv' ? text.replace('.', ',') : text) + '°';
  }

  // ---- shared weather fetch (hero + weather block share one request) ----

  var weatherPromise = null;
  var weatherAt = 0;
  function loadWeather(ctx) {
    if (!weatherPromise || Date.now() - weatherAt > 5 * 60000) {
      weatherAt = Date.now();
      weatherPromise = ctx.api('GET', '/weather');
      weatherPromise.catch(function () { weatherPromise = null; });
    }
    return weatherPromise;
  }

  // ---- hero ----

  function hero(block, ctx) {
    var el = ctx.el;
    var lang = language(ctx.dashboard);
    var section = el('section', 'hero');
    var height = parseInt(block.height, 10) || 360;
    section.style.height = height + 'px';

    if (block.imageId) {
      var img = el('img', 'hero-img');
      img.alt = '';
      img.src = '/media/' + encodeURIComponent(block.imageId);
      img.style.objectPosition = '50% ' + (block.focusY === undefined ? 60 : block.focusY) + '%';
      img.addEventListener('error', function () { section.classList.add('hero-broken'); section.title = 'Image could not be loaded'; });
      section.appendChild(img);
    } else {
      section.appendChild(el('div', 'hero-empty', TEXT[lang].chooseImage));
    }
    section.appendChild(el('div', 'hero-shade'));

    var top = el('div', 'hero-top');
    var brand = el('div', 'hero-brand');
    brand.appendChild(el('span', 'hero-mark'));
    brand.appendChild(el('span', null, block.title || ctx.dashboard.name));
    top.appendChild(brand);

    var right = el('div', 'hero-right');
    var now = el('div', 'hero-now');
    var date = el('div', 'hero-date');
    var time = el('div', 'hero-time');
    now.appendChild(date); now.appendChild(time);
    right.appendChild(now);

    var locale = lang === 'sv' ? 'sv-SE' : undefined;
    function tick() {
      var d = new Date();
      time.textContent = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      var text = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      date.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    }
    tick();
    ctx.every(15000, tick);

    if (block.showWeather !== false) {
      var weather = el('div', 'hero-weather');
      right.appendChild(el('div', 'hero-sep'));
      right.appendChild(weather);
      var paint = function () {
        loadWeather(ctx).then(function (w) {
          weather.replaceChildren();
          weather.title = '';
          weather.appendChild(ctx.symbol(weatherSymbol(w.code, w.isDay), 'hero-weather-icon'));
          var text = el('div', 'hero-weather-text');
          text.appendChild(el('div', 'hero-weather-temp', formatTemp(Math.round(w.temperature), lang)));
          text.appendChild(el('div', 'hero-weather-cond', TEXT[lang].codes[w.code] || ''));
          weather.appendChild(text);
        }).catch(function (error) {
          weather.replaceChildren(ctx.symbol('cloud_off', 'hero-weather-icon'));
          weather.title = 'Weather unavailable: ' + error.message;
        });
      };
      paint();
      ctx.every(10 * 60000, paint);
    }
    top.appendChild(right);

    // Evening style: the photo and the top bar stay put while the cards
    // scroll over the photo; the bar darkens once cards slide under it.
    if (ctx.dashboard.style === 'evening') {
      var slot = el('div', 'hero-slot');
      slot.style.height = height + 'px';
      section.classList.add('hero-fixed');
      top.classList.add('hero-bar');
      slot.appendChild(section);
      slot.appendChild(top);
      var onScroll = function () {
        if (!slot.isConnected) { window.removeEventListener('scroll', onScroll); return; }
        top.classList.toggle('scrolled', window.scrollY > height - 70 - top.offsetHeight);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      requestAnimationFrame(onScroll);
      return slot;
    }
    section.appendChild(top);
    return section;
  }

  // ---- weather card ----

  function weatherCard(block, ctx) {
    var el = ctx.el;
    var lang = language(ctx.dashboard);
    var card = el('section', 'card weather-card');
    var head = el('div', 'card-head');
    head.appendChild(ctx.symbol('partly_cloudy_night', 'card-head-icon'));
    head.appendChild(el('span', null, block.title || TEXT[lang].weather));
    card.appendChild(head);
    var body = el('div', 'weather-body');
    card.appendChild(body);

    function paint() {
      loadWeather(ctx).then(function (w) {
        body.replaceChildren();
        card.classList.toggle('is-night', !w.isDay);
        var main = el('div', 'weather-main');
        main.appendChild(el('div', 'big-temp', formatTemp(Math.round(w.temperature), lang)));
        main.appendChild(el('div', 'muted-line', TEXT[lang].codes[w.code] || ''));
        body.appendChild(main);
        body.appendChild(ctx.symbol(weatherSymbol(w.code, w.isDay), 'weather-art'));
        var list = el('div', 'weather-facts');
        var fact = function (icon, text) {
          if (text === null || text === undefined || text === '') return;
          var row = el('div', 'fact');
          row.appendChild(ctx.symbol(icon));
          row.appendChild(el('span', null, text));
          list.appendChild(row);
        };
        var num = function (n) { return lang === 'sv' ? String(round1(n)).replace('.', ',') : String(round1(n)); };
        fact('air', typeof w.wind === 'number' ? num(w.wind) + ' m/s' : null);
        fact('umbrella', typeof w.precipitationProbability === 'number' ? w.precipitationProbability + ' %' : null);
        fact('wb_twilight', w.sunrise);
        fact('wb_twilight', w.sunset);
        body.appendChild(list);
      }).catch(function (error) {
        body.replaceChildren(el('p', 'hint error', 'Weather unavailable: ' + error.message));
      });
    }
    paint();
    ctx.every(10 * 60000, paint);
    return card;
  }

  // ---- indoor climate card ----

  function climateCard(block, ctx) {
    var el = ctx.el;
    var lang = language(ctx.dashboard);
    var card = el('section', 'card climate-card');
    var head = el('div', 'card-head');
    head.appendChild(ctx.symbol('thermostat', 'card-head-icon'));
    head.appendChild(el('span', null, block.title || TEXT[lang].indoor));
    card.appendChild(head);
    card.insertAdjacentHTML('beforeend',
      '<svg class="climate-wave" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 30 C 50 30, 70 12, 120 18 S 200 34, 240 20 S 285 6, 300 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>');
    var body = el('div', 'climate-body');
    card.appendChild(body);

    var ids = [block.mainDeviceId].concat((block.items || []).map(function (i) { return i.homeyId; }))
      .filter(function (id, i, all) { return id && all.indexOf(id) === i; });
    if (!ids.length) {
      body.appendChild(el('p', 'hint', TEXT[lang].chooseSensor));
      return card;
    }

    ctx.api('POST', '/climate', { deviceIds: ids }).then(function (sensors) {
      var cells = {};
      var main = block.mainDeviceId ? sensors[0] : null;
      var others = block.mainDeviceId ? sensors.slice(1) : sensors;

      if (main) {
        var mainBox = el('div', 'climate-main');
        cells[main.id] = el('div', 'big-temp', main.missing ? '–' : formatTemp(main.temperature, lang));
        mainBox.appendChild(cells[main.id]);
        var where = el('div', 'muted-line');
        where.appendChild(ctx.symbol('home'));
        where.appendChild(el('span', null, main.missing ? TEXT[lang].missing : (main.zoneName || main.name)));
        mainBox.appendChild(where);
        body.appendChild(mainBox);
      }
      if (others.length) {
        var list = el('div', 'climate-list');
        others.forEach(function (s) {
          var row = el('div', 'climate-row');
          row.appendChild(ctx.symbol(zoneSymbol(s.zoneIcon, 'thermostat')));
          row.appendChild(el('span', 'climate-name', s.missing ? TEXT[lang].missing : (s.zoneName || s.name)));
          cells[s.id] = el('span', 'climate-value', s.missing ? '–' : formatTemp(s.temperature, lang));
          row.appendChild(cells[s.id]);
          list.appendChild(row);
        });
        body.appendChild(list);
      }

      var live = sensors.filter(function (s) { return !s.missing; });
      ctx.subscribe(live.map(function (s) { return { deviceId: s.id, capability: 'measure_temperature' }; }));
      ctx.onDeviceUpdate(function (data) {
        if (data.capability === 'measure_temperature' && cells[data.deviceId]) {
          cells[data.deviceId].textContent = formatTemp(data.value, lang);
        }
      });
    }).catch(function (error) {
      body.replaceChildren(el('p', 'hint error', 'Climate unavailable: ' + error.message));
    });
    return card;
  }

  // ---- lighting ----

  function lightIsOn(light) {
    if (light.hasOnoff) return light.onoff === true;
    return typeof light.dim === 'number' && light.dim > 0;
  }

  // Brightness shown for a room: mean dim of the dimmable lights that are on.
  function roomLevel(room) {
    var on = room.lights.filter(function (l) { return l.hasDim && lightIsOn(l) && typeof l.dim === 'number'; });
    if (!on.length) return 0;
    return on.reduce(function (sum, l) { return sum + l.dim; }, 0) / on.length;
  }

  function lighting(block, ctx) {
    var el = ctx.el;
    var lang = language(ctx.dashboard);
    var T = TEXT[lang];
    var model = null; // { groups }
    var lightsById = {};
    var repaints = [];

    var card = el('button', 'card lighting-card');
    card.type = 'button';
    var icon = ctx.symbol('lightbulb', 'lighting-icon');
    var text = el('div', 'lighting-text');
    var title = el('div', 'lighting-title', block.title || T.lighting);
    var count = el('div', 'lighting-count', '…');
    text.appendChild(title); text.appendChild(count);
    card.appendChild(icon); card.appendChild(text);
    card.appendChild(ctx.symbol('chevron_right', 'lighting-chevron'));

    function allLights() { return Object.keys(lightsById).map(function (id) { return lightsById[id]; }); }

    function paintSummary() {
      var on = allLights().filter(lightIsOn).length;
      count.textContent = on ? T.lightsOn(on) : T.allOff;
      card.classList.toggle('any-on', on > 0);
    }

    function repaint() {
      paintSummary();
      repaints = repaints.filter(function (fn) { return fn() !== false; });
    }

    ctx.api('POST', '/lighting', {
      floorIds: block.floorIds || [], outdoorZoneIds: block.outdoorZoneIds || [], outdoorFloorId: block.outdoorFloorId || null
    }).then(function (data) {
      model = data;
      data.groups.forEach(function (g) { g.rooms.forEach(function (r) { r.lights.forEach(function (l) { lightsById[l.id] = l; }); }); });
      var subs = [];
      allLights().forEach(function (l) {
        if (l.hasOnoff) subs.push({ deviceId: l.id, capability: 'onoff' });
        if (l.hasDim) subs.push({ deviceId: l.id, capability: 'dim' });
      });
      ctx.subscribe(subs);
      paintSummary();
    }).catch(function (error) {
      count.textContent = 'Unavailable';
      card.title = 'Lighting unavailable: ' + error.message;
      card.classList.add('failed');
    });

    ctx.onDeviceUpdate(function (data) {
      var light = lightsById[data.deviceId];
      if (!light) return;
      if (data.capability === 'onoff') light.onoff = data.value;
      else if (data.capability === 'dim') light.dim = data.value;
      else return;
      repaint();
    });

    // Writes are optimistic; a failure is shown in the sheet and the values
    // get corrected by the next realtime update or reopening.
    function send(changes, statusEl) {
      changes.forEach(function (c) {
        var light = lightsById[c.id];
        if (!light) return;
        if (typeof c.dim === 'number') { light.dim = c.dim; if (c.dim > 0 && light.hasOnoff) light.onoff = true; }
        if (typeof c.onoff === 'boolean') light.onoff = c.onoff;
      });
      repaint();
      if (statusEl) { statusEl.textContent = ''; statusEl.hidden = true; }
      return ctx.api('POST', '/lights', { lights: changes }).then(function (result) {
        if (result && result.failed && result.failed.length && statusEl) {
          statusEl.textContent = T.failed(result.failed.length);
          statusEl.title = result.failed.map(function (f) { return (lightsById[f.id] ? lightsById[f.id].name : f.id) + ': ' + f.error; }).join('\n');
          statusEl.hidden = false;
        }
      }).catch(function (error) {
        if (statusEl) { statusEl.textContent = error.message; statusEl.hidden = false; }
      });
    }

    function switchFor(lights, statusEl) {
      var label = el('label', 'switch');
      var box = el('input');
      box.type = 'checkbox';
      label.appendChild(box);
      label.appendChild(el('span', 'switch-track'));
      box.addEventListener('change', function () {
        send(lights().map(function (l) {
          return l.hasOnoff ? { id: l.id, onoff: box.checked } : { id: l.id, dim: box.checked ? 1 : 0 };
        }), statusEl);
      });
      return { node: label, box: box };
    }

    function sliderFor(lights, statusEl, percent) {
      var slider = el('input', 'level');
      slider.type = 'range'; slider.min = 0; slider.max = 100; slider.step = 1;
      slider.dragging = false;
      var fill = function () { slider.style.setProperty('--fill', slider.value + '%'); };
      slider.addEventListener('pointerdown', function () { slider.dragging = true; });
      slider.addEventListener('input', function () { fill(); percent.textContent = slider.value + ' %'; });
      slider.addEventListener('change', function () {
        slider.dragging = false;
        var value = Number(slider.value) / 100;
        send(lights().filter(function (l) { return l.hasDim; }).map(function (l) {
          return value === 0 && l.hasOnoff ? { id: l.id, onoff: false } : { id: l.id, dim: value };
        }), statusEl);
      });
      slider.fill = fill;
      return slider;
    }

    function roomRow(room, statusEl, label) {
      var wrap = el('div', 'room');
      var row = el('div', 'room-row');
      var nameBtn = el('button', 'room-name');
      nameBtn.type = 'button';
      nameBtn.appendChild(ctx.symbol(zoneSymbol(room.icon, label ? 'deck' : 'light')));
      var names = el('span', 'room-labels');
      names.appendChild(el('span', 'room-title', label || room.name));
      var sub = el('span', 'room-sub');
      names.appendChild(sub);
      nameBtn.appendChild(names);
      row.appendChild(nameBtn);

      var lights = function () { return room.lights; };
      var dimmable = room.lights.some(function (l) { return l.hasDim; });
      var percent = el('span', 'room-percent');
      var slider = dimmable ? sliderFor(lights, statusEl, percent) : null;
      if (slider) row.appendChild(slider); else row.appendChild(el('span', 'level-none'));
      row.appendChild(percent);
      var sw = switchFor(lights, statusEl);
      row.appendChild(sw.node);
      wrap.appendChild(row);

      // Tap the room name to control its lights one by one.
      var detail = el('div', 'room-lights');
      detail.hidden = true;
      var lightRows = room.lights.map(function (light) {
        var r = el('div', 'light-row' + (light.available ? '' : ' unavailable'));
        r.appendChild(el('span', 'light-name', light.name + (light.available ? '' : ' · ' + T.unavailable)));
        var p = el('span', 'room-percent');
        var s = light.hasDim ? sliderFor(function () { return [light]; }, statusEl, p) : null;
        r.appendChild(s || el('span', 'level-none'));
        r.appendChild(p);
        var w = switchFor(function () { return [light]; }, statusEl);
        r.appendChild(w.node);
        detail.appendChild(r);
        return { light: light, slider: s, percent: p, box: w.box };
      });
      wrap.appendChild(detail);
      nameBtn.addEventListener('click', function () {
        detail.hidden = !detail.hidden;
        wrap.classList.toggle('open', !detail.hidden);
      });

      // Repaints stop once the sheet is closed (row no longer in the page).
      function paint(first) {
        if (!first && !wrap.isConnected) return false;
        var on = room.lights.filter(lightIsOn).length;
        sub.textContent = T.ofOn(on, room.lights.length);
        wrap.classList.toggle('lit', on > 0);
        sw.box.checked = on > 0;
        var level = Math.round(roomLevel(room) * 100);
        if (slider && !slider.dragging) { slider.value = level; slider.fill(); }
        percent.textContent = dimmable ? (on ? level + ' %' : '0 %') : '';
        lightRows.forEach(function (lr) {
          var isOn = lightIsOn(lr.light);
          lr.box.checked = isOn;
          var lvl = isOn && typeof lr.light.dim === 'number' ? Math.round(lr.light.dim * 100) : 0;
          if (lr.slider && !lr.slider.dragging) { lr.slider.value = lvl; lr.slider.fill(); }
          lr.percent.textContent = lr.light.hasDim ? lvl + ' %' : '';
        });
        return true;
      }
      paint(true);
      repaints.push(paint);
      return wrap;
    }

    function heroImageId() {
      var found = null;
      (ctx.dashboard.pages || []).forEach(function (p) {
        p.blocks.forEach(function (b) { if (!found && b.type === 'hero' && b.imageId) found = b.imageId; });
      });
      return found;
    }

    // The sheet is built once and kept (hidden) so its floor plans do not
    // load again on every open; its rows stay live through device updates.
    var kept = null;

    function openSheet() {
      if (!model) return;
      if (kept) { kept.open(); return; }
      var groups = model.groups.filter(function (g) { return g.kind === 'outdoor' || g.rooms.length || model.groups.length === 1; });
      var backdrop = el('div', 'sheet-backdrop sp-kept-sheet');
      var sheet = el('div', 'sheet');
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.appendChild(el('div', 'sheet-handle'));
      var head = el('div', 'sheet-head');
      head.appendChild(ctx.symbol('lightbulb', 'sheet-icon'));
      head.appendChild(el('h2', null, block.title || T.lighting));
      var closeBtn = el('button', 'sheet-close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', T.close);
      closeBtn.appendChild(ctx.symbol('close'));
      head.appendChild(closeBtn);
      sheet.appendChild(head);

      var tabs = el('div', 'sheet-tabs');
      var body = el('div', 'sheet-groups');
      var groupPanes = [];
      sheet.appendChild(tabs);
      sheet.appendChild(body);
      backdrop.appendChild(sheet);

      function close() {
        backdrop.classList.remove('open');
        setTimeout(function () { if (!backdrop.classList.contains('open')) backdrop.style.display = 'none'; }, 220);
        document.removeEventListener('keydown', onKey);
      }
      function open() {
        backdrop.style.display = '';
        sheet.style.transform = '';
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(function () { requestAnimationFrame(function () { backdrop.classList.add('open'); }); });
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      closeBtn.addEventListener('click', close);
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
      swipeToClose(sheet, close);
      kept = { open: open };

      if (!groups.length) body.appendChild(el('p', 'hint', T.noLights));

      function showGroup(index) {
        Array.prototype.forEach.call(tabs.children, function (t, i) {
          t.classList.toggle('active', i === index);
          // Phones scroll the tab row; keep the chosen tab in view.
          if (i === index && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' });
        });
        var group = groups[index];
        var groupName = group.kind === 'outdoor' ? (group.name || T.outdoor) : group.name;
        var planFloorId = group.kind === 'floor' ? group.id : group.floorId;
        groupPanes.forEach(function (pane, i) { if (pane) pane.hidden = i !== index; });
        if (groupPanes[index]) return;
        var pane = el('div', 'sheet-body');
        groupPanes[index] = pane;
        body.appendChild(pane);

        var plan = el('div', 'sheet-plan');
        if (planFloorId) {
          var frame = el('iframe', 'floorplan-frame');
          frame.setAttribute('scrolling', 'no');
          frame.setAttribute('title', groupName);
          plan.appendChild(frame);
          // Sized once the column width is known: the plan fits the narrower
          // of the column (at a typical 4:3 plan) and the screen height.
          requestAnimationFrame(function () {
            var h = Math.round(Math.min(window.innerHeight * 0.6, (plan.clientWidth || window.innerWidth) * 0.78));
            frame.style.height = h + 'px';
            frame.src = '/widget/?floor=' + encodeURIComponent(planFloorId) + '&slot=' + encodeURIComponent('light_' + planFloorId) + '&h=' + h;
          });
        } else if (heroImageId()) {
          var img = el('img', 'sheet-photo');
          img.alt = '';
          img.src = '/media/' + encodeURIComponent(heroImageId());
          plan.appendChild(img);
        } else {
          plan.hidden = true;
        }
        pane.appendChild(plan);

        var side = el('div', 'sheet-side');
        var roomsCard = el('div', 'card rooms-card');
        roomsCard.appendChild(el('h3', null, (group.kind === 'outdoor' ? T.outdoorLights : T.rooms + ' – ' + groupName)));
        var status = el('div', 'sheet-status error');
        status.hidden = true;
        if (!group.rooms.length) roomsCard.appendChild(el('p', 'hint', T.noLights));
        group.rooms.forEach(function (room) { roomsCard.appendChild(roomRow(room, status)); });
        // Outdoor lights also appear on the first floor's list, like a room.
        if (group.kind === 'floor' && index === 0) {
          var outdoor = model.groups.find(function (g) { return g.kind === 'outdoor'; });
          if (outdoor && outdoor.rooms.length) {
            var merged = { zoneId: 'outdoor', icon: 'garden', lights: [] };
            outdoor.rooms.forEach(function (r) { merged.lights = merged.lights.concat(r.lights); });
            roomsCard.appendChild(roomRow(merged, status, T.outdoorLights));
          }
        }
        roomsCard.appendChild(status);
        side.appendChild(roomsCard);

        var groupLights = function () {
          var out = [];
          group.rooms.forEach(function (r) { out = out.concat(r.lights); });
          return out;
        };
        var actions = el('div', 'sheet-actions');
        [[T.turnAllOn, 'lightbulb', true], [T.turnAllOff, 'power_settings_new', false]].forEach(function (a) {
          var b = el('button', 'action');
          b.type = 'button';
          b.appendChild(ctx.symbol(a[1]));
          b.appendChild(el('span', null, a[0]));
          b.addEventListener('click', function () {
            var lights = groupLights();
            if (!lights.length) return;
            send(lights.map(function (l) { return l.hasOnoff ? { id: l.id, onoff: a[2] } : { id: l.id, dim: a[2] ? 1 : 0 }; }), status);
          });
          actions.appendChild(b);
        });
        side.appendChild(actions);
        pane.appendChild(side);
      }

      groups.forEach(function (group, i) {
        var tab = el('button', 'sheet-tab');
        tab.type = 'button';
        var icon = group.kind === 'outdoor' ? (group.floorId ? 'garage' : 'park') : (i === 0 ? 'home' : 'stairs');
        tab.appendChild(ctx.symbol(icon));
        tab.appendChild(el('span', null, group.kind === 'outdoor' ? (group.name || T.outdoor) : group.name));
        tab.addEventListener('click', function () { showGroup(i); });
        tabs.appendChild(tab);
      });

      document.body.appendChild(backdrop);
      open();
      if (groups.length) showGroup(0);
    }

    card.addEventListener('click', openSheet);
    return card;
  }

  // Drag a bottom sheet down to close it: from the handle or header, or from
  // anywhere while the sheet is scrolled to the top. Sliders and the floor
  // plan (an iframe) keep their own gestures.
  function swipeToClose(sheet, close) {
    var startY = null, startX = 0, dy = 0, dragging = false, startTime = 0;
    function grabbable(target) {
      if (target.closest('input, select, textarea, .sheet-tabs')) return false;
      if (target.closest('.sheet-handle, .sheet-head')) return true;
      return sheet.scrollTop <= 0;
    }
    sheet.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || !grabbable(e.target)) { startY = null; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
      dy = 0; dragging = false; startTime = Date.now();
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (startY === null) return;
      var y = e.touches[0].clientY - startY;
      var x = e.touches[0].clientX - startX;
      if (!dragging) {
        if (Math.abs(y) < 8 && Math.abs(x) < 8) return;
        if (y <= 0 || Math.abs(x) > Math.abs(y)) { startY = null; return; }
        dragging = true;
        sheet.style.transition = 'none';
      }
      dy = Math.max(0, y);
      sheet.style.transform = 'translateY(' + dy + 'px)';
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function end() {
      if (startY === null) return;
      startY = null;
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      var fast = dy > 40 && dy / Math.max(1, Date.now() - startTime) > 0.5;
      if (dy > Math.min(140, sheet.offsetHeight / 4) || fast) {
        sheet.style.transform = 'translateY(100%)';
        close();
      } else {
        sheet.style.transform = '';
      }
    }
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
  }
  window.SpaceySheet = { swipeToClose: swipeToClose };

  window.SpaceyHomeBlocks = {
    hero: hero,
    weather: weatherCard,
    climate: climateCard,
    lighting: lighting
  };
})();
