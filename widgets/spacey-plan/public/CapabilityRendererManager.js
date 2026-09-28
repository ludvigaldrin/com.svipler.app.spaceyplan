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

        // Renderers build the element and its behaviour only; placing it on
        // the floor plan ("pin" view) happens here, so the same element can
        // later be laid out elsewhere (e.g. as a dashboard tile).
        CapabilityRendererManager.placeOnFloor(deviceEl);
        
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

    // The rendered floor image's box relative to #imageWrapper, or null if
    // it isn't laid out yet. Measured directly rather than recomputing the
    // object-fit:contain math, so pins line up with what the engine drew.
    static floorGeometry() {
        const floorMapImage = document.getElementById('floorMapImage');
        const wrapper = document.getElementById('imageWrapper');
        if (!floorMapImage || !wrapper) return null;
        if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) return null;

        const wrapperRect = wrapper.getBoundingClientRect();
        const imageRect = floorMapImage.getBoundingClientRect();
        if (wrapperRect.width === 0 || wrapperRect.height === 0) return null;
        if (imageRect.width === 0 || imageRect.height === 0) return null;

        return {
            offsetX: imageRect.left - wrapperRect.left,
            offsetY: imageRect.top - wrapperRect.top,
            width: imageRect.width,
            height: imageRect.height
        };
    }

    // Moves a device element to its stored data-x/data-y percentages.
    // Returns false if the floor isn't laid out or the element has no position.
    static positionOnFloor(deviceEl, geometry = CapabilityRendererManager.floorGeometry()) {
        if (!geometry) return false;

        const posX = parseFloat(deviceEl.getAttribute('data-x'));
        const posY = parseFloat(deviceEl.getAttribute('data-y'));
        if (Number.isNaN(posX) || Number.isNaN(posY)) return false;

        const displayX = geometry.offsetX + (posX / 100) * geometry.width;
        const displayY = geometry.offsetY + (posY / 100) * geometry.height;
        deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
        return true;
    }

    // Positions a newly created element and reveals it (renderers create
    // elements with opacity 0). If the floor image hasn't loaded yet, retries
    // for up to 5 seconds; once the image is loaded the element is revealed
    // even if it can't be measured yet, and the resize handler
    // (repositionAllDevices) places it when the layout settles.
    static placeOnFloor(deviceEl) {
        const imageLoaded = () => {
            const floorMapImage = document.getElementById('floorMapImage');
            return floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0;
        };

        const place = () => {
            CapabilityRendererManager.positionOnFloor(deviceEl);
            deviceEl.style.opacity = '1';
        };

        if (imageLoaded()) {
            place();
            return;
        }

        const retryInterval = setInterval(() => {
            if (imageLoaded()) {
                clearInterval(retryInterval);
                place();
            }
        }, 100);
        setTimeout(() => clearInterval(retryInterval), 5000);
    }

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 