'use strict';

// Cache for proxied images
const imageCache = {
  items: {},  // The actual cache
  maxSize: 30, // Maximum number of items to cache
  accessTimes: {}, // Track last access time for each URL
  
  // Get an item from cache
  get: function(url) {
    if (this.items[url]) {
      // Update access time
      this.accessTimes[url] = Date.now();
      return this.items[url];
    }
    return null;
  },
  
  // Add an item to cache
  set: function(url, data) {
    // Check if we need to clear space
    if (Object.keys(this.items).length >= this.maxSize) {
      this.cleanup();
    }
    
    // Add to cache
    this.items[url] = data;
    this.accessTimes[url] = Date.now();
  },
  
  // Clean up oldest items when cache is full
  cleanup: function() {
    const urls = Object.keys(this.items);
    if (urls.length === 0) return;
    
    // Sort by access time (oldest first)
    urls.sort((a, b) => this.accessTimes[a] - this.accessTimes[b]);
    
    // Remove oldest 20% of items, or at least 1
    const removeCount = Math.max(1, Math.floor(urls.length * 0.2));
    for (let i = 0; i < removeCount; i++) {
      delete this.items[urls[i]];
      delete this.accessTimes[urls[i]];
    }
  },
  
  // Get cache statistics
  getStats: function() {
    return {
      size: Object.keys(this.items).length,
      maxSize: this.maxSize
    };
  }
};

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

  async error({ homey, body }) {
    homey.app.error('WIDGET ERROR:', body.message);
    return 'logged';
  },

  async getDeviceState({ homey, params }) {
    try {
      const { deviceId, capabilityId } = params;

      if (!capabilityId) {
        throw new Error('Invalid capability ID');
      }

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
  },

  // Proxy an image from HTTP to HTTPS/Data URL
  async proxyImage({ homey, query }) {
    try {
      if (!query || !query.url) {
        throw new Error('No URL provided');
      }

      const imageUrl = decodeURIComponent(query.url);
      
      // Check if image is in cache
      const cachedImage = imageCache.get(imageUrl);
      if (cachedImage) {
        homey.app.log('Returning cached image for:', imageUrl);
        return cachedImage;
      }
      
      homey.app.log('Proxying image from:', imageUrl);

      // Fetch the image from the provided URL
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      // Get the image as a buffer
      const imageBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(imageBuffer);
      
      // Get the content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Create a data URL
      const base64 = buffer.toString('base64');
      const result = {
        dataUrl: `data:${contentType};base64,${base64}`,
        cached: true
      };
      
      // Store in cache
      imageCache.set(imageUrl, result);
      
      // Log cache size occasionally
      if (imageCache.getStats().size % 5 === 0) {
        homey.app.log(`Image cache size: ${imageCache.getStats().size} items`);
      }
      
      return result;
    } catch (error) {
      homey.app.error('Widget API - proxyImage error:', error);
      throw error;
    }
  },

};