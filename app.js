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
