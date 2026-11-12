// Camera block for the External Dashboard: a card with one tile per camera,
// tap a tile for a large view in a sheet. Data from lib/Cameras.js.
// - Live: cameras with a WebRTC video (Google Nest) stream in the sheet.
// - Snapshots: cameras with local RTSP video (Reolink) are polled, since
//   their snapshot is taken on request; other cameras (Verisure) are only
//   refetched when Homey reports a newer picture, to spare their cloud APIs.
(function () {
  'use strict';

  var TEXT = {
    sv: { cameras: 'Kameror', live: 'LIVE', tapLive: 'Tryck för live', noImage: 'Ingen bild', failed: 'Kunde inte hämta bild',
      connecting: 'Ansluter…', liveNow: 'Live', liveFailed: 'Livebild gick inte: ', ended: 'Strömmen avslutades',
      updated: 'Uppdaterad ', close: 'Stäng', sound: 'Ljud', none: 'Inga kameror hittades.', ago: function (m) { return m < 1 ? 'nyss' : m < 60 ? 'för ' + m + ' min sedan' : m < 1440 ? 'för ' + Math.floor(m / 60) + ' h sedan' : null; } },
    en: { cameras: 'Cameras', live: 'LIVE', tapLive: 'Tap for live', noImage: 'No picture', failed: 'Could not load picture',
      connecting: 'Connecting…', liveNow: 'Live', liveFailed: 'Live view failed: ', ended: 'Stream ended',
      updated: 'Updated ', close: 'Close', sound: 'Sound', none: 'No cameras found.', ago: function (m) { return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : null; } }
  };

  var POLL_TILE_MS = 10000;
  var POLL_SHEET_MS = 2000;
  var CHECK_MS = 30000;
  var KEEPALIVE_MS = 120000;

  function lang() {
    var chosen = window.__spLanguage;
    if (chosen === 'sv' || chosen === 'en') return chosen;
    return /^(sv|nb|no|da)/i.test(navigator.language || '') ? 'sv' : 'en';
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
  function clock(date) {
    return date.toLocaleTimeString(lang() === 'sv' ? 'sv-SE' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function polled(cam) { return cam.snapshot && cam.rtsp; }

  // Loads a snapshot into img without flashing: the new picture replaces the
  // old one only once it has loaded. Calls done(ok, status).
  function loadSnapshot(cam, img, done) {
    var next = new Image();
    var url = '/camerasnap/' + encodeURIComponent(cam.id) + '?t=' + Date.now();
    fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (response.status === 204) return done(false, 'none');
      if (!response.ok) return done(false, 'error');
      return response.blob().then(function (blob) {
        var objectUrl = URL.createObjectURL(blob);
        next.onload = function () {
          var old = img.getAttribute('data-object-url');
          img.src = objectUrl;
          img.setAttribute('data-object-url', objectUrl);
          if (old) URL.revokeObjectURL(old);
          done(true);
        };
        next.onerror = function () { URL.revokeObjectURL(objectUrl); done(false, 'error'); };
        next.src = objectUrl;
      });
    }).catch(function () { done(false, 'error'); });
  }

  // ---- live view (WebRTC through Homey) ----

  function startLive(cam, video, onState) {
    var pc = new RTCPeerConnection();
    var keepAlive = null;
    var stopped = false;
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addTransceiver('video', { direction: 'recvonly' });
    if (cam.live.dataChannel) pc.createDataChannel('dataSendChannel');
    pc.ontrack = function (e) {
      if (e.track.kind !== 'video' && video.srcObject) return;
      video.srcObject = e.streams[0] || new MediaStream([e.track]);
    };
    pc.onconnectionstatechange = function () {
      if (stopped) return;
      if (pc.connectionState === 'connected') onState('live');
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') onState('ended');
    };
    onState('connecting');
    pc.createOffer().then(function (offer) {
      return pc.setLocalDescription(offer).then(function () {
        return api('POST', '/cameraOffer', { deviceId: cam.id, videoId: cam.live.videoId, offer: offer.sdp });
      });
    }).then(function (answer) {
      if (stopped) return;
      if (!answer || !answer.answerSdp) throw new Error('no answer from Homey');
      return pc.setRemoteDescription({ type: 'answer', sdp: answer.answerSdp }).then(function () {
        if (!answer.streamId) return;
        keepAlive = setInterval(function () {
          api('POST', '/cameraKeepAlive', { deviceId: cam.id, videoId: cam.live.videoId, streamId: answer.streamId })
            .catch(function (error) { onState('error', error.message); });
        }, KEEPALIVE_MS);
      });
    }).catch(function (error) {
      if (!stopped) onState('error', error.message);
    });
    return function stop() {
      stopped = true;
      if (keepAlive) clearInterval(keepAlive);
      try { pc.close(); } catch (e) { /* already closed */ }
      video.srcObject = null;
    };
  }

  // ---- the sheet: one large camera, chips to switch ----

  function openSheet(cams, startId, title) {
    var T = TEXT[lang()];
    var backdrop = h('div', 'sheet-backdrop');
    var sheet = h('div', 'sheet cam-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.appendChild(h('div', 'sheet-handle'));
    var head = h('div', 'sheet-head');
    head.appendChild(symbol('videocam', 'sheet-icon'));
    var h2 = h('h2', null, '');
    head.appendChild(h2);
    var closeBtn = button('sheet-close', 'close', T.close);
    head.appendChild(closeBtn);
    sheet.appendChild(head);

    var view = h('div', 'cam-view');
    var img = h('img', 'cam-view-img'); img.alt = '';
    var video = h('video', 'cam-view-video');
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.setAttribute('playsinline', '');
    var fallback = symbol('videocam_off', 'cam-fallback');
    var status = h('div', 'cam-status');
    var sound = button('cam-sound', 'volume_off', T.sound);
    view.appendChild(fallback); view.appendChild(img); view.appendChild(video); view.appendChild(status); view.appendChild(sound);
    sheet.appendChild(view);

    var chips = h('div', 'cam-chips');
    if (cams.length > 1) sheet.appendChild(chips);
    backdrop.appendChild(sheet);

    var current = null;
    var stopLive = null;
    var timer = null;
    var shownUpdated = null;

    function stopAll() {
      if (stopLive) { stopLive(); stopLive = null; }
      if (timer) { clearInterval(timer); timer = null; }
    }

    function refresh() {
      if (!current || document.hidden) return;
      loadSnapshot(current, img, function (ok, why) {
        view.classList.toggle('has-image', ok || view.classList.contains('has-image'));
        status.textContent = ok ? T.updated + clock(new Date()) : (why === 'none' ? T.noImage : T.failed);
        status.classList.toggle('error', !ok && why === 'error');
      });
    }

    function show(cam) {
      stopAll();
      current = cam;
      h2.textContent = cam.name;
      view.className = 'cam-view' + (cam.live ? ' is-live' : '');
      img.removeAttribute('src');
      status.textContent = '';
      status.classList.remove('error');
      Array.prototype.forEach.call(chips.children, function (c) { c.classList.toggle('active', c.getAttribute('data-id') === cam.id); });
      if (cam.live) {
        sound.hidden = false;
        video.muted = true;
        sound.firstChild.textContent = 'volume_off';
        stopLive = startLive(cam, video, function (state, message) {
          view.classList.toggle('playing', state === 'live');
          status.classList.toggle('error', state === 'error' || state === 'ended');
          status.textContent = state === 'connecting' ? T.connecting : state === 'live' ? T.liveNow
            : state === 'ended' ? T.ended : T.liveFailed + message;
        });
      } else {
        sound.hidden = true;
        if (cam.snapshot) {
          shownUpdated = cam.snapshotUpdated;
          refresh();
          timer = setInterval(polled(cam) ? refresh : function () {
            // Fetch again only when Homey reports a newer picture.
            api('POST', '/cameras', { deviceIds: [cam.id] }).then(function (list) {
              var fresh = list[0];
              if (fresh && fresh.snapshotUpdated && fresh.snapshotUpdated !== shownUpdated) {
                shownUpdated = fresh.snapshotUpdated;
                refresh();
              }
            }).catch(function () { /* shown picture stays */ });
          }, polled(cam) ? POLL_SHEET_MS : CHECK_MS);
        } else {
          status.textContent = T.noImage;
        }
      }
    }

    cams.forEach(function (cam) {
      var chip = button('mx-chip', cam.live ? 'videocam' : (cam.class === 'doorbell' ? 'doorbell' : 'photo_camera'));
      chip.appendChild(h('span', null, cam.name));
      chip.setAttribute('data-id', cam.id);
      chip.addEventListener('click', function () { show(cam); });
      chips.appendChild(chip);
    });

    sound.addEventListener('click', function () {
      video.muted = !video.muted;
      sound.firstChild.textContent = video.muted ? 'volume_off' : 'volume_up';
      if (!video.muted) video.play().catch(function () { /* stays muted */ });
    });

    function close() {
      stopAll();
      backdrop.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      setTimeout(function () {
        var old = img.getAttribute('data-object-url');
        if (old) URL.revokeObjectURL(old);
        backdrop.remove();
      }, 220);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    // A live stream is closed when the panel hides and restarted when it shows.
    function onVisibility() {
      if (!current || !current.live) return;
      if (document.hidden) stopAll(); else show(current);
    }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    if (window.SpaceySheet) window.SpaceySheet.swipeToClose(sheet, close);

    document.body.appendChild(backdrop);
    show(cams.filter(function (c) { return c.id === startId; })[0] || cams[0]);
    requestAnimationFrame(function () { requestAnimationFrame(function () { backdrop.classList.add('open'); }); });
  }

  // ---- the `camera` block ----

  function block(blockConfig, ctx) {
    var T = TEXT[lang()];
    var title = blockConfig.title || T.cameras;
    var card = ctx.el('div', 'card camera-card');
    var head = ctx.el('div', 'card-head');
    head.appendChild(ctx.symbol('videocam'));
    head.appendChild(ctx.el('span', null, title));
    card.appendChild(head);
    var grid = h('div', 'cam-grid');
    card.appendChild(grid);
    var visible = function () { return card.isConnected && card.offsetParent !== null && !document.hidden; };

    api('POST', '/cameras', { deviceIds: blockConfig.deviceIds || [] }).then(function (cams) {
      if (!cams.length) { grid.appendChild(h('p', 'hint', T.none)); return; }
      var tiles = cams.map(function (cam) {
        var tile = h('button', 'cam-tile' + (cam.live ? ' is-live' : ''));
        tile.type = 'button';
        var img = h('img'); img.alt = '';
        tile.appendChild(symbol(cam.class === 'doorbell' ? 'doorbell' : 'videocam', 'cam-fallback'));
        tile.appendChild(img);
        var caption = h('div', 'cam-caption');
        caption.appendChild(h('span', 'cam-name', cam.name));
        var meta = h('span', 'cam-meta', cam.live && !cam.snapshot ? T.tapLive : '');
        caption.appendChild(meta);
        tile.appendChild(caption);
        if (cam.live) tile.appendChild(h('span', 'cam-live-badge', T.live));
        if (!cam.available) tile.classList.add('unavailable');
        tile.addEventListener('click', function () { openSheet(cams, cam.id, title); });
        grid.appendChild(tile);
        return { cam: cam, tile: tile, img: img, meta: meta, shown: null };
      });

      function load(t) {
        loadSnapshot(t.cam, t.img, function (ok, why) {
          if (ok) t.tile.classList.add('has-image');
          if (!ok && why === 'error') { t.tile.classList.add('failed'); t.meta.textContent = T.failed; }
          else t.tile.classList.remove('failed');
          paintMeta(t);
        });
      }
      function paintMeta(t) {
        if (!t.cam.snapshot || t.tile.classList.contains('failed')) return;
        if (polled(t.cam)) { t.meta.textContent = clock(new Date()).slice(0, 5); return; }
        if (!t.cam.snapshotUpdated) return;
        var when = new Date(t.cam.snapshotUpdated);
        t.meta.textContent = T.ago(Math.floor((Date.now() - when.getTime()) / 60000)) ||
          when.toLocaleDateString(lang() === 'sv' ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'short' });
      }

      tiles.forEach(function (t) {
        if (t.cam.snapshot) { t.shown = t.cam.snapshotUpdated; load(t); }
      });
      ctx.every(POLL_TILE_MS, function () {
        if (!visible()) return;
        tiles.forEach(function (t) { if (polled(t.cam)) load(t); });
      });
      ctx.every(CHECK_MS, function () {
        if (!visible()) return;
        var watched = tiles.filter(function (t) { return t.cam.snapshot && !polled(t.cam); });
        if (!watched.length) return;
        api('POST', '/cameras', { deviceIds: watched.map(function (t) { return t.cam.id; }) }).then(function (list) {
          list.forEach(function (fresh) {
            var t = watched.filter(function (w) { return w.cam.id === fresh.id; })[0];
            if (!t) return;
            t.cam.snapshotUpdated = fresh.snapshotUpdated;
            if (fresh.snapshotUpdated !== t.shown) { t.shown = fresh.snapshotUpdated; load(t); } else paintMeta(t);
          });
        }).catch(function () { /* tiles keep their picture */ });
      });
    }).catch(function (error) {
      card.classList.add('failed');
      grid.appendChild(h('p', 'hint error', 'Cameras unavailable: ' + error.message));
    });
    return card;
  }

  // A camera marker on a floor plan: the sheet for that one camera.
  function openDevice(deviceId) {
    api('POST', '/cameras', { deviceIds: [deviceId] }).then(function (cams) {
      if (!cams.length) throw new Error('camera not found');
      openSheet(cams, deviceId, cams[0].name);
    }).catch(function (error) {
      var note = h('div', 'cam-error-note', TEXT[lang()].failed + ': ' + error.message);
      document.body.appendChild(note);
      setTimeout(function () { note.remove(); }, 5000);
    });
  }

  window.SpaceyCameras = { block: block, openDevice: openDevice };
})();
