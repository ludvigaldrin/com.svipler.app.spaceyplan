let Homey; // Store Homey instance
let currentDevices = [];
let rendererManager; // Add this at the top
let widgetId;

/** INIT */

async function onHomeyReady(_Homey) {
    Homey = _Homey;
    Homey.ready();

    const settings = Homey.getSettings();
    const widgetHeight = settings.widgetHeight || 400; // fallback to 400 if not set

    await Homey.setHeight(widgetHeight);
    try {
        await init();
    } catch (error) {
        Homey.api('POST', '/error', { message: `Init error: ${JSON.stringify(error)}` });
        showErrorMessage(error.message);
    }
}

async function init() {
    // First Show Loading State
    showLoadingState();




    // Now load the widget
    widgetId = await Homey.getWidgetInstanceId();

    if (!widgetId) { // No widget ID available
        showErrorMessage("No widget ID available");
        return;
    }

    Homey.api('POST', '/log', { message: 'Init widget: ' + widgetId });
    // Get all floors
    const floors = await Homey.api('GET', '/floors');

    if (!floors || floors.length === 0) {
        showNoFloorsMessage();
        return;
    }

    // Get selected floor
    const selectedFloors = await Homey.api('GET', '/selectedFloors');
    const selectedFloor = selectedFloors[widgetId];

    if (selectedFloor && selectedFloor.floorId) {
        // Find the floor data
        const floor = floors.find(f => f.id === selectedFloor.floorId);
        if (floor) {
            await showSelectedFloor(floor);
        } else {
            showFloorSelector(floors);
        }
    } else {
        showFloorSelector(floors);
    }

    // Set up resize handler
    setupResizeHandler();
}
/** VIEWS */

async function showFloorSelector(floors) {
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
            <h2>Welcome to Spacey Plan!</h2>
            <div class="floor-select-container">
                <select id="floorSelect" class="floor-select" >
                    <option value="">Choose a floor...</option>
                    ${floors.map(floor => `<option value="${floor.id}">${floor.name}</option>`).join('')}
                </select>
            </div>
            <button id="applyButton" class="homey-button-primary" disabled>
                Select Floor
            </button>
            <small style="color: #000; font-size: 8px;">Note! You cant be in Widget edit to select!</small>
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

        if (selectedFloor) {
            // Save the selected floor for this widget
            const result = await Homey.api('POST', '/selectedFloors', {
                widgetId: widgetId,
                floorId: selectedFloor.id
            });

            // We now have saved to lets select this floor now
            await showSelectedFloor(selectedFloor);
        }

    });

}

async function showSelectedFloor(floor) {
    // Initialize RendererManager with widgetId
    rendererManager = new CapabilityRendererManager();
    rendererManager.setWidgetId(widgetId);

    // Store the floor's aspect ratio for device positioning
    if (floor.imageAspectRatio) {
        rendererManager.setFloorAspectRatio(floor.imageAspectRatio);
    } else {
        Homey.api('POST', '/error', { message: '[FLOOR] Warning: No aspect ratio stored for floor' });
    }

    // Register renderers
    if (window.capabilityRenderers) {
        Object.values(window.capabilityRenderers).forEach(renderer => {
            rendererManager.registerRenderer(renderer);
        });
    }

    // Set up device update listener
    Homey.on(`widget:${widgetId}:deviceUpdate`, handleDeviceUpdate);

    const container = document.getElementById('floorSelector');
    if (container) {
        container.style.display = 'none';
    }

    const floorPlanContainer = document.getElementById('floorPlanContainer');
    if (floorPlanContainer) {
        floorPlanContainer.style.cssText = `display: block;`;
    }

    // Create or update the image wrapper to maintain aspect ratio
    let imageWrapper = document.getElementById('imageWrapper');
    if (!imageWrapper) {
        imageWrapper = document.createElement('div');
        imageWrapper.id = 'imageWrapper';
        imageWrapper.className = 'image-wrapper';
        floorPlanContainer.appendChild(imageWrapper);
    }

    const floorMapImage = document.getElementById('floorMapImage') || document.createElement('img');
    floorMapImage.id = 'floorMapImage';
    floorMapImage.className = 'floor-map';

    if (floor.image) {
        floorMapImage.src = floor.image;
    }

    if (!floorMapImage.parentNode) {
        imageWrapper.appendChild(floorMapImage);
    }

    // Create or update the devices container
    let devicesContainer = document.getElementById('floorPlanDevices');
    if (!devicesContainer) {
        devicesContainer = document.createElement('div');
        devicesContainer.id = 'floorPlanDevices';
        imageWrapper.appendChild(devicesContainer);
    } else {
        devicesContainer.innerHTML = ''; // Clear existing devices
    }

    // Render each device
    for (const device of floor.devices) {
        await rendererManager.renderDevice(device, devicesContainer);
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

function showErrorMessage(errorMessage) {
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
    // Remove any existing settings button first
    const existingButton = document.querySelector('.settings-button');
    if (existingButton) {
        existingButton.remove();
    }

    const button = document.createElement('button');
    button.className = 'settings-button';
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    // Change the click handler to show the floor selector
    button.addEventListener('click', async () => {
        try {
            // Get all floors
            const floors = await Homey.api('GET', '/floors');

            if (!floors || floors.length === 0) {
                showNoFloorsMessage();
                return;
            }

            // Show the floor selector
            showFloorSelector(floors);
        } catch (error) {
            Homey.api('POST', '/error', { message: `Error showing floor selector: ${JSON.stringify(error)}` });
            showErrorMessage("Failed to load floor selector");
        }
    });

    const container = document.querySelector('.widget-container');
    if (container) {
        container.appendChild(button);
    }
}

// Update device update handler with more logging
function handleDeviceUpdate(data) {
    const { deviceId, capability, value } = data;

    if (!rendererManager) {
        return;
    }

    // Find all elements for this device (could be both dim and onoff)
    const deviceElements = document.querySelectorAll(`[data-device-id="${deviceId}"]`);

    deviceElements.forEach(deviceEl => {
        const elementCapability = deviceEl.getAttribute('data-capability');

        const renderer = rendererManager.getRenderer(elementCapability);
        if (renderer && typeof renderer.handleDeviceUpdate === 'function') {
            renderer.handleDeviceUpdate(deviceEl, value, capability);
        }
    });
}

function renderDevicesOnFloor(floor) {
    if (!floor || !floor.devices || !floor.devices.length) {
        Homey.api('POST', '/error', { message: 'No devices to render on floor' });
        return;
    }

    // Clear existing devices
    const existingDevices = document.querySelectorAll('.device-element');
    existingDevices.forEach(device => device.remove());

    // First pass: create all device elements
    floor.devices.forEach(device => {
        if (!device || !device.homeyId) {
            Homey.api('POST', '/error', { message: 'Invalid device data: ' + JSON.stringify(device) });
            return;
        }

        try {
            const renderer = CapabilityRendererManager.getRendererForDevice(device);
            if (renderer) {
                renderer.createDeviceElement(device, floor.imageAspectRatio);
            } else {
                Homey.api('POST', '/error', { message: 'No renderer found for device: ' + device.name });
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: 'Error creating device element: ' + JSON.stringify(error) });
        }
    });

    // Second pass: initialize device states
    floor.devices.forEach(device => {
        if (!device || !device.homeyId) return;

        try {
            const renderer = CapabilityRendererManager.getRendererForDevice(device);
            if (renderer) {
                renderer.initializeState(device);
            }
        } catch (error) {
            Homey.api('POST', '/error', { message: 'Error initializing device state: ' + JSON.stringify(error) });
        }
    });
}

// Add a window resize handler to recalculate device positions
function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce to avoid excessive recalculations
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const deviceElements = document.querySelectorAll('.device-element');
            const floorMapImage = document.querySelector('.floor-map');
            const wrapper = document.querySelector('.image-wrapper');

            if (!deviceElements.length || !floorMapImage || !wrapper) return;

            deviceElements.forEach(deviceEl => {
                try {
                    const deviceId = deviceEl.getAttribute('data-device-id');
                    if (!deviceId) return;

                    const device = JSON.parse(deviceEl.getAttribute('data-device') || '{}');
                    if (!device || !device.capability) return;

                    const renderer = CapabilityRendererManager.getRendererForCapability(device.capability);
                    if (!renderer) return;

                    // Trigger repositioning
                    renderer.positionDevice(deviceEl, device);
                } catch (error) {
                    Homey.api('POST', '/error', { message: 'Error repositioning device: ' + JSON.stringify(error) });
                }
            });
        }, 250); // Wait 250ms after resize ends
    });
}
