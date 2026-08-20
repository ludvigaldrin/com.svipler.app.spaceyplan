const thermostatRenderer = {
    id: 'thermostat',

    // Fixed range/step, matching the settings-side choice (0.5°C steps,
    // 5-30°C — standard radiator thermostat range). Not read per-device.
    MIN: 5,
    MAX: 30,
    STEP: 0.5,

    createDeviceElement(device, position) {
        const deviceEl = document.createElement('div');
        deviceEl.className = this.id + '-device';

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

        // Shared icon sizing rules (already added once by other renderers)
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
            if (document.head && styles) {
                document.head.appendChild(styles);
            }
        }

        // Reuse the same always-visible value-badge style used by measure
        // devices, so a setpoint reads the same way a sensor reading does.
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
            if (document.head && labelStyles) {
                document.head.appendChild(labelStyles);
            }
        }

        if (!document.getElementById('thermostatModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'thermostatModalStyles';
            styles.textContent = `
                .thermostat-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .thermostat-modal {
                    background: rgba(245, 245, 245, 0.97);
                    border-radius: 15px;
                    padding: 20px;
                    width: 260px;
                    max-width: 90vw;
                    text-align: center;
                    font-family: inherit;
                }
                .thermostat-modal h2 {
                    margin: 0 0 4px 0;
                    font-size: 16px;
                    color: #333;
                }
                .thermostat-value-row {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 14px;
                    margin: 8px 0 16px 0;
                }
                .thermostat-step-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: none;
                    background: #dcdcdc;
                    color: #333;
                    font-size: 20px;
                    line-height: 1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .thermostat-value-display {
                    font-size: 26px;
                    font-weight: 700;
                    color: #333;
                    min-width: 80px;
                }
                .thermostat-slider-track {
                    position: relative;
                    height: 36px;
                    border-radius: 18px;
                    background: #dcdcdc;
                    margin-bottom: 18px;
                    touch-action: none;
                    cursor: pointer;
                }
                .thermostat-slider-fill {
                    position: absolute;
                    top: 0; left: 0; bottom: 0;
                    border-radius: 18px;
                    background: #e67e22;
                    pointer-events: none;
                }
                .thermostat-slider-thumb {
                    position: absolute;
                    top: 50%;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    background: #fff;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                }
                .thermostat-modal-close {
                    padding: 9px 20px;
                    border: none;
                    border-radius: 9px;
                    font-size: 14px;
                    cursor: pointer;
                    background: #dcdcdc;
                    color: #333;
                }
            `;
            if (document.head && styles) {
                document.head.appendChild(styles);
            }
        }

        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-homey-id', device.homeyId);
        deviceEl.setAttribute('data-capability', this.id);
        deviceEl.setAttribute('data-value', device.targetTemperature ?? '');
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'icon-wrapper';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-outlined';
        iconSpan.textContent = 'device_thermostat';
        iconSpan.style.pointerEvents = 'auto';
        iconSpan.style.cursor = 'pointer';
        iconSpan.style.userSelect = 'none';
        iconSpan.style.webkitUserSelect = 'none';
        iconSpan.style.webkitTouchCallout = 'none';
        iconSpan.style.fontSize = '22px';
        if (iconWrapper && iconSpan) {
            iconWrapper.appendChild(iconSpan);
        }

        if (deviceEl && iconWrapper) {
            deviceEl.appendChild(iconWrapper);
        }

        const valueLabel = document.createElement('div');
        valueLabel.className = 'measure-value-label';
        valueLabel.textContent = this.formatValue(device.targetTemperature);
        if (deviceEl && valueLabel) {
            deviceEl.appendChild(valueLabel);
        }

        const positionDevice = () => {
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

                        if (imageWidth < wrapperRect.width) {
                            displayX += (wrapperRect.width - imageWidth) / 2;
                        }
                        if (imageHeight < wrapperRect.height) {
                            displayY += (wrapperRect.height - imageHeight) / 2;
                        }
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
        };

        positionDevice().catch(error => {
            Homey.api('POST', '/error', { message: `Error positioning thermostat device: ${JSON.stringify(error)}` });
        });

        this.applyInitialRules(device, deviceEl);

        return deviceEl;
    },

    formatValue(value) {
        if (value === undefined || value === null || Number.isNaN(value)) return '--°';
        // Whole-degree values print without a trailing ".0" (matches the
        // measure.js convention of not showing meaningless decimals).
        const rounded = Math.round(value * 2) / 2;
        return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + '°';
    },

    clampAndRound(value) {
        const clamped = Math.max(this.MIN, Math.min(this.MAX, value));
        return Math.round(clamped / this.STEP) * this.STEP;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/thermostat`);

            if (response !== undefined && response !== null) {
                const value = typeof response.value === 'number' ? response.value : null;

                deviceEl.setAttribute('data-value', value ?? '');

                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.targetTemperature = value;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                const valueLabel = deviceEl.querySelector('.measure-value-label');
                if (valueLabel) {
                    valueLabel.textContent = this.formatValue(value);
                }
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [{ deviceId: deviceId, capability: 'target_temperature' }]
            });

        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in thermostat initializeState: ${JSON.stringify(error)}` });
        }
    },

    initializeInteractions(deviceEl) {
        if (!deviceEl || !deviceEl.addEventListener) {
            return;
        }

        const icon = deviceEl.querySelector('.device-icon, .material-symbols-outlined');
        if (icon) {
            this.attachIconEvents(icon, deviceEl);
        }
    },

    // No natural on/off toggle for a setpoint, so a plain tap opens the
    // modal directly (no long-press needed, unlike covers/speakers).
    attachIconEvents(icon, deviceEl) {
        if (!icon) return;

        let pressStartTime = 0;
        let moved = false;
        let startX = 0;
        let startY = 0;
        const TOLERANCE = 10;

        const restoreVisuals = () => {
            deviceEl.style.transition = '';
            deviceEl.style.opacity = '1';
        };

        const start = (clientX, clientY) => {
            pressStartTime = Date.now();
            moved = false;
            startX = clientX;
            startY = clientY;
            deviceEl.style.transition = 'none';
            deviceEl.style.opacity = '0.8';
        };

        const move = (clientX, clientY) => {
            const dx = Math.abs(clientX - startX);
            const dy = Math.abs(clientY - startY);
            if (dx > TOLERANCE || dy > TOLERANCE) {
                moved = true;
            }
        };

        const end = () => {
            restoreVisuals();
            if (!moved) {
                this.showThermostatModal(deviceEl);
            }
        };

        icon.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const t = e.touches[0];
            if (t) start(t.clientX, t.clientY);
        }, { passive: false });

        icon.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const t = e.touches[0];
            if (t) move(t.clientX, t.clientY);
        }, { passive: false });

        icon.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            end();
        }, { passive: false });

        icon.addEventListener('touchcancel', () => {
            restoreVisuals();
        }, { passive: true });

        icon.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            start(e.clientX, e.clientY);

            const onMove = (ev) => move(ev.clientX, ev.clientY);
            const onUp = (ev) => {
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
        icon.style.webkitUserSelect = 'none';
        icon.style.webkitTouchCallout = 'none';

        if (icon.tagName.toLowerCase() === 'img') {
            icon.draggable = false;
            icon.addEventListener('dragstart', (e) => e.preventDefault());
        }
    },

    async setValue(deviceEl, deviceId, targetValue) {
        const previousValue = parseFloat(deviceEl.getAttribute('data-value'));
        try {
            // Optimistic UI update
            this.handleDeviceUpdate(deviceEl, targetValue, 'target_temperature');

            await Homey.api('PUT', `/devices/${deviceId}/capabilities/thermostat`, {
                value: targetValue
            });
        } catch (error) {
            // Revert on failure
            this.handleDeviceUpdate(deviceEl, previousValue, 'target_temperature');
            Homey.api('POST', '/error', { message: `Error setting thermostat value: ${JSON.stringify(error)}` });
        }
    },

    showThermostatModal(deviceEl) {
        if (document.querySelector('.thermostat-modal-overlay')) return;

        const deviceId = deviceEl.getAttribute('data-homey-id');
        const name = deviceEl.getAttribute('data-name');
        let value = parseFloat(deviceEl.getAttribute('data-value'));
        if (Number.isNaN(value)) value = this.MIN;

        const overlay = document.createElement('div');
        overlay.className = 'thermostat-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'thermostat-modal';
        modal.innerHTML = `
            <h2>${name}</h2>
            <div class="thermostat-value-row">
                <button type="button" class="thermostat-step-btn" data-step="-1">−</button>
                <div class="thermostat-value-display">${this.formatValue(value)}</div>
                <button type="button" class="thermostat-step-btn" data-step="1">+</button>
            </div>
            <div class="thermostat-slider-track">
                <div class="thermostat-slider-fill"></div>
                <div class="thermostat-slider-thumb"></div>
            </div>
            <button type="button" class="thermostat-modal-close">Done</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const track = modal.querySelector('.thermostat-slider-track');
        const fill = modal.querySelector('.thermostat-slider-fill');
        const thumb = modal.querySelector('.thermostat-slider-thumb');
        const valueDisplay = modal.querySelector('.thermostat-value-display');

        const renderSlider = (val) => {
            const pct = ((val - this.MIN) / (this.MAX - this.MIN)) * 100;
            fill.style.width = `${pct}%`;
            thumb.style.left = `${pct}%`;
            valueDisplay.textContent = this.formatValue(val);
        };
        renderSlider(value);

        const previewOnMap = (val) => {
            this.handleDeviceUpdate(deviceEl, val, 'target_temperature');
        };

        let dragging = false;

        const posFromEvent = (clientX) => {
            const rect = track.getBoundingClientRect();
            const ratio = (clientX - rect.left) / rect.width;
            const raw = this.MIN + Math.max(0, Math.min(1, ratio)) * (this.MAX - this.MIN);
            return this.clampAndRound(raw);
        };

        const onDragMove = (clientX) => {
            value = posFromEvent(clientX);
            renderSlider(value);
            previewOnMap(value);
        };

        track.addEventListener('mousedown', (e) => {
            dragging = true;
            onDragMove(e.clientX);
            const onMove = (ev) => dragging && onDragMove(ev.clientX);
            const onUp = async () => {
                dragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                await this.setValue(deviceEl, deviceId, value);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        track.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            onDragMove(e.touches[0].clientX);
        }, { passive: false });

        track.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragging) onDragMove(e.touches[0].clientX);
        }, { passive: false });

        track.addEventListener('touchend', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dragging) return;
            dragging = false;
            await this.setValue(deviceEl, deviceId, value);
        }, { passive: false });

        modal.querySelectorAll('.thermostat-step-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const direction = parseFloat(btn.getAttribute('data-step'));
                value = this.clampAndRound(value + direction * this.STEP);
                renderSlider(value);
                await this.setValue(deviceEl, deviceId, value);
            });
        });

        const close = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        modal.querySelector('.thermostat-modal-close').addEventListener('click', (e) => {
            e.stopPropagation();
            close();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    },

    // Realtime updates from Homey, and optimistic local updates
    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            const numValue = typeof value === 'number' ? value : parseFloat(value);

            deviceEl.setAttribute('data-value', Number.isNaN(numValue) ? '' : numValue);

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.targetTemperature = numValue;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

            const valueLabel = deviceEl.querySelector('.measure-value-label');
            if (valueLabel) {
                valueLabel.textContent = this.formatValue(numValue);
            }

            // Keep an open modal's slider/label in sync (e.g. after a
            // realtime update from Homey while the modal is open)
            const modal = document.querySelector('.thermostat-modal-overlay');
            if (modal) {
                const fill = modal.querySelector('.thermostat-slider-fill');
                const thumb = modal.querySelector('.thermostat-slider-thumb');
                const valueDisplay = modal.querySelector('.thermostat-value-display');
                if (fill && thumb && valueDisplay && !Number.isNaN(numValue)) {
                    const pct = ((numValue - this.MIN) / (this.MAX - this.MIN)) * 100;
                    fill.style.width = `${pct}%`;
                    thumb.style.left = `${pct}%`;
                    valueDisplay.textContent = this.formatValue(numValue);
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in thermostat handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    applyInitialRules(device, deviceEl) {
        try {
            const iconWrapper = deviceEl.querySelector('.icon-wrapper');

            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            const allColorRule = device.rules?.find(r => r.type === 'allColor');
            if (allColorRule?.config) {
                if (allColorRule.config.showCloud) {
                    const color = allColorRule.config.cloudColor || allColorRule.config.mainColor;
                    deviceEl.style.backgroundColor = `${color}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${color}90`;
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${color}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${color}E0`;
                    }
                }

                if (iconWrapper) {
                    if (!allColorRule.config.showIcon) {
                        iconWrapper.style.opacity = '0';
                    } else {
                        iconWrapper.style.opacity = '1';
                        const iconElement = iconWrapper.querySelector('img, .material-symbols-outlined');
                        if (iconElement && allColorRule.config.iconColor) {
                            if (iconElement.tagName.toLowerCase() === 'img') {
                                iconElement.style.filter = `brightness(0) saturate(100%) drop-shadow(0 0 4px ${allColorRule.config.iconColor})`;
                            } else {
                                iconElement.style.color = allColorRule.config.iconColor;
                                iconElement.style.filter = `drop-shadow(0 0 4px ${allColorRule.config.iconColor})`;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in thermostat applyInitialRules: ${JSON.stringify(error)}` });
        }
    }
};

// Register the renderer
window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.thermostat = thermostatRenderer;
