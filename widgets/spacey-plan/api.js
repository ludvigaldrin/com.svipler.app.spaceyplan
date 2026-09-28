'use strict';

// Thin adapter: the handler bodies live in lib/handlers.js so the widget and
// the External Dashboard server share one implementation. Add new endpoints
// there, then map them here and in widget.compose.json.
const handlers = require('../../lib/handlers');

module.exports = {
  getFloors: handlers.getFloors,
  getDevices: handlers.getDevices,
  getFloorDevices: handlers.getFloorDevices,
  getFloorProblems: handlers.getFloorProblems,
  getSelectedFloors: handlers.getSelectedFloors,
  saveSelectedFloor: handlers.saveSelectedFloor,
  log: handlers.log,
  error: handlers.error,
  getDeviceState: handlers.getDeviceState,
  setDeviceState: handlers.setDeviceState,
  subscribeToDevices: handlers.subscribeToDevices,
  unsubscribeWidget: handlers.unsubscribeWidget,
  proxyImage: handlers.proxyImage,
  getFloorImage: handlers.getFloorImage,
};
