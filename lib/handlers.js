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

const DeviceDescriptors = require('./DeviceDescriptors');

// Icons are fetched once per URL and kept as data URLs, because the browser
// on the dashboard cannot reach Homey's icon host paths directly.
const iconCache = new Map();

async function iconDataUrl(homey, descriptor) {
  // Icons picked by name are public files on my.homey.app.
  if (descriptor.iconOverride) {
    const source = `https://my.homey.app/img/devices/${descriptor.iconOverride}.svg`;
    if (iconCache.has(source)) return iconCache.get(source);
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Icon fetch failed (${response.status}): ${source}`);
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
    iconCache.set(source, dataUrl);
    return dataUrl;
  }

  const url = descriptor.iconObj && descriptor.iconObj.url;
  if (!url) return null;
  if (iconCache.has(url)) return iconCache.get(url);

  // A device's own icon needs the Homey's login, which the app's API client has
  // (my.homey.app answers 403 without a session).
  let body;
  if (url.startsWith('/')) {
    body = await homey.app.api.call({ method: 'GET', path: url });
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Icon fetch failed (${response.status}): ${url}`);
    body = await response.text();
  }
  if (typeof body !== 'string' || !/^\s*(<\?xml|<svg)/i.test(body)) {
    throw new Error(`Icon is not an SVG: ${url}`);
  }
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(body).toString('base64')}`;
  iconCache.set(url, dataUrl);
  return dataUrl;
}

// Renderers build their clickable icon from an <img>, so a device without a
// usable icon would get no tap target at all. These Material glyphs
// (Apache 2.0) stand in; the renderers recolour them like any other icon.
const FALLBACK_PATHS = {
  bulb: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  dot: 'M12 4a8 8 0 100 16 8 8 0 000-16z'
};

function fallbackIcon(descriptor) {
  const kind = ['onoff', 'dim'].includes(descriptor.capability) ? 'bulb'
    : (descriptor.capability === 'lock' ? 'lock' : 'dot');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${FALLBACK_PATHS[kind]}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function withIcon(homey, descriptor) {
  try {
    const base64 = await iconDataUrl(homey, descriptor);
    if (base64) {
      descriptor.iconObj = { ...(descriptor.iconObj || {}), base64 };
      return descriptor;
    }
  } catch (error) {
    homey.app.error(`Dashboard icon unavailable for ${descriptor.name}:`, error.message);
  }
  descriptor.iconObj = { base64: fallbackIcon(descriptor) };
  return descriptor;
}

// What a single tile shows for a device when the user did not pick a
// capability: the main control if there is one, else a reading, else an alarm.
const PRIMARY_ORDER = ['dim', 'onoff', 'locked', 'windowcoverings_set', 'speaker_playing',
  'target_temperature', 'homealarm_state', 'ajax_security_mode', 'ajax_hub_chime_enabled',
  'ajax_chime_status', 'washer_status', 'dryer_status', 'mower_status'];

function primaryCapability(homeyDevice) {
  const caps = DeviceDescriptors.supportedCapabilities(homeyDevice);
  const control = PRIMARY_ORDER.find(c => caps.includes(c));
  if (control) return control;
  return caps.find(c => c === 'measure_combined')
    || caps.find(c => c.indexOf('measure_') === 0 || c.indexOf('meter_') === 0)
    || caps.find(c => c.indexOf('alarm_') === 0)
    || null;
}

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

  // Get all dashboards (migrated from floors on first read)
  async getDashboards({ homey }) {
    try {
      return await homey.app.getDashboards();
    } catch (error) {
      homey.app.error('Widget API - getDashboards error:', error);
      throw error;
    }
  },

  // Replace all dashboards; the body is the full validated list
  async saveDashboards({ homey, body }) {
    try {
      return await homey.app.saveDashboards(body);
    } catch (error) {
      homey.app.error('Widget API - saveDashboards error:', error);
      throw error;
    }
  },

  // Homey zones (rooms), for the dashboard `room` block and room picker
  async getZones({ homey }) {
    try {
      const zones = await homey.app.api.zones.getZones();
      return Object.values(zones).map(z => ({ id: z.id, name: z.name, parent: z.parent || null }));
    } catch (error) {
      homey.app.error('Widget API - getZones error:', error);
      throw error;
    }
  },

  async getFlowButtons({ homey }) {
    return await homey.app.getFlowButtons();
  },

  async pressFlowButton({ homey, params }) {
    try {
      await homey.app.pressFlowButton(params.buttonId);
      return { success: true };
    } catch (error) {
      homey.app.error('Widget API - pressFlowButton error:', error);
      throw error;
    }
  },

  // Picker data for the editor: every device with its zone and the
  // capabilities a tile can show.
  async getDashboardDeviceList({ homey }) {
    try {
      const devices = Object.values(await homey.app.api.devices.getDevices());
      return devices
        .map(d => ({
          id: d.id,
          name: d.name,
          zone: d.zone || null,
          capabilities: DeviceDescriptors.supportedCapabilities(d)
        }))
        .filter(d => d.capabilities.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      homey.app.error('Widget API - getDashboardDeviceList error:', error);
      throw error;
    }
  },

  // Renderer-ready devices for a zone (`room` block, autofill), one tile per
  // device, sorted by name.
  async getZoneDevices({ homey, params }) {
    try {
      const devices = Object.values(await homey.app.api.devices.getDevices())
        .filter(d => d.zone === params.zoneId)
        .sort((a, b) => a.name.localeCompare(b.name));

      const descriptors = [];
      for (const device of devices) {
        const capability = primaryCapability(device);
        if (capability) descriptors.push(await withIcon(homey, DeviceDescriptors.describe(device, capability)));
      }
      return descriptors;
    } catch (error) {
      homey.app.error('Widget API - getZoneDevices error:', error);
      throw error;
    }
  },

  // Renderer-ready devices for hand-picked items [{ homeyId, capability }]
  // (`devices` block). Unknown devices are reported, not silently dropped.
  async describeDevices({ homey, body }) {
    try {
      const all = await homey.app.api.devices.getDevices();
      const result = [];
      for (const item of body.items || []) {
        const device = all[item.homeyId];
        if (!device) {
          result.push({ missing: true, homeyId: item.homeyId, capability: item.capability });
          continue;
        }
        result.push(await withIcon(homey, DeviceDescriptors.describe(device, item.capability)));
      }
      return result;
    } catch (error) {
      homey.app.error('Widget API - describeDevices error:', error);
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

  // Get active alarms/problems (open windows, active alarms) for devices
  // placed on a specific floor, grouped by room
  async getFloorProblems({ homey, params }) {
    try {
      return await homey.app.getFloorProblems(params.floorId);
    } catch (error) {
      homey.app.error('Widget API - getFloorProblems error:', error);
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

      // Check if this is an internal app path that needs special handling
      if (imageUrl.startsWith('/app/')) {
        homey.app.log('Internal app path detected, using getFloorImage instead');
        
        // Extract image ID from the path - try different patterns
        let imageId = null;
        
        // Pattern 1: /app/com.svipler.app.spaceyplan/userdata/filename.jpg
        const userdataMatch = imageUrl.match(/\/userdata\/([^\/]+)$/);
        if (userdataMatch && userdataMatch[1]) {
          imageId = userdataMatch[1];
          homey.app.log('Extracted image ID from userdata path:', imageId);
        } 
        // Pattern 2: /app/com.svipler.app.spaceyplan/floorimage/filename.jpg 
        else {
          const floorimageMatch = imageUrl.match(/\/floorimage\/([^\/]+)$/);
          if (floorimageMatch && floorimageMatch[1]) {
            imageId = floorimageMatch[1];
            homey.app.log('Extracted image ID from floorimage path:', imageId);
          }
          // Pattern 3: Just get the filename from the end of the path
          else {
            const filenameMatch = imageUrl.match(/\/([^\/]+\.[a-z]+)$/i);
            if (filenameMatch && filenameMatch[1]) {
              imageId = filenameMatch[1];
              homey.app.log('Extracted image ID from filename at end of path:', imageId);
            }
          }
        }
        
        if (!imageId) {
          homey.app.error('Failed to extract image ID from path:', imageUrl);
          throw new Error('Invalid app path format - could not extract image ID');
        }
        
        try {
          // Use the getFloorImageById API endpoint to get the image
          homey.app.log('Calling API to get image data for ID:', imageId);
          
          let imageResult;
          try {
            imageResult = await homey.api.get(`/floor-images/${encodeURIComponent(imageId)}`);
            homey.app.log('API call completed successfully');
          } catch (fetchError) {
            homey.app.error('API fetch error:', fetchError.message);
            // Specifically handle JSON parsing errors
            if (fetchError.message && fetchError.message.includes('invalid json')) {
              homey.app.error('JSON parsing error detected. API may be returning non-JSON response');
              throw new Error('Invalid JSON response from API');
            }
            throw fetchError;
          }
          
          if (imageResult && imageResult.success && (imageResult.imageData || imageResult.dataUrl)) {
            homey.app.log('Successfully got image data from API');
            
            const imageData = imageResult.imageData || imageResult.dataUrl;
            
            const result = {
              dataUrl: imageData,
              cached: true
            };
            
            // Store in cache
            imageCache.set(imageUrl, result);
            
            return result;
          } else {
            throw new Error('Failed to get image data from API');
          }
        } catch (apiError) {
          homey.app.error('Error getting image from API:', apiError);
          throw new Error(`Failed to get image: ${apiError.message}`);
        }
      }
      
      // For external URLs, use regular fetch
      try {
        // Add proper protocol if missing
        let fetchUrl = imageUrl;
        if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
          fetchUrl = 'https://' + fetchUrl.replace(/^\/\//, '');
          homey.app.log('Added protocol to URL:', fetchUrl);
        }
        
        const response = await fetch(fetchUrl);
        
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
      } catch (fetchError) {
        homey.app.error('Fetch error:', fetchError);
        throw fetchError;
      }
    } catch (error) {
      homey.app.error('Widget API - proxyImage error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred proxying image'
      };
    }
  },

  // Get a floor image from userdata
  async getFloorImage({ homey, params }) {
    try {
      homey.app.log('WIDGET GET IMAGE: Starting image retrieval process');
      
      if (!params || !params.imageId) {
        homey.app.error('WIDGET GET IMAGE: No imageId provided in params');
        throw new Error('No imageId provided');
      }

      const imageId = params.imageId;
      homey.app.log('WIDGET GET IMAGE: Requested image ID:', imageId);
      
      // Check if image is in cache
      const cacheKey = `userdata-image-${imageId}`;
      const cachedImage = imageCache.get(cacheKey);
      if (cachedImage) {
        homey.app.log('WIDGET GET IMAGE: Returning cached userdata image for:', imageId);
        return cachedImage;
      }
      
      homey.app.log('WIDGET GET IMAGE: Not in cache, retrieving from app API');

      try {
        // Try the API call first with regular JSON response
        let result;
        try {
          result = await homey.api.get(`/floor-images/${encodeURIComponent(imageId)}`);
          homey.app.log('WIDGET GET IMAGE: API call completed successfully');
        } catch (fetchError) {
          homey.app.error('WIDGET GET IMAGE: API fetch error:', fetchError.message);
          
          // If JSON parsing error, try raw binary mode
          if (fetchError.message && fetchError.message.includes('invalid json')) {
            homey.app.error('WIDGET GET IMAGE: JSON parsing error detected, trying raw binary mode');
            
            try {
              // Use a direct fetch with the raw option
              homey.app.log('WIDGET GET IMAGE: Trying direct fetch with raw option');
              
              // Construct URL for the raw image
              const appId = homey.manifest.id;
              const baseUrl = await homey.api.getBaseUrl();
              const rawUrl = `${baseUrl}/floor-images/${encodeURIComponent(imageId)}?raw=true`;
              
              homey.app.log('WIDGET GET IMAGE: Fetching raw image from:', rawUrl);
              
              // Use node-fetch or global.fetch
              const fetchFn = global.fetch || require('node-fetch');
              const rawResponse = await fetchFn(rawUrl);
              
              if (!rawResponse.ok) {
                throw new Error(`HTTP error! status: ${rawResponse.status}`);
              }
              
              // Get content type
              const contentType = rawResponse.headers.get('content-type') || 'image/jpeg';
              
              // Get the binary data and convert to base64
              const arrayBuffer = await rawResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const base64 = buffer.toString('base64');
              
              homey.app.log('WIDGET GET IMAGE: Successfully got raw image, size:', buffer.length);
              
              // Return as data URL
              const response = {
                dataUrl: `data:${contentType};base64,${base64}`,
                cached: true,
                success: true
              };
              
              // Store in cache
              imageCache.set(cacheKey, response);
              homey.app.log('WIDGET GET IMAGE: Stored raw image in cache');
              
              return response;
            } catch (rawError) {
              homey.app.error('WIDGET GET IMAGE: Raw fetch also failed:', rawError);
              throw new Error('Failed to get image using both JSON and raw modes');
            }
          }
          
          throw fetchError;
        }
        
        homey.app.log('WIDGET GET IMAGE: Checking result');
        
        if (!result) {
          homey.app.error('WIDGET GET IMAGE: API returned null or undefined result');
          throw new Error('Failed to get image from userdata - empty response');
        }
        
        // Check for success and image data
        let imageData = null;
        
        if (result.success && result.imageData) {
          imageData = result.imageData;
          homey.app.log('WIDGET GET IMAGE: Found imageData property');
        } else if (result.success && result.dataUrl) {
          imageData = result.dataUrl;
          homey.app.log('WIDGET GET IMAGE: Found dataUrl property');
        } else {
          homey.app.error('WIDGET GET IMAGE: API returned error or missing data:', 
            result.error || 'No image data found in response');
          throw new Error(result.error || 'Missing image data in response');
        }
        
        homey.app.log('WIDGET GET IMAGE: Successfully retrieved image, data length:', imageData.length);
        
        const response = {
          dataUrl: imageData,
          cached: true,
          success: true
        };
        
        // Store in cache
        imageCache.set(cacheKey, response);
        homey.app.log('WIDGET GET IMAGE: Stored in cache with key:', cacheKey);
        
        return response;
      } catch (apiError) {
        homey.app.error('WIDGET GET IMAGE: API call error:', apiError);
        
        // Fallback - try to use proxyImage for local app paths
        try {
          const appId = homey.manifest.id;
          const imageUrl = `/app/${appId}/userdata/${imageId}`;
          
          homey.app.log('WIDGET GET IMAGE: Falling back to direct file access:', imageUrl);
          
          // Use fs.readFile directly to read the file from the userdata directory
          const fs = require('fs');
          const path = require('path');
          
          // Try multiple possible paths for the userdata directory
          let filePath = null;
          let fileData = null;
          
          // Attempt to get the userdata path from the app
          try {
            const userdataDir = homey.app.getUserDataPath();
            filePath = path.join(userdataDir, imageId);
            homey.app.log('WIDGET GET IMAGE: Trying to read file from app path:', filePath);
            
            if (fs.existsSync(filePath)) {
              fileData = fs.readFileSync(filePath);
              homey.app.log('WIDGET GET IMAGE: Successfully read file from app path, size:', fileData.length);
            }
          } catch (appPathError) {
            homey.app.log('WIDGET GET IMAGE: Could not read from app path:', appPathError.message);
          }
          
          // Try a direct path to userdata if the app path failed
          if (!fileData) {
            try {
              filePath = path.join('/userdata', imageId);
              homey.app.log('WIDGET GET IMAGE: Trying direct userdata path:', filePath);
              
              if (fs.existsSync(filePath)) {
                fileData = fs.readFileSync(filePath);
                homey.app.log('WIDGET GET IMAGE: Successfully read from direct userdata path, size:', fileData.length);
              }
            } catch (directPathError) {
              homey.app.log('WIDGET GET IMAGE: Could not read from direct userdata path:', directPathError.message);
            }
          }
          
          // Try the current directory as a last resort
          if (!fileData) {
            try {
              filePath = path.join('./userdata', imageId);
              homey.app.log('WIDGET GET IMAGE: Trying relative userdata path:', filePath);
              
              if (fs.existsSync(filePath)) {
                fileData = fs.readFileSync(filePath);
                homey.app.log('WIDGET GET IMAGE: Successfully read from relative path, size:', fileData.length);
              }
            } catch (relativePathError) {
              homey.app.log('WIDGET GET IMAGE: Could not read from relative userdata path:', relativePathError.message);
            }
          }
          
          // If we still don't have the file data, fail
          if (!fileData) {
            homey.app.error('WIDGET GET IMAGE: Could not read file from any path');
            throw new Error('Could not read file from any path');
          }
          
          homey.app.log('WIDGET GET IMAGE: Successfully read file, size:', fileData.length);
          
          // Determine content type based on file extension
          const ext = path.extname(filePath).toLowerCase();
          let contentType = 'image/jpeg';
          
          if (ext === '.png') {
            contentType = 'image/png';
          } else if (ext === '.gif') {
            contentType = 'image/gif';
          } else if (ext === '.webp') {
            contentType = 'image/webp';
          }
          
          // Convert to base64 data URL
          const base64 = fileData.toString('base64');
          const dataUrl = `data:${contentType};base64,${base64}`;
          
          const response = {
            dataUrl: dataUrl,
            cached: true,
            success: true
          };
          
          // Store in cache
          imageCache.set(cacheKey, response);
          homey.app.log('WIDGET GET IMAGE: Stored direct access image in cache');
          
          return response;
        } catch (fallbackError) {
          homey.app.error('WIDGET GET IMAGE: Fallback also failed:', fallbackError);
          throw new Error(`Failed to get image: ${apiError.message}`);
        }
      }
    } catch (error) {
      homey.app.error('WIDGET GET IMAGE: Error in getFloorImage:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred getting image'
      };
    }
  }
};