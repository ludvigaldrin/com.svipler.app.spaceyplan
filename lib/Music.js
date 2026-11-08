'use strict';

// Speakers for the dashboard's music block and speaker popup (Sonos first,
// any Homey speaker with play/volume works). Album art is read from Homey's
// own image endpoint with the app's API token and served by ExternalServer.

const SETTABLE = ['speaker_playing', 'speaker_next', 'speaker_prev', 'volume_set', 'volume_mute',
  'speaker_shuffle', 'speaker_repeat'];

function capValue(device, capability) {
  const cap = device.capabilitiesObj && device.capabilitiesObj[capability];
  return cap && cap.value !== undefined ? cap.value : null;
}

function isSpeaker(device) {
  const caps = device.capabilities || [];
  return (device.class === 'speaker' || device.virtualClass === 'speaker')
    && caps.includes('speaker_playing') && caps.includes('volume_set');
}

function albumArt(device) {
  const image = (device.images || []).find(i => i.id === 'albumart' || i.type === 'media');
  return image && image.imageObj ? image.imageObj : null;
}

function describeSpeaker(device, zonesById) {
  const caps = device.capabilities || [];
  const art = albumArt(device);
  return {
    id: device.id,
    name: device.name,
    zoneName: zonesById[device.zone] ? zonesById[device.zone].name : null,
    sonos: String(device.driverId || device.driverUri || '').includes('sonos'),
    available: device.available !== false,
    playing: capValue(device, 'speaker_playing') === true,
    track: capValue(device, 'speaker_track'),
    artist: capValue(device, 'speaker_artist'),
    album: capValue(device, 'speaker_album'),
    duration: capValue(device, 'speaker_duration'),
    position: capValue(device, 'speaker_position'),
    volume: capValue(device, 'volume_set'),
    mute: capValue(device, 'volume_mute'),
    shuffle: caps.includes('speaker_shuffle') ? capValue(device, 'speaker_shuffle') : null,
    repeat: caps.includes('speaker_repeat') ? capValue(device, 'speaker_repeat') : null,
    group: caps.includes('sonos_group') ? capValue(device, 'sonos_group') : null,
    hasNext: caps.includes('speaker_next'),
    hasPrev: caps.includes('speaker_prev'),
    art: art ? String(art.lastUpdated || art.id) : null
  };
}

// body.deviceIds: optional list; empty = every speaker.
async function getSpeakers(homey, { deviceIds } = {}) {
  const [devicesById, zonesById] = await Promise.all([
    homey.app.api.devices.getDevices(),
    homey.app.api.zones.getZones()
  ]);
  const wanted = Array.isArray(deviceIds) && deviceIds.length ? deviceIds : null;
  const speakers = (wanted ? wanted.map(id => devicesById[id]).filter(Boolean) : Object.values(devicesById))
    .filter(isSpeaker)
    .map(device => describeSpeaker(device, zonesById));
  if (!wanted) speakers.sort((a, b) => (b.sonos - a.sonos) || a.name.localeCompare(b.name));
  return { speakers };
}

async function setSpeaker(homey, { deviceId, capability, value } = {}) {
  if (!SETTABLE.includes(capability)) throw new Error(`Capability ${capability} cannot be set from the dashboard`);
  await homey.app.api.devices.setCapabilityValue({ deviceId, capabilityId: capability, value });
  return { success: true };
}

// -> { type, body } of the speaker's current album art, or null when none.
async function getAlbumArt(homey, deviceId) {
  const device = await homey.app.api.devices.getDevice({ id: deviceId });
  const art = albumArt(device);
  if (!art || !art.url) return null;
  const base = await homey.api.getLocalUrl();
  const token = await homey.api.getOwnerApiToken();
  const response = await fetch(base.replace(/\/$/, '') + art.url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 500 || response.status === 404) return null; // Homey answers 500 when no art is set
  if (!response.ok) throw new Error(`Album art fetch failed (${response.status})`);
  const type = response.headers.get('content-type') || 'image/jpeg';
  if (!type.startsWith('image/')) return null;
  return { type, body: Buffer.from(await response.arrayBuffer()) };
}

module.exports = { getSpeakers, setSpeaker, getAlbumArt };
