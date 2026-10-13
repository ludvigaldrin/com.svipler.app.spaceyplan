// Settings for the External Dashboard server (opt-in). The app watches the
// `externalDashboard` key and starts/stops the server; it reports back in
// `externalDashboardStatus`, which is polled briefly after saving.
const dashboardSettings = {
    Homey: null,

    initialize(Homey) {
        this.Homey = Homey;
        const $ = id => document.getElementById(id);
        $('extSave').addEventListener('click', () => this.save());
        $('extStart').addEventListener('click', () => {
            $('extEnabled').checked = true;
            $('extPin').value = $('extPinIntro').value.trim();
            this.save();
        });
        $('extOpenBuilder').addEventListener('click', () => window.open(this.url + 'editor', '_blank'));
        $('extOpenDash').addEventListener('click', () => window.open(this.url, '_blank'));
        $('extCopy').addEventListener('click', () => {
            try { navigator.clipboard.writeText(this.url); $('extCopy').textContent = 'Copied'; }
            catch (e) { $('extCopy').textContent = this.url; }
        });
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
        const $ = id => document.getElementById(id);
        const running = !!(enabled && status && status.running);
        $('extIntro').style.display = enabled ? 'none' : '';
        $('extRunning').style.display = running ? '' : 'none';
        if (running) {
            this.url = status.url;
            $('extUrl').textContent = status.url;
            $('extCopy').textContent = 'Copy';
            this.loadDashboards();
        }
        if (!enabled) return this.setStatus('');
        if (!status) return this.setStatus('Starting…');
        if (!status.running) return this.setStatus('Could not start: ' + status.error, true);
        this.setStatus('');
    },

    async loadDashboards() {
        const el = document.getElementById('extDashboards');
        try {
            const dashboards = (await this.get('dashboards')) || [];
            if (!dashboards.length) {
                el.textContent = 'None yet. Open the builder to create one' + (this.hasFloors ? '.' : ' (add a floor plan first for a floor plan block).');
                return;
            }
            el.innerHTML = '';
            for (const d of dashboards) {
                const row = document.createElement('div');
                row.className = 'ext-row';
                const pages = (d.pages || []).length;
                row.textContent = d.name + ' · ' + pages + (pages === 1 ? ' page' : ' pages');
                el.appendChild(row);
            }
        } catch (err) {
            el.textContent = 'Could not load dashboards: ' + err.message;
        }
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

// Tabs: Floor Plans / Dashboard. The tab bar hides while a floor is being
// edited (settings.js hides #floorsListView then).
(function () {
  const tabs = document.getElementById('mainTabs');
  const list = document.getElementById('floorsListView');
  const dash = document.getElementById('externalDashboardSection');
  if (!tabs || !list || !dash) return;
  let active = 'floorplans';
  let listHidden = false;

  function apply() {
    tabs.style.display = listHidden ? 'none' : '';
    list.style.display = !listHidden && active === 'floorplans' ? '' : 'none';
    dash.style.display = !listHidden && active === 'dashboard' ? '' : 'none';
    tabs.querySelectorAll('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === active));
  }

  tabs.addEventListener('click', e => {
    const b = e.target.closest('.main-tab');
    if (!b) return;
    active = b.dataset.tab;
    apply();
  });

  // Edit view toggles floorsListView; detect it via the edit view's visibility.
  const edit = document.getElementById('floorEditView');
  const watch = () => { listHidden = !!edit && edit.style.display !== 'none'; apply(); };
  if (edit) new MutationObserver(watch).observe(edit, { attributes: true, attributeFilter: ['style', 'class'] });
  watch();
})();
