class CapabilityRendererManager {
    constructor() {
        this.renderers = new Map();
    }

    registerRenderer(renderer) {
        this.renderers.set(renderer.id, renderer);
    }

    getRenderer(capabilityId) {
        return this.renderers.get(capabilityId);
    }

    async renderDevice(device, container) {
        const renderer = this.getRenderer(device.capability);
        if (!renderer) {
            Homey.api('POST', '/log', { message: `No renderer found for capability: ${device.capability}` });
            return;
        }

        const deviceEl = renderer.createDeviceElement(device, device.position);
        
        // Add device icon
        if (device.iconObj?.url) {
            deviceEl.innerHTML = `<img src="${device.iconObj.url}" style="width: 24px; height: 24px;" alt="${device.name}">`;
        }

        // Set data attributes
        deviceEl.setAttribute('data-device-id', device.deviceId);
        deviceEl.setAttribute('data-capability', device.capability);

        // Initialize state
        await renderer.initializeState(deviceEl, device.deviceId, device.capability);

        // Handle touch interaction
        let touchMoved = false;
        
        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchMoved = false;
        }, { passive: false });
        
        deviceEl.addEventListener('touchmove', () => {
            touchMoved = true;
        });
        
        deviceEl.addEventListener('touchend', async (e) => {
            e.preventDefault();
            if (!touchMoved) {
                await renderer.handleClick(deviceEl, device.deviceId, device.capability);
            }
        });

        container.appendChild(deviceEl);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 