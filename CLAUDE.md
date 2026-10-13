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

## Decisions and why
- PIN instead of URL token (2026-10-13): a long token is too awkward to type on a wall panel.
- Device chooses its dashboard and room, saved in the browser's localStorage.
- Pages are chained with `link` blocks; one dashboard holds several pages.
- Per-block `visibleOn` not built; multiple dashboards cover it (open question 1).

## Findings
- 2026-10-13: renderers need an `<img>` icon to create a tap target, so devices
  without an icon get a built-in fallback glyph. They also need
  `widgets/spacey-plan/public/styles.css` (`.icon-wrapper`).
