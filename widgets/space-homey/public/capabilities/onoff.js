const onOffRenderer = {
    id: 'onoff',
    
    createDeviceElement(device, position) {
        const deviceEl = document.createElement('div');
        deviceEl.className = 'light-button';
        deviceEl.style.cssText = `
            left: ${position.x}%;
            top: ${position.y}%;
            background: white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: background-color 0.3s ease;
            cursor: pointer;
            position: absolute;
        `;
        return deviceEl;
    },

    async handleDeviceUpdate(deviceEl, value) {
        try {
            Homey.api('POST', '/log', { message: `Handling onoff update: ${value}` });
            deviceEl.style.backgroundColor = value ? '#ffd700' : 'white';
            deviceEl.setAttribute('data-state', value);
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error handling onoff update: ${error.message}` });
        }
    },

    async initializeState(deviceEl, deviceId, capability) {
        try {
            const initialState = await Homey.api('GET', `/devices/${deviceId}/capabilities/${capability}`);
            await this.handleDeviceUpdate(deviceEl, initialState);
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error getting initial state for device ${deviceId}: ${error.message}` });
        }
    },

    async handleClick(deviceEl, deviceId, capability) {
        try {
            const currentState = deviceEl.getAttribute('data-state') === 'true';
            const newState = !currentState;
            
            // Update visual state immediately
            await this.handleDeviceUpdate(deviceEl, newState);
            
            // Send the state change to the device
            await Homey.api('PUT', `/devices/${deviceId}/capabilities/${capability}`, {
                value: newState
            });
        } catch (error) {
            // Revert visual state if there was an error
            await this.handleDeviceUpdate(deviceEl, currentState);
            Homey.api('POST', '/log', { message: `Error controlling device ${deviceId}: ${error.message}` });
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = onOffRenderer;
} else {
    window.capabilityRenderers = window.capabilityRenderers || {};
    window.capabilityRenderers.onoff = onOffRenderer;
} 