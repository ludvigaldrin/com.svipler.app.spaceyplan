'use strict';

// Cameras and doorbells for the External Dashboard.
// - Snapshots: device images (device.images[].imageObj.url, a path on the
//   Homey's local API), proxied at /camerasnap/<deviceId>.
// - Live video: device videos of type "webrtc" (e.g. Google Nest), negotiated
//   through Homey's ManagerVideos (POST /api/manager/videos/video/:id/offer).
//   Videos of type "rtsp" (e.g. Reolink) cannot play in a browser, so those
//   cameras show frequently refreshed snapshots instead.

function isCamera(device) {
  const cls = device.virtualClass || device.class;
  return cls === 'camera' || cls === 'doorbell';
}

function videosOf(device) {
  return Array.isArray(device.video) ? device.video : (Array.isArray(device.videos) ? device.videos : []);
}

function webrtcVideo(device) {
  const entry = videosOf(device).find(v => v && v.videoObj && v.videoObj.type === 'webrtc');
  return entry ? entry.videoObj : null;
}

function snapshotImage(device) {
  const entry = (device.images || []).find(i => i && i.imageObj && i.imageObj.url);
  return entry ? entry.imageObj : null;
}

function describe(device, zones) {
  const image = snapshotImage(device);
  const live = webrtcVideo(device);
  const zone = zones && zones[device.zone];
  return {
    id: device.id,
    name: device.name,
    zoneName: zone ? zone.name : null,
    class: device.virtualClass || device.class,
    available: device.available !== false,
    snapshot: !!image,
    snapshotUpdated: image ? image.lastUpdated || null : null,
    live: live ? { videoId: live.id, dataChannel: !!(live.options && live.options.dataChannel) } : null,
    rtsp: videosOf(device).some(v => v && v.videoObj && v.videoObj.type === 'rtsp'),
    motion: device.capabilitiesObj && device.capabilitiesObj.alarm_motion ? device.capabilitiesObj.alarm_motion.value : null
  };
}

async function getCameras(homey, { deviceIds } = {}) {
  const [devices, zones] = await Promise.all([homey.app.api.devices.getDevices(), homey.app.api.zones.getZones()]);
  if (Array.isArray(deviceIds) && deviceIds.length) {
    return deviceIds.map(id => devices[id]).filter(Boolean).map(d => describe(d, zones));
  }
  // All cameras: only those with a picture or live video (a 433 MHz doorbell
  // button is class doorbell too, but has nothing to show).
  return Object.values(devices).filter(isCamera).map(d => describe(d, zones))
    .filter(cam => cam.snapshot || cam.live);
}

async function localFetch(homey, path, options = {}) {
  const base = (await homey.api.getLocalUrl()).replace(/\/$/, '');
  const token = await homey.api.getOwnerApiToken();
  return fetch(base + path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
}

// Latest snapshot as { type, body }, or null when the camera has none.
async function getSnapshot(homey, deviceId) {
  const device = await homey.app.api.devices.getDevice({ id: deviceId });
  if (!isCamera(device)) throw new Error('Not a camera');
  const image = snapshotImage(device);
  if (!image) return null;
  const response = await localFetch(homey, image.url);
  if (!response.ok) throw new Error(`Snapshot fetch failed (${response.status})`);
  const type = response.headers.get('content-type') || 'image/jpeg';
  if (!type.startsWith('image/')) throw new Error(`Snapshot is not an image (${type})`);
  return { type, body: Buffer.from(await response.arrayBuffer()) };
}

// Only video ids that belong to a camera's WebRTC stream may be negotiated.
async function assertLiveVideo(homey, deviceId, videoId) {
  const device = await homey.app.api.devices.getDevice({ id: deviceId });
  const live = isCamera(device) && webrtcVideo(device);
  if (!live || live.id !== videoId) throw new Error('No live video for this camera');
}

async function videoCall(homey, path, body) {
  const response = await localFetch(homey, `/api/manager/videos/video/${encodeURIComponent(path.id)}/${path.action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Video ${path.action} failed (${response.status}): ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch (e) { return text; }
}

async function offer(homey, { deviceId, videoId, offer: sdp }) {
  if (typeof sdp !== 'string' || !sdp) throw new Error('offer must be an SDP string');
  await assertLiveVideo(homey, deviceId, videoId);
  return videoCall(homey, { id: videoId, action: 'offer' }, { offer: sdp });
}

async function keepAlive(homey, { deviceId, videoId, streamId }) {
  if (typeof streamId !== 'string' || !streamId) throw new Error('streamId required');
  await assertLiveVideo(homey, deviceId, videoId);
  return videoCall(homey, { id: videoId, action: 'keep-alive' }, { streamId });
}

module.exports = { getCameras, getSnapshot, offer, keepAlive };
