let floors = [];

// Initialize when Homey is ready
function onHomeyReady(Homey) {    
    // First set Homey instance
    floorManager.Homey = Homey;
    deviceManager.Homey = Homey;

    // Initialize device manager when entering floor edit view
    floorManager.onEditFloor = async (floorId) => {
        deviceManager.currentFloorId = floorId;
        await deviceManager.initialize();
        deviceManager.setupDeviceDialog();
    };

    // Initialize
    async function init() {
        try {
            await floorManager.initialize(Homey);  // Pass Homey here
            Homey.ready();
        } catch (err) {
            logError('Initialization error:', err);
            Homey.alert(err.message || 'Failed to initialize');
        }
    }

    // Start initialization
    init();
}

function logError(message) {
    // Convert objects to strings for better logging
    const formattedMessage = typeof message === 'object' && message !== null
        ? JSON.stringify(message)
        : message;
        
    console.error(formattedMessage);
    Homey.api('POST', '/error', { message: 'SETTINGS ERROR: ' + formattedMessage });
}

function log(message) {
    // Convert objects to strings for better logging
    const formattedMessage = typeof message === 'object' && message !== null
        ? JSON.stringify(message)
        : message;
        
    console.log(formattedMessage);
    Homey.api('POST', '/log', { message: 'SETTINGS LOG: ' + formattedMessage });
}

// Export for global access
window.logError = logError;
window.log = log;
window.onHomeyReady = onHomeyReady; 