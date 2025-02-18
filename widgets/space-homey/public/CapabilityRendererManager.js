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

        // We don't need to determine sensor type here anymore since it's saved correctly
        const renderer = this.getRenderer(device.capability);
        if (!renderer) {
            Homey.api('POST', '/log', { message: `No renderer found for capability: ${device.capability}` });
            return;
        }

        const deviceEl = renderer.createDeviceElement(device, device.position);
        
        // Set data attributes
        deviceEl.setAttribute('data-device-id', device.deviceId);
        deviceEl.setAttribute('data-capability', device.capability);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-sensor-type', device.sensorType);

        // Initialize state with widgetId
        await renderer.initializeState(deviceEl, device.deviceId, this.widgetId);

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
            renderer.handleTouchStart.call(renderer, e, deviceEl, device.deviceId, device.capability);
        }, { passive: false });

        deviceEl.addEventListener('touchmove', (e) => {
            e.stopPropagation();
            renderer.handleTouchMove.call(renderer, e, deviceEl);
        });

        deviceEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            renderer.handleTouchEnd.call(renderer, e, deviceEl, device.deviceId, device.capability);
        });

        container.appendChild(deviceEl);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 