const ruleManager = {
    Homey: null,
    floorManager: null,
    currentDeviceId: null,
    currentRuleId: null,

    init(floorManager, Homey) {
        this.floorManager = floorManager;
        this.Homey = Homey;
        this.attachImageUploadHandlers();
    },

    attachImageUploadHandlers() {
        document.addEventListener('change', (e) => {
            if (e.target.id === 'ruleImage') {
                this.handleRuleImageUpload(e);
            }
        });
    },

    handleRuleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Use same max dimensions as floor images
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1080;

                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                if (height > MAX_HEIGHT) {
                    width = Math.round((width * MAX_HEIGHT) / height);
                    height = MAX_HEIGHT;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const imageData = canvas.toDataURL('image/png');

                // Update preview
                const preview = document.getElementById('ruleImagePreview');
                preview.innerHTML = `
                    <div style="max-width: 300px; max-height: 200px; overflow: hidden;">
                        <img src="${imageData}" style="width: 100%; height: auto; object-fit: contain;">
                    </div>`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    getRuleName(ruleType) {
        const types = {
            'onOffColor': 'On/Off - Color Switcher',
            'allColor': 'All - Static Color',
            'imageView': 'On/Off - Image Switcher'
        };
        return types[ruleType] || 'Unknown Rule Type';
    },

    renderRuleConfig(ruleType, existingRule = null) {
        if (ruleType === 'allColor') {
            return `
                <div class="color-picker-group">
                    <div class="color-input-group">
                        <label>Color</label>
                        <input type="color" id="staticColor" value="${existingRule?.config?.color || '#00ff00'}">
                    </div>
                </div>
            `;
        } else if (ruleType === 'onOffColor') {
            return `
                <div class="color-picker-group">
                    <div class="color-input-group">
                        <label>On Color</label>
                        <input type="color" id="onColor" value="${existingRule?.config?.onColor || '#ffeb3b'}">
                    </div>
                    <div class="color-input-group">
                        <label>Off Color</label>
                        <input type="color" id="offColor" value="${existingRule?.config?.offColor || '#ffffff'}">
                    </div>
                </div>
            `;
        } else if (ruleType === 'imageView') {
            return `
                <div class="image-rule-config">
                    <div class="image-upload-group">
                        <label>Image</label>
                        <input type="file" id="ruleImage" accept="image/*" class="homey-form-input">
                        <div id="ruleImagePreview" class="image-preview">
                            ${existingRule?.config?.imageData ? `<img src="${existingRule.config.imageData}">` : ''}
                        </div>
                    </div>
                    <div class="visibility-options">
                        <label>Show image when device is:</label>
                        <select id="imageVisibility" class="homey-form-input">
                            <option value="on" ${existingRule?.config?.showOn ? 'selected' : ''}>On</option>
                            <option value="off" ${!existingRule?.config?.showOn ? 'selected' : ''}>Off</option>
                        </select>
                    </div>
                </div>
            `;
        }
    },

    async handleImageUpload(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    renderRules(device) {
        if (!device.rules || device.rules.length === 0) {
            return `
                <div class="add-rule-row" data-device-id="${device.id}">
                    <span>Add new rule</span>
                    <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#666" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                </div>`;
        }

        return `
            ${device.rules.map(rule => this.renderRuleItem(device.id, rule)).join('')}
            <div class="add-rule-row" data-device-id="${device.id}">
                <span>Add new rule</span>
                <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#666" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
            </div>`;
    },

    renderRuleItem(deviceId, rule) {
        return `
            <div class="rule-item">
                <div class="rule-info">
                    <span class="rule-name">${rule.name}</span>
                </div>
                <div class="rule-actions">
                    <button class="icon-button edit-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}" title="Edit">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#666" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="icon-button delete-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}" title="Delete">
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#666" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    },

    getRuleTypeName(type) {
        const types = {
            onEnter: 'On Enter',
            onLeave: 'On Leave',
            onStay: 'While Present'
        };
        return types[type] || type;
    },

    getRuleActionDescription(rule) {
        const actions = {
            turnOn: 'Turn On',
            turnOff: 'Turn Off'
        };
        let desc = actions[rule.config.action] || rule.config.action;
        
        if (rule.type === 'onLeave' && rule.config.delay) {
            desc += ` after ${rule.config.delay}s`;
        } else if (rule.type === 'onStay' && rule.config.interval) {
            desc += ` every ${rule.config.interval}s`;
        }
        
        return desc;
    },

    addRule(deviceId) {
        const dialog = document.getElementById('ruleDialog');
        if (!dialog) {
            console.error('Rule dialog not found');
            return;
        }

        // Reset and prepare dialog for new rule
        const titleElement = dialog.querySelector('#ruleDialogTitle');
        const saveButton = dialog.querySelector('#saveRule');
        const typeSelect = dialog.querySelector('#ruleType');
        const configSection = dialog.querySelector('#ruleConfig');

        if (titleElement) titleElement.textContent = 'Add New Rule';
        if (saveButton) {
            saveButton.textContent = 'Add Rule';
            saveButton.disabled = true;
        }

        // Get existing rule types for this device
        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        const device = floor?.devices.find(d => d.id === deviceId);
        const existingRuleTypes = device?.rules?.map(r => r.type) || [];

        // Update rule type options - only filter color rules
        if (typeSelect) {
            typeSelect.innerHTML = `
                <option value="">Choose a rule type...</option>
                ${!existingRuleTypes.includes('allColor') ? '<option value="allColor">All - Static Color</option>' : ''}
                ${!existingRuleTypes.includes('onOffColor') ? '<option value="onOffColor">On/Off - Color Switcher</option>' : ''}
                <option value="imageView">On/Off - Image Switcher</option>
            `;
            typeSelect.disabled = false;
            
            // Add change listener for rule type
            typeSelect.onchange = () => {
                const ruleType = typeSelect.value;
                if (!ruleType) {
                    configSection.innerHTML = '';
                    saveButton.disabled = true;
                    return;
                }

                configSection.innerHTML = this.renderRuleConfig(ruleType);
                saveButton.disabled = false;
            };
        }
        if (configSection) configSection.innerHTML = '';

        dialog.style.display = 'flex';

        const handleSave = async () => {
            try {
                const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
                if (!floor) return;

                const device = floor.devices.find(d => d.id === deviceId);
                if (!device) return;

                const ruleType = typeSelect.value;
                if (!ruleType) {
                    this.Homey.alert('Please select a rule type');
                    return;
                }

                const config = await this.getRuleConfig(ruleType);
                const newRule = {
                    id: Date.now().toString(),
                    type: ruleType,
                    name: this.getRuleName(ruleType),
                    config
                };

                if (!device.rules) device.rules = [];
                device.rules.push(newRule);

                await this.floorManager.saveFloors();
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const rulesContent = rulesSection.querySelector('.floor-rules-content');
                    if (rulesContent) {
                        rulesContent.innerHTML = this.renderRules(device);
                        this.floorManager.attachRuleEventListeners(rulesContent);
                    }
                }
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to save rule:', err);
                this.Homey.alert('Failed to save rule');
            }
        };

        // Event listeners
        const saveBtn = dialog.querySelector('#saveRule');
        const cancelBtn = dialog.querySelector('#cancelRule');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        if (saveBtn) saveBtn.onclick = handleSave;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
    },

    editRule(deviceId, ruleId) {
        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        if (!floor) {
            console.error('Current floor not found');
            return;
        }

        const device = floor.devices.find(d => d.id === deviceId);
        if (!device) {
            console.error('Device not found');
            return;
        }

        const rule = device.rules.find(r => r.id === ruleId);
        if (!rule) {
            console.error('Rule not found');
            return;
        }

        const dialog = document.getElementById('ruleDialog');
        if (!dialog) {
            console.error('Rule dialog not found');
            return;
        }

        // Store current device and rule IDs
        this.currentDeviceId = deviceId;
        this.currentRuleId = ruleId;

        // Update dialog title and button text
        const titleElement = dialog.querySelector('#ruleDialogTitle');
        const saveButton = dialog.querySelector('#saveRule');
        const typeSelect = dialog.querySelector('#ruleType');
        const configSection = dialog.querySelector('#ruleConfig');

        if (titleElement) titleElement.textContent = 'Edit Rule';
        if (saveButton) {
            saveButton.textContent = 'Save Changes';
            saveButton.disabled = false;
        }

        // Show all rule types in edit mode
        if (typeSelect) {
            typeSelect.innerHTML = `
                <option value="">Choose a rule type...</option>
                <option value="allColor" ${rule.type === 'allColor' ? 'selected' : ''}>All - Static Color</option>
                <option value="onOffColor" ${rule.type === 'onOffColor' ? 'selected' : ''}>On/Off - Color Switcher</option>
                <option value="imageView" ${rule.type === 'imageView' ? 'selected' : ''}>On/Off - Image Switcher</option>
            `;
            typeSelect.disabled = true;
        }

        configSection.innerHTML = this.renderRuleConfig(rule.type, rule);

        dialog.style.display = 'flex';

        // Add save handler
        const handleSave = async () => {
            try {
                const config = await this.getRuleConfig(rule.type);
                rule.config = config;
                await this.floorManager.saveFloors();
                
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const rulesContent = rulesSection.querySelector('.floor-rules-content');
                    if (rulesContent) {
                        rulesContent.innerHTML = this.renderRules(device);
                        this.floorManager.attachRuleEventListeners(rulesContent);
                    }
                }
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to save rule:', err);
                this.Homey.alert('Failed to save rule');
            }
        };

        const saveBtn = dialog.querySelector('#saveRule');
        const cancelBtn = dialog.querySelector('#cancelRule');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        if (saveBtn) saveBtn.onclick = handleSave;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
    },

    onRuleTypeChange(type, existingRule = null) {
        const configSection = document.getElementById('ruleConfig');
        if (!configSection) return;

        configSection.innerHTML = this.getRuleConfigHTML(type, existingRule);
    },

    getRuleConfigHTML(type, rule = null) {
        switch (type) {
            case 'onEnter':
                return this.getEnterConfigHTML(rule);
            case 'onLeave':
                return this.getLeaveConfigHTML(rule);
            case 'onStay':
                return this.getStayConfigHTML(rule);
            default:
                return '<p>Unknown rule type</p>';
        }
    },

    getEnterConfigHTML(rule) {
        return `
            <div class="rule-config-group">
                <label class="homey-form-label">Action when entering zone</label>
                <select class="homey-form-input" id="enterAction">
                    <option value="turnOn" ${rule?.config?.action === 'turnOn' ? 'selected' : ''}>Turn On</option>
                    <option value="turnOff" ${rule?.config?.action === 'turnOff' ? 'selected' : ''}>Turn Off</option>
                </select>
            </div>`;
    },

    getLeaveConfigHTML(rule) {
        return `
            <div class="rule-config-group">
                <label class="homey-form-label">Action when leaving zone</label>
                <select class="homey-form-input" id="leaveAction">
                    <option value="turnOn" ${rule?.config?.action === 'turnOn' ? 'selected' : ''}>Turn On</option>
                    <option value="turnOff" ${rule?.config?.action === 'turnOff' ? 'selected' : ''}>Turn Off</option>
                </select>
                <label class="homey-form-label">Delay (seconds)</label>
                <input type="number" class="homey-form-input" id="leaveDelay" 
                       value="${rule?.config?.delay || 0}" min="0" max="300">
            </div>`;
    },

    getStayConfigHTML(rule) {
        return `
            <div class="rule-config-group">
                <label class="homey-form-label">Action while in zone</label>
                <select class="homey-form-input" id="stayAction">
                    <option value="turnOn" ${rule?.config?.action === 'turnOn' ? 'selected' : ''}>Turn On</option>
                    <option value="turnOff" ${rule?.config?.action === 'turnOff' ? 'selected' : ''}>Turn Off</option>
                </select>
                <label class="homey-form-label">Check interval (seconds)</label>
                <input type="number" class="homey-form-input" id="stayInterval" 
                       value="${rule?.config?.interval || 60}" min="30" max="3600">
            </div>`;
    },

    async saveRule(type) {
        try {
            const config = await this.getRuleConfig(type);
            const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
            if (!floor) throw new Error('Floor not found');

            const device = floor.devices.find(d => d.id === this.currentDeviceId);
            if (!device) throw new Error('Device not found');

            if (this.currentRuleId) {
                // Update existing rule
                const rule = device.rules.find(r => r.id === this.currentRuleId);
                if (!rule) throw new Error('Rule not found');
                rule.config = config;
            }

            await this.floorManager.saveFloors();
            
            // Update UI
            const rulesSection = document.getElementById(`rules-${this.currentDeviceId}`);
            if (rulesSection) {
                const rulesContent = rulesSection.querySelector('.floor-rules-content');
                if (rulesContent) {
                    rulesContent.innerHTML = this.renderRules(device);
                    this.floorManager.attachRuleEventListeners(rulesContent);
                }
            }

            document.getElementById('ruleDialog').style.display = 'none';
        } catch (err) {
            console.error('Failed to save rule:', err);
            this.Homey.alert('Failed to save rule');
        }
    },

    async getRuleConfig(ruleType) {
        if (ruleType === 'allColor') {
            return {
                color: document.getElementById('staticColor').value
            };
        } else if (ruleType === 'onOffColor') {
            return {
                onColor: document.getElementById('onColor').value,
                offColor: document.getElementById('offColor').value
            };
        } else if (ruleType === 'imageView') {
            const imagePreview = document.getElementById('ruleImagePreview').querySelector('img');
            const visibilitySelect = document.getElementById('imageVisibility');
            return {
                imageData: imagePreview ? imagePreview.src : null,
                showOn: visibilitySelect.value === 'on'
            };
        }
    },

    deleteRule(deviceId, ruleId) {
        const dialog = document.getElementById('deleteConfirmDialog');
        if (!dialog) {
            console.error('Delete confirmation dialog not found');
            return;
        }

        // Update dialog text for rule deletion
        const modalTitle = dialog.querySelector('#deleteDialogTitle');
        const modalDescription = dialog.querySelector('#deleteDialogDescription');

        if (modalTitle) modalTitle.textContent = 'Delete Rule';
        if (modalDescription) modalDescription.textContent = 'Are you sure you want to delete this rule? This action cannot be undone.';

        // Show dialog
        dialog.style.display = 'flex';

        const handleDelete = async () => {
            try {
                const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
                if (!floor) return;

                const device = floor.devices.find(d => d.id === deviceId);
                if (!device) return;

                // Remove rule from device
                device.rules = device.rules.filter(r => r.id !== ruleId);

                await this.floorManager.saveFloors();

                // Update UI
                const rulesSection = document.getElementById(`rules-${deviceId}`);
                if (rulesSection) {
                    const rulesContent = rulesSection.querySelector('.floor-rules-content');
                    if (rulesContent) {
                        rulesContent.innerHTML = this.renderRules(device);
                        this.floorManager.attachRuleEventListeners(rulesContent);
                    }
                }
                dialog.style.display = 'none';
            } catch (err) {
                console.error('Failed to delete rule:', err);
                this.Homey.alert('Failed to delete rule');
            }
        };

        // Event listeners
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');
        const closeBtn = dialog.querySelector('.modal-close-button');
        
        if (confirmBtn) confirmBtn.onclick = handleDelete;
        if (cancelBtn) cancelBtn.onclick = () => dialog.style.display = 'none';
        if (closeBtn) closeBtn.onclick = () => dialog.style.display = 'none';
    },

    attachRuleEventListeners() {
        document.querySelectorAll('.edit-rule').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                this.editRule(deviceId, ruleId);
            });
        });

        // Add type select change listener
        const typeSelect = document.getElementById('ruleType');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.onRuleTypeChange(e.target.value);
            });
        }
    },

    initialize() {
        // Attach event listeners for rule buttons
        this.attachRuleEventListeners();
    }
};

window.ruleManager = ruleManager; 