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
                    const [deviceId, capability] = key.split('-');
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
            const device = await this.app.getDevice(deviceId);
            if (!device) throw new Error(`Device not found: ${deviceId}`);

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

    async removeDeviceListener(deviceId, capability) {
        const key = `${deviceId}-${capability}`;

        try {
            const capabilityInstance = this.deviceListeners.get(key);
            if (capabilityInstance) {
                capabilityInstance.destroy();
                this.deviceListeners.delete(key);
            }
        } catch (error) {
            this.app.error(`Error removing device listener: ${error.message}`);
        }
    }

    notifyWidgets(deviceId, capability, value) {
        const key = `${deviceId}-${capability}`;
        const widgets = this.subscriptions.get(key);

        if (widgets) {
            widgets.forEach(widgetId => {
                this.homey.api.realtime(`widget:${widgetId}:deviceUpdate`, {
                    deviceId,
                    capability,
                    value
                });
            });
        }
    }
}

module.exports = SubscriptionManager; 