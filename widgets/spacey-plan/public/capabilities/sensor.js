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

        // Add device icon styles if not already present
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
                    font-size: 18px; /* 10% smaller than before */
                }
            `;
            document.head.appendChild(styles);
        }

        deviceEl.setAttribute('data-x', position.x);
        deviceEl.setAttribute('data-y', position.y);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-device-id', device.id);
        deviceEl.setAttribute('data-homey-id', device.homeyId);
        deviceEl.setAttribute('data-capability', this.id);
        deviceEl.setAttribute('data-state', device.state || false);
        deviceEl.setAttribute('data-device', JSON.stringify(device));

        deviceEl.setAttribute('data-sensor-type', device.sensorType);

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'icon-wrapper';

        // Add icon if available
        if (device.iconObj) {
            const img = document.createElement('img');
            // Use base64 data if available, otherwise fall back to URL
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
            
            // Defensive check before appendChild
            if (iconWrapper && img) {
                iconWrapper.appendChild(img);
            }
        }

        // Defensive check before appendChild
        if (deviceEl && iconWrapper) {
            deviceEl.appendChild(iconWrapper);
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
                        // Calculate the actual displayed image dimensions
                        let imageWidth, imageHeight;
                        
                        // If the image is constrained by height (taller than wide relative to container)
                        if (wrapperRect.width / wrapperRect.height > currentImageAspectRatio) {
                            imageHeight = wrapperRect.height;
                            imageWidth = imageHeight * currentImageAspectRatio;
                        } else {
                            // Image is constrained by width
                            imageWidth = wrapperRect.width;
                            imageHeight = imageWidth / currentImageAspectRatio;
                        }
                        
                        // Calculate the position based on the original aspect ratio
                        displayX = (position.x / 100) * imageWidth;
                        displayY = (position.y / 100) * imageHeight;
                        
                        // If the image doesn't fill the wrapper, add offsets to center it
                        if (imageWidth < wrapperRect.width) {
                            displayX += (wrapperRect.width - imageWidth) / 2;
                        }
                        if (imageHeight < wrapperRect.height) {
                            displayY += (wrapperRect.height - imageHeight) / 2;
                        }
                    } else {
                        // Fallback to the original calculation if no aspect ratio is stored
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

        // Execute positioning
        positionDevice().catch(() => {
            Homey.api('POST', '/error', { message: 'Error positioning device' });
        });

        // Apply initial rules
        this.applyInitialRules(device, deviceEl);

        return deviceEl;
    },

    async initializeState(deviceEl, deviceId, widgetId) {
        try {
            const sensorType = deviceEl.getAttribute('data-sensor-type');
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/sensor`);

            if (response !== undefined) {
                const onoff = response;
                deviceEl.setAttribute('data-state', onoff);
                deviceEl.classList.toggle('on', onoff);

                const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));
                deviceData.state = onoff;
                deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

                // Handle initial image visibility
                if (deviceEl.getAttribute('data-image-rule') === 'true') {
                    const ruleId = deviceEl.getAttribute('data-rule-id');
                    const imageEl = document.querySelector(`.state-image-${ruleId}`);

                    if (imageEl) {
                        const onOffImageRule = deviceData.rules?.find(r => r.id === ruleId);
                        if (onOffImageRule?.config) {
                            const showImage = onOffImageRule.config.showOn === onoff;
                            imageEl.style.display = showImage ? 'block' : 'none';
                        }
                    }
                }

                this.applyInitialRules(deviceData, deviceEl);
            }

            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: widgetId,
                devices: [{ deviceId, capability: sensorType },

                ]
            });

        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in initializeState: ${JSON.stringify(error)}` });
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

    async handleClick(deviceEl) {
        // For sensor devices, show modal on click
        this.showDeviceModal(deviceEl);
    },

    handleDeviceUpdate(deviceEl, value, capability) {
        try {
            if (!deviceEl) return;

            // Update state attribute and class
            deviceEl.setAttribute('data-state', value);
            deviceEl.classList.toggle('on', value);

            // Get device data and update state
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

            // Handle image rule
            if (deviceEl.getAttribute('data-image-rule') === 'true') {
                const ruleId = deviceEl.getAttribute('data-rule-id');
                const imageEl = document.querySelector(`.state-image-${ruleId}`);

                if (imageEl) {
                    const onOffImageRule = deviceData.rules?.find(r => r.id === ruleId);

                    if (onOffImageRule?.config) {
                        const showImage = onOffImageRule.config.showOn === value;
                        imageEl.style.display = showImage ? 'block' : 'none';
                    }
                }
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

                // Handle icon visibility and color
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

            // Only process alarmColor if no allColor rule exists
            const alarmColorRule = deviceData.rules?.find(r => r.type === 'alarmColor');
            if (alarmColorRule?.config) {
                const currentColor = value ? alarmColorRule.config.cloudColorOn : alarmColorRule.config.cloudColorOff;
                const showCloud = value ? alarmColorRule.config.showCloudOn : alarmColorRule.config.showCloudOff;
                const showIcon = value ? alarmColorRule.config.showIconOn : alarmColorRule.config.showIconOff;
                const iconColor = value ? alarmColorRule.config.iconColorOn : alarmColorRule.config.iconColorOff;

                if (showCloud && currentColor) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                // Handle icon visibility and color
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

            // Update modal if it exists
            const modalId = deviceEl.getAttribute('data-device-id');
            const modal = document.querySelector(`.device-modal[data-device-id="${modalId}"]`);
            if (modal) {
                const powerButton = modal.querySelector('.power-button');
                if (powerButton) {
                    powerButton.classList.toggle('on', value);
                }
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in handleDeviceUpdate: ${JSON.stringify(error)}` });
        }
    },

    applyInitialRules(device, deviceEl) {
        try {
            const iconWrapper = deviceEl.querySelector('.icon-wrapper');
            const currentState = device.state === true;

            // Reset cloud effect first
            deviceEl.style.backgroundColor = 'transparent';
            deviceEl.style.boxShadow = 'none';
            if (iconWrapper) {
                iconWrapper.style.backgroundColor = 'transparent';
                iconWrapper.style.boxShadow = 'none';
            }

            // Check for allIcon rule first
            const allIconRule = device.rules?.find(r => r.type === 'allIcon');
            if (allIconRule?.config?.selectedIcon) {
                // Clear existing icon wrapper content
                if (iconWrapper) {
                    iconWrapper.innerHTML = '';

                    // Add material icon
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'material-symbols-outlined';
                    iconSpan.textContent = allIconRule.config.selectedIcon;
                    
                    // Defensive check before appendChild
                    if (iconWrapper && iconSpan) {
                        iconWrapper.appendChild(iconSpan);
                        
                        // Attach events to the newly created default icon
                        this.attachIconEvents(iconSpan, deviceEl);
                    }

                    // Make sure icon wrapper is visible
                    iconWrapper.style.display = 'flex';
                    
                    // Apply consistent sizing
                    iconSpan.style.fontSize = '18px'; // 10% smaller than before
                }
            }

            // Check allColor first - if it exists, only apply allColor and ignore all others
            const allColorRule = device.rules?.find(r => r.type === 'allColor');
            if (allColorRule?.config) {

                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-all-color', allColorRule.config.cloudColor || allColorRule.config.mainColor);

                // Handle cloud effect with intense values
                if (allColorRule.config.showCloud) {
                    const color = allColorRule.config.cloudColor || allColorRule.config.mainColor;
                    // Device background cloud
                    deviceEl.style.backgroundColor = `${color}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${color}90`;

                    // Icon wrapper cloud
                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${color}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${color}E0`;
                    }
                }

                // Handle icon visibility and color
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

            // Only process alarmColor if no allColor rule exists
            const alarmColorRule = device.rules?.find(r => r.type === 'alarmColor');
            if (!allColorRule && alarmColorRule?.config) {
                const currentColor = currentState ? alarmColorRule.config.cloudColorOn : alarmColorRule.config.cloudColorOff;
                const showCloud = currentState ? alarmColorRule.config.showCloudOn : alarmColorRule.config.showCloudOff;
                const showIcon = currentState ? alarmColorRule.config.showIconOn : alarmColorRule.config.showIconOff;
                const iconColor = currentState ? alarmColorRule.config.iconColorOn : alarmColorRule.config.iconColorOff;

                deviceEl.setAttribute('data-color-rule', 'true');
                deviceEl.setAttribute('data-on-color', alarmColorRule.config.cloudColorOn);
                deviceEl.setAttribute('data-off-color', alarmColorRule.config.cloudColorOff);

                if (showCloud) {
                    deviceEl.style.backgroundColor = `${currentColor}80`;
                    deviceEl.style.boxShadow = `0 0 8px 4px ${currentColor}90`;

                    if (iconWrapper) {
                        iconWrapper.style.backgroundColor = `${currentColor}F0`;
                        iconWrapper.style.boxShadow = `0 0 5px ${currentColor}E0`;
                    }
                }

                // Handle icon visibility and color
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
            Homey.api('POST', '/error', { message: `Error in applyInitialRules: ${JSON.stringify(error)}` });
        }
    },

    showDeviceModal(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const deviceId = deviceEl.getAttribute('data-device-id');
        const currentState = deviceEl.getAttribute('data-state') === 'true';
        const sensorType = deviceEl.getAttribute('data-sensor-type');

        // Determine label and icon based on sensor type
        const sensorLabel = sensorType === 'alarm_contact' ? 'Contact' : 'Motion';
        const sensorIcon = sensorType === 'alarm_contact' ? 'door_open' : 'motion_sensor_alert';

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
        modal.setAttribute('data-device-id', deviceId);
        modal.innerHTML = `
            <div class="modal-header">
                <h2>${name}</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            <div class="dim-view-toggle">
                <button class="view-button active" data-view="onoff">${sensorLabel}</button>
            </div>
            <div class="dim-views">
                <div class="dim-view onoff-view active">
                    <div class="power-button ${currentState ? 'on' : ''}" role="button">
                        <span class="material-symbols-outlined">${sensorIcon}</span>
                    </div>
                </div>
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
                    padding: 12px;
                    width: 260px;
                    max-width: 90vw;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
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

                .dim-view-toggle {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin-bottom: 16px;
                    padding: 4px;
                    background: transparent;
                    border-radius: 20px;
                }

                .view-button {
                    padding: 6px 12px;
                    border: 1px solid #1C1C1E;
                    background: none;
                    color: #1C1C1E;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .view-button.active {
                    background: #1C1C1E;
                    color: white;
                }

                .power-button {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: #1C1C1E;
                    position: relative;
                    margin: 12px auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    transition: all 0.2s ease;
                }

                .power-button.on {
                    background: #ff0000;
                }

                .sensor-icon {
                    color: #FFFFFF;
                    font-size: 32px;
                }

                .material-symbols-outlined {
                    font-size: 32px; /* Consistent with sensor-icon */
                }

                .sensor-state {
                    text-align: center;
                    font-weight: bold;
                    margin-top: 12px;
                    color: #1C1C1E;
                }

                .sensor-state.triggered {
                    color: #ff0000;
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
    },

    handleExternalUpdate(deviceEl, value, capability) {
        try {
            deviceEl.setAttribute('data-state', value);
            deviceEl.classList.toggle('on', value);

            const deviceData = JSON.parse(deviceEl.getAttribute('data-device'));

            deviceData.state = value;  // Update the stored state
            deviceEl.setAttribute('data-device', JSON.stringify(deviceData));

            // Update visual state using existing method
            this.handleDeviceUpdate(deviceEl, value, 'onoff');

            const cleanDeviceId = deviceData.id.replace('-onoff', '');
            const modal = document.querySelector(`.device-modal[data-device-id="${cleanDeviceId}"]`);
            if (modal) {
                const powerButton = modal.querySelector('.power-button');
                if (powerButton) {
                    powerButton.classList.toggle('on', value);
                }
                // Update modal's color display
                const deviceStateEl = modal.querySelector('.device-state');
                if (deviceStateEl) {
                    deviceStateEl.textContent = value ? 'ON' : 'OFF';
                    deviceStateEl.className = `device-state ${value ? 'on' : 'off'}`;
                }
            } else {
                Homey.api('POST', '/error', { message: `No modal found for device: ${cleanDeviceId}` });
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error in handleExternalUpdate: ${JSON.stringify(error)}` });
        }
    },

    setupExternalUpdates() {
        if (!window.Homey) {
            Homey.api('POST', '/error', { message: 'No Homey object available' });
            return;
        }

        // Remove any existing listeners first
        window.Homey.removeAllListeners('realtime/device');

        window.Homey.on('realtime/device', (data) => {

            if (data && data.capability === 'onoff') {
                const deviceElements = document.querySelectorAll(`[data-device-id="${data.id}"]`);
                deviceElements.forEach(deviceEl => {
                    this.handleExternalUpdate(deviceEl, data.value, 'onoff');
                });
            }
        });
    },
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Helper function to add scale transform without affecting position
    addScaleTransform(element, scale) {
        const currentTransform = element.style.transform;
        // Check if there's already a scale transform
        if (currentTransform.includes('scale(')) {
            // Replace existing scale
            return currentTransform.replace(/scale\([^)]+\)/, `scale(${scale})`);
        } else {
            // Add new scale
            return `${currentTransform} scale(${scale})`;
        }
    },

    // Helper function to remove scale transform without affecting position
    removeScaleTransform(element) {
        const currentTransform = element.style.transform;
        // Remove scale transform if it exists
        return currentTransform.replace(/\s*scale\([^)]+\)/, '');
    },

    // Helper function to attach events to an icon
    attachIconEvents(icon, deviceEl) {
        if (!icon) return;
        
        // Touch/Mouse event variables
        let touchStartTime = 0;
        let touchMoved = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let longPressTimer = null;
        const TOUCH_TOLERANCE = 10;
        
        let mouseDownTime = 0;
        let mouseMoved = false;
        let mouseDownX = 0;
        let mouseDownY = 0;

        // Function to handle touch start
        const handleTouchStart = (e) => {
            e.preventDefault();
            e.stopPropagation();

            touchStartTime = Date.now();
            touchMoved = false;

            // Store initial touch position
            if (e.touches && e.touches[0]) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }

            // Add visual feedback
            deviceEl.style.transform = this.addScaleTransform(deviceEl, 1.2);
            deviceEl.style.opacity = '0.8';

            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    // Reset visual feedback before showing modal
                    deviceEl.style.transform = this.removeScaleTransform(deviceEl);
                    deviceEl.style.opacity = '1';
                    this.showDeviceModal(deviceEl);
                } else {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }, 500);
        };

        // Function to handle touch move
        const handleTouchMove = (e) => {
            if (e.touches && e.touches[0]) {
                const moveX = Math.abs(e.touches[0].clientX - touchStartX);
                const moveY = Math.abs(e.touches[0].clientY - touchStartY);

                if (moveX > TOUCH_TOLERANCE || moveY > TOUCH_TOLERANCE) {
                    touchMoved = true;
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                }
            }
        };

        // Function to handle touch end
        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const pressDuration = Date.now() - touchStartTime;

            // Clear long press timer
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            // Reset visual feedback
            deviceEl.style.transform = this.removeScaleTransform(deviceEl);
            deviceEl.style.opacity = '1';

            // Handle short tap (not long press)
            if (!touchMoved && pressDuration < 500) {
                this.handleClick(deviceEl);
            }

            touchStartTime = 0;
            touchMoved = false;
        };

        // Function to handle click (fallback for non-touch devices)
        const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleClick(deviceEl);
        };

        // Function to handle mouse down
        const handleMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            mouseDownTime = Date.now();
            mouseMoved = false;
            mouseDownX = e.clientX;
            mouseDownY = e.clientY;

            // Add visual feedback
            deviceEl.style.transform = this.addScaleTransform(deviceEl, 1.2);
            deviceEl.style.opacity = '0.8';

            longPressTimer = setTimeout(() => {
                if (!mouseMoved) {
                    // Reset visual feedback before showing modal
                    deviceEl.style.transform = this.removeScaleTransform(deviceEl);
                    deviceEl.style.opacity = '1';
                    this.showDeviceModal(deviceEl);
                } else {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }, 500);
        };

        // Function to handle mouse move
        const handleMouseMove = (e) => {
            if (mouseDownTime > 0) {
                const moveThreshold = 10;
                const deltaX = Math.abs(e.clientX - mouseDownX);
                const deltaY = Math.abs(e.clientY - mouseDownY);

                if (deltaX > moveThreshold || deltaY > moveThreshold) {
                    mouseMoved = true;
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                }
            }
        };

        // Function to handle mouse up
        const handleMouseUp = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const pressDuration = Date.now() - mouseDownTime;

            // Clear long press timer
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            // Reset visual feedback
            deviceEl.style.transform = this.removeScaleTransform(deviceEl);
            deviceEl.style.opacity = '1';

            // Handle short click (not long press)
            if (!mouseMoved && pressDuration < 500) {
                this.handleClick(deviceEl);
            }

            mouseDownTime = 0;
            mouseMoved = false;
        };

        // Attach all event listeners
        icon.addEventListener('touchstart', handleTouchStart, { passive: false });
        icon.addEventListener('touchmove', handleTouchMove, { passive: false });
        icon.addEventListener('touchend', handleTouchEnd, { passive: false });
        icon.addEventListener('click', handleClick, { passive: false });
        icon.addEventListener('contextmenu', (e) => e.preventDefault());
        
        icon.addEventListener('mousedown', handleMouseDown, { passive: false });
        icon.addEventListener('mousemove', handleMouseMove, { passive: false });
        icon.addEventListener('mouseup', handleMouseUp, { passive: false });
        
        // Make sure icons are clickable
        icon.style.pointerEvents = 'auto';
        icon.style.cursor = 'pointer';
        icon.style.userSelect = 'none';
        icon.style.webkitUserSelect = 'none';
        icon.style.webkitTouchCallout = 'none';
        
        // For img elements, prevent drag behavior that might interfere
        if (icon.tagName.toLowerCase() === 'img') {
            icon.draggable = false;
            icon.addEventListener('dragstart', (e) => e.preventDefault());
        }
    },
}

window.capabilityRenderers = window.capabilityRenderers || {};
window.capabilityRenderers.sensor = sensorRenderer;

sensorRenderer.setupExternalUpdates();
