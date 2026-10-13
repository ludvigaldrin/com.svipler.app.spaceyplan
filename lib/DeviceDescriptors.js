'use strict';

// Builds the device objects the capability renderers expect (the same shape
// stored in floor.devices) from raw Homey devices, so dashboard `room` and
// `devices` blocks can render tiles without a floor. This mirrors
// settings/js/devices/deviceManager.js (addDeviceToFloor): that code runs in
// the settings browser and cannot be shared, so keep the two in step when a
// capability or its default rules change.

const SUPPORTED = [
  'onoff', 'dim', 'locked', 'windowcoverings_set', 'speaker_playing', 'target_temperature',
  'homealarm_state', 'ajax_security_mode', 'ajax_hub_chime_enabled', 'ajax_chime_status',
  'washer_status', 'dryer_status', 'mower_status'
];

function isMeasure(cap) {
  return typeof cap === 'string' && (cap.indexOf('measure_') === 0 || cap.indexOf('meter_') === 0);
}

function isAlarm(cap) {
  return typeof cap === 'string' && cap.indexOf('alarm_') === 0;
}

function isSupported(cap) {
  return SUPPORTED.includes(cap) || isMeasure(cap) || isAlarm(cap);
}

// Capability list a user can pick from for one device. `dim` hides `onoff`;
// a device with temperature and humidity offers the combined reading too.
function supportedCapabilities(homeyDevice) {
  let caps = (homeyDevice.capabilities || []).filter(isSupported);
  if (caps.includes('dim')) caps = caps.filter(c => c !== 'onoff');

  if (caps.includes('measure_temperature') && caps.includes('measure_humidity')) {
    caps = caps.filter(c => c !== 'measure_temperature' && c !== 'measure_humidity');
    caps.push('measure_combined', 'measure_temperature', 'measure_humidity');
  }
  return caps;
}

// capability -> { suffix of the descriptor id, renderer capability }
const MAPPING = {
  dim: { suffix: 'dim', renderer: 'dim' },
  onoff: { suffix: 'onoff', renderer: 'onoff' },
  locked: { suffix: 'lock', renderer: 'lock' },
  windowcoverings_set: { suffix: 'cover', renderer: 'windowcovering' },
  speaker_playing: { suffix: 'speaker', renderer: 'speaker' },
  target_temperature: { suffix: 'thermostat', renderer: 'thermostat' },
  homealarm_state: { suffix: 'homealarm', renderer: 'homealarmstate' },
  ajax_security_mode: { suffix: 'ajaxsecurity', renderer: 'ajaxsecuritymode' },
  ajax_hub_chime_enabled: { suffix: 'ajaxchime', renderer: 'ajaxhubchime' },
  ajax_chime_status: { suffix: 'ajaxchimestatus', renderer: 'ajaxchimestatus' },
  washer_status: { suffix: 'washer', renderer: 'washer' },
  dryer_status: { suffix: 'dryer', renderer: 'dryer' },
  mower_status: { suffix: 'lawnmower', renderer: 'lawnmower' }
};

function onOffColorRule(id, onCloud, offCloud, { onIcon = '#ffffff', offIcon = '#333332', showOffCloud = true } = {}) {
  return {
    id,
    name: 'On/Off - Color Switcher',
    type: 'onOffColor',
    config: {
      showIconOn: true, iconColorOn: onIcon, showCloudOn: true, cloudColorOn: onCloud,
      showIconOff: true, iconColorOff: offIcon, showCloudOff: showOffCloud, cloudColorOff: offCloud
    }
  };
}

function allColorRule(id, iconColor) {
  return {
    id,
    name: 'All - Color Select',
    type: 'allColor',
    config: { showIcon: true, iconColor, showCloud: false, cloudColor: '#FFFFFF' }
  };
}

function flowTriggerRule(id) {
  return { id, name: 'Flow Trigger', type: 'flowTrigger', config: { buttonLabel: 'Run Flow' } };
}

// Same defaults the settings page gives a newly added device.
function defaultRules(capability, descriptorId) {
  const rid = name => `${descriptorId}-rule-${name}`;

  if (capability === 'onoff' || capability === 'dim') {
    return [{
      id: rid('onoff'),
      name: 'On/Off - Color Switcher',
      type: 'onOffColor',
      config: {
        showIconOn: true, iconColorOn: '#ffeb3b', showCloudOn: true, cloudColorOn: '#ffeb3b',
        showIconOff: true, iconColorOff: '#333332', showCloudOff: true, cloudColorOff: '#ffffff'
      }
    }];
  }
  if (capability === 'locked') return [onOffColorRule(rid('lock'), '#2ecc71', '#e74c3c')];
  if (capability === 'windowcoverings_set') {
    return [onOffColorRule(rid('cover'), '#3498db', '#dcdcdc', { offIcon: '#333332' }), flowTriggerRule(rid('flow'))];
  }
  if (capability === 'speaker_playing') {
    return [onOffColorRule(rid('speaker'), '#8e44ad', '#ffffff', { showOffCloud: false }), flowTriggerRule(rid('flow'))];
  }
  if (isAlarm(capability)) {
    return [{
      id: rid('alarm'),
      name: 'Alarm - Color Switcher',
      type: 'alarmColor',
      config: {
        showIconOn: true, iconColorOn: '#ff0000', showCloudOn: true, cloudColorOn: '#ff0000',
        showIconOff: true, iconColorOff: '#333332', showCloudOff: false, cloudColorOff: '#FFFFFF'
      }
    }];
  }
  if (capability === 'measure_temperature' || capability === 'measure_humidity' || capability === 'measure_combined') {
    return [
      {
        id: rid('display'),
        name: 'Measure - Display Settings',
        type: 'measureDisplay',
        config: {
          showTemperature: capability !== 'measure_humidity',
          showHumidity: capability === 'measure_humidity',
          temperatureColor: '#0000FF',
          humidityColor: '#0000FF'
        }
      },
      allColorRule(rid('color'), '#333332')
    ];
  }
  if (isMeasure(capability)) return [allColorRule(rid('color'), '#333332')];
  if (capability === 'target_temperature') return [allColorRule(rid('color'), '#e67e22')];
  return [];
}

// One renderer-ready device for (homeyDevice, capability). No position: tiles
// are laid out by the grid, not placed on a floor.
function describe(homeyDevice, capability) {
  let id = homeyDevice.id;
  let rendererCapability = capability;
  const extra = {};

  if (MAPPING[capability]) {
    id = `${homeyDevice.id}-${MAPPING[capability].suffix}`;
    rendererCapability = MAPPING[capability].renderer;
  } else if (isAlarm(capability)) {
    id = `${homeyDevice.id}-sensor-${capability}`;
    rendererCapability = 'sensor';
    extra.sensorType = capability;
  } else if (capability === 'measure_combined') {
    id = `${homeyDevice.id}-measure-combined`;
    rendererCapability = 'measure';
    extra.measureType = 'combined';
    extra.measureTypes = ['measure_temperature', 'measure_humidity'];
  } else if (isMeasure(capability)) {
    id = `${homeyDevice.id}-measure-${capability}`;
    rendererCapability = 'measure';
    extra.measureType = capability;
  } else {
    throw new Error(`Unsupported capability: ${capability}`);
  }

  return {
    id,
    homeyId: homeyDevice.id,
    name: homeyDevice.name,
    capability: rendererCapability,
    rules: defaultRules(capability, id),
    iconOverride: homeyDevice.iconOverride || null,
    iconObj: homeyDevice.iconObj || null,
    ...extra
  };
}

module.exports = { supportedCapabilities, describe, isSupported };
