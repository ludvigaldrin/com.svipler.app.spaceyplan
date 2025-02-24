class CapabilityRendererManager {
    constructor() {
        this.renderers = new Map();
        this.widgetId = null;
    }

    setWidgetId(widgetId) {
        this.widgetId = widgetId;
    }

    registerRenderer(renderer) {
        this.renderers.set(renderer.id, renderer);
    }

    getRenderer(capabilityId) {
        const renderer = this.renderers.get(capabilityId);
        return renderer;
    }

    async renderDevice(device, container) {
        const renderer = this.getRenderer(device.capability);
        if (!renderer) {
            Homey.api('POST', '/log', { message: `No renderer found for capability: ${device.capability}` });
            return;
        }

        const deviceEl = renderer.createDeviceElement(device, device.position);
        
        // Set data attributes with the correct device ID format
        const fullDeviceId = `${device.homeyId}`;
        deviceEl.setAttribute('data-device-id', fullDeviceId);
        deviceEl.setAttribute('data-capability', device.capability);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-sensor-type', device.sensorType);

        // Initialize state with the correct device ID
        await renderer.initializeState(deviceEl, fullDeviceId, this.widgetId);

        // Initialize interactions
        if (typeof renderer.initializeInteractions === 'function') {
            renderer.initializeInteractions(deviceEl);
        } else {
            Homey.api('POST', '/log', { message: `WARNING: No initializeInteractions method found for: ${device.capability}` });
        }

        // Debug touch events
        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            renderer.handleTouchStart.call(renderer, e, deviceEl, fullDeviceId, device.capability);
        }, { passive: false });

        deviceEl.addEventListener('touchmove', (e) => {
            e.stopPropagation();
            renderer.handleTouchMove.call(renderer, e, deviceEl);
        });

        deviceEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            renderer.handleTouchEnd.call(renderer, e, deviceEl, fullDeviceId, device.capability);
        });

        container.appendChild(deviceEl);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 