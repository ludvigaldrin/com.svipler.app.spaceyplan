'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const CapabilityManager = require('./lib/CapabilityManager');
const SubscriptionManager = require('./lib/SubscriptionManager');

if (!global.fetch) {
  global.fetch = require('node-fetch');
}

class SpaceHomeyApp extends Homey.App {
  async onInit() {
    this.log('Space Homey is running...');

    // Initialize managers
    this.capabilityManager = new CapabilityManager(this.homey);
    this.subscriptionManager = new SubscriptionManager(this);

    try {
      this.log('Initializing HomeyAPI...');
      this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
      this.log('HomeyAPI initialized successfully');
    } catch (error) {
      this.error('Failed to initialize:', error);
    }

  }

  async getFloors() {
    try {
      const floors = await this.homey.settings.get('floors') || [];

      return floors.map(floor => ({
        id: floor.id,
        name: floor.name,
        image: floor.imageData,
        imageAspectRatio: floor.imageAspectRatio,
        devices: floor.devices || []
      }));

    } catch (error) {
      this.error('Error getting floors:', error);
      throw error;
    }
  }

  async saveFloor(floorData) {
    try {
      const floors = await this.homey.settings.get('floors') || [];
      const floorIndex = floors.findIndex(f => f.id === floorData.id);

      if (floorIndex >= 0) {
        // Update existing floor
        floors[floorIndex] = {
          ...floors[floorIndex],
          ...floorData,
          imageData: floorData.floorPlan
        };
      } else {
        // Add new floor
        floors.push({
          ...floorData,
          imageData: floorData.floorPlan,
          devices: []
        });
      }

      await this.homey.settings.set('floors', floors);
      return { success: true };
    } catch (error) {
      this.error('Error saving floor:', error);
      throw error;
    }
  }

  async getFloorDevices(floorId) {
    try {
      const floors = await this.getFloors();
      const floor = floors.find(f => f.id === floorId);
      if (!floor) throw new Error('Floor not found');
      return floor.devices;
    } catch (error) {
      this.error('Failed to get floor devices:', error);
      throw error;
    }
  }

  async getDevices() {
    try {
      return await this.api.devices.getDevices();
    } catch (error) {
      this.error('Failed to get devices:', error);
      throw error;
    }
  }

  // Helper method to get device using HomeyAPI
  async getDevice(deviceId) {
    return await this.api.devices.getDevice({ id: deviceId });
  }
}

module.exports = SpaceHomeyApp;
