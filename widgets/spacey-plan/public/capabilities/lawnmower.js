// Lawn mower robot (e.g. ViAX 250). Reuses the shared badge/modal/
// positioning helpers defined in alarm.js (ensureSharedStyles,
// baseDeviceElement, attachTapHandler) — this file must be loaded after
// alarm.js in index.html so those globals already exist.
//
// The status label shows the raw mower_status text as reported by the
// device (e.g. "docked") rather than a translated/hardcoded set of
// strings — we only confirmed "docked" ourselves, and showing the raw
// value avoids guessing at the exact wording for "mowing", "paused",
// etc. Red highlight is instead tied to alarm_generic/mower_error
// (booleans, safe to rely on regardless of the mower's actual state
// vocabulary).

function ensureLawnmowerStyles() {
    if (document.getElementById('lawnmowerModalStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'lawnmowerModalStyles';
    styles.textContent = `
        .lawnmower-info {
            text-align: left;
            margin-bottom: 14px;
        }
        .lawnmower-info-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 6px 0;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
            font-size: 14px;
        }
        .lawnmower-info-row:last-child {
            border-bottom: none;
        }
        .lawnmower-info-label {
            color: #777;
        }
        .lawnmower-info-value {
            color: #1C1C1E;
            font-weight: 600;
            text-align: right;
        }
        .lawnmower-error-row .lawnmower-info-value {
            color: #ff3b30;
        }
        .lawnmower-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 14px;
        }
        .lawnmower-buttons button {
            padding: 10px 0;
            border: none;
            border-radius: 9px;
            font-size: 13px;
            cursor: pointer;
            background: #e0e0e0;
            color: #333;
        }
        .lawnmower-buttons button:active {
            background: #d0d0d0;
        }
    `;
    document.head.appendChild(styles);
}

const lawnmowerRenderer = {
    id: 'lawnmower',

    createDeviceElement(device, position) {
        ensureLawnmowerStyles();
        return baseDeviceElement('lawnmower', 'yard', device, position);
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/lawnmower`);
            if (response) {
                this.applyState(deviceEl, response);
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [
                    { deviceId: deviceId, capability: 'mower_status' },
                    { deviceId: deviceId, capability: 'measure_battery' },
                    { deviceId: deviceId, capability: 'mower_error' },
                    { deviceId: deviceId, capability: 'alarm_generic' }
                ]
            });
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in lawnmower initializeState: ${JSON.stringify(error)}` });
        }
    },

    applyState(deviceEl, state) {
        const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
        deviceData.mowerStatus = state.status ?? null;
        deviceData.mowerBattery = (typeof state.battery === 'number') ? state.battery : null;
        deviceData.mowerError = state.error ?? null;
        deviceData.mowerAlarm = state.alarm === true;
        deviceEl.setAttribute('data-device', JSON.stringify(deviceData));
        this.render(deviceEl);
    },

    render(deviceEl) {
        const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
        const hasProblem = deviceData.mowerAlarm || !!deviceData.mowerError;

        const label = deviceEl.querySelector('.measure-value-label');
        if (label) {
            label.textContent = deviceData.mowerStatus || '--';
        }

        // Only highlight for an actual problem — we deliberately don't
        // guess a "highlight while mowing" treatment without knowing the
        // real status vocabulary yet (see file header).
        if (hasProblem) {
            deviceEl.style.background = 'rgba(255, 59, 48, 0.55)';
            deviceEl.style.boxShadow = '0 0 8px 2px rgba(255, 59, 48, 0.65)';
        } else {
            deviceEl.style.background = 'rgba(255, 255, 255, 0.35)';
            deviceEl.style.boxShadow = '0 0 8px 1px rgba(255, 255, 255, 0.45)';
        }

        const overlay = document.querySelector('.enum-modal-overlay');
        if (overlay && overlay.getAttribute('data-device-id') === deviceEl.getAttribute('data-homey-id')) {
            this.renderModalContent(overlay, deviceData);
        }
    },

    initializeInteractions(deviceEl) {
        attachTapHandler(deviceEl, () => this.showModal(deviceEl));
    },

    showModal(deviceEl) {
        if (document.querySelector('.enum-modal-overlay')) return;

        const deviceId = deviceEl.getAttribute('data-homey-id');
        const name = deviceEl.getAttribute('data-name');

        const overlay = document.createElement('div');
        overlay.className = 'enum-modal-overlay';
        overlay.setAttribute('data-device-id', deviceId);

        const modal = document.createElement('div');
        modal.className = 'enum-modal';
        modal.innerHTML = `
            <h2>${name}</h2>
            <div class="lawnmower-info"></div>
            <div class="lawnmower-buttons">
                <button type="button" data-action="start">Start</button>
                <button type="button" data-action="pause">Pause</button>
                <button type="button" data-action="resume">Fortsetzen</button>
                <button type="button" data-action="stop">Stopp</button>
                <button type="button" data-action="dock" style="grid-column: span 2;">Zur Ladestation</button>
                <button type="button" data-action="maintenance" style="grid-column: span 2;">Zum Wartungspunkt</button>
            </div>
            <button type="button" class="enum-modal-close">Done</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
        this.renderModalContent(overlay, deviceData);

        ['start', 'pause', 'resume', 'stop', 'dock', 'maintenance'].forEach(action => {
            modal.querySelector(`[data-action="${action}"]`).addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await Homey.api('PUT', `/devices/${deviceId}/capabilities/lawnmower`, {
                        value: { action }
                    });
                } catch (error) {
                    Homey.api('POST', '/error', { message: `Error sending lawnmower ${action}: ${JSON.stringify(error)}` });
                }
            });
        });

        const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
        modal.querySelector('.enum-modal-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    },

    renderModalContent(overlay, deviceData) {
        const info = overlay.querySelector('.lawnmower-info');
        if (!info) return;
        const battery = (deviceData.mowerBattery !== null && deviceData.mowerBattery !== undefined)
            ? `${Math.round(deviceData.mowerBattery)}%`
            : '--';
        let rows = `
            <div class="lawnmower-info-row">
                <span class="lawnmower-info-label">Status</span>
                <span class="lawnmower-info-value">${deviceData.mowerStatus || '--'}</span>
            </div>
            <div class="lawnmower-info-row">
                <span class="lawnmower-info-label">Akku</span>
                <span class="lawnmower-info-value">${battery}</span>
            </div>
        `;
        if (deviceData.mowerError) {
            rows += `
                <div class="lawnmower-info-row lawnmower-error-row">
                    <span class="lawnmower-info-label">Fehler</span>
                    <span class="lawnmower-info-value">${deviceData.mowerError}</span>
                </div>
            `;
        }
        info.innerHTML = rows;
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));

            if (capability === 'mower_status') {
                deviceData.mowerStatus = value;
            } else if (capability === 'measure_battery') {
                deviceData.mowerBattery = (typeof value === 'number') ? value : null;
            } else if (capability === 'mower_error') {
                deviceData.mowerError = value;
            } else if (capability === 'alarm_generic') {
                deviceData.mowerAlarm = value === true;
            } else {
                return;
            }

            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));
            this.render(deviceEl);
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in lawnmower handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    applyInitialRules() {}
};

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.lawnmower = lawnmowerRenderer;
