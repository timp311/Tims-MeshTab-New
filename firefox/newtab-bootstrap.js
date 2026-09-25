'use strict';

// Firefox: alias chrome -> browser (see app.js for the full explanation). No-op in Chrome.
if (typeof browser !== 'undefined') { globalThis.chrome = browser; }

(async () => {
  const reveal = () => document.documentElement.classList.remove('meshtab-booting');
  const ownsNewTab = chrome.runtime.getManifest()?.chrome_url_overrides?.newtab === 'newtab.html';
  if (!ownsNewTab) { reveal(); return; }
  // A deliberate open (the popup's "Open MeshTab" button, a Task/Reminder/Overlay link,
  // or a pinned startup tab) always carries mt_source in the URL. Only a bare, organic
  // Chrome New Tab load (no query string) should ever be bounced to the built-in New Tab
  // page based on the "Use MeshTab for New Tabs" preference.
  const isExplicitOpen = new URLSearchParams(location.search).has('mt_source');
  if (isExplicitOpen) { reveal(); return; }
  try {
    const data = await chrome.storage.local.get('meshtabState');
    const enabled = data?.meshtabState?.settings?.useMeshTabNewTab !== false;
    if (!enabled) {
      // Guard against a browser build that might route about:newtab back through this override.
      if (sessionStorage.getItem('meshtab-home-bypass') === '1') {
        sessionStorage.removeItem('meshtab-home-bypass');
        reveal();
        return;
      }
      sessionStorage.setItem('meshtab-home-bypass', '1');
      const response = await chrome.runtime.sendMessage({ type: 'meshtab-open-home-screen' });
      if (response?.ok) return;
      sessionStorage.removeItem('meshtab-home-bypass');
    }
  } catch (error) {
    console.warn('MeshTab New Tab preference could not be applied.', error);
  }
  reveal();
})();
