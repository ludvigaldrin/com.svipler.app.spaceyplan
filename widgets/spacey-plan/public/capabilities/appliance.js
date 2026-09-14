// Washer/dryer status display (V-ZUG and similar community integrations
// that expose a status string plus running-program info, but no
// start/stop/pause control). Reuses the shared badge/modal/positioning
// helpers defined in alarm.js (ensureSharedStyles, baseDeviceElement,
// attachTapHandler) — this file must be loaded after alarm.js in
// index.html so those globals already exist.

function ensureApplianceStyles() {
    if (document.getElementById('applianceModalStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'applianceModalStyles';
    styles.textContent = `
        .appliance-info {
            text-align: left;
            margin-bottom: 14px;
        }
        .appliance-info-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 6px 0;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
            font-size: 14px;
        }
        .appliance-info-row:last-child {
            border-bottom: none;
        }
        .appliance-info-label {
            color: #777;
        }
        .appliance-info-value {
            color: #1C1C1E;
            font-weight: 600;
            text-align: right;
        }
    `;
    document.head.appendChild(styles);
}

function makeApplianceRenderer(rendererId, apiCapabilityId, statusHomeyCapabilityId, iconName, activeStatusValue) {
    return {
        id: rendererId,

        createDeviceElement(device, position) {
            ensureApplianceStyles();
            return baseDeviceElement(rendererId, iconName, device, position);
        },

        async initializeState(deviceEl, deviceId, widgetId) {
            try {
                const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/${apiCapabilityId}`);
                if (response) {
                    this.applyState(deviceEl, response);
                }

                await Homey.api('POST', `/subscribeToDevices`, {
                    widgetId: widgetId,
                    devices: [
                        { deviceId: deviceId, capability: statusHomeyCapabilityId },
                        { deviceId: deviceId, capability: 'program_name' },
                        { deviceId: deviceId, capability: 'program_remaining_time' },
                        { deviceId: deviceId, capability: 'program_end_time' }
                    ]
                });
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} initializeState: ${JSON.stringify(error)}` });
            }
        },

        applyState(deviceEl, state) {
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.applianceStatus = state.status ?? null;
            deviceData.applianceProgram = state.programName ?? null;
            deviceData.applianceRemaining = state.remainingTime ?? null;
            deviceData.applianceEndTime = state.endTime ?? null;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));
            this.render(deviceEl);
        },

        render(deviceEl) {
            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            const status = deviceData.applianceStatus;
            const remaining = deviceData.applianceRemaining;
            const isActive = status === activeStatusValue;

            const label = deviceEl.querySelector('.measure-value-label');
            if (label) {
                // Prefer the remaining time once V-ZUG has calculated it —
                // right after a program starts, status flips to "active"
                // before a remaining time is available, so fall back to
                // the status text itself until it is.
                if (isActive && remaining && remaining !== '-') {
                    label.textContent = remaining;
                } else {
                    label.textContent = status || '--';
                }
            }

            // Simple highlight while running. Unlike the alarm/measure
            // renderers there's no per-device configurable color rule for
            // this — just one fixed "running" treatment, applied directly.
            if (isActive) {
                deviceEl.style.background = 'rgba(52, 152, 219, 0.55)';
                deviceEl.style.boxShadow = '0 0 8px 2px rgba(52, 152, 219, 0.65)';
            } else {
                deviceEl.style.background = 'rgba(255, 255, 255, 0.35)';
                deviceEl.style.boxShadow = '0 0 8px 1px rgba(255, 255, 255, 0.45)';
            }

            // Keep an open info panel for this exact device in sync too
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
                <div class="appliance-info"></div>
                <button type="button" class="enum-modal-close">Done</button>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            this.renderModalContent(overlay, deviceData);

            const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
            modal.querySelector('.enum-modal-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        },

        renderModalContent(overlay, deviceData) {
            const info = overlay.querySelector('.appliance-info');
            if (!info) return;
            const rows = [
                ['Status', deviceData.applianceStatus || '--'],
                ['Programm', (deviceData.applianceProgram && deviceData.applianceProgram !== '-') ? deviceData.applianceProgram : '--'],
                ['Restzeit', (deviceData.applianceRemaining && deviceData.applianceRemaining !== '-') ? deviceData.applianceRemaining : '--'],
                ['Ende', (deviceData.applianceEndTime && deviceData.applianceEndTime !== '--:--') ? deviceData.applianceEndTime : '--']
            ];
            info.innerHTML = rows.map(([label, value]) => `
                <div class="appliance-info-row">
                    <span class="appliance-info-label">${label}</span>
                    <span class="appliance-info-value">${value}</span>
                </div>
            `).join('');
        },

        handleDeviceUpdate(deviceEl, value, capability) {
            try {
                if (!deviceEl) return;
                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));

                if (capability === statusHomeyCapabilityId) {
                    deviceData.applianceStatus = value;
                } else if (capability === 'program_name') {
                    deviceData.applianceProgram = value;
                } else if (capability === 'program_remaining_time') {
                    deviceData.applianceRemaining = value;
                } else if (capability === 'program_end_time') {
                    deviceData.applianceEndTime = value;
                } else {
                    return;
                }

                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));
                this.render(deviceEl);
            } catch (error) {
                Homey.api('POST', '/error', { message: `Error in ${rendererId} handleDeviceUpdate: ${JSON.stringify(error)}` });
            }
        },

        applyInitialRules() {}
    };
}

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.washer = makeApplianceRenderer('washer', 'washer', 'washer_status', 'local_laundry_service', 'Aktiv');
window.capabilityRenderers.dryer = makeApplianceRenderer('dryer', 'dryer', 'dryer_status', 'dry_cleaning', 'Aktiv');
