'use strict';

// Firefox: alias chrome -> browser (see app.js for the full explanation). No-op in Chrome.
if (typeof browser !== 'undefined') { globalThis.chrome = browser; }

async function applyAboutAppearance() {
  const data = await chrome.storage.local.get('meshtabState');
  const requested = data?.meshtabState?.settings?.appearance || 'light';
  const dark = requested === 'dark' || (requested === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

applyAboutAppearance();

const version = chrome.runtime.getManifest().version;
document.querySelector('#aboutVersion').textContent = `Version ${version}`;

async function openMeshTab(event) {
  event.preventDefault();
  try {
    const response = await chrome.runtime.sendMessage({ type: 'meshtab-open', hash: '' });
    if (!response?.ok) throw new Error(response?.error || 'Could not open MeshTab');
  } catch (error) {
    console.warn('MeshTab open helper failed; opening normally.', error);
    const data = await chrome.storage.local.get('meshtabState');
    const pinOnOpen = data?.meshtabState?.settings?.pinOnOpen !== false;
    await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html?mt_source=open'), active: true, pinned: pinOnOpen });
  }
}

document.querySelector('#openMeshTabLink').addEventListener('click', openMeshTab);
