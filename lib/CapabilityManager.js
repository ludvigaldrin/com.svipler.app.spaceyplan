class CapabilityManager {
    constructor(homey) {
        this.homey = homey;
        this.handlers = new Map();
        this.init();
    }
    
    init() {
        // Load all capability handlers
        this.registerHandler(require('./capabilities/onoff'));
        this.registerHandler(require('./capabilities/dim'));
        this.registerHandler(require('./capabilities/sensor'));
        this.registerHandler(require('./capabilities/measure'));
        this.registerHandler(require('./capabilities/lock'));
        this.registerHandler(require('./capabilities/windowcovering'));
        this.registerHandler(require('./capabilities/speaker'));
        this.registerHandler(require('./capabilities/target_temperature'));
        this.registerHandler(require('./capabilities/homealarm_state'));
        this.registerHandler(require('./capabilities/ajax_security_mode'));
        this.registerHandler(require('./capabilities/ajax_hub_chime'));
        this.registerHandler(require('./capabilities/ajax_chime_status'));
    }
    
    registerHandler(handler) {
        this.handlers.set(handler.id, handler);
        this.homey.app.log(`Registered capability handler: ${handler.id}`);
    }
    
    async getValue(capabilityId, deviceId) {
        const handler = this.handlers.get(capabilityId);
        if (!handler) {
            throw new Error(`No handler found for capability: ${capabilityId}`);
        }
        
        return await handler.get({ homey: this.homey, deviceId });
    }
    
    async setValue(capabilityId, deviceId, value) {
        const handler = this.handlers.get(capabilityId);
        if (!handler) {
            throw new Error(`No handler found for capability: ${capabilityId}`);
        }
        
        return await handler.set({ homey: this.homey, deviceId, value });
    }
}

module.exports = CapabilityManager; 