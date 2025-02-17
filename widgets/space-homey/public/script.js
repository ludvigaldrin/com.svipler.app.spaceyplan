let Homey; // Store Homey instance
let currentDevices = [];
let rendererManager; // Add this at the top
let widgetId;

/** INIT */

async function onHomeyReady(_Homey) {
    Homey = _Homey;

    await Homey.api('POST', '/log', { message: 'Homey ready!' });
    Homey.ready();

    const settings = Homey.getSettings();
    const widgetHeight = settings.widgetHeight || 400; // fallback to 400 if not set

    await Homey.setHeight(widgetHeight);
    try {
        await init();
        await Homey.api('POST', '/log', { message: 'Widget Loaded Completed ' });
    } catch (error) {
        await Homey.api('POST', '/log', { message: `Init error: ${error.message}` });
        showErrorMessage();
    }
}

async function init() {

    // First Show Loading State
    showLoadingState();

    // Now load the widgtet
    widgetId = await Homey.getWidgetInstanceId();
    await Homey.api('POST', '/log', { message: 'Init with widget ID: ' + widgetId });

    if (!widgetId) { // No widget ID available
        await Homey.api('POST', '/log', { message: 'No widget ID available from getWidgetInstanceId()' });
        showErrorMessage();
        return;
    }

    // Get all floors
    const floors = await Homey.api('GET', '/floors');
    await Homey.api('POST', '/log', { message: 'Retrieved floors: ' + (floors?.length || 0) });

    if (!floors || floors.length === 0) {
        await Homey.api('POST', '/log', { message: 'No floors available, showing no floors message' });
        showNoFloorsMessage();
        return;
    }

    // Get selected floor
    const selectedFloors = await Homey.api('GET', '/selectedFloors');
    const selectedFloor = selectedFloors[widgetId];
    await Homey.api('POST', '/log', { message: 'Current widget selected floor: ' + (selectedFloor ? selectedFloor.floorId : 'none') });

    if (selectedFloor && selectedFloor.floorId) {
        const floor = floors.find(f => f.id === selectedFloor.floorId);
        await Homey.api('POST', '/log', { message: 'Selected floor found, showing selected floor name: ' + floor.name + ' id: ' + floor.id });
        await showSelectedFloor(floor);
    } else {
        await Homey.api('POST', '/log', { message: 'No selected floor found, showing floor selector' });
        await showFloorSelector(floors);
    }
}
/** VIEWS */

async function showFloorSelector(floors) {
    await Homey.api('POST', '/log', { message: 'Showing floor selector: ' + floors.length });
    const container = document.getElementById('floorSelector');

    if (container) {
        container.className = 'floor-selector active';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    floorGrid.className = 'floor-grid active';

    const html = `
        <div class="welcome-message">
            <h2>Welcome to Space Homey!</h2>
            <div class="floor-select-container">
                <select id="floorSelect" class="floor-select" >
                    <option value="">Choose a floor...</option>
                    ${floors.map(floor => `<option value="${floor.id}">${floor.name}</option>`).join('')}
                </select>
            </div>
            <button id="applyButton" class="homey-button-primary" disabled>
                Select Floor
            </button>
        </div>
    `;

    floorGrid.innerHTML = html;


    const select = document.getElementById('floorSelect');
    const applyButton = document.getElementById('applyButton');

    select.addEventListener('change', async () => {
        const selectedId = select.value;
        applyButton.disabled = !selectedId;
    });

    applyButton.addEventListener('click', async () => {
        const selectedId = select.value;
        if (!selectedId) {
            return;
        }
        const selectedFloor = floors.find(f => f.id === selectedId);
        await Homey.api('POST', '/log', { message: `Selected floor: ${selectedFloor.name}, id: ${selectedFloor.id}` });

        if (selectedFloor) {
            await Homey.api('POST', '/log', { message: `WidgetId: ${widgetId}, id: ${selectedFloor.id}` });
            // Save the selected floor for this widget
            const result = await Homey.api('POST', '/selectedFloors', {
                widgetId: widgetId,
                floorId: selectedFloor.id
            });

            await Homey.api('POST', '/log', { message: `Selected floor saved: ${result}` });
            // We now have saved to lets select this floor now
            await showSelectedFloor(selectedFloor);
        }

    });

}

async function showSelectedFloor(floor) {
    await Homey.api('POST', '/log', { message: `Showing selected floor: ${floor.name}, id: ${floor.id}` });
    // Initialize RendererManager
    rendererManager = new CapabilityRendererManager();

    // Register renderers
    if (window.capabilityRenderers) {
        Object.values(window.capabilityRenderers).forEach(renderer => {
            rendererManager.registerRenderer(renderer);
        });
    }
    // Debug log with relevant floor info
    Homey.api('POST', '/log', { message: `Selecting floor: ${floor.name}, id: ${floor.id}` });

    // Initialize RendererManager
    rendererManager = new CapabilityRendererManager();

    // Register renderers
    if (window.capabilityRenderers) {
        Object.values(window.capabilityRenderers).forEach(renderer => {
            rendererManager.registerRenderer(renderer);
        });
    }

    const container = document.getElementById('floorSelector');
    if (container) {
        container.style.display = 'none';
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.cssText = `display: block;`;
    }

    const floorMapImage = document.getElementById('floorMapImage');
    if (floorMapImage && floor.image) {
        floorMapImage.src = floor.image;
    }


    // Set up device update listener only after floor is selected
    Homey.on(`widget:${widgetId}:deviceUpdate`, handleDeviceUpdate);

    const devicesContainer = document.getElementById('floorPlanDevices');

    // Handle devices if they exist
    if (devicesContainer && floor.devices) {
        devicesContainer.style.cssText = `
           position: absolute;
           top: 0;
           left: 0;
           width: 100%;
           height: 100%;
           pointer-events: none;
       `;

        devicesContainer.innerHTML = '';

        floor.devices.forEach(device => {
            const renderer = rendererManager.getRenderer(device.capability);
            if (renderer) {
                const deviceElement = renderer.createDeviceElement(device, device.position);
                if (deviceElement) {
                    deviceElement.style.pointerEvents = 'auto';
                    devicesContainer.appendChild(deviceElement);
                }
            }
        });
    }

    // Add settings button after floor plan is shown
    addSettingsButton();

    // Store current floor data
    window.getCurrentFloor = () => floor;
}

function showLoadingState() {
    const container = document.getElementById('floorSelector');
    if (container) {
        container.className = 'floor-selector loading';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.className = 'floor-grid';
        floorGrid.innerHTML = `
            <div class="spinner"></div>
        `;
    }
}

function showNoFloorsMessage() {
    const container = document.getElementById('floorSelector');
    // Ensure blue background is shown
    if (container) {
        container.className = 'floor-selector active';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.className = 'floor-grid';
        floorGrid.innerHTML = `
            <div class="welcome-message error">
                <h2>No floor plans found!</h2>
                <p>Please add a floor plan in the app settings first.</p>
            </div>
        `;
    }
}

function showErrorMessage() {
    const container = document.getElementById('floorSelector');
    // Ensure blue background is shown
    if (container) {
        container.className = 'floor-selector active';
        container.style.cssText = `display: block;`;
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.display = 'none';
    }

    const floorGrid = document.getElementById('floorGrid');
    if (floorGrid) {
        floorGrid.className = 'floor-grid';
        floorGrid.innerHTML = `
            <div class="welcome-message error">
                <h2>Something went wrong!</h2>
                <p>Dunno but we cant go any further</p>
            </div>
        `;
    }
}

/** HELPERS */
function addSettingsButton() {
    const container = document.getElementById('floorPlanContainer');
    if (!container) return;

    const settingsButton = document.createElement('button');
    settingsButton.className = 'settings-button';
    settingsButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>`;


    // Add click handler
    settingsButton.addEventListener('click', async () => {
        await Homey.api('POST', '/log', { message: 'Showing floor selector' });
        showLoadingState();
        try {
            const floors = await Homey.api('GET', '/floors');
            await showFloorSelector(floors);
        } catch (error) {
            Homey.api('POST', '/log', { message: 'Error showing floor selector: ' + error.message });
        }
    });

    container.appendChild(settingsButton);
}

// Update device update handler with more logging
function handleDeviceUpdate(data) {
    const { deviceId, capability, value } = data;

    if (!rendererManager) {
        Homey.api('POST', '/log', { message: 'RendererManager not initialized!' });
        return;
    }

    // For dim devices, we need to find elements with both dim and onoff capabilities
    const deviceElements = document.querySelectorAll(`[data-device-id="${deviceId}"]`);

    deviceElements.forEach(deviceEl => {
        const elementCapability = deviceEl.getAttribute('data-capability');
        const renderer = rendererManager.getRenderer(elementCapability);

        if (renderer && typeof renderer.handleDeviceUpdate === 'function') {
            // For dim devices, handle both dim and onoff updates
            if (elementCapability === 'dim') {
                renderer.handleDeviceUpdate(deviceEl, value, capability);
            } else if (elementCapability === capability) {
                // For other devices, only handle their specific capability
                renderer.handleDeviceUpdate(deviceEl, value);
            }
        }
    });
}
