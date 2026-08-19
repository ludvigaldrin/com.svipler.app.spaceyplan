'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const CapabilityManager = require('./lib/CapabilityManager');
const SubscriptionManager = require('./lib/SubscriptionManager');

if (!global.fetch) {
  import('node-fetch').then(module => {
    global.fetch = module.default;
  }).catch(err => {
    this.error('Failed to import node-fetch:', err);
  });
}

class SpaceHomeyApp extends Homey.App {
  constructor(...args) {
    super(...args);
    
    // Default path for userdata - will be updated in checkPaths()
    this.userDataPath = '/userdata';
  }

  async onInit() {
    this.log('Space Widget is running...');

    // Initialize managers
    this.capabilityManager = new CapabilityManager(this.homey);
    this.subscriptionManager = new SubscriptionManager(this);

    // Check various paths to find where we can write
    await this.checkPaths();
    this.log('Using userdata path:', this.userDataPath);

    try {
      this.log('Initializing HomeyAPI...');
      this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
      this.log('HomeyAPI initialized successfully');
    } catch (error) {
      this.error('Failed to initialize:', error);
    }

    // Register the Flow trigger card used by the per-device "Run Flow"
    // button (speakers, window coverings, ...). Apps aren't allowed to
    // trigger a user's existing Flows directly (Athom blocks this on
    // purpose), so instead we expose our own trigger card — the user builds
    // "WHEN this trigger THEN <their action>" themselves.
    try {
      this.flowButtonTrigger = this.homey.flow.getTriggerCard('spaceyplan_speaker_button');
    } catch (error) {
      this.error('Failed to register Flow-button trigger card:', error);
    }
  }

  // Fires the Flow-button trigger card, with the device's name as a token
  // so a Flow can tell devices apart if there's more than one.
  async triggerFlowButton(deviceName) {
    if (!this.flowButtonTrigger) {
      throw new Error('Flow-button trigger card not registered');
    }
    await this.flowButtonTrigger.trigger({ speaker: deviceName || '' });
  }

  // Check various paths to see which ones exist
  async checkPaths() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // List of paths to check in order of preference
      const pathsToCheck = [
        '/userdata',
        this.homey.userDataPath,
        path.join(process.cwd(), 'userdata'),
        './userdata'
      ];
      
      this.log('Checking available paths for storing data:');
      
      let foundWritablePath = false;
      
      for (const pathToCheck of pathsToCheck) {
        if (!pathToCheck) continue;
        
        try {
          this.log(`  Checking path: ${pathToCheck}`);
          
          if (fs.existsSync(pathToCheck)) {
            const stats = fs.statSync(pathToCheck);
            const isDir = stats.isDirectory();
            this.log(`  - Path exists: ${isDir ? 'directory' : 'file'}`);
            
            // Try to check if writeable
            if (isDir) {
              try {
                const testFile = path.join(pathToCheck, `.write-test-${Date.now()}.txt`);
                fs.writeFileSync(testFile, 'test');
                this.log(`  - Directory is writeable`);
                fs.unlinkSync(testFile);
                
                // Found a writable path - use this one
                this.userDataPath = pathToCheck;
                foundWritablePath = true;
                this.log(`  - SELECTED this path for image storage`);
                break;
              } catch (writeErr) {
                this.log(`  - Directory is NOT writeable: ${writeErr.message}`);
              }
            }
          } else {
            this.log(`  - Path does not exist`);
            // Try to create it
            try {
              fs.mkdirSync(pathToCheck, { recursive: true });
              this.log(`  - Created directory successfully`);
              
              // Check if we can write to it
              const testFile = path.join(pathToCheck, `.write-test-${Date.now()}.txt`);
              fs.writeFileSync(testFile, 'test');
              this.log(`  - New directory is writeable`);
              fs.unlinkSync(testFile);
              
              // Found a writable path - use this one
              this.userDataPath = pathToCheck;
              foundWritablePath = true;
              this.log(`  - SELECTED this path for image storage`);
              break;
            } catch (createErr) {
              this.log(`  - Could not create directory: ${createErr.message}`);
            }
          }
        } catch (pathErr) {
          this.log(`  - Error checking path: ${pathErr.message}`);
        }
      }
      
      if (!foundWritablePath) {
        this.error('Could not find any writable path for storing images!');
      }
    } catch (error) {
      this.error('Error checking paths:', error);
    }
  }
  
  // Get the userdata path that we can actually write to
  getUserDataPath() {
    return this.userDataPath;
  }

  async getFloors() {
    try {
      const floors = await this.homey.settings.get('floors') || [];
      return floors;
    } catch (error) {
      this.error('Error getting floors:', error);
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

  // Human-readable label for a raw alarm/problem capability id, e.g.
  // "alarm_smoke" -> "Smoke alarm", "window_open" -> "Window open".
  static humanizeProblemLabel(capabilityId) {
    const known = {
      alarm_contact: 'Contact alarm',
      alarm_motion: 'Motion alarm',
      alarm_smoke: 'Smoke alarm',
      alarm_co: 'CO alarm',
      alarm_co2: 'CO2 alarm',
      alarm_water: 'Water alarm',
      alarm_tamper: 'Tamper alarm',
      alarm_generic: 'Alarm',
      alarm_heat: 'Heat alarm',
      alarm_fire: 'Fire alarm',
      alarm_pressure: 'Pressure alarm',
      alarm_intrusion: 'Intrusion alarm',
      window_open: 'Window open'
    };
    if (known[capabilityId]) return known[capabilityId];
    // Fallback: strip alarm_ prefix, replace underscores/dots with spaces, capitalize
    const cleaned = capabilityId.replace(/^alarm_/, '').replace(/[._]/g, ' ').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Active alarms/problems (open windows, active alarms) for every device
  // placed on a floor, grouped by the device's Homey zone (room). Used for
  // the widget's Room Status overlay.
  async getFloorProblems(floorId) {
    try {
      const floorDevices = await this.getFloorDevices(floorId);

      // Only alarm_*/window_open capabilities the user actually placed as
      // an icon on this floor may raise a "problem" for a device — not
      // every alarm-type capability the underlying Homey device happens to
      // expose. E.g. placing only a Luminance icon must not surface that
      // same device's (unrelated, unplaced) alarm_motion state.
      const placedCapsByHomeyId = {};
      for (const fd of floorDevices || []) {
        if (!fd.homeyId || !fd.sensorType) continue;
        if (!placedCapsByHomeyId[fd.homeyId]) placedCapsByHomeyId[fd.homeyId] = new Set();
        placedCapsByHomeyId[fd.homeyId].add(fd.sensorType);
      }

      const uniqueHomeyIds = Object.keys(placedCapsByHomeyId);

      const [zones, deviceResults] = await Promise.all([
        this.api.zones.getZones().catch(error => {
          this.error('Failed to get zones for room status:', error);
          return {};
        }),
        Promise.all(uniqueHomeyIds.map(id => this.getDevice(id).catch(() => null)))
      ]);

      const roomsById = {};

      for (const device of deviceResults) {
        if (!device || !device.capabilitiesObj) continue;

        const placedCaps = placedCapsByHomeyId[device.id] || new Set();

        const problems = [];
        for (const [capabilityId, capability] of Object.entries(device.capabilitiesObj)) {
          if (!placedCaps.has(capabilityId)) continue;
          const isAlarm = capabilityId.startsWith('alarm_') && capabilityId !== 'alarm_battery';
          const isWindowOpen = capabilityId === 'window_open';
          if ((isAlarm || isWindowOpen) && capability?.value === true) {
            problems.push({
              deviceName: device.name,
              label: SpaceHomeyApp.humanizeProblemLabel(capabilityId)
            });
          }
        }

        if (problems.length === 0) continue;

        const zoneName = (zones && zones[device.zone]?.name) || 'Unknown room';
        if (!roomsById[zoneName]) {
          roomsById[zoneName] = { zoneName, problems: [] };
        }
        roomsById[zoneName].problems.push(...problems);
      }

      return Object.values(roomsById).sort((a, b) => a.zoneName.localeCompare(b.zoneName));
    } catch (error) {
      this.error('Failed to get floor problems:', error);
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

