// Cameras and doorbells on the floor plan. Built on the sensor renderer (same
// marker, rules and tap handling); a tap shows the camera's latest picture.
// There is no state to follow: Nest and Verisure cameras have no capabilities.
// On the External Dashboard, device-popup.js opens the camera sheet instead
// (live video where the camera supports it).
(function () {
    const sensor = window.capabilityRenderers && window.capabilityRenderers.sensor;
    if (!sensor) return;

    // Material Symbols "videocam" (Apache 2.0), filled: camera apps ship thin
    // line drawings that vanish at the plan's icon size.
    const CAMERA_ICON = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
        '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>');

    const cameraRenderer = Object.assign(Object.create(sensor), {
        id: 'camera',

        createDeviceElement(device, position) {
            const deviceEl = sensor.createDeviceElement.call(this, Object.assign({}, device, { iconObj: { base64: CAMERA_ICON } }), position);
            if (device.iconOverride && device.iconObj) {
                const img = deviceEl.querySelector('.icon-wrapper img');
                if (img) img.src = device.iconObj.base64 || device.iconObj.url || CAMERA_ICON;
            }
            return deviceEl;
        },

        async initializeState(deviceEl) {
            try {
                this.applyInitialRules(JSON.parse(deviceEl.getAttribute('data-device')), deviceEl);
            } catch (error) {
                Homey.api('POST', '/error', { message: `Camera initializeState: ${error.message}` });
            }
        },

        // The shared rules paint image icons black (brightness(0)) with a
        // coloured halo; a light icon colour reads better as a white glyph.
        applyInitialRules(device, deviceEl) {
            sensor.applyInitialRules.call(this, device, deviceEl);
            const rule = (device.rules || []).find(r => r.type === 'allColor');
            const color = rule && rule.config && rule.config.iconColor;
            const img = deviceEl.querySelector('.icon-wrapper img');
            if (img && /^#(f{3}|f{6})$/i.test(color || '')) img.style.filter = 'brightness(0) invert(1)';
        },

        handleDeviceUpdate() { /* no state */ },

        handleClick(deviceEl) {
            this.showDeviceModal(deviceEl);
        },

        showDeviceModal(deviceEl) {
            const homeyId = deviceEl.getAttribute('data-homey-id') || deviceEl.getAttribute('data-device-id');
            const name = deviceEl.getAttribute('data-name') || '';

            const overlay = document.createElement('div');
            overlay.className = 'device-modal-overlay camera-modal-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);' +
                'display:flex;align-items:center;justify-content:center;z-index:1000;';

            const modal = document.createElement('div');
            modal.className = 'device-modal camera-modal';
            modal.setAttribute('data-device-id', homeyId);
            modal.style.cssText = 'background:rgba(245,245,245,0.97);border-radius:15px;padding:12px;width:520px;max-width:92vw;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
            const title = document.createElement('h2');
            title.style.cssText = 'margin:0;font-size:18px;color:#333;';
            title.textContent = name;
            const closeButton = document.createElement('button');
            closeButton.className = 'close-button';
            closeButton.setAttribute('aria-label', 'Close');
            closeButton.style.cssText = 'background:none;border:none;font-size:24px;color:#333;cursor:pointer;padding:5px;';
            closeButton.textContent = '×';
            header.appendChild(title);
            header.appendChild(closeButton);

            const view = document.createElement('div');
            view.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;min-height:150px;background:#111;border-radius:10px;' +
                'overflow:hidden;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:14px;';
            const status = document.createElement('span');
            status.textContent = 'Loading…';
            const img = document.createElement('img');
            img.alt = name;
            img.style.cssText = 'position:absolute;inset:0;top:0;left:0;width:100%;height:100%;object-fit:contain;display:none;';
            view.appendChild(status);
            view.appendChild(img);

            modal.appendChild(header);
            modal.appendChild(view);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const close = () => overlay.remove();
            closeButton.addEventListener('click', close);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

            Homey.api('GET', `/cameras/${encodeURIComponent(homeyId)}/snapshot`)
                .then((result) => {
                    if (!result || !result.dataUrl) { status.textContent = 'No picture from this camera'; return; }
                    img.onload = () => { img.style.display = 'block'; status.textContent = ''; };
                    img.onerror = () => { status.textContent = 'Could not show the picture'; };
                    img.src = result.dataUrl;
                })
                .catch((error) => {
                    status.textContent = 'Could not load the picture: ' + ((error && error.message) || error);
                });
        }
    });

    window.capabilityRenderers.camera = cameraRenderer;
})();
