const ruleManager = {
    Homey: null,
    floorManager: null,
    currentDeviceId: null,
    currentRuleId: null,

    initialize(Homey, floorManager) {
        console.log('Initializing RuleManager');
        this.Homey = Homey;
        this.floorManager = floorManager;
    },

    getRuleName(ruleType) {
        switch (ruleType) {
            case 'iconColor':
                return 'On/Off - Color Switcher';
            case 'allColor':
                return 'All - Static Color';
            case 'imageView':
                return 'On/Off - Image Switcher';
            default:
                return 'New Rule';
        }
    },

    renderRuleConfig(ruleType, rule = null) {
        switch (ruleType) {
            case 'iconColor':
                return `
                    <div class="color-picker-group">
                        <div class="color-input-group">
                            <label>On Color</label>
                            <input type="color" id="onColor" value="${rule ? rule.config.onColor : '#00ff00'}">
                        </div>
                        <div class="color-input-group">
                            <label>Off Color</label>
                            <input type="color" id="offColor" value="${rule ? rule.config.offColor : '#ff0000'}">
                        </div>
                    </div>`;
            case 'allColor':
                return `
                    <div class="color-picker-group">
                        <div class="color-input-group">
                            <label>Color</label>
                            <input type="color" id="staticColor" value="${rule ? rule.config.color : '#00ff00'}">
                        </div>
                    </div>`;
            case 'imageView':
                return `
                    <div class="image-rule-config">
                        <div class="image-upload-group">
                            <label>On Image</label>
                            <input type="file" id="onImage" accept="image/*" class="homey-form-input">
                            <div class="image-preview">
                                ${rule && rule.config.onImage ? `<img src="${rule.config.onImage}">` : ''}
                            </div>
                        </div>
                        <div class="image-upload-group">
                            <label>Off Image</label>
                            <input type="file" id="offImage" accept="image/*" class="homey-form-input">
                            <div class="image-preview">
                                ${rule && rule.config.offImage ? `<img src="${rule.config.offImage}">` : ''}
                            </div>
                        </div>
                        <div class="visibility-options">
                            <div class="visibility-group">
                                <label>On State</label>
                                <select id="onStateVisibility" class="homey-form-input">
                                    <option value="show" ${rule?.config?.onStateVisibility === 'show' ? 'selected' : ''}>Show</option>
                                    <option value="hide" ${rule?.config?.onStateVisibility === 'hide' ? 'selected' : ''}>Hide</option>
                                </select>
                            </div>
                            <div class="visibility-group">
                                <label>Off State</label>
                                <select id="offStateVisibility" class="homey-form-input">
                                    <option value="show" ${rule?.config?.offStateVisibility === 'show' ? 'selected' : ''}>Show</option>
                                    <option value="hide" ${rule?.config?.offStateVisibility === 'hide' ? 'selected' : ''}>Hide</option>
                                </select>
                            </div>
                        </div>
                    </div>`;
            default:
                return '';
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
        console.log('Rendering rules for device:', device.id);
        if (!device.rules || device.rules.length === 0) {
            return `
                <div class="empty-rules-state">
                    <p>No rules configured</p>
                </div>`;
        }

        return device.rules.map(rule => this.renderRuleItem(device.id, rule)).join('');
    },

    renderRuleItem(deviceId, rule) {
        return `
            <div class="rule-item">
                <div class="rule-info">
                    <span class="rule-type">${this.getRuleTypeName(rule.type)}</span>
                    <span class="rule-action">${this.getRuleActionDescription(rule)}</span>
                </div>
                <div class="rule-actions">
                    <button class="icon-button edit-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="icon-button delete-rule" data-device-id="${deviceId}" data-rule-id="${rule.id}">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
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
        if (typeSelect) {
            typeSelect.value = '';
            typeSelect.disabled = false;
            
            // Add change listener for rule type
            typeSelect.onchange = () => {
                const ruleType = typeSelect.value;
                if (!ruleType) {
                    configSection.innerHTML = '';
                    saveButton.disabled = true;
                    return;
                }

                // Show configuration based on rule type
                configSection.innerHTML = this.renderRuleConfig(ruleType);
                
                // Add image upload handler if needed
                if (ruleType === 'imageView') {
                    const onImageInput = document.getElementById('onImage');
                    const offImageInput = document.getElementById('offImage');
                    
                    if (onImageInput) {
                        onImageInput.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (file) {
                                const preview = onImageInput.parentElement.querySelector('.image-preview img');
                                if (preview) {
                                    preview.src = await this.handleImageUpload(file);
                                }
                            }
                        };
                    }
                    
                    if (offImageInput) {
                        offImageInput.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (file) {
                                const preview = offImageInput.parentElement.querySelector('.image-preview img');
                                if (preview) {
                                    preview.src = await this.handleImageUpload(file);
                                }
                            }
                        };
                    }
                }
                
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
        console.log('Editing rule:', { deviceId, ruleId });
        const dialog = document.getElementById('ruleDialog');
        if (!dialog) {
            console.error('Rule dialog not found');
            return;
        }

        const floor = this.floorManager.floors.find(f => f.id === this.floorManager.currentFloorId);
        if (!floor) {
            console.error('Floor not found');
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

        console.log('Found rule to edit:', rule);

        // Update dialog title and button text
        const titleElement = dialog.querySelector('#ruleDialogTitle');
        const saveButton = dialog.querySelector('#saveRule');
        const typeSelect = dialog.querySelector('#ruleType');
        const configSection = dialog.querySelector('#ruleConfig');

        if (titleElement) titleElement.textContent = 'Edit Rule';
        if (saveButton) saveButton.textContent = 'Save Changes';
        
        // Set the rule type and show its configuration
        if (typeSelect) {
            typeSelect.value = rule.type;
            console.log('Setting rule type:', rule.type);
            this.onRuleTypeChange(rule.type, rule);
        }

        dialog.style.display = 'flex';
        
        // Store current editing state
        this.currentDeviceId = deviceId;
        this.currentRuleId = ruleId;

        // Handle save
        const handleSave = async () => {
            try {
                console.log('Saving edited rule');
                const config = await this.getRuleConfig(rule.type);
                rule.config = config;
                
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
                console.error('Failed to save rule:', err);
                this.Homey.alert('Failed to save rule');
            }
        };

        // Attach event listeners
        if (saveButton) {
            console.log('Attaching save button listener');
            saveButton.onclick = handleSave;
        }
    },

    onRuleTypeChange(type, existingRule = null) {
        console.log('Rule type changed:', type);
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
        console.log('Saving rule');
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

    async getRuleConfig(type) {
        switch (type) {
            case 'onEnter':
                return {
                    action: document.getElementById('enterAction').value
                };
            case 'onLeave':
                return {
                    action: document.getElementById('leaveAction').value,
                    delay: parseInt(document.getElementById('leaveDelay').value, 10) || 0
                };
            case 'onStay':
                return {
                    action: document.getElementById('stayAction').value,
                    interval: parseInt(document.getElementById('stayInterval').value, 10) || 60
                };
            default:
                throw new Error('Unknown rule type');
        }
    },

    deleteRule(deviceId, ruleId) {
        console.log('Deleting rule:', { deviceId, ruleId });
        // Implementation for delete rule
    },

    attachRuleEventListeners() {
        console.log('Attaching rule event listeners');
        document.querySelectorAll('.edit-rule').forEach(button => {
            console.log('Found edit rule button:', button.dataset);
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const deviceId = button.dataset.deviceId;
                const ruleId = button.dataset.ruleId;
                console.log('Edit rule clicked:', { deviceId, ruleId });
                this.editRule(deviceId, ruleId);
            });
        });

        // Add type select change listener
        const typeSelect = document.getElementById('ruleType');
        if (typeSelect) {
            console.log('Adding type select listener');
            typeSelect.addEventListener('change', (e) => {
                console.log('Rule type changed:', e.target.value);
                this.onRuleTypeChange(e.target.value);
            });
        }
    },

    initialize() {
        console.log('Initializing rule manager');
        // Attach event listeners for rule buttons
        this.attachRuleEventListeners();
    }
};

window.ruleManager = ruleManager; 