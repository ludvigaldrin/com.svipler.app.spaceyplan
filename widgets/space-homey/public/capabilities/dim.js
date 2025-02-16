const dimRenderer = {
    id: 'dim',
    
    createDeviceElement(device, position) {
        // Add renderer-specific styles if not already present
        if (!document.getElementById('dimStyles')) {
            const styles = document.createElement('style');
            styles.id = 'dimStyles';
            styles.textContent = `
                .dim-device {
                    position: absolute;
                    width: 35px;
                    height: 35px;
                    cursor: pointer;
                    z-index: 201;
                    background-color: rgba(255, 255, 255, 0.8) !important;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    transition: all 0.3s ease;
                    -webkit-user-select: none;
                    user-select: none;
                    -webkit-touch-callout: none;
                    pointer-events: auto;
                    left: ${position.x}%;
                    top: ${position.y}%;
                }

                .dim-device.on {
                    background-color: rgba(255, 215, 0, 0.8) !important;
                    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
                }

                .dim-device img {
                    width: 24px;
                    height: 24px;
                    pointer-events: none;
                }

                .dim-popup {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(28, 28, 30, 0.95);
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    z-index: 1000;
                    min-width: 280px;
                    backdrop-filter: blur(10px);
                }

                .dim-popup h2 {
                    color: white;
                    margin: 0 0 20px 0;
                    text-align: center;
                    font-size: 18px;
                }

                .dim-slider {
                    width: 100%;
                    height: 20px;
                    -webkit-appearance: none;
                    background: rgba(255,255,255,0.1);
                    border-radius: 10px;
                    outline: none;
                }

                .dim-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 28px;
                    height: 28px;
                    background: #FFD700;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                }

                .dim-value {
                    color: white;
                    text-align: center;
                    margin-top: 15px;
                    font-size: 16px;
                }

                .dim-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(5px);
                    z-index: 999;
                }
            `;
            document.head.appendChild(styles);
        }

        const deviceEl = document.createElement('div');
        deviceEl.className = 'dim-device';
        const deviceId = device.deviceId || device.id;
        const baseDeviceId = deviceId.replace(/-dim$/, '');
        deviceEl.setAttribute('data-device-id', baseDeviceId);
        deviceEl.setAttribute('data-name', device.name);
        deviceEl.setAttribute('data-capability', 'dim');
        
        if (device.iconObj?.url) {
            const img = document.createElement('img');
            img.src = device.iconObj.url;
            img.alt = device.name;
            deviceEl.appendChild(img);
        }

        // Initialize state and subscriptions
        this.initializeState(deviceEl, baseDeviceId);
        this.initializeInteractions(deviceEl);
        
        return deviceEl;
    },
    
    async initializeState(deviceEl, deviceId) {
        try {
            // Get initial state - includes both dim and onoff
            const response = await Homey.api('GET', `/devices/${deviceId}/capabilities/dim`);
            Homey.api('POST', '/log', { message: `Dim Response: ${JSON.stringify(response)}` });
            
            if (response && typeof response.dim !== 'undefined') {
                deviceEl.setAttribute('data-dim', response.dim);
                deviceEl.setAttribute('data-state', response.onoff);
                deviceEl.classList.toggle('on', response.onoff);
                Homey.api('POST', '/log', { message: `Set initial states - dim: ${response.dim}, onoff: ${response.onoff}` });
            }

            // Subscribe to both capabilities since dim devices need both
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId: Homey.widgetId,
                devices: [
                    { deviceId, capability: 'dim' },
                    { deviceId, capability: 'onoff' }
                ]
            });
            
            Homey.api('POST', '/log', { message: `Final element state - onoff: ${deviceEl.getAttribute('data-state')}, dim: ${deviceEl.getAttribute('data-dim')}` });
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error initializing state: ${error.message}` });
        }
    },
    
    initializeInteractions(deviceEl) {
        let touchStartTime;
        let longPressTimer;
        
        deviceEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchStartTime = Date.now();
            longPressTimer = setTimeout(() => {
                this.showDimPopup(deviceEl);
            }, 500); // Show dim popup after 500ms
        });
        
        deviceEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            clearTimeout(longPressTimer);
            if (Date.now() - touchStartTime < 500) {
                this.handleClick(deviceEl); // Quick tap toggles on/off
            }
        });
        
        deviceEl.addEventListener('click', () => {
            this.handleClick(deviceEl);
        });
    },
    
    // Debounce function
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
    
    showDimPopup(deviceEl) {
        const name = deviceEl.getAttribute('data-name');
        const currentDim = parseFloat(deviceEl.getAttribute('data-dim')) || 0;
        
        const overlay = document.createElement('div');
        overlay.className = 'dim-modal-overlay';
        
        const popup = document.createElement('div');
        popup.className = 'dim-popup';
        popup.innerHTML = `
            <h2>${name}</h2>
            <div class="dim-slider-container">
                <input type="range" 
                       min="0" 
                       max="1" 
                       step="0.01" 
                       value="${currentDim}" 
                       class="dim-slider">
                <span class="dim-value">${Math.round(currentDim * 100)}%</span>
            </div>
        `;
        
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        
        const slider = popup.querySelector('.dim-slider');
        const valueDisplay = popup.querySelector('.dim-value');
        
        // Debounced dim value update
        const debouncedUpdate = this.debounce(async (value) => {
            try {
                const deviceId = deviceEl.getAttribute('data-device-id');
                await Homey.api('PUT', `/devices/${deviceId}/capabilities/dim`, {
                    value: value
                });
                this.handleDeviceUpdate(deviceEl, value, 'dim');
            } catch (error) {
                Homey.api('POST', '/log', { message: `Error setting dim value: ${error.message}` });
            }
        }, 100); // 100ms debounce
        
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueDisplay.textContent = `${Math.round(value * 100)}%`;
            debouncedUpdate(value);
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    },
    
    async handleClick(deviceEl) {
        try {
            const deviceId = deviceEl.getAttribute('data-device-id');
            const currentState = deviceEl.getAttribute('data-state') === 'true';
            const newState = !currentState;
            
            // Update visual state immediately
            this.handleDeviceUpdate(deviceEl, newState, 'onoff');
            
            // Send the state change to the device
            await Homey.api('PUT', `/devices/${deviceId}/capabilities/onoff`, {
                value: newState
            });
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error in handleClick: ${error.message}` });
        }
    },
    
    handleDeviceUpdate(deviceEl, value, capability = 'dim') {
        Homey.api('POST', '/log', { message: `Dim renderer handling ${capability} update: ${value}` });
        
        if (capability === 'onoff') {
            deviceEl.setAttribute('data-state', value);
            deviceEl.classList.toggle('on', value);
        } else if (capability === 'dim') {
            deviceEl.setAttribute('data-dim', value);
            // Update slider if popup is open
            const popup = document.querySelector('.dim-popup');
            if (popup) {
                const slider = popup.querySelector('.dim-slider');
                const valueDisplay = popup.querySelector('.dim-value');
                if (slider && valueDisplay) {
                    slider.value = value;
                    valueDisplay.textContent = `${Math.round(value * 100)}%`;
                }
            }
        }
    }
};

// Register the renderer
if (!window.capabilityRenderers) {
    window.capabilityRenderers = {};
}
window.capabilityRenderers.dim = dimRenderer; 