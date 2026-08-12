// Shared styles/helpers for the enum-select and boolean-toggle renderers
// below. Kept in one file since all four share the same icon/badge/modal
// building blocks and only differ in capability id, icon, and value set.

function ensureSharedStyles() {
    if (!document.getElementById('deviceIconStyles')) {
        const styles = document.createElement('style');
        styles.id = 'deviceIconStyles';
        styles.textContent = `
            .device-icon {
                max-width: 14.4px;
                max-height: 14.4px;
                width: auto;
                height: auto;
            }
            .icon-wrapper .material-symbols-outlined {
                font-size: 18px;
            }
        `;
        document.head.appendChild(styles);
    }

    if (!document.getElementById('measureValueLabelStyles')) {
        const labelStyles = document.createElement('style');
        labelStyles.id = 'measureValueLabelStyles';
        labelStyles.textContent = `
                .measure-value-label {
                    position: absolute;
                    top: 28px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(255, 255, 255, 0.92);
                    color: #1C1C1E;
                    font-size: 9px;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 7px;
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                    z-index: 301;
                }
                .measure-value-label.badge-centered {
                    top: 50%;
                    transform: translate(-50%, -50%);
                }
        `;
        document.head.appendChild(labelStyles);
    }

    if (!document.getElementById('enumModalStyles')) {
        const styles = document.createElement('style');
        styles.id = 'enumModalStyles';
        styles.textContent = `
            .enum-modal-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            .enum-modal {
                background: rgba(245, 245, 245, 0.97);
                border-radius: 15px;
                padding: 20px;
                width: 260px;
                max-width: 90vw;
                text-align: center;
                font-family: inherit;
            }
            .enum-modal h2 {
                margin: 0 0 14px 0;
                font-size: 16px;
                color: #333;
            }
            .enum-option-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 14px;
            }
            .enum-option-btn {
                padding: 11px 0;
                border: none;
                border-radius: 9px;
                font-size: 14px;
                cursor: pointer;
                background: #e0e0e0;
                color: #333;
            }
            .enum-option-btn.current {
                background: #3498db;
                color: #fff;
                font-weight: 600;
            }
            .enum-modal-close {
                padding: 9px 20px;
                border: none;
                border-radius: 9px;
                font-size: 14px;
                cursor: pointer;
                background: #dcdcdc;
                color: #333;
            }
        `;
        document.head.appendChild(styles);
    }
}

function positionDevice(deviceEl, device, position) {
    return new Promise((resolve) => {
        const floorMapImage = document.getElementById('floorMapImage');
        const wrapper = document.getElementById('imageWrapper');

        const setPosition = () => {
            if (!floorMapImage || !wrapper) return;
            if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) return;

            const wrapperRect = wrapper.getBoundingClientRect();
            const currentImageAspectRatio = floorMapImage.naturalWidth / floorMapImage.naturalHeight;
            const storedAspectRatio = device.floorAspectRatio || parseFloat(deviceEl.getAttribute('data-floor-aspect-ratio'));

            let displayX, displayY;

            if (storedAspectRatio) {
                let imageWidth, imageHeight;
                if (wrapperRect.width / wrapperRect.height > currentImageAspectRatio) {
                    imageHeight = wrapperRect.height;
                    imageWidth = imageHeight * currentImageAspectRatio;
                } else {
                    imageWidth = wrapperRect.width;
                    imageHeight = imageWidth / currentImageAspectRatio;
                }
                displayX = (position.x / 100) * imageWidth;
                displayY = (position.y / 100) * imageHeight;
                if (imageWidth < wrapperRect.width) displayX += (wrapperRect.width - imageWidth) / 2;
                if (imageHeight < wrapperRect.height) displayY += (wrapperRect.height - imageHeight) / 2;
            } else {
                displayX = (position.x / 100) * wrapperRect.width;
                displayY = (position.y / 100) * wrapperRect.height;
            }

            deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
            deviceEl.style.opacity = '1';
            resolve();
        };

        if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
            setPosition();
        } else if (floorMapImage) {
            floorMapImage.onload = setPosition;
        }

        const retryInterval = setInterval(() => {
            if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                setPosition();
                clearInterval(retryInterval);
            }
        }, 100);
        setTimeout(() => clearInterval(retryInterval), 5000);
    });
}

function baseDeviceElement(rendererId, iconName, device, position) {
    ensureSharedStyles();

    const deviceEl = document.createElement('div');
    deviceEl.className = rendererId + '-device';
    deviceEl.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 28px;
        height: 28px;
        z-index: 300;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        opacity: 0;
        background: rgba(255, 255, 255, 0.35);
        box-shadow: 0 0 8px 1px rgba(255, 255, 255, 0.45);
        pointer-events: none;
    `;

    deviceEl.setAttribute('data-x', position.x);
    deviceEl.setAttribute('data-y', position.y);
    deviceEl.setAttribute('data-name', device.name);
    deviceEl.setAttribute('data-device-id', device.id);
    deviceEl.setAttribute('data-homey-id', device.homeyId);
    deviceEl.setAttribute('data-capability', rendererId);
    deviceEl.setAttribute('data-device', JSON.stringify(device));

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'icon-wrapper';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined';
    iconSpan.textContent = iconName;
    iconSpan.style.pointerEvents = 'auto';
    iconSpan.style.cursor = 'pointer';
    iconSpan.style.userSelect = 'none';
    iconSpan.style.webkitUserSelect = 'none';
    iconSpan.style.webkitTouchCallout = 'none';
    iconSpan.style.fontSize = '22px';
    iconWrapper.appendChild(iconSpan);
    deviceEl.appendChild(iconWrapper);

    const valueLabel = document.createElement('div');
    valueLabel.className = 'measure-value-label';
    valueLabel.textContent = '...';
    deviceEl.appendChild(valueLabel);

    positionDevice(deviceEl, device, position).catch(error => {
        Homey.api('POST', '/error', { message: `Error positioning ${rendererId} device: ${JSON.stringify(error)}` });
    });

    return deviceEl;
}

// Tap handling shared by all four (single tap only — no long-press needed,
// since none of these have an on-map on/off toggle distinct from opening
// the control).
function attachTapHandler(deviceEl, onTap) {
    const icon = deviceEl.querySelector('.material-symbols-outlined');
    if (!icon) return;

    let moved = false;
    let startX = 0;
    let startY = 0;
    const TOLERANCE = 10;

    const restoreVisuals = () => {
        deviceEl.style.transition = '';
        deviceEl.style.opacity = '1';
    };

    const start = (clientX, clientY) => {
        moved = false;
        startX = clientX;
        startY = clientY;
        deviceEl.style.transition = 'none';
        deviceEl.style.opacity = '0.8';
    };

    const move = (clientX, clientY) => {
        if (Math.abs(clientX - startX) > TOLERANCE || Math.abs(clientY - startY) > TOLERANCE) {
            moved = true;
        }
    };

    const end = () => {
        restoreVisuals();
        if (!moved) onTap();
    };

    icon.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
    }, { passive: false });

    icon.addEventListener('touchmove', (e) => {
        e.preventDefault(); e.stopPropagation();
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
    }, { passive: false });

    icon.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation();
        end();
    }, { passive: false });

    icon.addEventListener('touchcancel', () => restoreVisuals(), { passive: true });

    icon.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        start(e.clientX, e.clientY);
        const onMove = (ev) => move(ev.clientX, ev.clientY);
        const onUp = () => {
            end();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    icon.addEventListener('contextmenu', (e) => e.preventDefault());
    icon.style.pointerEvents = 'auto';
    icon.style.cursor = 'pointer';
    icon.style.userSelect = 'none';
}

function findTitle(values, value) {
    const match = (values || []).find(v => v.id === value);
    return match ? match.title : (value ?? '--');
}

// ---- Enum-select renderer (homealarm_state, ajax_security_mode) ----
function makeEnumRenderer(rendererId, apiCapabilityId, homeyCapabilityId, iconName) {
    return {
        id: rendererId,

        createDeviceElement(device, position) {
            return baseDeviceElement(rendererId, iconName, device, position);
        },

        async initializeState(deviceEl, deviceId, widgetId) {
            try {
                const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/${apiCapabilityId}`);
                if (response) {
                    const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                    deviceData.enumValue = response.value;
                    deviceData.enumValues = response.values || [];
                    deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                    const label = deviceEl.querySelector('.measure-value-label');
                    if (label) label.textContent = findTitle(response.values, response.value);
                }
                await Homey.api('POST', `/subscribeToDevices`, {
                    widgetId: widgetId,
                    devices: [{ deviceId: deviceId, capability: homeyCapabilityId }]
                });
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} initializeState: ${JSON.stringify(error)}` });
            }
        },

        initializeInteractions(deviceEl) {
            attachTapHandler(deviceEl, () => this.showModal(deviceEl));
        },

        async setValue(deviceEl, deviceId, value) {
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            const previousValue = deviceData.enumValue;
            try {
                this.handleDeviceUpdate(deviceEl, value, homeyCapabilityId);
                await Homey.api('PUT', `/devices/${deviceId}/capabilities/${apiCapabilityId}`, { value });
            } catch (error) {
                this.handleDeviceUpdate(deviceEl, previousValue, homeyCapabilityId);
                Homey.api('POST', '/error', { message: `Error setting ${rendererId} value: ${JSON.stringify(error)}` });
            }
        },

        showModal(deviceEl) {
            if (document.querySelector('.enum-modal-overlay')) return;

            const deviceId = deviceEl.getAttribute('data-homey-id');
            const name = deviceEl.getAttribute('data-name');
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            const values = deviceData.enumValues || [];
            const currentValue = deviceData.enumValue;

            const overlay = document.createElement('div');
            overlay.className = 'enum-modal-overlay';

            const modal = document.createElement('div');
            modal.className = 'enum-modal';
            modal.innerHTML = `
                <h2>${name}</h2>
                <div class="enum-option-list">
                    ${values.map(v => `
                        <button type="button" class="enum-option-btn ${v.id === currentValue ? 'current' : ''}" data-value="${v.id}">
                            ${v.title}
                        </button>
                    `).join('')}
                </div>
                <button type="button" class="enum-modal-close">Done</button>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            modal.querySelectorAll('.enum-option-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const value = btn.getAttribute('data-value');
                    modal.querySelectorAll('.enum-option-btn').forEach(b => b.classList.remove('current'));
                    btn.classList.add('current');
                    await this.setValue(deviceEl, deviceId, value);
                });
            });

            const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
            modal.querySelector('.enum-modal-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        },

        handleDeviceUpdate(deviceEl, value, capability) {
            try {
                if (!deviceEl) return;
                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.enumValue = value;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                const label = deviceEl.querySelector('.measure-value-label');
                if (label) label.textContent = findTitle(deviceData.enumValues, value);

                const modal = document.querySelector('.enum-modal-overlay');
                if (modal) {
                    modal.querySelectorAll('.enum-option-btn').forEach(b => {
                        b.classList.toggle('current', b.getAttribute('data-value') === value);
                    });
                }
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} handleDeviceUpdate: ${JSON.stringify(error)}` });
            }
        },

        applyInitialRules() {}
    };
}

// ---- Read-only enum display (ajax_chime_status) ----
function makeEnumDisplayRenderer(rendererId, apiCapabilityId, homeyCapabilityId, iconName) {
    return {
        id: rendererId,

        createDeviceElement(device, position) {
            const el = baseDeviceElement(rendererId, iconName, device, position);
            // No pointer/cursor affordance — this is a passive status badge.
            const icon = el.querySelector('.material-symbols-outlined');
            if (icon) { icon.style.cursor = 'default'; }
            return el;
        },

        async initializeState(deviceEl, deviceId, widgetId) {
            try {
                const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/${apiCapabilityId}`);
                if (response) {
                    const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                    deviceData.enumValue = response.value;
                    deviceData.enumValues = response.values || [];
                    deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                    const label = deviceEl.querySelector('.measure-value-label');
                    if (label) label.textContent = findTitle(response.values, response.value);
                }
                await Homey.api('POST', `/subscribeToDevices`, {
                    widgetId: widgetId,
                    devices: [{ deviceId: deviceId, capability: homeyCapabilityId }]
                });
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} initializeState: ${JSON.stringify(error)}` });
            }
        },

        initializeInteractions() {
            // No interaction — read-only capability.
        },

        handleDeviceUpdate(deviceEl, value) {
            try {
                if (!deviceEl) return;
                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.enumValue = value;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                const label = deviceEl.querySelector('.measure-value-label');
                if (label) label.textContent = findTitle(deviceData.enumValues, value);
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} handleDeviceUpdate: ${JSON.stringify(error)}` });
            }
        },

        applyInitialRules() {}
    };
}

// ---- Boolean toggle (ajax_hub_chime_enabled) ----
function makeBoolRenderer(rendererId, apiCapabilityId, homeyCapabilityId, iconName) {
    return {
        id: rendererId,

        createDeviceElement(device, position) {
            return baseDeviceElement(rendererId, iconName, device, position);
        },

        async initializeState(deviceEl, deviceId, widgetId) {
            try {
                const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/${apiCapabilityId}`);
                if (response) {
                    const value = !!response.value;
                    const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                    deviceData.boolValue = value;
                    deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                    const label = deviceEl.querySelector('.measure-value-label');
                    if (label) label.textContent = value ? 'Ein' : 'Aus';
                }
                await Homey.api('POST', `/subscribeToDevices`, {
                    widgetId: widgetId,
                    devices: [{ deviceId: deviceId, capability: homeyCapabilityId }]
                });
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} initializeState: ${JSON.stringify(error)}` });
            }
        },

        initializeInteractions(deviceEl) {
            attachTapHandler(deviceEl, async () => {
                const deviceId = deviceEl.getAttribute('data-homey-id');
                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                const newValue = !deviceData.boolValue;
                const previousValue = deviceData.boolValue;
                try {
                    this.handleDeviceUpdate(deviceEl, newValue);
                    await Homey.api('PUT', `/devices/${deviceId}/capabilities/${apiCapabilityId}`, { value: newValue });
                } catch (error) {
                    this.handleDeviceUpdate(deviceEl, previousValue);
                    Homey.api('POST', '/error', { message: `Error setting ${rendererId} value: ${JSON.stringify(error)}` });
                }
            });
        },

        handleDeviceUpdate(deviceEl, value) {
            try {
                if (!deviceEl) return;
                const boolValue = !!value;
                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.boolValue = boolValue;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                const label = deviceEl.querySelector('.measure-value-label');
                if (label) label.textContent = boolValue ? 'Ein' : 'Aus';
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} handleDeviceUpdate: ${JSON.stringify(error)}` });
            }
        },

        applyInitialRules() {}
    };
}

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.homealarmstate = makeEnumRenderer('homealarmstate', 'homealarmstate', 'homealarm_state', 'security');
window.capabilityRenderers.ajaxsecuritymode = makeEnumRenderer('ajaxsecuritymode', 'ajaxsecuritymode', 'ajax_security_mode', 'shield_lock');
window.capabilityRenderers.ajaxhubchime = makeBoolRenderer('ajaxhubchime', 'ajaxhubchime', 'ajax_hub_chime_enabled', 'doorbell_chime');
window.capabilityRenderers.ajaxchimestatus = makeEnumDisplayRenderer('ajaxchimestatus', 'ajaxchimestatus', 'ajax_chime_status', 'doorbell');
