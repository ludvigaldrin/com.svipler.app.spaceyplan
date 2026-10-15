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

    // view: 'pin'  - absolutely positioned icon on the floor plan (default,
    //                 what the widget uses)
    //       'tile' - the same element laid out as a card in a dashboard grid
    async renderDevice(device, container, { view = 'pin' } = {}) {
        container = container || document.getElementById('floorPlanDevices');
        const renderer = this.getRenderer(device.capability);
        if (!renderer) {
            Homey.api('POST', '/error', { message: `No renderer found for capability: ${device.capability}` });
            return;
        }

        // Pass the floor aspect ratio to the renderer
        if (this.floorAspectRatio) {
            device.floorAspectRatio = this.floorAspectRatio;
        }

        // Tiles have no floor position; renderers read position.x/y.
        const deviceEl = renderer.createDeviceElement(device, device.position || { x: 0, y: 0 });

        // Renderers build the element and its behaviour only; placing it on
        // the floor plan ("pin" view) or in a grid ("tile" view) happens here.
        if (view === 'tile') {
            CapabilityRendererManager.styleAsTile(deviceEl);
        } else {
            CapabilityRendererManager.placeOnFloor(deviceEl);
        }
        
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
        if (view === 'tile') {
            container.appendChild(CapabilityRendererManager.wrapTile(deviceEl, device));
        } else {
            container.appendChild(deviceEl);
        }

        return deviceEl;
    }

    // Turns the absolutely positioned pin into an in-flow, enlarged icon.
    // Overrides only what placement needs; colours/state styling stay as the
    // renderer set them.
    static styleAsTile(deviceEl) {
        deviceEl.style.position = 'relative';
        deviceEl.style.left = 'auto';
        deviceEl.style.top = 'auto';
        deviceEl.style.transform = 'none';
        deviceEl.style.opacity = '1';
        deviceEl.style.zoom = '1.5';
        deviceEl.style.flex = '0 0 auto';
        deviceEl.classList.add('tile-pin');
    }

    // Card around the pin with the device name underneath. Taps on the card
    // outside the icon are forwarded to the icon so the whole tile is a
    // hit target (the icon is the only element the renderers listen on).
    static wrapTile(deviceEl, device) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('data-tile-for', device.homeyId);

        const name = document.createElement('div');
        name.className = 'tile-name';
        name.textContent = device.name || '';

        tile.appendChild(deviceEl);
        tile.appendChild(name);

        // The renderers decide between tap and long press from the time between
        // mouse down and up on the icon, so replay the real press on it: a quick
        // press toggles, holding opens the device popup.
        const icon = () => deviceEl.querySelector('.device-icon, .material-symbols-outlined');
        let pressed = false;
        const send = (type, e) => {
            const target = icon();
            if (!target) return;
            target.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, button: 0,
                clientX: e.clientX, clientY: e.clientY
            }));
        };

        tile.addEventListener('pointerdown', (e) => {
            if (e.button > 0 || deviceEl.contains(e.target)) return;
            pressed = true;
            send('mousedown', e);
        });
        tile.addEventListener('pointermove', (e) => { if (pressed) send('mousemove', e); });
        const release = (e) => {
            if (!pressed) return;
            pressed = false;
            send('mouseup', e);
        };
        tile.addEventListener('pointerup', release);
        tile.addEventListener('pointercancel', release);
        tile.addEventListener('pointerleave', release);
        tile.addEventListener('contextmenu', (e) => e.preventDefault());
        tile.style.touchAction = 'manipulation';
        tile.style.userSelect = 'none';
        tile.style.webkitUserSelect = 'none';

        return tile;
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
        // A first load can take a while (the image arrives as base64); keep
        // waiting rather than leaving the pin invisible.
        setTimeout(() => clearInterval(retryInterval), 60000);
    }

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CapabilityRendererManager;
} else {
    window.CapabilityRendererManager = CapabilityRendererManager;
} 