// Settings for the External Dashboard server (opt-in). The app watches the
// `externalDashboard` key and starts/stops the server; it reports back in
// `externalDashboardStatus`, which is polled briefly after saving.
const dashboardSettings = {
    Homey: null,

    initialize(Homey) {
        this.Homey = Homey;
        document.getElementById('extSave').addEventListener('click', () => this.save());
        this.load();
    },

    setStatus(text, isError) {
        const el = document.getElementById('extStatus');
        el.textContent = text;
        el.classList.toggle('error', !!isError);
    },

    get(key) {
        return new Promise((resolve, reject) => {
            this.Homey.get(key, (err, value) => (err ? reject(err) : resolve(value)));
        });
    },

    set(key, value) {
        return new Promise((resolve, reject) => {
            this.Homey.set(key, value, err => (err ? reject(err) : resolve()));
        });
    },

    unset(key) {
        return new Promise((resolve, reject) => {
            this.Homey.unset(key, err => (err ? reject(err) : resolve()));
        });
    },

    async load() {
        try {
            const config = (await this.get('externalDashboard')) || {};
            document.getElementById('extEnabled').checked = !!config.enabled;
            document.getElementById('extPin').value = config.pin || '';
            document.getElementById('extPort').value = config.port || 7580;
            this.showStatus(await this.get('externalDashboardStatus'), !!config.enabled);
        } catch (err) {
            this.setStatus('Could not load settings: ' + err.message, true);
        }
    },

    showStatus(status, enabled) {
        if (!enabled) return this.setStatus('Off');
        if (!status) return this.setStatus('Starting…');
        if (!status.running) return this.setStatus('Could not start: ' + status.error, true);
        this.setStatus('Running. Open ' + status.url + ' (editor: ' + status.url + 'editor)');
    },

    async save() {
        const enabled = document.getElementById('extEnabled').checked;
        const pin = document.getElementById('extPin').value.trim();
        const port = parseInt(document.getElementById('extPort').value, 10);

        if (enabled && !/^[0-9]{4,8}$/.test(pin)) {
            return this.setStatus('Enter a PIN of 4-8 digits first.', true);
        }
        if (!(port >= 1024 && port <= 65535)) {
            return this.setStatus('Port must be between 1024 and 65535.', true);
        }

        try {
            await this.unset('externalDashboardStatus');
            await this.set('externalDashboard', { enabled, pin, port });
            this.setStatus(enabled ? 'Starting…' : 'Off');
            if (!enabled) return;

            for (let i = 0; i < 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const status = await this.get('externalDashboardStatus');
                if (status) return this.showStatus(status, true);
            }
            this.setStatus('The app did not report back. Check the app log.', true);
        } catch (err) {
            this.setStatus('Save failed: ' + err.message, true);
        }
    }
};
