class CapabilityRendererManager {
    constructor() {
        this.renderers = new Map();
        this.widgetId = null;
        this.floorAspectRatio = null;
    }

    setWidgetId(widgetId) {
        this.widgetId = widgetId;
    }

    setFloorAspectRatio(aspectRatio) {
        this.floorAspectRatio = aspectRatio;
    }

    getFloorAspectRatio() {
        return this.floorAspectRatio;
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
            Homey.api('POST', '/error', { message: `No renderer found for capability: ${device.capability}` });
            return;
        }

        // Pass the floor aspect ratio to the renderer
        if (this.floorAspectRatio) {
            device.floorAspectRatio = this.floorAspectRatio;
        }

        const deviceEl = renderer.createDeviceElement(device, device.position);
        
        // Set data attributes with the correct device ID format
        const fullDeviceId = `${device.homeyId}`;
        deviceEl.setAttribute('data-device-id', fullDeviceId);
        deviceEl.setAttribute('data-capability', device.capability);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-sensor-type', device.sensorType);
        
        // Store the floor aspect ratio on the element for future reference
        if (this.floorAspectRatio) {
            deviceEl.setAttribute('data-floor-aspect-ratio', this.floorAspectRatio);
        }

        // Initialize state with the correct device ID
        await renderer.initializeState(deviceEl, fullDeviceId, this.widgetId);

        // Initialize interactions with the DOM element, not the device object
        if (renderer && typeof renderer.initializeInteractions === 'function') {
            renderer.initializeInteractions(deviceEl);
        }

        // Add the element to the container
        container.appendChild(deviceEl);
        
        return deviceEl;
    }

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 