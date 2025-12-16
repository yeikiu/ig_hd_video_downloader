import browser from 'webextension-polyfill';

interface Settings {
    extensionEnabled: boolean;
    whatsappMode: boolean;
}

const defaultSettings: Settings = {
    extensionEnabled: true,
    whatsappMode: false,
};

const initOptions = async () => {
    // Load settings
    const stored = await browser.storage.local.get(['extensionEnabled', 'whatsappMode']);
    const settings: Settings = { ...defaultSettings, ...stored };

    // Elements
    const masterToggle = document.getElementById('masterToggle') as HTMLInputElement;
    const whatsappToggle = document.getElementById('whatsappToggle') as HTMLInputElement;

    if (masterToggle) {
        masterToggle.checked = settings.extensionEnabled;
        masterToggle.addEventListener('change', async () => {
            await browser.storage.local.set({ extensionEnabled: masterToggle.checked });

            // Reload active instagram tabs to apply changes immediately
            const tabs = await browser.tabs.query({ url: '*://*.instagram.com/*' });
            tabs.forEach(tab => {
                if (tab.id) browser.tabs.reload(tab.id);
            });

            updateStatus(true);
        });
    }

    if (whatsappToggle) {
        whatsappToggle.checked = settings.whatsappMode;
        whatsappToggle.addEventListener('change', async () => {
            await browser.storage.local.set({ whatsappMode: whatsappToggle.checked });

            // Reload active instagram tabs to apply changes immediately
            const tabs = await browser.tabs.query({ url: '*://*.instagram.com/*' });
            tabs.forEach(tab => {
                if (tab.id) browser.tabs.reload(tab.id);
            });

            updateStatus(true);
        });
    }

    // Version display
    const versionEl = document.getElementById('version');
    if (versionEl) {
        const manifest = browser.runtime.getManifest();
        versionEl.innerText = `v${manifest.version}`;
    }
};

const updateStatus = (saved: boolean) => {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = saved ? 'Saved!' : '';
        setTimeout(() => {
            status.textContent = '';
        }, 1500);
    }
}

document.addEventListener('DOMContentLoaded', initOptions);
