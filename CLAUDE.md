# Spacey Plan — project notes

## Who and how
- Plan: `~/development/athom/compare/EXTERNAL-DASHBOARD-PLAN.md` (stages 0-10, decisions).
- Work on branch `dashboard`; commit and push after each change (private repo).
- Homey widget must keep working unchanged. Handlers live in `lib/handlers.js`
  and are shared by the widget API and the dashboard server.
- After `.homeycompose` changes run `homey app build` (regenerates `app.json`).

## Current state (2026-10-13)
Stages 0-10 are implemented on `dashboard` and verified only against a fake
backend in a local browser (login, tiles, tap, page links, editor save, SSE,
HA handshake). **Not yet run on a real Homey / Shelly.**
- Server: `lib/ExternalServer.js` (opt-in, default port 7580, PIN cookie,
  lockout after 5 wrong PINs), started from `app.js` when settings key
  `externalDashboard` = `{enabled, pin, port}`; status in `externalDashboardStatus`.
- Frontend: `dashboard/public/` (index, editor, login, homey-shim). Floor plan
  blocks embed the untouched widget at `/widget/?floor=<id>` via an iframe.
- Tiles: `CapabilityRendererManager.renderDevice(..., {view:'tile'})`.
- Room/devices blocks: `lib/DeviceDescriptors.js` mirrors the settings page's
  default rules; keep both in step.
- Flow: trigger card `spaceyplan_button` (autocomplete of dashboard buttons).
- HA shim: `lib/HaShim.js`, adapted from WallDisplay (MIT).
- Home blocks (2026-11-08): `hero`, `weather`, `climate`, `lighting` in
  `dashboard/public/home-blocks.js`, data in `lib/HomeData.js`. Dashboard
  `style: 'evening'` = dark/gold look with bottom nav; `language` auto|en|sv.
  Installed and running on the real Homey (2026-11-08); dashboard `hemma`
  at http://192.168.4.229:7580/?d=hemma. Light toggling verified only on the fake backend.

- Music block (2026-11-08): `dashboard/public/music.js` + `music.css`, data in
  `lib/Music.js`; album art proxied at `/albumart/<deviceId>` (204 when none).
  The same player replaces the speaker renderer's volume popup on the dashboard.
  Added to `hemma` below Belysning. Shown with real Sonos data (nothing playing);
  playback control and real album art verified only on the fake backend.
  2026-11-08: music moved to a summary card that opens a sheet like Lighting;
  sheets close by swiping down; in `evening` the header photo and top bar are
  fixed and the cards scroll over the photo.

## Decisions and why
- Device popups (2026-11-08): `widgets/spacey-plan/public/device-popup.js`
  replaces `showDeviceModal` of the onoff, dim, measure and sensor renderers with one
  card; other popups are restyled by `device-popup.css`. On the dashboard it opens in
  the top window. 2026-11-14 (Ludvig): moved into the widget, so the Homey app
  shows the same popups, drawn inside the widget's frame (compact below 560 px
  height); it calls the widget routes `/deviceDetail/:deviceId` and
  `/deviceCapability` through Homey.api. Note script.js keeps Homey in a global
  `let`, not on window. In the Homey app verified only via the fake backend.
- PIN instead of URL token (2026-10-13): a long token is too awkward to type on a wall panel.
- Device chooses its dashboard and room, saved in the browser's localStorage.
- Pages are chained with `link` blocks; one dashboard holds several pages.
- Per-block `visibleOn` is `all|small|large` (screen width 700 px), not per-dashboard: a block lives in one dashboard, so size is the useful axis (2026-10-14).

- Weather from Open-Meteo with Homey's own location (2026-11-08): free, no key,
  no weather device needed. Cached 10 min server side.
- Floors view (2026-11-08, Ludvig): block type stays `lighting` (no migration),
  shown as "Floors" in the editor. Each floor tab lists, per zone, what is placed
  on its plan: lights (class `light` or socket with virtualClass `light`) with
  slider/switch, plus other devices' status (motion, contact, alarms,
  temperature/humidity, onoff). Sheet filters: Allt / Belysning / Säkerhet /
  Klimat, shown only when the plans hold such devices. `startFilter` picks the
  view the card summarises and opens with (`hemma` uses `all` = "Hemmet").
  "Tänd/Släck allt" touches lights only, never sockets like Garageporten.
  Motion: "Rörelse nu" while active, "för N min sedan" for 30 min, no alerts.
- Quick actions block `quick` (2026-11-08): equal buttons for chosen on/off
  devices above Belysning on `hemma` (Spottar Hall Nedre, Spottar Tv-rum).
  Tap toggles onoff (or dim 0/1), long press opens the device popup.
- Keep, don't refetch (2026-11-08, Ludvig): pages are rendered once and kept
  hidden; lighting and music sheets are kept hidden with their floor plans.
  Only status is live: SSE updates, and after the stream reconnects or the
  panel was hidden over 1 min the shim re-subscribes and replays values from
  POST /deviceValues. Menu > Uppdatera (page reload) picks up layout changes.
  Floor plan iframes share the page's SSE stream (few connections per host).
- Music "all linked" volume (2026-11-08): rooms in the same `sonos_group`, else
  every playing room; scaled proportionally so their balance is kept, like Sonos.
- Camera block `camera` (2026-11-11): `dashboard/public/cameras.js`, data in
  `lib/Cameras.js`. Snapshots proxied at `/camerasnap/<deviceId>`; live video
  only for WebRTC videos (Google Nest), negotiated via Homey's private
  ManagerVideos (`/api/manager/videos/video/:id/offer` -> {answerSdp, streamId},
  keep-alive every 2 min). RTSP (Reolink) cannot play in a browser, so those
  cameras poll snapshots (10 s on the card, 2 s in the sheet). Other cameras
  (Verisure) refetch only when the image's lastUpdated changes, to spare their
  cloud API. The stream stops when the sheet closes or the panel hides.
  Verified on the real Homey in desktop Chrome (2026-11-11); not yet on the Shelly.
  2026-11-12 (Ludvig): the block is a compact summary card (camera names); the
  tiles are in a sheet and pictures are fetched/polled only while it is open.
  One camera opens its large view directly. Verified on the fake backend only.
- Camera marker on floor plans (2026-11-12): capability `camera` (settings
  offers "Camera (Picture)" for class camera/doorbell devices with images or
  video, also those without capabilities, e.g. Nest and Verisure). Renderer
  `capabilities/camera.js` inherits the sensor renderer; tap shows the latest
  picture via widget route `GET /cameras/:deviceId/snapshot` (data URL). On the
  dashboard device-popup.js opens the camera sheet instead (live for Nest).
  Verified on the fake backend only.
- Back to start (2026-11-12, Ludvig): after `returnHomeSeconds` (default 30,
  0 = off, dashboard setting) without touches the dashboard closes sheets and
  popups (also in plan frames, by clicking their overlays), scrolls up and shows
  page 1. Frames report touches to the top window (homey-shim.js), which now
  also keeps the screensaver from starting while someone uses a plan.
  Verified on the fake backend only.
- Cards in one row stretch to equal height (`.page > .card`), by request.
- Hero images are uploaded from the editor (resized to 2000 px JPEG) to userdata
  as `dash_*.jpg` and served at `/media/`.

## Findings
- 2026-11-08: floor plan device icons are ~13 px in the lighting sheet and the
  `<img>` is the only tap target, so taps on a touch panel missed. Dashboard-only
  CSS (device-popup.css) pads the img to ~45 px. Lamps drawn into the plan image
  itself are not devices; the real icons sit beside them.
- 2026-11-08: glows missing on the Shelly Wall Display; first guess was
  `color-mix()` in dashboard CSS (replaced by `rgba(var(--accent-rgb), a)`; avoid
  color-mix, `:has()` and `inset`). 2026-11-10: plan icons still have no glow on
  the Shelly, so that was not (all of) it. Floor plan frames now POST rendering
  diagnostics to `/diag` 10 s after load (in memory, last 20; GET `/diag` with the
  PIN cookie reads them). Note: the default `allColor` rule has showCloud false
  and icon colour #333332, so a device without its own rule has no glow anywhere.
- 2026-11-11: /diag from the Shelly (Android 11 WebView, Chrome 131) showed
  `CSS.supports('color', '#00000080')` false and every glow computed as
  transparent: it rejects #rrggbbaa. The old colors.js polyfill never engaged
  because current Chrome has no per-property accessors on CSSStyleDeclaration.
  colors.js now wraps `HTMLElement.prototype.style` in a Proxy that rewrites
  #rrggbbaa to rgba() (only where unsupported; `?colorfix=1` forces it).
  Proxy verified in desktop Chrome; on the Shelly unverified until next /diag.
  The plan's "26%"/"10%" labels are Sonos volumes (speaker-value-label).
- 2026-11-11: Sonos device icons are thin line drawings of the model (960 px
  SVG) and vanish at the plan's ~14 px, also in the Homey widget. The dashboard
  (device-popup.js) swaps speakers without an iconOverride to a solid speaker glyph.
- 2026-11-10: device-popup.css had made `.measure-value-label` transparent (meant
  for popups), so plan readings were unreadable on light plans. Now a dark pill.
  Combined temperature + humidity devices show both ("21.5° · 45%") in the widget too.
- 2026-11-08: `homey.geolocation` returned no position on the real Homey (no
  permission); weather reads it via `api.geolocation.getOptionLocation()`.
- 2026-11-08: Lampa Bosses and the Lampa Utomhus lamps are sockets without a
  connected-device class, so they are not lights until set to Light in Homey.
- 2026-10-13: renderers need an `<img>` icon to create a tap target, so devices
  without an icon get a built-in fallback glyph. They also need
  `widgets/spacey-plan/public/styles.css` (`.icon-wrapper`).
