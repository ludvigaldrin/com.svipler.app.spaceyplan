'use strict';

// Data for the "home" dashboard blocks: outdoor weather, indoor climate,
// lighting grouped by floor and room, and images uploaded for hero blocks.
// Kept apart from handlers.js so the widget API surface stays unchanged.

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEATHER_TTL_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_PREFIX = 'dash_';
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

let weatherCache = null; // { at, key, value }

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000, headers: { 'User-Agent': 'SpaceyPlan-Homey-App' } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`Weather service answered HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        try { resolve(JSON.parse(text)); } catch (error) { reject(new Error('Weather service sent invalid JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Weather service timed out')));
    req.on('error', reject);
  });
}

// "2026-11-08T07:29" -> "07:29" (Open-Meteo returns local time with timezone=auto)
function clockOf(isoLocal) {
  return typeof isoLocal === 'string' && isoLocal.length >= 16 ? isoLocal.slice(11, 16) : null;
}

// Outdoor weather for Homey's own location, from Open-Meteo (free, no key).
async function getWeather(homey) {
  const latitude = homey.geolocation.getLatitude();
  const longitude = homey.geolocation.getLongitude();
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || (latitude === 0 && longitude === 0)) {
    throw new Error('Homey has no location set; set it in Homey settings to show the weather');
  }
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  if (weatherCache && weatherCache.key === key && Date.now() - weatherCache.at < WEATHER_TTL_MS) {
    return weatherCache.value;
  }

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${latitude}&longitude=${longitude}`
    + '&current=temperature_2m,weather_code,wind_speed_10m,precipitation,is_day'
    + '&daily=sunrise,sunset,precipitation_probability_max'
    + '&wind_speed_unit=ms&timezone=auto&forecast_days=1';
  const data = await getJson(url);
  if (!data.current || !data.daily) throw new Error('Weather service returned no current weather');

  const value = {
    temperature: data.current.temperature_2m,
    code: data.current.weather_code,
    isDay: data.current.is_day === 1,
    wind: data.current.wind_speed_10m,
    precipitation: data.current.precipitation,
    precipitationProbability: (data.daily.precipitation_probability_max || [])[0] ?? null,
    sunrise: clockOf((data.daily.sunrise || [])[0]),
    sunset: clockOf((data.daily.sunset || [])[0]),
    fetchedAt: new Date().toISOString()
  };
  weatherCache = { at: Date.now(), key, value };
  return value;
}

function isLight(device) {
  const caps = device.capabilities || [];
  const lightClass = device.class === 'light' || device.virtualClass === 'light';
  return lightClass && (caps.includes('onoff') || caps.includes('dim'));
}

function capValue(device, capability) {
  const cap = device.capabilitiesObj && device.capabilitiesObj[capability];
  return cap && cap.value !== undefined ? cap.value : null;
}

function describeLight(device) {
  const caps = device.capabilities || [];
  return {
    id: device.id,
    name: device.name,
    hasDim: caps.includes('dim'),
    hasOnoff: caps.includes('onoff'),
    onoff: capValue(device, 'onoff'),
    dim: capValue(device, 'dim'),
    available: device.available !== false
  };
}

// Lights grouped as floor -> room. A room (Homey zone) belongs to the floor
// where most of its placed devices sit, so a room shows up on one floor only.
// Every light in such a room is listed, placed on the plan or not.
// Outdoor zones (and their sub-zones) form their own group.
async function getLighting(homey, { floorIds, outdoorZoneIds } = {}) {
  const [allFloors, devicesById, zonesById] = await Promise.all([
    homey.app.getFloors(),
    homey.app.api.devices.getDevices(),
    homey.app.api.zones.getZones()
  ]);
  const devices = Object.values(devicesById);
  const outdoor = Array.isArray(outdoorZoneIds) ? outdoorZoneIds.filter(id => zonesById[id]) : [];

  const floors = Array.isArray(floorIds) && floorIds.length
    ? floorIds.map(id => allFloors.find(f => f.id === id)).filter(Boolean)
    : allFloors;

  // zones under an outdoor zone count as outdoor
  const outdoorSet = new Set();
  const descendants = rootId => {
    const out = [rootId];
    for (let i = 0; i < out.length; i++) {
      for (const zone of Object.values(zonesById)) if (zone.parent === out[i]) out.push(zone.id);
    }
    return out;
  };
  const outdoorMembers = new Map(); // outdoor root -> [zone ids]
  for (const id of outdoor) {
    const members = descendants(id);
    outdoorMembers.set(id, members);
    members.forEach(m => outdoorSet.add(m));
  }

  const votes = new Map(); // zoneId -> Map(floorId -> count)
  for (const floor of floors) {
    for (const placed of floor.devices || []) {
      const device = devicesById[placed.homeyId];
      if (!device || !device.zone || outdoorSet.has(device.zone)) continue;
      if (!votes.has(device.zone)) votes.set(device.zone, new Map());
      const perFloor = votes.get(device.zone);
      perFloor.set(floor.id, (perFloor.get(floor.id) || 0) + 1);
    }
  }
  const zoneFloor = new Map();
  for (const [zoneId, perFloor] of votes) {
    let best = null;
    for (const [floorId, count] of perFloor) if (!best || count > best[1]) best = [floorId, count];
    zoneFloor.set(zoneId, best[0]);
  }

  const lightsByZone = new Map();
  for (const device of devices) {
    if (!isLight(device) || !device.zone) continue;
    if (!lightsByZone.has(device.zone)) lightsByZone.set(device.zone, []);
    lightsByZone.get(device.zone).push(describeLight(device));
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  const room = (zoneId, lights) => ({
    zoneId,
    name: zonesById[zoneId] ? zonesById[zoneId].name : 'Unknown room',
    icon: zonesById[zoneId] ? zonesById[zoneId].icon || null : null,
    lights: lights.sort(byName)
  });

  const groups = floors.map(floor => ({
    id: floor.id,
    kind: 'floor',
    name: floor.name,
    rooms: [...zoneFloor.entries()]
      .filter(([, floorId]) => floorId === floor.id)
      .map(([zoneId]) => room(zoneId, lightsByZone.get(zoneId) || []))
      .filter(r => r.lights.length > 0)
      .sort(byName)
  }));

  if (outdoor.length) {
    groups.push({
      id: 'outdoor',
      kind: 'outdoor',
      name: null,
      rooms: outdoor
        .map(rootId => room(rootId, [].concat(...outdoorMembers.get(rootId).map(z => lightsByZone.get(z) || []))))
        .filter(r => r.lights.length > 0)
    });
  }
  return { groups };
}

// body.lights: [{ id, onoff?, dim? }]. Every write is attempted; failures are
// returned per light so the dashboard can show them.
async function setLights(homey, { lights } = {}) {
  if (!Array.isArray(lights) || lights.length === 0) throw new Error('No lights given');
  const results = await Promise.all(lights.map(async light => {
    try {
      if (typeof light.dim === 'number') {
        const dim = Math.min(1, Math.max(0, light.dim));
        await homey.app.api.devices.setCapabilityValue({ deviceId: light.id, capabilityId: 'dim', value: dim });
      } else if (typeof light.onoff === 'boolean') {
        await homey.app.api.devices.setCapabilityValue({ deviceId: light.id, capabilityId: 'onoff', value: light.onoff });
      } else {
        throw new Error('Nothing to set');
      }
      return null;
    } catch (error) {
      homey.app.error(`Dashboard setLights failed for ${light.id}:`, error.message || error);
      return { id: light.id, error: error.message || String(error) };
    }
  }));
  const failed = results.filter(Boolean);
  return { success: failed.length === 0, failed };
}

// body.deviceIds -> [{ id, name, zoneName, temperature, humidity, missing? }]
async function getClimate(homey, { deviceIds } = {}) {
  const [devicesById, zonesById] = await Promise.all([
    homey.app.api.devices.getDevices(),
    homey.app.api.zones.getZones()
  ]);
  return (deviceIds || []).map(id => {
    const device = devicesById[id];
    if (!device) return { id, missing: true };
    return {
      id,
      name: device.name,
      zoneName: zonesById[device.zone] ? zonesById[device.zone].name : null,
      zoneIcon: zonesById[device.zone] ? zonesById[device.zone].icon || null : null,
      temperature: capValue(device, 'measure_temperature'),
      humidity: capValue(device, 'measure_humidity')
    };
  });
}

function imageDir(homey) {
  const dir = homey.app.getUserDataPath();
  if (!dir) throw new Error('No writable userdata folder for images');
  return dir;
}

// body.dataUrl: "data:image/jpeg;base64,..." -> { imageId }
async function saveImage(homey, { dataUrl } = {}) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Expected a JPEG, PNG or WebP image as data URL');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is larger than 3 MB');
  const imageId = IMAGE_PREFIX + crypto.randomBytes(8).toString('hex') + IMAGE_TYPES[match[1]];
  fs.writeFileSync(path.join(imageDir(homey), imageId), buffer);
  return { imageId };
}

// Absolute path of an uploaded image, or null for anything that is not one.
function imagePath(homey, imageId) {
  const name = path.basename(String(imageId || ''));
  if (!name.startsWith(IMAGE_PREFIX) || !Object.values(IMAGE_TYPES).includes(path.extname(name).toLowerCase())) return null;
  const file = path.join(imageDir(homey), name);
  return fs.existsSync(file) ? file : null;
}

module.exports = { getWeather, getLighting, setLights, getClimate, saveImage, imagePath };
