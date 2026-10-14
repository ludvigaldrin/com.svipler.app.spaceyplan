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
    link: ['Page link', 'arrow_forward', 'A button that goes to another page of this dashboard.']
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
      obj[key] = input.type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value;
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

  function preview(block) {
    var cols = Math.max(1, Math.min(4, block.columns || 2));
    var body = h('div', { class: 'bcard-body', style: '--cols:' + cols });

    if (block.type === 'floorplan') {
      body.appendChild(h('div', { class: 'pv-floor', text: block.floorId ? floorName(block.floorId) || 'Missing floor' : 'No floor chosen' }));
    } else if (block.type === 'buttons') {
      (block.items || []).forEach(function (item) {
        body.appendChild(h('div', { class: 'pv' }, [icon(item.icon || 'play_arrow'), item.label || 'Button']));
      });
      if (!(block.items || []).length) body.appendChild(h('div', { class: 'pv pv-wide dim', text: 'No buttons yet' }));
    } else if (block.type === 'room') {
      body.appendChild(h('div', { class: 'pv pv-wide dim', text: zoneName(block.zoneId) + ' · filled automatically' }));
    } else if (block.type === 'devices') {
      (block.items || []).forEach(function (item) {
        var device = data.devices.find(function (d) { return d.id === item.homeyId; });
        body.appendChild(h('div', { class: 'pv' }, [icon('lightbulb'), device ? device.name : 'Missing device']));
      });
      if (!(block.items || []).length) body.appendChild(h('div', { class: 'pv pv-wide dim', text: 'No devices yet' }));
    } else if (block.type === 'link') {
      body.appendChild(h('div', { class: 'pv pv-wide' }, [icon('arrow_forward'), (block.label || 'Link') + (block.pageId ? ' · goes to ' + pageName(block.pageId) : '')]));
    } else if (block.type === 'spacer') {
      body.appendChild(h('div', { class: 'pv pv-wide dim', text: (block.height || 0) + ' px of space' }));
    } else {
      return null;
    }
    return body;
  }

  var dragIndex = null;

  function dropAfter(card, e) {
    var rect = card.getBoundingClientRect();
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
      out.push(card);
    });

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
      f.push(h('p', { class: 'hint', text: 'Device placement and rules are edited in the Spacey Plan settings in Homey.' }));
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
        f.push(h('div', { class: 'item-row' }, [
          bound(item, 'label', { placeholder: 'Label' }, refresh),
          bound(item, 'icon', { placeholder: 'Icon, e.g. bedtime' }, refresh),
          h('button', { class: 'btn small danger', text: '×', title: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } })
        ]));
      });
      f.push(h('button', { class: 'btn', text: '+ Add button', onclick: function () {
        block.items.push({ id: uid('i_'), kind: 'flow', label: 'Button', icon: 'play_arrow' });
        markDirty(); render();
      } }));
      f.push(h('p', { class: 'hint', text: 'In a Flow use: WHEN "Dashboard button … was pressed" and choose the button.' }));
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
