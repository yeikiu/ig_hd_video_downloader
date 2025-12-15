// Non-module content script loader
// This runs in extension context and loads the ES module
(async () => {
    try {
        await import(chrome.runtime.getURL('ts/index.js'));
    } catch (err) {
        console.error('[ContentScriptLoader] Failed to load module:', err);
    }
})();
