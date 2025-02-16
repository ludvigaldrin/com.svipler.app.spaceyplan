'use strict';

module.exports = {
  // Get all floor plans
  async getFloors({ homey }) {
    try {
      const floors = await homey.app.getFloors();
      // Log the first floor data for debugging
   
      return floors;
    } catch (error) {
      homey.app.error('Widget API - getFloors error:', error);
      throw error;
    }
  },

  // Get all devices
  async getDevices({ homey }) {
    try {
      return await homey.app.api.devices.getDevices();
    } catch (error) {
      homey.app.error('Widget API - getDevices error:', error);
      throw error;
    }
  },

  // Get devices for a specific floor
  async getFloorDevices({ homey, params }) {
    try {
      return await homey.app.getFloorDevices(params.floorId);
    } catch (error) {
      homey.app.error('Widget API - getFloorDevices error:', error);
      throw error;
    }
  },

  // Get all widget-to-floor mappings
  async getSelectedFloors({ homey }) {
    try {
      const selectedFloors = homey.settings.get('selectedFloors') || {};
      return selectedFloors;
    } catch (error) {
      homey.app.error('Widget API - getSelectedFloors error:', error);
      throw error;
    }
  },

  // Save widget-to-floor mapping
  async saveSelectedFloor({ homey, body }) {
    try {
      if (!body.widgetId) {
        throw new Error('No widget ID provided');
      }
      
      homey.app.log('Saving selected floor:', JSON.stringify(body));
      let selectedFloors = homey.settings.get('selectedFloors') || {};
      
      // Clean up any undefined entries
      selectedFloors = Object.fromEntries(
        Object.entries(selectedFloors).filter(([key]) => key !== 'undefined')
      );
      
      selectedFloors[body.widgetId] = {
        floorId: body.floorId,
        timestamp: new Date().toISOString()
      };
      
      await homey.settings.set('selectedFloors', selectedFloors);
      return { success: true };
    } catch (error) {
      homey.app.error('Widget API - saveSelectedFloor error:', error);
      throw error;
    }
  },
  // Log messages from widget
  async log({ homey, body }) {
    homey.app.log('WIDGET LOG:', body.message);
    return 'logged';
  },

  async getDeviceState({ homey, params }) {
    try {
      const { deviceId, capabilityId } = params;
      return await homey.app.capabilityManager.getValue(capabilityId, deviceId);
    } catch (error) {
      homey.app.error('Widget API - getDeviceState error:', error);
      throw error;
    }
  },

  async setDeviceState({ homey, params, body }) {
    try {
      const { deviceId, capabilityId } = params;
      const { value } = body;
      return await homey.app.capabilityManager.setValue(capabilityId, deviceId, value);
    } catch (error) {
      homey.app.error('Widget API - setDeviceState error:', error);
      throw error;
    }
  },

  async subscribeToDevices({ homey, body }) {
    try {
      const { widgetId, devices } = body;
      
      // Subscribe to each device's capability
      for (const device of devices) {
        await homey.app.subscriptionManager.subscribeWidget(
          widgetId,
          device.deviceId,
          device.capability
        );
      }
      
      return { success: true };
    } catch (error) {
      homey.app.error('Widget API - subscribeToDevices error:', error);
      throw error;
    }
  },

  async unsubscribeWidget({ homey, body }) {
    try {
      const { widgetId } = body;
      await homey.app.subscriptionManager.unsubscribeWidget(widgetId);
      return { success: true };
    } catch (error) {
      homey.app.error('Widget API - unsubscribeWidget error:', error);
      throw error;
    }
  }
};