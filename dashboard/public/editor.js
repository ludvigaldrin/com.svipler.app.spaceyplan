// Dashboard builder. Three columns: dashboards and pages | the page's blocks |
// settings of the selected block. Edits the whole `dashboards` list in memory
// and saves it in one POST (the server validates).
(function () {
  'use strict';

  var els = {
    left: document.getElementById('left'),
    center: document.getElementById('center'),
    right: document.getElementById('right'),
    save: document.getElementById('save'),
    status: document.getElementById('status'),
    preview: document.getElementById('preview'),
    modal: document.getElementById('previewModal'),
    frame: document.getElementById('previewFrame')
  };

  var data = { dashboards: [], floors: [], zones: [], devices: [] };
  var sel = { dashboardId: null, pageId: null, blockId: null, picking: false };
  var dirty = false;

  // type -> [label, icon, description]
  var TYPES = {
    floorplan: ['Floor plan', 'floor', 'Your floor plan with devices placed on the image.'],
    buttons: ['Buttons', 'touch_app', 'Buttons that fire a Flow. Pick them in a Flow with the dashboard button card.'],
    room: ['Room', 'meeting_room', 'Filled automatically with the devices of a Homey zone.'],
    devices: ['Devices', 'devices', 'Hand-picked devices in the order you want.'],
    heading: ['Heading', 'title', 'Plain text that splits a long page into sections.'],
    spacer: ['Spacer', 'height', 'Empty space between blocks.'],
    link: ['Page link', 'arrow_forward', 'A button that goes to another page of this dashboard.'],
    hero: ['Header image', 'landscape', 'A photo of your home across the top, with clock, date and the weather.'],
    weather: ['Weather', 'partly_cloudy_day', 'Outdoor weather for Homey\'s location: temperature, wind, rain, sunrise and sunset.'],
    climate: ['Indoor climate', 'thermostat', 'Temperature of one main room in large type, with other rooms listed beside it.'],
    lighting: ['Floors', 'home', 'A summary card that opens the floor plans with everything placed on them per room: lights, doors, motion and climate, with filters.'],
    quick: ['Quick actions', 'bolt', 'A row of equal buttons that turn chosen lights or devices on and off. Long press opens the device.'],
    music: ['Music', 'music_note', 'Now playing with album art, play controls, volume per room and for all linked rooms.']
  };

  function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 9); }

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.className = 'status' + (isError ? ' error' : '');
  }

  function markDirty() {
    dirty = true;
    els.save.disabled = false;
    setStatus('Unsaved changes');
  }

  async function api(method, path, body) {
    var options = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    var response = await fetch('/api' + path, options);
    if (response.status === 401) {
      location.href = '/login';
      throw new Error('PIN required');
    }
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || ('HTTP ' + response.status));
    return payload;
  }

  // ---- tiny DOM helpers ----

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function icon(name) { return h('span', { class: 'material-symbols-outlined', text: name }); }

  function field(label, input) { return h('label', { class: 'field' }, [label, input]); }

  // Input that writes to obj[key]; `after` runs on each edit (e.g. refresh the centre column).
  function bound(obj, key, attrs, after) {
    var input = h('input', Object.assign({ value: obj[key] === undefined ? '' : obj[key] }, attrs || {}));
    input.addEventListener('input', function () {
      obj[key] = (input.type === 'number' || input.type === 'range') ? (input.value === '' ? undefined : Number(input.value)) : input.value;
      markDirty();
      if (after) after();
    });
    return input;
  }

  function select(options, current, onChange) {
    var node = h('select', null, options.map(function (o) {
      return h('option', { value: o[0], selected: o[0] === current }, o[1]);
    }));
    node.addEventListener('change', function () { onChange(node.value); });
    return node;
  }

  function currentDashboard() {
    return data.dashboards.find(function (d) { return d.id === sel.dashboardId; }) || null;
  }

  function currentPage() {
    var dashboard = currentDashboard();
    return (dashboard && dashboard.pages.find(function (p) { return p.id === sel.pageId; })) || null;
  }

  function currentBlock() {
    var page = currentPage();
    return (page && page.blocks.find(function (b) { return b.id === sel.blockId; })) || null;
  }

  function ensureSelection() {
    var dashboard = currentDashboard();
    if (!dashboard) { sel.pageId = null; sel.blockId = null; return; }
    if (!dashboard.pages.some(function (p) { return p.id === sel.pageId; })) {
      sel.pageId = dashboard.pages.length ? dashboard.pages[0].id : null;
      sel.blockId = null;
    }
    if (!currentBlock()) sel.blockId = null;
  }

  function move(list, index, delta) {
    var target = index + delta;
    if (target < 0 || target >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(target, 0, item);
    markDirty();
    render();
  }

  function zoneName(id) {
    if (!id || id === '*') return 'The room chosen on the device';
    var zone = data.zones.find(function (z) { return z.id === id; });
    return zone ? zone.name : 'Missing room';
  }

  function floorName(id) {
    var floor = data.floors.find(function (f) { return f.id === id; });
    return floor ? floor.name : '';
  }

  function pageName(id) {
    var dashboard = currentDashboard();
    var page = dashboard && dashboard.pages.find(function (p) { return p.id === id; });
    return page ? page.name : '';
  }

  // ---- left: dashboards and pages ----

  function renderLeft() {
    var dashboard = currentDashboard();
    var out = [h('div', { class: 'side-label', text: 'Dashboards' })];

    data.dashboards.forEach(function (d) {
      out.push(h('button', { class: 'side-item' + (d.id === sel.dashboardId ? ' active' : ''), onclick: function () {
        sel.dashboardId = d.id; sel.pageId = null; sel.blockId = null; sel.picking = false;
        ensureSelection(); render();
      } }, [icon('dashboard'), d.name]));
    });
    out.push(h('button', { class: 'side-item add', text: '+ New dashboard', onclick: function () {
      var created = { id: uid('d_'), name: 'New dashboard', pages: [{ id: uid('p_'), name: 'Page 1', blocks: [] }] };
      data.dashboards.push(created);
      sel.dashboardId = created.id; sel.pageId = created.pages[0].id; sel.blockId = null;
      markDirty(); render();
    } }));

    if (dashboard) {
      out.push(h('details', { class: 'look' }, [
        h('summary', { text: 'Dashboard settings' }),
        h('div', { class: 'stack' }, [
          field('Name', bound(dashboard, 'name', null, renderLeftLabelsOnly)),
          field('Theme', select([['', 'Follow device'], ['light', 'Light'], ['dark', 'Dark']],
            dashboard.theme || '', function (v) { dashboard.theme = v || undefined; markDirty(); })),
          field('Style', select([['standard', 'Standard'], ['evening', 'Evening (dark with gold)']],
            dashboard.style || 'standard', function (v) { dashboard.style = v === 'standard' ? undefined : v; markDirty(); })),
          field('Language', select([['auto', 'Follow device'], ['en', 'English'], ['sv', 'Svenska']],
            dashboard.language || 'auto', function (v) { dashboard.language = v === 'auto' ? undefined : v; markDirty(); })),
          field('Accent', (function () {
            var input = h('input', { type: 'color', value: dashboard.accent || '#3b82f6' });
            input.addEventListener('input', function () { dashboard.accent = input.value; markDirty(); });
            return input;
          })()),
          field('Screensaver (min, 0 = off)', bound(dashboard, 'screensaverMinutes', { type: 'number', min: 0 })),
          h('label', { class: 'check' }, [(function () {
            var box = h('input', { type: 'checkbox', checked: !!dashboard.showClock });
            box.addEventListener('change', function () { dashboard.showClock = box.checked; markDirty(); renderLeft(); });
            return box;
          })(), 'Show clock and date']),
          dashboard.showClock ? field('Outdoor temperature (optional)', select(
            [['', 'None']].concat(data.devices.filter(function (d) { return d.capabilities.indexOf('measure_temperature') >= 0; })
              .map(function (d) { return [d.id, d.name]; })),
            dashboard.weatherDeviceId || '', function (v) { dashboard.weatherDeviceId = v || undefined; markDirty(); })) : null,
          h('button', { class: 'btn small danger', text: 'Delete dashboard', onclick: function () {
            if (!window.confirm('Delete dashboard "' + dashboard.name + '"?')) return;
            data.dashboards = data.dashboards.filter(function (d) { return d.id !== dashboard.id; });
            sel.dashboardId = data.dashboards.length ? data.dashboards[0].id : null;
            sel.pageId = null; sel.blockId = null;
            ensureSelection(); markDirty(); render();
          } })
        ])
      ]));

      out.push(h('div', { class: 'side-label', text: 'Pages in ' + dashboard.name }));
      dashboard.pages.forEach(function (page) {
        out.push(h('button', { class: 'side-item' + (page.id === sel.pageId ? ' active' : ''), onclick: function () {
          sel.pageId = page.id; sel.blockId = null; sel.picking = false; render();
        } }, [icon('article'), page.name]));
      });
      out.push(h('button', { class: 'side-item add', text: '+ New page', onclick: function () {
        var created = { id: uid('p_'), name: 'Page ' + (dashboard.pages.length + 1), blocks: [] };
        dashboard.pages.push(created);
        sel.pageId = created.id; sel.blockId = null;
        markDirty(); render();
      } }));

      out.push(h('div', { class: 'side-foot' }, [
        'Address of this dashboard', h('br'), h('code', { text: location.origin + '/?d=' + dashboard.id })
      ]));
    }
    els.left.replaceChildren.apply(els.left, out);
  }

  // Typing a dashboard name only needs the list labels refreshed, not the inputs
  // (re-rendering would drop focus).
  function renderLeftLabelsOnly() {
    var dashboard = currentDashboard();
    var active = els.left.querySelector('.side-item.active .material-symbols-outlined');
    if (dashboard && active && active.parentNode && active.textContent === 'dashboard') {
      active.parentNode.lastChild.textContent = dashboard.name;
    }
    renderCenter();
  }

  // ---- centre: blocks of the page ----

  // The floor image with the device pins drawn on top, at roughly the height
  // the dashboard gives a floor plan, so you can see how much room it takes.
  var floorImages = {};

  function loadFloorImage(floor, done) {
    var cached = floorImages[floor.id];
    if (cached) { if (cached.src !== undefined) done(cached.src); else cached.waiting.push(done); return; }
    cached = floorImages[floor.id] = { waiting: [done] };
    var finish = function (src) {
      cached.src = src;
      cached.waiting.splice(0).forEach(function (cb) { cb(src); });
    };
    if (floor.imageData) return finish(floor.imageData);
    if (floor.imageId && floor.imageId.indexOf('.') >= 0) {
      api('GET', '/floorImage/' + encodeURIComponent(floor.imageId))
        .then(function (r) { finish(r && r.dataUrl ? r.dataUrl : null); })
        .catch(function () { finish(null); });
      return;
    }
    finish(floor.fileUrl || null);
  }

  function floorPreview(block) {
    var floor = data.floors.find(function (f) { return f.id === block.floorId; });
    var box = h('div', { class: 'pv-floor' });
    if (!block.floorId) { box.textContent = 'No floor chosen'; return box; }
    if (!floor) { box.textContent = 'Missing floor'; return box; }
    box.textContent = 'Loading ' + floor.name + '…';
    loadFloorImage(floor, function (src) {
      if (!src) { box.textContent = 'No image for ' + floor.name; return; }
      var img = h('img', { src: src, alt: floor.name });
      img.addEventListener('load', function () {
        box.textContent = '';
        var stage = h('div', { class: 'pv-stage' });
        stage.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
        stage.style.width = 'min(100%, ' + Math.round(340 * img.naturalWidth / img.naturalHeight) + 'px)';
        stage.appendChild(img);
        (floor.devices || []).forEach(function (device) {
          var pos = device.position;
          if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
          var dot = h('span', { class: 'pv-pin', title: device.name || '' });
          dot.style.left = pos.x + '%';
          dot.style.top = pos.y + '%';
          stage.appendChild(dot);
        });
        box.appendChild(stage);
      });
      img.addEventListener('error', function () { box.textContent = 'Could not show the image of ' + floor.name; });
    });
    return box;
  }

  function preview(block) {
    var cols = Math.max(1, Math.min(4, block.columns || 2));
    var body = h('div', { class: 'bcard-body', style: '--cols:' + cols });

    if (block.type === 'floorplan') {
      body.appendChild(floorPreview(block));
    } else if (block.type === 'buttons') {
      body.classList.add('squares');
      (block.items || []).forEach(function (item) {
        body.appendChild(h('div', { class: 'pv sq' }, [icon(item.kind === 'device' ? 'lightbulb' : (item.icon || 'play_arrow')), item.label || 'Button']));
      });
      if (!(block.items || []).length) body.appendChild(h('div', { class: 'pv pv-wide dim', text: 'No buttons yet' }));
    } else if (block.type === 'room') {
      body.appendChild(h('div', { class: 'pv pv-wide dim', text: zoneName(block.zoneId) + ' · filled automatically' }));
    } else if (block.type === 'devices') {
      (block.items || []).forEach(function (item) {
        var device = data.devices.find(function (d) { return d.id === item.homeyId; });
        body.classList.add('squares');
        body.appendChild(h('div', { class: 'pv sq' }, [icon('lightbulb'), device ? device.name : 'Missing device']));
      });
      if (!(block.items || []).length) body.appendChild(h('div', { class: 'pv pv-wide dim', text: 'No devices yet' }));
    } else if (block.type === 'link') {
      body.appendChild(h('div', { class: 'pv pv-wide' }, [icon('arrow_forward'), (block.label || 'Link') + (block.pageId ? ' · goes to ' + pageName(block.pageId) : '')]));
    } else if (block.type === 'spacer') {
      body.appendChild(h('div', { class: 'pv pv-wide dim', text: (block.height || 0) + ' px of space' }));
    } else if (block.type === 'hero') {
      if (block.imageId) {
        var heroImg = h('img', { class: 'pv-hero', src: '/media/' + encodeURIComponent(block.imageId), alt: '' });
        heroImg.style.objectPosition = '50% ' + (block.focusY === undefined ? 60 : block.focusY) + '%';
        body.appendChild(heroImg);
      } else {
        body.appendChild(h('div', { class: 'pv pv-wide dim', text: 'No image yet' }));
      }
    } else if (block.type === 'weather') {
      body.appendChild(h('div', { class: 'pv pv-wide' }, [icon('partly_cloudy_day'), 'Weather at Homey\'s location']));
    } else if (block.type === 'climate') {
      var main = data.devices.find(function (d) { return d.id === block.mainDeviceId; });
      body.appendChild(h('div', { class: 'pv pv-wide' + (main ? '' : ' dim') }, [icon('thermostat'),
        (main ? main.name : 'No main sensor') + ((block.items || []).length ? ' + ' + block.items.length + ' more' : '')]));
    } else if (block.type === 'lighting') {
      var floors = (block.floorIds || []).length ? block.floorIds.map(floorName).filter(Boolean).join(' → ') : 'All floors';
      var views = { light: 'Lighting', all: 'Everything', security: 'Security', climate: 'Climate' };
      body.appendChild(h('div', { class: 'pv pv-wide' }, [icon('home'), (views[block.startFilter] || 'Lighting') + ' · ' + floors]));
    } else if (block.type === 'quick') {
      var names = (block.items || []).map(function (i) { var d = data.devices.find(function (x) { return x.id === i.homeyId; }); return i.label || (d ? d.name : 'Missing device'); });
      body.appendChild(h('div', { class: 'pv pv-wide' + (names.length ? '' : ' dim') }, [icon('bolt'), names.length ? names.join(' · ') : 'No devices yet']));
    } else if (block.type === 'music') {
      var picked = (block.deviceIds || []).map(function (id) { var d = data.devices.find(function (x) { return x.id === id; }); return d ? d.name : null; }).filter(Boolean);
      body.appendChild(h('div', { class: 'pv pv-wide' }, [icon('music_note'), picked.length ? picked.join(', ') : 'All speakers']));
    } else {
      return null;
    }
    return body;
  }

  var dragIndex = null;

  // Side-by-side blocks (narrower than the list) are ordered left to right.
  function dropAfter(card, e) {
    var rect = card.getBoundingClientRect();
    var list = card.parentNode.getBoundingClientRect();
    if (rect.width < list.width - 4) return e.clientX > rect.left + rect.width / 2;
    return e.clientY > rect.top + rect.height / 2;
  }

  function clearDropMarks() {
    els.center.querySelectorAll('.drop-before, .drop-after').forEach(function (n) {
      n.classList.remove('drop-before', 'drop-after');
    });
  }

  function renderCenter() {
    var page = currentPage();
    var out = [];
    if (!currentDashboard()) {
      els.center.replaceChildren(h('div', { class: 'empty', text: 'Create a dashboard to start.' }));
      return;
    }
    if (!page) {
      els.center.replaceChildren(h('div', { class: 'empty', text: 'Add a page to start.' }));
      return;
    }

    var dashboard = currentDashboard();
    var index = dashboard.pages.indexOf(page);
    out.push(h('div', { class: 'page-head' }, [
      bound(page, 'name', { class: 'page-title', 'aria-label': 'Page name' }, function () {
        var activeItem = els.left.querySelectorAll('.side-item.active')[1];
        if (activeItem) activeItem.lastChild.textContent = page.name;
      }),
      bound(page, 'icon', { class: 'page-icon', placeholder: 'Menu icon', title: 'Icon in the bottom menu of the Evening style (Material Symbols name, e.g. home, grid_view)' }),
      h('span', { class: 'page-count', text: page.blocks.length + (page.blocks.length === 1 ? ' block' : ' blocks') }),
      h('div', { class: 'page-tools' }, [
        h('button', { class: 'btn small', text: '←', title: 'Move page earlier', disabled: index === 0, onclick: function () { move(dashboard.pages, index, -1); } }),
        h('button', { class: 'btn small', text: '→', title: 'Move page later', disabled: index === dashboard.pages.length - 1, onclick: function () { move(dashboard.pages, index, 1); } }),
        h('button', { class: 'btn small danger', text: 'Delete page', onclick: function () {
          if (!window.confirm('Delete page "' + page.name + '"?')) return;
          dashboard.pages.splice(index, 1);
          sel.pageId = null; sel.blockId = null;
          ensureSelection(); markDirty(); render();
        } })
      ])
    ]));

    var list = h('div', { class: 'blocks-grid' });
    page.blocks.forEach(function (block, i) {
      var meta = TYPES[block.type] || [block.type, 'help', ''];
      var title = block.title || block.text || block.label || (block.type === 'floorplan' ? floorName(block.floorId) : '');
      var chips = [h('span', { class: 'chip', text: meta[0] })];
      if (block.columns && ['buttons', 'room', 'devices'].indexOf(block.type) >= 0) {
        chips.push(h('span', { class: 'chip soft', text: block.columns + (block.columns === 1 ? ' column' : ' columns') }));
      }
      if (block.visibleOn) chips.push(h('span', { class: 'chip soft', text: block.visibleOn === 'small' ? 'small screens' : 'large screens' }));
      var card = h('div', { class: 'bcard' + (block.id === sel.blockId ? ' selected' : ''), onclick: function () {
        sel.blockId = block.id; sel.picking = false; render();
      } }, [
        h('div', { class: 'bcard-head' }, [h('span', { class: 'drag-handle', title: 'Drag to reorder' }, [icon('drag_indicator')])].concat(chips).concat([
          h('span', { class: 'bcard-title', text: title || '' }),
          h('div', { class: 'bcard-tools' }, [
            h('button', { class: 'btn small', text: '↑', disabled: i === 0, onclick: function (e) { e.stopPropagation(); move(page.blocks, i, -1); } }),
            h('button', { class: 'btn small', text: '↓', disabled: i === page.blocks.length - 1, onclick: function (e) { e.stopPropagation(); move(page.blocks, i, 1); } })
          ])
        ])),
        preview(block)
      ]);
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', function (e) {
        dragIndex = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', block.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', function () { dragIndex = null; card.classList.remove('dragging'); clearDropMarks(); });
      card.addEventListener('dragover', function (e) {
        if (dragIndex === null) return;
        e.preventDefault();
        clearDropMarks();
        card.classList.add(dropAfter(card, e) ? 'drop-after' : 'drop-before');
      });
      card.addEventListener('drop', function (e) {
        if (dragIndex === null) return;
        e.preventDefault();
        var target = i + (dropAfter(card, e) ? 1 : 0);
        var item = page.blocks.splice(dragIndex, 1)[0];
        if (dragIndex < target) target--;
        page.blocks.splice(target, 0, item);
        dragIndex = null;
        markDirty();
        render();
      });
      var span = parseInt(block.span, 10);
      if (span >= 1 && span < 12) card.style.gridColumn = 'span ' + span;
      list.appendChild(card);
    });
    out.push(list);

    if (sel.picking) {
      out.push(h('div', { class: 'type-picker' }, [h('h3', { text: 'Choose a block type' })].concat(
        Object.keys(TYPES).map(function (type) {
          return h('button', { class: 'type-card', onclick: function () { addBlock(type); } }, [
            icon(TYPES[type][1]),
            h('div', null, [h('strong', { text: TYPES[type][0] }), h('span', { class: 'desc', text: TYPES[type][2] })])
          ]);
        })
      )));
    } else {
      out.push(h('button', { class: 'add-block', text: '+ Add block', onclick: function () { sel.picking = true; renderCenter(); } }));
    }
    els.center.replaceChildren.apply(els.center, out);
  }

  function addBlock(type) {
    var page = currentPage();
    if (!page) return;
    var block = { id: uid('b_'), type: type };
    if (type === 'buttons' || type === 'devices') { block.columns = 3; block.items = []; }
    if (type === 'room') { block.columns = 2; block.zoneId = '*'; }
    if (type === 'heading') block.text = 'Heading';
    if (type === 'spacer') block.height = 24;
    if (type === 'link') block.label = 'Next page';
    if (type === 'hero') { block.height = 380; block.focusY = 60; }
    if (type === 'climate') block.items = [];
    if (type === 'lighting') block.floorIds = [];
    if (type === 'music') block.deviceIds = [];
    if (type === 'quick') block.items = [];
    page.blocks.push(block);
    sel.blockId = block.id;
    sel.picking = false;
    markDirty();
    render();
  }

  // ---- right: settings of the selected block ----

  function renderRight() {
    var page = currentPage();
    var block = currentBlock();
    if (!block) {
      els.right.replaceChildren(h('div', { class: 'empty', text: 'Select a block to edit it.' }));
      return;
    }

    var meta = TYPES[block.type] || [block.type];
    var out = [
      h('div', { class: 'side-label', text: 'Block settings' }),
      h('strong', { text: meta[0] }),
      h('div', { class: 'stack' }, blockFields(block, page)),
      h('div', { class: 'side-label', text: 'Width' }),
      widthSegment(block),
      h('p', { class: 'hint', text: 'Blocks that fit side by side share a row. Narrow screens always show them full width.' }),
      h('div', { class: 'side-label', text: 'Show block on' }),
      visibleOnSegment(block),
      h('p', { class: 'hint', text: 'Small = phones and narrow panels (under 700 px wide). Hide blocks that do not fit a screen.' }),
      h('div', { class: 'stack' }, [
        h('button', { class: 'btn block danger', text: 'Delete block', onclick: function () {
          page.blocks = page.blocks.filter(function (b) { return b.id !== block.id; });
          sel.blockId = null; markDirty(); render();
        } })
      ])
    ];
    els.right.replaceChildren.apply(els.right, out);
  }

  function segment(block, key, values) {
    var wrap = h('div', { class: 'seg' });
    values.forEach(function (n) {
      wrap.appendChild(h('button', { class: (block[key] || values[0]) === n ? 'on' : '', text: String(n), onclick: function () {
        block[key] = n; markDirty(); render();
      } }));
    });
    return wrap;
  }

  function widthSegment(block) {
    var wrap = h('div', { class: 'seg' });
    [[12, 'Full'], [8, '2/3'], [6, '1/2'], [4, '1/3'], [3, '1/4']].forEach(function (o) {
      var current = parseInt(block.span, 10) || 12;
      wrap.appendChild(h('button', { class: current === o[0] ? 'on' : '', text: o[1], onclick: function () {
        block.span = o[0] === 12 ? undefined : o[0];
        markDirty(); render();
      } }));
    });
    return wrap;
  }

  function visibleOnSegment(block) {
    var wrap = h('div', { class: 'seg' });
    [['all', 'All'], ['small', 'Small'], ['large', 'Large']].forEach(function (o) {
      wrap.appendChild(h('button', { class: (block.visibleOn || 'all') === o[0] ? 'on' : '', text: o[1], onclick: function () {
        block.visibleOn = o[0] === 'all' ? undefined : o[0];
        markDirty(); render();
      } }));
    });
    return wrap;
  }

  function blockFields(block, page) {
    var f = [];
    var refresh = renderCenter;

    if (block.type === 'floorplan') {
      f.push(field('Floor', select([['', 'Choose a floor']].concat(data.floors.map(function (fl) { return [fl.id, fl.name]; })),
        block.floorId || '', function (v) { block.floorId = v; markDirty(); renderCenter(); })));
      f.push(h('label', { class: 'check' }, [(function () {
        var box = h('input', { type: 'checkbox', checked: !!block.background });
        box.addEventListener('change', function () { block.background = box.checked ? true : undefined; markDirty(); });
        return box;
      })(), 'Card background behind the floor plan']));
      f.push(h('p', { class: 'hint', text: 'Device placement and rules are edited in the Spacey Plan settings in Homey.' }));
    }

    if (block.type === 'hero') {
      var upload = h('input', { type: 'file', accept: 'image/*' });
      var uploadStatus = h('span', { class: 'hint' });
      upload.addEventListener('change', function () {
        var file = upload.files && upload.files[0];
        if (!file) return;
        uploadStatus.textContent = 'Uploading…';
        uploadStatus.className = 'hint';
        shrinkImage(file, 2000).then(function (dataUrl) {
          return api('POST', '/dashboardImages', { dataUrl: dataUrl });
        }).then(function (result) {
          block.imageId = result.imageId;
          uploadStatus.textContent = 'Uploaded. Save to keep it.';
          markDirty(); renderCenter();
        }).catch(function (error) {
          uploadStatus.textContent = 'Upload failed: ' + error.message;
          uploadStatus.className = 'hint error';
        });
      });
      f.push(field('Image', upload));
      f.push(uploadStatus);
      f.push(field('Name shown top left (empty = dashboard name)', bound(block, 'title', null, refresh)));
      f.push(field('Height (px)', bound(block, 'height', { type: 'number', min: 160, max: 900 }, refresh)));
      f.push(field('Image position (0 = top, 100 = bottom)', bound(block, 'focusY', { type: 'range', min: 0, max: 100 }, refresh)));
      f.push(h('label', { class: 'check' }, [(function () {
        var box = h('input', { type: 'checkbox', checked: block.showWeather !== false });
        box.addEventListener('change', function () { block.showWeather = box.checked ? undefined : false; markDirty(); });
        return box;
      })(), 'Show the weather next to the clock']));
    }

    if (block.type === 'weather') {
      f.push(field('Title (empty = "Weather")', bound(block, 'title', null, refresh)));
      f.push(h('p', { class: 'hint', text: 'Uses the location set in Homey. Data from Open-Meteo, refreshed every 10 minutes.' }));
    }

    if (block.type === 'climate') {
      var tempDevices = data.devices.filter(function (d) {
        return d.capabilities.indexOf('measure_temperature') >= 0 || d.capabilities.indexOf('measure_combined') >= 0;
      });
      f.push(field('Title (empty = "Indoors")', bound(block, 'title', null, refresh)));
      f.push(field('Main sensor (large)', select([['', 'None']].concat(tempDevices.map(function (d) { return [d.id, d.name]; })),
        block.mainDeviceId || '', function (v) { block.mainDeviceId = v || undefined; markDirty(); renderCenter(); })));
      f.push(h('div', { class: 'side-label', text: 'Sensors, in order' }));
      block.items = block.items || [];
      block.items.forEach(function (item, i) {
        var device = data.devices.find(function (d) { return d.id === item.homeyId; });
        var moveSensor = function (to) { block.items.splice(to, 0, block.items.splice(i, 1)[0]); markDirty(); render(); };
        f.push(h('div', { class: 'item-row' }, [
          h('strong', { text: device ? device.name : 'Missing device' }),
          h('button', { class: 'btn small', text: '↑', title: 'Earlier', disabled: i === 0, onclick: function () { moveSensor(i - 1); } }),
          h('button', { class: 'btn small', text: '↓', title: 'Later', disabled: i === block.items.length - 1, onclick: function () { moveSensor(i + 1); } }),
          h('button', { class: 'btn small danger', text: '×', title: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } })
        ]));
      });
      var unpicked = tempDevices.filter(function (d) { return !block.items.some(function (it) { return it.homeyId === d.id; }); });
      var tempPicker = h('select', null, [h('option', { value: '', text: '+ Add a sensor…' })].concat(
        unpicked.map(function (d) { return h('option', { value: d.id, text: d.name }); })));
      tempPicker.addEventListener('change', function () {
        if (!tempPicker.value) return;
        block.items.push({ id: uid('i_'), homeyId: tempPicker.value });
        markDirty(); render();
      });
      f.push(tempPicker);
      f.push(h('p', { class: 'hint', text: 'Each sensor is shown with the name of its room.' }));
    }

    if (block.type === 'lighting') {
      f.push(field('Opens with', select([['light', 'Lighting'], ['all', 'Everything'], ['security', 'Security'], ['climate', 'Climate']],
        block.startFilter || 'light', function (v) { block.startFilter = v; markDirty(); renderCenter(); })));
      f.push(field('Title (empty = name of that view)', bound(block, 'title', null, refresh)));
      f.push(h('div', { class: 'side-label', text: 'Floors, in tab order (none = all)' }));
      block.floorIds = (block.floorIds || []).filter(function (id) { return data.floors.some(function (fl) { return fl.id === id; }); });
      delete block.outdoorZoneIds;
      delete block.outdoorFloorId;
      block.floorIds.forEach(function (id, i) {
        var fl = data.floors.find(function (x) { return x.id === id; });
        var move = function (to) {
          block.floorIds.splice(i, 1);
          block.floorIds.splice(to, 0, id);
          markDirty(); render();
        };
        f.push(h('div', { class: 'item-row' }, [
          h('strong', { text: fl.name }),
          h('button', { class: 'btn small', text: '↑', title: 'Earlier', disabled: i === 0, onclick: function () { move(i - 1); } }),
          h('button', { class: 'btn small', text: '↓', title: 'Later', disabled: i === block.floorIds.length - 1, onclick: function () { move(i + 1); } }),
          h('button', { class: 'btn small danger', text: '×', title: 'Remove', onclick: function () { block.floorIds.splice(i, 1); markDirty(); render(); } })
        ]));
      });
      var rest = data.floors.filter(function (fl) { return block.floorIds.indexOf(fl.id) < 0; });
      if (rest.length) {
        var floorPicker = h('select', null, [h('option', { value: '', text: '+ Add a floor…' })].concat(
          rest.map(function (fl) { return h('option', { value: fl.id, text: fl.name }); })));
        floorPicker.addEventListener('change', function () {
          if (!floorPicker.value) return;
          block.floorIds.push(floorPicker.value);
          markDirty(); render();
        });
        f.push(floorPicker);
      }
      f.push(h('p', { class: 'hint', text: 'Each floor is a tab with its plan and what is placed on it, per room. The sheet has filters for everything, lighting, security and climate. Lights are devices of the class Light, or sockets whose connected device is set to Light in Homey.' }));
    }

    if (block.type === 'quick') {
      f.push(field('Title (optional)', bound(block, 'title', null, refresh)));
      f.push(h('div', { class: 'side-label', text: 'Buttons, in order' }));
      block.items = block.items || [];
      block.items.forEach(function (item, i) {
        var device = data.devices.find(function (d) { return d.id === item.homeyId; });
        var moveItem = function (to) { block.items.splice(to, 0, block.items.splice(i, 1)[0]); markDirty(); render(); };
        f.push(h('div', { class: 'item-row' }, [
          h('strong', { text: device ? device.name : 'Missing device' }),
          h('button', { class: 'btn small', text: '↑', title: 'Earlier', disabled: i === 0, onclick: function () { moveItem(i - 1); } }),
          h('button', { class: 'btn small', text: '↓', title: 'Later', disabled: i === block.items.length - 1, onclick: function () { moveItem(i + 1); } }),
          h('button', { class: 'btn small danger', text: '×', title: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } })
        ]));
        f.push(field('Label (empty = device name)', bound(item, 'label', null, refresh)));
      });
      var switchable = data.devices.filter(function (d) {
        return (d.capabilities || []).some(function (c) { return c === 'onoff' || c === 'dim'; });
      });
      var quickPicker = h('select', null, [h('option', { value: '', text: '+ Add a device…' })].concat(
        switchable.map(function (d) { return h('option', { value: d.id, text: d.name }); })));
      quickPicker.addEventListener('change', function () {
        if (!quickPicker.value) return;
        block.items.push({ id: uid('q_'), homeyId: quickPicker.value });
        markDirty(); render();
      });
      f.push(quickPicker);
      f.push(h('p', { class: 'hint', text: 'Lights and other on/off devices. Tap toggles, long press opens the device.' }));
    }

    if (block.type === 'music') {
      f.push(field('Title (empty = "Music")', bound(block, 'title', null, refresh)));
      f.push(field('Subtitle', bound(block, 'subtitle', null, refresh)));
      f.push(h('div', { class: 'side-label', text: 'Speakers (none ticked = all)' }));
      block.deviceIds = block.deviceIds || [];
      f.push(h('div', { class: 'check-grid' }, data.devices.filter(function (d) { return d.class === 'speaker'; }).map(function (d) {
        return checkInList(block.deviceIds, d.id, d.name);
      })));
      f.push(h('p', { class: 'hint', text: 'Starts on the room that is playing. "All linked" moves every room in the same Sonos group, or every playing room, keeping their balance.' }));
    }

    if (block.type === 'heading') f.push(field('Text', bound(block, 'text', null, refresh)));
    if (block.type === 'spacer') f.push(field('Height (px)', bound(block, 'height', { type: 'number', min: 0 }, refresh)));

    if (block.type === 'link') {
      var others = currentDashboard().pages.filter(function (p) { return p.id !== page.id; });
      f.push(field('Label', bound(block, 'label', null, refresh)));
      f.push(field('Icon (Material Symbols name)', bound(block, 'icon')));
      f.push(field('Go to page', select([['', 'Choose a page']].concat(others.map(function (p) { return [p.id, p.name]; })),
        block.pageId || '', function (v) { block.pageId = v; markDirty(); renderCenter(); })));
    }

    if (block.type === 'buttons' || block.type === 'room' || block.type === 'devices') {
      f.push(field('Title', bound(block, 'title', null, refresh)));
      f.push(field('Columns', segment(block, 'columns', [1, 2, 3, 4])));
      f.push(h('p', { class: 'hint', text: 'Maximum. Narrow screens use fewer automatically.' }));
    }

    if (block.type === 'room') {
      f.push(field('Room', select(
        [['*', 'The room chosen on the device']].concat(data.zones.map(function (z) { return [z.id, z.name]; })),
        block.zoneId || '*', function (v) { block.zoneId = v; markDirty(); renderCenter(); })));
    }

    if (block.type === 'buttons') {
      f.push(h('div', { class: 'side-label', text: 'Content' }));
      block.items = block.items || [];
      block.items.forEach(function (item, i) {
        var onOffDevices = data.devices.filter(function (d) { return d.capabilities.indexOf('onoff') >= 0 || d.capabilities.indexOf('dim') >= 0; });
        var rowParts = [
          bound(item, 'label', { placeholder: 'Label' }, refresh),
          bound(item, 'icon', { placeholder: 'Icon, e.g. bedtime' }, refresh),
          select([['flow', 'Runs a Flow'], ['device', 'Controls a device']], item.kind || 'flow', function (v) {
            item.kind = v; markDirty(); render();
          })
        ];
        if (item.kind === 'device') {
          rowParts.push(select([['', 'Choose a device']].concat(onOffDevices.map(function (d) { return [d.id, d.name]; })),
            item.homeyId || '', function (v) {
              var device = data.devices.find(function (d) { return d.id === v; });
              item.homeyId = v;
              item.capability = device && device.capabilities.indexOf('dim') >= 0 ? 'dim' : 'onoff';
              markDirty(); renderCenter();
            }));
        }
        rowParts.push(h('button', { class: 'btn small danger', text: '×', title: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } }));
        f.push(h('div', { class: 'item-row' }, rowParts));
      });
      f.push(h('button', { class: 'btn', text: '+ Add button', onclick: function () {
        block.items.push({ id: uid('i_'), kind: 'flow', label: 'Button', icon: 'play_arrow' });
        markDirty(); render();
      } }));
      f.push(h('p', { class: 'hint', text: '"Runs a Flow": in a Flow use WHEN "Dashboard button … was pressed" and choose the button. "Controls a device" shows the own tile of the device with icon and live status, no Flow needed.' }));
    }

    if (block.type === 'devices') {
      f.push(h('div', { class: 'side-label', text: 'Content' }));
      block.items = block.items || [];
      block.items.forEach(function (item, i) {
        var device = data.devices.find(function (d) { return d.id === item.homeyId; });
        var caps = device ? device.capabilities : [item.capability];
        f.push(h('div', { class: 'item-row' }, [
          h('strong', { text: device ? device.name : 'Missing device' }),
          select(caps.map(function (c) { return [c, c]; }), item.capability, function (v) { item.capability = v; markDirty(); }),
          h('button', { class: 'btn small danger', text: '×', title: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } })
        ]));
      });
      var picker = h('select', null, [h('option', { value: '', text: '+ Add a device…' })].concat(
        data.devices.map(function (d) { return h('option', { value: d.id, text: d.name }); })));
      picker.addEventListener('change', function () {
        var device = data.devices.find(function (d) { return d.id === picker.value; });
        if (!device) return;
        block.items.push({ id: uid('i_'), homeyId: device.id, capability: device.capabilities[0] });
        markDirty(); render();
      });
      f.push(picker);
    }

    return f;
  }

  function checkInList(list, id, label) {
    var box = h('input', { type: 'checkbox', checked: list.indexOf(id) >= 0 });
    box.addEventListener('change', function () {
      var at = list.indexOf(id);
      if (box.checked && at < 0) list.push(id);
      if (!box.checked && at >= 0) list.splice(at, 1);
      markDirty(); renderCenter();
    });
    return h('label', { class: 'check' }, [box, label]);
  }

  // Scales a photo down to `maxSide` px and encodes it as JPEG, so uploads
  // stay small enough for the request limit and for wall panels.
  function shrinkImage(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the file')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Not an image the browser can read')); };
        img.onload = function () {
          var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function render() {
    ensureSelection();
    renderLeft();
    renderCenter();
    renderRight();
  }

  // ---- save / preview / load ----

  els.save.addEventListener('click', async function () {
    els.save.disabled = true;
    setStatus('Saving…');
    try {
      await api('POST', '/dashboards', data.dashboards);
      dirty = false;
      setStatus('Saved');
    } catch (error) {
      els.save.disabled = false;
      setStatus('Save failed: ' + error.message, true);
    }
  });

  els.preview.addEventListener('click', function () {
    var dashboard = currentDashboard();
    if (!dashboard) return;
    els.frame.src = '/?d=' + encodeURIComponent(dashboard.id);
    els.modal.hidden = false;
  });
  document.getElementById('previewClose').addEventListener('click', function () {
    els.modal.hidden = true;
    els.frame.src = 'about:blank';
  });

  window.addEventListener('beforeunload', function (event) {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  });

  async function load() {
    try {
      var results = await Promise.all([
        api('GET', '/dashboards'),
        api('GET', '/floors'),
        api('GET', '/zones'),
        api('GET', '/dashboardDevices')
      ]);
      data.dashboards = results[0];
      data.floors = results[1];
      data.zones = results[2].sort(function (a, b) { return a.name.localeCompare(b.name); });
      data.devices = results[3];
    } catch (error) {
      els.center.replaceChildren(h('p', { class: 'hint error', text: 'Could not load: ' + error.message }));
      return;
    }
    sel.dashboardId = data.dashboards.length ? data.dashboards[0].id : null;
    render();
  }

  load();
})();
