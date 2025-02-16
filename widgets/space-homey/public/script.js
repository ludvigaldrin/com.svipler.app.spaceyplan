let Homey; // Store Homey instance
let currentDevices = [];
let rendererManager; // Add this at the top

// Add immediate logging to see if script is loaded
console.log('Space Homey widget script loaded');

function showFloorSelector(floors) {
    const container = document.getElementById('floorSelector');
    const floorPlanContainer = document.getElementById('floorPlanContainer');
    
    if (container) {
        container.style.cssText = 'display: flex; width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 9999; pointer-events: auto; justify-content: center; align-items: center; background-color: rgba(25, 118, 210, 0.95);';
    }
    if (floorPlanContainer) {
        floorPlanContainer.style.cssText = 'display: none;';
    }
    
    if (!floors || floors.length === 0) {
        showNoFloorsMessage();
        return;
    }

    const floorGrid = document.getElementById('floorGrid');
    if (!floorGrid) {
        Homey.api('POST', '/log', { message: 'Floor grid element not found!' });
        return;
    }

    floorGrid.style.cssText = 'display: flex; width: 100%; height: 100%; position: relative; z-index: 10000; pointer-events: auto; justify-content: center; align-items: center;';

    const html = `
        <div class="welcome-message" style="text-align: center; padding: 24px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; margin: 20px; position: relative; z-index: 10001;">
            <h2>Welcome to Space Homey!</h2>
            <div class="floor-select-container" style="margin: 20px 0;">
                <select id="floorSelect" class="floor-select" style="width: 100%; padding: 8px; margin-bottom: 8px;">
                    <option value="">Choose a floor...</option>
                    ${floors.map(floor => `<option value="${floor.id}">${floor.name}</option>`).join('')}
                </select>
            </div>
            <button id="applyButton" class="homey-button-primary" disabled style="width: 100%; padding: 12px; margin-top: 8px;">
                Select Floor
            </button>
        </div>
    `;
    
    floorGrid.innerHTML = html;

    const select = document.getElementById('floorSelect');
    const applyButton = document.getElementById('applyButton');
    
    // Add click handlers to debug event propagation
    select.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    applyButton.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    select.addEventListener('change', () => {
        const selectedId = select.value;
        applyButton.disabled = !selectedId;
    });
    
    applyButton.addEventListener('click', async () => {
        const selectedId = select.value;
        if (!selectedId) {
            return;
        }
        
        const selectedFloor = floors.find(f => f.id === selectedId);
        
        if (selectedFloor) {
            await selectFloor(selectedFloor);
        } else {
            Homey.api('POST', '/log', { message: `Could not find floor with id: ${selectedId}` });
        }
    });
}

function onHomeyReady(_Homey) {
    console.log('onHomeyReady called');
    Homey = _Homey;
    
    // Initialize RendererManager
    rendererManager = new CapabilityRendererManager();
    
    // Register the onoff renderer
    if (window.capabilityRenderers && window.capabilityRenderers.onoff) {
        rendererManager.registerRenderer(window.capabilityRenderers.onoff);
    }
    
    // Get widget ID using the correct method
    const widgetId = Homey.getWidgetInstanceId();
    console.log('Widget ID:', widgetId);
    
    Homey.api('POST', '/log', { message: `Widget initialized with ID: ${widgetId}` });
    
    // Store widget ID on Homey object for easier access
    Homey.widgetId = widgetId;
    
    init();
    Homey.ready();
}

async function init() {
    try {
        const widgetId = Homey.widgetId;
        showLoadingState();

        if (!widgetId) {
            Homey.api('POST', '/log', { message: 'No widget ID available' });
            return;
        }

        // Set up device update listener
        Homey.on(`widget:${widgetId}:deviceUpdate`, handleDeviceUpdate);

        // First get all available floors
        const floors = await Homey.api('GET', '/floors');
        
        // Only log floor count, not the entire floor data
        Homey.api('POST', '/log', { message: `Got ${floors?.length || 0} floors` });

        if (!floors || floors.length === 0) {
            showNoFloorsMessage();
            return;
        }

        // Then check if this widget has a selected floor
        const selectedFloors = await Homey.api('GET', '/selectedFloors');
        const selectedFloor = selectedFloors[widgetId];
        
        if (selectedFloor && selectedFloor.floorId) {
            const floor = floors.find(f => f.id === selectedFloor.floorId);
            if (floor) {
                await selectFloor(floor, false);
                return;
            }
        }
        
        // If no floor is selected or the selected floor wasn't found, show selector
        showFloorSelector(floors);
    } catch (error) {
        Homey.api('POST', '/log', { message: `Init error: ${error.message}` });
        showNoFloorsMessage();
    }
}

function addSettingsButton() {
    const container = document.getElementById('floorPlanContainer');
    if (!container) return;

    // Create settings button with SVG icon
    const settingsButton = document.createElement('button');
    settingsButton.className = 'settings-button';
    settingsButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>`;
    settingsButton.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 10000; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; color: #666; background: transparent;';
    
    // Add hover effect
    settingsButton.addEventListener('mouseover', () => {
        settingsButton.style.color = '#000';
    });
    settingsButton.addEventListener('mouseout', () => {
        settingsButton.style.color = '#666';
    });
    
    // Add click handler
    settingsButton.addEventListener('click', async () => {
        try {
            const floors = await Homey.api('GET', '/floors');
            showFloorSelector(floors);
        } catch (error) {
            Homey.api('POST', '/log', { message: 'Error showing floor selector: ' + error.message });
        }
    });

    container.appendChild(settingsButton);
}

async function selectFloor(floor, saveSelection = true) {
    try {
        const widgetId = Homey.widgetId;
        
        if (!widgetId) {
            Homey.api('POST', '/log', { message: 'No widget ID available when selecting floor' });
            return;
        }

        let response = { success: true };
        
        // Only save to API if this is a new selection
        if (saveSelection) {
            response = await Homey.api('POST', '/selectedFloors', {
                floorId: floor.id,
                widgetId: widgetId
            });
        }
        
        if (response.success) {
            // Hide selector and show floor plan
            const floorSelector = document.getElementById('floorSelector');
            const floorPlanContainer = document.getElementById('floorPlanContainer');
            
            if (floorSelector) floorSelector.style.display = 'none';
            if (floorPlanContainer) {
                floorPlanContainer.style.display = 'block';
                
                // Set floor plan image
                const floorPlan = floorPlanContainer.querySelector('.floor-plan');
                if (floorPlan && floor.image) {
                    floorPlan.innerHTML = `<img src="${floor.image}" class="floor-map" alt="${floor.name}">`;
                    addSettingsButton();
                }
            }
            
            // Create device container if it doesn't exist
            let deviceContainer = document.getElementById('deviceContainer');
            if (!deviceContainer) {
                deviceContainer = document.createElement('div');
                deviceContainer.id = 'deviceContainer';
                deviceContainer.className = 'device-container';
                floorPlanContainer.appendChild(deviceContainer);
            }
            
            // Load and render devices
            if (floor.devices && floor.devices.length > 0) {
                await renderDevices(floor.devices, deviceContainer);
            }

            // Store current devices for subscription
            currentDevices = floor.devices || [];
            
            // Subscribe to device updates
            await Homey.api('POST', `/subscribeToDevices`, {
                widgetId,
                devices: currentDevices
            });
        }
    } catch (error) {
        Homey.api('POST', '/log', { message: `Error selecting floor: ${error.message}` });
    }
}

async function renderDevices(devices, container) {
    Homey.api('POST', '/log', { message: `Rendering devices: ${JSON.stringify(devices)}` });
    
    for (const device of devices) {
        // Log the device object to see its structure
        Homey.api('POST', '/log', { message: `Processing device: ${JSON.stringify(device)}` });
        
        const deviceEl = document.createElement('div');
        deviceEl.className = 'light-button';
        deviceEl.style.cssText = `
            left: ${device.position.x}%;
            top: ${device.position.y}%;
            background: white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: background-color 0.3s ease;
            cursor: pointer;
            position: absolute;
        `;
        
        // Use only the base deviceId, not the capability-appended version
        const deviceId = device.deviceId;
        const capability = device.capability;
        
        deviceEl.setAttribute('data-device-id', deviceId);
        deviceEl.setAttribute('data-capability', capability);
        
        // Add device icon
        if (device.iconObj?.url) {
            deviceEl.innerHTML = `<img src="${device.iconObj.url}" style="width: 24px; height: 24px;" alt="${device.name}">`;
        }

        // Get initial state
        try {
            const initialState = await Homey.api('GET', `/devices/${deviceId}/capabilities/${capability}`);
            Homey.api('POST', '/log', { message: `Initial state for device ${deviceId} capability ${capability}: ${initialState}` });
            if (initialState) {
                deviceEl.style.backgroundColor = '#ffd700';
            }
        } catch (error) {
            Homey.api('POST', '/log', { message: `Error getting initial state for device ${deviceId}: ${error.message}` });
        }
        
        // Add click handler for capability control
        deviceEl.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            Homey.api('POST', '/log', { message: `Click detected on device ${deviceId} capability ${capability}` });
            
            try {
                const currentState = await Homey.api('GET', `/devices/${deviceId}/capabilities/${capability}`);
                Homey.api('POST', '/log', { message: `Current state for device ${deviceId}: ${currentState}` });
                
                const newState = !currentState;
                Homey.api('POST', '/log', { message: `Setting new state for device ${deviceId}: ${newState}` });
                
                // Update visual state immediately
                deviceEl.style.backgroundColor = newState ? '#ffd700' : 'white';
                
                // Send the state change to the device
                const response = await Homey.api('PUT', `/devices/${deviceId}/capabilities/${capability}`, {
                    value: newState
                });
                
                Homey.api('POST', '/log', { message: `API response for device ${deviceId}: ${JSON.stringify(response)}` });
            } catch (error) {
                // Revert visual state if there was an error
                deviceEl.style.backgroundColor = currentState ? '#ffd700' : 'white';
                Homey.api('POST', '/log', { message: `Error controlling device ${deviceId}: ${error.message}` });
            }
        });
        
        container.appendChild(deviceEl);
    }
}

// Add this function to handle settings opening
function openSettings() {
    if (Homey && typeof Homey.openSettings === 'function') {
        Homey.openSettings();
    } else {
        Homey.api('POST', '/log', { message: 'openSettings not available' });
    }
}

// Add a new function for initial loading state
function showLoadingState() {
    const container = document.getElementById('floorSelector');
    const floorPlanContainer = document.getElementById('floorPlanContainer');
    
    if (container) {
        container.style.cssText = 'display: flex; width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 9999; pointer-events: auto; justify-content: center; align-items: center; background-color: transparent;';
    }
    if (floorPlanContainer) {
        floorPlanContainer.style.cssText = 'display: none;';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.style.cssText = 'display: flex; width: 100%; height: 100%; position: relative; z-index: 10000; pointer-events: auto; justify-content: center; align-items: center;';
        floorGrid.innerHTML = `
            <div style="text-align: center;">
               
            </div>
        `;
    }
}

// Update device update handler with more logging
function handleDeviceUpdate(data) {
    Homey.api('POST', '/log', { message: `Received device update: ${JSON.stringify(data)}` });
    const { deviceId, capability, value } = data;
    
    if (!rendererManager) {
        Homey.api('POST', '/log', { message: 'RendererManager not initialized!' });
        return;
    }
    
    // Find the device element
    const deviceEl = document.querySelector(`[data-device-id="${deviceId}"][data-capability="${capability}"]`);
    if (deviceEl) {
        // Get the renderer for this capability
        const renderer = rendererManager.getRenderer(capability);
        if (renderer && typeof renderer.handleDeviceUpdate === 'function') {
            Homey.api('POST', '/log', { message: `Updating device ${deviceId} ${capability} to ${value}` });
            renderer.handleDeviceUpdate(deviceEl, value);
        } else {
            Homey.api('POST', '/log', { message: `No renderer or handleDeviceUpdate method found for capability: ${capability}` });
        }
    } else {
        Homey.api('POST', '/log', { message: `No element found for device ${deviceId} capability ${capability}` });
    }
}

// Add cleanup function
async function cleanup() {
    try {
        const widgetId = Homey.widgetId;
        if (widgetId) {
            // Remove event listener
            Homey.off(`widget:${widgetId}:deviceUpdate`, handleDeviceUpdate);
            // Unsubscribe from devices
            await Homey.api('POST', `/unsubscribeWidget`, { widgetId });
        }
    } catch (error) {
        Homey.api('POST', '/log', { message: `Cleanup error: ${error.message}` });
    }
}

// Add event listener for cleanup
window.addEventListener('beforeunload', cleanup);

function showNoFloorsMessage() {
    const container = document.getElementById('floorSelector');
    const floorPlanContainer = document.getElementById('floorPlanContainer');
    
    if (container) {
        container.style.cssText = 'display: flex; width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 9999; pointer-events: auto; justify-content: center; align-items: center; background-color: rgba(25, 118, 210, 0.95);';
    }
    if (floorPlanContainer) {
        floorPlanContainer.style.cssText = 'display: none;';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.style.cssText = 'display: flex; width: 100%; height: 100%; position: relative; z-index: 10000; pointer-events: auto; justify-content: center; align-items: center;';
        floorGrid.innerHTML = `
            <div class="welcome-message" style="text-align: center; padding: 24px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; margin: 20px;">
                <h2>No Floor Plans Found</h2>
                <p>Please add a floor plan in the app settings first.</p>
            </div>
        `;
    }
} 