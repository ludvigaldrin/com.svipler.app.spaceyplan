class CapabilityRendererManager {
    constructor() {
        this.renderers = new Map();
    }

    registerRenderer(renderer) {
        this.renderers.set(renderer.id, renderer);
        Homey.api('POST', '/log', { message: `Registered renderer: ${renderer.id}` });
    }

    getRenderer(capabilityId) {
        const renderer = this.renderers.get(capabilityId);
        Homey.api('POST', '/log', { message: `Getting renderer for ${capabilityId}: ${renderer ? 'found' : 'not found'}` });
        return renderer;
    }

    async renderDevice(device, container) {
        const renderer = this.getRenderer(device.capability);
        if (!renderer) {
            Homey.api('POST', '/log', { message: `No renderer found for capability: ${device.capability}` });
            return;
        }

        Homey.api('POST', '/log', { message: `Creating device element for ${device.name}` });
        const deviceEl = renderer.createDeviceElement(device, device.position);

        // Set data attributes
        deviceEl.setAttribute('data-device-id', device.deviceId);
        deviceEl.setAttribute('data-capability', device.capability);
        deviceEl.setAttribute('data-name', device.name);

        // Initialize state
        await renderer.initializeState(deviceEl, device.deviceId, device.capability);

        // Debug touch events
        deviceEl.addEventListener('touchstart', (e) => {
            Homey.api('POST', '/log', { message: `[Manager] Touch start on ${device.name}` });
            e.preventDefault();
            e.stopPropagation();
            renderer.handleTouchStart.call(renderer, e, deviceEl, device.deviceId, device.capability);
        }, { passive: false });
        
        deviceEl.addEventListener('touchmove', (e) => {
            Homey.api('POST', '/log', { message: `[Manager] Touch move on ${device.name}` });
            e.stopPropagation();
            renderer.handleTouchMove.call(renderer, e, deviceEl);
        });
        
        deviceEl.addEventListener('touchend', (e) => {
            Homey.api('POST', '/log', { message: `[Manager] Touch end on ${device.name}` });
            e.preventDefault();
            e.stopPropagation();
            renderer.handleTouchEnd.call(renderer, e, deviceEl, device.deviceId, device.capability);
        });

        Homey.api('POST', '/log', { message: `Adding device element to container` });
        container.appendChild(deviceEl);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 