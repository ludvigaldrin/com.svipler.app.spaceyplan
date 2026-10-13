// Block editor for External Dashboards. Edits the whole `dashboards` list in
// memory and saves it in one POST (the server validates).
(function () {
  'use strict';

  var root = document.getElementById('root');
  var saveButton = document.getElementById('save');
  var statusEl = document.getElementById('status');

  var data = { dashboards: [], floors: [], zones: [], devices: [] };
  var sel = { dashboardId: null, pageId: null };
  var dirty = false;

  var BLOCK_TYPES = [
    ['floorplan', 'Floor plan'],
    ['buttons', 'Buttons'],
    ['room', 'Room'],
    ['devices', 'Devices'],
    ['heading', 'Heading'],
    ['spacer', 'Spacer'],
    ['link', 'Page link']
  ];

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 9);
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (isError ? ' error' : '');
  }

  function markDirty() {
    dirty = true;
    saveButton.disabled = false;
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

  function field(label, input) {
    return h('label', null, [label, input]);
  }

  // Text/number input that writes to obj[key] without re-rendering.
  function bound(obj, key, attrs) {
    var input = h('input', Object.assign({ value: obj[key] === undefined ? '' : obj[key] }, attrs || {}));
    input.addEventListener('input', function () {
      obj[key] = input.type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value;
      markDirty();
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
    return dashboard && dashboard.pages.find(function (p) { return p.id === sel.pageId; }) || null;
  }

  function move(list, index, delta) {
    var target = index + delta;
    if (target < 0 || target >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(target, 0, item);
    markDirty();
    render();
  }

  // ---- dashboards and pages ----

  function renderDashboards() {
    var dashboard = currentDashboard();
    var panel = h('section', { class: 'panel' }, [h('h2', { text: 'Dashboards' })]);

    var row = h('div', { class: 'row' });
    row.appendChild(select(data.dashboards.map(function (d) { return [d.id, d.name]; }),
      sel.dashboardId, function (id) { sel.dashboardId = id; sel.pageId = null; ensurePage(); render(); }));
    row.appendChild(h('button', { class: 'btn', text: 'New dashboard', onclick: function () {
      var created = { id: uid('d_'), name: 'New dashboard', pages: [{ id: uid('p_'), name: 'Page 1', blocks: [] }] };
      data.dashboards.push(created);
      sel.dashboardId = created.id;
      sel.pageId = created.pages[0].id;
      markDirty();
      render();
    } }));
    if (dashboard) {
      row.appendChild(h('button', { class: 'btn danger', text: 'Delete dashboard', onclick: function () {
        if (!window.confirm('Delete dashboard "' + dashboard.name + '"?')) return;
        data.dashboards = data.dashboards.filter(function (d) { return d.id !== dashboard.id; });
        sel.dashboardId = data.dashboards.length ? data.dashboards[0].id : null;
        sel.pageId = null;
        ensurePage();
        markDirty();
        render();
      } }));
    }
    panel.appendChild(row);

    if (dashboard) {
      var look = h('div', { class: 'row' }, [
        field('Name', bound(dashboard, 'name')),
        field('Theme', select([['', 'Follow device'], ['light', 'Light'], ['dark', 'Dark']],
          dashboard.theme || '', function (v) { dashboard.theme = v || undefined; markDirty(); })),
        field('Accent', (function () {
          var input = h('input', { type: 'color', value: dashboard.accent || '#3b82f6' });
          input.addEventListener('input', function () { dashboard.accent = input.value; markDirty(); });
          return input;
        })()),
        field('Screensaver (min, 0 = off)', bound(dashboard, 'screensaverMinutes', { type: 'number', min: 0 }))
      ]);
      panel.appendChild(look);
      panel.appendChild(h('p', { class: 'hint', text: 'Open on a screen with /?d=' + dashboard.id + ' (or pick it on the device).' }));
    }
    return panel;
  }

  function ensurePage() {
    var dashboard = currentDashboard();
    if (!dashboard) { sel.pageId = null; return; }
    if (!dashboard.pages.some(function (p) { return p.id === sel.pageId; })) {
      sel.pageId = dashboard.pages.length ? dashboard.pages[0].id : null;
    }
  }

  function renderPages() {
    var dashboard = currentDashboard();
    var panel = h('section', { class: 'panel' }, [h('h2', { text: 'Pages' })]);
    if (!dashboard) return panel;

    var tabs = h('div', { class: 'tabs' });
    dashboard.pages.forEach(function (page) {
      tabs.appendChild(h('button', { class: 'tab' + (page.id === sel.pageId ? ' active' : ''), text: page.name,
        onclick: function () { sel.pageId = page.id; render(); } }));
    });
    tabs.appendChild(h('button', { class: 'tab', text: '+ Page', onclick: function () {
      var created = { id: uid('p_'), name: 'Page ' + (dashboard.pages.length + 1), blocks: [] };
      dashboard.pages.push(created);
      sel.pageId = created.id;
      markDirty();
      render();
    } }));
    panel.appendChild(tabs);

    var page = currentPage();
    if (page) {
      var index = dashboard.pages.indexOf(page);
      panel.appendChild(h('div', { class: 'row' }, [
        field('Page name', bound(page, 'name')),
        h('button', { class: 'btn small', text: '← Earlier', disabled: index === 0, onclick: function () { move(dashboard.pages, index, -1); } }),
        h('button', { class: 'btn small', text: 'Later →', disabled: index === dashboard.pages.length - 1, onclick: function () { move(dashboard.pages, index, 1); } }),
        h('button', { class: 'btn small danger', text: 'Delete page', onclick: function () {
          if (!window.confirm('Delete page "' + page.name + '"?')) return;
          dashboard.pages.splice(index, 1);
          ensurePage();
          markDirty();
          render();
        } })
      ]));
    }
    return panel;
  }

  // ---- blocks ----

  function blockFields(block, page) {
    var out = h('div');

    if (block.type === 'floorplan') {
      out.appendChild(h('div', { class: 'row' }, [
        field('Floor', select([['', 'Choose a floor']].concat(data.floors.map(function (f) { return [f.id, f.name]; })),
          block.floorId || '', function (v) { block.floorId = v; markDirty(); }))
      ]));
      out.appendChild(h('p', { class: 'hint', text: 'Device placement and rules are edited in the Spacey Plan settings in Homey.' }));
    }

    if (block.type === 'heading') {
      out.appendChild(h('div', { class: 'row' }, [field('Text', bound(block, 'text'))]));
    }

    if (block.type === 'spacer') {
      out.appendChild(h('div', { class: 'row' }, [field('Height (px)', bound(block, 'height', { type: 'number', min: 0 }))]));
    }

    if (block.type === 'link') {
      var others = currentDashboard().pages.filter(function (p) { return p.id !== page.id; });
      out.appendChild(h('div', { class: 'row' }, [
        field('Label', bound(block, 'label')),
        field('Icon (Material Symbols name)', bound(block, 'icon')),
        field('Go to page', select([['', 'Choose a page']].concat(others.map(function (p) { return [p.id, p.name]; })),
          block.pageId || '', function (v) { block.pageId = v; markDirty(); }))
      ]));
    }

    if (block.type === 'buttons' || block.type === 'room' || block.type === 'devices') {
      var row = h('div', { class: 'row' }, [
        field('Title', bound(block, 'title')),
        field('Max columns (1–4)', bound(block, 'columns', { type: 'number', min: 1, max: 4 }))
      ]);
      if (block.type === 'room') {
        row.appendChild(field('Room', select(
          [['*', 'The room chosen on the device']].concat(data.zones.map(function (z) { return [z.id, z.name]; })),
          block.zoneId || '*', function (v) { block.zoneId = v; markDirty(); })));
      }
      out.appendChild(row);
    }

    if (block.type === 'buttons') {
      block.items = block.items || [];
      block.items.forEach(function (item, i) {
        out.appendChild(h('div', { class: 'item-row' }, [
          bound(item, 'label', { placeholder: 'Label' }),
          bound(item, 'icon', { placeholder: 'Icon name, e.g. bedtime' }),
          h('button', { class: 'btn small danger', text: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } })
        ]));
      });
      out.appendChild(h('button', { class: 'btn small', text: '+ Button', onclick: function () {
        block.items.push({ id: uid('i_'), kind: 'flow', label: 'Button', icon: 'play_arrow' });
        markDirty();
        render();
      } }));
      out.appendChild(h('p', { class: 'hint', text: 'In a Flow use: WHEN "Dashboard button … was pressed" and choose the button.' }));
    }

    if (block.type === 'devices') {
      block.items = block.items || [];
      block.items.forEach(function (item, i) {
        var device = data.devices.find(function (d) { return d.id === item.homeyId; });
        var caps = device ? device.capabilities : [item.capability];
        out.appendChild(h('div', { class: 'item-row' }, [
          h('strong', { text: device ? device.name : 'Missing device' }),
          select(caps.map(function (c) { return [c, c]; }), item.capability, function (v) { item.capability = v; markDirty(); }),
          h('button', { class: 'btn small danger', text: 'Remove', onclick: function () { block.items.splice(i, 1); markDirty(); render(); } })
        ]));
      });

      var picker = h('select', null, [h('option', { value: '', text: 'Add a device…' })].concat(
        data.devices.map(function (d) { return h('option', { value: d.id, text: d.name }); })));
      picker.addEventListener('change', function () {
        var device = data.devices.find(function (d) { return d.id === picker.value; });
        if (!device) return;
        block.items.push({ id: uid('i_'), homeyId: device.id, capability: device.capabilities[0] });
        markDirty();
        render();
      });
      out.appendChild(picker);
    }

    return out;
  }

  function renderBlocks() {
    var page = currentPage();
    var panel = h('section', { class: 'panel' }, [h('h2', { text: 'Blocks' })]);
    if (!page) {
      panel.appendChild(h('p', { class: 'hint', text: 'Add a page to start.' }));
      return panel;
    }

    page.blocks.forEach(function (block, index) {
      var label = (BLOCK_TYPES.find(function (t) { return t[0] === block.type; }) || [0, block.type])[1];
      panel.appendChild(h('div', { class: 'block-card' }, [
        h('div', { class: 'block-head' }, [
          h('span', { class: 'block-type', text: label }),
          h('div', { class: 'block-tools' }, [
            h('button', { class: 'btn small', text: '↑', disabled: index === 0, onclick: function () { move(page.blocks, index, -1); } }),
            h('button', { class: 'btn small', text: '↓', disabled: index === page.blocks.length - 1, onclick: function () { move(page.blocks, index, 1); } }),
            h('button', { class: 'btn small danger', text: 'Delete', onclick: function () { page.blocks.splice(index, 1); markDirty(); render(); } })
          ])
        ]),
        blockFields(block, page)
      ]));
    });

    var add = select([['', '+ Add block…']].concat(BLOCK_TYPES), '', function (type) {
      if (!type) return;
      var block = { id: uid('b_'), type: type };
      if (type === 'buttons' || type === 'devices') { block.columns = 3; block.items = []; }
      if (type === 'room') { block.columns = 2; block.zoneId = '*'; }
      if (type === 'heading') block.text = 'Heading';
      if (type === 'spacer') block.height = 24;
      if (type === 'link') block.label = 'Next page';
      page.blocks.push(block);
      markDirty();
      render();
    });
    panel.appendChild(add);
    return panel;
  }

  function render() {
    root.replaceChildren(renderDashboards(), renderPages(), renderBlocks());
  }

  // ---- load / save ----

  saveButton.addEventListener('click', async function () {
    saveButton.disabled = true;
    setStatus('Saving…');
    try {
      await api('POST', '/dashboards', data.dashboards);
      dirty = false;
      setStatus('Saved');
    } catch (error) {
      saveButton.disabled = false;
      setStatus('Save failed: ' + error.message, true);
    }
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
      root.replaceChildren(h('p', { class: 'hint error', text: 'Could not load: ' + error.message }));
      return;
    }
    sel.dashboardId = data.dashboards.length ? data.dashboards[0].id : null;
    ensurePage();
    render();
  }

  load();
})();
