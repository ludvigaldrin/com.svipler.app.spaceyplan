class SubscriptionManager {
    constructor(app) {
        this.app = app;
        this.homey = app.homey;
        this.subscriptions = new Map(); // deviceId-capability -> Set of widgetIds
        this.deviceListeners = new Map(); // deviceId-capability -> unsubscribe function
    }

    async subscribeWidget(widgetId, deviceId, capability) {
        const key = `${deviceId}-${capability}`;

        // Add widget to subscriptions
        if (!this.subscriptions.has(key)) {
            this.subscriptions.set(key, new Set());
            // Set up device listener if this is the first widget
            await this.setupDeviceListener(deviceId, capability);
        }
        this.subscriptions.get(key).add(widgetId);
    }

    async unsubscribeWidget(widgetId) {
        let removed = false;

        // Remove widget from all subscriptions
        for (const [key, widgets] of this.subscriptions.entries()) {
            if (widgets.delete(widgetId)) {
                removed = true;
                // If no more widgets listening, remove device listener
                if (widgets.size === 0) {
                    // Device IDs are UUIDs containing dashes, so split at the LAST dash
                    const splitIndex = key.lastIndexOf('-');
                    const deviceId = key.substring(0, splitIndex);
                    const capability = key.substring(splitIndex + 1);
                    await this.removeDeviceListener(deviceId, capability);
                    this.subscriptions.delete(key);
                }
            }
        }

        if (removed) {
            this.app.log(`Widget ${widgetId} unsubscribed from all devices`);
        }
    }

    async setupDeviceListener(deviceId, capability) {
        const key = `${deviceId}-${capability}`;

        try {
            // Handle special combined device ID formats
            let actualDeviceId = deviceId;
            let actualCapability;
            
            if (deviceId.includes('-measure-combined')) {
                // For combined temp/humidity sensors, extract the base device ID
                actualDeviceId = deviceId.replace('-measure-combined', '');
                
                // Set up listeners for both temperature and humidity
                await this.setupIndividualCapabilityListener(actualDeviceId, 'measure_temperature', deviceId, capability);
                await this.setupIndividualCapabilityListener(actualDeviceId, 'measure_humidity', deviceId, capability);
                return;
            } else if (deviceId.includes('-measure-measure_')) {
                // For individual measure capabilities
                const parts = deviceId.split('-measure-');
                if (parts.length === 2) {
                    actualDeviceId = parts[0];
                    actualCapability = parts[1];
                    
                    await this.setupIndividualCapabilityListener(actualDeviceId, actualCapability, deviceId, capability);
                    return;
                }
            }
            
            // Standard case - setup normal listener
            const device = await this.app.getDevice(actualDeviceId);
            if (!device) throw new Error(`Device not found: ${actualDeviceId}`);

            // Create capability instance and listen for changes
            const capabilityInstance = device.makeCapabilityInstance(capability, (value) => {
                this.notifyWidgets(deviceId, capability, value);
            });

            // Store the instance for cleanup
            this.deviceListeners.set(key, capabilityInstance);
        } catch (error) {
            this.app.error(`Error setting up device listener: ${error.message}`);
        }
    }
    
    async setupIndividualCapabilityListener(actualDeviceId, actualCapability, originalDeviceId, originalCapability) {
        try {
            const device = await this.app.getDevice(actualDeviceId);
            if (!device) throw new Error(`Device not found: ${actualDeviceId}`);
            
            // Check if device has this capability
            if (!device.capabilitiesObj || !device.capabilitiesObj[actualCapability]) {
                this.app.error(`Device ${actualDeviceId} does not have capability ${actualCapability}`);
                return;
            }
            
            // Create a special key for storing this listener
            const listenerKey = `${originalDeviceId}-${originalCapability}-${actualCapability}`;
            
            // Create capability instance and listen for changes
            const capabilityInstance = device.makeCapabilityInstance(actualCapability, (value) => {
                // For combined devices, we need to get both values and notify
                if (originalDeviceId.includes('-measure-combined')) {
                    this.handleCombinedSensorUpdate(device, originalDeviceId, originalCapability, actualCapability, value);
                } else {
                    // For a single (standalone) measure capability, wrap the raw
                    // value in the same {measureType, value, unit} shape the
                    // client already gets from a fresh GET. The client's
                    // realtime handler for the generic 'measure' capability
                    // only accepts an object — sending the bare number here
                    // (as this used to) made every live update for standalone
                    // temperature/humidity/luminance/power/... devices
                    // silently no-op, even though the subscription itself
                    // was working (the value only ever refreshed on a full
                    // app reload, which re-fetches via GET instead).
                    const measureHandler = this.app.capabilityManager?.handlers?.get('measure');
                    const unit = device.capabilitiesObj?.[actualCapability]?.units
                        || measureHandler?.getUnit?.(actualCapability)
                        || '';
                    this.notifyWidgets(originalDeviceId, originalCapability, {
                        measureType: actualCapability,
                        value,
                        unit
                    }, actualDeviceId);
                }
            });

            // Store the instance for cleanup
            this.deviceListeners.set(listenerKey, capabilityInstance);
        } catch (error) {
            this.app.error(`Error setting up individual capability listener: ${error.message}`);
        }
    }
    
    async handleCombinedSensorUpdate(device, deviceId, capability, changedCapability, value) {
        try {
            // Get both temperature and humidity values
            const temperatureValue = device.capabilitiesObj?.measure_temperature?.value;
            const humidityValue = device.capabilitiesObj?.measure_humidity?.value;
            
            // Create combined data object
            const combinedData = {
                measureType: 'combined',
                temperature: {
                    value: temperatureValue !== undefined ? temperatureValue : null,
                    unit: '°C'
                },
                humidity: {
                    value: humidityValue !== undefined ? humidityValue : null,
                    unit: '%'
                },
                updatedCapability: changedCapability
            };
            
            // Notify widgets with the combined data
            this.notifyWidgets(deviceId, capability, combinedData, device.id);
        } catch (error) {
            this.app.error(`Error handling combined sensor update: ${error.message}`);
        }
    }

    async removeDeviceListener(deviceId, capability) {
        const key = `${deviceId}-${capability}`;
        
        try {
            // First check for the standard listener
            const capabilityInstance = this.deviceListeners.get(key);
            if (capabilityInstance) {
                capabilityInstance.destroy();
                this.deviceListeners.delete(key);
            }
            
            // Also check for specialized listeners for combined devices
            if (deviceId.includes('-measure-combined')) {
                // Remove both temperature and humidity listeners
                const tempKey = `${deviceId}-${capability}-measure_temperature`;
                const humidityKey = `${deviceId}-${capability}-measure_humidity`;
                
                const tempInstance = this.deviceListeners.get(tempKey);
                if (tempInstance) {
                    tempInstance.destroy();
                    this.deviceListeners.delete(tempKey);
                }
                
                const humidityInstance = this.deviceListeners.get(humidityKey);
                if (humidityInstance) {
                    humidityInstance.destroy();
                    this.deviceListeners.delete(humidityKey);
                }
            } else if (deviceId.includes('-measure-measure_')) {
                // For individual measure capability
                const parts = deviceId.split('-measure-');
                if (parts.length === 2) {
                    const actualCapability = parts[1];
                    const specialKey = `${deviceId}-${capability}-${actualCapability}`;
                    
                    const specialInstance = this.deviceListeners.get(specialKey);
                    if (specialInstance) {
                        specialInstance.destroy();
                        this.deviceListeners.delete(specialKey);
                    }
                }
            }
        } catch (error) {
            this.app.error(`Error removing device listener: ${error.message}`);
        }
    }

    notifyWidgets(deviceId, capability, value, clientDeviceId) {
        const key = `${deviceId}-${capability}`;
        const widgets = this.subscriptions.get(key);

        if (widgets) {
            widgets.forEach(widgetId => {
                this.homey.api.realtime(`widget:${widgetId}:deviceUpdate`, {
                    // The widget's DOM elements carry the real Homey device
                    // id in data-device-id — never the synthetic
                    // "<id>-measure-<type>"/"<id>-measure-combined" id used
                    // internally to key subscriptions per measure
                    // capability. Sending that synthetic id here meant
                    // script.js's central dispatcher (which looks elements
                    // up by data-device-id) never found a match, so
                    // standalone measure_* updates (luminance, power, a
                    // lone temperature/humidity sensor, ...) — and combined
                    // sensors too — silently never reached the renderer,
                    // regardless of the value's shape.
                    deviceId: clientDeviceId || deviceId,
                    capability,
                    value
                });
            });
        }
    }
}

module.exports = SubscriptionManager; 