'use strict';

// Firefox: alias chrome -> browser (see app.js for the full explanation). No-op in Chrome.
if (typeof browser !== 'undefined') { globalThis.chrome = browser; }

// importScripts only exists inside an actual service worker (Chrome's MV3 background).
// Firefox's stable MV3 background is a classic, non-worker background page where
// reminders.js is instead loaded as a sibling script via manifest.firefox.json's
// "background.scripts" array, so it's already in scope by the time this file runs.
if (typeof importScripts === 'function') { importScripts('reminders.js'); }

const STORAGE_KEY = 'meshtabState';
const REMINDER_ALARM_PREFIX = 'meshtab-reminder:';
const REMINDER_SNOOZE_PREFIX = 'meshtab-reminder-snooze:';
const REMINDER_NOTIFICATION_PREFIX = 'meshtab-reminder-notify:';
let syncingReminders = false;

function normalizeMeshSettings(rawSettings = {}) {
  const legacy = typeof rawSettings.openPinnedOnStartup === 'boolean' ? rawSettings.openPinnedOnStartup : null;
  return {
    openOnStart: typeof rawSettings.openOnStart === 'boolean' ? rawSettings.openOnStart : (legacy ?? true),
    pinOnStart: typeof rawSettings.pinOnStart === 'boolean' ? rawSettings.pinOnStart : (legacy ?? true),
    pinOnOpen: typeof rawSettings.pinOnOpen === 'boolean' ? rawSettings.pinOnOpen : true,
    meshTabScope: rawSettings.meshTabScope === 'all-windows' ? 'all-windows' : 'per-window',
    useMeshTabNewTab: typeof rawSettings.useMeshTabNewTab === 'boolean' ? rawSettings.useMeshTabNewTab : false,
    workClockOverlayEnabled: rawSettings.workClockOverlayEnabled === true,
    workClockOverlayPosition: ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(rawSettings.workClockOverlayPosition) ? rawSettings.workClockOverlayPosition : 'bottom-center',
    workClockOverlayXRatio: Math.max(0,Math.min(1,Number.isFinite(Number(rawSettings.workClockOverlayXRatio))?Number(rawSettings.workClockOverlayXRatio):0.5)),
    workClockOverlayYRatio: Math.max(0,Math.min(1,Number.isFinite(Number(rawSettings.workClockOverlayYRatio))?Number(rawSettings.workClockOverlayYRatio):1)),
    workClockOverlayMinimized: rawSettings.workClockOverlayMinimized === true,
    siteOverlaysEnabled: rawSettings.siteOverlaysEnabled === true
  };
}

async function getMeshSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeMeshSettings(data?.[STORAGE_KEY]?.settings || {});
}

function workClockActiveSeconds(clock, nowMs=Date.now()) {
  const startAt=Date.parse(clock?.runningSince||'');
  if(!Number.isFinite(startAt))return 0;
  const pausedAt=clock?.pausedAt&&Number.isFinite(Date.parse(clock.pausedAt))?Date.parse(clock.pausedAt):0;
  const endMs=pausedAt||nowMs;
  return Math.max(0,Math.floor((endMs-startAt)/1000-Math.max(0,Number(clock?.pausedSeconds)||0)));
}

async function stopWorkClockFromOverlay(senderTab = null) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const meshState = data?.[STORAGE_KEY];
  const startAt = meshState?.workClock?.runningSince || '';
  if (!meshState || !startAt || !Number.isFinite(Date.parse(startAt))) return { ok: true, stopped: false };
  const actualSeconds = Math.max(1, workClockActiveSeconds(meshState.workClock));
  const linkedTaskId = meshState.workClock.taskId || '';
  meshState.workClock ||= { runningSince: '', pausedAt:'', pausedSeconds:0, sessions: [], taskId:'', pendingTaskId:'', pendingSeconds:0, pendingStartedAt:'', pendingEndedAt:'' };
  meshState.workClock.runningSince = '';
  meshState.workClock.pausedAt = '';
  meshState.workClock.pausedSeconds = 0;
  if (linkedTaskId) {
    const task = (Array.isArray(meshState.tasks) ? meshState.tasks : []).find((item) => String(item?.id || '') === String(linkedTaskId));
    meshState.workClock.taskId = '';
    meshState.workClock.pendingTaskId = linkedTaskId;
    meshState.workClock.pendingSeconds = actualSeconds;
    meshState.workClock.pendingStartedAt = startAt;
    meshState.workClock.pendingEndedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEY]: meshState });
    try { await openMeshTabForRequest(`#task=${encodeURIComponent(linkedTaskId)}`, senderTab?.windowId); } catch {}
    return { ok: true, stopped: true, actualSeconds, taskId: linkedTaskId, taskTitle: task?.title || '' };
  }
  const endAt = new Date().toISOString();
  meshState.workClock.sessions ||= [];
  meshState.workClock.sessions.push({
    id: `clock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startAt,
    endAt,
    actualSeconds
  });
  await chrome.storage.local.set({ [STORAGE_KEY]: meshState });
  return { ok: true, stopped: true, actualSeconds };
}

async function startWorkClockFromOverlay(senderTab=null, offsetMinutes=0) {
  const data=await chrome.storage.local.get(STORAGE_KEY); const meshState=data?.[STORAGE_KEY];
  if(!meshState)return {ok:false,error:'MeshTab state unavailable.'};
  meshState.workClock ||= {runningSince:'',pausedAt:'',pausedSeconds:0,sessions:[]};
  meshState.settings ||= {};
  meshState.settings.workClockOverlayEnabled=true;
  if(meshState.settings.workClockOverlayPosition!=='free'){meshState.settings.workClockOverlayPosition='bottom-center';meshState.settings.workClockOverlayXRatio=0.5;meshState.settings.workClockOverlayYRatio=1;}
  const alreadyRunning=Boolean(meshState.workClock.runningSince);
  const creditedMinutes=Math.max(0,Math.min(1440,Math.round(Number(offsetMinutes)||0)));
  if(!alreadyRunning){meshState.workClock.runningSince=new Date(Date.now()-creditedMinutes*60000).toISOString();meshState.workClock.pausedAt='';meshState.workClock.pausedSeconds=0;}
  await chrome.storage.local.set({[STORAGE_KEY]:meshState});
  await syncWorkClockOverlayRegistration({injectExisting:true});
  const senderUrl=senderTab?.url||senderTab?.pendingUrl||'';
  if(Number.isInteger(senderTab?.id)&&/^https?:\/\//i.test(senderUrl)){try{await chrome.scripting.executeScript({target:{tabId:senderTab.id},files:['work-clock-overlay.js']});}catch{}}
  return {ok:true,started:!alreadyRunning,runningSince:meshState.workClock.runningSince,paused:Boolean(meshState.workClock.pausedAt)};
}
async function pauseWorkClockFromOverlay() {
  const data=await chrome.storage.local.get(STORAGE_KEY); const meshState=data?.[STORAGE_KEY];
  if(!meshState?.workClock?.runningSince)return {ok:true,paused:false};
  meshState.workClock.pausedSeconds=Math.max(0,Number(meshState.workClock.pausedSeconds)||0);
  if(!meshState.workClock.pausedAt)meshState.workClock.pausedAt=new Date().toISOString();
  await chrome.storage.local.set({[STORAGE_KEY]:meshState});
  return {ok:true,paused:true,actualSeconds:workClockActiveSeconds(meshState.workClock)};
}
async function resumeWorkClockFromOverlay() {
  const data=await chrome.storage.local.get(STORAGE_KEY); const meshState=data?.[STORAGE_KEY];
  if(!meshState?.workClock?.runningSince)return {ok:true,resumed:false};
  const pausedAt=Date.parse(meshState.workClock.pausedAt||'');
  if(Number.isFinite(pausedAt))meshState.workClock.pausedSeconds=Math.max(0,Number(meshState.workClock.pausedSeconds)||0)+Math.max(0,Math.round((Date.now()-pausedAt)/1000));
  meshState.workClock.pausedAt='';
  await chrome.storage.local.set({[STORAGE_KEY]:meshState});
  return {ok:true,resumed:true,actualSeconds:workClockActiveSeconds(meshState.workClock)};
}
async function updateWorkClockOverlayPosition(xRatio,yRatio){
  const data=await chrome.storage.local.get(STORAGE_KEY); const meshState=data?.[STORAGE_KEY];
  if(!meshState)return {ok:false,error:'MeshTab state unavailable.'}; meshState.settings ||= {};
  meshState.settings.workClockOverlayPosition='free';
  meshState.settings.workClockOverlayXRatio=Math.max(0,Math.min(1,Number(xRatio)||0));
  meshState.settings.workClockOverlayYRatio=Math.max(0,Math.min(1,Number(yRatio)||0));
  await chrome.storage.local.set({[STORAGE_KEY]:meshState}); return {ok:true};
}
async function updateWorkClockOverlayMinimized(minimized){
  const data=await chrome.storage.local.get(STORAGE_KEY); const meshState=data?.[STORAGE_KEY];
  if(!meshState)return {ok:false,error:'MeshTab state unavailable.'}; meshState.settings ||= {};
  meshState.settings.workClockOverlayMinimized=Boolean(minimized);
  await chrome.storage.local.set({[STORAGE_KEY]:meshState}); return {ok:true};
}

const WORK_CLOCK_OVERLAY_SCRIPT_ID = 'meshtab-work-clock-overlay';
const WORK_CLOCK_OVERLAY_ORIGINS = ['http://*/*', 'https://*/*'];

async function syncWorkClockOverlayRegistration({ injectExisting = false } = {}) {
  try {
    const settings = await getMeshSettings();
    const granted = await chrome.permissions.contains({ permissions: ['scripting'], origins: WORK_CLOCK_OVERLAY_ORIGINS });
    if (!granted) return false;
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [WORK_CLOCK_OVERLAY_SCRIPT_ID] });
    const hasRegistration = registered.length > 0;
    if (settings.workClockOverlayEnabled && granted && !hasRegistration) {
      await chrome.scripting.registerContentScripts([{
        id: WORK_CLOCK_OVERLAY_SCRIPT_ID,
        matches: WORK_CLOCK_OVERLAY_ORIGINS,
        js: ['work-clock-overlay.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }]);
    } else if ((!settings.workClockOverlayEnabled || !granted) && hasRegistration) {
      await chrome.scripting.unregisterContentScripts({ ids: [WORK_CLOCK_OVERLAY_SCRIPT_ID] });
    }
    if (settings.workClockOverlayEnabled && granted && injectExisting) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        const url = tab.url || tab.pendingUrl || '';
        if (tab.id == null || !/^https?:\/\//i.test(url)) continue;
        try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['work-clock-overlay.js'] }); } catch {}
      }
    }
    return settings.workClockOverlayEnabled && granted;
  } catch (error) {
    console.error('MeshTab Work Clock overlay sync failed:', error);
    return false;
  }
}


// Task Timer was merged into the single Work Clock (v1.44.0+): starting a timer from a Task
// simply links state.workClock.taskId, and stopWorkClockFromOverlay() above branches on that
// link. Earlier builds registered a separate 'meshtab-task-timer-overlay' content script under
// its own settings flag; this one-time cleanup removes that orphaned registration for anyone
// who already has it, since task-timer-overlay.js is no longer shipped.
const LEGACY_TASK_TIMER_OVERLAY_SCRIPT_ID = 'meshtab-task-timer-overlay';
async function cleanupLegacyTaskTimerOverlay() {
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [LEGACY_TASK_TIMER_OVERLAY_SCRIPT_ID] });
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [LEGACY_TASK_TIMER_OVERLAY_SCRIPT_ID] });
  } catch {}
}

const SITE_OVERLAY_SCRIPT_ID = 'meshtab-site-overlays';

async function syncSiteOverlayRegistration({ injectExisting = false } = {}) {
  try {
    const settings = await getMeshSettings();
    const granted = await chrome.permissions.contains({ permissions: ['scripting'], origins: WORK_CLOCK_OVERLAY_ORIGINS });
    if (!granted) return false;
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SITE_OVERLAY_SCRIPT_ID] });
    const hasRegistration = registered.length > 0;
    if (settings.siteOverlaysEnabled && !hasRegistration) {
      await chrome.scripting.registerContentScripts([{
        id: SITE_OVERLAY_SCRIPT_ID,
        matches: WORK_CLOCK_OVERLAY_ORIGINS,
        js: ['site-overlays.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }]);
    } else if (!settings.siteOverlaysEnabled && hasRegistration) {
      await chrome.scripting.unregisterContentScripts({ ids: [SITE_OVERLAY_SCRIPT_ID] });
    }
    if (settings.siteOverlaysEnabled && injectExisting) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        const url = tab.url || tab.pendingUrl || '';
        if (tab.id == null || !/^https?:\/\//i.test(url)) continue;
        try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['site-overlays.js'] }); } catch {}
      }
    }
    return settings.siteOverlaysEnabled;
  } catch (error) {
    console.error('MeshTab website overlay sync failed:', error);
    return false;
  }
}

async function updateSiteOverlayPosition(overlayId, edge, offsetRatio) {
  const safeEdges = new Set(['top','right','bottom','left']);
  if (!safeEdges.has(edge)) return { ok: false, error: 'Invalid edge.' };
  const ratio = Math.max(0, Math.min(1, Number(offsetRatio) || 0));
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const meshState = data?.[STORAGE_KEY];
  if (!meshState || !Array.isArray(meshState.siteOverlays)) return { ok: false, error: 'Overlay state unavailable.' };
  const overlay = meshState.siteOverlays.find((item) => String(item?.id || '') === String(overlayId || ''));
  if (!overlay) return { ok: false, error: 'Overlay not found.' };
  overlay.edge = edge;
  overlay.offsetRatio = ratio;
  overlay.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [STORAGE_KEY]: meshState });
  return { ok: true };
}

function overlayBookmarkUrlAllowed(url) { return /^(https?|file):/i.test(String(url || '')); }

function sortedOverlayBuckets(meshState, desktopId) {
  const buckets = (Array.isArray(meshState?.buckets) ? meshState.buckets : []).filter((bucket) => String(bucket?.desktopId || '') === String(desktopId || ''));
  const byParent = new Map();
  for (const bucket of buckets) {
    const parentId = bucket?.parentId == null ? '' : String(bucket.parentId);
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(bucket);
  }
  for (const list of byParent.values()) list.sort((a,b) => Number(a?.position || 0) - Number(b?.position || 0) || String(a?.title || '').localeCompare(String(b?.title || '')));
  const rows = [];
  const visit = (parentId = '', depth = 0, path = []) => {
    for (const bucket of byParent.get(parentId) || []) {
      const title = String(bucket?.title || 'Group').trim() || 'Group';
      const nextPath = [...path, title];
      rows.push({ bucket, depth, path: nextPath.join(' / ') });
      visit(String(bucket?.id || ''), depth + 1, nextPath);
    }
  };
  visit();
  return rows;
}

async function getMeshTabLinkOverlayData(overlayId) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const meshState = data?.[STORAGE_KEY];
  const overlay = (Array.isArray(meshState?.siteOverlays) ? meshState.siteOverlays : []).find((item) => String(item?.id || '') === String(overlayId || ''));
  if (!meshState || !overlay || overlay.type !== 'links') return { ok: false, error: 'MeshTab Link overlay not found.' };
  const desktop = (Array.isArray(meshState.desktops) ? meshState.desktops : []).find((item) => String(item?.id || '') === String(overlay.desktopId || ''));
  if (!desktop) return { ok: true, overlayName: String(overlay.name || 'MeshTab Links'), desktopTitle: 'Unavailable Tab', groups: [], tasks: [], workClockRunning: Boolean(meshState?.workClock?.runningSince), workClockPaused: Boolean(meshState?.workClock?.pausedAt), emptyMessage: 'The selected MeshTab Tab is no longer available.' };
  const rows = sortedOverlayBuckets(meshState, desktop.id);
  const groups = [];
  for (const row of rows) {
    const ids = [...new Set((Array.isArray(row.bucket?.bookmarkIds) ? row.bucket.bookmarkIds : []).map(String))];
    const links = [];
    for (const id of ids) {
      try {
        const results = await chrome.bookmarks.get(id);
        const bookmark = results?.[0];
        if (!bookmark?.url || !overlayBookmarkUrlAllowed(bookmark.url)) continue;
        const custom = row.bucket?.bookmarkLabels?.[id];
        links.push({ title: String(custom || bookmark.title || bookmark.url).slice(0, 160), url: bookmark.url });
      } catch {}
    }
    if (links.length) groups.push({ id: String(row.bucket?.id || ''), title: row.path, depth: row.depth, links });
  }
  const priorityRank={critical:4,high:3,medium:2,low:1};
  const tasks=(Array.isArray(meshState.tasks)?meshState.tasks:[]).filter((task)=>task?.status!=='done'&&String(task?.taskGroupId||'')===String(desktop.id)).map((task)=>{const workState=['todo','working','ongoing'].includes(task?.workState)?task.workState:(task?.working?'working':'todo');return {...task,workState};}).sort((a,b)=>({working:0,ongoing:1,todo:2}[a.workState]-{working:0,ongoing:1,todo:2}[b.workState])||(priorityRank[b?.priority]||0)-(priorityRank[a?.priority]||0)||String(a?.dueDate||'9999-99-99').localeCompare(String(b?.dueDate||'9999-99-99'))||String(a?.title||'').localeCompare(String(b?.title||''))).map((task)=>({id:String(task.id),title:String(task.title||'Task').slice(0,160),priority:['low','medium','high','critical'].includes(task.priority)?task.priority:'medium',dueDate:/^\d{4}-\d{2}-\d{2}$/.test(String(task.dueDate||''))?String(task.dueDate):'',workState:task.workState,working:task.workState==='working'}));
  return {
    ok: true,
    overlayName: String(overlay.name || 'MeshTab Links').slice(0, 80),
    desktopTitle: String(desktop.title || 'MeshTab Tab').slice(0, 80),
    openMode: ['same-tab','new-tab','new-window'].includes(overlay.linkOpenMode) ? overlay.linkOpenMode : 'same-tab',
    groups,
    tasks,
    workClockRunning: Boolean(meshState?.workClock?.runningSince),
    workClockPaused: Boolean(meshState?.workClock?.pausedAt),
    workClockRunningSince: meshState?.workClock?.runningSince || '',
    emptyMessage: (groups.length || tasks.length) ? '' : 'No saved links or open Tasks are currently assigned to this MeshTab Tab.'
  };
}

async function openMeshTabLinkOverlayUrl(overlayId, url, senderTab) {
  if (!overlayBookmarkUrlAllowed(url)) return { ok: false, error: 'Unsupported link.' };
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const meshState = data?.[STORAGE_KEY];
  const overlay = (Array.isArray(meshState?.siteOverlays) ? meshState.siteOverlays : []).find((item) => String(item?.id || '') === String(overlayId || ''));
  if (!overlay || overlay.type !== 'links') return { ok: false, error: 'MeshTab Link overlay not found.' };
  const mode = ['same-tab','new-tab','new-window'].includes(overlay.linkOpenMode) ? overlay.linkOpenMode : 'same-tab';
  if (mode === 'new-window') {
    await chrome.windows.create({ url, focused: true, type: 'normal' });
    return { ok: true, mode };
  }
  if (mode === 'new-tab') {
    const options = { url, active: true };
    if (Number.isInteger(senderTab?.windowId)) options.windowId = senderTab.windowId;
    if (Number.isInteger(senderTab?.index)) options.index = senderTab.index + 1;
    await chrome.tabs.create(options);
    return { ok: true, mode };
  }
  if (!Number.isInteger(senderTab?.id)) return { ok: false, error: 'Current browser tab is unavailable.' };
  await chrome.tabs.update(senderTab.id, { url, active: true });
  return { ok: true, mode };
}

async function openMeshTabFromOverlay(senderTab) {
  const allTabs = await chrome.tabs.query({});
  const meshTabs = allTabs.filter((tab) => isMeshTabUrl(tab.url || tab.pendingUrl || ''));
  const sameWindow = Number.isInteger(senderTab?.windowId) ? meshTabs.find((tab) => tab.windowId === senderTab.windowId) : null;
  const existing = sameWindow || meshTabs[0];
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    return { ok: true, tabId: existing.id, existing: true };
  }
  const options = { url: chrome.runtime.getURL('newtab.html?mt_source=overlay-open'), active: true };
  if (Number.isInteger(senderTab?.windowId)) options.windowId = senderTab.windowId;
  if (Number.isInteger(senderTab?.index)) options.index = senderTab.index + 1;
  const created = await chrome.tabs.create(options);
  return { ok: true, tabId: created?.id ?? null, existing: false };
}

async function openMeshTabOverlayTask(overlayId, taskId, senderTab) {
  const data=await chrome.storage.local.get(STORAGE_KEY); const meshState=data?.[STORAGE_KEY];
  const overlay=(Array.isArray(meshState?.siteOverlays)?meshState.siteOverlays:[]).find((item)=>String(item?.id||'')===String(overlayId||''));
  if(!overlay||overlay.type!=='links')return {ok:false,error:'MeshTab Link overlay not found.'};
  const task=(Array.isArray(meshState?.tasks)?meshState.tasks:[]).find((item)=>String(item?.id||'')===String(taskId||'')&&String(item?.taskGroupId||'')===String(overlay.desktopId||''));
  if(!task)return {ok:false,error:'Task not found for this MeshTab Tab.'};
  const url=`${chrome.runtime.getURL('newtab.html')}?mt_source=overlay#task=${encodeURIComponent(task.id)}`;
  const options={url,active:true}; if(Number.isInteger(senderTab?.windowId))options.windowId=senderTab.windowId; if(Number.isInteger(senderTab?.index))options.index=senderTab.index+1;
  const created=await chrome.tabs.create(options); return {ok:true,tabId:created?.id??null};
}

function isMeshTabUrl(url) {
  const base = chrome.runtime.getURL('newtab.html');
  return typeof url === 'string' && url.startsWith(base);
}

async function resolveNormalWindowId(requestedWindowId = null) {
  if (Number.isInteger(requestedWindowId)) return requestedWindowId;
  try { const focused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }); if (focused?.id != null) return focused.id; } catch {}
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  return windows[0]?.id ?? null;
}

async function openMeshTabForRequest(hash = '', requestedWindowId = null) {
  const settings = await getMeshSettings();
  const base = chrome.runtime.getURL('newtab.html');
  const safeHash = typeof hash === 'string' && hash.startsWith('#') ? hash : '';
  const desiredUrl = `${base}?mt_source=open${safeHash}`;
  const targetWindowId = await resolveNormalWindowId(requestedWindowId);
  const allTabs = await chrome.tabs.query({});
  const meshTabs = allTabs.filter((tab) => isMeshTabUrl(tab.url || tab.pendingUrl || ''));
  const existing = settings.meshTabScope === 'all-windows'
    ? meshTabs[0]
    : meshTabs.find((tab) => tab.windowId === targetWindowId);
  if (existing?.id != null) {
    const update = { active: true };
    if (safeHash) update.url = desiredUrl;
    await chrome.tabs.update(existing.id, update);
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    return existing.id;
  }
  const createOptions = { url: desiredUrl, active: true, pinned: settings.pinOnOpen !== false };
  if (targetWindowId != null) createOptions.windowId = targetWindowId;
  const created = await chrome.tabs.create(createOptions);
  return created?.id ?? null;
}


async function openChromeHomeForTab(tabId) {
  if (!Number.isInteger(tabId)) return false;
  try {
    await chrome.tabs.update(tabId, { url: 'chrome://new-tab-page/' });
    return true;
  } catch {}
  // Chrome's Tabs API accepts about:newtab and resolves it to the built-in New Tab page.
  await chrome.tabs.update(tabId, { url: 'about:newtab' });
  return true;
}

async function ensureMeshTabsOnStartup() {
  try {
    const settings = await getMeshSettings();
    if (!settings.openOnStart) return;
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (!windows.length) return;
    const tabs = await chrome.tabs.query({});
    const meshTabs = tabs.filter((tab) => isMeshTabUrl(tab.url || tab.pendingUrl || ''));
    if (settings.meshTabScope === 'all-windows') {
      const existing = meshTabs[0];
      if (existing?.id != null) { if (settings.pinOnStart && !existing.pinned) await chrome.tabs.update(existing.id, { pinned: true }); return; }
      const target = windows.find((windowItem) => windowItem.focused) || windows[0];
      await chrome.tabs.create({ windowId: target.id, url: chrome.runtime.getURL('newtab.html?mt_source=startup'), pinned: settings.pinOnStart, active: false });
      return;
    }
    for (const windowItem of windows) {
      const existing = meshTabs.find((tab) => tab.windowId === windowItem.id);
      if (existing?.id != null) { if (settings.pinOnStart && !existing.pinned) await chrome.tabs.update(existing.id, { pinned: true }); continue; }
      await chrome.tabs.create({ windowId: windowItem.id, url: chrome.runtime.getURL('newtab.html?mt_source=startup'), pinned: settings.pinOnStart, active: false });
    }
  } catch (error) {
    console.error('MeshTab startup open failed:', error);
  }
}

async function getReminderState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const state = data?.[STORAGE_KEY];
  if (!state || typeof state !== 'object') return null;
  state.reminders = (Array.isArray(state.reminders) ? state.reminders : []).map((item, index) => MeshTabReminders.normalizeReminder(item, index));
  return state;
}

async function saveReminderState(state) {
  if (!state) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function reminderAlarmName(id) { return `${REMINDER_ALARM_PREFIX}${id}`; }
function reminderSnoozeName(id) { return `${REMINDER_SNOOZE_PREFIX}${id}`; }
function reminderNotificationId(id) { return `${REMINDER_NOTIFICATION_PREFIX}${id}`; }

async function clearReminderAlarms() {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter((alarm) => alarm.name.startsWith(REMINDER_ALARM_PREFIX) || alarm.name.startsWith(REMINDER_SNOOZE_PREFIX)).map((alarm) => chrome.alarms.clear(alarm.name)));
}

async function syncReminderAlarms() {
  if (syncingReminders) return;
  syncingReminders = true;
  try {
    const state = await getReminderState();
    await clearReminderAlarms();
    if (!state) return;
    const now = Date.now();
    for (const reminder of state.reminders) {
      const snooze = reminder.snoozedUntil ? Date.parse(reminder.snoozedUntil) : NaN;
      if (Number.isFinite(snooze) && snooze > now) {
        await chrome.alarms.create(reminderSnoozeName(reminder.id), { when: snooze });
        continue;
      }
      if (!reminder.enabled) continue;
      let when = MeshTabReminders.nextBaseOccurrence(reminder, now);
      if (when == null && reminder.scheduleType === 'once' && !reminder.lastTriggeredAt) {
        const original = MeshTabReminders.localDateTime(reminder.date, reminder.time);
        if (Number.isFinite(original) && original < now) when = now + 1000;
      }
      if (when != null) await chrome.alarms.create(reminderAlarmName(reminder.id), { when });
    }
  } catch (error) {
    console.error('MeshTab reminder sync failed:', error);
  } finally {
    syncingReminders = false;
  }
}

async function showReminderNotification(reminder) {
  const message = reminder.details || MeshTabReminders.recurrenceLabel(reminder);
  await chrome.notifications.create(reminderNotificationId(reminder.id), {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: `MeshTab Reminder — ${reminder.title}`,
    message,
    contextMessage: 'Open MeshTab Reminders for more snooze options.',
    priority: 1,
    requireInteraction: true,
    buttons: [
      { title: 'Snooze 10 min' },
      { title: 'Snooze 15 min' }
    ]
  });
}

async function fireReminder(id, fromSnooze = false) {
  const state = await getReminderState();
  const reminder = state?.reminders?.find((item) => item.id === String(id));
  if (!state || !reminder) return;
  const nowIso = new Date().toISOString();
  reminder.lastTriggeredAt = nowIso;
  reminder.updatedAt = nowIso;
  if (fromSnooze) reminder.snoozedUntil = '';
  else if (reminder.scheduleType === 'once') reminder.enabled = false;
  await saveReminderState(state);
  await showReminderNotification(reminder);
  await syncReminderAlarms();
}

async function snoozeReminder(id, optionOrWhen = '10m') {
  const state = await getReminderState();
  const reminder = state?.reminders?.find((item) => item.id === String(id));
  if (!state || !reminder) return false;
  const numeric = Number(optionOrWhen);
  const when = Number.isFinite(numeric) && numeric > Date.now() ? numeric : MeshTabReminders.snoozeTarget(String(optionOrWhen), Date.now());
  reminder.snoozedUntil = new Date(when).toISOString();
  reminder.updatedAt = new Date().toISOString();
  await saveReminderState(state);
  await syncReminderAlarms();
  return true;
}

async function openReminderCenter() { await openMeshTabForRequest('#reminders'); }

chrome.runtime.onStartup.addListener(() => { ensureMeshTabsOnStartup(); syncReminderAlarms(); syncWorkClockOverlayRegistration(); cleanupLegacyTaskTimerOverlay(); });
chrome.runtime.onInstalled.addListener(() => { syncReminderAlarms(); syncWorkClockOverlayRegistration(); cleanupLegacyTaskTimerOverlay(); });

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) { syncReminderAlarms(); syncWorkClockOverlayRegistration(); }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(REMINDER_SNOOZE_PREFIX)) fireReminder(alarm.name.slice(REMINDER_SNOOZE_PREFIX.length), true);
  else if (alarm.name.startsWith(REMINDER_ALARM_PREFIX)) fireReminder(alarm.name.slice(REMINDER_ALARM_PREFIX.length), false);
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId.startsWith(REMINDER_NOTIFICATION_PREFIX)) return;
  const id = notificationId.slice(REMINDER_NOTIFICATION_PREFIX.length);
  snoozeReminder(id, buttonIndex === 1 ? '15m' : '10m');
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith(REMINDER_NOTIFICATION_PREFIX)) return;
  chrome.notifications.clear(notificationId);
  openReminderCenter();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'meshtab-open') {
    const requestedWindowId = Number.isInteger(message.windowId) ? message.windowId : sender?.tab?.windowId;
    openMeshTabForRequest(message.hash || '', requestedWindowId).then((tabId) => sendResponse({ ok: true, tabId })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-open-home-screen') {
    const tabId = sender?.tab?.id;
    openChromeHomeForTab(tabId).then((ok) => sendResponse({ ok })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-work-clock-overlay-sync') {
    syncWorkClockOverlayRegistration({ injectExisting: true }).then((enabled) => sendResponse({ ok: true, enabled })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-site-overlays-sync') {
    syncSiteOverlayRegistration({ injectExisting: true }).then((enabled) => sendResponse({ ok: true, enabled })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-site-overlay-position') {
    updateSiteOverlayPosition(message.overlayId, message.edge, message.offsetRatio).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-link-overlay-data') {
    getMeshTabLinkOverlayData(message.overlayId).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-link-overlay-open') {
    openMeshTabLinkOverlayUrl(message.overlayId, message.url, sender?.tab).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-link-overlay-open-meshtab') {
    openMeshTabFromOverlay(sender?.tab).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-start-work-clock') {
    startWorkClockFromOverlay(sender?.tab, message.offsetMinutes).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-pause-work-clock') {
    pauseWorkClockFromOverlay().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-resume-work-clock') {
    resumeWorkClockFromOverlay().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-stop-work-clock') {
    stopWorkClockFromOverlay(sender?.tab).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-work-clock-overlay-position') {
    updateWorkClockOverlayPosition(message.xRatio,message.yRatio).then(sendResponse).catch((error)=>sendResponse({ok:false,error:error?.message||String(error)}));
    return true;
  }
  if (message?.type === 'meshtab-work-clock-overlay-minimized') {
    updateWorkClockOverlayMinimized(message.minimized).then(sendResponse).catch((error)=>sendResponse({ok:false,error:error?.message||String(error)}));
    return true;
  }
  // 'meshtab-stop-task-timer' kept as a back-compat alias in case an already-injected legacy
  // overlay (from before v1.44.0's unification) sends it before the tab is reloaded.
  if (message?.type === 'meshtab-stop-task-timer') {
    stopWorkClockFromOverlay(sender?.tab).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-link-overlay-open-task') {
    openMeshTabOverlayTask(message.overlayId,message.taskId,sender?.tab).then(sendResponse).catch((error)=>sendResponse({ok:false,error:error?.message||String(error)}));
    return true;
  }
  if (message?.type === 'meshtab-reminders-sync') {
    syncReminderAlarms().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === 'meshtab-reminder-snooze') {
    snoozeReminder(message.id, message.option ?? message.when).then((ok) => sendResponse({ ok })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  return false;
});

syncReminderAlarms();
syncWorkClockOverlayRegistration();
cleanupLegacyTaskTimerOverlay();
syncSiteOverlayRegistration();
