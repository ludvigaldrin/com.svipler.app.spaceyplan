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
- Device popups (2026-11-08): on the dashboard server `dashboard/public/device-popup.js`
  replaces `showDeviceModal` of the onoff, dim, measure and sensor renderers with one
  card, opened in the top window; other popups are restyled by `device-popup.css`.
  Injected into the widget iframe by ExternalServer, so the Homey widget is unchanged.
- PIN instead of URL token (2026-10-13): a long token is too awkward to type on a wall panel.
- Device chooses its dashboard and room, saved in the browser's localStorage.
- Pages are chained with `link` blocks; one dashboard holds several pages.
- Per-block `visibleOn` is `all|small|large` (screen width 700 px), not per-dashboard: a block lives in one dashboard, so size is the useful axis (2026-10-14).

- Weather from Open-Meteo with Homey's own location (2026-11-08): free, no key,
  no weather device needed. Cached 10 min server side.
- Lighting per floor (2026-11-08, revised same day at Ludvig's request): a floor
  lists only the `light`-class devices placed on its plan, grouped by zone. The
  earlier rule (zone goes to the floor with most placed devices, then all its
  lights) showed rooms and lamps that are not on the plan. Outdoor zones are
  picked per block and list all their lights in their own tab.
- Keep, don't refetch (2026-11-08, Ludvig): pages are rendered once and kept
  hidden; lighting and music sheets are kept hidden with their floor plans.
  Only status is live: SSE updates, and after the stream reconnects or the
  panel was hidden over 1 min the shim re-subscribes and replays values from
  POST /deviceValues. Menu > Uppdatera (page reload) picks up layout changes.
  Floor plan iframes share the page's SSE stream (few connections per host).
- Music "all linked" volume (2026-11-08): rooms in the same `sonos_group`, else
  every playing room; scaled proportionally so their balance is kept, like Sonos.
- Cards in one row stretch to equal height (`.page > .card`), by request.
- Hero images are uploaded from the editor (resized to 2000 px JPEG) to userdata
  as `dash_*.jpg` and served at `/media/`.

## Findings
- 2026-11-08: floor plan device icons are ~13 px in the lighting sheet and the
  `<img>` is the only tap target, so taps on a touch panel missed. Dashboard-only
  CSS (device-popup.css) pads the img to ~45 px. Lamps drawn into the plan image
  itself are not devices; the real icons sit beside them.
- 2026-11-08: glows missing on the Shelly Wall Display; likely cause (unverified
  on the device) `color-mix()` (Chrome 111+) in the glows of the Shelly Wall
  Display; dashboard CSS uses `rgba(var(--accent-rgb), a)` instead. Avoid
  color-mix, `:has()` and `inset` in dashboard CSS.
- 2026-11-08: `homey.geolocation` returned no position on the real Homey (no
  permission); weather reads it via `api.geolocation.getOptionLocation()`.
- 2026-11-08: outdoor lamps here are sockets, so outdoor zones count sockets as lights.
- 2026-10-13: renderers need an `<img>` icon to create a tap target, so devices
  without an icon get a built-in fallback glyph. They also need
  `widgets/spacey-plan/public/styles.css` (`.icon-wrapper`).
