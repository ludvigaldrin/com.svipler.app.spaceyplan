const sensorRenderer = {
    id: 'sensor',

    createDeviceElement(device, position) {
        const deviceEl = document.createElement('div');
        deviceEl.className = this.id + '-device';
        
        deviceEl.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 28px;
            height: 28px;
            cursor: pointer;
            z-index: 300;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            opacity: 0;  // Start hidden until positioned
            background: rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 12px 3px rgba(255, 255, 255, 0.45);
        `;

        // Store position data for later use
        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);

        // Store device attributes
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.deviceId);
        deviceEl.setAttribute('data-capability', 'sensor');
        deviceEl.setAttribute('data-sensor-type', device.sensorType);
        deviceEl.setAttribute('data-state', device.state || false);

        // Store device data for later use
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        // Create a promise to handle image loading and positioning
        const positionDevice = () => {
            return new Promise((resolve) => {
                const floorMapImage = document.getElementById('floorMapImage');
                const wrapper = document.getElementById('imageWrapper');

                const setPosition = () => {
                    if (!floorMapImage || !wrapper) return;
                    if (!floorMapImage.complete || floorMapImage.naturalWidth === 0) return;

                    const wrapperRect = wrapper.getBoundingClientRect();
                    const displayX = (position.x / 100) * wrapperRect.width;
                    const displayY = (position.y / 100) * wrapperRect.height;

                    deviceEl.style.transform = `translate(${displayX}px, ${displayY}px)`;
                    deviceEl.style.opacity = '1';
                    resolve();
                };

                // Try to position immediately if image is loaded
                if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                    setPosition();
                } else if (floorMapImage) {
                    // Wait for image to load
                    floorMapImage.onload = setPosition;
                }

                // Retry positioning if initial attempt fails
                const retryInterval = setInterval(() => {
                    if (floorMapImage && floorMapImage.complete && floorMapImage.naturalWidth > 0) {
                        setPosition();
                        clearInterval(retryInterval);
                    }
                }, 100);

                // Clear interval after 5 seconds to prevent infinite retries
                setTimeout(() => clearInterval(retryInterval), 5000);
            });
        };

        // Execute positioning
        positionDevice().catch(error => {
            console.error('Error positioning device:', error);
            Homey.api('POST', '/log', { message: `Error positioning device: ${error.message}` });
        });

        // Add icon if available
        if (device.iconObj?.url) {
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'icon-wrapper';
            iconWrapper.style.cssText = `
                width: 14px;
                height: 14px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.9);
                border-radius: 50%;
                box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
            `;

            const img = document.createElement('img');
            img.src = device.iconObj.url;
            img.style.cssText = `
                width: 14px;
                height: 14px;
                object-fit: contain;
                position: relative;
                z-index: 1;
            `;

            iconWrapper.appendChild(img);
            deviceEl.appendChild(iconWrapper);
        }

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            // Get the sensor type from the device element
            const sensorType = deviceEl.getAttribute('data-sensor-type');

            if (!sensorType) {
                console.error('No sensor type found for device:', deviceId);
                return;
            }

            // Get the state using the specific sensor type
          
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/sensor`);

            if (response !== undefined) {
                deviceEl.setAttribute('data-state', response);
                deviceEl.classList.toggle('on', response);
            }

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
            deviceData.state = response;

            this.applyInitialColorRules(deviceData, deviceEl);

            // Subscribe using the specific sensor type
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [{ deviceId, capability: sensorType }]
            });
        } catch (error) {
            console.error('Error initializing sensor state:', error);
        }
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        if (!deviceEl) return;

        deviceEl.setAttribute('data-state', value);
        deviceEl.classList.toggle('on', value);


        if (deviceEl.getAttribute('data-color-rule') === 'true') {
            const allColor = deviceEl.getAttribute('data-all-color');
            if (allColor) {
                deviceEl.style.backgroundColor = `${allColor}59`;
                deviceEl.style.boxShadow = `0 0 12px 3px ${allColor}73`;
                const iconWrapper = deviceEl.querySelector('.icon-wrapper');
                if (iconWrapper) {
                    iconWrapper.style.backgroundColor = `${allColor}E6`;
                    iconWrapper.style.boxShadow = `0 0 8px ${allColor}CC`;
                }
            } else {
                const onColor = deviceEl.getAttribute('data-on-color');
                const offColor = deviceEl.getAttribute('data-off-color');
                const currentColor = value ? onColor : offColor;
                if (currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}59`;
                    deviceEl.style.boxShadow = `0 0 12px 3px ${currentColor}73`;
                    const iconWrapper = deviceEl.querySelector('.icon-wrapper');
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}E6`;
                        iconWrapper.style.boxShadow = `0 0 8px ${currentColor}CC`;
                    }
                }
            }
        }
    },

    applyInitialColorRules(device, deviceEl) {
        deviceEl.setAttribute('data-device', JSON.stringify(device));
        const iconWrapper = deviceEl.querySelector('.icon-wrapper');

        const allColorRule = device.rules?.find(r => r.type === 'allColor');
        if (allColorRule?.config?.mainColor) {
            deviceEl.setAttribute('data-all-color', allColorRule.config.mainColor);
            deviceEl.setAttribute('data-color-rule', 'true');
            deviceEl.style.backgroundColor = `${allColorRule.config.mainColor}59`;
            deviceEl.style.boxShadow = `0 0 12px 3px ${allColorRule.config.mainColor}73`;
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = `${allColorRule.config.mainColor}E6`;
                iconWrapper.style.boxShadow = `0 0 8px ${allColorRule.config.mainColor}CC`;
            }
        } else {
            const iconColorRule = device.rules?.find(r => r.type === 'iconColor');
            if (iconColorRule?.config) {
                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', iconColorRule.config.onColor);
                deviceEl.setAttribute('data-off-color', iconColorRule.config.offColor);

                const currentState = device.state === true;
                const initialColor = currentState ? iconColorRule.config.onColor : iconColorRule.config.offColor;
                
                deviceEl.style.backgroundColor = `${initialColor}59`;
                deviceEl.style.boxShadow = `0 0 12px 3px ${initialColor}73`;
                if (iconWrapper) {
                    iconWrapper.style.backgroundColor = `${initialColor}E6`;
                    iconWrapper.style.boxShadow = `0 0 8px ${initialColor}CC`;
                }
            }
        }
    },

    initializeInteractions(deviceEl) {
        // For sensors, we only need to show info on click/touch
        let touchStartTime;
        let longPressTimer;
        let touchMoved = false;

        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();

            touchStartTime = Date.now();
            touchMoved = false;

            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    this.showDeviceModal(deviceEl);
                }
            }, 500);
        }, { passive: false });

        deviceEl.addEventListener('touchmove', (e) => {
            e.stopPropagation();
            touchMoved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        deviceEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            const touchDuration = Date.now() - touchStartTime;

            if (!touchMoved && touchDuration < 500) {
                this.showDeviceModal(deviceEl);
            }

            touchMoved = false;
        }, { passive: false });

        // Keep click for desktop/testing
        deviceEl.addEventListener('click', () => {
            this.showDeviceModal(deviceEl);
        });
    },

    showDeviceModal(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const deviceId = deviceEl.getAttribute('data-device-id');
        const sensorType = deviceEl.getAttribute('data-sensor-type');
        const currentState = deviceEl.getAttribute('data-state') === 'true';

        const overlay = document.createElement('div');
        overlay.className = 'device-modal-overlay';
        overlay.style.cssText = `
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
        `;

        const modal = document.createElement('div');
        modal.className = 'device-modal';
        modal.innerHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            <div class="sensor-status">
                <div class="status-indicator ${currentState ? 'active' : ''}"></div>
                <span>${sensorType === 'alarm_contact' ? 'Contact' : 'Motion'} Sensor: ${currentState ? 'Triggered' : 'Not Triggered'}</span>
            </div>
        `;

        // Add styles if not present
        if (!document.getElementById('sensorModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'sensorModalStyles';
            styles.textContent = `
                .device-modal {
                    background: rgba(245, 245, 245, 0.95);
                    border-radius: 15px;
                    padding: 20px;
                    width: 260px;
                    max-width: 90vw;
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .modal-header h2 {
                    margin: 0;
                    font-size: 18px;
                    color: #333;
                }
                .close-button {
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: #333;
                    cursor: pointer;
                    padding: 5px;
                }
                .sensor-status {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px;
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 8px;
                }
                .status-indicator {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: #666;
                }
                .status-indicator.active {
                    background: #ff3b30;
                }
            `;
            document.head.appendChild(styles);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close modal when clicking outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Add close button handler
        const closeButton = modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            overlay.remove();
        });
    }
}; 

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.sensor = sensorRenderer;