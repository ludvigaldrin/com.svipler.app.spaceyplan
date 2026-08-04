const lockRenderer = {
    id: 'lock',
    lastClickTimes: new Map(), // Track last click time per device

    BATTERY_WARN_THRESHOLD: 20,

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

        // Reuse the same icon sizing rules as the other capabilities
        // (deviceIconStyles is shared and only added once)
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

        if (!document.getElementById('lockDeviceStyles')) {
            const styles = document.createElement('style');
            styles.id = 'lockDeviceStyles';
            styles.textContent = `
                .lock-battery-badge {
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    width: 13px;
                    height: 13px;
                    border-radius: 50%;
                    background: #f39c12;
                    color: #fff;
                    font-size: 9px;
                    line-height: 13px;
                    text-align: center;
                    font-weight: bold;
                    pointer-events: none;
                    display: none;
                    z-index: 301;
                }
                .lock-confirm-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .lock-confirm-modal {
                    background: rgba(245, 245, 245, 0.97);
                    border-radius: 15px;
                    padding: 16px;
                    width: 240px;
                    max-width: 90vw;
                    text-align: center;
                    font-family: inherit;
                }
                .lock-confirm-modal h2 {
                    margin: 0 0 6px 0;
                    font-size: 16px;
                    color: #333;
                }
                .lock-confirm-modal p {
                    margin: 0 0 14px 0;
                    font-size: 13px;
                    color: #666;
                }
                .lock-confirm-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                }
                .lock-confirm-buttons button {
                    flex: 1;
                    padding: 9px 0;
                    border: none;
                    border-radius: 9px;
                    font-size: 14px;
                    cursor: pointer;
                }
                .lock-confirm-cancel {
                    background: #dcdcdc;
                    color: #333;
                }
                .lock-confirm-unlock {
                    background: #e74c3c;
                    color: #fff;
                    font-weight: bold;
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
        deviceEl.setAttribute('data-state', device.state || false);
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'icon-wrapper';

        // Use the device's own selected icon, exactly like onoff/sensor,
        // instead of a fixed padlock glyph
        if (device.iconObj) {
            const img = document.createElement('img');
            if (device.iconObj.base64) {
                img.src = device.iconObj.base64;
            } else if (device.iconObj.url) {
                img.src = device.iconObj.url;
            }
            img.className = 'device-icon';
            img.style.pointerEvents = 'auto';
            img.style.cursor = 'pointer';
            img.style.userSelect = 'none';
            img.style.webkitUserSelect = 'none';
            img.style.webkitTouchCallout = 'none';

            if (iconWrapper && img) {
                iconWrapper.appendChild(img);
            }
        }

        if (deviceEl && iconWrapper) {
            deviceEl.appendChild(iconWrapper);
        }

        // Low battery badge (hidden by default, shown after initializeState)
        const batteryBadge = document.createElement('div');
        batteryBadge.className = 'lock-battery-badge';
        batteryBadge.textContent = '!';
        batteryBadge.title = 'Low battery';
        if (deviceEl && batteryBadge) {
            deviceEl.appendChild(batteryBadge);
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
            Homey.api('POST', '/error', { message: `Error positioning lock device: ${JSON.stringify(error)}` });
        });

        // Apply configured rules (allIcon / allColor / onOffColor), same as onoff
        this.applyInitialRules(device, deviceEl);

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/lock`);

            if (response !== undefined && response !== null) {
                const locked = response.locked === true;

                deviceEl.setAttribute('data-state', locked);
                deviceEl.classList.toggle('on', locked);

                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.state = locked;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                this.applyInitialRules(deviceData, deviceEl);
                this.renderBattery(deviceEl, response.battery);
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [{ deviceId: deviceId, capability: 'locked' }]
            });

        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in lock initializeState: ${JSON.stringify(error)}` });
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

    attachIconEvents(icon, deviceEl) {
        if (!icon) return;

        let touchStartTime = 0;
        let touchMoved = false;
        let touchStartX = 0;
        let touchStartY = 0;
        const TOUCH_TOLERANCE = 10;

        const handleTouchStart = (e) => {
            e.preventDefault();
            e.stopPropagation();

            touchStartTime = Date.now();
            touchMoved = false;

            if (e.touches && e.touches[0]) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }

            deviceEl.style.opacity = '0.8';
        };

        const handleTouchMove = (e) => {
            if (e.touches && e.touches[0]) {
                const moveX = Math.abs(e.touches[0].clientX - touchStartX);
                const moveY = Math.abs(e.touches[0].clientY - touchStartY);

                if (moveX > TOUCH_TOLERANCE || moveY > TOUCH_TOLERANCE) {
                    touchMoved = true;
                }
            }
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const pressDuration = Date.now() - touchStartTime;
            deviceEl.style.opacity = '1';

            if (!touchMoved && pressDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchStartTime = 0;
            touchMoved = false;
        };

        const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleClick(deviceEl);
        };

        icon.addEventListener('touchstart', handleTouchStart, { passive: false });
        icon.addEventListener('touchmove', handleTouchMove, { passive: false });
        icon.addEventListener('touchend', handleTouchEnd, { passive: false });
        icon.addEventListener('click', handleClick);
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

    async handleClick(deviceEl) {
        try {
            const deviceId = deviceEl.getAttribute('data-homey-id');
            const now = Date.now();
            const lastClickTime = this.lastClickTimes.get(deviceId) || 0;

            // Prevent double-clicks within 500ms (locks are slow actuators)
            if (now - lastClickTime < 500) {
                return;
            }
            this.lastClickTimes.set(deviceId, now);

            const currentlyLocked = deviceEl.getAttribute('data-state') === 'true';

            if (currentlyLocked) {
                // Unlocking is security relevant: always confirm first
                this.showUnlockConfirmation(deviceEl, deviceId);
            } else {
                // Locking is always safe: do it immediately (optimistic UI)
                await this.setLockState(deviceEl, deviceId, true);
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in lock handleClick: ${JSON.stringify(error)}` });
        }
    },

    showUnlockConfirmation(deviceEl, deviceId) {
        // Never show two dialogs at once
        if (document.querySelector('.lock-confirm-overlay')) return;

        const name = deviceEl.getAttribute('data-name');

        const overlay = document.createElement('div');
        overlay.className = 'lock-confirm-overlay';

        const modal = document.createElement('div');
        modal.className = 'lock-confirm-modal';
        modal.innerHTML = `
            <h2>${name}</h2>
            <p>Unlock this door?</p>
            <div class="lock-confirm-buttons">
                <button class="lock-confirm-cancel" type="button">Cancel</button>
                <button class="lock-confirm-unlock" type="button">Unlock</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        modal.querySelector('.lock-confirm-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            close();
        });

        modal.querySelector('.lock-confirm-unlock').addEventListener('click', async (e) => {
            e.stopPropagation();
            close();
            await this.setLockState(deviceEl, deviceId, false);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    },

    async setLockState(deviceEl, deviceId, locked) {
        try {
            // Optimistic UI update
            deviceEl.setAttribute('data-state', locked);
            deviceEl.classList.toggle('on', locked);
            this.handleDeviceUpdate(deviceEl, locked, 'lock');

            await Homey.api('PUT', `/devices/${deviceId}/capabilities/lock`, {
                value: locked
            });
        } catch (error) {
            // Revert optimistic update on failure
            deviceEl.setAttribute('data-state', !locked);
            deviceEl.classList.toggle('on', !locked);
            this.handleDeviceUpdate(deviceEl, !locked, 'lock');
            Homey.api('POST', '/error', { message: `Error setting lock state: ${JSON.stringify(error)}` });
        }
    },

    // Realtime updates coming in from Homey (e.g. locked via keypad)
    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            deviceEl.setAttribute('data-state', value);
            deviceEl.classList.toggle('on', value);

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.state = value;
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

            const iconWrapper = deviceEl.querySelector('.icon-wrapper');

            // Reset cloud effect first
            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            const allColorRule = deviceData.rules?.find(r => r.type === 'allColor');
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
                    iconWrapper.style.display = allColorRule.config.showIcon ? 'flex' : 'none';
                    if (allColorRule.config.showIcon) {
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

            // Only process onOffColor if no allColor rule exists
            const onOffColorRule = deviceData.rules?.find(r => r.type === 'onOffColor');
            if (!allColorRule && onOffColorRule?.config) {
                const currentColor = value ? onOffColorRule.config.cloudColorOn : onOffColorRule.config.cloudColorOff;
                const showCloud = value ? onOffColorRule.config.showCloudOn : onOffColorRule.config.showCloudOff;
                const showIcon = value ? onOffColorRule.config.showIconOn : onOffColorRule.config.showIconOff;
                const iconColor = value ? onOffColorRule.config.iconColorOn : onOffColorRule.config.iconColorOff;

                if (showCloud && currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                if (iconWrapper) {
                    iconWrapper.style.display = showIcon ? 'flex' : 'none';
                    if (showIcon) {
                        const iconElement = iconWrapper.querySelector('img, .material-symbols-outlined');
                        if (iconElement && iconColor) {
                            if (iconElement.tagName.toLowerCase() === 'img') {
                                iconElement.style.filter = `brightness(0) saturate(100%) drop-shadow(0 0 4px ${iconColor})`;
                            } else {
                                iconElement.style.color = iconColor;
                                iconElement.style.filter = `drop-shadow(0 0 4px ${iconColor})`;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in lock handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    applyInitialRules(device, deviceEl) {
        try {
            const iconWrapper = deviceEl.querySelector('.icon-wrapper');
            const currentState = device.state === true;

            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            // allIcon: replace the device's own icon with a chosen symbol
            const allIconRule = device.rules?.find(r => r.type === 'allIcon');
            if (allIconRule?.config?.selectedIcon) {
                if (iconWrapper) {
                    iconWrapper.innerHTML = '';

                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'material-symbols-outlined';
                    iconSpan.textContent = allIconRule.config.selectedIcon;

                    if (iconWrapper && iconSpan) {
                        iconWrapper.appendChild(iconSpan);
                        this.attachIconEvents(iconSpan, deviceEl);
                    }

                    iconWrapper.style.display = 'flex';
                    iconSpan.style.fontSize = '18px';
                }
            }

            // allColor takes priority over onOffColor, same as onoff.js
            const allColorRule = device.rules?.find(r => r.type === 'allColor');
            if (allColorRule?.config) {
                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-all-color', allColorRule.config.cloudColor || allColorRule.config.mainColor);

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
                        iconWrapper.style.display = 'none';
                    } else {
                        iconWrapper.style.display = 'flex';
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

            // onOffColor: locked = "on", unlocked = "off"
            const onOffColorRule = device.rules?.find(r => r.type === 'onOffColor');
            if (!allColorRule && onOffColorRule?.config) {
                const currentColor = currentState ? onOffColorRule.config.cloudColorOn : onOffColorRule.config.cloudColorOff;
                const showCloud = currentState ? onOffColorRule.config.showCloudOn : onOffColorRule.config.showCloudOff;
                const showIcon = currentState ? onOffColorRule.config.showIconOn : onOffColorRule.config.showIconOff;
                const iconColor = currentState ? onOffColorRule.config.iconColorOn : onOffColorRule.config.iconColorOff;

                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', onOffColorRule.config.cloudColorOn);
                deviceEl.setAttribute('data-off-color', onOffColorRule.config.cloudColorOff);

                if (showCloud) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                if (iconWrapper) {
                    if (!showIcon) {
                        iconWrapper.style.display = 'none';
                    } else {
                        iconWrapper.style.display = 'flex';
                        const iconElement = iconWrapper.querySelector('img, .material-symbols-outlined');
                        if (iconElement && iconColor) {
                            if (iconElement.tagName.toLowerCase() === 'img') {
                                iconElement.style.filter = `brightness(0) saturate(100%) drop-shadow(0 0 4px ${iconColor})`;
                            } else {
                                iconElement.style.color = iconColor;
                                iconElement.style.filter = `drop-shadow(0 0 4px ${iconColor})`;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in lock applyInitialRules: ${JSON.stringify(error)}` });
        }
    },

    renderBattery(deviceEl, battery) {
        const badge = deviceEl.querySelector('.lock-battery-badge');
        if (!badge) return;

        if (typeof battery === 'number' && battery <= this.BATTERY_WARN_THRESHOLD) {
            badge.style.display = 'block';
            badge.title = `Battery: ${battery}%`;
        } else {
            badge.style.display = 'none';
        }
    }
};

// Register the renderer
window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.lock = lockRenderer;
