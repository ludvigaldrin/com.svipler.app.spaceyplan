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

function logError(...args) {
    // Combine all arguments into a single message
    let formattedMessage = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return `[Object conversion failed: ${e.message}]`;
            }
        }
        return String(arg);
    }).join(' ');
        
    console.error(formattedMessage);
    Homey.api('POST', '/error', { message: 'SETTINGS ERROR: ' + formattedMessage });
}

function log(...args) {
    // Combine all arguments into a single message
    let formattedMessage = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return `[Object conversion failed: ${e.message}]`;
            }
        }
        return String(arg);
    }).join(' ');
        
    console.log(formattedMessage);
    Homey.api('POST', '/log', { message: 'SETTINGS LOG: ' + formattedMessage });
}

// Export for global access
window.logError = logError;
window.log = log;
window.onHomeyReady = onHomeyReady; 