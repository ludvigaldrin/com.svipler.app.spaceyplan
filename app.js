'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const CapabilityManager = require('./lib/CapabilityManager');
const SubscriptionManager = require('./lib/SubscriptionManager');
const ExternalServer = require('./lib/ExternalServer');
const { buildDefaultDashboards, validateDashboards } = require('./lib/dashboards');

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

    // Dashboard buttons: one trigger card, the user picks which button it
    // listens for (autocomplete) and builds "WHEN button X is pressed".
    try {
      this.dashboardButtonTrigger = this.homey.flow.getTriggerCard('spaceyplan_button');
      this.dashboardButtonTrigger.registerArgumentAutocompleteListener('button', async (query) => {
        const needle = String(query || '').toLowerCase();
        return (await this.getFlowButtons())
          .filter(b => b.name.toLowerCase().includes(needle))
          .map(b => ({ id: b.id, name: b.name, description: b.description }));
      });
      this.dashboardButtonTrigger.registerRunListener(async (args, state) => {
        return args.button && args.button.id === state.buttonId;
      });
    } catch (error) {
      this.error('Failed to register dashboard button trigger card:', error);
    }

    await this.startExternalDashboard();
  }

  // Every `buttons` block item of kind "flow", across all dashboards.
  async getFlowButtons() {
    const buttons = [];
    for (const dashboard of await this.getDashboards()) {
      for (const page of dashboard.pages) {
        for (const block of page.blocks) {
          if (block.type !== 'buttons') continue;
          for (const item of block.items || []) {
            if (item.kind !== 'flow') continue;
            buttons.push({
              id: item.id,
              name: item.label || item.id,
              description: `${dashboard.name} / ${page.name}`
            });
          }
        }
      }
    }
    return buttons;
  }

  async pressFlowButton(buttonId) {
    if (!this.dashboardButtonTrigger) {
      throw new Error('Dashboard button trigger card not registered');
    }
    const button = (await this.getFlowButtons()).find(b => b.id === buttonId);
    if (!button) throw new Error(`Unknown button: ${buttonId}`);
    await this.dashboardButtonTrigger.trigger({ buttonId: button.id, label: button.name }, { buttonId: button.id });
  }

  // Prefer the address Homey itself reports; fall back to a network interface.
  async localHost() {
    try {
      const address = await this.homey.cloud.getLocalAddress();
      if (address) return String(address).split(':')[0];
    } catch (error) {
      this.error('getLocalAddress failed:', error.message);
    }
    return this.lanAddress() || 'homey-ip';
  }

  lanAddress() {
    for (const addresses of Object.values(require('os').networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) return address.address;
      }
    }
    return null;
  }

  // ---- External Dashboard server ----

  // Settings key `externalDashboard`: { enabled, port, pin }. The server is
  // opt-in; a changed setting restarts or stops it.
  async startExternalDashboard() {
    if (!this.externalServer) {
      try {
        this.externalServer = new ExternalServer(this);
      } catch (error) {
        this.error('External Dashboard could not be created:', error);
        await this.homey.settings.set('externalDashboardStatus', { running: false, error: error.message });
        return;
      }
      this.subscriptionManager.addOutput((clientId, payload) => this.externalServer.pushDeviceUpdate(clientId, payload));
      this.homey.settings.on('set', key => {
        if (key === 'externalDashboard') {
          this.startExternalDashboard().catch(error => this.error('External Dashboard restart failed:', error));
        }
      });
    }

    const config = (await this.homey.settings.get('externalDashboard')) || {};
    if (!config.enabled) {
      await this.externalServer.stop();
      return;
    }

    let secret = await this.homey.settings.get('externalDashboardSecret');
    if (!secret) {
      secret = require('crypto').randomBytes(32).toString('hex');
      await this.homey.settings.set('externalDashboardSecret', secret);
    }

    try {
      await this.externalServer.start({ port: Number(config.port) || 7580, pin: config.pin, secret });
    } catch (error) {
      // Surfaced to the settings page through this key instead of failing silently.
      this.error('External Dashboard could not start:', error);
      await this.homey.settings.set('externalDashboardStatus', { running: false, error: error.message });
      return;
    }
    const port = this.externalServer.port;
    await this.homey.settings.set('externalDashboardStatus', {
      running: true,
      port,
      url: `http://${await this.localHost()}:${port}/`
    });
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

  // Dashboards live under their own settings key. While the key is absent they
  // are derived from the floors (one page per floor) and persisted, so
  // existing installs get a default dashboard without touching `floors`.
  // With no floors yet nothing is persisted, so floors added later still
  // get migrated on the next read.
  async getDashboards() {
    try {
      const stored = await this.homey.settings.get('dashboards');
      if (Array.isArray(stored)) return stored;

      const dashboards = buildDefaultDashboards(await this.getFloors());
      if (dashboards.length > 0) {
        await this.homey.settings.set('dashboards', dashboards);
        this.log('Migrated floors to default dashboard');
      }
      return dashboards;
    } catch (error) {
      this.error('Error getting dashboards:', error);
      throw error;
    }
  }

  async saveDashboards(dashboards) {
    try {
      validateDashboards(dashboards);
      await this.homey.settings.set('dashboards', dashboards);
      return dashboards;
    } catch (error) {
      this.error('Error saving dashboards:', error);
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

