// Music on the dashboard: the `music` block (album art, track, transport,
// volume per room and for all linked rooms, room picker) and the speaker
// popup, which replaces the widget's volume popup. Both share one player.
(function () {
  'use strict';

  var TEXT = {
    sv: { music: 'Musik', subtitle: 'Sonos i huset', allRooms: 'Alla rum', playingIn: function (n) { return n === 1 ? 'Spelar i 1 rum' : 'Spelar i ' + n + ' rum'; },
      nothing: 'Inget spelas', paused: 'Pausad', volume: 'Volym', linked: 'Alla kopplade', close: 'Stäng', noSpeakers: 'Inga högtalare hittades.',
      failed: 'Gick inte: ', unavailable: 'Högtalaren svarar inte' },
    en: { music: 'Music', subtitle: 'Sonos at home', allRooms: 'All rooms', playingIn: function (n) { return n === 1 ? 'Playing in 1 room' : 'Playing in ' + n + ' rooms'; },
      nothing: 'Nothing playing', paused: 'Paused', volume: 'Volume', linked: 'All linked', close: 'Close', noSpeakers: 'No speakers found.',
      failed: 'Failed: ', unavailable: 'Speaker is unavailable' }
  };

  function lang() {
    var chosen = window.__spLanguage;
    if (chosen === 'sv' || chosen === 'en') return chosen;
    return /^(sv|nb|no|da)/i.test(navigator.language || '') ? 'sv' : 'en';
  }

  var LIVE_CAPS = ['speaker_playing', 'speaker_track', 'speaker_artist', 'speaker_album', 'speaker_duration',
    'speaker_position', 'volume_set', 'volume_mute', 'speaker_shuffle', 'speaker_repeat', 'sonos_group'];
  var FIELD = {
    speaker_playing: 'playing', speaker_track: 'track', speaker_artist: 'artist', speaker_album: 'album',
    speaker_duration: 'duration', speaker_position: 'position', volume_set: 'volume', volume_mute: 'mute',
    speaker_shuffle: 'shuffle', speaker_repeat: 'repeat', sonos_group: 'group'
  };

  var ZONE_WORDS = [[/vardag|living/i, 'weekend'], [/kök|kitchen/i, 'restaurant'], [/tv|bio|cinema/i, 'tv'],
    [/sov|bed/i, 'bed'], [/bad|bath/i, 'bathtub'], [/kontor|office/i, 'desk'], [/ute|garden|terass|altan/i, 'deck']];
  function roomSymbol(name) {
    for (var i = 0; i < ZONE_WORDS.length; i++) if (ZONE_WORDS[i][0].test(name || '')) return ZONE_WORDS[i][1];
    return 'speaker';
  }

  function h(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function symbol(name, className) { return h('span', 'material-symbols-outlined' + (className ? ' ' + className : ''), name); }
  function button(className, icon, label) {
    var b = h('button', className);
    b.type = 'button';
    if (icon) b.appendChild(symbol(icon));
    if (label) b.setAttribute('aria-label', label);
    return b;
  }

  async function api(method, path, body) {
    var options = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    var response = await fetch('/api' + path, options);
    if (response.status === 401) { location.href = '/login'; throw new Error('PIN required'); }
    var data = await response.json();
    if (!response.ok) throw new Error((data && data.error) || ('HTTP ' + response.status));
    return data;
  }

  function clock(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return '';
    // Some apps report milliseconds.
    if (seconds > 36000) seconds = seconds / 1000;
    var s = Math.floor(seconds % 60);
    return Math.floor(seconds / 60) + ':' + (s < 10 ? '0' : '') + s;
  }

  // ---- live updates (one listener, many players) ----

  var players = [];
  var listening = false;
  function listen() {
    if (listening || !window.Homey || !window.Homey.on) return;
    listening = true;
    window.Homey.on('widget:' + window.Homey.clientId + ':deviceUpdate', function (data) {
      if (!data || !FIELD[data.capability]) return;
      players = players.filter(function (p) { return p.alive(); });
      players.forEach(function (p) { p.update(data.deviceId, data.capability, data.value); });
    });
  }

  function subscribe(speakers) {
    if (!window.Homey || !window.Homey.api || !speakers.length) return;
    var devices = [];
    speakers.forEach(function (s) { LIVE_CAPS.forEach(function (cap) { devices.push({ deviceId: s.id, capability: cap }); }); });
    window.Homey.api('POST', '/subscribeToDevices', { widgetId: window.Homey.clientId, devices: devices })
      .catch(function (error) { console.error('Music live updates unavailable', error); });
  }

  // ---- the player ----
  // opts: { speakers, focus (id or 'all'), compact, showRooms, root, onClose }

  function createPlayer(root, speakers, opts) {
    var T = TEXT[lang()];
    var byId = {};
    speakers.forEach(function (s) { byId[s.id] = s; s.receivedAt = Date.now(); });
    // The remembered room, unless it is silent while another room plays.
    var focus = opts.focus || null;
    var playingFirst = speakers.filter(function (s) { return s.playing; })[0];
    var silent = focus && focus !== 'all' && byId[focus] && !byId[focus].playing && playingFirst && !opts.compact;
    if (!focus || silent || (focus !== 'all' && !byId[focus])) {
      focus = (playingFirst || speakers[0] || {}).id || null;
    }

    function lead() {
      if (focus !== 'all') return byId[focus];
      return speakers.filter(function (s) { return s.playing; })[0] || speakers[0];
    }
    function targets() { return focus === 'all' ? speakers : [byId[focus]]; }
    // Rooms that play together with the focused one: same Sonos group, else
    // every room that is playing right now.
    function linked() {
      var s = lead();
      if (!s) return [];
      if (focus === 'all') return speakers;
      var group = s.group ? speakers.filter(function (o) { return o.group && o.group === s.group; }) : [];
      if (group.length > 1) return group;
      var playingNow = speakers.filter(function (o) { return o.playing; });
      return playingNow.length > 1 && s.playing ? playingNow : [s];
    }

    var status = h('div', 'mx-status');
    status.hidden = true;
    function fail(error) { status.textContent = T.failed + error.message; status.hidden = false; }
    function set(speaker, capability, value) {
      if (FIELD[capability]) speaker[FIELD[capability]] = value;
      status.hidden = true;
      return api('POST', '/speaker', { deviceId: speaker.id, capability: capability, value: value }).catch(fail);
    }

    root.classList.add('mx-player');
    if (opts.compact) root.classList.add('mx-compact');

    // art
    var art = h('div', 'mx-art');
    var artImg = h('img');
    artImg.alt = '';
    var artFallback = symbol('music_note', 'mx-art-fallback');
    art.appendChild(artFallback);
    art.appendChild(artImg);
    var artKey = null;
    artImg.addEventListener('load', function () { art.classList.add('has-art'); });
    artImg.addEventListener('error', function () { art.classList.remove('has-art'); });

    // main
    var main = h('div', 'mx-main');
    var titles = h('div', 'mx-titles');
    var title = h('div', 'mx-title');
    var artist = h('div', 'mx-artist');
    titles.appendChild(title); titles.appendChild(artist);
    var brand = h('div', 'mx-brand', 'SONOS');
    var top = h('div', 'mx-top');
    top.appendChild(titles); top.appendChild(brand);
    main.appendChild(top);

    var progress = h('div', 'mx-progress');
    var bar = h('div', 'mx-bar');
    var barFill = h('div', 'mx-bar-fill');
    bar.appendChild(barFill);
    var times = h('div', 'mx-times');
    var tNow = h('span'); var tEnd = h('span');
    times.appendChild(tNow); times.appendChild(tEnd);
    progress.appendChild(bar); progress.appendChild(times);
    main.appendChild(progress);

    var transport = h('div', 'mx-transport');
    var bShuffle = button('mx-btn mx-small', 'shuffle', 'Shuffle');
    var bPrev = button('mx-btn', 'skip_previous', 'Previous');
    var bPlay = button('mx-btn mx-play', 'play_arrow', 'Play');
    var bNext = button('mx-btn', 'skip_next', 'Next');
    var bRepeat = button('mx-btn mx-small', 'repeat', 'Repeat');
    [bShuffle, bPrev, bPlay, bNext, bRepeat].forEach(function (b) { transport.appendChild(b); });
    main.appendChild(transport);

    function volumeRow(labelText) {
      var row = h('div', 'mx-volume');
      var mute = button('mx-btn mx-icon', 'volume_down', 'Mute');
      var label = h('span', 'mx-vol-label', labelText);
      var slider = h('input', 'mx-range');
      slider.type = 'range'; slider.min = 0; slider.max = 100; slider.step = 1;
      slider.dragging = false;
      var pct = h('span', 'mx-vol-pct');
      slider.addEventListener('pointerdown', function () { slider.dragging = true; });
      slider.addEventListener('input', function () { slider.style.setProperty('--fill', slider.value + '%'); pct.textContent = slider.value + ' %'; });
      row.appendChild(mute); row.appendChild(label); row.appendChild(slider); row.appendChild(pct);
      return { row: row, mute: mute, slider: slider, pct: pct, label: label };
    }
    var vol = volumeRow(T.volume);
    var volAll = volumeRow(T.linked);
    main.appendChild(vol.row);
    main.appendChild(volAll.row);
    main.appendChild(status);

    // rooms
    var rooms = h('div', 'mx-rooms');
    var roomsHead = h('div', 'mx-rooms-head');
    roomsHead.appendChild(symbol('speaker_group'));
    var roomsText = h('div');
    var roomsTitle = h('div', 'mx-rooms-title');
    var roomsSub = h('div', 'mx-rooms-sub');
    roomsText.appendChild(roomsTitle); roomsText.appendChild(roomsSub);
    roomsHead.appendChild(roomsText);
    rooms.appendChild(roomsHead);
    var chips = h('div', 'mx-chips');
    rooms.appendChild(chips);
    var chipEls = {};
    function chip(id, name, icon) {
      var c = button('mx-chip', null, name);
      c.appendChild(symbol(icon));
      c.appendChild(h('span', 'mx-chip-name', name));
      c.appendChild(h('span', 'mx-eq'));
      c.addEventListener('click', function () { focus = id; if (opts.onFocus) opts.onFocus(id); paint(); });
      chips.appendChild(c);
      chipEls[id] = c;
    }
    if (opts.showRooms !== false && speakers.length > 1) {
      chip('all', T.allRooms, 'layers');
      speakers.forEach(function (s) { chip(s.id, s.zoneName && s.zoneName !== s.name ? s.name : s.name, roomSymbol(s.zoneName || s.name)); });
    }

    root.appendChild(art);
    root.appendChild(main);
    if (opts.showRooms !== false && speakers.length > 1) root.appendChild(rooms);
    else root.classList.add('mx-no-rooms');

    // actions
    bPlay.addEventListener('click', function () {
      var s = lead();
      if (!s) return;
      var next = !s.playing;
      (focus === 'all' ? speakers.filter(function (o) { return o.playing !== next; }) : [s]).forEach(function (o) { set(o, 'speaker_playing', next); o.receivedAt = Date.now(); });
      paint();
    });
    bNext.addEventListener('click', function () { var s = lead(); if (s) set(s, 'speaker_next', true); });
    bPrev.addEventListener('click', function () { var s = lead(); if (s) set(s, 'speaker_prev', true); });
    bShuffle.addEventListener('click', function () { var s = lead(); if (s && s.shuffle !== null) { set(s, 'speaker_shuffle', !s.shuffle); paint(); } });
    bRepeat.addEventListener('click', function () {
      var s = lead();
      if (!s || s.repeat === null) return;
      var order = ['none', 'playlist', 'track'];
      set(s, 'speaker_repeat', order[(order.indexOf(s.repeat) + 1) % order.length]);
      paint();
    });
    vol.slider.addEventListener('change', function () {
      vol.slider.dragging = false;
      var value = Number(vol.slider.value) / 100;
      targets().forEach(function (s) { set(s, 'volume_set', value); });
      paint();
    });
    vol.mute.addEventListener('click', function () {
      var list = targets();
      var mute = !list.every(function (s) { return s.mute; });
      list.forEach(function (s) { set(s, 'volume_mute', mute); });
      paint();
    });
    // All linked rooms move together, keeping their balance (like Sonos group volume).
    volAll.slider.addEventListener('change', function () {
      volAll.slider.dragging = false;
      var list = linked();
      var avg = list.reduce(function (sum, s) { return sum + (s.volume || 0); }, 0) / (list.length || 1);
      var target = Number(volAll.slider.value) / 100;
      list.forEach(function (s) {
        var value = avg > 0 ? (s.volume || 0) * target / avg : target;
        set(s, 'volume_set', Math.max(0, Math.min(1, Math.round(value * 100) / 100)));
      });
      paint();
    });
    volAll.mute.addEventListener('click', function () {
      var list = linked();
      var mute = !list.every(function (s) { return s.mute; });
      list.forEach(function (s) { set(s, 'volume_mute', mute); });
      paint();
    });

    function position(s) {
      if (typeof s.position !== 'number') return null;
      var extra = s.playing ? (Date.now() - s.receivedAt) / 1000 : 0;
      var p = s.position + extra;
      return typeof s.duration === 'number' && s.duration > 0 ? Math.min(p, s.duration) : p;
    }

    function paintVolume(v, list) {
      var avg = list.reduce(function (sum, s) { return sum + (s.volume || 0); }, 0) / (list.length || 1);
      var muted = list.length > 0 && list.every(function (s) { return s.mute; });
      if (!v.slider.dragging) {
        v.slider.value = Math.round(avg * 100);
        v.slider.style.setProperty('--fill', v.slider.value + '%');
        v.pct.textContent = v.slider.value + ' %';
      }
      v.mute.firstChild.textContent = muted ? 'volume_off' : (avg > 0.5 ? 'volume_up' : 'volume_down');
      v.row.classList.toggle('muted', muted);
    }

    function paintProgress() {
      var s = lead();
      if (!s) return;
      var p = position(s);
      var d = typeof s.duration === 'number' && s.duration > 0 ? s.duration : null;
      progress.classList.toggle('hidden', p === null || !d);
      if (p === null || !d) return;
      barFill.style.width = Math.min(100, p / d * 100) + '%';
      tNow.textContent = clock(p);
      tEnd.textContent = clock(d);
    }

    function paint() {
      var s = lead();
      root.classList.toggle('mx-empty', !s);
      if (!s) { title.textContent = T.noSpeakers; return; }
      var hasTrack = !!(s.track || s.artist);
      title.textContent = hasTrack ? (s.track || '') : T.nothing;
      artist.textContent = hasTrack ? [s.artist, s.album].filter(Boolean).join(' · ') : (opts.compact ? s.zoneName || '' : s.name);
      brand.hidden = !s.sonos;
      root.classList.toggle('is-playing', !!s.playing);
      bPlay.firstChild.textContent = s.playing ? 'pause' : 'play_arrow';
      bShuffle.hidden = s.shuffle === null; bRepeat.hidden = s.repeat === null;
      bShuffle.classList.toggle('on', !!s.shuffle);
      bRepeat.classList.toggle('on', s.repeat && s.repeat !== 'none');
      bRepeat.firstChild.textContent = s.repeat === 'track' ? 'repeat_one' : 'repeat';
      bNext.disabled = !s.hasNext; bPrev.disabled = !s.hasPrev;

      var key = s.id + '|' + (s.art || '') + '|' + (s.track || '');
      if (key !== artKey) {
        artKey = key;
        art.classList.remove('has-art');
        if (s.art) artImg.src = '/albumart/' + encodeURIComponent(s.id) + '?v=' + encodeURIComponent(s.art + (s.track || ''));
        else artImg.removeAttribute('src');
      }

      vol.label.textContent = focus === 'all' ? T.allRooms : (opts.compact ? T.volume : s.name);
      paintVolume(vol, targets());
      var link = linked();
      volAll.row.hidden = focus === 'all' || link.length < 2;
      if (!volAll.row.hidden) paintVolume(volAll, link);

      var playingRooms = speakers.filter(function (o) { return o.playing; });
      roomsTitle.textContent = playingRooms.length ? T.playingIn(playingRooms.length) : T.paused;
      roomsSub.textContent = playingRooms.map(function (o) { return o.name; }).join(' · ');
      Object.keys(chipEls).forEach(function (id) {
        chipEls[id].classList.toggle('active', id === focus);
        chipEls[id].classList.toggle('playing', id !== 'all' && !!byId[id].playing);
      });
      status.hidden = status.hidden || false;
      paintProgress();
    }

    var timer = setInterval(function () { if (!root.isConnected) { clearInterval(timer); return; } paintProgress(); }, 1000);

    var player = {
      alive: function () { return root.isConnected; },
      update: function (deviceId, capability, value) {
        var s = byId[deviceId];
        if (!s) return;
        s[FIELD[capability]] = value;
        if (capability === 'speaker_position' || capability === 'speaker_playing') s.receivedAt = Date.now();
        paint();
      }
    };
    players.push(player);
    listen();
    subscribe(speakers);
    paint();
    return player;
  }

  // ---- the `music` block: a summary card that opens a sheet ----

  function pickLead(speakers, focusId) {
    var byId = {};
    speakers.forEach(function (s) { byId[s.id] = s; });
    var playing = speakers.filter(function (s) { return s.playing; });
    if (focusId && focusId !== 'all' && byId[focusId] && (byId[focusId].playing || !playing.length)) return byId[focusId];
    return playing[0] || byId[focusId] || speakers[0] || null;
  }

  function block(blockConfig, ctx) {
    var T = TEXT[lang()];
    var key = 'spMusicFocus:' + blockConfig.id;
    function savedFocus() { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function saveFocus(id) { try { localStorage.setItem(key, id); } catch (e) { /* not remembered */ } }

    var card = ctx.el('div', 'card lighting-card music-summary');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    var thumb = h('div', 'mx-art mx-thumb');
    var thumbImg = h('img');
    thumbImg.alt = '';
    thumb.appendChild(symbol('music_note', 'mx-art-fallback'));
    thumb.appendChild(thumbImg);
    thumbImg.addEventListener('load', function () { thumb.classList.add('has-art'); });
    thumbImg.addEventListener('error', function () { thumb.classList.remove('has-art'); });
    var text = ctx.el('div', 'lighting-text');
    var title = ctx.el('div', 'lighting-title', blockConfig.title || T.music);
    var line = ctx.el('div', 'lighting-count music-line', '…');
    text.appendChild(title); text.appendChild(line);
    var play = button('mx-btn mx-play mx-play-mini', 'play_arrow', 'Play');
    card.appendChild(thumb);
    card.appendChild(text);
    card.appendChild(play);
    card.appendChild(ctx.symbol('chevron_right', 'lighting-chevron'));

    var speakers = null;
    var artKey = null;
    function paint() {
      var s = speakers && pickLead(speakers, savedFocus());
      if (!s) return;
      var playingRooms = speakers.filter(function (o) { return o.playing; });
      var hasTrack = !!(s.track || s.artist);
      line.textContent = playingRooms.length && hasTrack
        ? [s.track, s.artist].filter(Boolean).join(' · ') + (playingRooms.length > 1 ? '  ·  ' + T.playingIn(playingRooms.length) : '')
        : (playingRooms.length ? T.playingIn(playingRooms.length) : T.nothing);
      card.classList.toggle('any-on', playingRooms.length > 0);
      play.firstChild.textContent = s.playing ? 'pause' : 'play_arrow';
      var k = s.id + '|' + (s.art || '') + '|' + (s.track || '');
      if (k !== artKey) {
        artKey = k;
        thumb.classList.remove('has-art');
        if (s.art && hasTrack) thumbImg.src = '/albumart/' + encodeURIComponent(s.id) + '?v=' + encodeURIComponent(s.art + (s.track || ''));
        else thumbImg.removeAttribute('src');
      }
    }

    api('POST', '/speakers', { deviceIds: blockConfig.deviceIds || [] }).then(function (data) {
      speakers = data.speakers;
      if (!speakers.length) { line.textContent = T.noSpeakers; play.hidden = true; return; }
      speakers.forEach(function (s) { s.receivedAt = Date.now(); });
      players.push({
        alive: function () { return card.isConnected; },
        update: function (deviceId, capability, value) {
          var s = speakers.filter(function (o) { return o.id === deviceId; })[0];
          if (!s) return;
          s[FIELD[capability]] = value;
          if (capability === 'speaker_position' || capability === 'speaker_playing') s.receivedAt = Date.now();
          paint();
        }
      });
      listen();
      subscribe(speakers);
      paint();
    }).catch(function (error) {
      card.classList.add('failed');
      line.textContent = 'Music unavailable: ' + error.message;
    });

    play.addEventListener('click', function (e) {
      e.stopPropagation();
      var s = speakers && pickLead(speakers, savedFocus());
      if (!s) return;
      var next = !s.playing;
      s.playing = next;
      s.receivedAt = Date.now();
      paint();
      api('POST', '/speaker', { deviceId: s.id, capability: 'speaker_playing', value: next }).catch(function (error) {
        line.textContent = T.failed + error.message;
      });
    });

    // Built once and kept hidden between opens; the player stays live.
    var kept = null;
    function openSheet() {
      if (!speakers || !speakers.length) return;
      if (kept) { kept.open(); return; }
      var backdrop = h('div', 'sheet-backdrop sp-kept-sheet');
      var sheet = h('div', 'sheet music-sheet');
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.appendChild(h('div', 'sheet-handle'));
      var head = h('div', 'sheet-head');
      head.appendChild(symbol('graphic_eq', 'sheet-icon'));
      var h2 = h('h2', null, blockConfig.title || T.music);
      h2.appendChild(h('span', 'music-sub', '  ' + (blockConfig.subtitle || T.subtitle)));
      head.appendChild(h2);
      var closeBtn = button('sheet-close', 'close', T.close);
      head.appendChild(closeBtn);
      sheet.appendChild(head);
      var body = h('div', 'music-body');
      sheet.appendChild(body);
      backdrop.appendChild(sheet);

      function close() {
        backdrop.classList.remove('open');
        setTimeout(function () { if (!backdrop.classList.contains('open')) backdrop.style.display = 'none'; }, 220);
        document.removeEventListener('keydown', onKey);
        paint();
      }
      function open() {
        backdrop.style.display = '';
        sheet.style.transform = '';
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(function () { requestAnimationFrame(function () { backdrop.classList.add('open'); }); });
      }
      kept = { open: open };
      function onKey(e) { if (e.key === 'Escape') close(); }
      closeBtn.addEventListener('click', close);
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
      if (window.SpaceySheet) window.SpaceySheet.swipeToClose(sheet, close);

      createPlayer(body, speakers, { focus: savedFocus(), onFocus: function (id) { saveFocus(id); paint(); } });
      document.body.appendChild(backdrop);
      open();
    }
    card.addEventListener('click', openSheet);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(); } });
    return card;
  }

  // ---- the speaker popup ----

  var openPopup = null;
  function closePopup() {
    if (!openPopup) return;
    var overlay = openPopup;
    openPopup = null;
    overlay.classList.remove('open');
    setTimeout(function () { overlay.remove(); }, 180);
  }

  function popup(deviceId) {
    closePopup();
    var T = TEXT[lang()];
    var overlay = h('div', 'sp-pop-overlay');
    var card = h('div', 'sp-pop mx-pop');
    overlay.appendChild(card);
    var close = button('sp-pop-close', 'close', T.close);
    card.appendChild(close);
    var body = h('div', 'mx-pop-body');
    card.appendChild(body);
    close.addEventListener('click', closePopup);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePopup(); });
    document.body.appendChild(overlay);
    openPopup = overlay;
    requestAnimationFrame(function () { overlay.classList.add('open'); });

    // All speakers, so "all linked" can find the rooms playing together.
    api('POST', '/speakers', {}).then(function (data) {
      var speakers = data.speakers.filter(function (s) { return s.id === deviceId; })
        .concat(data.speakers.filter(function (s) { return s.id !== deviceId; }));
      if (!speakers.length || speakers[0].id !== deviceId) {
        body.appendChild(h('p', 'sp-pop-status', T.noSpeakers));
        return;
      }
      var head = h('div', 'mx-pop-head');
      head.appendChild(symbol(roomSymbol(speakers[0].zoneName || speakers[0].name)));
      head.appendChild(h('span', null, speakers[0].name));
      card.insertBefore(head, body);
      createPlayer(body, speakers, { focus: deviceId, compact: true, showRooms: false });
    }).catch(function (error) {
      body.appendChild(h('p', 'sp-pop-status', error.message));
    });
  }

  window.SpaceyMusic = { block: block };
  window.SpaceyMusicPopup = { open: popup, close: closePopup };
})();
