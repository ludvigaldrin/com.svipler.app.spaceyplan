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
      noLights: 'No lights on this plan. Lights are devices of the class Light, or sockets set to a connected light in Homey, placed on the plan.',
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
      noLights: 'Inga lampor på planen. Lampor är enheter av klassen Lampa, eller uttag där Homey anger att en lampa är ansluten, placerade på planen.',
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

  // ---- floors: lights, security and climate per room, on the floor plans ----

  var FLOOR_TEXT = {
    sv: {
      home: 'Hemmet', security: 'Säkerhet', climate: 'Klimat', all: 'Allt', other: 'Övrigt',
      motionNow: 'Rörelse nu', motionAgo: function (m) { return m < 1 ? 'Rörelse nyss' : 'Rörelse för ' + m + ' min sedan'; },
      motionIn: function (rooms) { return rooms.length === 1 ? 'Rörelse i ' + rooms[0] : 'Rörelse i ' + rooms.length + ' rum'; },
      open: 'Öppen', closed: 'Stängd', openCount: function (names) { return names.length === 1 ? names[0] + ' öppen' : names.length + ' öppna'; },
      allClosed: 'Allt stängt', noMotion: 'Ingen rörelse', alarm: 'Larm', on: 'På', off: 'Av', noDevices: 'Inget att visa på den här planen.',
      noSecurity: 'Inga dörrar, fönster eller rörelsesensorer på planen.', noClimate: 'Inga temperatur- eller fuktgivare på planen.'
    },
    en: {
      home: 'Home', security: 'Security', climate: 'Climate', all: 'All', other: 'Other',
      motionNow: 'Motion now', motionAgo: function (m) { return m < 1 ? 'Motion just now' : 'Motion ' + m + ' min ago'; },
      motionIn: function (rooms) { return rooms.length === 1 ? 'Motion in ' + rooms[0] : 'Motion in ' + rooms.length + ' rooms'; },
      open: 'Open', closed: 'Closed', openCount: function (names) { return names.length === 1 ? names[0] + ' open' : names.length + ' open'; },
      allClosed: 'All closed', noMotion: 'No motion', alarm: 'Alarm', on: 'On', off: 'Off', noDevices: 'Nothing to show on this plan.',
      noSecurity: 'No doors, windows or motion sensors on the plan.', noClimate: 'No temperature or humidity sensors on the plan.'
    }
  };
  var RECENT_MOTION_MS = 30 * 60000;
  var ALARMS = ['alarm_water', 'alarm_smoke', 'alarm_co', 'alarm_tamper'];

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

  function has(device, cap) { return Object.prototype.hasOwnProperty.call(device.values, cap); }
  // Speakers, doorbells and the like have nothing to show in the floors view.
  function hasStatus(device) { return Object.keys(device.values).length > 0; }
  function isSecurity(d) { return has(d, 'alarm_motion') || has(d, 'alarm_contact') || ALARMS.some(function (c) { return has(d, c); }); }
  function isClimate(d) { return has(d, 'measure_temperature') || has(d, 'measure_humidity'); }

  // What a room says about itself (used by rows and the summary card).
  function roomState(room) {
    var now = Date.now();
    var motionNow = false, motionAt = 0, open = [], alarms = [], temps = [], hums = [];
    room.devices.forEach(function (d) {
      if (has(d, 'alarm_motion')) {
        if (d.values.alarm_motion === true) motionNow = true;
        if (d.motionAt && d.motionAt > motionAt) motionAt = d.motionAt;
      }
      if (d.values.alarm_contact === true) open.push(d.name);
      ALARMS.forEach(function (c) { if (d.values[c] === true) alarms.push(d.name); });
      if (typeof d.values.measure_temperature === 'number') temps.push(d.values.measure_temperature);
      if (typeof d.values.measure_humidity === 'number') hums.push(d.values.measure_humidity);
    });
    var avg = function (list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null; };
    return {
      lightsOn: room.lights.filter(lightIsOn).length,
      motionNow: motionNow,
      motionAgoMin: !motionNow && motionAt && now - motionAt < RECENT_MOTION_MS ? Math.floor((now - motionAt) / 60000) : null,
      open: open, alarms: alarms,
      temperature: avg(temps), humidity: avg(hums),
      hasSecurity: room.devices.some(isSecurity),
      hasClimate: room.devices.some(isClimate)
    };
  }

  function lighting(block, ctx) {
    var el = ctx.el;
    var lang = language(ctx.dashboard);
    var T = TEXT[lang];
    var F = FLOOR_TEXT[lang];
    var startFilter = ['all', 'light', 'security', 'climate'].indexOf(block.startFilter) >= 0 ? block.startFilter : 'light';
    var filter = startFilter;
    var FILTER_LABEL = { all: F.all, light: T.lighting, security: F.security, climate: F.climate };
    var FILTER_ICON = { all: 'home', light: 'lightbulb', security: 'shield', climate: 'thermostat' };
    var model = null; // { groups }
    var lightsById = {};
    var devicesById = {};
    var repaints = [];

    var card = el('button', 'card lighting-card');
    card.type = 'button';
    var icon = ctx.symbol(FILTER_ICON[startFilter], 'lighting-icon');
    var text = el('div', 'lighting-text');
    var defaultTitle = startFilter === 'all' ? F.home : FILTER_LABEL[startFilter];
    var title = el('div', 'lighting-title', block.title || defaultTitle);
    var count = el('div', 'lighting-count', '…');
    text.appendChild(title); text.appendChild(count);
    card.appendChild(icon); card.appendChild(text);
    card.appendChild(ctx.symbol('chevron_right', 'lighting-chevron'));

    function allLights() { return Object.keys(lightsById).map(function (id) { return lightsById[id]; }); }
    function allRooms() {
      var out = [];
      if (model) model.groups.forEach(function (g) { out = out.concat(g.rooms); });
      return out;
    }

    function paintSummary() {
      var lightsOn = allLights().filter(lightIsOn).length;
      var motionRooms = [], open = [], alarms = [], temps = [];
      allRooms().forEach(function (room) {
        var st = roomState(room);
        if (st.motionNow) motionRooms.push(room.name);
        open = open.concat(st.open);
        alarms = alarms.concat(st.alarms);
        if (st.temperature !== null) temps.push(st.temperature);
      });
      var parts = [];
      var lightText = lightsOn ? T.lightsOn(lightsOn) : T.allOff;
      if (startFilter === 'light') parts.push(lightText);
      if (startFilter === 'all' && allLights().length) parts.push(lightText);
      if (startFilter === 'all' || startFilter === 'security') {
        if (alarms.length) parts.push(F.alarm + ': ' + alarms.join(', '));
        if (motionRooms.length) parts.push(F.motionIn(motionRooms));
        if (open.length) parts.push(F.openCount(open));
        if (startFilter === 'security' && !alarms.length && !open.length && !motionRooms.length) parts.push(F.allClosed);
      }
      if (startFilter === 'climate' && temps.length) {
        parts.push(formatTemp(round1(temps.reduce(function (a, b) { return a + b; }, 0) / temps.length), lang));
      }
      count.textContent = parts.join(' · ');
      card.classList.toggle('any-on', (startFilter === 'light' || startFilter === 'all') && lightsOn > 0);
      card.classList.toggle('alert', (startFilter === 'all' || startFilter === 'security') && (open.length > 0 || alarms.length > 0));
    }

    function repaint() {
      paintSummary();
      repaints = repaints.filter(function (fn) { return fn() !== false; });
    }
    ctx.every(30000, repaint); // "motion 3 min ago" moves on

    ctx.api('POST', '/lighting', {
      floorIds: block.floorIds || []
    }).then(function (data) {
      model = data;
      var subs = [];
      data.groups.forEach(function (g) {
        g.rooms.forEach(function (r) {
          r.lights.forEach(function (l) {
            lightsById[l.id] = l;
            if (l.hasOnoff) subs.push({ deviceId: l.id, capability: 'onoff' });
            if (l.hasDim) subs.push({ deviceId: l.id, capability: 'dim' });
          });
          r.devices.forEach(function (d) {
            devicesById[d.id] = d;
            Object.keys(d.values).forEach(function (cap) { subs.push({ deviceId: d.id, capability: cap }); });
          });
        });
      });
      ctx.subscribe(subs);
      paintSummary();
    }).catch(function (error) {
      count.textContent = T.unavailable;
      card.title = 'Floors unavailable: ' + error.message;
      card.classList.add('failed');
    });

    ctx.onDeviceUpdate(function (data) {
      var light = lightsById[data.deviceId];
      if (light) {
        if (data.capability === 'onoff') light.onoff = data.value;
        else if (data.capability === 'dim') light.dim = data.value;
        else return;
        repaint();
        return;
      }
      var device = devicesById[data.deviceId];
      if (!device || !has(device, data.capability)) return;
      if (data.capability === 'alarm_motion' && device.values.alarm_motion !== data.value) device.motionAt = Date.now();
      device.values[data.capability] = data.value;
      repaint();
    });

    // Writes are optimistic; a failure is shown in the sheet and the values
    // get corrected by the next realtime update.
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

    function setDevice(device, capability, value, statusEl) {
      var previous = device.values[capability];
      device.values[capability] = value;
      repaint();
      ctx.api('POST', '/deviceCapability', { deviceId: device.id, capability: capability, value: value }).catch(function (error) {
        device.values[capability] = previous;
        repaint();
        if (statusEl) { statusEl.textContent = device.name + ': ' + error.message; statusEl.hidden = false; }
      });
    }

    function switchFor(onChange) {
      var label = el('label', 'switch');
      var box = el('input');
      box.type = 'checkbox';
      label.appendChild(box);
      label.appendChild(el('span', 'switch-track'));
      box.addEventListener('change', function () { onChange(box.checked); });
      return { node: label, box: box };
    }
    function lightSwitch(lights, statusEl) {
      return switchFor(function (checked) {
        send(lights().map(function (l) {
          return l.hasOnoff ? { id: l.id, onoff: checked } : { id: l.id, dim: checked ? 1 : 0 };
        }), statusEl);
      });
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

    function badge(symbolName, textValue, className) {
      var b = el('span', 'room-badge' + (className ? ' ' + className : ''));
      b.appendChild(ctx.symbol(symbolName));
      if (textValue) b.appendChild(el('span', null, textValue));
      return b;
    }

    function climateText(st) {
      var parts = [];
      if (st.temperature !== null) parts.push(formatTemp(round1(st.temperature), lang));
      if (st.humidity !== null) parts.push(Math.round(st.humidity) + ' %');
      return parts.join(' · ');
    }

    function showsRoom(room) {
      var st = roomState(room);
      if (filter === 'light') return room.lights.length > 0;
      if (filter === 'security') return st.hasSecurity;
      if (filter === 'climate') return st.hasClimate;
      return room.lights.length > 0 || room.devices.some(hasStatus);
    }

    // One room: name and a short state line, lights' slider and switch (for
    // the lighting and all views), status badges, and the devices one by one.
    function roomRow(room, statusEl) {
      var wrap = el('div', 'room');
      var row = el('div', 'room-row');
      var nameBtn = el('button', 'room-name');
      nameBtn.type = 'button';
      nameBtn.appendChild(ctx.symbol(zoneSymbol(room.icon, 'light')));
      var names = el('span', 'room-labels');
      names.appendChild(el('span', 'room-title', room.name));
      var sub = el('span', 'room-sub');
      names.appendChild(sub);
      var mini = el('span', 'room-mini');
      names.appendChild(mini);
      nameBtn.appendChild(names);
      row.appendChild(nameBtn);

      var showLights = (filter === 'light' || filter === 'all') && room.lights.length > 0;
      var lights = function () { return room.lights; };
      var dimmable = room.lights.some(function (l) { return l.hasDim; });
      var percent = el('span', 'room-percent');
      var slider = null, sw = null;
      var badges = el('span', 'room-badges');
      if (showLights) {
        slider = dimmable ? sliderFor(lights, statusEl, percent) : null;
        row.appendChild(slider || el('span', 'level-none'));
        row.appendChild(percent);
        sw = lightSwitch(lights, statusEl);
        row.appendChild(sw.node);
      } else {
        row.classList.add('room-row-status');
        row.appendChild(badges);
      }
      wrap.appendChild(row);

      // Devices one by one, behind a tap on the room name.
      var detail = el('div', 'room-lights');
      detail.hidden = true;
      var lightRows = (filter === 'light' || filter === 'all') ? room.lights.map(function (light) {
        var r = el('div', 'light-row' + (light.available ? '' : ' unavailable'));
        r.appendChild(el('span', 'light-name', light.name + (light.available ? '' : ' · ' + T.unavailable)));
        var p = el('span', 'room-percent');
        var s = light.hasDim ? sliderFor(function () { return [light]; }, statusEl, p) : null;
        r.appendChild(s || el('span', 'level-none'));
        r.appendChild(p);
        var w = lightSwitch(function () { return [light]; }, statusEl);
        r.appendChild(w.node);
        detail.appendChild(r);
        return { light: light, slider: s, percent: p, box: w.box };
      }) : [];
      var shown = room.devices.filter(function (d) {
        if (filter === 'security') return isSecurity(d);
        if (filter === 'climate') return isClimate(d);
        if (filter === 'light') return false;
        return hasStatus(d);
      });
      var deviceRows = shown.map(function (d) {
        var r = el('div', 'light-row device-row' + (d.available ? '' : ' unavailable'));
        r.appendChild(el('span', 'light-name', d.name + (d.available ? '' : ' · ' + T.unavailable)));
        var value = el('span', 'device-value');
        r.appendChild(value);
        var w = null;
        if (has(d, 'onoff') && filter === 'all') {
          w = switchFor(function (checked) { setDevice(d, 'onoff', checked, statusEl); });
          r.appendChild(w.node);
        } else {
          r.appendChild(el('span'));
        }
        detail.appendChild(r);
        return { device: d, value: value, box: w && w.box };
      });
      wrap.appendChild(detail);
      if (lightRows.length || deviceRows.length) {
        nameBtn.addEventListener('click', function () {
          detail.hidden = !detail.hidden;
          wrap.classList.toggle('open', !detail.hidden);
        });
      } else {
        nameBtn.classList.add('static');
      }

      function deviceText(d) {
        var v = d.values, parts = [];
        if (has(d, 'alarm_contact')) parts.push(v.alarm_contact ? F.open : F.closed);
        if (has(d, 'alarm_motion')) {
          if (v.alarm_motion) parts.push(F.motionNow);
          else if (d.motionAt && Date.now() - d.motionAt < RECENT_MOTION_MS) parts.push(F.motionAgo(Math.floor((Date.now() - d.motionAt) / 60000)));
        }
        ALARMS.forEach(function (c) { if (v[c] === true) parts.push(F.alarm); });
        if (typeof v.measure_temperature === 'number') parts.push(formatTemp(round1(v.measure_temperature), lang));
        if (typeof v.measure_humidity === 'number') parts.push(Math.round(v.measure_humidity) + ' %');
        if (typeof v.windowcoverings_set === 'number') parts.push(Math.round(v.windowcoverings_set * 100) + ' %');
        if (has(d, 'onoff') && filter !== 'all') parts.push(v.onoff ? F.on : F.off);
        return parts.join(' · ');
      }

      function paint(first) {
        if (!first && !wrap.isConnected) return false;
        var st = roomState(room);
        var subParts = [];
        if (showLights) subParts.push(T.ofOn(st.lightsOn, room.lights.length));
        // With the lights' controls on the row, the rest is small icons.
        mini.replaceChildren();
        if (showLights && filter === 'all') {
          if (st.alarms.length) mini.appendChild(badge('warning', null, 'alert'));
          if (st.motionNow) mini.appendChild(badge('directions_walk', null, 'motion'));
          else if (st.motionAgoMin !== null) mini.appendChild(badge('directions_walk', st.motionAgoMin + ' min'));
          if (st.open.length) mini.appendChild(badge('door_open', st.open.length > 1 ? String(st.open.length) : null, 'alert'));
          var mct = climateText(st);
          if (mct) mini.appendChild(badge('thermostat', mct));
        } else if (filter === 'security' || filter === 'all') {
          if (st.alarms.length) subParts.push(F.alarm);
          if (st.motionNow) subParts.push(F.motionNow);
          else if (st.motionAgoMin !== null) subParts.push(F.motionAgo(st.motionAgoMin));
          if (st.open.length) subParts.push(F.openCount(st.open));
        }
        if (filter === 'climate' && !showLights) subParts.push(climateText(st));
        if (filter === 'security' && !subParts.length && st.hasSecurity) {
          var hasContacts = room.devices.some(function (d) { return has(d, 'alarm_contact'); });
          subParts.push(hasContacts ? F.allClosed : F.noMotion);
        }
        sub.textContent = subParts.filter(Boolean).join(' · ');
        wrap.classList.toggle('lit', st.lightsOn > 0 && showLights);
        wrap.classList.toggle('alert', st.open.length > 0 || st.alarms.length > 0);
        wrap.classList.toggle('motion', st.motionNow);

        if (showLights) {
          sw.box.checked = st.lightsOn > 0;
          var level = Math.round(roomLevel(room) * 100);
          if (slider && !slider.dragging) { slider.value = level; slider.fill(); }
          percent.textContent = dimmable ? (st.lightsOn ? level + ' %' : '0 %') : '';
        } else {
          badges.replaceChildren();
          if (filter !== 'climate') {
            if (st.alarms.length) badges.appendChild(badge('warning', null, 'alert'));
            if (st.motionNow) badges.appendChild(badge('directions_walk', null, 'motion'));
            if (st.open.length) badges.appendChild(badge('door_open', String(st.open.length), 'alert'));
          }
          if (filter !== 'security') {
            var ct = climateText(st);
            if (ct) badges.appendChild(badge('thermostat', ct));
          }
        }
        lightRows.forEach(function (lr) {
          var isOn = lightIsOn(lr.light);
          lr.box.checked = isOn;
          var lvl = isOn && typeof lr.light.dim === 'number' ? Math.round(lr.light.dim * 100) : 0;
          if (lr.slider && !lr.slider.dragging) { lr.slider.value = lvl; lr.slider.fill(); }
          lr.percent.textContent = lr.light.hasDim ? lvl + ' %' : '';
        });
        deviceRows.forEach(function (dr) {
          dr.value.textContent = deviceText(dr.device);
          if (dr.box) dr.box.checked = dr.device.values.onoff === true;
        });
        return true;
      }
      paint(true);
      repaints.push(paint);
      return wrap;
    }

    // The sheet is built once and kept (hidden) so its floor plans do not
    // load again on every open; its rows stay live through device updates.
    var kept = null;

    function openSheet() {
      if (!model) return;
      if (kept) { kept.open(); return; }
      var groups = model.groups;
      var backdrop = el('div', 'sheet-backdrop sp-kept-sheet');
      var sheet = el('div', 'sheet');
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.appendChild(el('div', 'sheet-handle'));
      var head = el('div', 'sheet-head');
      var headIcon = ctx.symbol(FILTER_ICON[startFilter], 'sheet-icon');
      head.appendChild(headIcon);
      head.appendChild(el('h2', null, block.title || defaultTitle));
      var closeBtn = el('button', 'sheet-close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', T.close);
      closeBtn.appendChild(ctx.symbol('close'));
      head.appendChild(closeBtn);
      sheet.appendChild(head);

      // Filters, only for what the plans hold.
      var rooms = allRooms();
      var available = { all: true, light: allLights().length > 0,
        security: rooms.some(function (r) { return r.devices.some(isSecurity); }),
        climate: rooms.some(function (r) { return r.devices.some(isClimate); }) };
      var filters = el('div', 'sheet-filters');
      var filterButtons = {};
      ['all', 'light', 'security', 'climate'].forEach(function (key) {
        if (!available[key]) return;
        var b = el('button', 'filter-chip');
        b.type = 'button';
        b.appendChild(ctx.symbol(FILTER_ICON[key]));
        b.appendChild(el('span', null, FILTER_LABEL[key]));
        b.addEventListener('click', function () { setFilter(key); });
        filters.appendChild(b);
        filterButtons[key] = b;
      });
      if (!available[filter]) filter = 'all';

      var tabs = el('div', 'sheet-tabs');
      var body = el('div', 'sheet-groups');
      var groupPanes = [];
      sheet.appendChild(tabs);
      sheet.appendChild(filters);
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

      // The right-hand column of one floor, for the current filter.
      function renderSide(group, side) {
        side.replaceChildren();
        var roomsCard = el('div', 'card rooms-card');
        roomsCard.appendChild(el('h3', null, FILTER_LABEL[filter] + ' – ' + group.name));
        var status = el('div', 'sheet-status error');
        status.hidden = true;
        var visible = group.rooms.filter(showsRoom);
        if (!visible.length) {
          var empty = filter === 'light' ? T.noLights : (filter === 'security' ? F.noSecurity : (filter === 'climate' ? F.noClimate : F.noDevices));
          roomsCard.appendChild(el('p', 'hint', empty));
        }
        visible.forEach(function (room) { roomsCard.appendChild(roomRow(room, status)); });
        roomsCard.appendChild(status);
        side.appendChild(roomsCard);

        if (filter === 'light' || filter === 'all') {
          var groupLights = [];
          group.rooms.forEach(function (r) { groupLights = groupLights.concat(r.lights); });
          if (groupLights.length) {
            var actions = el('div', 'sheet-actions');
            [[T.turnAllOn, 'lightbulb', true], [T.turnAllOff, 'power_settings_new', false]].forEach(function (a) {
              var b = el('button', 'action');
              b.type = 'button';
              b.appendChild(ctx.symbol(a[1]));
              b.appendChild(el('span', null, a[0]));
              b.addEventListener('click', function () {
                send(groupLights.map(function (l) { return l.hasOnoff ? { id: l.id, onoff: a[2] } : { id: l.id, dim: a[2] ? 1 : 0 }; }), status);
              });
              actions.appendChild(b);
            });
            side.appendChild(actions);
          }
        }
      }

      var sides = [];
      function setFilter(key) {
        filter = key;
        Object.keys(filterButtons).forEach(function (k) { filterButtons[k].classList.toggle('active', k === key); });
        headIcon.textContent = FILTER_ICON[key];
        sides.forEach(function (entry) { if (entry) renderSide(entry.group, entry.side); });
        repaints = repaints.filter(function (fn) { return fn() !== false; });
      }

      function showGroup(index) {
        Array.prototype.forEach.call(tabs.children, function (t, i) {
          t.classList.toggle('active', i === index);
          // Phones scroll the tab row; keep the chosen tab in view.
          if (i === index && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' });
        });
        var group = groups[index];
        groupPanes.forEach(function (pane, i) { if (pane) pane.hidden = i !== index; });
        if (groupPanes[index]) return;
        var pane = el('div', 'sheet-body');
        groupPanes[index] = pane;
        body.appendChild(pane);

        var plan = el('div', 'sheet-plan');
        var frame = el('iframe', 'floorplan-frame');
        frame.setAttribute('scrolling', 'no');
        frame.setAttribute('title', group.name);
        plan.appendChild(frame);
        // Sized once the column width is known: the plan fits the narrower
        // of the column (at a typical 4:3 plan) and the screen height.
        requestAnimationFrame(function () {
          var h = Math.round(Math.min(window.innerHeight * 0.6, (plan.clientWidth || window.innerWidth) * 0.78));
          frame.style.height = h + 'px';
          frame.src = '/widget/?floor=' + encodeURIComponent(group.id) + '&slot=' + encodeURIComponent('light_' + group.id) + '&h=' + h;
        });
        pane.appendChild(plan);

        var side = el('div', 'sheet-side');
        pane.appendChild(side);
        sides[index] = { group: group, side: side };
        renderSide(group, side);
      }

      groups.forEach(function (group, i) {
        var tab = el('button', 'sheet-tab');
        tab.type = 'button';
        var tabIcon = /garage/i.test(group.name) ? 'garage' : (/ute|outdoor|trädgård|garden/i.test(group.name) ? 'park' : (i === 0 ? 'home' : 'stairs'));
        tab.appendChild(ctx.symbol(tabIcon));
        tab.appendChild(el('span', null, group.name));
        tab.addEventListener('click', function () { showGroup(i); });
        tabs.appendChild(tab);
      });

      document.body.appendChild(backdrop);
      open();
      Object.keys(filterButtons).forEach(function (k) { filterButtons[k].classList.toggle('active', k === filter); });
      if (groups.length) showGroup(0);
    }

    card.addEventListener('click', openSheet);
    return card;
  }

  // ---- quick actions: a row of equal buttons that toggle chosen devices ----
  // Tap toggles; a long press opens the device popup.

  function quick(block, ctx) {
    var el = ctx.el;
    var sv = language(ctx.dashboard) === 'sv';
    var wrap = el('section', 'quick-block');
    if (block.title) wrap.appendChild(el('h3', 'block-title', block.title));
    var row = el('div', 'quick-row');
    wrap.appendChild(row);
    var status = el('p', 'hint error quick-status');
    status.hidden = true;
    wrap.appendChild(status);
    var items = (block.items || []).filter(function (i) { return i.homeyId; });
    if (!items.length) {
      row.appendChild(el('p', 'hint', sv ? 'Välj enheter i editorn.' : 'Pick devices in the editor.'));
      return wrap;
    }

    var buttons = {};
    function paint(id) {
      var b = buttons[id];
      if (!b || !b.detail) return;
      var v = b.detail.values;
      var on = typeof v.onoff === 'boolean' ? v.onoff : (typeof v.dim === 'number' && v.dim > 0);
      b.node.classList.toggle('on', on);
      b.node.classList.toggle('unavailable', !b.detail.available);
      var text = on ? (sv ? 'På' : 'On') : (sv ? 'Av' : 'Off');
      if (on && typeof v.dim === 'number') text += ' · ' + Math.round(v.dim * 100) + ' %';
      b.state.textContent = text;
    }

    items.forEach(function (item) {
      var node = el('button', 'quick-btn');
      node.type = 'button';
      var icon = ctx.symbol('lightbulb', 'quick-icon');
      var texts = el('div', 'quick-text');
      var name = el('div', 'quick-name', item.label || '…');
      var state = el('div', 'quick-state', '');
      texts.appendChild(name); texts.appendChild(state);
      node.appendChild(icon); node.appendChild(texts);
      row.appendChild(node);
      var b = { node: node, icon: icon, name: name, state: state, detail: null, item: item };
      buttons[item.homeyId] = b;

      var pressTimer = null, longPressed = false;
      function down() {
        longPressed = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(function () {
          longPressed = true;
          if (window.SpaceyDevicePopup) window.SpaceyDevicePopup.open(item.homeyId);
        }, 550);
      }
      function up() { clearTimeout(pressTimer); }
      node.addEventListener('pointerdown', down);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointerleave', up);
      node.addEventListener('pointercancel', up);
      node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      node.addEventListener('click', function () {
        if (longPressed || !b.detail) return;
        var v = b.detail.values;
        var capability, value;
        if (typeof v.onoff === 'boolean') { capability = 'onoff'; value = !v.onoff; }
        else if (typeof v.dim === 'number') { capability = 'dim'; value = v.dim > 0 ? 0 : 1; }
        else return;
        var previous = v[capability];
        v[capability] = value;
        paint(item.homeyId);
        status.hidden = true;
        ctx.api('POST', '/deviceCapability', { deviceId: item.homeyId, capability: capability, value: value }).catch(function (error) {
          v[capability] = previous;
          paint(item.homeyId);
          status.textContent = (b.detail.name || '') + ': ' + error.message;
          status.hidden = false;
        });
      });

      ctx.api('GET', '/deviceDetail/' + encodeURIComponent(item.homeyId)).then(function (detail) {
        b.detail = detail;
        name.textContent = item.label || detail.name;
        icon.textContent = detail.deviceClass === 'light' ? 'lightbulb' : 'power_settings_new';
        paint(item.homeyId);
        ctx.subscribe(['onoff', 'dim'].filter(function (cap) { return cap in detail.values; })
          .map(function (cap) { return { deviceId: item.homeyId, capability: cap }; }));
      }).catch(function (error) {
        node.classList.add('failed');
        name.textContent = item.label || (sv ? 'Saknas' : 'Missing');
        state.textContent = error.message;
      });
    });

    ctx.onDeviceUpdate(function (data) {
      var b = buttons[data.deviceId];
      if (!b || !b.detail || (data.capability !== 'onoff' && data.capability !== 'dim')) return;
      b.detail.values[data.capability] = data.value;
      paint(data.deviceId);
    });
    return wrap;
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
    lighting: lighting,
    quick: quick
  };
})();
