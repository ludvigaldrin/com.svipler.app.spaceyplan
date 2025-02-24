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
            console.error('Initialization error:', err);
            Homey.alert(err.message || 'Failed to initialize');
        }
    }

    // Start initialization
    init();
}

// Export for global access
window.onHomeyReady = onHomeyReady; 