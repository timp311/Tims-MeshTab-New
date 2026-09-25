'use strict';

// Firefox exposes the promise-based WebExtension API as `browser`, not `chrome`.
// This codebase is written against `chrome.*` with await/promises throughout, so
// on Firefox we alias `chrome` to the native `browser` object (which has the
// identical method shapes, just promise-returning instead of callback-based).
// This is a no-op in Chrome, where `browser` is not defined.
if (typeof browser !== 'undefined') { globalThis.chrome = browser; }

const STORAGE_KEY = 'meshtabState';
const BOOKMARK_DRAG_TYPE = 'application/x-meshtab-bookmark';
const TAB_DRAG_TYPE = 'application/x-meshtab-tab';
const BUCKET_DRAG_TYPE = 'application/x-meshtab-bucket';
const DESKTOP_DRAG_TYPE = 'application/x-meshtab-desktop';
const NOTE_DRAG_TYPE = 'application/x-meshtab-note';
const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const TASK_WORK_STATES = ['todo', 'working', 'ongoing'];
const TASK_ALLOCATION_TYPES = ['project', 'job', 'ticket', 'bucket'];
const TASK_ALLOCATION_MODES = ['unlimited', 'total', 'recurring'];
const TASK_ALLOCATION_CADENCES = ['weekly', 'monthly', 'quarterly'];
const TASK_ANALYTICS_KEYS = ['open', 'overdue', 'closed', 'closedToday', 'closedYesterday', 'closedThisWeek', 'closedLastWeek', 'closedThisMonth', 'closedThisYear'];
const REMINDER_VIEW_MODES = ['day', 'week'];
const DESKTOP_TYPES = ['workspace', 'calendar'];
const SITE_OVERLAY_SHAPES = ['rectangle', 'rounded', 'pill', 'half-rounded', 'half-pill', 'half-oval'];
const SITE_OVERLAY_FONTS = ['system', 'sans', 'serif', 'mono'];
const SITE_OVERLAY_EDGES = ['top', 'right', 'bottom', 'left'];
const SITE_OVERLAY_TYPES = ['label', 'links'];
const SITE_OVERLAY_LINK_OPEN_MODES = ['same-tab', 'new-tab', 'new-window'];
const SITE_OVERLAY_TARGET_MODES = ['site', 'all-sites'];
const COLORS = ['violet', 'blue', 'green', 'orange', 'rose'];
const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function isCustomBucketColor(value) { return HEX_COLOR_PATTERN.test(String(value || '')); }
function normalizeBucketColor(value) { return COLORS.includes(value) || isCustomBucketColor(value) ? value : 'violet'; }

const DEFAULT_STATE = {
  version: 24,
  favicons: {},
  settings: { openOnStart: true, pinOnStart: true, pinOnOpen: true, meshTabScope: 'per-window', useMeshTabNewTab: false, homeDefaultDesktopId: 'last-active', appearance: 'light', tabFontSize: 12, tabSpacing: 7, defaultTimeUnit: 'hours', weeklyBillableHours: 40, headerClockSize: 'medium', textSize: 'small', workClockOverlayEnabled: false, workClockOverlayPosition: 'bottom-center', workClockOverlayXRatio: 0.5, workClockOverlayYRatio: 1, siteOverlaysEnabled: false, showNotes: true, showTasks: true, showReminders: true, showOverlays: true, showQuickLinks: false, openPagesCollapsed: false, taskRailCollapsed: false, taskRailFilter: 'all', activeView: 'desktop', taskAnalytics: [...TASK_ANALYTICS_KEYS], taskAnalyticsVersion: 2, reminderView: 'day' },
  desktops: [{ id: 'desktop-main', title: 'Main', type: 'workspace', calendarUrl: '' }],
  activeDesktopId: 'desktop-main',
  notes: [],
  tasks: [],
  taskAllocations: [],
  reminders: [],
  workClock: { runningSince: '', pausedAt: '', pausedSeconds: 0, sessions: [], taskId: '', pendingTaskId: '', pendingSeconds: 0, pendingStartedAt: '', pendingEndedAt: '' },
  siteOverlays: [],
  buckets: [
    { id: 'inbox', title: 'Inbox', kind: 'folder', color: 'violet', bookmarkIds: [], bookmarkLabels: {}, desktopId: 'desktop-main', parentId: null, position: 0, layout: { span: 4, height: 0, linkColumns: 1 } },
    { id: 'projects', title: 'Projects', kind: 'project', color: 'blue', bookmarkIds: [], bookmarkLabels: {}, desktopId: 'desktop-main', parentId: null, position: 1, layout: { span: 4, height: 0, linkColumns: 1 } },
    { id: 'everyday', title: 'Everyday', kind: 'folder', color: 'green', bookmarkIds: [], bookmarkLabels: {}, desktopId: 'desktop-main', parentId: null, position: 2, layout: { span: 4, height: 0, linkColumns: 1 } }
  ]
};

let state = null;
let bookmarks = [];
let bookmarkMap = new Map();
let openTabWindows = [];
let openTabMap = new Map();
let pickerBucketId = null;
let pendingParentId = null;
let editingBucketId = null;
let editingNoteId = null;
let pendingParentNoteId = null;
let pendingNoteLocation = null;
let editingTaskId = null;
let completingTaskId = null;
let loggingTaskTimeId = null;
let editingTaskTimeEntryId = null;
let returnToTaskTimeHistoryId = null;
let viewingTaskTimeId = null;
let viewingTaskNotesId = null;
let editingTaskNoteId = null;
let viewingTaskLinksId = null;
let editingTaskAllocationId = null;
let viewingTaskAllocationId = null;
let viewingTaskAllocationTimeLogId = null;
let allTimeEntriesView = 'none';
let allTimeEntriesSplitByDay = false;
let allTimeEntriesShowChart = true;
let allTimeEntriesCombineDesc = false;
let allTimeEntriesDescLimit = 500;
let allTimeEntriesSplitByProject = false;
let taskAllocationTimeLogShowChart = true;
let taskRecommendationsVisible = false;
let editingReminderId = null;
let reminderCountdownTimer = null;
const revealedNoteIds = new Set();
const liveNoteSaveTimers = new Map();
const selectedCompletedTaskIds = new Set();
let toastTimer = null;
let tabRefreshTimer = null;
let currentMeshTabId = null;
let currentMeshTabPinned = null;
let bulkImporting = false;
let expandedTabTasksDesktopId = null;
let expandedTabAllocationsDesktopId = null;
let renamingDesktopId = null;
let expandedTaskRailTaskId = null;
let groupLayoutDirty = false;
let workClockTickTimer = null;
let editingSiteOverlayId = null;
let siteLinkOverlayIconDataUrl = '';
let loggingTaskTimeFromTimerSeconds = null;
let pendingTaskTimeDialogOpenedForId = null;

const $ = (selector) => document.querySelector(selector);
const bucketGrid = $('#bucketGrid');
const bucketDialog = $('#bucketDialog');
const bookmarkDialog = $('#bookmarkDialog');
const noteDialog = $('#noteDialog');
const taskDialog = $('#taskDialog');
const taskCompleteDialog = $('#taskCompleteDialog');
const taskTimeDialog = $('#taskTimeDialog');
const taskTimeHistoryDialog = $('#taskTimeHistoryDialog');
const taskNotesDialog = $('#taskNotesDialog');
const taskNoteDialog = $('#taskNoteDialog');
const taskLinksDialog = $('#taskLinksDialog');
const taskAllocationDialog = $('#taskAllocationDialog');
const taskAllocationHistoryDialog = $('#taskAllocationHistoryDialog');
const taskAllocationTimeLogDialog = $('#taskAllocationTimeLogDialog');
const allTimeEntriesDialog = $('#allTimeEntriesDialog');
const reminderDialog = $('#reminderDialog');
const settingsDialog = $('#settingsDialog');
const rightRailStack = $('#rightRailStack');
const taskRail = $('#taskRail');
const openTabsList = $('#openTabsList');
const desktopTabs = $('#desktopTabs');
const quickLinksTabs = $('#quickLinksTabs');
const importFileInput = $('#importFileInput');
const importSelectionDialog = $('#importSelectionDialog');
const exportSelectionDialog = $('#exportSelectionDialog');
const workClockDialog = $('#workClockDialog');
const workClockSummaryDialog = $('#workClockSummaryDialog');
const calendarTabDialog = $('#calendarTabDialog');
const siteOverlayDialog = $('#siteOverlayDialog');
const siteLinkOverlayDialog = $('#siteLinkOverlayDialog');

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function uid(prefix = 'item') {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanTitle(value, fallback) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, 80);
}

function normalizeCalendarEmbedUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  const iframeMatch = raw.match(/<iframe[^>]+src=[\"']([^\"']+)[\"']/i);
  if (iframeMatch) raw = iframeMatch[1];
  raw = raw.replace(/&amp;/g, '&');
  if (!/^https?:\/\//i.test(raw)) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(raw)}&ctz=${encodeURIComponent(tz)}`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com') return '';
    if (!url.pathname.includes('/calendar/embed')) return '';
    return url.toString();
  } catch { return ''; }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>\"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }

function formatClockDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s` : `${m}m ${String(s).padStart(2,'0')}s`;
}

function roundedClockMinutes(totalSeconds, stepMinutes) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const stepSeconds = Math.max(1, Number(stepMinutes) || 1) * 60;
  if (!seconds) return 0;
  return Math.ceil(seconds / stepSeconds) * (stepSeconds / 60);
}

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.buckets)) return cloneDefaultState();

  const legacy = !Array.isArray(raw.desktops) || raw.desktops.length === 0;
  const desktops = legacy
    ? [{ id: 'desktop-main', title: 'Main', type: 'workspace', calendarUrl: '' }]
    : raw.desktops.map((desktop, index) => {
        const type = DESKTOP_TYPES.includes(desktop?.type) ? desktop.type : 'workspace';
        return {
          id: String(desktop?.id || uid('desktop')),
          title: cleanTitle(desktop?.title, `Desktop ${index + 1}`),
          type,
          calendarUrl: type === 'calendar' ? normalizeCalendarEmbedUrl(desktop?.calendarUrl || desktop?.calendarEmbed || '') : '',
          archived: Boolean(desktop?.archived)
        };
      });

  const desktopIds = new Set(desktops.map((desktop) => desktop.id));
  const fallbackDesktopId = desktops[0].id;
  const buckets = raw.buckets.map((bucket, index) => ({
    id: String(bucket?.id || uid('bucket')),
    title: cleanTitle(bucket?.title, `Project ${index + 1}`),
    kind: bucket?.kind === 'folder' ? 'folder' : 'project',
    color: normalizeBucketColor(bucket?.color),
    archived: Boolean(bucket?.archived),
    bookmarkIds: Array.from(new Set((Array.isArray(bucket?.bookmarkIds) ? bucket.bookmarkIds : []).map(String))),
    bookmarkLabels: bucket?.bookmarkLabels && typeof bucket.bookmarkLabels === 'object' ? Object.fromEntries(Object.entries(bucket.bookmarkLabels).map(([id, label]) => [String(id), cleanTitle(label, '')]).filter(([, label]) => label)) : {},
    desktopId: desktopIds.has(String(bucket?.desktopId)) ? String(bucket.desktopId) : fallbackDesktopId,
    parentId: bucket?.parentId == null ? null : String(bucket.parentId),
    position: Number.isFinite(Number(bucket?.position)) ? Number(bucket.position) : index,
    layout: {
      span: Math.max(2, Math.min(12, Number.parseInt(bucket?.layout?.span, 10) || 0)),
      height: Math.max(0, Math.min(1600, Number.parseInt(bucket?.layout?.height, 10) || 0)),
      linkColumns: Math.max(1, Math.min(6, Number.parseInt(bucket?.layout?.linkColumns, 10) || 1)),
      previousSpan: Math.max(0, Math.min(12, Number.parseInt(bucket?.layout?.previousSpan, 10) || 0)),
      x: bucket?.layout?.x != null && Number.isFinite(Number(bucket.layout.x)) ? Math.max(0, Number(bucket.layout.x)) : null,
      y: bucket?.layout?.y != null && Number.isFinite(Number(bucket.layout.y)) ? Math.max(0, Number(bucket.layout.y)) : null,
      width: Number(bucket?.layout?.width) > 0 && Number.isFinite(Number(bucket.layout.width)) ? Math.max(180, Number(bucket.layout.width)) : 0,
      previousWidth: Number(bucket?.layout?.previousWidth) > 0 && Number.isFinite(Number(bucket.layout.previousWidth)) ? Math.max(180, Number(bucket.layout.previousWidth)) : 0,
      previousX: Number.isFinite(Number(bucket?.layout?.previousX)) ? Math.max(0, Number(bucket.layout.previousX)) : 0,
      fullWidth: Boolean(bucket?.layout?.fullWidth),
      z: Math.max(0, Number.parseInt(bucket?.layout?.z, 10) || 0)
    }
  }));

  const bucketById = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  for (const bucket of buckets) {
    const parent = bucket.parentId ? bucketById.get(bucket.parentId) : null;
    if (!parent || parent.id === bucket.id || parent.desktopId !== bucket.desktopId) bucket.parentId = null;
  }

  function createsCycle(bucket) {
    const seen = new Set([bucket.id]);
    let parentId = bucket.parentId;
    while (parentId) {
      if (seen.has(parentId)) return true;
      seen.add(parentId);
      parentId = bucketById.get(parentId)?.parentId || null;
    }
    return false;
  }
  for (const bucket of buckets) if (createsCycle(bucket)) bucket.parentId = null;
  for (const bucket of buckets) {
    if (!Number.parseInt(raw.buckets?.find?.((candidate) => String(candidate?.id || '') === bucket.id)?.layout?.span, 10)) bucket.layout.span = bucket.parentId ? 12 : 4;
    const assigned = new Set(bucket.bookmarkIds);
    bucket.bookmarkLabels = Object.fromEntries(Object.entries(bucket.bookmarkLabels).filter(([id]) => assigned.has(String(id))));
  }

  const notes = (Array.isArray(raw?.notes) ? raw.notes : []).map((note, index) => ({
    id: String(note?.id || uid('note')),
    title: cleanTitle(note?.title, `Note ${index + 1}`),
    desktopId: desktopIds.has(String(note?.desktopId)) ? String(note.desktopId) : fallbackDesktopId,
    general: Boolean(note?.general),
    parentNoteId: note?.parentNoteId == null ? null : String(note.parentNoteId),
    position: Number.isFinite(Number(note?.position)) ? Number(note.position) : index,
    masked: Boolean(note?.masked),
    html: sanitizeNoteHtml(typeof note?.html === 'string' ? note.html : ''),
    layout: {
      span: Math.max(2, Math.min(12, Number.parseInt(note?.layout?.span, 10) || (note?.parentNoteId ? 12 : 4))),
      height: Math.max(0, Math.min(1600, Number.parseInt(note?.layout?.height, 10) || 0)),
      previousSpan: Math.max(0, Math.min(12, Number.parseInt(note?.layout?.previousSpan, 10) || 0))
    }
  }));

  const noteById = new Map(notes.map((note) => [note.id, note]));
  for (const note of notes) {
    const parent = note.parentNoteId ? noteById.get(note.parentNoteId) : null;
    if (!parent || parent.id === note.id || parent.general !== note.general || (!note.general && parent.desktopId !== note.desktopId)) note.parentNoteId = null;
  }
  function noteCreatesCycle(note) {
    const seen = new Set([note.id]);
    let parentId = note.parentNoteId;
    while (parentId) {
      if (seen.has(parentId)) return true;
      seen.add(parentId);
      parentId = noteById.get(parentId)?.parentNoteId || null;
    }
    return false;
  }
  for (const note of notes) if (noteCreatesCycle(note)) note.parentNoteId = null;

  const taskAllocations = (Array.isArray(raw?.taskAllocations) ? raw.taskAllocations : []).map((allocation, index) => {
    const mode = TASK_ALLOCATION_MODES.includes(allocation?.mode) ? allocation.mode : 'unlimited';
    const cadence = TASK_ALLOCATION_CADENCES.includes(allocation?.cadence) ? allocation.cadence : 'weekly';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(allocation?.startDate || '')) ? String(allocation.startDate) : '';
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(allocation?.endDate || '')) ? String(allocation.endDate) : '';
    const createdAt = Number.isFinite(Date.parse(allocation?.createdAt || '')) ? new Date(allocation.createdAt).toISOString() : new Date(Date.now() - index).toISOString();
    const updatedAt = Number.isFinite(Date.parse(allocation?.updatedAt || '')) ? new Date(allocation.updatedAt).toISOString() : createdAt;
    return {
      id: String(allocation?.id || uid('allocation')),
      name: cleanTitle(allocation?.name, `Allocation ${index + 1}`).slice(0, 140),
      type: TASK_ALLOCATION_TYPES.includes(allocation?.type) ? allocation.type : 'project',
      reference: String(allocation?.reference || '').trim().slice(0, 120),
      taskGroupId: allocation?.taskGroupId === 'general' || desktopIds.has(String(allocation?.taskGroupId)) ? String(allocation.taskGroupId) : 'general',
      mode,
      hours: mode === 'unlimited' ? 0 : Math.max(1 / 60, Math.min(100000, Number(allocation?.hours) || 10)),
      cadence,
      startDate,
      endDate: startDate && endDate && endDate < startDate ? '' : endDate,
      details: String(allocation?.details || '').trim().slice(0, 2400),
      active: allocation?.active !== false,
      carryOverPeriods: [...new Set((Array.isArray(allocation?.carryOverPeriods) ? allocation.carryOverPeriods : []).map((key) => String(key || '')).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)))].slice(-520),
      createdAt,
      updatedAt
    };
  });
  const taskAllocationIds = new Set(taskAllocations.map((allocation) => allocation.id));

  const tasks = (Array.isArray(raw?.tasks) ? raw.tasks : []).map((task, index) => {
    const priority = TASK_PRIORITIES.includes(task?.priority) ? task.priority : 'medium';
    const groupId = task?.taskGroupId === 'general' || desktopIds.has(String(task?.taskGroupId)) ? String(task.taskGroupId) : 'general';
    const status = task?.status === 'done' ? 'done' : 'open';
    const taskId = String(task?.id || uid('task'));
    const createdAt = Number.isFinite(Date.parse(task?.createdAt || '')) ? new Date(task.createdAt).toISOString() : new Date(Date.now() - index).toISOString();
    const updatedAt = Number.isFinite(Date.parse(task?.updatedAt || '')) ? new Date(task.updatedAt).toISOString() : createdAt;
    const completedAt = status === 'done' && Number.isFinite(Date.parse(task?.completedAt || '')) ? new Date(task.completedAt).toISOString() : '';
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(task?.dueDate || '')) ? String(task.dueDate) : '';
    const timeEntries = (Array.isArray(task?.timeEntries) ? task.timeEntries : []).map((entry, entryIndex) => {
      const minutes = Math.max(0, Math.min(100000, Math.round(Number(entry?.minutes) || 0)));
      if (!minutes) return null;
      const loggedAt = Number.isFinite(Date.parse(entry?.loggedAt || '')) ? new Date(entry.loggedAt).toISOString() : updatedAt;
      return { id: String(entry?.id || `${taskId}-time-${entryIndex}`), minutes, details: String(entry?.details || '').trim().slice(0, 1200), loggedAt };
    }).filter(Boolean);
    const legacyMinutes = Math.max(0, Math.min(100000, Number.parseInt(task?.minutesSpent, 10) || 0));
    if (!timeEntries.length && legacyMinutes) timeEntries.push({ id: `${taskId}-time-legacy`, minutes: legacyMinutes, details: 'Previously logged time', loggedAt: completedAt || updatedAt });
    const minutesSpent = timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
    const taskNotes = (Array.isArray(task?.taskNotes) ? task.taskNotes : []).map((note, noteIndex) => {
      const noteCreatedAt = Number.isFinite(Date.parse(note?.createdAt || '')) ? new Date(note.createdAt).toISOString() : updatedAt;
      const noteUpdatedAt = Number.isFinite(Date.parse(note?.updatedAt || '')) ? new Date(note.updatedAt).toISOString() : noteCreatedAt;
      return {
        id: String(note?.id || `${taskId}-note-${noteIndex}`),
        title: (String(note?.title || '').trim().slice(0,160) || `Task note ${noteIndex + 1}`),
        body: String(note?.body || '').trim().slice(0, 12000),
        createdAt: noteCreatedAt,
        updatedAt: noteUpdatedAt
      };
    });
    const taskLinks = (Array.isArray(task?.taskLinks) ? task.taskLinks : []).map((link, linkIndex) => {
      const linkCreatedAt = Number.isFinite(Date.parse(link?.createdAt || '')) ? new Date(link.createdAt).toISOString() : updatedAt;
      return {
        id: String(link?.id || `${taskId}-link-${linkIndex}`),
        title: String(link?.title || '').trim().slice(0, 160),
        url: String(link?.url || '').trim().slice(0, 2000),
        createdAt: linkCreatedAt
      };
    }).filter((link) => link.url);
    const legacyWorking = status !== 'done' && Boolean(task?.working);
    const workState = status === 'done' ? 'closed' : (TASK_WORK_STATES.includes(task?.workState) ? task.workState : (legacyWorking ? 'working' : 'todo'));
    const working = workState === 'working';
    const workingSince = working && Number.isFinite(Date.parse(task?.workingSince || '')) ? new Date(task.workingSince).toISOString() : (working ? updatedAt : '');
    return {
      id: taskId,
      title: cleanTitle(task?.title, `Task ${index + 1}`).slice(0, 140),
      details: String(task?.details || '').slice(0, 1600),
      taskGroupId: groupId,
      allocationId: taskAllocationIds.has(String(task?.allocationId || '')) ? String(task.allocationId) : '',
      priority,
      status,
      workState,
      working,
      workingSince,
      createdAt,
      updatedAt,
      dueDate,
      completedAt,
      closureNotes: String(task?.closureNotes || '').slice(0, 2200),
      timeEntries,
      taskNotes,
      taskLinks,
      minutesSpent
    };
  });

  const taskIds = new Set(tasks.map((task) => task.id));
  const reminders = (Array.isArray(raw?.reminders) ? raw.reminders : []).map((reminder, index) => {
    const normalized = MeshTabReminders.normalizeReminder(reminder, index);
    if (normalized.linkedTaskId && !taskIds.has(normalized.linkedTaskId)) normalized.linkedTaskId = '';
    return normalized;
  });

  const savedAnalytics = Array.isArray(raw?.settings?.taskAnalytics) ? raw.settings.taskAnalytics.filter((key) => TASK_ANALYTICS_KEYS.includes(key)) : [...TASK_ANALYTICS_KEYS];
  const taskAnalyticsVersion = Math.max(1, Number.parseInt(raw?.settings?.taskAnalyticsVersion, 10) || 1);
  if (taskAnalyticsVersion < 2 && savedAnalytics.length && !savedAnalytics.includes('closed')) savedAnalytics.splice(Math.min(2, savedAnalytics.length), 0, 'closed');
  const requestedView = ['desktop', 'home', 'general-notes', 'tasks', 'reminders', 'allocations', 'overlays', 'archive'].includes(raw?.settings?.activeView) ? raw.settings.activeView : 'desktop';
  const requestedTaskRailFilter = String(raw?.settings?.taskRailFilter || 'all');
  const taskRailFilter = requestedTaskRailFilter === 'all' || requestedTaskRailFilter === 'general' || desktopIds.has(requestedTaskRailFilter) ? requestedTaskRailFilter : 'all';
  const legacyStartup = typeof raw?.settings?.openPinnedOnStartup === 'boolean' ? raw.settings.openPinnedOnStartup : null;
  const settings = {
    openOnStart: typeof raw?.settings?.openOnStart === 'boolean' ? raw.settings.openOnStart : (legacyStartup ?? true),
    pinOnStart: typeof raw?.settings?.pinOnStart === 'boolean' ? raw.settings.pinOnStart : (legacyStartup ?? true),
    pinOnOpen: typeof raw?.settings?.pinOnOpen === 'boolean' ? raw.settings.pinOnOpen : true,
    meshTabScope: raw?.settings?.meshTabScope === 'all-windows' ? 'all-windows' : 'per-window',
    useMeshTabNewTab: typeof raw?.settings?.useMeshTabNewTab === 'boolean' ? raw.settings.useMeshTabNewTab : false,
    homeDefaultDesktopId: raw?.settings?.homeDefaultDesktopId === 'last-active' || desktopIds.has(String(raw?.settings?.homeDefaultDesktopId || '')) ? String(raw.settings.homeDefaultDesktopId) : 'last-active',
    appearance: ['light', 'dark', 'system'].includes(raw?.settings?.appearance) ? raw.settings.appearance : 'light',
    tabFontSize: Math.max(10, Math.min(18, Number(raw?.settings?.tabFontSize) || 12)),
    tabSpacing: Math.max(2, Math.min(20, Number.parseInt(raw?.settings?.tabSpacing, 10) || 7)),
    defaultTimeUnit: raw?.settings?.defaultTimeUnit === 'minutes' ? 'minutes' : 'hours',
    weeklyBillableHours: normalizeWeeklyBillableHours(raw?.settings?.weeklyBillableHours),
    headerClockSize: HEADER_CLOCK_SIZES.includes(raw?.settings?.headerClockSize) ? raw.settings.headerClockSize : 'medium',
    textSize: TEXT_SIZES.includes(raw?.settings?.textSize) ? raw.settings.textSize : 'small',
    workClockOverlayEnabled: raw?.settings?.workClockOverlayEnabled === true,
    workClockOverlayPosition: ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(raw?.settings?.workClockOverlayPosition) ? raw.settings.workClockOverlayPosition : 'bottom-center',
    workClockOverlayXRatio: Math.max(0, Math.min(1, Number.isFinite(Number(raw?.settings?.workClockOverlayXRatio)) ? Number(raw.settings.workClockOverlayXRatio) : 0.5)),
    workClockOverlayYRatio: Math.max(0, Math.min(1, Number.isFinite(Number(raw?.settings?.workClockOverlayYRatio)) ? Number(raw.settings.workClockOverlayYRatio) : 1)),
    workClockOverlayMinimized: raw?.settings?.workClockOverlayMinimized === true,
    siteOverlaysEnabled: raw?.settings?.siteOverlaysEnabled === true,
    showNotes: raw?.settings?.showNotes !== false,
    showTasks: raw?.settings?.showTasks !== false,
    showReminders: raw?.settings?.showReminders !== false,
    showOverlays: raw?.settings?.showOverlays !== false,
    showQuickLinks: raw?.settings?.showQuickLinks === true,
    openPagesCollapsed: Boolean(raw?.settings?.openPagesCollapsed),
    taskRailCollapsed: Boolean(raw?.settings?.taskRailCollapsed),
    taskRailFilter,
    activeView: requestedView,
    taskAnalytics: savedAnalytics,
    taskAnalyticsVersion: 2,
    reminderView: REMINDER_VIEW_MODES.includes(raw?.settings?.reminderView) ? raw.settings.reminderView : 'day'
  };
  if ((settings.activeView === 'general-notes' && !settings.showNotes) || ((settings.activeView === 'tasks' || settings.activeView === 'allocations') && !settings.showTasks) || (settings.activeView === 'reminders' && !settings.showReminders) || (settings.activeView === 'overlays' && !settings.showOverlays)) settings.activeView = 'desktop';
  const workClockRaw = raw?.workClock && typeof raw.workClock === 'object' ? raw.workClock : {};
  const runningSince = Number.isFinite(Date.parse(workClockRaw.runningSince || '')) ? new Date(workClockRaw.runningSince).toISOString() : '';
  const pausedAt = runningSince && Number.isFinite(Date.parse(workClockRaw.pausedAt || '')) ? new Date(workClockRaw.pausedAt).toISOString() : '';
  const pausedSeconds = runningSince ? Math.max(0, Math.min(31536000, Math.round(Number(workClockRaw.pausedSeconds) || 0))) : 0;
  const workClockSessions = (Array.isArray(workClockRaw.sessions) ? workClockRaw.sessions : []).map((session, index) => {
    const startAt = Number.isFinite(Date.parse(session?.startAt || '')) ? new Date(session.startAt).toISOString() : '';
    const endAt = Number.isFinite(Date.parse(session?.endAt || '')) ? new Date(session.endAt).toISOString() : '';
    const actualSeconds = Math.max(1, Math.min(31536000, Math.round(Number(session?.actualSeconds) || ((startAt && endAt) ? (Date.parse(endAt) - Date.parse(startAt)) / 1000 : 0))));
    if (!startAt || !endAt || !actualSeconds) return null;
    return { id: String(session?.id || `clock-${index}`), startAt, endAt, actualSeconds };
  }).filter(Boolean).slice(-1000);
  const workClockTaskId = runningSince && taskIds.has(String(workClockRaw?.taskId || '')) ? String(workClockRaw.taskId) : '';
  const workClockPendingTaskId = !runningSince && taskIds.has(String(workClockRaw?.pendingTaskId || '')) ? String(workClockRaw.pendingTaskId) : '';
  const workClockPendingSeconds = workClockPendingTaskId ? Math.max(1, Math.min(864000, Math.round(Number(workClockRaw.pendingSeconds) || 0))) : 0;
  const workClockPendingStartedAt = workClockPendingTaskId && Number.isFinite(Date.parse(workClockRaw.pendingStartedAt || '')) ? new Date(workClockRaw.pendingStartedAt).toISOString() : '';
  const workClockPendingEndedAt = workClockPendingTaskId && Number.isFinite(Date.parse(workClockRaw.pendingEndedAt || '')) ? new Date(workClockRaw.pendingEndedAt).toISOString() : '';
  const siteOverlays = (Array.isArray(raw?.siteOverlays) ? raw.siteOverlays : []).map((overlay, index) => {
    const now = new Date().toISOString();
    const targetMode = overlay?.targetMode === 'all-sites' ? 'all-sites' : 'site';
    let host = String(overlay?.host || overlay?.domain || '').trim().toLowerCase();
    host = host.replace(/^\*\./, '').replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (targetMode === 'site' && (!host || !/^[a-z0-9.-]+$/i.test(host))) return null;
    if (targetMode === 'all-sites') host = '';
    const type = overlay?.type === 'links' ? 'links' : 'label';
    const requestedShape = overlay?.shape === 'circle' ? 'pill' : overlay?.shape;
    const shape = type === 'links' ? 'rounded' : (SITE_OVERLAY_SHAPES.includes(requestedShape) ? requestedShape : 'rounded');
    const width = type === 'links' ? 48 : Math.max(80, Math.min(520, Number.parseInt(overlay?.width, 10) || 180));
    const height = type === 'links' ? 48 : Math.max(28, Math.min(280, Number.parseInt(overlay?.height, 10) || 44));
    const requestedDesktopId = String(overlay?.desktopId || '');
    const pageUrl = targetMode === 'site' ? normalizeSiteOverlayPageInput(overlay?.pageUrl || '') : '';
    const pageScope = targetMode === 'site' && overlay?.pageScope === 'specific' && pageUrl ? 'specific' : 'all';
    return {
      id: String(overlay?.id || `overlay-${index}`),
      type,
      name: cleanTitle(overlay?.name, type === 'links' ? 'MeshTab Links' : `Overlay ${index + 1}`).slice(0, 80),
      targetMode,
      host,
      includeSubdomains: targetMode === 'site' && overlay?.includeSubdomains === true,
      pageScope,
      pageUrl,
      enabled: overlay?.enabled !== false,
      desktopId: type === 'links' ? (desktopIds.has(requestedDesktopId) ? requestedDesktopId : fallbackDesktopId) : '',
      linkOpenMode: type === 'links' && SITE_OVERLAY_LINK_OPEN_MODES.includes(overlay?.linkOpenMode) ? overlay.linkOpenMode : 'same-tab',
      textColor: /^#[0-9a-f]{6}$/i.test(String(overlay?.textColor || '')) ? String(overlay.textColor) : '#ffffff',
      backgroundColor: /^#[0-9a-f]{6}$/i.test(String(overlay?.backgroundColor || '')) ? String(overlay.backgroundColor) : '#6e49ff',
      iconColor: /^#[0-9a-f]{6}$/i.test(String(overlay?.iconColor || '')) ? String(overlay.iconColor) : '#7048ff',
      customIconDataUrl: /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(String(overlay?.customIconDataUrl || '')) ? String(overlay.customIconDataUrl) : '',
      opacity: Math.max(10, Math.min(100, Number.isFinite(Number(overlay?.opacity)) ? Math.round(Number(overlay.opacity)) : 100)),
      fontFamily: SITE_OVERLAY_FONTS.includes(overlay?.fontFamily) ? overlay.fontFamily : 'system',
      fontSize: Math.max(8, Math.min(48, Number.parseInt(overlay?.fontSize, 10) || 16)),
      width,
      height,
      shape,
      cornerDocking: overlay?.cornerDocking === true,
      edge: SITE_OVERLAY_EDGES.includes(overlay?.edge) ? overlay.edge : 'top',
      offsetRatio: Math.max(0, Math.min(1, Number.isFinite(Number(overlay?.offsetRatio)) ? Number(overlay.offsetRatio) : 0.5)),
      createdAt: Number.isFinite(Date.parse(overlay?.createdAt || '')) ? new Date(overlay.createdAt).toISOString() : now,
      updatedAt: Number.isFinite(Date.parse(overlay?.updatedAt || '')) ? new Date(overlay.updatedAt).toISOString() : now
    };
  }).filter(Boolean).slice(0, 200);
  const requestedActive = String(raw?.activeDesktopId || '');
  const activeDesktopId = desktopIds.has(requestedActive) ? requestedActive : fallbackDesktopId;

  return { version: 24, favicons: raw.favicons && typeof raw.favicons === 'object' ? { ...raw.favicons } : {}, settings, desktops, activeDesktopId, notes, tasks, taskAllocations, reminders, workClock: { runningSince, pausedAt, pausedSeconds, sessions: workClockSessions, taskId: workClockTaskId, pendingTaskId: workClockPendingTaskId, pendingSeconds: workClockPendingSeconds, pendingStartedAt: workClockPendingStartedAt, pendingEndedAt: workClockPendingEndedAt }, siteOverlays, buckets };
}

async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(data[STORAGE_KEY]);
}

async function saveState() {
  state = normalizeState(state);
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function activeDesktop() {
  return state.desktops.find((desktop) => desktop.id === state.activeDesktopId && !desktop.archived) || state.desktops.find((desktop) => !desktop.archived) || state.desktops[0];
}

function getBucket(bucketId) {
  return state.buckets.find((bucket) => bucket.id === String(bucketId));
}

function childrenOf(parentId, desktopId = state.activeDesktopId) {
  return state.buckets
    .filter((bucket) => bucket.desktopId === desktopId && bucket.parentId === parentId && !bucket.archived)
    .sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title));
}

function descendantsOf(bucketId) {
  const result = [];
  const queue = [String(bucketId)];
  while (queue.length) {
    const parentId = queue.shift();
    for (const child of state.buckets.filter((bucket) => bucket.parentId === parentId)) {
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}

function bucketPath(bucket) {
  const parts = [bucket.title];
  let cursor = bucket;
  const seen = new Set([bucket.id]);
  while (cursor.parentId) {
    const parent = getBucket(cursor.parentId);
    if (!parent || seen.has(parent.id)) break;
    parts.unshift(parent.title);
    seen.add(parent.id);
    cursor = parent;
  }
  return parts.join(' / ');
}

function bookmarkLabel(bookmark, bucket) {
  return bucket?.bookmarkLabels?.[String(bookmark.id)] || bookmark.title || domainFor(bookmark.url);
}

function bucketLayout(bucket) {
  bucket.layout ||= {};
  bucket.layout.span = Math.max(2, Math.min(12, Number.parseInt(bucket.layout.span, 10) || (bucket.parentId ? 12 : 4)));
  bucket.layout.height = Math.max(0, Math.min(1600, Number.parseInt(bucket.layout.height, 10) || 0));
  bucket.layout.linkColumns = Math.max(1, Math.min(6, Number.parseInt(bucket.layout.linkColumns, 10) || 1));
  bucket.layout.previousSpan = Math.max(0, Math.min(12, Number.parseInt(bucket.layout.previousSpan, 10) || 0));
  bucket.layout.x = bucket.layout.x != null && Number.isFinite(Number(bucket.layout.x)) ? Math.max(0, Number(bucket.layout.x)) : null;
  bucket.layout.y = bucket.layout.y != null && Number.isFinite(Number(bucket.layout.y)) ? Math.max(0, Number(bucket.layout.y)) : null;
  bucket.layout.width = Number(bucket.layout.width) > 0 && Number.isFinite(Number(bucket.layout.width)) ? Math.max(180, Number(bucket.layout.width)) : 0;
  bucket.layout.previousWidth = Number(bucket.layout.previousWidth) > 0 && Number.isFinite(Number(bucket.layout.previousWidth)) ? Math.max(180, Number(bucket.layout.previousWidth)) : 0;
  bucket.layout.previousX = Number.isFinite(Number(bucket.layout.previousX)) ? Math.max(0, Number(bucket.layout.previousX)) : 0;
  bucket.layout.fullWidth = Boolean(bucket.layout.fullWidth);
  bucket.layout.z = Math.max(0, Number.parseInt(bucket.layout.z, 10) || 0);
  return bucket.layout;
}

function clearFreeBucketPlacement(bucket) {
  const layout = bucketLayout(bucket);
  layout.x = null;
  layout.y = null;
  layout.width = 0;
  layout.previousWidth = 0;
  layout.previousX = 0;
  layout.fullWidth = false;
  layout.z = 0;
}

function isFreeRootBucket(bucket) { return Boolean(bucket && !bucket.parentId); }

const GROUP_MESH_STEP = 20;
const GROUP_MESH_GAP = 8;
const GROUP_MESH_MIN_WIDTH = 180;
const GROUP_MESH_MIN_HEIGHT = 100;

function snapGroupMesh(value, minimum = 0) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : minimum;
  return Math.max(minimum, Math.round(numeric / GROUP_MESH_STEP) * GROUP_MESH_STEP);
}

function snapGroupMeshSize(value, minimum) {
  return Math.max(minimum, Math.round(Math.max(minimum, Number(value) || minimum) / GROUP_MESH_STEP) * GROUP_MESH_STEP);
}

function floorGroupMeshSize(value, minimum) {
  const numeric = Math.max(0, Number(value) || 0);
  if (numeric < minimum) return 0;
  return Math.max(minimum, Math.floor(numeric / GROUP_MESH_STEP) * GROUP_MESH_STEP);
}

function groupMeshCanvasWidth(canvas) {
  const raw = Math.max(GROUP_MESH_MIN_WIDTH, canvas?.clientWidth || bucketGrid?.clientWidth || 960);
  return Math.max(GROUP_MESH_MIN_WIDTH, Math.floor(raw / GROUP_MESH_STEP) * GROUP_MESH_STEP);
}

function groupMeshRectsOverlap(a, b, gap = GROUP_MESH_GAP) {
  return a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y;
}

function groupMeshRect(bucket, canvas, element = null, overrides = {}) {
  const layout = bucketLayout(bucket);
  const canvasWidth = groupMeshCanvasWidth(canvas);
  const fullWidth = overrides.fullWidth ?? layout.fullWidth;
  const width = fullWidth
    ? canvasWidth
    : snapGroupMeshSize(overrides.width ?? layout.width ?? element?.offsetWidth ?? GROUP_MESH_MIN_WIDTH, GROUP_MESH_MIN_WIDTH);
  const height = snapGroupMeshSize(overrides.height ?? layout.height ?? element?.offsetHeight ?? GROUP_MESH_MIN_HEIGHT, GROUP_MESH_MIN_HEIGHT);
  return {
    x: fullWidth ? 0 : snapGroupMesh(overrides.x ?? layout.x ?? 0),
    y: snapGroupMesh(overrides.y ?? layout.y ?? 0),
    width,
    height
  };
}

function groupMeshOccupiedRects(canvas, excludeBucketId = null) {
  const desktopId = state.activeDesktopId;
  return state.buckets
    .filter((candidate) => candidate.desktopId === desktopId && !candidate.parentId && candidate.id !== excludeBucketId)
    .map((candidate) => {
      const element = canvas?.querySelector(`:scope > .free-root-bucket[data-bucket-id="${CSS.escape(candidate.id)}"]`);
      return groupMeshRect(candidate, canvas, element);
    });
}

function groupMeshPositionAvailable(canvas, bucket, candidate, occupiedRects = null) {
  const occupied = occupiedRects || groupMeshOccupiedRects(canvas, bucket.id);
  return !occupied.some((rect) => groupMeshRectsOverlap(candidate, rect));
}

function fitGroupMeshAtPosition(canvas, bucket, desiredX, desiredY, width, height, occupiedRects = null) {
  const canvasWidth = groupMeshCanvasWidth(canvas);
  const occupied = occupiedRects || groupMeshOccupiedRects(canvas, bucket.id);
  const maxOriginX = Math.max(0, floorGroupMeshSize(canvasWidth - GROUP_MESH_MIN_WIDTH, 0));
  const x = Math.min(maxOriginX, snapGroupMesh(desiredX));
  const y = snapGroupMesh(desiredY);
  const requestedWidth = snapGroupMeshSize(width, GROUP_MESH_MIN_WIDTH);
  const requestedHeight = snapGroupMeshSize(height, GROUP_MESH_MIN_HEIGHT);
  const canvasRoom = floorGroupMeshSize(canvasWidth - x, GROUP_MESH_MIN_WIDTH);
  if (!canvasRoom) return null;
  const maxWidth = Math.min(requestedWidth, canvasRoom);
  const maxHeight = requestedHeight;

  const widths = new Set([maxWidth, GROUP_MESH_MIN_WIDTH]);
  const heights = new Set([maxHeight, GROUP_MESH_MIN_HEIGHT]);
  for (const rect of occupied) {
    if (rect.x > x) {
      const availableWidth = floorGroupMeshSize(rect.x - GROUP_MESH_GAP - x, GROUP_MESH_MIN_WIDTH);
      if (availableWidth && availableWidth <= maxWidth) widths.add(availableWidth);
    }
    if (rect.y > y) {
      const availableHeight = floorGroupMeshSize(rect.y - GROUP_MESH_GAP - y, GROUP_MESH_MIN_HEIGHT);
      if (availableHeight && availableHeight <= maxHeight) heights.add(availableHeight);
    }
  }

  let best = null;
  for (const candidateWidth of widths) {
    if (candidateWidth < GROUP_MESH_MIN_WIDTH || candidateWidth > maxWidth) continue;
    for (const candidateHeight of heights) {
      if (candidateHeight < GROUP_MESH_MIN_HEIGHT || candidateHeight > maxHeight) continue;
      const candidate = { x, y, width: candidateWidth, height: candidateHeight };
      if (!groupMeshPositionAvailable(canvas, bucket, candidate, occupied)) continue;
      const area = candidateWidth * candidateHeight;
      const preserved = (candidateWidth / requestedWidth) + (candidateHeight / requestedHeight);
      if (!best || area > best.area || (area === best.area && preserved > best.preserved)) {
        best = { ...candidate, area, preserved };
      }
    }
  }
  if (!best) return null;
  const { area, preserved, ...placement } = best;
  return placement;
}

function findAdaptiveGroupMeshPlacement(canvas, bucket, desiredX, desiredY, width, height, options = {}) {
  const canvasWidth = groupMeshCanvasWidth(canvas);
  const occupied = options.occupiedRects || groupMeshOccupiedRects(canvas, bucket.id);
  const preferredWidth = Math.min(snapGroupMeshSize(width, GROUP_MESH_MIN_WIDTH), canvasWidth);
  const preferredHeight = snapGroupMeshSize(height, GROUP_MESH_MIN_HEIGHT);
  const maxOriginX = Math.max(0, floorGroupMeshSize(canvasWidth - GROUP_MESH_MIN_WIDTH, 0));
  const baseX = Math.min(maxOriginX, snapGroupMesh(desiredX));
  const baseY = snapGroupMesh(desiredY);

  const tryAt = (x, y) => {
    if (x < 0 || y < 0 || x > maxOriginX) return null;
    const exactWidth = Math.min(preferredWidth, floorGroupMeshSize(canvasWidth - x, GROUP_MESH_MIN_WIDTH) || preferredWidth);
    const exact = { x, y, width: exactWidth, height: preferredHeight };
    if (exactWidth >= GROUP_MESH_MIN_WIDTH && groupMeshPositionAvailable(canvas, bucket, exact, occupied)) return exact;
    return fitGroupMeshAtPosition(canvas, bucket, x, y, preferredWidth, preferredHeight, occupied);
  };

  const base = tryAt(baseX, baseY);
  if (base) return base;

  for (let radius = 1; radius <= 100; radius += 1) {
    const ring = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      const dy = radius - Math.abs(dx);
      ring.push([dx, dy]);
      if (dy) ring.push([dx, -dy]);
    }
    const choices = [];
    const seen = new Set();
    for (const [dx, dy] of ring) {
      const x = baseX + dx * GROUP_MESH_STEP;
      const y = baseY + dy * GROUP_MESH_STEP;
      if (x < 0 || y < 0 || x > maxOriginX) continue;
      const key = `${x}:${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const placement = tryAt(x, y);
      if (!placement) continue;
      const area = placement.width * placement.height;
      const shrink = (preferredWidth - placement.width) + (preferredHeight - placement.height);
      choices.push({ placement, area, shrink, vertical: Math.abs(dy), horizontal: Math.abs(dx) });
    }
    if (choices.length) {
      choices.sort((a, b) => b.area - a.area || a.shrink - b.shrink || a.vertical - b.vertical || a.horizontal - b.horizontal);
      return choices[0].placement;
    }
  }

  return findNearestGroupMeshPosition(canvas, bucket, baseX, baseY, preferredWidth, preferredHeight, { occupiedRects: occupied });
}

function findNearestGroupMeshPosition(canvas, bucket, desiredX, desiredY, width, height, options = {}) {
  const canvasWidth = groupMeshCanvasWidth(canvas);
  const fullWidth = Boolean(options.fullWidth);
  const occupied = options.occupiedRects || groupMeshOccupiedRects(canvas, bucket.id);
  const snappedWidth = fullWidth ? canvasWidth : snapGroupMeshSize(width, GROUP_MESH_MIN_WIDTH);
  const snappedHeight = snapGroupMeshSize(height, GROUP_MESH_MIN_HEIGHT);
  const maxX = fullWidth || snappedWidth >= canvasWidth ? 0 : Math.max(0, Math.floor((canvasWidth - snappedWidth) / GROUP_MESH_STEP) * GROUP_MESH_STEP);
  const baseX = fullWidth ? 0 : Math.min(maxX, snapGroupMesh(desiredX));
  const baseY = snapGroupMesh(desiredY);

  const makeCandidate = (x, y) => ({ x: fullWidth ? 0 : Math.min(maxX, Math.max(0, x)), y: Math.max(0, y), width: snappedWidth, height: snappedHeight });
  const base = makeCandidate(baseX, baseY);
  if (groupMeshPositionAvailable(canvas, bucket, base, occupied)) return base;

  if (fullWidth) {
    for (let radius = 1; radius <= 500; radius += 1) {
      const below = makeCandidate(0, baseY + radius * GROUP_MESH_STEP);
      if (groupMeshPositionAvailable(canvas, bucket, below, occupied)) return below;
      const aboveY = baseY - radius * GROUP_MESH_STEP;
      if (aboveY >= 0) {
        const above = makeCandidate(0, aboveY);
        if (groupMeshPositionAvailable(canvas, bucket, above, occupied)) return above;
      }
    }
  } else {
    for (let radius = 1; radius <= 500; radius += 1) {
      const candidates = [];
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dy = radius - Math.abs(dx);
        candidates.push([dx, dy]);
        if (dy) candidates.push([dx, -dy]);
      }
      candidates.sort((a, b) => {
        const ay = baseY + a[1] * GROUP_MESH_STEP;
        const by = baseY + b[1] * GROUP_MESH_STEP;
        const aPenalty = ay < 0 ? 100000 : 0;
        const bPenalty = by < 0 ? 100000 : 0;
        return aPenalty - bPenalty || Math.abs(a[1]) - Math.abs(b[1]) || Math.abs(a[0]) - Math.abs(b[0]);
      });
      const seen = new Set();
      for (const [dx, dy] of candidates) {
        const x = baseX + dx * GROUP_MESH_STEP;
        const y = baseY + dy * GROUP_MESH_STEP;
        if (y < 0 || x < 0 || x > maxX) continue;
        const key = `${x}:${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const candidate = makeCandidate(x, y);
        if (groupMeshPositionAvailable(canvas, bucket, candidate, occupied)) return candidate;
      }
    }
  }

  const lowest = occupied.reduce((bottom, rect) => Math.max(bottom, rect.y + rect.height + GROUP_MESH_GAP), 0);
  return makeCandidate(0, snapGroupMesh(lowest));
}

function renderFreeGroupCanvas(roots, query) {
  const canvas = document.createElement('section');
  canvas.className = 'free-group-canvas';
  canvas.setAttribute('aria-label', 'Snapping Group mesh workspace');
  for (const bucket of roots) canvas.append(renderBucket(bucket, query, 0));
  return canvas;
}

function freeCanvasExtent(canvas) {
  if (!canvas) return;
  let bottom = 0;
  let right = canvas.clientWidth;
  for (const element of canvas.querySelectorAll(':scope > .free-root-bucket')) {
    const bucket = getBucket(element.dataset.bucketId);
    if (!bucket) continue;
    const rect = groupMeshRect(bucket, canvas, element);
    bottom = Math.max(bottom, rect.y + rect.height);
    right = Math.max(right, rect.x + rect.width);
  }
  canvas.style.height = `${Math.max(120, Math.ceil(bottom + GROUP_MESH_STEP))}px`;
  canvas.style.setProperty('--free-canvas-content-width', `${Math.max(canvas.clientWidth, Math.ceil(right + GROUP_MESH_STEP))}px`);
}

function initializeFreeGroupCanvas(canvas) {
  if (!canvas) return false;
  const elements = Array.from(canvas.querySelectorAll(':scope > .free-root-bucket'));
  if (!elements.length) { canvas.style.height = '0px'; return false; }
  const canvasWidth = groupMeshCanvasWidth(canvas);
  const gap = 9;
  const usable = Math.max(240, canvasWidth - gap * 11);
  const column = usable / 12;
  let changed = false;
  let topZ = Math.max(0, ...elements.map((el) => bucketLayout(getBucket(el.dataset.bucketId)).z || 0));
  const occupied = [];

  for (const element of elements) {
    const bucket = getBucket(element.dataset.bucketId);
    if (!bucket) continue;
    const layout = bucketLayout(bucket);
    const span = Math.max(2, Math.min(12, layout.span || 4));
    const fallbackWidth = Math.max(GROUP_MESH_MIN_WIDTH, Math.round(column * span + gap * Math.max(0, span - 1)));
    const hasSavedPlacement = Number.isFinite(layout.x) && Number.isFinite(layout.y) && layout.width > 0 && layout.height > 0;
    const savedWidth = layout.fullWidth ? canvasWidth : snapGroupMeshSize(layout.width || fallbackWidth, GROUP_MESH_MIN_WIDTH);
    const savedHeight = snapGroupMeshSize(layout.height || element.scrollHeight || 160, GROUP_MESH_MIN_HEIGHT);
    const savedRect = {
      x: layout.fullWidth ? 0 : snapGroupMesh(layout.x || 0),
      y: snapGroupMesh(layout.y || 0),
      width: savedWidth,
      height: savedHeight
    };

    // A persisted Mesh position is authoritative. Reopening Chrome can temporarily
    // change the measured center-column width while the rails are being restored;
    // that must never rewrite a layout the user already placed. We only resolve a
    // saved position when it actually collides with another persisted Group.
    let placement = null;
    if (hasSavedPlacement && groupMeshPositionAvailable(canvas, bucket, savedRect, occupied)) {
      placement = savedRect;
    } else if (hasSavedPlacement) {
      placement = findAdaptiveGroupMeshPlacement(canvas, bucket, savedRect.x, savedRect.y, savedRect.width, savedRect.height, { occupiedRects: occupied });
    } else {
      const width = layout.fullWidth ? canvasWidth : snapGroupMeshSize(layout.width || fallbackWidth, GROUP_MESH_MIN_WIDTH);
      const height = snapGroupMeshSize(layout.height || element.scrollHeight || 160, GROUP_MESH_MIN_HEIGHT);
      const desiredX = Number.isFinite(layout.x) ? layout.x : 0;
      const desiredY = Number.isFinite(layout.y) ? layout.y : 0;
      placement = findNearestGroupMeshPosition(canvas, bucket, desiredX, desiredY, width, height, { occupiedRects: occupied, fullWidth: layout.fullWidth });
    }

    const nextX = placement.x;
    const nextY = placement.y;
    const nextWidth = layout.fullWidth ? layout.width : placement.width;
    if (layout.x !== nextX || layout.y !== nextY || (!layout.fullWidth && layout.width !== nextWidth) || layout.height !== placement.height || !layout.z) changed = true;
    layout.x = nextX;
    layout.y = nextY;
    if (!layout.fullWidth) layout.width = nextWidth;
    layout.height = placement.height;
    if (!layout.z) layout.z = ++topZ;

    element.style.left = `${layout.x}px`;
    element.style.top = `${layout.y}px`;
    if (layout.fullWidth) { element.style.left = '0px'; element.style.width = `${canvasWidth}px`; }
    else element.style.width = `${layout.width}px`;
    element.style.height = `${layout.height}px`;
    element.style.zIndex = String(layout.z || 1);
    element.style.visibility = 'visible';
    occupied.push({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
  }
  freeCanvasExtent(canvas);
  if (changed) saveState().catch((error) => console.error('Could not save migrated Group mesh layout:', error));
  return changed;
}

function noteLayout(note) {
  note.layout ||= {};
  note.layout.span = Math.max(2, Math.min(12, Number.parseInt(note.layout.span, 10) || 4));
  note.layout.height = Math.max(0, Math.min(1600, Number.parseInt(note.layout.height, 10) || 0));
  note.layout.previousSpan = Math.max(0, Math.min(12, Number.parseInt(note.layout.previousSpan, 10) || 0));
  return note.layout;
}

function notesForDesktop(desktopId = state.activeDesktopId) {
  return (state.notes || []).filter((note) => !note.general && note.desktopId === desktopId).sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title));
}

function noteChildrenOf(parentNoteId, desktopId = state.activeDesktopId, general = null) {
  let useGeneral = general;
  if (useGeneral == null && parentNoteId) useGeneral = Boolean(getNote(parentNoteId)?.general);
  if (useGeneral == null) useGeneral = false;
  return (state.notes || []).filter((note) => note.general === useGeneral && (useGeneral || note.desktopId === desktopId) && note.parentNoteId === parentNoteId).sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title));
}

function rootNotesForDesktop(desktopId = state.activeDesktopId) { return noteChildrenOf(null, desktopId, false); }
function rootGeneralNotes() { return noteChildrenOf(null, state.activeDesktopId, true); }

function nextNotePosition(desktopId = state.activeDesktopId, parentNoteId = null, general = false) {
  const notes = noteChildrenOf(parentNoteId, desktopId, general);
  return notes.length ? Math.max(...notes.map((note) => note.position)) + 1 : 0;
}

function getNote(noteId) {
  return (state.notes || []).find((note) => note.id === String(noteId));
}

function descendantNotesOf(noteId) {
  const result = [];
  const queue = [String(noteId)];
  while (queue.length) {
    const parentId = queue.shift();
    for (const child of (state.notes || []).filter((note) => note.parentNoteId === parentId)) {
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}

function noteBranchMatches(note, query) {
  if (!query) return true;
  if (noteMatches(note, query)) return true;
  return noteChildrenOf(note.id, note.desktopId).some((child) => noteBranchMatches(child, query));
}

function moveNoteTreeToDesktop(note, desktopId) {
  note.general = false;
  note.desktopId = desktopId;
  for (const child of descendantNotesOf(note.id)) { child.general = false; child.desktopId = desktopId; }
}

function moveNoteTreeToGeneral(note) {
  note.general = true;
  for (const child of descendantNotesOf(note.id)) child.general = true;
}

function normalizeNoteHref(value) {
  let href = String(value || '').trim();
  if (/^www\./i.test(href)) href = `https://${href}`;
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function sanitizeNoteHtml(value) {
  const source = typeof value === 'string' ? value : '';
  if (!source) return '';
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  const allowed = new Set(['DIV', 'P', 'BR', 'IMG', 'A', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI']);
  for (const node of Array.from(root.querySelectorAll('*'))) {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      continue;
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) { node.remove(); continue; }
      const alt = (node.getAttribute('alt') || 'Pasted image').slice(0, 120);
      for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
      node.setAttribute('src', src);
      node.setAttribute('alt', alt);
      continue;
    }
    if (node.tagName === 'A') {
      const href = normalizeNoteHref(node.getAttribute('href') || node.textContent || '');
      if (!href) { node.replaceWith(...Array.from(node.childNodes)); continue; }
      for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
      node.setAttribute('href', href);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
      continue;
    }
    for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
  }
  return root.innerHTML.trim();
}

function linkifyNoteElement(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('a')) continue;
    textNodes.push(node);
  }
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue || '';
    urlPattern.lastIndex = 0;
    if (!urlPattern.test(text)) continue;
    urlPattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match;
    while ((match = urlPattern.exec(text))) {
      let raw = match[0];
      let trailing = '';
      while (/[.,;:!?)}\]]$/.test(raw)) { trailing = raw.slice(-1) + trailing; raw = raw.slice(0, -1); }
      const href = normalizeNoteHref(raw);
      if (!href) continue;
      const start = match.index;
      if (start > cursor) fragment.append(document.createTextNode(text.slice(cursor, start)));
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = raw;
      fragment.append(anchor);
      if (trailing) fragment.append(document.createTextNode(trailing));
      cursor = match.index + match[0].length;
    }
    if (!cursor) continue;
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    textNode.replaceWith(fragment);
  }
}

function linkifyNoteHtml(value) {
  const holder = document.createElement('div');
  holder.innerHTML = sanitizeNoteHtml(value);
  linkifyNoteElement(holder);
  return sanitizeNoteHtml(holder.innerHTML);
}

function notePlainText(note) {
  const holder = document.createElement('div');
  holder.innerHTML = sanitizeNoteHtml(note?.html || '');
  return (holder.textContent || '').trim();
}

function noteMatches(note, query) {
  if (!query) return true;
  return `${note.title} ${notePlainText(note)}`.toLowerCase().includes(query);
}

function nextSiblingPosition(parentId, desktopId) {
  const siblings = childrenOf(parentId, desktopId);
  return siblings.length ? Math.max(...siblings.map((bucket) => bucket.position)) + 1 : 0;
}

function flattenBookmarks(nodes, target = []) {
  for (const node of nodes) {
    if (node.url) target.push(node);
    if (node.children?.length) flattenBookmarks(node.children, target);
  }
  return target;
}

async function refreshBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  bookmarks = flattenBookmarks(tree).sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url));
  bookmarkMap = new Map(bookmarks.map((bookmark) => [String(bookmark.id), bookmark]));
}

function tabUrl(tab) {
  return tab?.url || tab?.pendingUrl || '';
}

function isBookmarkableUrl(url) {
  return /^(https?|file):/i.test(url || '');
}

// Local file paths (C:\... or \\server\share\...) are not supported as links -
// Chrome's extension APIs can't reliably hand a local file to the OS to open,
// even with "Allow access to file URLs" enabled. Use this to detect one so
// callers can reject it with a clear message instead of saving a dead link.
function looksLikeLocalPath(value) {
  const url = String(value || '').trim();
  return /^[a-zA-Z]:[\\/]/.test(url) || /^\\\\/.test(url);
}

// Accepts a pasted URL and returns a properly formed URL, prepending https://
// to a bare domain. Returns '' for anything that isn't a usable web URL.
function normalizeLinkUrl(value) {
  let url = String(value || '').trim();
  if (!url) return '';
  if (looksLikeLocalPath(url)) return '';
  if (/^(https?|file):/i.test(url)) return url;
  return `https://${url}`;
}

function comparableUrl(url) {
  try { return new URL(url).href; } catch { return String(url || ''); }
}

async function openOrFocusUrl(url) {
  const wanted = comparableUrl(url);
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => comparableUrl(tabUrl(tab)) === wanted);
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
      return 'focused';
    }

    let currentTab = null;
    if (currentMeshTabId != null) {
      currentTab = tabs.find((tab) => tab.id === currentMeshTabId) || null;
    }
    if (!currentTab) {
      try { currentTab = await chrome.tabs.getCurrent(); } catch {}
    }

    if (currentTab?.id != null && currentTab.pinned === false) {
      await chrome.tabs.update(currentTab.id, { url, active: true });
      return 'reused';
    }

    await chrome.tabs.create({ url, active: true });
    return 'opened';
  } catch (error) {
    toast(error?.message || 'Could not open that page.');
    return 'error';
  }
}

function domainFor(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'Local file';
    if (parsed.protocol === 'chrome:') return `chrome://${parsed.hostname}`;
    return parsed.hostname.replace(/^www\./, '') || parsed.protocol.replace(':', '');
  } catch {
    return url || 'Unknown page';
  }
}

function firstLetter(item) {
  const text = item.title?.trim() || domainFor(item.url) || '?';
  return text.charAt(0).toUpperCase();
}

function safeRuntimeFavicon(value) {
  const icon = typeof value === 'string' ? value.trim() : '';
  if (MeshTabImport.safeFavicon(icon)) return icon;
  if (/^chrome-extension:\/\//i.test(icon)) return icon;
  return '';
}

function chromeFaviconUrl(pageUrl, size = 32) {
  try {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(size));
    return url.toString();
  } catch { return ''; }
}

function preferredFavicon(pageUrl, explicitIcon = '') {
  return safeRuntimeFavicon(explicitIcon) || MeshTabImport.safeFavicon(state?.favicons?.[pageUrl]) || chromeFaviconUrl(pageUrl, 32);
}

function rememberFavicon(pageUrl, iconUrl) {
  const safe = safeRuntimeFavicon(iconUrl);
  if (!safe || !pageUrl) return;
  state.favicons ||= {};
  state.favicons[pageUrl] = safe;
}

function createFaviconBadge(item, className, explicitIcon = '') {
  const badge = document.createElement('div');
  badge.className = className;
  const fallback = document.createElement('span');
  fallback.className = 'favicon-fallback';
  fallback.textContent = firstLetter(item);
  const icon = preferredFavicon(item.url, explicitIcon);
  if (!icon) { badge.append(fallback); return badge; }
  const image = document.createElement('img');
  image.className = 'favicon-img';
  image.alt = '';
  image.src = icon;
  image.addEventListener('error', () => { image.remove(); fallback.hidden = false; }, { once: true });
  fallback.hidden = true;
  badge.append(image, fallback);
  return badge;
}

async function refreshOpenTabs() {
  try {
    const extensionRoot = chrome.runtime.getURL('');
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    openTabWindows = windows
      .map((windowItem) => ({ id: windowItem.id, focused: Boolean(windowItem.focused), tabs: (windowItem.tabs || []).filter((tab) => !tabUrl(tab).startsWith(extensionRoot)) }))
      .filter((windowItem) => windowItem.tabs.length)
      .sort((a, b) => Number(b.focused) - Number(a.focused));
    openTabMap = new Map();
    for (const windowItem of openTabWindows) for (const tab of windowItem.tabs) openTabMap.set(Number(tab.id), tab);
    renderOpenTabs($('#globalSearch')?.value || '');
  } catch (error) {
    console.error('MeshTab could not refresh open tabs:', error);
    openTabWindows = [];
    openTabMap = new Map();
    renderOpenTabs('');
  }
}

function scheduleTabRefresh() {
  clearTimeout(tabRefreshTimer);
  tabRefreshTimer = setTimeout(refreshOpenTabs, 120);
}

function cleanMissingAssignments() {
  let changed = false;
  for (const bucket of state.buckets) {
    const next = Array.from(new Set(bucket.bookmarkIds.map(String))).filter((id) => bookmarkMap.has(id));
    if (next.length !== bucket.bookmarkIds.length || next.some((id, index) => id !== String(bucket.bookmarkIds[index]))) {
      bucket.bookmarkIds = next;
      changed = true;
    }
    bucket.bookmarkLabels ||= {};
    const assigned = new Set(bucket.bookmarkIds.map(String));
    for (const id of Object.keys(bucket.bookmarkLabels)) {
      if (!assigned.has(String(id))) { delete bucket.bookmarkLabels[id]; changed = true; }
    }
  }
  return changed;
}

function assignedBucketIds(bookmarkId) {
  const id = String(bookmarkId);
  return state.buckets.filter((bucket) => bucket.bookmarkIds.includes(id)).map((bucket) => bucket.id);
}

function assignedBucketTitles(bookmarkId) {
  const ids = new Set(assignedBucketIds(bookmarkId));
  return state.buckets.filter((bucket) => ids.has(bucket.id)).map((bucket) => bucketPath(bucket));
}

async function addBookmarkToBucket(bookmarkId, targetBucketId, { renderNow = true } = {}) {
  const id = String(bookmarkId);
  const target = getBucket(targetBucketId);
  if (!target) return false;
  if (!target.bookmarkIds.includes(id)) target.bookmarkIds.unshift(id);
  await saveState();
  if (renderNow) render();
  return true;
}

async function moveBookmark(bookmarkId, sourceBucketId, targetBucketId, targetBookmarkId = null, placeAfter = false) {
  const id = String(bookmarkId);
  const source = getBucket(sourceBucketId);
  const target = getBucket(targetBucketId);
  if (!target) return false;

  const beforeSource = source ? source.bookmarkIds.map(String) : [];
  const beforeTarget = target.bookmarkIds.map(String);
  const targetId = targetBookmarkId == null ? null : String(targetBookmarkId);

  // Dropping a bookmark directly back onto itself should not change its order.
  if (source === target && targetId === id) return false;

  // If the destination already contains this bookmark and the user drops on that
  // existing copy, treat the operation as removing it from the source only.
  if (source !== target && targetId === id && beforeTarget.includes(id)) {
    if (source) {
      source.bookmarkIds = source.bookmarkIds.filter((existing) => String(existing) !== id);
      if (source.bookmarkLabels) delete source.bookmarkLabels[id];
    }
    const changed = beforeSource.join('\u0000') !== (source ? source.bookmarkIds.map(String) : []).join('\u0000');
    if (!changed) return false;
    await saveState();
    render();
    return true;
  }

  // Remove the dragged bookmark from its source and from the destination first.
  // This lets a same-project drag become a true reorder and prevents duplicates.
  const sourceLabel = source?.bookmarkLabels?.[id] || '';
  if (source) {
    source.bookmarkIds = source.bookmarkIds.filter((existing) => String(existing) !== id);
    if (target !== source && source.bookmarkLabels) delete source.bookmarkLabels[id];
  }
  if (target !== source) target.bookmarkIds = target.bookmarkIds.filter((existing) => String(existing) !== id);

  let insertAt = target.bookmarkIds.length;
  if (targetId && targetId !== id) {
    const targetIndex = target.bookmarkIds.findIndex((existing) => String(existing) === targetId);
    if (targetIndex >= 0) insertAt = targetIndex + (placeAfter ? 1 : 0);
  }
  target.bookmarkIds.splice(insertAt, 0, id);
  target.bookmarkLabels ||= {};
  if (sourceLabel && target !== source) target.bookmarkLabels[id] = sourceLabel;

  const afterSource = source ? source.bookmarkIds.map(String) : [];
  const afterTarget = target.bookmarkIds.map(String);
  const changed = source === target
    ? beforeTarget.join('\u0000') !== afterTarget.join('\u0000')
    : beforeSource.join('\u0000') !== afterSource.join('\u0000') || beforeTarget.join('\u0000') !== afterTarget.join('\u0000');

  if (!changed) return false;
  await saveState();
  render();
  return true;
}

async function addOpenTabToBucket(tabId, targetBucketId) {
  const tab = openTabMap.get(Number(tabId));
  const url = tabUrl(tab);
  if (!tab || !url) { toast('That tab is no longer open.'); await refreshOpenTabs(); return; }
  if (!isBookmarkableUrl(url)) { toast('Chrome internal pages cannot be added as bookmarks.'); return; }
  try {
    const existing = await chrome.bookmarks.search({ url });
    const bookmark = existing.find((candidate) => candidate.url === url) || await chrome.bookmarks.create({ title: tab.title || domainFor(url), url });
    rememberFavicon(url, tab.favIconUrl);
    await refreshBookmarks();
    await addBookmarkToBucket(String(bookmark.id), targetBucketId);
    toast(`Added to ${getBucket(targetBucketId)?.title || 'project'}.`);
  } catch (error) { toast(error?.message || 'Could not add that open page.'); }
}

async function removeFromBucket(bucketId, bookmarkId) {
  const bucket = getBucket(bucketId);
  if (!bucket) return;
  bucket.bookmarkIds = bucket.bookmarkIds.filter((id) => String(id) !== String(bookmarkId));
  if (bucket.bookmarkLabels) delete bucket.bookmarkLabels[String(bookmarkId)];
  await saveState();
  render();
  toast('Removed from MeshTab. Chrome bookmark kept.');
}

async function moveBucketNode(bucketId, targetDesktopId, targetParentId, beforeBucketId = null) {
  const bucket = getBucket(bucketId);
  if (!bucket) return false;
  const targetParent = targetParentId ? getBucket(targetParentId) : null;
  if (targetParent && targetParent.desktopId !== targetDesktopId) return false;
  const descendants = new Set(descendantsOf(bucket.id).map((item) => item.id));
  if (targetParentId === bucket.id || descendants.has(String(targetParentId)) || descendants.has(String(beforeBucketId))) {
    toast('A project cannot be moved inside itself.');
    return false;
  }

  const oldDesktopId = bucket.desktopId;
  const oldParentId = bucket.parentId;
  bucket.desktopId = targetDesktopId;
  bucket.parentId = targetParentId || null;
  if (bucket.parentId) clearFreeBucketPlacement(bucket);
  else if (oldParentId || oldDesktopId !== targetDesktopId) clearFreeBucketPlacement(bucket);
  for (const child of descendantsOf(bucket.id)) child.desktopId = targetDesktopId;

  if (oldDesktopId !== targetDesktopId || oldParentId !== bucket.parentId) {
    childrenOf(oldParentId, oldDesktopId).filter((item) => item.id !== bucket.id).forEach((item, index) => { item.position = index; });
  }

  const targetSiblings = childrenOf(bucket.parentId, targetDesktopId).filter((item) => item.id !== bucket.id);
  let insertAt = targetSiblings.length;
  if (beforeBucketId) {
    const found = targetSiblings.findIndex((item) => item.id === String(beforeBucketId));
    if (found >= 0) insertAt = found;
  }
  targetSiblings.splice(insertAt, 0, bucket);
  targetSiblings.forEach((item, index) => { item.position = index; });

  await saveState();
  render();
  return true;
}

function createButton(text, className, action, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.dataset.action = action;
  if (label) button.setAttribute('aria-label', label);
  return button;
}

function renderBookmarkCard(bookmark, bucket) {
  const card = document.createElement('article');
  card.className = 'bookmark-card';
  card.draggable = true;
  card.dataset.bookmarkId = String(bookmark.id);
  card.dataset.bucketId = bucket.id;
  card.dataset.url = bookmark.url;
  card.title = bookmark.url;

  const badge = createFaviconBadge({ ...bookmark, title: bookmarkLabel(bookmark, bucket) }, 'site-badge');
  const link = document.createElement('a');
  link.className = 'bookmark-main';
  link.draggable = false;
  link.href = bookmark.url;
  link.dataset.smartUrl = bookmark.url;
  link.title = bookmark.url;
  const title = document.createElement('span');
  title.className = 'bookmark-title';
  title.textContent = bookmarkLabel(bookmark, bucket);
  link.append(title);

  const controls = document.createElement('div');
  controls.className = 'bookmark-controls';
  const edit = createButton('E', 'bookmark-mini-btn text-icon', 'rename-bookmark', 'Rename this MeshTab bookmark label');
  edit.dataset.bucketId = bucket.id;
  edit.dataset.bookmarkId = String(bookmark.id);
  const remove = createButton('x', 'bookmark-mini-btn remove-btn', 'remove-bookmark', 'Remove from this MeshTab project');
  remove.dataset.bucketId = bucket.id;
  remove.dataset.bookmarkId = String(bookmark.id);
  controls.append(edit, remove);

  badge.querySelector?.('img')?.setAttribute('draggable', 'false');
  card.append(badge, link, controls);
  return card;
}

function bucketDirectMatches(bucket, query) {
  if (!query) return true;
  if (`${bucket.title} ${bucket.kind}`.toLowerCase().includes(query)) return true;
  return bucket.bookmarkIds.some((id) => {
    const bookmark = bookmarkMap.get(String(id));
    return bookmark && `${bookmarkLabel(bookmark, bucket)} ${bookmark.title} ${bookmark.url}`.toLowerCase().includes(query);
  });
}

function bucketBranchMatches(bucket, query) {
  if (!query) return true;
  if (bucketDirectMatches(bucket, query)) return true;
  return childrenOf(bucket.id, bucket.desktopId).some((child) => bucketBranchMatches(child, query));
}

function toggleBucketMoreMenu(toggle, menu) {
  if (!toggle || !menu) return;
  if (menu.matches(':popover-open')) {
    menu.hidePopover();
    return;
  }
  menu.showPopover();
  const toggleRect = toggle.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const pad = 8;
  const gap = 4;
  let left = Math.min(window.innerWidth - pad - menuRect.width, toggleRect.right - menuRect.width);
  left = Math.max(pad, left);
  let top = toggleRect.bottom + gap;
  if (top + menuRect.height > window.innerHeight - pad) top = Math.max(pad, toggleRect.top - menuRect.height - gap);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function renderBucket(bucket, query, depth = 0) {
  const section = document.createElement('section');
  section.className = 'bucket';
  section.dataset.bucketId = bucket.id;
  section.dataset.color = bucket.color;
  if (!COLORS.includes(bucket.color)) section.style.setProperty('--bucket', bucket.color);
  section.style.setProperty('--depth', String(depth));
  const layout = bucketLayout(bucket);
  if (depth === 0 && !bucket.parentId) {
    section.classList.add('free-root-bucket');
    section.style.visibility = Number.isFinite(layout.x) && Number.isFinite(layout.y) && layout.width ? 'visible' : 'hidden';
    if (Number.isFinite(layout.x)) section.style.left = `${layout.x}px`;
    if (Number.isFinite(layout.y)) section.style.top = `${layout.y}px`;
    if (layout.fullWidth) { section.style.left = '0px'; section.style.width = '100%'; }
    else if (layout.width) section.style.width = `${layout.width}px`;
    section.style.zIndex = String(layout.z || 1);
  } else {
    section.style.gridColumn = `span ${layout.span}`;
  }
  if (layout.height) section.style.height = `${layout.height}px`;

  const accent = document.createElement('div');
  accent.className = 'bucket-accent';
  const head = document.createElement('div');
  head.className = 'bucket-head';

  const drag = createButton('::', 'bucket-drag-handle', 'drag-bucket', depth === 0 ? `Drag ${bucket.title} on the snapping mesh` : `Drag ${bucket.title}`);
  drag.draggable = depth > 0;
  drag.dataset.bucketId = bucket.id;

  const titleWrap = document.createElement('div');
  titleWrap.className = 'bucket-title-wrap';
  if (depth === 0 && !bucket.parentId) titleWrap.title = 'Drag this title area to move the Group on the snapping mesh. Groups snap into place and cannot overlap. Use the ↗ control to move it to another Tab or nest it.';
  const titleLine = document.createElement('div');
  titleLine.className = 'bucket-title-line';
  const heading = document.createElement('h2');
  heading.textContent = bucket.title;
  titleLine.append(heading);
  const childCount = childrenOf(bucket.id, bucket.desktopId).length;
  const validBookmarks = bucket.bookmarkIds.map((id) => bookmarkMap.get(String(id))).filter(Boolean);
  const count = document.createElement('p');
  count.className = 'bucket-count';
  count.textContent = `${validBookmarks.length} link${validBookmarks.length === 1 ? '' : 's'}${childCount ? ` / ${childCount} nested` : ''}`;
  titleWrap.append(titleLine, count);

  const actions = document.createElement('div');
  actions.className = 'bucket-actions';
  const isFull = depth === 0 && !bucket.parentId ? layout.fullWidth : layout.span === 12;

  // Group actions always live behind one three-dot menu so the Group name keeps
  // priority at every width. The popover is promoted to the browser top layer,
  // which prevents a small/clipped Group frame from clipping the action list.
  const moreToggle = document.createElement('button');
  moreToggle.type = 'button';
  moreToggle.className = 'icon-btn text-icon bucket-more-toggle';
  moreToggle.textContent = '⋯';
  moreToggle.title = `Actions for ${bucket.title}`;
  moreToggle.setAttribute('aria-label', `Actions for ${bucket.title}`);
  moreToggle.setAttribute('aria-haspopup', 'menu');

  const moreMenu = document.createElement('div');
  moreMenu.className = 'bucket-more-menu';
  moreMenu.setAttribute('popover', 'auto');
  moreMenu.setAttribute('role', 'menu');
  const menuAction = (text, action, label) => {
    const button = createButton(text, 'bucket-more-item', action, label);
    button.dataset.bucketId = bucket.id;
    button.setAttribute('role', 'menuitem');
    return button;
  };
  moreMenu.append(
    menuAction('Add bookmark', 'add-bookmark', `Add bookmark to ${bucket.title}`),
    menuAction('Add nested Group', 'add-child', `Create group inside ${bucket.title}`),
    menuAction(`Link columns: ${layout.linkColumns}`, 'cycle-columns', `Change link columns in ${bucket.title}`),
    menuAction(isFull ? 'Restore width' : 'Full width', 'toggle-full-width', isFull ? `Restore ${bucket.title} width` : `Make ${bucket.title} full width`),
    menuAction('Edit Group', 'rename-bucket', `Edit ${bucket.title}`),
    menuAction('Archive Group', 'toggle-bucket-archived', `Archive ${bucket.title} and move it to the Archive section`),
    menuAction('Delete Group', 'delete-bucket', `Delete ${bucket.title}`)
  );
  moreToggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleBucketMoreMenu(moreToggle, moreMenu);
  });
  actions.append(moreToggle, moreMenu);
  // The drag handle is only rendered for nested Groups, where it's the sole way to
  // start moving/re-nesting the Group. A top-level Group can already be dragged by
  // grabbing its header directly, so the handle there was just an inert-looking icon.
  if (depth > 0) { head.append(drag, titleWrap, actions); }
  else { head.classList.add('no-drag-handle'); head.append(titleWrap, actions); }

  const body = document.createElement('div');
  body.className = 'bucket-body';
  body.style.setProperty('--link-columns', String(layout.linkColumns));
  const bucketMatches = query && `${bucket.title} ${bucket.kind}`.toLowerCase().includes(query);
  const filtered = query && !bucketMatches
    ? validBookmarks.filter((bookmark) => `${bookmarkLabel(bookmark, bucket)} ${bookmark.title} ${bookmark.url}`.toLowerCase().includes(query))
    : validBookmarks;

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'bucket-empty';
    empty.innerHTML = query ? '<strong>No direct link matches</strong><span>Nested matches may still appear below.</span>' : '<strong>Drop links or projects here</strong><span>Open tabs become bookmarks; projects become nested children.</span>';
    body.append(empty);
  } else {
    for (const bookmark of filtered) body.append(renderBookmarkCard(bookmark, bucket));
  }
  const addLink = createButton('+ Add bookmark', 'add-link', 'add-bookmark');
  addLink.dataset.bucketId = bucket.id;
  body.append(addLink);

  const nested = document.createElement('div');
  nested.className = 'bucket-children';
  const children = childrenOf(bucket.id, bucket.desktopId).filter((childBucket) => bucketBranchMatches(childBucket, query));
  for (const childBucket of children) nested.append(renderBucket(childBucket, query, depth + 1));
  if (children.length) body.append(nested);

  const resizer = document.createElement('button');
  resizer.type = 'button';
  resizer.className = 'bucket-resizer';
  resizer.dataset.bucketId = bucket.id;
  resizer.setAttribute('aria-label', `Resize ${bucket.title}`);
  resizer.title = 'Drag to resize this project/folder';

  section.append(accent, head, body, resizer);
  return section;
}


function renderNote(note, query = '', depth = 0) {
  const section = document.createElement('section');
  section.className = `note-panel${depth ? ' nested-note-panel' : ''}`;
  section.dataset.noteId = note.id;
  const layout = noteLayout(note);
  section.style.gridColumn = `span ${layout.span}`;
  if (layout.height) section.style.height = `${layout.height}px`;

  const accent = document.createElement('div');
  accent.className = 'note-accent';
  const head = document.createElement('div');
  head.className = 'note-head';
  const drag = createButton('::', 'note-drag-handle', 'drag-note', `Drag ${note.title}`);
  drag.draggable = true;
  drag.dataset.noteId = note.id;
  const titleWrap = document.createElement('div');
  titleWrap.className = 'note-title-wrap';
  const heading = document.createElement('h2');
  heading.textContent = note.title;
  const children = noteChildrenOf(note.id, note.desktopId).filter((child) => noteBranchMatches(child, query));
  const meta = document.createElement('small');
  meta.textContent = `${note.masked ? 'Masked note' : 'Note'}${children.length ? ` · ${children.length} nested` : ''}`;
  titleWrap.append(heading, meta);
  const actions = document.createElement('div');
  actions.className = 'note-actions';
  const revealedForActions = !note.masked || revealedNoteIds.has(note.id);
  const bulletToggle=createButton('• List','icon-btn note-bullet-toggle','toggle-note-bullets',`Toggle bullet list in ${note.title}`);
  bulletToggle.dataset.noteId=note.id;
  bulletToggle.hidden=!revealedForActions;
  bulletToggle.addEventListener('mousedown',(event)=>event.preventDefault());
  const moreToggle=createButton('⋯','icon-btn note-more-toggle','note-more-menu',`Actions for ${note.title}`);
  moreToggle.setAttribute('aria-haspopup','menu');
  const moreMenu=document.createElement('div'); moreMenu.className='note-more-menu'; moreMenu.setAttribute('popover','auto'); moreMenu.setAttribute('role','menu');
  const noteMenuAction=(text,action,label)=>{const button=createButton(text,'note-more-item',action,label);button.dataset.noteId=note.id;button.setAttribute('role','menuitem');return button;};
  if(note.masked){const revealed=revealedNoteIds.has(note.id);moreMenu.append(noteMenuAction(revealed?'Hide masked note':'Reveal masked note','toggle-note-mask',revealed?'Hide this masked note':'Show this masked note'));}
  moreMenu.append(noteMenuAction('Add nested Note','add-child-note',`Add a note inside ${note.title}`),noteMenuAction(layout.span===12?'Restore width':'Full width','toggle-note-full-width',layout.span===12?`Restore ${note.title} width`:`Make ${note.title} full width`),noteMenuAction('Edit Note','edit-note',`Edit ${note.title}`),noteMenuAction('Delete Note','delete-note',`Delete ${note.title}`));
  moreToggle.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();toggleBucketMoreMenu(moreToggle,moreMenu);});
  actions.append(bulletToggle,moreToggle,moreMenu);
  head.append(drag, titleWrap, actions);

  const body = document.createElement('div');
  body.className = 'note-body';
  const revealed = !note.masked || revealedNoteIds.has(note.id);
  if (!revealed) {
    const mask = document.createElement('div');
    mask.className = 'note-mask';
    mask.innerHTML = '<div><strong>Content masked</strong><span>Click the eye to reveal this note.</span></div>';
    body.append(mask);
  } else {
    const content = document.createElement('div');
    content.className = 'note-content note-live-editor';
    content.dataset.noteId = note.id;
    content.contentEditable = 'true';
    content.spellcheck = true;
    content.setAttribute('role', 'textbox');
    content.setAttribute('aria-multiline', 'true');
    content.setAttribute('aria-label', `Edit note contents for ${note.title}`);
    content.dataset.placeholder = 'Click here to write, or paste text and pictures...';
    content.innerHTML = linkifyNoteHtml(note.html || '');
    body.append(content);

    if (children.length) {
      const childGrid = document.createElement('div');
      childGrid.className = 'note-children-grid';
      for (const child of children) childGrid.append(renderNote(child, query, depth + 1));
      body.append(childGrid);
    }
  }

  const resizer = document.createElement('button');
  resizer.type = 'button';
  resizer.className = 'note-resizer';
  resizer.dataset.noteId = note.id;
  resizer.setAttribute('aria-label', `Resize ${note.title}`);
  resizer.title = 'Drag to resize this note panel';
  section.append(accent, head, body, resizer);
  return section;
}


function taskGroupLabel(groupId) {
  if (groupId === 'general') return 'General Tasks';
  const desktop = state.desktops.find((item) => item.id === groupId);
  return desktop ? `Tab — ${desktop.title}` : 'General Tasks';
}

function taskWorkState(task) {
  if (!task || task.status === 'done') return 'closed';
  if (TASK_WORK_STATES.includes(task.workState)) return task.workState;
  return task.working ? 'working' : 'todo';
}

function taskStatusLabel(task) {
  const value = taskWorkState(task);
  return value === 'working' ? 'WORKING' : value === 'ongoing' ? 'ONGOING' : value === 'closed' ? 'CLOSED' : 'TO DO';
}

function taskWorkStateRank(task) {
  const value = taskWorkState(task);
  return value === 'working' ? 0 : value === 'ongoing' ? 1 : value === 'todo' ? 2 : 3;
}

function localDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function taskUrgency(task, now = new Date()) {
  const base = { low: 12, medium: 32, high: 62, critical: 92 }[task.priority] || 32;
  const rank = { low: 0, medium: 1, high: 2, critical: 3 };
  const created = new Date(task.createdAt || now);
  const ageDays = Math.max(0, Math.floor((now - created) / 86400000));
  const ageRate = { low: .8, medium: 1.1, high: 1.4, critical: 1.8 }[task.priority] || 1;
  const ageBoost = Math.min(35, ageDays * ageRate);
  let dueBoost = 0;
  let overdueDays = 0;
  let dueLabel = 'No due date';
  if (task.dueDate) {
    const due = new Date(`${task.dueDate}T23:59:59`);
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);
    const days = Math.ceil((due - todayEnd) / 86400000);
    if (days < 0) { overdueDays = Math.abs(days); dueBoost = 40 + Math.min(40, overdueDays * 4); dueLabel = `${overdueDays}d overdue`; }
    else if (days === 0) { dueBoost = 35; dueLabel = 'Due today'; }
    else if (days === 1) { dueBoost = 25; dueLabel = 'Due tomorrow'; }
    else if (days <= 3) { dueBoost = 15; dueLabel = `Due in ${days}d`; }
    else if (days <= 7) { dueBoost = 7; dueLabel = `Due in ${days}d`; }
    else dueLabel = `Due ${task.dueDate}`;
  }
  const score = Math.round(base + ageBoost + dueBoost);
  const effective = score >= 120 ? 'critical' : score >= 80 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, effective, ageDays, overdueDays, dueLabel, boosted: rank[effective] > rank[task.priority] };
}

function taskAllocationById(allocationId) {
  return (state.taskAllocations || []).find((allocation) => allocation.id === String(allocationId || '')) || null;
}

function taskAllocationLabel(allocationId) {
  const allocation = taskAllocationById(allocationId);
  if (!allocation) return '';
  return `${allocation.type.toUpperCase()}: ${allocation.name}${allocation.reference ? ` (${allocation.reference})` : ''}`;
}

function defaultAllocationForGroup(desktopId) {
  if (!desktopId || desktopId === 'general') return '';
  const allocations = (state.taskAllocations || []).filter((allocation) => allocation.active !== false && (allocation.taskGroupId || 'general') === desktopId);
  if (!allocations.length) return '';
  const sorted = [...allocations].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return sorted[0].id;
}

function populateTaskAllocationSelect(select, selected = '') {
  if (!select) return;
  select.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = 'No allocation'; select.append(none);
  const allocations = [...(state.taskAllocations || [])].sort((a,b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  for (const allocation of allocations) {
    const option = document.createElement('option'); option.value = allocation.id;
    option.textContent = `${allocation.active ? '' : '[Paused] '}${allocation.type.toUpperCase()} · ${allocation.name}${allocation.reference ? ` · ${allocation.reference}` : ''}`;
    select.append(option);
  }
  select.value = taskAllocationById(selected) ? selected : '';
}

const DEFAULT_WEEKLY_BILLABLE_HOURS = 40;
const HEADER_CLOCK_SIZES = ['small', 'medium', 'large'];
const TEXT_SIZES = ['small', 'medium', 'large', 'monstrous'];
function normalizeWeeklyBillableHours(value) {
  const hours = Number(value);
  if (value === '' || value == null || !Number.isFinite(hours) || hours < 0) return DEFAULT_WEEKLY_BILLABLE_HOURS;
  return Math.min(168, Math.round(hours * 100) / 100);
}

function allocationDateBounds(allocation) {
  const start = allocation?.startDate ? new Date(`${allocation.startDate}T00:00:00`) : new Date(0);
  const end = allocation?.endDate ? new Date(`${allocation.endDate}T23:59:59.999`) : new Date(8640000000000000);
  return { start, end };
}

function recurringPeriodBounds(cadence, dateLike = new Date()) {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  let start, end;
  if (cadence === 'monthly') {
    start = new Date(safe.getFullYear(), safe.getMonth(), 1);
    end = new Date(safe.getFullYear(), safe.getMonth() + 1, 1); end.setMilliseconds(-1);
  } else if (cadence === 'quarterly') {
    const quarterMonth = Math.floor(safe.getMonth() / 3) * 3;
    start = new Date(safe.getFullYear(), quarterMonth, 1);
    end = new Date(safe.getFullYear(), quarterMonth + 3, 1); end.setMilliseconds(-1);
  } else {
    const mondayOffset = (safe.getDay() + 6) % 7;
    start = new Date(safe.getFullYear(), safe.getMonth(), safe.getDate()); start.setDate(start.getDate() - mondayOffset);
    end = new Date(start); end.setDate(end.getDate() + 7); end.setMilliseconds(-1);
  }
  return { start, end };
}

function clipAllocationBounds(allocation, bounds) {
  const window = allocationDateBounds(allocation);
  return { start: new Date(Math.max(window.start.getTime(), bounds.start.getTime())), end: new Date(Math.min(window.end.getTime(), bounds.end.getTime())) };
}

function allocationEntries(allocation, bounds = null) {
  if (!allocation) return [];
  const effective = bounds || allocationDateBounds(allocation);
  const rows = [];
  for (const task of (state.tasks || [])) {
    if (task.allocationId !== allocation.id) continue;
    for (const entry of (task.timeEntries || [])) {
      const when = new Date(entry.loggedAt);
      if (!Number.isFinite(when.getTime()) || when < effective.start || when > effective.end) continue;
      rows.push({ task, entry, when });
    }
  }
  return rows.sort((a,b) => b.when - a.when);
}

function allocationPeriodKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (!Number.isFinite(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function allocationCarryPeriods(allocation) {
  return new Set(Array.isArray(allocation?.carryOverPeriods) ? allocation.carryOverPeriods : []);
}

function allocationCadenceUnit(allocation) {
  if (allocation?.cadence === 'monthly') return 'month';
  if (allocation?.cadence === 'quarterly') return 'quarter';
  return 'week';
}

function recurringAllocationUsage(allocation, dateLike = new Date(), depth = 0) {
  const now = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  const base = recurringPeriodBounds(allocation.cadence, now);
  const bounds = clipAllocationBounds(allocation, base);
  const key = allocationPeriodKey(base.start);
  const valid = bounds.start <= bounds.end;
  const rows = valid ? allocationEntries(allocation, bounds) : [];
  const loggedMinutes = rows.reduce((sum, row) => sum + (Number(row.entry.minutes) || 0), 0);
  const baseBudgetMinutes = Math.round((Number(allocation.hours) || 0) * 60);
  let carryInMinutes = 0;
  const carryPeriods = allocationCarryPeriods(allocation);
  if (depth < 160) {
    const previousMoment = new Date(base.start.getTime() - 1);
    const previousBase = recurringPeriodBounds(allocation.cadence, previousMoment);
    const previousKey = allocationPeriodKey(previousBase.start);
    const previousClipped = clipAllocationBounds(allocation, previousBase);
    if (previousClipped.start <= previousClipped.end && carryPeriods.has(previousKey)) {
      const previousUsage = recurringAllocationUsage(allocation, previousMoment, depth + 1);
      const previousOver = Math.max(0, previousUsage.loggedMinutes - previousUsage.budgetMinutes);
      carryInMinutes = Math.min(baseBudgetMinutes, previousOver);
    }
  }
  const budgetMinutes = Math.max(0, baseBudgetMinutes - carryInMinutes);
  const remainingMinutes = budgetMinutes - loggedMinutes;
  const overMinutes = Math.max(0, -remainingMinutes);
  const carryEnabled = carryPeriods.has(key);
  const carryOutMinutes = carryEnabled ? Math.min(baseBudgetMinutes, overMinutes) : 0;
  return { key, base, bounds, rows, loggedMinutes, baseBudgetMinutes, budgetMinutes, carryInMinutes, carryOutMinutes, carryEnabled, remainingMinutes, overMinutes, valid };
}

function allocationUsage(allocation, dateLike = new Date()) {
  if (allocation.mode === 'recurring') return recurringAllocationUsage(allocation, dateLike);
  const bounds = allocationDateBounds(allocation);
  const valid = bounds.start <= bounds.end;
  const rows = valid ? allocationEntries(allocation, bounds) : [];
  const loggedMinutes = rows.reduce((sum, row) => sum + (Number(row.entry.minutes) || 0), 0);
  const budgetMinutes = allocation.mode === 'unlimited' ? null : Math.round((Number(allocation.hours) || 0) * 60);
  const remainingMinutes = budgetMinutes == null ? null : budgetMinutes - loggedMinutes;
  return { key: 'total', bounds, rows, loggedMinutes, baseBudgetMinutes: budgetMinutes, budgetMinutes, carryInMinutes: 0, carryOutMinutes: 0, carryEnabled: false, remainingMinutes, overMinutes: Math.max(0, -(remainingMinutes || 0)), valid };
}

function allocationNextRecurringUsage(allocation, usage = allocationUsage(allocation)) {
  if (allocation.mode !== 'recurring' || !usage?.base) return null;
  const nextMoment = new Date(usage.base.end.getTime() + 1);
  const next = allocationUsage(allocation, nextMoment);
  return next.valid ? next : null;
}

function allocationPeriodLabel(allocation, bounds) {
  if (allocation.mode !== 'recurring') {
    if (!allocation.startDate && !allocation.endDate) return 'Open ended';
    if (allocation.startDate && allocation.endDate) return `${new Date(`${allocation.startDate}T00:00:00`).toLocaleDateString()} – ${new Date(`${allocation.endDate}T00:00:00`).toLocaleDateString()}`;
    if (allocation.startDate) return `From ${new Date(`${allocation.startDate}T00:00:00`).toLocaleDateString()}`;
    return `Through ${new Date(`${allocation.endDate}T00:00:00`).toLocaleDateString()}`;
  }
  if (!bounds || bounds.start > bounds.end) return 'Outside allocation dates';
  return `${bounds.start.toLocaleDateString()} – ${bounds.end.toLocaleDateString()}`;
}

function allocationHistoryPeriods(allocation) {
  if (allocation.mode !== 'recurring') {
    const usage = allocationUsage(allocation);
    return [{ key: 'total', label: allocationPeriodLabel(allocation, usage.bounds), ...usage }];
  }
  const candidateDates = [];
  const now = new Date();
  const window = allocationDateBounds(allocation);
  const rangeEnd = new Date(Math.min(now.getTime(), window.end.getTime()));
  if (allocation.startDate && window.start <= rangeEnd) {
    let cursor = new Date(window.start);
    let guard = 0;
    while (cursor <= rangeEnd && guard < 160) {
      candidateDates.push(new Date(cursor));
      if (allocation.cadence === 'monthly') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      else if (allocation.cadence === 'quarterly') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
      else { cursor.setDate(cursor.getDate() + 7); }
      guard++;
    }
  }
  candidateDates.push(now);
  for (const row of allocationEntries(allocation)) candidateDates.push(row.when);
  const periods = new Map();
  for (const date of candidateDates) {
    const usage = allocationUsage(allocation, date);
    if (!usage.valid || periods.has(usage.key)) continue;
    periods.set(usage.key, { ...usage, label: allocationPeriodLabel(allocation, usage.bounds) });
  }
  return [...periods.values()].sort((a,b)=>b.bounds.start-a.bounds.start);
}

function allocationTaskBreakdown(rows) {
  const totals = new Map();
  for (const row of rows || []) totals.set(row.task.title, (totals.get(row.task.title) || 0) + (Number(row.entry.minutes) || 0));
  return [...totals.entries()].sort((a,b)=>b[1]-a[1]).map(([title,minutes])=>`${title}: ${formatTaskMinutes(minutes)}`).join(' · ');
}

function allocationModeLabel(allocation) {
  if (allocation.mode === 'unlimited') return 'Open bucket';
  if (allocation.mode === 'total') return `${allocation.hours} h total`;
  return `${allocation.hours} h ${allocation.cadence}`;
}

function activeDesktopAllocationSummary(desktopId = state.activeDesktopId) {
  const allocations = (state.taskAllocations || []).filter((allocation) => allocation.active !== false && (allocation.taskGroupId || 'general') === desktopId);
  let budgetMinutes = 0;
  let loggedMinutes = 0;
  let finiteLoggedMinutes = 0;
  let finiteCount = 0;
  let openBucketCount = 0;
  for (const allocation of allocations) {
    const usage = allocationUsage(allocation);
    const used = Math.max(0, Number(usage.loggedMinutes) || 0);
    loggedMinutes += used;
    if (usage.budgetMinutes == null) openBucketCount += 1;
    else { budgetMinutes += Math.max(0, Number(usage.budgetMinutes) || 0); finiteLoggedMinutes += used; finiteCount += 1; }
  }
  const remainingMinutes = budgetMinutes - finiteLoggedMinutes;
  return { allocations, budgetMinutes, loggedMinutes, finiteLoggedMinutes, remainingMinutes, finiteCount, openBucketCount };
}

function openTasks(groupFilter = 'all') {
  return (state.tasks || []).filter((task) => task.status === 'open' && (groupFilter === 'all' || task.taskGroupId === groupFilter)).sort((a,b) => {
    const stateDelta = taskWorkStateRank(a) - taskWorkStateRank(b);
    if (stateDelta) return stateDelta;
    const ua = taskUrgency(a), ub = taskUrgency(b);
    return (ub.score - ua.score) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

function recommendedTasks(groupFilter = 'all', limit = 5) {
  return openTasks(groupFilter).filter((task) => taskWorkState(task) === 'todo').slice(0, Math.max(1, limit));
}

function recommendedTask(groupFilter = 'all') { return recommendedTasks(groupFilter, 1)[0] || null; }

function taskLoggedMinutes(task) {
  return (Array.isArray(task?.timeEntries) ? task.timeEntries : []).reduce((sum, entry) => sum + Math.max(0, Number.parseInt(entry?.minutes, 10) || 0), 0);
}

function syncTaskLoggedMinutes(task) {
  if (!task) return 0;
  task.minutesSpent = Math.max(0, Math.min(1000000, taskLoggedMinutes(task)));
  return task.minutesSpent;
}

function localDateInputValue(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateWithSelectedWorkDay(dateValue, timeSource = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  const source = timeSource instanceof Date ? timeSource : new Date(timeSource);
  const safeSource = Number.isFinite(source.getTime()) ? source : new Date();
  if (!match) return safeSource;
  const candidate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), safeSource.getHours(), safeSource.getMinutes(), safeSource.getSeconds(), safeSource.getMilliseconds());
  return Number.isFinite(candidate.getTime()) ? candidate : safeSource;
}

function appendTaskTimeEntry(task, minutes, details = '', loggedAt = new Date()) {
  if (!task) return null;
  const normalizedMinutes = Math.max(0, Math.min(100000, Math.round(Number(minutes) || 0)));
  if (!normalizedMinutes) return null;
  task.timeEntries ||= [];
  const when = loggedAt instanceof Date ? loggedAt : new Date(loggedAt);
  const entry = { id: uid('time'), minutes: normalizedMinutes, details: String(details || '').trim().slice(0, 1200), loggedAt: Number.isFinite(when.getTime()) ? when.toISOString() : new Date().toISOString() };
  task.timeEntries.push(entry);
  syncTaskLoggedMinutes(task);
  task.updatedAt = new Date().toISOString();
  return entry;
}

async function deleteTaskTimeEntry(taskId, entryId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  const entry = (task?.timeEntries || []).find((item) => item.id === String(entryId));
  if (!task || !entry) return;
  const when = new Date(entry.loggedAt);
  const label = `${formatTaskMinutes(entry.minutes)} on ${when.toLocaleDateString()}`;
  if (!confirm(`Delete this time entry (${label})?`)) return;
  task.timeEntries = (task.timeEntries || []).filter((item) => item.id !== entry.id);
  syncTaskLoggedMinutes(task);
  task.updatedAt = new Date().toISOString();
  await saveState();
  render();
  if (taskTimeHistoryDialog.open) renderTaskTimeHistoryList(task);
  toast('Time entry deleted.');
}

async function setTaskWorkState(taskId, nextState) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task || task.status === 'done' || !TASK_WORK_STATES.includes(nextState)) return;
  task.workState = nextState;
  task.working = nextState === 'working';
  task.workingSince = task.working ? new Date().toISOString() : '';
  task.updatedAt = new Date().toISOString();
  await saveState();
  render();
  toast(`${taskStatusLabel(task)}: ${task.title}`);
}

async function setTaskWorking(taskId, working) {
  return setTaskWorkState(taskId, working ? 'working' : 'todo');
}

function renderGeneralNotesSection(query = '') {
  const section = document.createElement('section');
  section.className = 'general-notes-section';
  const head = document.createElement('div'); head.className = 'general-notes-head';
  const copy = document.createElement('div');
  const title = document.createElement('h2'); title.textContent = 'General Notes';
  const allGeneral = (state.notes || []).filter((note) => note.general);
  const subtitle = document.createElement('p'); subtitle.textContent = `${allGeneral.length} note${allGeneral.length === 1 ? '' : 's'} available from every Tab`;
  copy.append(title, subtitle);
  const add = createButton('+ Note', 'btn btn-note compact', 'add-general-note', 'Add a General Note');
  head.append(copy, add);
  const grid = document.createElement('div'); grid.className = 'general-notes-grid';
  const notes = rootGeneralNotes().filter((note) => noteBranchMatches(note, query));
  if (notes.length) for (const note of notes) grid.append(renderNote(note, query, 0));
  else { const empty = document.createElement('div'); empty.className = 'general-notes-empty'; empty.textContent = query ? 'No General Notes match this search.' : 'Keep quick information here so it is available no matter which Tab you are using.'; grid.append(empty); }
  section.append(head, grid);
  return section;
}


function reminderMatches(reminder, query = '') {
  const q = String(query || '').trim().toLowerCase();
  const linkedTask = reminder.linkedTaskId ? (state.tasks || []).find((task) => task.id === reminder.linkedTaskId) : null;
  return !q || `${reminder.title} ${reminder.details || ''} ${linkedTask?.title || ''} ${MeshTabReminders.recurrenceLabel(reminder)}`.toLowerCase().includes(q);
}

function linkedTaskForReminder(reminder) {
  return reminder?.linkedTaskId ? (state.tasks || []).find((task) => task.id === reminder.linkedTaskId) || null : null;
}

function linkedRemindersForTask(taskId) {
  return (state.reminders || []).filter((reminder) => reminder.linkedTaskId === String(taskId));
}

function populateReminderTaskSelect(select, selectedTaskId = '') {
  if (!select) return;
  select.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = 'No linked task'; select.append(none);
  const sorted = [...(state.tasks || [])].sort((a,b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  for (const task of sorted) {
    const option = document.createElement('option');
    option.value = task.id;
    option.textContent = `${task.status === 'done' ? '✓ ' : ''}${task.title} — ${taskGroupLabel(task.taskGroupId)}`;
    select.append(option);
  }
  select.value = sorted.some((task) => task.id === selectedTaskId) ? selectedTaskId : '';
}

function activeReminderCount() {
  const now = Date.now();
  return (state.reminders || []).filter((reminder) => {
    const snooze = reminder.snoozedUntil ? Date.parse(reminder.snoozedUntil) : NaN;
    return (Number.isFinite(snooze) && snooze > now) || MeshTabReminders.effectiveNextOccurrence(reminder, now) != null;
  }).length;
}

function reminderDateTimeLabel(when, includeDate = true) {
  const date = new Date(when);
  const options = includeDate ? { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' } : { hour:'numeric', minute:'2-digit' };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function reminderCountdownLabel(when, now = Date.now()) {
  const diff = Number(when) - now;
  if (!Number.isFinite(diff)) return '';
  if (diff <= 0 && diff > -60000) return 'due now';
  if (diff < 0) return 'elapsed';
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours < 24) return `in ${hours}h${remain ? ` ${remain}m` : ''}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `in ${days}d${remainingHours ? ` ${remainingHours}h` : ''}`;
}

function updateReminderCountdowns() {
  document.querySelectorAll('[data-reminder-countdown]').forEach((element) => {
    const when = Number(element.dataset.reminderCountdown);
    element.textContent = reminderCountdownLabel(when);
  });
}

function startReminderCountdowns() {
  if (reminderCountdownTimer) clearInterval(reminderCountdownTimer);
  reminderCountdownTimer = null;
  if (state?.settings?.activeView !== 'reminders') return;
  updateReminderCountdowns();
  reminderCountdownTimer = setInterval(updateReminderCountdowns, 1000);
}

function makeReminderSnoozeControls(reminder) {
  const wrap = document.createElement('div'); wrap.className = 'reminder-snooze-controls';
  const select = document.createElement('select'); select.className = 'reminder-snooze-select'; select.setAttribute('aria-label', `Snooze ${reminder.title}`);
  const choices = [['10m','10 min'],['15m','15 min'],['30m','30 min'],['bottom','Bottom of hour'],['top','Top of hour'],['1h','1 hour']];
  for (const [value,label] of choices) { const option=document.createElement('option'); option.value=value; option.textContent=label; select.append(option); }
  const button = createButton('Snooze', 'btn btn-secondary compact', 'snooze-reminder', `Snooze ${reminder.title}`); button.dataset.reminderId = reminder.id;
  wrap.append(select, button); return wrap;
}

function makeReminderRow(reminder, when = null, options = {}) {
  const row = document.createElement('article'); row.className = `reminder-row${options.inactive ? ' inactive' : ''}`; row.dataset.reminderId = reminder.id;
  const icon = document.createElement('div'); icon.className = 'reminder-clock'; icon.textContent = '◷';
  const main = document.createElement('div'); main.className = 'reminder-main';
  const titleLine = document.createElement('div'); titleLine.className = 'reminder-title-line';
  const title = document.createElement('strong'); title.textContent = reminder.title;
  const recurrence = document.createElement('span'); recurrence.className = 'reminder-badge'; recurrence.textContent = reminder.scheduleType === 'once' ? 'one time' : 'recurring';
  titleLine.append(title, recurrence);
  const meta = document.createElement('span'); meta.className = 'reminder-meta';
  const snoozed = reminder.snoozedUntil && Number.isFinite(Date.parse(reminder.snoozedUntil)) && Date.parse(reminder.snoozedUntil) > Date.now();
  const scheduleLabel = reminder.scheduleType === 'once'
    ? 'One time'
    : reminder.scheduleType === 'daily'
      ? 'Daily'
      : (reminder.days || []).map((day) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).join(', ');
  meta.textContent = `${scheduleLabel}${snoozed ? ' · snoozed' : ''}`;
  main.append(titleLine, meta);
  if (reminder.details) { const details=document.createElement('p'); details.textContent=reminder.details; main.append(details); }
  const linkedTask = linkedTaskForReminder(reminder);
  if (linkedTask) {
    const taskLink = document.createElement('button');
    taskLink.type = 'button'; taskLink.className = 'reminder-linked-task'; taskLink.dataset.action = 'open-linked-task'; taskLink.dataset.taskId = linkedTask.id;
    const tag = document.createElement('span'); tag.textContent = 'TASK';
    const taskTitle = document.createElement('strong'); taskTitle.textContent = linkedTask.title;
    const stateLabel = document.createElement('small'); stateLabel.textContent = linkedTask.status === 'done' ? 'completed' : taskGroupLabel(linkedTask.taskGroupId);
    taskLink.append(tag, taskTitle, stateLabel); main.append(taskLink);
  }
  const timing = document.createElement('div'); timing.className = 'reminder-timing';
  if (when != null) {
    const time = document.createElement('strong'); time.textContent = reminderDateTimeLabel(when, true);
    const countdown = document.createElement('span'); countdown.dataset.reminderCountdown = String(when); countdown.textContent = reminderCountdownLabel(when);
    timing.append(time, countdown);
  } else {
    const status = document.createElement('strong'); status.textContent = reminder.enabled ? 'No upcoming time' : 'Inactive'; timing.append(status);
  }
  const actions = document.createElement('div'); actions.className = 'reminder-actions';
  if (!options.inactive && when != null) actions.append(makeReminderSnoozeControls(reminder));
  const edit = createButton('Edit', 'btn btn-ghost compact', 'edit-reminder', `Edit ${reminder.title}`); edit.dataset.reminderId = reminder.id;
  const toggle = createButton(reminder.enabled ? 'Pause' : 'Enable', 'btn btn-ghost compact', 'toggle-reminder-enabled', `${reminder.enabled ? 'Pause' : 'Enable'} ${reminder.title}`); toggle.dataset.reminderId = reminder.id;
  const remove = createButton('Delete', 'btn btn-ghost compact danger-text', 'delete-reminder', `Delete ${reminder.title}`); remove.dataset.reminderId = reminder.id;
  actions.append(edit, toggle, remove);
  row.append(icon, main, timing, actions); return row;
}

function reminderUpcomingEntries(query = '') {
  const now = Date.now();
  return (state.reminders || []).filter((reminder) => reminderMatches(reminder, query)).map((reminder) => ({ reminder, when: MeshTabReminders.effectiveNextOccurrence(reminder, now) })).filter((item) => item.when != null).sort((a,b)=>a.when-b.when);
}

function renderReminderCenter(query = '') {
  const section = document.createElement('section'); section.className = 'reminders-center';
  const now = new Date();
  const reminders = (state.reminders || []).filter((reminder) => reminderMatches(reminder, query));
  const upcoming = reminderUpcomingEntries(query);
  const recurringCount = reminders.filter((reminder) => reminder.enabled && reminder.scheduleType !== 'once').length;

  const head = document.createElement('div'); head.className = 'reminders-head';
  const copy = document.createElement('div');
  const kicker = document.createElement('p'); kicker.className = 'section-kicker'; kicker.textContent = 'REMINDER CENTER';
  const title = document.createElement('h2'); title.textContent = 'Reminders';
  const subtitle = document.createElement('p'); subtitle.textContent = `${reminders.length} total · ${upcoming.length} upcoming · ${recurringCount} recurring`;
  copy.append(kicker, title, subtitle);
  const headActions = document.createElement('div'); headActions.className = 'reminders-head-actions';
  const viewToggle = document.createElement('div'); viewToggle.className = 'reminder-view-toggle';
  for (const mode of REMINDER_VIEW_MODES) { const button=createButton(mode === 'day' ? 'Daily' : 'Weekly', `btn btn-ghost compact${state.settings.reminderView===mode?' active':''}`, 'reminder-view', `${mode} reminder view`); button.dataset.mode=mode; viewToggle.append(button); }
  const add = createButton('+ Reminder', 'btn btn-reminder compact', 'add-reminder', 'Add reminder');
  headActions.append(viewToggle, add); head.append(copy, headActions); section.append(head);

  const nextCard = document.createElement('div'); nextCard.className = 'reminder-next-card';
  if (upcoming[0]) {
    const { reminder, when } = upcoming[0];
    const label = document.createElement('small'); label.textContent = 'NEXT REMINDER';
    const nextTitle = document.createElement('strong'); nextTitle.textContent = reminder.title;
    const nextMeta = document.createElement('span'); nextMeta.textContent = MeshTabReminders.recurrenceLabel(reminder);
    const timing = document.createElement('div'); timing.className = 'reminder-next-timing';
    const dateTime = document.createElement('strong'); dateTime.textContent = reminderDateTimeLabel(when, true);
    const countdown = document.createElement('span'); countdown.dataset.reminderCountdown = String(when); countdown.textContent = reminderCountdownLabel(when);
    timing.append(dateTime, countdown);
    nextCard.append(label, nextTitle, nextMeta, timing);
  } else { nextCard.classList.add('empty'); nextCard.innerHTML = '<small>NEXT REMINDER</small><strong>Nothing scheduled</strong><span>Add a reminder when you need MeshTab to bring something back to your attention.</span>'; }
  section.append(nextCard);

  const schedule = document.createElement('div'); schedule.className = 'reminder-schedule';
  const mode = state.settings.reminderView || 'day';
  const start = Date.now();
  const end = mode === 'day'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999).getTime()
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23,59,59,999).getTime();
  const occurrences = [];
  for (const reminder of reminders) {
    for (const occurrence of MeshTabReminders.occurrencesBetween(reminder, start, end, mode === 'day' ? 3 : 10)) occurrences.push({ reminder, ...occurrence });
  }
  occurrences.sort((a,b)=>a.when-b.when);

  if (!occurrences.length) {
    const empty = document.createElement('div'); empty.className='reminder-empty'; empty.textContent = mode === 'day' ? 'No more reminders scheduled for today.' : 'No reminders scheduled in the next seven days.'; schedule.append(empty);
  } else {
    const grouped = new Map();
    for (const item of occurrences) { const key=MeshTabReminders.localDateKey(new Date(item.when)); if(!grouped.has(key))grouped.set(key,[]); grouped.get(key).push(item); }
    for (const [key, items] of grouped) {
      const group = document.createElement('section'); group.className='reminder-day-group';
      const heading = document.createElement('h3'); const date=new Date(`${key}T12:00:00`); heading.textContent = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(date); group.append(heading);
      for (const item of items) group.append(makeReminderRow(item.reminder, item.when, { includeDate:false }));
      schedule.append(group);
    }
  }
  section.append(schedule);

  if (mode === 'day') {
    const later = upcoming.filter((item) => item.when > end).slice(0,8);
    if (later.length) {
      const laterSection=document.createElement('section'); laterSection.className='reminder-later'; const h=document.createElement('h3'); h.textContent='Coming up after today'; laterSection.append(h);
      for (const item of later) laterSection.append(makeReminderRow(item.reminder,item.when,{includeDate:true})); section.append(laterSection);
    }
  }

  const inactive = reminders.filter((reminder) => MeshTabReminders.effectiveNextOccurrence(reminder, Date.now()) == null);
  if (inactive.length) {
    const inactiveSection=document.createElement('section'); inactiveSection.className='reminder-inactive'; const h=document.createElement('h3'); h.textContent=`Inactive / completed (${inactive.length})`; inactiveSection.append(h);
    for (const reminder of inactive) inactiveSection.append(makeReminderRow(reminder,null,{inactive:true})); section.append(inactiveSection);
  }
  return section;
}

function setReminderDialogScheduleFields() {
  const type = $('#reminderScheduleType').value;
  $('#reminderDateWrap').classList.toggle('hidden', type !== 'once');
  $('#reminderDaysWrap').classList.toggle('hidden', type !== 'selected-days');
}

function openReminderDialog(reminderId = null, defaults = {}) {
  editingReminderId = reminderId ? String(reminderId) : null;
  const reminder = editingReminderId ? (state.reminders || []).find((item) => item.id === editingReminderId) : null;
  const defaultWhen = defaults.when instanceof Date ? defaults.when : new Date(Date.now() + 10 * 60000);
  $('#reminderDialogTitle').textContent = reminder ? 'Edit reminder' : (defaults.linkedTaskId ? 'Quick reminder for task' : 'Create a reminder');
  $('#reminderSubmitBtn').textContent = reminder ? 'Save changes' : 'Create reminder';
  $('#reminderTitle').value = reminder?.title || defaults.title || '';
  $('#reminderDetails').value = reminder?.details || defaults.details || '';
  populateReminderTaskSelect($('#reminderLinkedTask'), reminder?.linkedTaskId || defaults.linkedTaskId || '');
  $('#reminderScheduleType').value = reminder?.scheduleType || defaults.scheduleType || 'once';
  $('#reminderDate').value = reminder?.date || defaults.date || MeshTabReminders.localDateKey(defaultWhen);
  $('#reminderTime').value = reminder?.time || defaults.time || `${String(defaultWhen.getHours()).padStart(2,'0')}:${String(defaultWhen.getMinutes()).padStart(2,'0')}`;
  $('#reminderEnabled').checked = reminder?.enabled !== false;
  const days = new Set(reminder?.days || MeshTabReminders.DEFAULT_DAYS);
  document.querySelectorAll('#reminderDaysWrap input[type="checkbox"]').forEach((input) => { input.checked = days.has(Number(input.value)); });
  setReminderDialogScheduleFields();
  if (!reminderDialog.open) reminderDialog.showModal();
  setTimeout(() => $('#reminderTitle').focus(), 0);
}

function openTaskQuickReminder(taskId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  const details = task.details ? `Task context: ${task.details}` : `Reminder for task: ${task.title}`;
  openReminderDialog(null, {
    linkedTaskId: task.id,
    title: task.title,
    details,
    scheduleType: 'once'
  });
}

async function handleReminderSubmit(event) {
  event.preventDefault();
  const title = $('#reminderTitle').value.trim();
  if (!title) return;
  const scheduleType = $('#reminderScheduleType').value;
  const time = $('#reminderTime').value;
  const date = $('#reminderDate').value;
  const days = Array.from(document.querySelectorAll('#reminderDaysWrap input[type="checkbox"]:checked')).map((input) => Number(input.value));
  if (scheduleType === 'once' && !date) { toast('Choose a date for this reminder.'); return; }
  if (scheduleType === 'selected-days' && !days.length) { toast('Choose at least one recurring day.'); return; }
  const existing = editingReminderId ? (state.reminders || []).find((item) => item.id === editingReminderId) : null;
  const now = new Date().toISOString();
  const candidate = MeshTabReminders.normalizeReminder({
    ...(existing || {}),
    id: existing?.id || uid('reminder'), title, details: $('#reminderDetails').value.trim(), linkedTaskId: $('#reminderLinkedTask').value || '', scheduleType, date, time, days,
    enabled: $('#reminderEnabled').checked, createdAt: existing?.createdAt || now, updatedAt: now,
    snoozedUntil: existing?.snoozedUntil || '', lastTriggeredAt: existing?.lastTriggeredAt || ''
  });
  if (scheduleType === 'once' && candidate.enabled) {
    const when = MeshTabReminders.localDateTime(candidate.date, candidate.time);
    if (!Number.isFinite(when) || when <= Date.now()) { toast('Choose a future date and time for a one-time reminder.'); return; }
    candidate.lastTriggeredAt = '';
  }
  state.reminders ||= [];
  if (existing) Object.assign(existing, candidate); else state.reminders.push(candidate);
  await saveState();
  reminderDialog.close();
  render();
  toast(existing ? 'Reminder updated.' : 'Reminder scheduled.');
}

async function snoozeReminderFromUi(reminderId, option) {
  const reminder = (state.reminders || []).find((item) => item.id === String(reminderId));
  if (!reminder) return;
  const when = MeshTabReminders.snoozeTarget(option, Date.now());
  reminder.snoozedUntil = new Date(when).toISOString();
  reminder.updatedAt = new Date().toISOString();
  await saveState();
  render();
  toast(`Snoozed until ${reminderDateTimeLabel(when, true)}.`);
}

function renderNextTaskStrip() {
  const task = recommendedTask();
  if (!task) return null;
  const urgency = taskUrgency(task);
  const strip = document.createElement('section'); strip.className = 'next-task-strip';
  const copy = document.createElement('div'); copy.className = 'next-task-copy';
  const title = document.createElement('strong'); title.textContent = `Next Task: ${task.title}`;
  const meta = document.createElement('span'); meta.textContent = `${taskGroupLabel(task.taskGroupId)} · ${task.priority} priority · ${urgency.dueLabel}`;
  copy.append(title, meta);
  const score = document.createElement('span'); score.className = 'next-task-score'; score.textContent = urgency.boosted ? `${urgency.effective} now` : urgency.effective;
  const view = createButton('Tasks', 'btn btn-secondary compact', 'open-task-center', 'Open Task Center');
  strip.append(copy, score, view);
  return strip;
}

function validTaskGroupFilter(value = 'all') {
  const filter = String(value || 'all');
  return filter === 'all' || filter === 'general' || state.desktops.some((desktop) => desktop.id === filter) ? filter : 'all';
}

function populateTaskGroupSelect(select, includeAll = false, selected = null) {
  if (!select) return;
  const current = selected == null ? select.value : String(selected);
  select.replaceChildren();
  if (includeAll) { const all = document.createElement('option'); all.value='all'; all.textContent='All Tasks'; select.append(all); }
  const general = document.createElement('option'); general.value='general'; general.textContent='General Tasks'; select.append(general);
  for (const desktop of state.desktops) { const option=document.createElement('option'); option.value=desktop.id; option.textContent=`Tab — ${desktop.title}`; select.append(option); }
  const desired = includeAll ? validTaskGroupFilter(current || 'all') : current;
  if (Array.from(select.options).some((option) => option.value === desired)) select.value = desired;
}

function openTaskDialog(taskId = null, defaultGroupId = state.activeDesktopId) {
  editingTaskId = taskId ? String(taskId) : null;
  const task = editingTaskId ? (state.tasks || []).find((item) => item.id === editingTaskId) : null;
  populateTaskGroupSelect($('#taskGroup'));
  $('#taskDialogTitle').textContent = task ? 'Edit task' : 'Create a task';
  $('#taskSubmitBtn').textContent = task ? 'Save changes' : 'Create task';
  $('#taskTitle').value = task?.title || '';
  $('#taskDetails').value = task?.details || '';
  $('#taskPriority').value = task?.priority || 'medium';
  $('#taskWorkState').value = task ? taskWorkState(task) : 'todo';
  $('#taskDueDate').value = task?.dueDate || '';
  const resolvedGroupId = task?.taskGroupId || (state.desktops.some((d)=>d.id===defaultGroupId) ? defaultGroupId : 'general');
  $('#taskGroup').value = resolvedGroupId;
  const defaultAllocationId = task ? (task.allocationId || '') : defaultAllocationForGroup(resolvedGroupId);
  populateTaskAllocationSelect($('#taskAllocation'), defaultAllocationId);
  if (!taskDialog.open) taskDialog.showModal();
  setTimeout(() => $('#taskTitle').focus(), 0);
}

function renderTaskTimeEntries(task, listElement, summaryElement = null) {
  if (!listElement) return;
  const entries = [...(task?.timeEntries || [])].sort((a,b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  const total = syncTaskLoggedMinutes(task);
  if (summaryElement) summaryElement.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · ${formatTaskMinutes(total)} total`;
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'task-time-empty'; empty.textContent = 'No time has been logged yet.'; listElement.replaceChildren(empty); return;
  }
  const rows = entries.map((entry) => {
    const row = document.createElement('div'); row.className = 'task-time-history-row';
    const when = new Date(entry.loggedAt);
    const stamp = document.createElement('div'); stamp.className = 'task-time-stamp';
    const date = document.createElement('strong'); date.textContent = when.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const time = document.createElement('span'); time.textContent = when.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
    stamp.append(date, time);
    const duration = document.createElement('strong'); duration.className = 'task-time-duration'; duration.textContent = formatTaskMinutes(entry.minutes);
    const details = document.createElement('span'); details.className = 'task-time-details'; details.textContent = entry.details || 'No details';
    row.append(stamp, duration, details); return row;
  });
  listElement.replaceChildren(...rows);
}

function renderTaskTimeHistoryList(task) {
  const list = $('#taskTimeHistoryList');
  const summary = $('#taskTimeHistoryViewSummary');
  if (!list) return;
  const entries = [...(task?.timeEntries || [])].sort((a,b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  const total = syncTaskLoggedMinutes(task);
  if (summary) summary.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · ${formatTaskMinutes(total)} total`;
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'task-time-empty'; empty.textContent = 'No time has been logged for this task yet.';
    list.replaceChildren(empty); return;
  }
  const rows = entries.map((entry) => {
    const when = new Date(entry.loggedAt);
    const row = document.createElement('div'); row.className = 'task-time-list-row';
    const date = document.createElement('strong'); date.className = 'task-time-list-date'; date.textContent = when.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const time = document.createElement('span'); time.className = 'task-time-list-time'; time.textContent = when.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
    const duration = document.createElement('strong'); duration.className = 'task-time-list-duration'; duration.textContent = formatTaskMinutes(entry.minutes);
    const details = document.createElement('span'); details.className = 'task-time-list-details'; details.textContent = entry.details || 'No details';
    const actions = document.createElement('div'); actions.className = 'task-time-list-actions';
    const edit = createButton('Edit', 'btn btn-ghost compact', 'edit-task-time-entry', 'Edit this time entry'); edit.dataset.entryId = entry.id;
    const del = createButton('Delete', 'btn btn-ghost compact danger-text', 'delete-task-time-entry', 'Delete this time entry'); del.dataset.entryId = entry.id;
    actions.append(edit, del);
    row.append(date, time, duration, details, actions); return row;
  });
  list.replaceChildren(...rows);
}

function openTaskTimeHistory(taskId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  viewingTaskTimeId = task.id;
  $('#taskTimeHistoryTitle').textContent = `Time history: ${task.title}`;
  renderTaskTimeHistoryList(task);
  if (!taskTimeHistoryDialog.open) taskTimeHistoryDialog.showModal();
}

function taskNotesFor(task) {
  return [...(Array.isArray(task?.taskNotes) ? task.taskNotes : [])].sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function renderTaskNotesDialog(task) {
  const list = $('#taskNotesList');
  const summary = $('#taskNotesSummary');
  if (!list || !task) return;
  const notes = taskNotesFor(task);
  if (summary) summary.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
  if (!notes.length) {
    const empty = document.createElement('div'); empty.className = 'task-notes-empty'; empty.textContent = 'No notes yet. Add a note for decisions, research, status updates, handoffs, or anything else tied to this task.';
    list.replaceChildren(empty); return;
  }
  const cards = notes.map((note) => {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'task-note-card'; card.dataset.action = 'open-task-note'; card.dataset.noteId = note.id;
    const head = document.createElement('div'); head.className = 'task-note-card-head';
    const title = document.createElement('strong'); title.textContent = note.title || 'Task note';
    const when = new Date(note.updatedAt || note.createdAt); const stamp = document.createElement('span'); stamp.textContent = `Updated ${when.toLocaleDateString()} ${when.toLocaleTimeString(undefined, {hour:'numeric',minute:'2-digit'})}`;
    head.append(title, stamp);
    const preview = document.createElement('div'); preview.className = 'task-note-preview'; preview.textContent = note.body || 'No note details.';
    const more = document.createElement('span'); more.className = 'task-note-open-hint'; more.textContent = 'Open note →';
    card.append(head, preview, more); return card;
  });
  list.replaceChildren(...cards);
}

function openTaskNotes(taskId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  viewingTaskNotesId = task.id;
  $('#taskNotesTitle').textContent = `Notes: ${task.title}`;
  renderTaskNotesDialog(task);
  if (!taskNotesDialog.open) taskNotesDialog.showModal();
}

function openTaskNoteEditor(taskId, noteId = null) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  viewingTaskNotesId = task.id;
  editingTaskNoteId = noteId ? String(noteId) : null;
  const note = editingTaskNoteId ? (task.taskNotes || []).find((item) => item.id === editingTaskNoteId) : null;
  $('#taskNoteDialogTitle').textContent = note ? 'Task note details' : 'Add task note';
  $('#taskNoteTitle').value = note?.title || '';
  $('#taskNoteBody').value = note?.body || '';
  $('#taskNoteSubmitBtn').textContent = note ? 'Save note' : 'Add note';
  $('#taskNoteDeleteBtn').hidden = !note;
  const meta = $('#taskNoteMeta');
  if (note) {
    const created = new Date(note.createdAt); const updated = new Date(note.updatedAt || note.createdAt);
    meta.textContent = `Created ${created.toLocaleDateString()} ${created.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})} · Updated ${updated.toLocaleDateString()} ${updated.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`;
  } else meta.textContent = 'Create a detailed note connected only to this task.';
  if (!taskNoteDialog.open) taskNoteDialog.showModal();
  setTimeout(() => (note ? $('#taskNoteBody') : $('#taskNoteTitle')).focus(), 0);
}

async function handleTaskNoteSubmit(event) {
  event.preventDefault();
  const task = (state.tasks || []).find((item) => item.id === viewingTaskNotesId); if (!task) return;
  const title = $('#taskNoteTitle').value.trim(); const body = $('#taskNoteBody').value.trim();
  if (!title && !body) { toast('Add a title or note details.'); return; }
  task.taskNotes ||= [];
  const now = new Date().toISOString();
  if (editingTaskNoteId) {
    const note = task.taskNotes.find((item) => item.id === editingTaskNoteId); if (!note) return;
    note.title = (title.slice(0,160) || 'Task note'); note.body = body.slice(0,12000); note.updatedAt = now;
  } else {
    task.taskNotes.push({ id: uid('task-note'), title: (title.slice(0,160) || `Note ${task.taskNotes.length + 1}`), body: body.slice(0,12000), createdAt: now, updatedAt: now });
  }
  task.updatedAt = now;
  await saveState();
  taskNoteDialog.close(); editingTaskNoteId = null;
  render();
  if (taskNotesDialog.open) renderTaskNotesDialog(task);
  toast('Task note saved.');
}

async function deleteEditingTaskNote() {
  const task = (state.tasks || []).find((item) => item.id === viewingTaskNotesId); if (!task || !editingTaskNoteId) return;
  const note = (task.taskNotes || []).find((item) => item.id === editingTaskNoteId); if (!note) return;
  if (!confirm(`Delete note "${note.title}"?`)) return;
  task.taskNotes = (task.taskNotes || []).filter((item) => item.id !== editingTaskNoteId); task.updatedAt = new Date().toISOString();
  await saveState(); taskNoteDialog.close(); editingTaskNoteId = null; render();
  if (taskNotesDialog.open) renderTaskNotesDialog(task);
  toast('Task note deleted.');
}

function taskLinksFor(task) {
  return [...(Array.isArray(task?.taskLinks) ? task.taskLinks : [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderTaskLinksDialog(task) {
  const list = $('#taskLinksList');
  const summary = $('#taskLinksSummary');
  if (!list || !task) return;
  const links = taskLinksFor(task);
  if (summary) summary.textContent = `${links.length} link${links.length === 1 ? '' : 's'}`;
  if (!links.length) {
    const empty = document.createElement('div'); empty.className = 'task-links-empty'; empty.textContent = 'No links yet. Add a link to reference docs, tickets, dashboards, or anything else tied to this task.';
    list.replaceChildren(empty); return;
  }
  const rows = links.map((link) => {
    const row = document.createElement('div'); row.className = 'task-link-row';
    const anchor = document.createElement('a'); anchor.className = 'task-link-main'; anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    const title = document.createElement('strong'); title.textContent = link.title || link.url;
    anchor.append(title);
    if (link.title) { const urlLine = document.createElement('span'); urlLine.className = 'task-link-url'; urlLine.textContent = link.url; anchor.append(urlLine); }
    const del = createButton('x', 'task-link-remove', 'delete-task-link', `Remove link ${link.title || link.url}`); del.dataset.linkId = link.id;
    row.append(anchor, del);
    return row;
  });
  list.replaceChildren(...rows);
}

function openTaskLinks(taskId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  viewingTaskLinksId = task.id;
  $('#taskLinksTitle').textContent = `Links: ${task.title}`;
  $('#taskLinkForm').reset();
  $('#taskLinkBrowsePanel')?.classList.add('hidden');
  const browseSearch = $('#taskLinkBrowseSearch'); if (browseSearch) browseSearch.value = '';
  renderTaskLinksDialog(task);
  if (!taskLinksDialog.open) taskLinksDialog.showModal();
  setTimeout(() => $('#taskLinkTitle').focus(), 0);
}

async function addTaskLink(taskId, title, rawUrl) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return false;
  const url = normalizeLinkUrl(rawUrl);
  if (!url) { toast(looksLikeLocalPath(rawUrl) ? 'Local file links are not supported - try noting the path in this task\'s Notes instead.' : 'Add a URL.'); return false; }
  task.taskLinks ||= [];
  if (task.taskLinks.some((link) => link.url === url)) { toast('That link is already on this task.'); return false; }
  task.taskLinks.push({ id: uid('task-link'), title: String(title || '').trim().slice(0, 160), url: url.slice(0, 2000), createdAt: new Date().toISOString() });
  task.updatedAt = new Date().toISOString();
  await saveState();
  render();
  renderTaskLinksDialog(task);
  return true;
}

async function handleTaskLinkSubmit(event) {
  event.preventDefault();
  if (!viewingTaskLinksId) return;
  const rawUrl = $('#taskLinkUrl').value.trim();
  const title = $('#taskLinkTitle').value.trim();
  if (!rawUrl) { toast('Add a URL.'); return; }
  const added = await addTaskLink(viewingTaskLinksId, title, rawUrl);
  if (!added) return;
  $('#taskLinkForm').reset();
  toast('Link added.');
}

function makeTaskLinkPickRow(title, url) {
  const row = document.createElement('div');
  row.className = 'picker-row';
  const badge = createFaviconBadge({ title, url }, 'picker-favicon');
  const meta = document.createElement('div');
  meta.className = 'picker-meta';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title || domainFor(url);
  const detail = document.createElement('small');
  detail.textContent = domainFor(url);
  meta.append(titleEl, detail);
  const button = document.createElement('button');
  button.type = 'button';
  const normalizedUrl = normalizeLinkUrl(url);
  const currentTask = () => (state.tasks || []).find((item) => item.id === viewingTaskLinksId);
  const alreadyThere = () => { const task = currentTask(); return !!task && (task.taskLinks || []).some((link) => link.url === normalizedUrl); };
  button.textContent = alreadyThere() ? 'Added' : 'Add';
  button.disabled = alreadyThere();
  button.addEventListener('click', async () => {
    button.disabled = true;
    const added = await addTaskLink(viewingTaskLinksId, title, url);
    const nowThere = alreadyThere();
    button.textContent = nowThere ? 'Added' : 'Add';
    button.disabled = nowThere;
    if (added) toast('Link added.');
  });
  row.append(badge, meta, button);
  return row;
}

function renderTaskLinkOpenTabsResults(query = '') {
  const results = $('#taskLinkOpenTabsResults');
  if (!results) return;
  const normalized = query.trim().toLowerCase();
  const tabs = [];
  openTabWindows.forEach((windowItem) => {
    windowItem.tabs.forEach((tab) => {
      const url = tabUrl(tab);
      if (!isBookmarkableUrl(url)) return;
      if (normalized && !`${tab.title || ''} ${url}`.toLowerCase().includes(normalized)) return;
      tabs.push({ title: tab.title || domainFor(url), url });
    });
  });
  const limited = tabs.slice(0, 40);
  if (!limited.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'No open tabs match that search.';
    results.replaceChildren(empty);
    return;
  }
  results.replaceChildren(...limited.map((item) => makeTaskLinkPickRow(item.title, item.url)));
}

function renderTaskLinkBookmarkResults(query = '') {
  const results = $('#taskLinkBookmarkResults');
  if (!results) return;
  const normalized = query.trim().toLowerCase();
  const filtered = bookmarks.filter((bookmark) => !normalized || `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(normalized)).slice(0, 40);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'No Chrome bookmarks match that search.';
    results.replaceChildren(empty);
    return;
  }
  results.replaceChildren(...filtered.map((bookmark) => makeTaskLinkPickRow(bookmark.title, bookmark.url)));
}

async function deleteTaskLink(linkId) {
  const task = (state.tasks || []).find((item) => item.id === viewingTaskLinksId); if (!task) return;
  const link = (task.taskLinks || []).find((item) => item.id === linkId); if (!link) return;
  task.taskLinks = (task.taskLinks || []).filter((item) => item.id !== linkId);
  task.updatedAt = new Date().toISOString();
  await saveState();
  render();
  renderTaskLinksDialog(task);
  toast('Link removed.');
}

function openTaskTimeDialog(taskId, entryId = null, timerSeconds = null) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  loggingTaskTimeId = task.id;
  editingTaskTimeEntryId = entryId ? String(entryId) : null;
  loggingTaskTimeFromTimerSeconds = Number.isFinite(Number(timerSeconds)) && Number(timerSeconds) > 0 ? Math.round(Number(timerSeconds)) : null;
  const entry = editingTaskTimeEntryId ? (task.timeEntries || []).find((item) => item.id === editingTaskTimeEntryId) : null;
  if (editingTaskTimeEntryId && !entry) editingTaskTimeEntryId = null;
  const editing = Boolean(entry);
  const fromTimer = loggingTaskTimeFromTimerSeconds != null;
  $('#taskTimeDialogTitle').textContent = fromTimer ? `Timer stopped: ${task.title}` : `${editing ? 'Edit' : 'Add'} time: ${task.title}`;
  $('#taskTimeSubmitBtn').textContent = fromTimer ? 'Save time entry' : (editing ? 'Save changes' : 'Add time');
  $('#taskTimeDate').value = localDateInputValue(entry?.loggedAt || new Date());
  const preferredUnit = state.settings.defaultTimeUnit === 'minutes' ? 'minutes' : 'hours';
  const timerMinutes = fromTimer ? Math.max(1, Math.round(loggingTaskTimeFromTimerSeconds / 60)) : 0;
  $('#taskTimeAmount').value = fromTimer
    ? (preferredUnit === 'minutes' ? String(timerMinutes) : String(Math.round((timerMinutes / 60) * 100) / 100))
    : (editing ? (preferredUnit === 'minutes' ? String(entry.minutes) : String(Math.round((entry.minutes / 60) * 100) / 100)) : '');
  $('#taskTimeUnitQuick').value = preferredUnit;
  $('#taskTimeUnitQuick').dataset.previousUnit = preferredUnit;
  $('#taskTimeAmount').step = preferredUnit === 'hours' ? 'any' : '1';
  $('#taskTimeAmount').placeholder = preferredUnit === 'hours' ? 'e.g. 1.5' : 'e.g. 45';
  $('#taskTimeDetails').value = entry?.details || '';
  document.querySelectorAll('#taskTimePresets [data-time-minutes]').forEach((button) => button.classList.toggle('selected', editing && Number(button.dataset.timeMinutes) === entry.minutes));
  renderTaskTimeEntries(task, $('#taskTimeHistory'), $('#taskTimeHistorySummary'));
  const allocation = taskAllocationById(task.allocationId);
  const timerHint = fromTimer ? `Timer ran ${formatClockDuration(loggingTaskTimeFromTimerSeconds)}. ` : '';
  $('#taskTimeAllocationHint').textContent = timerHint + (allocation ? `Counts toward ${allocation.type.toUpperCase()} · ${allocation.name}${allocation.reference ? ` · ${allocation.reference}` : ''}.` : 'This Task is not assigned to an allocation.');
  if (!taskTimeDialog.open) taskTimeDialog.showModal();
}

function openTaskCompletion(taskId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  completingTaskId = task.id;
  $('#taskCompleteTitle').textContent = `Complete: ${task.title}`;
  $('#taskClosureNotes').value = task.closureNotes || '';
  const preferredUnit = state.settings.defaultTimeUnit === 'minutes' ? 'minutes' : 'hours';
  $('#taskTimeUnit').value = preferredUnit;
  $('#taskTimeUnit').dataset.previousUnit = preferredUnit;
  $('#taskMinutesSpent').step = preferredUnit === 'hours' ? 'any' : '1';
  $('#taskMinutesSpent').placeholder = preferredUnit === 'hours' ? 'e.g. 1' : 'e.g. 60';
  $('#taskMinutesSpent').value = '';
  $('#taskCompletionTimeDetails').value = '';
  $('#taskCompletionTimeDate').value = localDateInputValue(new Date());
  renderTaskTimeEntries(task, $('#taskCompletionTimeHistory'), $('#taskCompletionTimeSummary'));
  const allocation = taskAllocationById(task.allocationId);
  $('#taskCompletionAllocationHint').textContent = allocation ? `All logged time counts toward ${allocation.type.toUpperCase()} · ${allocation.name}${allocation.reference ? ` · ${allocation.reference}` : ''}.` : 'This Task is not assigned to an allocation.';
  if (!taskCompleteDialog.open) taskCompleteDialog.showModal();
  setTimeout(() => $('#taskClosureNotes').focus(), 0);
}

function taskReportBounds(range) {
  const now = new Date(); let start = new Date(now), end = new Date(now);
  end.setHours(23,59,59,999);
  if (range === 'week') { const day=(start.getDay()+6)%7; start.setDate(start.getDate()-day); start.setHours(0,0,0,0); }
  else if (range === 'lastweek') {
    const day=(start.getDay()+6)%7;
    const startThisWeek=new Date(start); startThisWeek.setDate(startThisWeek.getDate()-day); startThisWeek.setHours(0,0,0,0);
    start=new Date(startThisWeek); start.setDate(start.getDate()-7);
    end=new Date(startThisWeek); end.setMilliseconds(-1);
  }
  else if (range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (range === 'year') { start = new Date(now.getFullYear(), 0, 1); }
  else {
    const startValue=$('#taskReportStart')?.value, endValue=$('#taskReportEnd')?.value;
    start = startValue ? new Date(`${startValue}T00:00:00`) : new Date(0);
    end = endValue ? new Date(`${endValue}T23:59:59`) : new Date();
  }
  return { start, end };
}

function makeTaskRow(task, completed = false, selectableCompleted = completed) {
  const urgency = taskUrgency(task);
  const row=document.createElement('div'); const displayState=taskWorkState(task); row.className=completed ? `task-row completed${selectableCompleted ? ' selectable' : ''} task-status-${displayState}` : `task-row task-status-${displayState}${displayState === 'working' ? ' working' : ''}${displayState === 'ongoing' ? ' ongoing' : ''}`; row.dataset.taskId=task.id;
  let select = null;
  if (completed && selectableCompleted) {
    select = document.createElement('input');
    select.type = 'checkbox'; select.className = 'completed-task-select'; select.dataset.taskId = task.id;
    select.checked = selectedCompletedTaskIds.has(task.id); select.setAttribute('aria-label', `Select completed task ${task.title}`);
    row.classList.toggle('selected', select.checked);
  }
  const dot=document.createElement('span'); dot.className=`task-priority-dot ${task.priority}`;
  const main=document.createElement('div'); main.className='task-main';
  const titleLine=document.createElement('div'); titleLine.className='task-title-line';
  const title=document.createElement('strong'); title.textContent=task.title; titleLine.append(title);
  const stateBadge=document.createElement('span'); stateBadge.className=`task-badge status ${displayState}`; stateBadge.textContent=taskStatusLabel(task); titleLine.append(stateBadge);
  const chosen=document.createElement('span'); chosen.className='task-badge'; chosen.textContent=task.priority; titleLine.append(chosen);
  if (!completed && urgency.overdueDays) { const badge=document.createElement('span'); badge.className='task-badge overdue'; badge.textContent=urgency.dueLabel; titleLine.append(badge); }
  else if (!completed && urgency.boosted) { const badge=document.createElement('span'); badge.className='task-badge boosted'; badge.textContent=`aging → ${urgency.effective}`; titleLine.append(badge); }
  const meta=document.createElement('div'); meta.className='task-meta';
  const timeMeta = task.minutesSpent ? ` · ${formatTaskMinutes(task.minutesSpent)} logged · ${(task.timeEntries || []).length} entr${(task.timeEntries || []).length === 1 ? 'y' : 'ies'}` : '';
  const allocationMeta = taskAllocationById(task.allocationId) ? ` · ${taskAllocationLabel(task.allocationId)}` : '';
  if (completed) meta.textContent=`${taskGroupLabel(task.taskGroupId)} · Completed ${new Date(task.completedAt).toLocaleDateString()}${timeMeta}${allocationMeta}${task.closureNotes ? ` · ${task.closureNotes}` : ''}`;
  else meta.textContent=`${taskGroupLabel(task.taskGroupId)} · ${urgency.dueLabel} · ${urgency.ageDays}d old${timeMeta}${allocationMeta}${task.details ? ` · ${task.details}` : ''}`;
  main.append(titleLine,meta);
  const linkedReminders = linkedRemindersForTask(task.id);
  if (linkedReminders.length) {
    const links = document.createElement('div'); links.className = 'task-linked-reminders';
    const label = document.createElement('span'); label.textContent = linkedReminders.length === 1 ? 'Reminder:' : 'Reminders:'; links.append(label);
    for (const reminder of linkedReminders) { const link = document.createElement('button'); link.type='button'; link.dataset.action='open-linked-reminder'; link.dataset.reminderId=reminder.id; link.textContent=reminder.title; links.append(link); }
    main.append(links);
  }
  const actions=document.createElement('div'); actions.className='task-actions';
  const timerRunningHere = state?.workClock?.taskId === task.id && Boolean(state?.workClock?.runningSince);
  const addTime=createButton('+ Time','task-time-btn','add-task-time','Add time to task'); addTime.dataset.taskId=task.id;
  const timeHistory=createButton('Time history','task-history-btn','view-task-time-history','View task time history'); timeHistory.dataset.taskId=task.id;
  const noteCount=(task.taskNotes || []).length;
  const notes=createButton(noteCount ? `Notes (${noteCount})` : 'Notes','task-notes-btn','view-task-notes','View and add task notes'); notes.dataset.taskId=task.id;
  const linkCount=(task.taskLinks || []).length;
  const links=createButton(linkCount ? `Links (${linkCount})` : 'Links','task-links-btn','view-task-links','View and add task links'); links.dataset.taskId=task.id;
  const reminder=createButton('+ Reminder','task-reminder-btn','add-task-reminder','Create a linked reminder for this task'); reminder.dataset.taskId=task.id;
  if (!completed) {
    const timerBtn=createButton(timerRunningHere ? '■ Stop Timer' : '▶ Start Timer', timerRunningHere ? 'task-timer-btn running' : 'task-timer-btn', timerRunningHere ? 'stop-task-timer' : 'start-task-timer', timerRunningHere ? 'Stop the timer and log time to this task' : 'Start a timer for this task'); timerBtn.dataset.taskId=task.id;
    const statusActions=document.createDocumentFragment();
    for (const option of [{value:'todo',label:'To Do'},{value:'working',label:'Working'},{value:'ongoing',label:'Ongoing'}]) {
      if (option.value === displayState) continue;
      const statusBtn=createButton(option.label, option.value === 'working' ? 'working-toggle' : option.value === 'ongoing' ? 'ongoing-toggle' : '', 'set-task-work-state', `Mark task ${option.label}`); statusBtn.dataset.taskId=task.id; statusBtn.dataset.workState=option.value; statusActions.append(statusBtn);
    }
    const done=createButton('Close','done-task','complete-task','Close task'); done.dataset.taskId=task.id;
    const edit=createButton('Edit','','edit-task','Edit task'); edit.dataset.taskId=task.id;
    const del=createButton('x','','delete-task','Delete task'); del.dataset.taskId=task.id;
    actions.append(statusActions,timerBtn,addTime,timeHistory,notes,links,reminder,done,edit,del);
  } else {
    const reopen=createButton('Reopen','','reopen-task','Reopen task'); reopen.dataset.taskId=task.id;
    const edit=createButton('View/Edit','','edit-task','Edit task'); edit.dataset.taskId=task.id;
    actions.append(addTime,timeHistory,notes,links,reminder,reopen,edit);
  }
  if (completed) row.append(...(select ? [select] : []),dot,main,actions); else row.append(dot,main,actions);
  return row;
}

function formatTaskMinutes(totalMinutes) {
  const minutes = Math.max(0, Number.parseInt(totalMinutes, 10) || 0);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function analyticsDateHelpers(now = new Date()) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(startToday); endToday.setHours(23,59,59,999);
  const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate()-1);
  const endYesterday = new Date(startYesterday); endYesterday.setHours(23,59,59,999);
  const weekOffset = (startToday.getDay()+6)%7;
  const startThisWeek = new Date(startToday); startThisWeek.setDate(startThisWeek.getDate()-weekOffset);
  const startLastWeek = new Date(startThisWeek); startLastWeek.setDate(startLastWeek.getDate()-7);
  const endLastWeek = new Date(startThisWeek); endLastWeek.setMilliseconds(-1);
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startThisYear = new Date(now.getFullYear(), 0, 1);
  return { startToday, endToday, startYesterday, endYesterday, startThisWeek, startLastWeek, endLastWeek, startThisMonth, startThisYear };
}

function taskAnalyticsValues() {
  const now = new Date();
  const d = analyticsDateHelpers(now);
  const all = state.tasks || [];
  const closedAll = all.filter((task) => task.status === 'done');
  const completed = closedAll.filter((task) => task.completedAt).map((task) => ({ task, when: new Date(task.completedAt) })).filter((item) => Number.isFinite(item.when.getTime()));
  const summarize = (items) => ({ count: items.length, minutes: items.reduce((sum, item) => sum + (item.task.minutesSpent || 0), 0) });
  const within = (start, end = now) => summarize(completed.filter((item) => item.when >= start && item.when <= end));
  const todayKey = localDateOnly(now);
  return {
    open: { count: all.filter((task) => task.status === 'open').length, minutes: 0 },
    overdue: { count: all.filter((task) => task.status === 'open' && task.dueDate && task.dueDate < todayKey).length, minutes: 0 },
    closed: { count: closedAll.length, minutes: closedAll.reduce((sum, task) => sum + (task.minutesSpent || 0), 0) },
    closedToday: within(d.startToday, d.endToday),
    closedYesterday: within(d.startYesterday, d.endYesterday),
    closedThisWeek: within(d.startThisWeek, now),
    closedLastWeek: within(d.startLastWeek, d.endLastWeek),
    closedThisMonth: within(d.startThisMonth, now),
    closedThisYear: within(d.startThisYear, now)
  };
}

function renderTaskAnalytics() {
  const labels = { open:'Open', overdue:'Past due', closed:'Closed', closedToday:'Closed today', closedYesterday:'Closed yesterday', closedThisWeek:'This week', closedLastWeek:'Last week', closedThisMonth:'This month', closedThisYear:'This year' };
  const selected = new Set(state.settings.taskAnalytics || []);
  for (const input of document.querySelectorAll('[data-task-analytics]')) input.checked = selected.has(input.dataset.taskAnalytics);
  const grid = $('#taskAnalyticsGrid');
  if (!grid) return;
  const values = taskAnalyticsValues();
  const cards = TASK_ANALYTICS_KEYS.filter((key) => selected.has(key)).map((key) => {
    const metric = values[key] || { count: 0, minutes: 0 };
    const card = document.createElement('div'); card.className = `task-analytics-card analytics-${key}`;
    const value = document.createElement('strong'); value.textContent = metric.count;
    const label = document.createElement('span'); label.textContent = labels[key];
    const isClosedMetric = key.startsWith('closed');
    card.title = isClosedMetric
      ? `${labels[key]}: ${metric.count} task${metric.count === 1 ? '' : 's'} · ${formatTaskMinutes(metric.minutes)} total logged time`
      : `${labels[key]}: ${metric.count} task${metric.count === 1 ? '' : 's'}`;
    card.setAttribute('aria-label', card.title);
    card.append(value, label); return card;
  });
  const summary = $('#taskAnalyticsSummary');
  if (summary) summary.textContent = `${cards.length} metric${cards.length === 1 ? '' : 's'} selected`;
  grid.classList.toggle('hidden', cards.length === 0);
  grid.replaceChildren(...cards);
}

function updateCompletedSelectionSummary() {
  const summary = $('#completedSelectionSummary');
  if (!summary) return;
  const checkboxes = Array.from(document.querySelectorAll('#completedTaskList .completed-task-select'));
  const selected = checkboxes.filter((box) => box.checked).map((box) => (state.tasks || []).find((task) => task.id === box.dataset.taskId)).filter(Boolean);
  if (!selected.length) {
    summary.textContent = 'Click completed tasks to total a subset.';
    summary.classList.remove('has-selection');
    return;
  }
  const minutes = selected.reduce((sum, task) => sum + (task.minutesSpent || 0), 0);
  summary.textContent = `${selected.length} selected · ${formatTaskMinutes(minutes)} logged`;
  summary.classList.add('has-selection');
}

function makeCompactTaskRow(task, recommended = false) {
  const urgency = taskUrgency(task);
  const expanded = expandedTaskRailTaskId === task.id;
  const displayState=taskWorkState(task);
  const row = document.createElement('div'); row.className = `task-compact-row task-status-${displayState}${recommended ? ' recommended' : ''}${displayState === 'working' ? ' working' : ''}${displayState === 'ongoing' ? ' ongoing' : ''}${expanded ? ' expanded' : ''}`; row.dataset.taskId=task.id;
  const primary=document.createElement('div'); primary.className='task-compact-primary';
  const dot = document.createElement('span'); dot.className = `task-priority-dot ${task.priority}`;
  const open = document.createElement('button'); open.type = 'button'; open.className = 'task-compact-open'; open.dataset.action = 'toggle-compact-task-actions'; open.dataset.taskId = task.id;
  const title = document.createElement('strong'); title.textContent = task.title;
  const linkedReminderCount = linkedRemindersForTask(task.id).length;
  const timeLabel = task.minutesSpent ? ` · ${formatTaskMinutes(task.minutesSpent)}` : '';
  const allocationLabel = taskAllocationById(task.allocationId) ? ` · ${taskAllocationById(task.allocationId).name}` : '';
  const meta = document.createElement('span'); meta.textContent = `${taskStatusLabel(task)} · ${taskGroupLabel(task.taskGroupId)} · ${urgency.dueLabel}${urgency.boosted ? ` · ${urgency.effective}` : ''}${timeLabel}${allocationLabel}${linkedReminderCount ? ` · ${linkedReminderCount} reminder${linkedReminderCount === 1 ? '' : 's'}` : ''}`;
  const chevron=document.createElement('span'); chevron.className='task-compact-chevron'; chevron.textContent=expanded?'▴':'▾';
  open.append(title, meta); primary.append(dot,open,chevron); row.append(primary);
  if (expanded) {
    const actions=document.createElement('div'); actions.className='task-compact-actions';
    const statusButtons=document.createDocumentFragment();
    for (const option of [{value:'todo',label:'To Do'},{value:'working',label:'Working'},{value:'ongoing',label:'Ongoing'}]) {
      if (option.value === displayState) continue;
      const statusBtn=createButton(option.label, option.value === 'working' ? 'btn btn-primary compact' : 'btn btn-secondary compact', 'set-task-work-state', `Mark this task ${option.label}`); statusBtn.dataset.taskId=task.id; statusBtn.dataset.workState=option.value; statusButtons.append(statusBtn);
    }
    const timerRunningHere = state?.workClock?.taskId === task.id && Boolean(state?.workClock?.runningSince);
    const timerBtn=createButton(timerRunningHere ? '■ Stop Timer' : '▶ Start Timer', timerRunningHere ? 'btn btn-primary compact task-timer-btn running' : 'btn btn-primary compact task-timer-btn', timerRunningHere ? 'stop-task-timer' : 'start-task-timer', timerRunningHere ? 'Stop the timer and log time to this task' : 'Start a timer for this task'); timerBtn.dataset.taskId=task.id;
    const addTime=createButton('+ Time','btn btn-primary compact','add-task-time','Add time'); addTime.dataset.taskId=task.id;
    const history=createButton('Time','btn btn-secondary compact','view-task-time-history','View time history'); history.dataset.taskId=task.id;
    const notes=createButton((task.taskNotes||[]).length?`Notes (${(task.taskNotes||[]).length})`:'Notes','btn btn-secondary compact','view-task-notes','View task notes'); notes.dataset.taskId=task.id;
    const links=createButton((task.taskLinks||[]).length?`Links (${(task.taskLinks||[]).length})`:'Links','btn btn-secondary compact','view-task-links','View task links'); links.dataset.taskId=task.id;
    const reminder=createButton('+ Reminder','btn btn-secondary compact','add-task-reminder','Create a linked task reminder'); reminder.dataset.taskId=task.id;
    const edit=createButton('Edit','btn btn-ghost compact','edit-task','Edit task'); edit.dataset.taskId=task.id;
    const close=createButton('Close','btn btn-ghost compact','complete-task','Close task'); close.dataset.taskId=task.id;
    const center=createButton('Task Center','btn btn-ghost compact','open-task-in-center','Open this task in Task Center'); center.dataset.taskId=task.id;
    actions.append(statusButtons,timerBtn,addTime,history,notes,links,reminder,edit,close,center); row.append(actions);
  }
  return row;
}

function renderTabAllocationsSection() {
  const desktop = activeDesktop();
  if (!desktop) return null;
  const allocations = [...(state.taskAllocations || [])]
    .filter((allocation) => (allocation.taskGroupId || 'general') === desktop.id)
    .sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name));
  const expanded = expandedTabAllocationsDesktopId === desktop.id;
  const section=document.createElement('section'); section.className=`tab-tasks-section tab-allocations-section${expanded?' expanded':''}`;
  const head=document.createElement('div'); head.className='tab-tasks-head';
  const toggle=document.createElement('button'); toggle.type='button'; toggle.className='tab-tasks-toggle'; toggle.dataset.action='toggle-tab-allocations'; toggle.dataset.desktopId=desktop.id;
  const label=document.createElement('strong'); label.textContent='ALLOCATIONS';
  const count=document.createElement('span'); count.className='tab-tasks-count'; count.textContent=`${allocations.length} allocation${allocations.length===1?'':'s'}`;
  toggle.append(label,count);
  const actions=document.createElement('div'); actions.className='tab-tasks-actions';
  const add=createButton('+ Allocation','btn btn-secondary compact','add-tab-allocation',`Add an allocation to ${desktop.title}`); add.dataset.desktopId=desktop.id;
  const center=createButton('Task Center','btn btn-ghost compact','view-tab-allocations',`Open Task Center for ${desktop.title}`); center.dataset.desktopId=desktop.id;
  actions.append(add,center); head.append(toggle,actions); section.append(head);
  if (expanded) {
    const body=document.createElement('div'); body.className='tab-tasks-body tab-allocations-body';
    if (allocations.length) {
      for (const allocation of allocations) {
        const usage=allocationUsage(allocation);
        const row=document.createElement('div'); row.className=`tab-allocation-row${usage.overMinutes>0?' over-budget':''}`;
        const main=document.createElement('div'); main.className='tab-allocation-main';
        const line=document.createElement('div'); line.className='tab-allocation-title-line';
        const title=document.createElement('strong'); title.textContent=allocation.name;
        const budget=document.createElement('span'); budget.className='tab-allocation-budget'; budget.textContent=allocation.mode==='unlimited'?'OPEN BUCKET':allocation.mode==='total'?`${allocation.hours} h TOTAL`:`${allocation.hours} h ${allocation.cadence.toUpperCase()}`;
        line.append(title,budget);
        const meta=document.createElement('span'); meta.className='tab-allocation-meta';
        meta.textContent=`${allocation.type.toUpperCase()}${allocation.reference?` · ${allocation.reference}`:''}`;
        main.append(line,meta);
        const metrics=document.createElement('div'); metrics.className='tab-allocation-metrics';
        const consumed=document.createElement('div'); consumed.className='tab-allocation-metric tab-allocation-consumed'; const consumedLabel=document.createElement('span'); consumedLabel.textContent='CONSUMED'; const consumedValue=document.createElement('strong'); consumedValue.textContent=formatTaskMinutes(usage.loggedMinutes); consumed.append(consumedLabel,consumedValue);
        const remaining=document.createElement('div'); remaining.className='tab-allocation-metric tab-allocation-remaining'; const remainingLabel=document.createElement('span'); remainingLabel.textContent='REMAINING'; const remainingValue=document.createElement('strong'); remainingValue.textContent=usage.remainingMinutes==null?'OPEN':usage.remainingMinutes>=0?formatTaskMinutes(usage.remainingMinutes):`OVER ${formatTaskMinutes(Math.abs(usage.remainingMinutes))}`; remaining.append(remainingLabel,remainingValue);
        metrics.append(consumed,remaining);
        const rowActions=document.createElement('div'); rowActions.className='tab-allocation-actions';
        const usageBtn=createButton('Usage','btn btn-secondary compact','view-task-allocation','View allocation usage'); usageBtn.dataset.allocationId=allocation.id;
        const timeLogBtn=createButton('Time Log','btn btn-secondary compact','view-task-allocation-time-log','View detailed allocation time log'); timeLogBtn.dataset.allocationId=allocation.id;
        const editBtn=createButton('Edit','btn btn-ghost compact','edit-task-allocation','Edit allocation'); editBtn.dataset.allocationId=allocation.id;
        rowActions.append(usageBtn,timeLogBtn,editBtn); row.append(main,metrics,rowActions); body.append(row);
      }
    } else { const empty=document.createElement('div'); empty.className='tab-tasks-empty'; empty.textContent=`No allocations assigned to ${desktop.title}.`; body.append(empty); }
    section.append(body);
  }
  return section;
}

function renderTabTasksSection() {
  const desktop = activeDesktop();
  if (!desktop) return null;
  const tasks = [...(state.tasks || [])].filter((task) => task.taskGroupId === desktop.id).sort((a,b) => {
    const stateDelta = taskWorkStateRank(a) - taskWorkStateRank(b);
    if (stateDelta) return stateDelta;
    if (a.status === 'done' && b.status === 'done') return String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt));
    const ua=taskUrgency(a), ub=taskUrgency(b); return (ub.score-ua.score) || String(a.title).localeCompare(String(b.title));
  });
  const expanded = expandedTabTasksDesktopId === desktop.id;
  const section = document.createElement('section');
  section.className = `tab-tasks-section${expanded ? ' expanded' : ''}`;

  const head = document.createElement('div'); head.className = 'tab-tasks-head';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'tab-tasks-toggle'; toggle.dataset.action = 'toggle-tab-tasks'; toggle.dataset.desktopId = desktop.id;
  const label = document.createElement('strong'); label.textContent = 'TASKS';
  const counts = { working:0, ongoing:0, todo:0, closed:0 }; for (const task of tasks) counts[taskWorkState(task)] += 1;
  const count = document.createElement('span'); count.className = 'tab-tasks-count'; count.textContent = `${tasks.length} total · ${counts.working} working · ${counts.ongoing} ongoing · ${counts.todo} to do · ${counts.closed} closed`;
  toggle.append(label, count);
  const actions = document.createElement('div'); actions.className = 'tab-tasks-actions';
  const add = createButton('+ Task','btn btn-secondary compact','add-tab-task',`Add a task to ${desktop.title}`); add.dataset.desktopId=desktop.id;
  const center = createButton('Task Center','btn btn-ghost compact','view-tab-tasks',`Open Task Center for ${desktop.title}`); center.dataset.desktopId=desktop.id;
  actions.append(add,center); head.append(toggle,actions); section.append(head);
  if (expanded) {
    const body = document.createElement('div'); body.className = 'tab-tasks-body tab-status-groups';
    const groups = [
      {key:'working',label:'WORKING'},
      {key:'ongoing',label:'ONGOING'},
      {key:'todo',label:'TO DO'},
      {key:'closed',label:'CLOSED'}
    ];
    for (const group of groups) {
      const matching = tasks.filter((task) => taskWorkState(task) === group.key);
      const wrap=document.createElement('section'); wrap.className=`tab-task-status-group status-${group.key}`;
      const groupHead=document.createElement('div'); groupHead.className='tab-task-status-head'; const title=document.createElement('strong'); title.textContent=group.label; const groupCount=document.createElement('span'); groupCount.textContent=String(matching.length); groupHead.append(title,groupCount); wrap.append(groupHead);
      if (matching.length) { const list=document.createElement('div'); list.className='tab-task-status-list'; list.replaceChildren(...matching.map((task)=>makeTaskRow(task, group.key === 'closed', false))); wrap.append(list); }
      else { const empty=document.createElement('div'); empty.className='tab-task-status-empty'; empty.textContent=`No ${group.label.toLowerCase()} tasks.`; wrap.append(empty); }
      body.append(wrap);
    }
    section.append(body);
  }
  return section;
}

function renderTaskRecommendations(card, filter) {
  const button = $('#recommendTaskBtn');
  if (button) {
    button.textContent = taskRecommendationsVisible ? 'Hide recommendations' : 'Recommend next';
    button.setAttribute('aria-expanded', taskRecommendationsVisible ? 'true' : 'false');
    button.classList.toggle('active', taskRecommendationsVisible);
  }
  card.replaceChildren();
  card.className = `next-task-card recommendation-panel${taskRecommendationsVisible ? '' : ' hidden'}`;
  if (!taskRecommendationsVisible) return;
  const choices = recommendedTasks(filter, 5);
  const head=document.createElement('div'); head.className='recommendation-head';
  const copy=document.createElement('div'); const label=document.createElement('small'); label.textContent='RECOMMENDED NEXT'; const title=document.createElement('strong'); title.textContent='Choose one or more tasks to make Working'; const detail=document.createElement('span'); detail.textContent='Suggestions use due date, priority, and age. Working and Ongoing tasks are excluded.'; copy.append(label,title,detail); head.append(copy); card.append(head);
  if (!choices.length) { const empty=document.createElement('div'); empty.className='recommendation-empty'; empty.textContent='No To Do tasks to recommend. Remaining open tasks are Working or Ongoing.'; card.append(empty); return; }
  const list=document.createElement('div'); list.className='task-recommendation-list';
  choices.forEach((task,index)=>{
    const u=taskUrgency(task); const item=document.createElement('div'); item.className='task-recommendation-item';
    const rank=document.createElement('span'); rank.className='recommendation-rank'; rank.textContent=String(index+1);
    const info=document.createElement('div'); const taskTitle=document.createElement('strong'); taskTitle.textContent=task.title; const meta=document.createElement('span'); meta.textContent=`${taskGroupLabel(task.taskGroupId)} · ${u.effective} · ${u.dueLabel}`; info.append(taskTitle,meta);
    const actions=document.createElement('div'); actions.className='recommendation-actions';
    const activate=createButton('Mark Working','btn btn-primary compact','mark-task-working','Mark this recommended task as working'); activate.dataset.taskId=task.id;
    const edit=createButton('Edit','btn btn-secondary compact','edit-task','Edit task'); edit.dataset.taskId=task.id; actions.append(activate,edit);
    item.append(rank,info,actions); list.append(item);
  });
  card.append(list);
}

function setTaskAllocationFormFields() {
  const mode = $('#taskAllocationMode')?.value || 'unlimited';
  const unit = $('#taskAllocationUnit')?.value === 'minutes' ? 'minutes' : 'hours';
  $('#taskAllocationHoursWrap')?.classList.toggle('hidden', mode === 'unlimited');
  $('#taskAllocationUnitWrap')?.classList.toggle('hidden', mode === 'unlimited');
  $('#taskAllocationCadenceWrap')?.classList.toggle('hidden', mode !== 'recurring');
  if ($('#taskAllocationHoursLabel')) {
    const unitLabel = unit === 'minutes' ? 'Minutes' : 'Hours';
    $('#taskAllocationHoursLabel').textContent = mode === 'recurring' ? `${unitLabel} per period` : `Total ${unitLabel.toLowerCase()}`;
  }
  const input = $('#taskAllocationHours');
  if (input) { input.step = unit === 'minutes' ? '1' : 'any'; input.min = unit === 'minutes' ? '1' : '0.25'; input.max = unit === 'minutes' ? '6000000' : '100000'; }
}

function openTaskAllocationDialog(allocationId = null, defaultGroupId = state.activeDesktopId) {
  const allocation = allocationId ? taskAllocationById(allocationId) : null;
  editingTaskAllocationId = allocation?.id || null;
  populateTaskGroupSelect($('#taskAllocationGroup'));
  const allocationGroupSelect=$('#taskAllocationGroup');
  if (allocationGroupSelect?.options?.length) {
    const generalOption=Array.from(allocationGroupSelect.options).find((option)=>option.value==='general');
    if(generalOption) generalOption.textContent='General';
  }
  $('#taskAllocationDialogTitle').textContent = allocation ? 'Edit allocation' : 'Create allocation';
  $('#taskAllocationSubmitBtn').textContent = allocation ? 'Save allocation' : 'Create allocation';
  $('#taskAllocationName').value = allocation?.name || '';
  $('#taskAllocationType').value = allocation?.type || 'project';
  $('#taskAllocationReference').value = allocation?.reference || '';
  $('#taskAllocationGroup').value = allocation?.taskGroupId || (state.desktops.some((d)=>d.id===defaultGroupId) ? defaultGroupId : 'general');
  $('#taskAllocationMode').value = allocation?.mode || 'unlimited';
  const allocationUnit = state.settings.defaultTimeUnit === 'minutes' ? 'minutes' : 'hours';
  $('#taskAllocationUnit').value = allocationUnit;
  $('#taskAllocationUnit').dataset.previousUnit = allocationUnit;
  const storedHours = allocation?.hours || 10;
  $('#taskAllocationHours').value = allocationUnit === 'minutes' ? String(Math.round(storedHours * 60)) : String(storedHours);
  $('#taskAllocationCadence').value = allocation?.cadence || 'weekly';
  $('#taskAllocationStartDate').value = allocation?.startDate || '';
  $('#taskAllocationEndDate').value = allocation?.endDate || '';
  $('#taskAllocationDetails').value = allocation?.details || '';
  $('#taskAllocationActive').checked = allocation?.active !== false;
  setTaskAllocationFormFields();
  taskAllocationDialog.showModal();
  setTimeout(()=>$('#taskAllocationName')?.focus(),0);
}

async function handleTaskAllocationSubmit(event) {
  event.preventDefault();
  const name = $('#taskAllocationName').value.trim(); if (!name) return;
  const mode = TASK_ALLOCATION_MODES.includes($('#taskAllocationMode').value) ? $('#taskAllocationMode').value : 'unlimited';
  const rawAmount = Number($('#taskAllocationHours').value);
  const allocationUnit = $('#taskAllocationUnit').value === 'minutes' ? 'minutes' : 'hours';
  if (mode !== 'unlimited' && (!Number.isFinite(rawAmount) || rawAmount <= 0)) { toast(`Enter the ${allocationUnit} for this allocation.`); return; }
  const rawHours = allocationUnit === 'minutes' ? rawAmount / 60 : rawAmount;
  const hours = mode === 'unlimited' ? 0 : Math.max(1 / 60, Math.min(100000, rawHours));
  const startDate = $('#taskAllocationStartDate').value;
  const endDate = $('#taskAllocationEndDate').value;
  if (startDate && endDate && endDate < startDate) { toast('Allocation end date must be on or after the start date.'); return; }
  state.taskAllocations ||= [];
  const now = new Date().toISOString();
  const existing = editingTaskAllocationId ? taskAllocationById(editingTaskAllocationId) : null;
  const candidate = {
    id: existing?.id || uid('allocation'), name: name.slice(0,140), type: TASK_ALLOCATION_TYPES.includes($('#taskAllocationType').value) ? $('#taskAllocationType').value : 'project',
    reference: $('#taskAllocationReference').value.trim().slice(0,120),
    taskGroupId: $('#taskAllocationGroup').value === 'general' || state.desktops.some((d)=>d.id===$('#taskAllocationGroup').value) ? $('#taskAllocationGroup').value : 'general',
    mode, hours,
    cadence: TASK_ALLOCATION_CADENCES.includes($('#taskAllocationCadence').value) ? $('#taskAllocationCadence').value : 'weekly',
    startDate, endDate, details: $('#taskAllocationDetails').value.trim().slice(0,2400), active: $('#taskAllocationActive').checked,
    carryOverPeriods: existing?.carryOverPeriods ? [...existing.carryOverPeriods] : [],
    createdAt: existing?.createdAt || now, updatedAt: now
  };
  if (existing) Object.assign(existing, candidate); else state.taskAllocations.push(candidate);
  await saveState(); taskAllocationDialog.close(); render(); toast(existing ? 'Allocation updated.' : 'Allocation created.');
}

function makeTaskAllocationCard(allocation) {
  const usage = allocationUsage(allocation);
  const card = document.createElement('article');
  card.className = `task-allocation-card${allocation.active ? '' : ' inactive'}${usage.overMinutes > 0 ? ' over-budget' : ''}`;
  const head = document.createElement('div'); head.className='allocation-card-head';
  const copy=document.createElement('div'); const type=document.createElement('span'); type.className='allocation-type'; type.textContent=allocation.type.toUpperCase();
  const title=document.createElement('strong'); title.textContent=allocation.name; copy.append(type,title);
  if (allocation.reference) { const ref=document.createElement('small'); ref.textContent=allocation.reference; copy.append(ref); }
  const group=document.createElement('small'); group.className='allocation-group-label'; group.textContent=taskGroupLabel(allocation.taskGroupId || 'general'); copy.append(group);
  const budgetHero=document.createElement('div'); budgetHero.className='allocation-budget-hero';
  budgetHero.textContent = allocation.mode === 'unlimited' ? 'OPEN BUCKET' : allocation.mode === 'total' ? `${allocation.hours} h TOTAL` : `${allocation.hours} h ${allocation.cadence.toUpperCase()}`;
  const status=document.createElement('span'); status.className=`allocation-status${allocation.active?'':' paused'}`; status.textContent=allocation.active?'ACTIVE':'PAUSED'; head.append(copy,budgetHero,status);

  const period=document.createElement('div'); period.className='allocation-period'; period.textContent=allocationPeriodLabel(allocation,usage.bounds);
  card.append(head,period);

  if (usage.carryInMinutes > 0) {
    const adjusted=document.createElement('div'); adjusted.className='allocation-carry-adjustment';
    adjusted.textContent=`This ${allocationCadenceUnit(allocation)} has ${formatTaskMinutes(usage.budgetMinutes)} available after ${formatTaskMinutes(usage.carryInMinutes)} was borrowed by the previous ${allocationCadenceUnit(allocation)}.`;
    card.append(adjusted);
  }

  const metrics=document.createElement('div'); metrics.className='allocation-metrics';
  const metric=(label,value,klass='')=>{const box=document.createElement('div'); box.className=`allocation-metric ${klass}`; const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value;box.append(l,v);return box;};
  metrics.append(metric('Logged',formatTaskMinutes(usage.loggedMinutes),'logged'));
  if (usage.budgetMinutes == null) metrics.append(metric('Budget','Open'));
  else metrics.append(metric(usage.carryInMinutes ? 'Available' : 'Budget',formatTaskMinutes(usage.budgetMinutes),usage.carryInMinutes ? 'adjusted' : ''));
  if (usage.remainingMinutes != null) metrics.append(metric(usage.remainingMinutes >= 0 ? 'Remaining' : 'Over',formatTaskMinutes(Math.abs(usage.remainingMinutes)),usage.remainingMinutes < 0 ? 'over' : 'remaining'));
  const allTaskIds=new Set((state.tasks||[]).filter((task)=>task.allocationId===allocation.id).map((task)=>task.id));
  metrics.append(metric('Tasks',String(allTaskIds.size)));
  card.append(metrics);

  if (usage.budgetMinutes !== null && usage.baseBudgetMinutes > 0) {
    const progress=document.createElement('div'); progress.className='allocation-progress'; const bar=document.createElement('span');
    const denominator=Math.max(1,usage.budgetMinutes || usage.baseBudgetMinutes); bar.style.width=`${Math.min(100,(usage.loggedMinutes/denominator)*100)}%`;
    if(usage.overMinutes>0) progress.classList.add('over'); progress.append(bar); card.append(progress);
  }

  if (usage.overMinutes > 0) {
    const over=document.createElement('div'); over.className='allocation-over-callout';
    const overCopy=document.createElement('div');
    const overTitle=document.createElement('strong'); overTitle.textContent=`OVER ${formatTaskMinutes(usage.overMinutes)}`;
    const overText=document.createElement('span');
    const nextUsage=allocationNextRecurringUsage(allocation,usage);
    if (allocation.mode === 'recurring' && nextUsage) {
      if (usage.carryEnabled && usage.carryOutMinutes > 0) overText.textContent=`${formatTaskMinutes(usage.carryOutMinutes)} is being borrowed from the next ${allocationCadenceUnit(allocation)}. That next period will have ${formatTaskMinutes(nextUsage.budgetMinutes)} available.`;
      else overText.textContent=`This ${allocationCadenceUnit(allocation)} is over its available time. You can borrow up to ${formatTaskMinutes(Math.min(usage.overMinutes, usage.baseBudgetMinutes))} from the next ${allocationCadenceUnit(allocation)}.`;
    } else overText.textContent='This allocation is over its available time.';
    overCopy.append(overTitle,overText); over.append(overCopy);
    if (allocation.mode === 'recurring' && nextUsage) {
      const carry=createButton(usage.carryEnabled ? 'Undo borrow' : `Borrow from next ${allocationCadenceUnit(allocation)}`,'btn btn-secondary compact','toggle-allocation-carryover',usage.carryEnabled?'Stop borrowing from the next allocation period':'Carry this overage into the next allocation period');
      carry.dataset.allocationId=allocation.id; carry.dataset.periodKey=usage.key; over.append(carry);
    }
    card.append(over);
  }

  if (allocation.details) { const detail=document.createElement('p'); detail.className='allocation-card-details'; detail.textContent=allocation.details; card.append(detail); }
  const actions=document.createElement('div'); actions.className='allocation-card-actions';
  const view=createButton('Usage','btn btn-secondary compact','view-task-allocation','View allocation usage'); view.dataset.allocationId=allocation.id;
  const timeLog=createButton('Time Log','btn btn-secondary compact','view-task-allocation-time-log','View detailed allocation time log'); timeLog.dataset.allocationId=allocation.id;
  const edit=createButton('Edit','btn btn-ghost compact','edit-task-allocation','Edit allocation'); edit.dataset.allocationId=allocation.id;
  const del=createButton('Delete','btn btn-ghost compact danger-text','delete-task-allocation','Delete allocation'); del.dataset.allocationId=allocation.id;
  actions.append(view,timeLog,edit,del); card.append(actions); return card;
}

function renderTaskAllocations() {
  const allocations=[...(state.taskAllocations||[])].sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name));
  const grid=$('#taskAllocationsGrid');
  $('#taskAllocationsSummary').textContent=`${allocations.length} allocation${allocations.length===1?'':'s'} · ${allocations.filter(a=>a.active).length} active`;
  if (allocations.length) grid.replaceChildren(...allocations.map(makeTaskAllocationCard));
  else { const empty=document.createElement('div'); empty.className='task-allocation-empty'; empty.innerHTML='<strong>No allocations yet</strong><span>Create a Project, Job, Ticket, or hour bucket, then assign Tasks to it.</span>'; grid.replaceChildren(empty); }
}

function renderTaskAllocationHistory(allocation) {
  const periods=allocationHistoryPeriods(allocation);
  const overallRows=allocationEntries(allocation);
  const overallMinutes=overallRows.reduce((sum,row)=>sum+(Number(row.entry.minutes)||0),0);
  $('#taskAllocationHistoryTitle').textContent=`${allocation.name} usage`;
  $('#taskAllocationHistorySummary').innerHTML=`<strong>${allocation.type.toUpperCase()}${allocation.reference?` · ${allocation.reference}`:''}</strong><span>${allocationModeLabel(allocation)} · ${formatTaskMinutes(overallMinutes)} logged across ${new Set(overallRows.map(row=>row.task.id)).size} task(s)</span>`;
  const list=$('#taskAllocationHistoryList'); list.replaceChildren();
  for(const period of periods){
    const row=document.createElement('div'); row.className='allocation-history-row';
    const periodEl=document.createElement('strong'); periodEl.textContent=period.label;
    const budget=document.createElement('span'); budget.textContent=period.budgetMinutes==null?'Open':period.carryInMinutes?`${formatTaskMinutes(period.budgetMinutes)} available (${formatTaskMinutes(period.baseBudgetMinutes)} base)`:formatTaskMinutes(period.budgetMinutes);
    const logged=document.createElement('span'); logged.className='allocation-history-logged'; logged.textContent=formatTaskMinutes(period.loggedMinutes);
    const remaining=document.createElement('span'); if(period.remainingMinutes==null) remaining.textContent='—'; else {remaining.textContent=`${period.remainingMinutes>=0?'Left':'Over'} ${formatTaskMinutes(Math.abs(period.remainingMinutes))}`; if(period.remainingMinutes<0) remaining.className='allocation-history-over';}
    const detail=document.createElement('span'); detail.className='allocation-history-detail';
    const carryBits=[]; if(period.carryInMinutes) carryBits.push(`${formatTaskMinutes(period.carryInMinutes)} borrowed by prior ${allocationCadenceUnit(allocation)}`); if(period.carryOutMinutes) carryBits.push(`${formatTaskMinutes(period.carryOutMinutes)} borrowed from next ${allocationCadenceUnit(allocation)}`);
    detail.textContent=[allocationTaskBreakdown(period.rows)||'No time logged',...carryBits].join(' · ');
    row.append(periodEl,budget,logged,remaining,detail); list.append(row);
  }
  if(!periods.length){const empty=document.createElement('div');empty.className='task-allocation-empty';empty.textContent='No periods are available for this allocation.';list.append(empty);}
}

function openTaskAllocationHistory(allocationId) {
  const allocation=taskAllocationById(allocationId); if(!allocation) return;
  viewingTaskAllocationId=allocation.id; renderTaskAllocationHistory(allocation); taskAllocationHistoryDialog.showModal();
}

function allocationTimeLogPresetBounds(allocation, filterValue) {
  const value = String(filterValue || 'all');
  const windowBounds = allocationDateBounds(allocation);
  if (value.startsWith('period:')) {
    const key = value.slice(7);
    const period = allocationHistoryPeriods(allocation).find((item) => item.key === key);
    return period ? { start: new Date(period.bounds.start), end: new Date(period.bounds.end), label: period.label } : { ...windowBounds, label: 'All allocation time' };
  }
  const now = new Date();
  let start = new Date(0); let end = new Date(8640000000000000); let label = 'All allocation time';
  const mondayStart = (date) => { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; };
  if (value === 'this-week') { start = mondayStart(now); end = new Date(start); end.setDate(end.getDate() + 7); end.setMilliseconds(-1); label = 'This week'; }
  else if (value === 'last-week') { end = mondayStart(now); start = new Date(end); start.setDate(start.getDate() - 7); end = new Date(end.getTime() - 1); label = 'Last week'; }
  else if (value === 'this-month') { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1); end.setMilliseconds(-1); label = 'This month'; }
  else if (value === 'last-month') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 1); end.setMilliseconds(-1); label = 'Last month'; }
  else if (value === 'this-quarter') { const month = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), month, 1); end = new Date(now.getFullYear(), month + 3, 1); end.setMilliseconds(-1); label = 'This quarter'; }
  else if (value === 'last-quarter') { const month = Math.floor(now.getMonth() / 3) * 3; end = new Date(now.getFullYear(), month, 1); start = new Date(end.getFullYear(), end.getMonth() - 3, 1); end = new Date(end.getTime() - 1); label = 'Last quarter'; }
  else if (value === 'custom') {
    const startValue = $('#taskAllocationTimeLogStart')?.value;
    const endValue = $('#taskAllocationTimeLogEnd')?.value;
    start = startValue ? new Date(`${startValue}T00:00:00`) : windowBounds.start;
    end = endValue ? new Date(`${endValue}T23:59:59.999`) : windowBounds.end;
    label = startValue || endValue ? `${startValue ? new Date(`${startValue}T00:00:00`).toLocaleDateString() : 'Beginning'} – ${endValue ? new Date(`${endValue}T00:00:00`).toLocaleDateString() : 'Present'}` : 'Custom range';
  }
  const clipped = clipAllocationBounds(allocation, { start, end });
  return { ...clipped, label };
}

function populateAllocationTimeLogFilter(allocation, selectedValue = '') {
  const select = $('#taskAllocationTimeLogFilter'); if (!select) return;
  select.replaceChildren();
  const addOption = (value, label, parent = select) => { const option = document.createElement('option'); option.value = value; option.textContent = label; parent.append(option); };
  addOption('all', 'All allocation time');
  if (allocation.mode === 'recurring') {
    const group = document.createElement('optgroup'); group.label = 'Allocation periods';
    for (const period of allocationHistoryPeriods(allocation)) addOption(`period:${period.key}`, period.label, group);
    if (group.children.length) select.append(group);
  }
  const quick = document.createElement('optgroup'); quick.label = 'Quick time frames';
  addOption('this-week', 'This week', quick); addOption('last-week', 'Last week', quick);
  addOption('this-month', 'This month', quick); addOption('last-month', 'Last month', quick);
  addOption('this-quarter', 'This quarter', quick); addOption('last-quarter', 'Last quarter', quick);
  addOption('custom', 'Custom date range', quick); select.append(quick);
  let defaultValue = selectedValue;
  if (!defaultValue && allocation.mode === 'recurring') {
    const current = allocationUsage(allocation);
    if (current.valid) defaultValue = `period:${current.key}`;
  }
  if (!defaultValue || !Array.from(select.options).some((option) => option.value === defaultValue)) defaultValue = 'all';
  select.value = defaultValue;
}

function renderTaskAllocationTimeLog(allocation) {
  const filter = $('#taskAllocationTimeLogFilter')?.value || 'all';
  const custom = $('#taskAllocationTimeLogCustomRange');
  if (custom) custom.classList.toggle('hidden', filter !== 'custom');
  const bounds = allocationTimeLogPresetBounds(allocation, filter);
  const valid = bounds.start <= bounds.end;
  const rows = (valid ? allocationEntries(allocation, bounds) : []).map((row) => ({ ...row, allocation }));
  const totalMinutes = rows.reduce((sum, row) => sum + (Number(row.entry.minutes) || 0), 0);
  $('#taskAllocationTimeLogTitle').textContent = `${allocation.name} time log`;
  const summary = $('#taskAllocationTimeLogSummary');
  if (summary) {
    summary.replaceChildren();
    const strong = document.createElement('strong'); strong.textContent = `${allocation.type.toUpperCase()}${allocation.reference ? ` · ${allocation.reference}` : ''}`;
    const span = document.createElement('span'); span.textContent = `${bounds.label} · ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} · ${formatTaskMinutes(totalMinutes)} logged · ${new Set(rows.map((row) => row.task.id)).size} task(s)`;
    summary.append(strong, span);
  }
  const groupBy = $('#taskAllocationTimeLogGroupBy')?.value || 'none';
  const splitByDayCapable = groupBy === 'task';
  $('#taskAllocationTimeLogSplitByDayWrap')?.classList.toggle('hidden', !splitByDayCapable);
  const splitByDay = splitByDayCapable && Boolean($('#taskAllocationTimeLogSplitByDay')?.checked);
  const splitByTaskCapable = groupBy === 'day';
  $('#taskAllocationTimeLogSplitByTaskWrap')?.classList.toggle('hidden', !splitByTaskCapable);
  const splitByTask = splitByTaskCapable && Boolean($('#taskAllocationTimeLogSplitByTask')?.checked);
  const grouped = groupBy !== 'none';
  $('#taskAllocationTimeLogHead')?.classList.toggle('hidden', grouped);
  $('#taskAllocationTimeLogChartToggleWrap')?.classList.toggle('hidden', !grouped);
  const dayCapable = splitByDay || splitByTask;
  $('#taskAllocationTimeLogCombineDescWrap')?.classList.toggle('hidden', !dayCapable);
  const combineDesc = dayCapable && Boolean($('#taskAllocationTimeLogCombineDesc')?.checked);
  $('#taskAllocationTimeLogDescLimitWrap')?.classList.toggle('hidden', !combineDesc);
  const descLimitRaw = Number($('#taskAllocationTimeLogDescLimit')?.value);
  const descLimit = Number.isFinite(descLimitRaw) && descLimitRaw > 0 ? Math.floor(descLimitRaw) : 500;
  const chart = $('#taskAllocationTimeLogChart');
  const list = $('#taskAllocationTimeLogList'); if (!list) return;
  if (!rows.length) {
    chart?.classList.add('hidden');
    const empty = document.createElement('div'); empty.className = 'task-allocation-empty'; empty.textContent = valid ? 'No time entries match this time frame.' : 'This time frame is outside the allocation dates.'; list.replaceChildren(empty); return;
  }
  if (!grouped) {
    chart?.classList.add('hidden');
    list.className = 'allocation-time-log-list';
    list.replaceChildren(...rows.map(({task, entry, when}) => {
      const row = document.createElement('div'); row.className = 'allocation-time-log-row';
      const stamp = document.createElement('div'); stamp.className = 'allocation-time-log-stamp';
      const date = document.createElement('strong'); date.textContent = when.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
      const time = document.createElement('span'); time.textContent = when.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }); stamp.append(date, time);
      const taskName = document.createElement('strong'); taskName.className = 'allocation-time-log-task'; taskName.textContent = task.title;
      const duration = document.createElement('strong'); duration.className = 'allocation-time-log-duration'; duration.textContent = formatTaskMinutes(entry.minutes);
      const details = document.createElement('span'); details.className = 'allocation-time-log-details'; details.textContent = entry.details || 'No details';
      row.append(stamp, taskName, duration, details); return row;
    }));
    return;
  }
  const groups = groupAllTimeEntries(rows, groupBy);
  const maxMinutes = Math.max(1, ...groups.map((group) => group.minutes));
  if (chart) {
    chart.classList.toggle('hidden', !taskAllocationTimeLogShowChart);
    chart.replaceChildren(...groups.map((group) => {
      const row = document.createElement('div'); row.className = 'all-time-entries-chart-row';
      const label = document.createElement('span'); label.className = 'all-time-entries-chart-label'; label.textContent = group.name; label.title = group.name;
      const track = document.createElement('div'); track.className = 'all-time-entries-chart-track';
      const fill = document.createElement('div'); fill.className = 'all-time-entries-chart-fill'; fill.style.width = `${Math.max(2, Math.round((group.minutes / maxMinutes) * 100))}%`;
      track.append(fill);
      const value = document.createElement('span'); value.className = 'all-time-entries-chart-value'; value.textContent = formatTaskMinutes(group.minutes);
      row.append(label, track, value); return row;
    }));
  }
  const splitMode = groupBy === 'day' ? (splitByTask ? 'task' : null) : (splitByDay ? 'day' : null);
  list.className = 'allocation-time-log-list all-time-entries-group-list';
  list.replaceChildren(...groups.map((group) => {
    const row = document.createElement('div'); row.className = `all-time-entries-group-row${splitMode ? ' with-days' : ''}`;
    const name = document.createElement('div'); name.className = 'all-time-entries-group-name';
    const title = document.createElement('strong'); title.textContent = group.name;
    name.append(title);
    const duration = document.createElement('strong'); duration.className = 'allocation-time-log-duration'; duration.textContent = formatTaskMinutes(group.minutes);
    const stats = document.createElement('span'); stats.className = 'all-time-entries-group-stats'; const pct = totalMinutes ? Math.round((group.minutes / totalMinutes) * 100) : 0; stats.textContent = `${pct}% · ${group.count} entr${group.count === 1 ? 'y' : 'ies'}`;
    row.append(name, duration, stats);
    if (splitMode) row.append(buildAllTimeEntriesSubBreakdown(group.rows, splitMode, combineDesc, descLimit));
    return row;
  }));
}

function openTaskAllocationTimeLog(allocationId, selectedValue = '') {
  const allocation = taskAllocationById(allocationId); if (!allocation) return;
  viewingTaskAllocationTimeLogId = allocation.id;
  populateAllocationTimeLogFilter(allocation, selectedValue);
  const today = localDateInputValue(new Date());
  const startInput = $('#taskAllocationTimeLogStart'); const endInput = $('#taskAllocationTimeLogEnd');
  if (startInput && !startInput.value) { const first = new Date(); first.setDate(1); startInput.value = localDateInputValue(first); }
  if (endInput && !endInput.value) endInput.value = today;
  renderTaskAllocationTimeLog(allocation);
  if (!taskAllocationTimeLogDialog.open) taskAllocationTimeLogDialog.showModal();
}

async function toggleAllocationCarryOver(allocationId, periodKey) {
  const allocation=taskAllocationById(allocationId);
  if(!allocation || allocation.mode!=='recurring') return;
  const usage=allocationUsage(allocation);
  if (usage.key !== String(periodKey || usage.key)) { toast('Open the current allocation period to change borrowing.'); return; }
  const nextUsage=allocationNextRecurringUsage(allocation,usage);
  if(!nextUsage){toast(`There is no next ${allocationCadenceUnit(allocation)} available inside this allocation's date range.`);return;}
  const periods=allocationCarryPeriods(allocation);
  if(periods.has(usage.key)) {
    periods.delete(usage.key);
    allocation.carryOverPeriods=[...periods]; allocation.updatedAt=new Date().toISOString();
    await saveState(); render(); toast('Borrowing removed.'); return;
  }
  if(usage.overMinutes<=0){toast('This allocation is not over its available time.');return;}
  periods.add(usage.key); allocation.carryOverPeriods=[...periods]; allocation.updatedAt=new Date().toISOString();
  await saveState(); render();
  const updated=allocationUsage(allocation); const borrowed=updated.carryOutMinutes;
  toast(`Borrowing ${formatTaskMinutes(borrowed)} from the next ${allocationCadenceUnit(allocation)}.`);
}

async function deleteTaskAllocation(allocationId) {
  const allocation=taskAllocationById(allocationId); if(!allocation) return;
  const taskCount=(state.tasks||[]).filter((task)=>task.allocationId===allocation.id).length;
  if(!confirm(`Delete allocation "${allocation.name}"?${taskCount?` ${taskCount} assigned task(s) will be kept and moved to No allocation.`:''}`)) return;
  state.taskAllocations=(state.taskAllocations||[]).filter((item)=>item.id!==allocation.id);
  for(const task of (state.tasks||[])) if(task.allocationId===allocation.id) task.allocationId='';
  await saveState(); render(); toast('Allocation deleted. Tasks and time entries were kept.');
}

function aggregateAllocationEntries(bounds = null, type = '') {
  const rows = [];
  for (const allocation of (state.taskAllocations || [])) {
    if (type && allocation.type !== type) continue;
    for (const row of allocationEntries(allocation, bounds)) rows.push({ ...row, allocation });
  }
  return rows;
}

function formatAllocationSummaryMinutes(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes) || 0);
  if (state?.settings?.defaultTimeUnit === 'minutes') return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded).replace(/0+$/, '').replace(/\.$/, '')}h`;
}

function allocationSummaryCard(label, rows, secondary = '') {
  const card = document.createElement('div'); card.className='allocation-summary-card';
  const kicker=document.createElement('span'); kicker.textContent=label;
  const total=document.createElement('strong'); total.textContent=formatAllocationSummaryMinutes(rows.reduce((sum,row)=>sum+row.entry.minutes,0));
  const meta=document.createElement('small'); meta.textContent=secondary || `${new Set(rows.map(row=>row.allocation.id)).size} allocation${new Set(rows.map(row=>row.allocation.id)).size===1?'':'s'} · ${rows.length} time entr${rows.length===1?'y':'ies'}`;
  card.append(kicker,total,meta); return card;
}

// This week's share of an allocation's budget, spread evenly by day.
// Weekly: the week's budget. Monthly / quarterly: each day of this week gets (that period's budget ÷ days in
// that period), so a week straddling two months takes a share of each. Total: the budget ÷ days between its
// start and end dates. Open buckets and totals without both dates can't be spread → minutes: null.
function allocationWeeklyBudgetShare(allocation, week) {
  const DAY = 86400000;
  const dayCount = (bounds) => Math.max(1, Math.round((new Date(bounds.end.getFullYear(), bounds.end.getMonth(), bounds.end.getDate()) - new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate())) / DAY) + 1);
  if (allocation.mode === 'unlimited') return { minutes: null, note: '' };
  if (allocation.mode === 'total' && (!allocation.startDate || !allocation.endDate)) return { minutes: null, note: '' };
  const window = allocationDateBounds(allocation);
  const hours = Number(allocation.hours) || 0;
  const cadence = allocation.mode === 'recurring' ? (allocation.cadence || 'weekly') : 'total';
  let minutes = 0;
  const usageCache = new Map();
  for (let i = 0; i < 7; i++) {
    const day = new Date(week.start.getFullYear(), week.start.getMonth(), week.start.getDate() + i, 12);
    if (day < window.start || day > window.end) continue;
    if (cadence === 'total') { minutes += (hours * 60) / dayCount(window); continue; }
    const periodKey = allocationPeriodKey(recurringPeriodBounds(cadence, day).start);
    let usage = usageCache.get(periodKey);
    if (!usage) { usage = allocationUsage(allocation, day); usageCache.set(periodKey, usage); }
    if (!usage.valid) continue;
    minutes += (Math.max(0, Number(usage.budgetMinutes) || 0)) / dayCount(usage.bounds);
  }
  minutes = Math.round(minutes);
  const full = formatAllocationSummaryMinutes(hours * 60);
  const note = cadence === 'weekly' ? `${full} / week` : cadence === 'total' ? `of ${full} total, spread by day` : `of ${full} / ${allocationCadenceUnit(allocation)}, spread by day`;
  return { minutes, note };
}

// Weekly Total: every active allocation with its budget and time logged this week, plus the
// weekly billable target (Settings → Total billable hours per week, default 40) minus logged time.
// Collapsed by default each time MeshTab opens; the open/closed state survives re-renders during the session.
const allocationCenterSectionOpen = { weekly: false, list: false };
function makeAllocationCollapsible(key, className) {
  const details = document.createElement('details'); details.className = `${className} allocation-collapsible`;
  details.open = allocationCenterSectionOpen[key] === true;
  details.addEventListener('toggle', () => { allocationCenterSectionOpen[key] = details.open; });
  return details;
}

function renderAllocationWeeklyTotal(week, weekRows) {
  // The three total cards are always visible; only the per-allocation breakdown collapses.
  const section = document.createElement('section'); section.className = 'allocation-weekly-total';
  const heading = document.createElement('div'); heading.className = 'allocation-summary-heading';
  const title = document.createElement('strong'); title.textContent = 'Weekly total';
  const range = document.createElement('span'); range.textContent = `${week.start.toLocaleDateString()} – ${week.end.toLocaleDateString()} · active allocations`;
  heading.append(title, range);
  const breakdown = makeAllocationCollapsible('weekly', 'allocation-weekly-breakdown');
  const breakdownSummary = document.createElement('summary'); breakdownSummary.className = 'allocation-collapsible-summary';
  const breakdownTitle = document.createElement('strong'); breakdownTitle.textContent = 'Allocation breakdown';
  const glance = document.createElement('em'); glance.className = 'allocation-collapsible-glance';
  breakdownSummary.append(breakdownTitle, glance);
  const active = [...(state.taskAllocations || [])].filter((a) => a.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const table = document.createElement('div'); table.className = 'allocation-weekly-table';
  const headRow = document.createElement('div'); headRow.className = 'allocation-weekly-row allocation-weekly-head';
  for (const label of ['Allocation', 'Budgeted', 'Logged this week', 'Remaining']) { const cell = document.createElement('span'); cell.textContent = label; headRow.append(cell); }
  table.append(headRow);
  let weeklyBudgetMinutes = 0;
  let nonWeeklyCount = 0;
  for (const allocation of active) {
    const clipped = clipAllocationBounds(allocation, week);
    const logged = clipped.start <= clipped.end ? allocationEntries(allocation, clipped).reduce((sum, row) => sum + (Number(row.entry.minutes) || 0), 0) : 0;
    const share = allocationWeeklyBudgetShare(allocation, week);
    let budgetText; let budgetNote = ''; let remainingText = '—'; let over = false;
    if (share.minutes == null) {
      budgetText = allocation.mode === 'unlimited' ? 'Open bucket' : `${formatAllocationSummaryMinutes((Number(allocation.hours) || 0) * 60)} total`;
      budgetNote = allocation.mode === 'unlimited' ? 'No fixed budget' : 'Needs start & end dates to spread';
      nonWeeklyCount += 1;
    } else {
      weeklyBudgetMinutes += share.minutes;
      budgetText = `${formatAllocationSummaryMinutes(share.minutes)} this week`;
      budgetNote = share.note;
      const remaining = share.minutes - logged; over = remaining < 0;
      remainingText = over ? `OVER ${formatAllocationSummaryMinutes(-remaining)}` : formatAllocationSummaryMinutes(remaining);
    }
    const row = document.createElement('div'); row.className = 'allocation-weekly-row';
    const name = document.createElement('span'); name.className = 'allocation-weekly-name';
    const nameStrong = document.createElement('strong'); nameStrong.textContent = allocation.name || 'Untitled allocation';
    const nameMeta = document.createElement('small'); nameMeta.textContent = `${String(allocation.type || '').toUpperCase()}${allocation.reference ? ` · ${allocation.reference}` : ''}`;
    name.append(nameStrong, nameMeta);
    const budgetCell = document.createElement('span'); budgetCell.className = 'allocation-weekly-budget'; const budgetStrong = document.createElement('strong'); budgetStrong.textContent = budgetText; budgetCell.append(budgetStrong); if (budgetNote) { const note = document.createElement('small'); note.textContent = budgetNote; budgetCell.append(note); }
    const loggedCell = document.createElement('span'); loggedCell.textContent = formatAllocationSummaryMinutes(logged);
    const remainingCell = document.createElement('span'); remainingCell.textContent = remainingText; remainingCell.classList.toggle('over-budget', over);
    row.append(name, budgetCell, loggedCell, remainingCell);
    table.append(row);
  }
  if (!active.length) { const empty = document.createElement('div'); empty.className = 'allocation-weekly-empty'; empty.textContent = 'No active allocations.'; table.append(empty); }
  const loggedMinutes = (weekRows || []).reduce((sum, row) => sum + (Number(row.entry.minutes) || 0), 0);
  const targetHours = normalizeWeeklyBillableHours(state.settings.weeklyBillableHours);
  const remainingMinutes = targetHours * 60 - loggedMinutes;
  const totals = document.createElement('div'); totals.className = 'allocation-summary-grid allocation-weekly-totals';
  totals.append(
    allocationTotalCard('BUDGETED THIS WEEK', formatAllocationSummaryMinutes(weeklyBudgetMinutes), nonWeeklyCount ? `Monthly/quarterly/total spread by day · ${nonWeeklyCount} allocation${nonWeeklyCount === 1 ? '' : 's'} can't be spread` : `${active.length} active allocation${active.length === 1 ? '' : 's'}`),
    allocationTotalCard('LOGGED THIS WEEK', formatAllocationSummaryMinutes(loggedMinutes), 'Across all allocations'),
    allocationTotalCard('REMAINING', remainingMinutes >= 0 ? formatAllocationSummaryMinutes(remainingMinutes) : `OVER ${formatAllocationSummaryMinutes(-remainingMinutes)}`, `${formatAllocationSummaryMinutes(targetHours * 60)} billable target − logged this week`, remainingMinutes < 0)
  );
  glance.textContent = `${active.length} active allocation${active.length === 1 ? '' : 's'}`;
  breakdown.append(breakdownSummary, table);
  section.append(heading, totals, breakdown);
  return section;
}

function allocationTotalCard(label, value, meta, over = false) {
  const card = document.createElement('div'); card.className = 'allocation-summary-card'; card.classList.toggle('over-budget', over);
  const kicker = document.createElement('span'); kicker.textContent = label;
  const total = document.createElement('strong'); total.textContent = value;
  const small = document.createElement('small'); small.textContent = meta;
  card.append(kicker, total, small); return card;
}

function renderAllocationsCenter(query = '') {
  const wrap=document.createElement('section'); wrap.className='allocations-center';
  const head=document.createElement('div'); head.className='allocations-center-head';
  const copy=document.createElement('div'); copy.innerHTML='<p class="section-kicker">ALLOCATIONS</p><h2>Allocation Center</h2><span>All Project, Job, Ticket, and Bucket allocations in one place.</span>';
  const add=createButton('+ Allocation','btn btn-primary compact','add-task-allocation','Create allocation'); head.append(copy,add); wrap.append(head);
  const now=new Date(); const week=recurringPeriodBounds('weekly',now); const month=recurringPeriodBounds('monthly',now);
  const summary=document.createElement('section'); summary.className='allocation-summary-section';
  const summaryTitle=document.createElement('div'); summaryTitle.className='allocation-summary-heading'; summaryTitle.innerHTML='<strong>Allocation summary</strong><span>Logged time across all allocations</span>';
  const cards=document.createElement('div'); cards.className='allocation-summary-grid';
  const weekRows=aggregateAllocationEntries(week); const monthRows=aggregateAllocationEntries(month);
  cards.append(allocationSummaryCard('THIS WEEK',weekRows),allocationSummaryCard('THIS MONTH',monthRows));
  for (const type of TASK_ALLOCATION_TYPES) {
    const typeRows=aggregateAllocationEntries(null,type); const count=(state.taskAllocations||[]).filter(a=>a.type===type).length;
    cards.append(allocationSummaryCard(type.toUpperCase(),typeRows,`${count} allocation${count===1?'':'s'} · all logged time`));
  }
  const summaryFoot=document.createElement('div'); summaryFoot.className='allocation-summary-foot';
  const timeLogAll=createButton('Time Log','btn btn-secondary compact','view-all-time-entries','View all time entries for a time period'); summaryFoot.append(timeLogAll);
  summary.append(summaryTitle,cards,summaryFoot); wrap.append(renderAllocationWeeklyTotal(week,weekRows),summary);
  const listSection=makeAllocationCollapsible('list','allocation-center-list');
  const listHead=document.createElement('summary'); listHead.className='allocation-center-list-head allocation-collapsible-summary'; listHead.innerHTML='<div><strong>All allocations</strong><span>Usage, Time Log, Edit, and borrowing controls remain available on each allocation.</span></div>';
  const listCount=document.createElement('em'); listCount.className='allocation-collapsible-glance'; listHead.append(listCount);
  const grid=document.createElement('div'); grid.className='task-allocation-grid allocation-center-grid';
  const normalized=String(query||'').trim().toLowerCase();
  const allocations=[...(state.taskAllocations||[])].filter(a=>!normalized || `${a.name} ${a.reference} ${a.type} ${a.details}`.toLowerCase().includes(normalized)).sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name));
  if(allocations.length) grid.replaceChildren(...allocations.map(makeTaskAllocationCard)); else { const empty=document.createElement('div'); empty.className='task-allocation-empty'; empty.innerHTML='<strong>No allocations match</strong><span>Create an Allocation or clear your search.</span>'; grid.append(empty); }
  const activeCount=allocations.filter(a=>a.active!==false).length; listCount.textContent=`${allocations.length} allocation${allocations.length===1?'':'s'} · ${activeCount} active`;
  listSection.append(listHead,grid); wrap.append(listSection); return wrap;
}

function allTimeEntriesPresetBounds(filterValue) {
  const value = String(filterValue || 'this-week');
  const now = new Date();
  let start = new Date(0); let end = new Date(8640000000000000); let label = 'All time';
  const mondayStart = (date) => { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; };
  if (value === 'this-week') { start = mondayStart(now); end = new Date(start); end.setDate(end.getDate() + 7); end.setMilliseconds(-1); label = 'This week'; }
  else if (value === 'last-week') { end = mondayStart(now); start = new Date(end); start.setDate(start.getDate() - 7); end = new Date(end.getTime() - 1); label = 'Last week'; }
  else if (value === 'this-month') { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 1); end.setMilliseconds(-1); label = 'This month'; }
  else if (value === 'last-month') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 1); end.setMilliseconds(-1); label = 'Last month'; }
  else if (value === 'this-quarter') { const month = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), month, 1); end = new Date(now.getFullYear(), month + 3, 1); end.setMilliseconds(-1); label = 'This quarter'; }
  else if (value === 'last-quarter') { const month = Math.floor(now.getMonth() / 3) * 3; end = new Date(now.getFullYear(), month, 1); start = new Date(end.getFullYear(), end.getMonth() - 3, 1); end = new Date(end.getTime() - 1); label = 'Last quarter'; }
  else if (value === 'this-year') { start = new Date(now.getFullYear(), 0, 1); end = new Date(now.getFullYear() + 1, 0, 1); end.setMilliseconds(-1); label = 'This year'; }
  else if (value === 'last-year') { start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear(), 0, 1); end.setMilliseconds(-1); label = 'Last year'; }
  else if (value === 'custom') {
    const startValue = $('#allTimeEntriesStart')?.value;
    const endValue = $('#allTimeEntriesEnd')?.value;
    start = startValue ? new Date(`${startValue}T00:00:00`) : new Date(0);
    end = endValue ? new Date(`${endValue}T23:59:59.999`) : new Date();
    label = startValue || endValue ? `${startValue ? new Date(`${startValue}T00:00:00`).toLocaleDateString() : 'Beginning'} – ${endValue ? new Date(`${endValue}T00:00:00`).toLocaleDateString() : 'Present'}` : 'Custom range';
  }
  return { start, end, label };
}

function allTaskTimeEntries(bounds) {
  const rows = [];
  for (const task of (state.tasks || [])) {
    for (const entry of (task.timeEntries || [])) {
      const when = new Date(entry.loggedAt);
      if (!Number.isFinite(when.getTime()) || when < bounds.start || when > bounds.end) continue;
      rows.push({ task, entry, when, allocation: taskAllocationById(task.allocationId) });
    }
  }
  return rows.sort((a,b) => b.when - a.when);
}

function allTimeEntriesDayKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function combinedTimeEntryDescription(rows, limit) {
  const parts = (rows || []).map((row) => (row.entry.details || '').trim()).filter(Boolean);
  const combined = parts.join('  •  ');
  if (!combined) return '';
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 500;
  if (combined.length <= max) return combined;
  return `${combined.slice(0, max).trimEnd()}…`;
}

function buildAllTimeEntriesSubBreakdown(rows, mode, combineDesc, descLimit) {
  const items = groupAllTimeEntries(rows, mode);
  const wrap = document.createElement('div'); wrap.className = 'all-time-entries-day-breakdown';
  wrap.append(...items.map((item) => {
    const itemRow = document.createElement('div'); itemRow.className = 'all-time-entries-day-row';
    const head = document.createElement('div'); head.className = 'all-time-entries-day-row-head';
    const name = document.createElement('span'); name.textContent = mode === 'allocation' && item.secondary ? `${item.name} · ${item.secondary}` : item.name;
    const duration = document.createElement('span'); duration.className = 'all-time-entries-day-duration'; duration.textContent = formatTaskMinutes(item.minutes);
    head.append(name, duration); itemRow.append(head);
    if (combineDesc) {
      const desc = document.createElement('textarea'); desc.className = 'all-time-entries-day-desc'; desc.readOnly = true; desc.rows = 2;
      desc.value = combinedTimeEntryDescription(item.rows, descLimit) || 'No details';
      itemRow.append(desc);
    }
    return itemRow;
  }));
  return wrap;
}

function groupAllTimeEntries(rows, mode) {
  const groups = new Map();
  for (const row of rows) {
    let key, name, secondary;
    if (mode === 'day') {
      key = allTimeEntriesDayKey(row.when);
      name = row.when.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
      secondary = '';
    } else if (mode === 'allocation') {
      key = row.allocation ? row.allocation.id : '__unassigned__';
      name = row.allocation ? row.allocation.name : 'Unassigned';
      secondary = row.allocation ? `${row.allocation.type.toUpperCase()}${row.allocation.reference ? ` · ${row.allocation.reference}` : ''}` : 'No allocation';
    } else {
      key = row.task.id;
      name = row.task.title;
      secondary = row.allocation ? `${row.allocation.type.toUpperCase()} · ${row.allocation.name}` : 'Unassigned';
    }
    if (!groups.has(key)) groups.set(key, { key, name, secondary, minutes: 0, count: 0, taskIds: new Set(), rows: [] });
    const group = groups.get(key);
    group.minutes += Number(row.entry.minutes) || 0;
    group.count += 1;
    group.taskIds.add(row.task.id);
    group.rows.push(row);
  }
  const list = [...groups.values()];
  if (mode === 'day') list.sort((a, b) => b.key.localeCompare(a.key));
  else list.sort((a, b) => b.minutes - a.minutes);
  return list;
}

function renderAllTimeEntries() {
  const filter = $('#allTimeEntriesFilter')?.value || 'this-week';
  const custom = $('#allTimeEntriesCustomRange');
  if (custom) custom.classList.toggle('hidden', filter !== 'custom');
  const bounds = allTimeEntriesPresetBounds(filter);
  const valid = bounds.start <= bounds.end;
  const rows = valid ? allTaskTimeEntries(bounds) : [];
  const totalMinutes = rows.reduce((sum, row) => sum + (Number(row.entry.minutes) || 0), 0);
  const summary = $('#allTimeEntriesSummary');
  if (summary) {
    summary.replaceChildren();
    const strong = document.createElement('strong'); strong.textContent = bounds.label;
    const span = document.createElement('span'); span.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} · ${formatTaskMinutes(totalMinutes)} logged · ${new Set(rows.map((row) => row.task.id)).size} task(s)`;
    summary.append(strong, span);
  }
  const groupBy = $('#allTimeEntriesGroupBy')?.value || 'none';
  allTimeEntriesView = groupBy;
  const splitCapable = groupBy === 'task' || groupBy === 'allocation';
  $('#allTimeEntriesSplitByDayWrap')?.classList.toggle('hidden', !splitCapable);
  const splitByDay = splitCapable && Boolean($('#allTimeEntriesSplitByDay')?.checked);
  allTimeEntriesSplitByDay = splitByDay;
  const splitByProjectCapable = groupBy === 'day';
  $('#allTimeEntriesSplitByProjectWrap')?.classList.toggle('hidden', !splitByProjectCapable);
  const splitByProject = splitByProjectCapable && Boolean($('#allTimeEntriesSplitByProject')?.checked);
  allTimeEntriesSplitByProject = splitByProject;
  const grouped = groupBy !== 'none';
  $('#allTimeEntriesHead')?.classList.toggle('hidden', grouped);
  $('#allTimeEntriesChartToggleWrap')?.classList.toggle('hidden', !grouped);
  const dayCapable = splitByDay || splitByProject;
  $('#allTimeEntriesCombineDescWrap')?.classList.toggle('hidden', !dayCapable);
  const combineDesc = dayCapable && Boolean($('#allTimeEntriesCombineDesc')?.checked);
  allTimeEntriesCombineDesc = combineDesc;
  $('#allTimeEntriesDescLimitWrap')?.classList.toggle('hidden', !combineDesc);
  const descLimitRaw = Number($('#allTimeEntriesDescLimit')?.value);
  const descLimit = Number.isFinite(descLimitRaw) && descLimitRaw > 0 ? Math.floor(descLimitRaw) : 500;
  allTimeEntriesDescLimit = descLimit;
  const chart = $('#allTimeEntriesChart');
  const list = $('#allTimeEntriesList'); if (!list) return;
  if (!rows.length) {
    chart?.classList.add('hidden');
    const empty = document.createElement('div'); empty.className = 'task-allocation-empty'; empty.textContent = valid ? 'No time entries in this time frame.' : 'Choose a valid date range.'; list.replaceChildren(empty); return;
  }
  if (!grouped) {
    chart?.classList.add('hidden');
    list.className = 'allocation-time-log-list';
    list.replaceChildren(...rows.map(({task, entry, when, allocation}) => {
      const row = document.createElement('div'); row.className = 'allocation-time-log-row all-time-entries-row';
      const stamp = document.createElement('div'); stamp.className = 'allocation-time-log-stamp';
      const date = document.createElement('strong'); date.textContent = when.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
      const time = document.createElement('span'); time.textContent = when.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }); stamp.append(date, time);
      const taskName = document.createElement('strong'); taskName.className = 'allocation-time-log-task'; taskName.textContent = task.title;
      const allocationName = document.createElement('span'); allocationName.className = 'allocation-time-log-allocation'; allocationName.textContent = allocation ? `${allocation.type.toUpperCase()} · ${allocation.name}` : 'Unassigned';
      const duration = document.createElement('strong'); duration.className = 'allocation-time-log-duration'; duration.textContent = formatTaskMinutes(entry.minutes);
      const details = document.createElement('span'); details.className = 'allocation-time-log-details'; details.textContent = entry.details || 'No details';
      row.append(stamp, taskName, allocationName, duration, details); return row;
    }));
    return;
  }
  const groups = groupAllTimeEntries(rows, groupBy);
  const maxMinutes = Math.max(1, ...groups.map((group) => group.minutes));
  if (chart) {
    chart.classList.toggle('hidden', !allTimeEntriesShowChart);
    chart.replaceChildren(...groups.map((group) => {
      const row = document.createElement('div'); row.className = 'all-time-entries-chart-row';
      const label = document.createElement('span'); label.className = 'all-time-entries-chart-label'; label.textContent = group.name; label.title = group.name;
      const track = document.createElement('div'); track.className = 'all-time-entries-chart-track';
      const fill = document.createElement('div'); fill.className = 'all-time-entries-chart-fill'; fill.style.width = `${Math.max(2, Math.round((group.minutes / maxMinutes) * 100))}%`;
      track.append(fill);
      const value = document.createElement('span'); value.className = 'all-time-entries-chart-value'; value.textContent = formatTaskMinutes(group.minutes);
      row.append(label, track, value); return row;
    }));
  }
  const splitMode = groupBy === 'day' ? (splitByProject ? 'allocation' : null) : (splitByDay ? 'day' : null);
  list.className = 'allocation-time-log-list all-time-entries-group-list';
  list.replaceChildren(...groups.map((group) => {
    const row = document.createElement('div'); row.className = `all-time-entries-group-row${splitMode ? ' with-days' : ''}`;
    const name = document.createElement('div'); name.className = 'all-time-entries-group-name';
    const title = document.createElement('strong'); title.textContent = group.name;
    const secondary = document.createElement('span'); secondary.textContent = group.secondary;
    name.append(title, secondary);
    const duration = document.createElement('strong'); duration.className = 'allocation-time-log-duration'; duration.textContent = formatTaskMinutes(group.minutes);
    const stats = document.createElement('span'); stats.className = 'all-time-entries-group-stats'; const pct = totalMinutes ? Math.round((group.minutes / totalMinutes) * 100) : 0; stats.textContent = `${pct}% · ${group.count} entr${group.count === 1 ? 'y' : 'ies'}${groupBy === 'allocation' ? ` · ${group.taskIds.size} task${group.taskIds.size === 1 ? '' : 's'}` : ''}`;
    row.append(name, duration, stats);
    if (splitMode) row.append(buildAllTimeEntriesSubBreakdown(group.rows, splitMode, combineDesc, descLimit));
    return row;
  }));
}

function openAllTimeEntries(selectedValue = 'this-week') {
  const select = $('#allTimeEntriesFilter');
  if (select && !select.options.length) {
    const addOption = (value, label) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); };
    addOption('this-week', 'This week'); addOption('last-week', 'Last week');
    addOption('this-month', 'This month'); addOption('last-month', 'Last month');
    addOption('this-quarter', 'This quarter'); addOption('last-quarter', 'Last quarter');
    addOption('this-year', 'This year'); addOption('last-year', 'Last year');
    addOption('all', 'All time'); addOption('custom', 'Custom date range');
  }
  if (select && Array.from(select.options).some((option) => option.value === selectedValue)) select.value = selectedValue;
  const today = localDateInputValue(new Date());
  const startInput = $('#allTimeEntriesStart'); const endInput = $('#allTimeEntriesEnd');
  if (startInput && !startInput.value) { const first = new Date(); first.setDate(1); startInput.value = localDateInputValue(first); }
  if (endInput && !endInput.value) endInput.value = today;
  renderAllTimeEntries();
  if (!allTimeEntriesDialog.open) allTimeEntriesDialog.showModal();
}

function renderTaskCenter() {
  $('#taskWorkspaceTotal').textContent = (state.tasks || []).length;
  renderTaskAnalytics();
  renderTaskAllocations();
  const filter = validTaskGroupFilter(state.settings.taskRailFilter || 'all');
  state.settings.taskRailFilter = filter;
  populateTaskGroupSelect($('#taskOpenGroupFilter'), true, filter);
  const open = openTasks(filter);
  const working = open.filter((task) => taskWorkState(task) === 'working');
  const ongoing = open.filter((task) => taskWorkState(task) === 'ongoing');
  const queued = open.filter((task) => taskWorkState(task) === 'todo');
  $('#workingTaskSummary').textContent = `${working.length} active`;
  const workingList = $('#workingTaskList');
  if (working.length) workingList.replaceChildren(...working.map((task)=>makeTaskRow(task,false)));
  else { const empty=document.createElement('div'); empty.className='task-empty working-empty'; empty.textContent='No tasks are marked Working.'; workingList.replaceChildren(empty); }
  const ongoingList=$('#ongoingTaskList'); $('#ongoingTaskSummary').textContent=`${ongoing.length} ongoing`;
  if (ongoing.length) ongoingList.replaceChildren(...ongoing.map((task)=>makeTaskRow(task,false)));
  else { const empty=document.createElement('div'); empty.className='task-empty'; empty.textContent='No ongoing tasks in this view.'; ongoingList.replaceChildren(empty); }
  renderTaskRecommendations($('#nextTaskCard'), filter);
  $('#openTaskSummary').textContent=`${queued.length} to do · ${working.length} working · ${ongoing.length} ongoing`;
  const list=$('#openTaskList');
  if (queued.length) list.replaceChildren(...queued.map((task)=>makeTaskRow(task,false)));
  else { const empty=document.createElement('div'); empty.className='task-empty'; empty.textContent='No To Do tasks in this view.'; list.replaceChildren(empty); }
  const range=$('#taskReportRange').value || 'week'; $('#taskCustomRange').classList.toggle('hidden', range !== 'custom');
  const {start,end}=taskReportBounds(range);
  const completed=(state.tasks || []).filter((task)=>task.status==='done' && task.completedAt && new Date(task.completedAt)>=start && new Date(task.completedAt)<=end).sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt));
  const visibleIds = new Set(completed.map((task) => task.id));
  for (const taskId of Array.from(selectedCompletedTaskIds)) if (!visibleIds.has(taskId)) selectedCompletedTaskIds.delete(taskId);
  const minutes=completed.reduce((sum,task)=>sum+(task.minutesSpent||0),0);
  $('#completedTaskSummary').textContent=`${completed.length} closed · ${formatTaskMinutes(minutes)} logged`;
  const doneList=$('#completedTaskList');
  if(completed.length) doneList.replaceChildren(...completed.map((task)=>makeTaskRow(task,true)));
  else { const empty=document.createElement('div'); empty.className='task-empty'; empty.textContent='No completed tasks in this time frame.'; doneList.replaceChildren(empty); }
  updateCompletedSelectionSummary();
}

function renderTaskRail() {
  const all = state.tasks || [];
  const filter = validTaskGroupFilter(state.settings.taskRailFilter || 'all');
  state.settings.taskRailFilter = filter;
  const open = openTasks(filter);
  $('#taskTotalCount').textContent = all.length;
  $('#taskRailOpenCount').textContent = open.length;
  $('#collapsedTaskCount').textContent = open.length;
  populateTaskGroupSelect($('#taskRailGroupFilter'), true, filter);
  const recommendation = $('#taskRailRecommendation');
  const working = open.filter((task) => taskWorkState(task) === 'working');
  const ongoing = open.filter((task) => taskWorkState(task) === 'ongoing');
  const todo = open.filter((task) => taskWorkState(task) === 'todo');
  recommendation.replaceChildren();
  if (working.length) {
    const label=document.createElement('small'); label.textContent='WORKING';
    const title=document.createElement('strong'); title.textContent=working[0].title;
    const meta=document.createElement('span'); meta.textContent=working.length > 1 ? `${working.length} active tasks` : '1 active task';
    recommendation.append(label,title,meta);
  } else if (ongoing.length) {
    const label=document.createElement('small'); label.textContent='ONGOING';
    const title=document.createElement('strong'); title.textContent=ongoing[0].title;
    const meta=document.createElement('span'); meta.textContent=ongoing.length > 1 ? `${ongoing.length} ongoing tasks` : '1 ongoing task';
    recommendation.append(label,title,meta);
  } else if (!open.length) recommendation.innerHTML = '<strong>All clear</strong><span>No open tasks in this filter.</span>';
  else {
    const label=document.createElement('small'); label.textContent='TO DO';
    const title=document.createElement('strong'); title.textContent=`${todo.length} task${todo.length === 1 ? '' : 's'} to do`;
    const hint=document.createElement('span'); hint.textContent='Open Task Center to choose work or ask for recommendations.';
    recommendation.append(label,title,hint);
  }
  if (expandedTaskRailTaskId && !open.some((task)=>task.id===expandedTaskRailTaskId)) expandedTaskRailTaskId=null;
  const compact = $('#taskRailOpenList');
  if (open.length) compact.replaceChildren(...open.map((task, index) => makeCompactTaskRow(task, index === 0)));
  else { const empty=document.createElement('div'); empty.className='task-compact-empty'; empty.textContent='No open tasks'; compact.replaceChildren(empty); }
  if (state.settings.activeView === 'tasks') renderTaskCenter();
}

async function openTaskInCenter(taskId) {
  const task=(state.tasks||[]).find((item)=>item.id===String(taskId||''));
  if(!task) return;
  expandedTaskRailTaskId=null;
  state.settings.taskRailFilter=validTaskGroupFilter(task.taskGroupId || 'all');
  state.settings.activeView='tasks';
  if (task.status === 'done' && task.completedAt) {
    const completedDate = MeshTabReminders.localDateKey(new Date(task.completedAt));
    $('#taskReportRange').value = 'custom';
    $('#taskReportStart').value = completedDate;
    $('#taskReportEnd').value = completedDate;
  }
  await saveState();
  render();
  setTimeout(()=>{
    const row=Array.from(document.querySelectorAll('#taskWorkspace [data-task-id]')).find((item)=>item.dataset.taskId===task.id);
    if(!row) return;
    row.scrollIntoView({block:'center',behavior:'smooth'});
    row.classList.add('task-focus-flash');
    setTimeout(()=>row.classList.remove('task-focus-flash'),1300);
  },40);
}

async function openTaskCenter() {
  state.settings.activeView = 'tasks';
  await saveState();
  render();
}

async function handleTaskSubmit(event) {
  event.preventDefault(); const title=$('#taskTitle').value.trim(); if(!title) return;
  const now=new Date().toISOString(); state.tasks ||= [];
  const selectedWorkState = ['todo','working','ongoing','closed'].includes($('#taskWorkState').value) ? $('#taskWorkState').value : 'todo';
  if (editingTaskId) {
    const task=state.tasks.find((item)=>item.id===editingTaskId); if(!task) return;
    task.title=title.slice(0,140); task.details=$('#taskDetails').value.trim().slice(0,1600); task.taskGroupId=$('#taskGroup').value; task.allocationId=taskAllocationById($('#taskAllocation').value)?$('#taskAllocation').value:''; task.priority=$('#taskPriority').value; task.dueDate=$('#taskDueDate').value; task.updatedAt=now;
    if (selectedWorkState === 'closed') { task.status='done'; task.workState='closed'; task.working=false; task.workingSince=''; task.completedAt=task.completedAt || now; }
    else { task.status='open'; task.workState=selectedWorkState; task.working=selectedWorkState==='working'; task.workingSince=task.working ? (task.workingSince || now) : ''; task.completedAt=''; }
  } else state.tasks.push({id:uid('task'),title:title.slice(0,140),details:$('#taskDetails').value.trim().slice(0,1600),taskGroupId:$('#taskGroup').value,allocationId:taskAllocationById($('#taskAllocation').value)?$('#taskAllocation').value:'',priority:$('#taskPriority').value,status:selectedWorkState==='closed'?'done':'open',workState:selectedWorkState,working:selectedWorkState==='working',workingSince:selectedWorkState==='working'?now:'',createdAt:now,updatedAt:now,dueDate:$('#taskDueDate').value,completedAt:selectedWorkState==='closed'?now:'',closureNotes:'',timeEntries:[],taskNotes:[],minutesSpent:0});
  await saveState(); taskDialog.close(); editingTaskId=null; render(); toast('Task saved.');
}

async function handleTaskComplete(event) {
  event.preventDefault(); const task=(state.tasks||[]).find((item)=>item.id===completingTaskId); if(!task) return;
  const enteredTime = Math.max(0, Number.parseFloat($('#taskMinutesSpent').value) || 0);
  const additionalMinutes = $('#taskTimeUnit').value === 'hours' ? Math.round(enteredTime * 60) : Math.round(enteredTime);
  if (additionalMinutes > 0) appendTaskTimeEntry(task, additionalMinutes, $('#taskCompletionTimeDetails').value.trim(), dateWithSelectedWorkDay($('#taskCompletionTimeDate').value, new Date()));
  task.status='done'; task.workState='closed'; task.working=false; task.workingSince=''; task.completedAt=new Date().toISOString(); task.updatedAt=task.completedAt; task.closureNotes=$('#taskClosureNotes').value.trim().slice(0,2200); syncTaskLoggedMinutes(task);
  await saveState(); taskCompleteDialog.close(); completingTaskId=null; render(); toast(`Task completed · ${formatTaskMinutes(task.minutesSpent)} logged.`);
}

async function handleTaskTimeSubmit(event) {
  event.preventDefault();
  const task=(state.tasks||[]).find((item)=>item.id===loggingTaskTimeId); if(!task) return;
  const amount=Math.max(0,Number.parseFloat($('#taskTimeAmount').value)||0);
  const minutes=$('#taskTimeUnitQuick').value==='minutes' ? Math.round(amount) : Math.round(amount*60);
  if (!minutes) { toast('Choose a time amount to log.'); return; }
  const details = $('#taskTimeDetails').value.trim();
  const fromTimer = loggingTaskTimeFromTimerSeconds != null;
  const existing = editingTaskTimeEntryId ? (task.timeEntries || []).find((item) => item.id === editingTaskTimeEntryId) : null;
  if (existing) {
    existing.minutes = Math.max(1, Math.min(100000, minutes));
    existing.details = details.slice(0, 1200);
    existing.loggedAt = dateWithSelectedWorkDay($('#taskTimeDate').value, new Date(existing.loggedAt)).toISOString();
    syncTaskLoggedMinutes(task);
    task.updatedAt = new Date().toISOString();
  } else {
    appendTaskTimeEntry(task, minutes, details, dateWithSelectedWorkDay($('#taskTimeDate').value, new Date()));
  }
  await saveState();
  taskTimeDialog.close();
  render();
  toast(existing ? `Time entry updated · ${formatTaskMinutes(minutes)}.` : fromTimer ? `Timer logged · ${formatTaskMinutes(minutes)} added to ${task.title}.` : `${formatTaskMinutes(minutes)} added to ${task.title}.`);
}

function renderOpenTabs(query = '') {
  const normalized = query.trim().toLowerCase();
  const total = openTabWindows.reduce((sum, windowItem) => sum + windowItem.tabs.length, 0);
  $('#openTabCount').textContent = total;
  $('#collapsedOpenTabCount').textContent = total;
  const groups = [];
  openTabWindows.forEach((windowItem, index) => {
    const matchingTabs = windowItem.tabs.filter((tab) => !normalized || `${tab.title || ''} ${tabUrl(tab)}`.toLowerCase().includes(normalized));
    if (!matchingTabs.length) return;
    const group = document.createElement('section');
    group.className = 'tab-window-group';
    const label = document.createElement('div');
    label.className = 'tab-window-label';
    label.textContent = windowItem.focused ? 'Current window' : `Window ${index + 1}`;
    group.append(label);
    for (const tab of matchingTabs) {
      const url = tabUrl(tab);
      const bookmarkable = isBookmarkableUrl(url);
      const card = document.createElement('article');
      card.className = `open-tab-card${tab.active ? ' active' : ''}${bookmarkable ? '' : ' unsupported'}`;
      card.dataset.tabId = String(tab.id);
      card.dataset.windowId = String(tab.windowId);
      card.draggable = bookmarkable;
      card.title = bookmarkable ? 'Drag into a project or click to switch to this tab' : 'Click to switch to this Chrome page';
      const badge = createFaviconBadge({ title: tab.title, url }, 'tab-badge', tab.favIconUrl);
      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.className = 'tab-focus';
      focusButton.dataset.action = 'focus-tab';
      focusButton.dataset.tabId = String(tab.id);
      focusButton.dataset.windowId = String(tab.windowId);
      const title = document.createElement('strong');
      title.textContent = tab.title || domainFor(url);
      const domain = document.createElement('span');
      domain.textContent = domainFor(url);
      focusButton.append(title, domain);
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = bookmarkable ? '::' : '-';
      card.append(badge, focusButton, handle);
      group.append(card);
    }
    groups.push(group);
  });
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'tabs-empty';
    empty.textContent = normalized ? 'No open tabs match your search.' : 'No other open Chrome tabs.';
    openTabsList.replaceChildren(empty);
  } else openTabsList.replaceChildren(...groups);
}

function renderDesktops() {
  let view = state.settings.activeView || 'desktop';
  if ((view === 'general-notes' && !state.settings.showNotes) || ((view === 'tasks' || view === 'allocations') && !state.settings.showTasks) || (view === 'reminders' && !state.settings.showReminders) || (view === 'overlays' && !state.settings.showOverlays)) { state.settings.activeView = 'desktop'; view = 'desktop'; }

  const home = document.createElement('button');
  home.type = 'button';
  home.className = `desktop-tab home-hub-tab${view === 'home' ? ' active' : ''}`;
  home.dataset.action = 'switch-view';
  home.dataset.view = 'home';
  home.title = 'Home: General Notes, Tasks, Reminders, Allocations, Overlays, and Archive';
  home.setAttribute('aria-label', 'Home');
  home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/></svg>';

  const buttons = state.desktops.filter((desktop) => !desktop.archived).map((desktop) => {
    if (renamingDesktopId === desktop.id) {
      const wrap = document.createElement('span');
      wrap.className = 'desktop-tab desktop-tab-renaming';
      wrap.dataset.desktopId = desktop.id;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'desktop-tab-rename-input';
      input.maxLength = 60;
      input.value = desktop.title;
      input.dataset.desktopId = desktop.id;
      wrap.append(input);
      return wrap;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `desktop-tab${desktop.type === 'calendar' ? ' calendar-desktop-tab' : ''}${view === 'desktop' && desktop.id === state.activeDesktopId ? ' active' : ''}`;
    button.dataset.desktopId = desktop.id;
    button.dataset.action = 'switch-desktop';
    button.draggable = true;
    button.textContent = desktop.title;
    button.title = desktop.type === 'calendar' ? 'Google Calendar Tab. Click to open; double-click to rename; drag the Tab itself to reorder it.' : 'Click to switch. Double-click to rename. Drag this Tab to reorder it, or drag a group here to move the group to this Tab.';
    return button;
  });
  desktopTabs.replaceChildren(home, ...buttons);
  if (renamingDesktopId) {
    const input = desktopTabs.querySelector('.desktop-tab-rename-input');
    if (input) { input.focus(); input.select(); }
  }
}

const QUICK_LINK_VIEWS = ['general-notes', 'tasks', 'reminders', 'allocations', 'overlays', 'archive'];
function shouldShowQuickLinks(view) {
  if (QUICK_LINK_VIEWS.includes(view)) return true;
  return view === 'desktop' && state.settings.showQuickLinks === true;
}

function renderQuickLinks() {
  const view = state.settings.activeView || 'desktop';
  const bar = $('#quickLinksBar');
  const visible = shouldShowQuickLinks(view);
  bar?.classList.toggle('hidden', !visible);
  if (!visible) { quickLinksTabs.replaceChildren(); return; }
  const makeLink = (viewName, label, title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `quick-link-tab${view === viewName ? ' active' : ''}`;
    button.dataset.action = 'switch-view';
    button.dataset.view = viewName;
    button.textContent = label;
    button.title = title;
    return button;
  };
  const buttons = [];
  if (state.settings.showNotes) buttons.push(makeLink('general-notes', 'General Notes', 'Show General Notes'));
  if (state.settings.showTasks) buttons.push(makeLink('tasks', `Tasks (${openTasks().length})`, 'Open the full Mesh Tasks workspace'));
  if (state.settings.showReminders) buttons.push(makeLink('reminders', `Reminders (${activeReminderCount()})`, 'Open reminders, countdowns, recurring schedules, and snooze controls'));
  if (state.settings.showTasks) buttons.push(makeLink('allocations', `Allocations (${(state.taskAllocations || []).length})`, 'Open Allocation Center'));
  if (state.settings.showOverlays) buttons.push(makeLink('overlays', `Overlays (${(state.siteOverlays || []).length})`, 'Manage website-specific screen-edge overlays'));
  buttons.push(makeLink('archive', `Archive (${state.buckets.filter((bucket) => bucket.archived).length + state.desktops.filter((desktop) => desktop.archived).length})`, 'View archived Tabs and groups'));
  quickLinksTabs.replaceChildren(...buttons);
}

quickLinksTabs.addEventListener('click', handleNavigationClick);

function applyOpenPagesState() {
  const collapsed = Boolean(state?.settings?.openPagesCollapsed);
  const rail = $('#openPagesRail');
  const workspace = document.querySelector('.workspace-layout');
  rail?.classList.toggle('collapsed', collapsed);
  workspace?.classList.toggle('open-pages-collapsed', collapsed);
  const collapseButton = $('#collapseOpenPagesBtn');
  if (collapseButton) {
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand Open Pages' : 'Collapse Open Pages');
    collapseButton.title = collapsed ? 'Expand Open Pages' : 'Collapse Open Pages';
  }
}

async function setOpenPagesCollapsed(collapsed) {
  state.settings.openPagesCollapsed = Boolean(collapsed);
  applyOpenPagesState();
  await saveState();
}

function applyTaskRailState() {
  const workspace = document.querySelector('.workspace-layout');
  const full = state?.settings?.activeView === 'tasks' && state.settings.showTasks;
  const collapsed = !full && Boolean(state?.settings?.taskRailCollapsed);
  taskRail?.classList.toggle('full', full);
  taskRail?.classList.toggle('collapsed', collapsed);
  workspace?.classList.toggle('tasks-view', full);
  workspace?.classList.toggle('tasks-collapsed', collapsed);
  workspace?.classList.toggle('no-reminder-rail', !state.settings.showReminders);
  const collapseButton = $('#collapseTaskRailBtn');
  if (collapseButton) {
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.disabled = full;
    collapseButton.title = full ? 'Tasks are expanded in the Tasks Tab' : 'Collapse Mesh Tasks';
  }
}

async function setTaskRailCollapsed(collapsed) {
  if (state.settings.activeView === 'tasks') return;
  state.settings.taskRailCollapsed = Boolean(collapsed);
  applyTaskRailState();
  await saveState();
}


function resolvedAppearance() {
  const requested = state?.settings?.appearance || 'light';
  if (requested === 'system') return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  return requested === 'dark' ? 'dark' : 'light';
}

function applyTabPresentation() {
  const fontSize = Math.max(10, Math.min(18, Number(state?.settings?.tabFontSize) || 12));
  const spacing = Math.max(2, Math.min(20, Number.parseInt(state?.settings?.tabSpacing, 10) || 7));
  document.documentElement.style.setProperty('--desktop-tab-font-size', `${fontSize}px`);
  document.documentElement.style.setProperty('--desktop-tab-gap', `${spacing}px`);
}

function applyAppearance() {
  document.documentElement.dataset.theme = resolvedAppearance();
  applyTabPresentation();
  applyHeaderClockSize();
  applyTextSize();
}

function applyTextSize() {
  const size = TEXT_SIZES.includes(state?.settings?.textSize) ? state.settings.textSize : 'small';
  document.documentElement.dataset.textSize = size;
}

function applyHeaderClockSize() {
  const block = $('#dateBlock'); if (!block) return;
  const size = HEADER_CLOCK_SIZES.includes(state?.settings?.headerClockSize) ? state.settings.headerClockSize : 'medium';
  for (const option of HEADER_CLOCK_SIZES) block.classList.toggle(`clock-size-${option}`, option === size);
}

function ownsNewTabOverride() {
  return chrome.runtime.getManifest()?.chrome_url_overrides?.newtab === 'newtab.html';
}

function validHomeDefaultDesktopId(value) {
  const id = String(value || '');
  return id === 'last-active' || state.desktops.some((desktop) => desktop.id === id) ? id : 'last-active';
}

function populateHomeDefaultDesktopSelect() {
  const select = $('#settingHomeDefaultDesktop');
  if (!select) return;
  const selected = validHomeDefaultDesktopId(state.settings.homeDefaultDesktopId);
  select.replaceChildren();
  const lastActive = document.createElement('option');
  lastActive.value = 'last-active';
  lastActive.textContent = 'Last active Tab';
  select.append(lastActive);
  for (const desktop of state.desktops.filter((candidate) => !candidate.archived)) {
    const option = document.createElement('option');
    option.value = desktop.id;
    option.textContent = desktop.title;
    select.append(option);
  }
  select.value = selected;
}

function isFreshHomeNewTabLaunch() {
  if (!ownsNewTabOverride() || state.settings.useMeshTabNewTab === false) return false;
  const source = new URLSearchParams(location.search).get('mt_source');
  return !source;
}

function applyDefaultHomeTabForLaunch() {
  if (!isFreshHomeNewTabLaunch()) return;
  const selected = validHomeDefaultDesktopId(state.settings.homeDefaultDesktopId);
  if (selected !== 'last-active') state.activeDesktopId = selected;
  state.settings.activeView = 'desktop';
}

function updateNewTabBuildStatus() {
  const target = $('#newTabBuildStatus');
  const toggle = $('#settingUseMeshTabNewTab');
  const defaultTab = $('#settingHomeDefaultDesktop');
  if (!target || !toggle) return;
  const ownsNewTab = ownsNewTabOverride();
  toggle.disabled = !ownsNewTab;
  if (defaultTab) defaultTab.disabled = !(ownsNewTab && toggle.checked);
  target.classList.toggle('active', ownsNewTab && state.settings.useMeshTabNewTab !== false);
  target.innerHTML = ownsNewTab
    ? (state.settings.useMeshTabNewTab !== false
      ? '<strong>MeshTab New Tab is ON</strong><small>Fresh new tabs open the Default Home Tab selected below. The Home Screen link at the top opens Chrome\'s built-in New Tab page.</small>'
      : '<strong>MeshTab New Tab is OFF</strong><small>New tabs are sent to Chrome\'s built-in New Tab page. Open MeshTab normally from the extension when you want the workspace.</small>')
    : '<strong>New Tab override unavailable</strong><small>This installed build does not currently own Chrome New Tab.</small>';
}

function applyHomeScreenControl() {
  const button = $('#homeScreenBtn');
  if (!button) return;
  const enabled = ownsNewTabOverride() && state.settings.useMeshTabNewTab !== false;
  button.hidden = !(enabled && currentMeshTabPinned === false);
}

async function refreshCurrentMeshTabPinState() {
  try {
    const tab = await chrome.tabs.getCurrent();
    currentMeshTabId = Number.isInteger(tab?.id) ? tab.id : null;
    currentMeshTabPinned = typeof tab?.pinned === 'boolean' ? tab.pinned : null;
  } catch (error) {
    console.warn('Could not determine whether this MeshTab is pinned.', error);
    currentMeshTabId = null;
    currentMeshTabPinned = null;
  }
  applyHomeScreenControl();
}

function applyFeatureVisibility() {
  applyHomeScreenControl();
  const workspace = document.querySelector('.workspace-layout');
  const view = state.settings.activeView || 'desktop';
  const showNotes = state.settings.showNotes !== false;
  const showTasks = state.settings.showTasks !== false;
  const showReminders = state.settings.showReminders !== false;
  const showOverlays = state.settings.showOverlays !== false;
  $('#addContentNoteBtn').hidden = !showNotes;
  $('#addContentTaskBtn').hidden = !showTasks;
  updateAddMenuContentItems();
  $('#noteCount')?.closest('.stat')?.toggleAttribute('hidden', !showNotes);
  $('#openTaskCount')?.closest('.stat')?.toggleAttribute('hidden', !showTasks);
  taskRail.hidden = !showTasks;
  const rightVisible = showTasks;
  rightRailStack.hidden = !rightVisible;
  workspace.classList.remove('reminders-view');
  workspace.classList.add('no-reminder-rail');
  workspace.classList.toggle('no-right-rail', !rightVisible && view !== 'tasks');
  const calendarWide = view === 'desktop' && activeDesktop()?.type === 'calendar';
  workspace.classList.toggle('wide-content-view', view === 'allocations' || view === 'archive' || view === 'home' || calendarWide);
  workspace.classList.toggle('open-pages-hidden', view === 'general-notes' || view === 'reminders' || view === 'overlays');
}

function updateTabSettingReadouts() {
  const font = $('#settingTabFontSize');
  const spacing = $('#settingTabSpacing');
  if ($('#settingTabFontSizeValue') && font) $('#settingTabFontSizeValue').textContent = `${Number(font.value || 12).toFixed(Number(font.value || 12) % 1 ? 1 : 0)} px`;
  if ($('#settingTabSpacingValue') && spacing) $('#settingTabSpacingValue').textContent = `${Number.parseInt(spacing.value, 10) || 7} px`;
}

function openSettingsDialog() {
  $('#settingOpenOnStart').checked = state.settings.openOnStart !== false;
  $('#settingPinOnStart').checked = state.settings.pinOnStart !== false;
  $('#settingPinOnOpen').checked = state.settings.pinOnOpen !== false;
  $('#settingUseMeshTabNewTab').checked = ownsNewTabOverride() && state.settings.useMeshTabNewTab !== false;
  const scope = state.settings.meshTabScope === 'all-windows' ? 'all-windows' : 'per-window';
  const radio = document.querySelector(`input[name="meshTabScope"][value="${scope}"]`); if (radio) radio.checked = true;
  const appearance = ['light','dark','system'].includes(state.settings.appearance) ? state.settings.appearance : 'light';
  const appearanceRadio = document.querySelector(`input[name="appearance"][value="${appearance}"]`); if (appearanceRadio) appearanceRadio.checked = true;
  $('#settingTabFontSize').value = String(Math.max(10, Math.min(18, Number(state.settings.tabFontSize) || 12)));
  $('#settingTabSpacing').value = String(Math.max(2, Math.min(20, Number.parseInt(state.settings.tabSpacing, 10) || 7)));
  $('#settingDefaultTimeUnit').value = state.settings.defaultTimeUnit === 'minutes' ? 'minutes' : 'hours';
  $('#settingWeeklyBillableHours').value = String(normalizeWeeklyBillableHours(state.settings.weeklyBillableHours));
  $('#settingHeaderClockSize').value = HEADER_CLOCK_SIZES.includes(state.settings.headerClockSize) ? state.settings.headerClockSize : 'medium';
  $('#settingTextSize').value = TEXT_SIZES.includes(state.settings.textSize) ? state.settings.textSize : 'small';
  $('#settingWorkClockOverlay').checked = state.settings.workClockOverlayEnabled === true;
  $('#settingWorkClockOverlayPosition').value = ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(state.settings.workClockOverlayPosition) ? state.settings.workClockOverlayPosition : 'bottom-center';
  $('#settingWorkClockOverlayPosition').disabled = !$('#settingWorkClockOverlay').checked;
  $('#settingSiteOverlaysEnabled').checked = state.settings.siteOverlaysEnabled === true;
  updateTabSettingReadouts();
  populateHomeDefaultDesktopSelect();
  updateNewTabBuildStatus();
  $('#settingShowNotes').checked = state.settings.showNotes !== false;
  $('#settingShowTasks').checked = state.settings.showTasks !== false;
  $('#settingShowReminders').checked = state.settings.showReminders !== false;
  $('#settingShowOverlays').checked = state.settings.showOverlays !== false;
  $('#settingShowQuickLinks').checked = state.settings.showQuickLinks === true;
  if (!settingsDialog.open) settingsDialog.showModal();
}

async function saveSettings(event) {
  event.preventDefault();
  state.settings.openOnStart = $('#settingOpenOnStart').checked;
  state.settings.pinOnStart = $('#settingPinOnStart').checked;
  state.settings.pinOnOpen = $('#settingPinOnOpen').checked;
  if (ownsNewTabOverride()) state.settings.useMeshTabNewTab = $('#settingUseMeshTabNewTab').checked;
  state.settings.homeDefaultDesktopId = validHomeDefaultDesktopId($('#settingHomeDefaultDesktop')?.value || 'last-active');
  state.settings.meshTabScope = document.querySelector('input[name="meshTabScope"]:checked')?.value === 'all-windows' ? 'all-windows' : 'per-window';
  state.settings.appearance = ['light','dark','system'].includes(document.querySelector('input[name="appearance"]:checked')?.value) ? document.querySelector('input[name="appearance"]:checked').value : 'light';
  state.settings.tabFontSize = Math.max(10, Math.min(18, Number($('#settingTabFontSize').value) || 12));
  state.settings.tabSpacing = Math.max(2, Math.min(20, Number.parseInt($('#settingTabSpacing').value, 10) || 7));
  state.settings.defaultTimeUnit = $('#settingDefaultTimeUnit').value === 'minutes' ? 'minutes' : 'hours';
  state.settings.weeklyBillableHours = normalizeWeeklyBillableHours($('#settingWeeklyBillableHours').value);
  state.settings.headerClockSize = HEADER_CLOCK_SIZES.includes($('#settingHeaderClockSize').value) ? $('#settingHeaderClockSize').value : 'medium';
  state.settings.textSize = TEXT_SIZES.includes($('#settingTextSize').value) ? $('#settingTextSize').value : 'small';
  let overlayPermissionDenied = false;
  let clockOverlayEnabled = $('#settingWorkClockOverlay').checked;
  let siteOverlaysEnabled = $('#settingSiteOverlaysEnabled').checked;
  if (clockOverlayEnabled || siteOverlaysEnabled) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ['scripting'], origins: ['http://*/*', 'https://*/*'] }); }
    catch { granted = false; }
    if (!granted) { clockOverlayEnabled = false; siteOverlaysEnabled = false; overlayPermissionDenied = true; }
  }
  state.settings.workClockOverlayEnabled = clockOverlayEnabled;
  state.settings.siteOverlaysEnabled = siteOverlaysEnabled;
  state.settings.workClockOverlayPosition = ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes($('#settingWorkClockOverlayPosition').value) ? $('#settingWorkClockOverlayPosition').value : 'bottom-center';
  state.settings.showNotes = $('#settingShowNotes').checked;
  state.settings.showTasks = $('#settingShowTasks').checked;
  state.settings.showReminders = $('#settingShowReminders').checked;
  state.settings.showOverlays = $('#settingShowOverlays').checked;
  state.settings.showQuickLinks = $('#settingShowQuickLinks').checked;
  if ((state.settings.activeView === 'general-notes' && !state.settings.showNotes) || ((state.settings.activeView === 'tasks' || state.settings.activeView === 'allocations') && !state.settings.showTasks) || (state.settings.activeView === 'reminders' && !state.settings.showReminders) || (state.settings.activeView === 'overlays' && !state.settings.showOverlays)) state.settings.activeView = 'desktop';
  await saveState();
  try { await chrome.runtime.sendMessage({ type: 'meshtab-work-clock-overlay-sync' }); } catch {}
  try { await chrome.runtime.sendMessage({ type: 'meshtab-site-overlays-sync' }); } catch {}
  applyAppearance();
  applyHomeScreenControl();
  settingsDialog.close();
  render();
  toast(overlayPermissionDenied ? 'Settings saved. Overlays stayed off because website access was not granted.' : 'Settings saved.');
}

function renderCalendarDesktop(desktop) {
  const wrap=document.createElement('section'); wrap.className='calendar-tab-view';
  if (desktop.calendarUrl) {
    const frame=document.createElement('iframe'); frame.className='calendar-embed-frame'; frame.src=desktop.calendarUrl; frame.title=`${desktop.title} Google Calendar`; frame.loading='eager'; frame.referrerPolicy='strict-origin-when-cross-origin'; wrap.append(frame);
  } else {
    const empty=document.createElement('div'); empty.className='calendar-tab-empty'; empty.innerHTML='<strong>No Calendar connected</strong><span>Open Calendar settings and paste a Google Calendar embed URL, embed code, or Calendar ID.</span>'; wrap.append(empty);
  }
  return wrap;
}

function workClockElapsedSeconds(clock=state?.workClock) {
  const start=clock?.runningSince;
  if(!start||!Number.isFinite(Date.parse(start)))return 0;
  const pausedAt=clock?.pausedAt&&Number.isFinite(Date.parse(clock.pausedAt))?Date.parse(clock.pausedAt):0;
  const endMs=pausedAt||Date.now();
  const pausedSeconds=Math.max(0,Number(clock?.pausedSeconds)||0);
  return Math.max(0,Math.floor((endMs-Date.parse(start))/1000-pausedSeconds));
}
function workClockOverlayPositionClass(position) {
  return ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(position) ? position : 'bottom-center';
}
function workClockOverlayEdgeSide() {
  const position=workClockOverlayPositionClass(state.settings.workClockOverlayPosition);
  if(position==='free') return (Number(state.settings.workClockOverlayXRatio) ?? 0.5) < 0.5 ? 'left' : 'right';
  return position.endsWith('-left') ? 'left' : 'right';
}
function applyWorkClockPageOverlayPosition(overlay) {
  if (!overlay || overlay.dataset.dragging === 'true') return;
  overlay.style.top=''; overlay.style.right=''; overlay.style.bottom=''; overlay.style.left=''; overlay.style.transform='';
  const position=workClockOverlayPositionClass(state.settings.workClockOverlayPosition);
  if (state.settings.workClockOverlayMinimized) {
    overlay.classList.toggle('dock-left', workClockOverlayEdgeSide()==='left');
    if (workClockOverlayEdgeSide()==='left') overlay.style.left='0px'; else overlay.style.right='0px';
    if(position==='free'){
      const height=overlay.offsetHeight||34;
      const maxY=Math.max(0,innerHeight-height);
      const yr=Math.max(0,Math.min(1,Number(state.settings.workClockOverlayYRatio)||0));
      overlay.style.top=`${yr*maxY}px`;
    } else if(position.startsWith('top-')) overlay.style.top='14px';
    else overlay.style.bottom='14px';
    return;
  }
  overlay.classList.remove('dock-left');
  if(position==='free'){
    const width=overlay.offsetWidth||150, height=overlay.offsetHeight||34;
    const maxX=Math.max(0,innerWidth-width), maxY=Math.max(0,innerHeight-height);
    const xr=Math.max(0,Math.min(1,Number(state.settings.workClockOverlayXRatio)||0));
    const yr=Math.max(0,Math.min(1,Number(state.settings.workClockOverlayYRatio)||0));
    overlay.style.left=`${xr*maxX}px`; overlay.style.top=`${yr*maxY}px`; return;
  }
  const gap='14px';
  if(position.startsWith('top-')) overlay.style.top=gap; else overlay.style.bottom=gap;
  if(position.endsWith('-left')) overlay.style.left=gap;
  else if(position.endsWith('-right')) overlay.style.right=gap;
  else { overlay.style.left='50%'; overlay.style.transform='translateX(-50%)'; }
}
function renderWorkClockPageOverlay(running, seconds) {
  let overlay=document.getElementById('workClockPageOverlay');
  if (!state?.settings?.workClockOverlayEnabled || !running) { overlay?.remove(); return; }
  const paused=Boolean(state?.workClock?.pausedAt);
  if (!overlay) {
    overlay=document.createElement('div');
    overlay.id='workClockPageOverlay';
    overlay.className='work-clock-page-overlay';
    const copy=document.createElement('span'); copy.className='work-clock-page-copy';
    const readout=document.createElement('span'); readout.className='work-clock-page-readout';
    const taskLabel=document.createElement('span'); taskLabel.className='work-clock-page-task';
    copy.append(readout,taskLabel);
    const pauseAction=document.createElement('button'); pauseAction.type='button'; pauseAction.className='work-clock-page-action pause';
    pauseAction.addEventListener('click',async(event)=>{event.preventDefault();event.stopPropagation();if(state?.workClock?.pausedAt)await resumeWorkClock();else await pauseWorkClock();});
    const stopAction=document.createElement('button'); stopAction.type='button'; stopAction.className='work-clock-page-action stop';
    stopAction.textContent='Stop';
    stopAction.addEventListener('click',async(event)=>{event.preventDefault();event.stopPropagation();await stopWorkClock();});
    const minimizeAction=document.createElement('button'); minimizeAction.type='button'; minimizeAction.className='work-clock-page-minimize'; minimizeAction.textContent='–'; minimizeAction.title='Minimize'; minimizeAction.setAttribute('aria-label','Minimize the Work Clock overlay');
    minimizeAction.addEventListener('click',async(event)=>{event.preventDefault();event.stopPropagation();state.settings.workClockOverlayMinimized=true;overlay.classList.add('minimized');applyWorkClockPageOverlayPosition(overlay);await saveState();});
    overlay.append(copy,pauseAction,stopAction,minimizeAction);
    let drag=null;
    overlay.addEventListener('pointerdown',(event)=>{if(event.target.closest('.work-clock-page-action,.work-clock-page-minimize'))return;event.preventDefault();event.stopPropagation();const rect=overlay.getBoundingClientRect();overlay.dataset.dragging='true';overlay.style.transform='';overlay.style.right='';overlay.style.bottom='';overlay.style.left=`${rect.left}px`;overlay.style.top=`${rect.top}px`;drag={id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,startX:event.clientX,startY:event.clientY,moved:false};overlay.setPointerCapture?.(event.pointerId);overlay.classList.add('dragging');});
    overlay.addEventListener('pointermove',(event)=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>3)drag.moved=true;if(!drag.moved)return;const maxX=Math.max(0,innerWidth-overlay.offsetWidth),maxY=Math.max(0,innerHeight-overlay.offsetHeight);overlay.style.left=`${Math.max(0,Math.min(maxX,event.clientX-drag.dx))}px`;overlay.style.top=`${Math.max(0,Math.min(maxY,event.clientY-drag.dy))}px`;});
    const finish=async(event)=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const moved=drag.moved;drag=null;overlay.dataset.dragging='false';overlay.classList.remove('dragging');if(moved){const rect=overlay.getBoundingClientRect(),maxX=Math.max(1,innerWidth-rect.width),maxY=Math.max(1,innerHeight-rect.height);state.settings.workClockOverlayPosition='free';state.settings.workClockOverlayXRatio=Math.max(0,Math.min(1,rect.left/maxX));state.settings.workClockOverlayYRatio=Math.max(0,Math.min(1,rect.top/maxY));await saveState();}else if(state.settings.workClockOverlayMinimized){state.settings.workClockOverlayMinimized=false;overlay.classList.remove('minimized');await saveState();}applyWorkClockPageOverlayPosition(overlay);};
    overlay.addEventListener('pointerup',finish);overlay.addEventListener('pointercancel',finish);
    document.body.append(overlay);
  }
  const readout=overlay.querySelector('.work-clock-page-readout'), taskLabel=overlay.querySelector('.work-clock-page-task'), pauseAction=overlay.querySelector('.work-clock-page-action.pause');
  const linkedTask=linkedWorkClockTask();
  if(readout) readout.textContent=state.settings.workClockOverlayMinimized?(paused?'⏸':'⏱'):`${paused?'⏸':'⏱'} ${formatClockDuration(seconds)}`;
  if(taskLabel) taskLabel.textContent=linkedTask?.title||'';
  overlay.classList.toggle('linked',Boolean(linkedTask));
  overlay.classList.toggle('minimized',Boolean(state.settings.workClockOverlayMinimized));
  if(pauseAction){pauseAction.textContent=paused?'Resume':'Pause';pauseAction.classList.toggle('resume',paused);pauseAction.title=paused?'Resume':'Pause';}
  overlay.classList.toggle('paused',paused);
  const baseLabel=linkedTask?`Timer for "${linkedTask.title}" ${paused?'paused':'running'} ${formatClockDuration(seconds)}`:`Work Clock ${paused?'paused':'running'} ${formatClockDuration(seconds)}`;
  const label=state.settings.workClockOverlayMinimized?`${baseLabel}. Minimized - click to expand.`:`${baseLabel}. Drag to move.`;
  overlay.setAttribute('aria-label',label);
  overlay.title=state.settings.workClockOverlayMinimized?'Click to expand the Work Clock overlay.':'Click and hold to drag the timer anywhere on the page.';
  applyWorkClockPageOverlayPosition(overlay);
}
function recentWorkClockSessions(limit=30) {
  return [...(state?.workClock?.sessions||[])].sort((a,b)=>Date.parse(b.startAt)-Date.parse(a.startAt)).slice(0,limit);
}
function localDateKey(value) {
  const d=new Date(value); if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
async function clearWorkClockSession(sessionId) {
  state.workClock ||= { runningSince:'', sessions:[] };
  const session=(state.workClock.sessions||[]).find(item=>item.id===sessionId);
  if(!session)return;
  const when=new Date(session.startAt);
  const label=Number.isFinite(when.getTime()) ? `${when.toLocaleDateString()} at ${when.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'this session';
  if(!confirm(`Clear the completed timer from ${label}? This cannot be undone.`))return;
  state.workClock.sessions=(state.workClock.sessions||[]).filter(item=>item.id!==sessionId);
  await saveState();
  renderWorkClockDialog();
  renderWorkClockSummary();
  toast('Timer session cleared.');
}
async function clearAllWorkClockSessions() {
  state.workClock ||= { runningSince:'', sessions:[] };
  const count=(state.workClock.sessions||[]).length;
  if(!count){toast('No completed timer sessions to clear.');return;}
  if(!confirm(`Clear all ${count} completed timer session${count===1?'':'s'}? The running timer, if any, will keep running. This cannot be undone.`))return;
  state.workClock.sessions=[];
  await saveState();
  renderWorkClockDialog();
  renderWorkClockSummary();
  toast(`Cleared ${count} completed timer session${count===1?'':'s'}.`);
}
function renderWorkClockSummary(sessionId='') {
  const sessions=recentWorkClockSessions(30);
  const selected=sessionId ? sessions.find(session=>session.id===sessionId) : null;
  const title=$('#workClockSummaryTitle');
  const range=$('#workClockSummaryRange');
  const cards=$('#workClockSummaryCards');
  const head=$('#workClockSummaryListHead');
  const list=$('#workClockSummaryList');
  const clearAllSummaryBtn=$('#workClockClearAllSummaryBtn');
  if(!cards || !list) return;
  if(clearAllSummaryBtn){clearAllSummaryBtn.disabled=!(state.workClock?.sessions||[]).length;clearAllSummaryBtn.textContent=selected?'Clear this session':'Clear all sessions';clearAllSummaryBtn.dataset.sessionId=selected?.id||'';}

  if(selected){
    const start=new Date(selected.startAt);
    const end=new Date(selected.endAt);
    if(title) title.textContent='Session Details';
    if(range) range.textContent=start.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    if(head) head.classList.add('hidden');
    list.replaceChildren();
    cards.classList.remove('hidden');
    const details=[
      ['Date', start.toLocaleDateString()],
      ['Started', start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})],
      ['Stopped', end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})],
      ['Actual time', formatClockDuration(selected.actualSeconds)],
      ['Rounded ½ hour', formatTaskMinutes(roundedClockMinutes(selected.actualSeconds,30))],
      ['Rounded hour', formatTaskMinutes(roundedClockMinutes(selected.actualSeconds,60))]
    ];
    cards.replaceChildren(...details.map(([label,value])=>{
      const card=document.createElement('div');
      const span=document.createElement('span'); span.textContent=label;
      const strong=document.createElement('strong'); strong.textContent=value;
      card.append(span,strong); return card;
    }));
    return;
  }

  if(title) title.textContent='Recent Sessions';
  if(range) range.textContent=sessions.length?`Most recent ${sessions.length} completed session${sessions.length===1?'':'s'} · select one for details`:'No completed sessions yet';
  cards.classList.add('hidden');
  cards.replaceChildren();
  if(head){head.classList.remove('hidden'); head.replaceChildren(...['Date','Time','Actual','½ Hour','Hour','Clear'].map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));}
  if(!sessions.length){list.innerHTML='<div class="work-clock-empty">No completed clock sessions yet.</div>';return;}
  list.replaceChildren(...sessions.map(session=>{
    const start=new Date(session.startAt); const end=new Date(session.endAt);
    const row=document.createElement('div'); row.className='work-clock-summary-row work-clock-summary-session-row';
    const open=document.createElement('button'); open.type='button'; open.className='work-clock-summary-open'; open.title='Open this session';
    const date=document.createElement('strong'); date.textContent=start.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    const time=document.createElement('span'); time.textContent=`${start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} – ${end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
    const actual=document.createElement('span'); actual.textContent=formatClockDuration(session.actualSeconds);
    const half=document.createElement('span'); half.textContent=formatTaskMinutes(roundedClockMinutes(session.actualSeconds,30));
    const hour=document.createElement('span'); hour.textContent=formatTaskMinutes(roundedClockMinutes(session.actualSeconds,60));
    open.append(date,time,actual,half,hour);
    open.addEventListener('click',()=>renderWorkClockSummary(session.id));
    const clear=document.createElement('button'); clear.type='button'; clear.className='btn btn-ghost compact work-clock-session-clear'; clear.textContent='Clear'; clear.title='Clear this completed timer session';
    clear.addEventListener('click',()=>clearWorkClockSession(session.id));
    row.append(open,clear);
    return row;
  }));
}
function openWorkClockSummary(sessionId=''){ renderWorkClockSummary(sessionId); if(!workClockSummaryDialog.open)workClockSummaryDialog.showModal(); }
function renderWorkClockDialog() {
  state.workClock ||= { runningSince:'', sessions:[] };
  const running=Boolean(state.workClock.runningSince); const paused=running&&Boolean(state.workClock.pausedAt); const lastSession=recentWorkClockSessions(1)[0]||null; const seconds=running?workClockElapsedSeconds():(lastSession?.actualSeconds||0);
  const actual=$('#workClockActual'); const half=$('#workClockHalf'); const hour=$('#workClockHour');
  if(actual) actual.textContent=formatClockDuration(seconds);
  if(half) half.textContent=formatTaskMinutes(roundedClockMinutes(seconds,30));
  if(hour) hour.textContent=formatTaskMinutes(roundedClockMinutes(seconds,60));
  const status=$('#workClockStatus'); if(status) status.textContent=paused?`Paused ${new Date(state.workClock.pausedAt).toLocaleString()} · break time is not counting`:running?`Started ${new Date(state.workClock.runningSince).toLocaleString()}`:(lastSession?`Last stopped ${new Date(lastSession.endAt).toLocaleString()}`:'Clock is stopped');
  const startBtn=$('#workClockStartBtn'), pauseBtn=$('#workClockPauseBtn'), stopBtn=$('#workClockStopBtn'), offsetInput=$('#workClockStartOffsetMinutes'); if(startBtn) startBtn.disabled=running; if(offsetInput){offsetInput.disabled=running;offsetInput.closest('.work-clock-start-offset')?.classList.toggle('is-disabled',running);} if(pauseBtn){pauseBtn.disabled=!running;pauseBtn.textContent=paused?'Resume timer':'Pause timer';pauseBtn.classList.toggle('btn-primary',paused);pauseBtn.classList.toggle('btn-secondary',!paused);} if(stopBtn) stopBtn.disabled=!running;
  const mainBtn=$('#workClockBtn'); if(mainBtn){
    mainBtn.classList.toggle('running',running); mainBtn.classList.toggle('paused',paused);
    const icon=document.createElement('span'); icon.className='work-clock-launch-icon'; icon.textContent='⏱';
    mainBtn.replaceChildren(icon);
    if(running){const time=document.createElement('span');time.className='work-clock-launch-time';time.textContent=formatClockDuration(seconds);mainBtn.append(time);}
    const clockLabel=running?`Work Clock ${paused?'paused':'running'} · ${formatClockDuration(seconds)}`:'Work Clock';
    mainBtn.title=clockLabel;
    mainBtn.setAttribute('aria-label',clockLabel);
  }
  renderWorkClockPageOverlay(running,seconds);
  renderActiveTaskTimerBar();
  const clearAllBtn=$('#workClockClearAllBtn'); if(clearAllBtn) clearAllBtn.disabled=!(state.workClock?.sessions||[]).length;
  const history=$('#workClockHistory'); if(history){ const sessions=recentWorkClockSessions(30); if(sessions.length){ history.replaceChildren(...sessions.map(session=>{ const row=document.createElement('div'); row.className='work-clock-history-row work-clock-history-manage-row'; const open=document.createElement('button'); open.type='button'; open.className='work-clock-history-open'; open.title='Open this session'; const when=document.createElement('div'); when.innerHTML=`<strong>${new Date(session.startAt).toLocaleDateString()}</strong><span>${new Date(session.startAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} – ${new Date(session.endAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span>`; const actual=document.createElement('strong'); actual.textContent=formatClockDuration(session.actualSeconds); const rounded=document.createElement('span'); rounded.textContent=`½ hr ${formatTaskMinutes(roundedClockMinutes(session.actualSeconds,30))} · 1 hr ${formatTaskMinutes(roundedClockMinutes(session.actualSeconds,60))}`; open.append(when,actual,rounded); open.addEventListener('click',()=>openWorkClockSummary(session.id)); const clear=document.createElement('button'); clear.type='button'; clear.className='btn btn-ghost compact work-clock-history-clear'; clear.textContent='Clear'; clear.title='Clear this completed timer session'; clear.addEventListener('click',()=>clearWorkClockSession(session.id)); row.append(open,clear); return row;})); } else history.innerHTML='<div class="work-clock-empty">No completed clock sessions yet.</div>'; }
}
function startWorkClockTicker(){ clearInterval(workClockTickTimer); renderWorkClockDialog(); workClockTickTimer=setInterval(renderWorkClockDialog,1000); }
function stopWorkClockTicker(){ if(workClockTickTimer){clearInterval(workClockTickTimer);workClockTickTimer=null;} renderWorkClockDialog(); }
async function startWorkClock(){ state.workClock ||= {runningSince:'',pausedAt:'',pausedSeconds:0,sessions:[],taskId:'',pendingTaskId:'',pendingSeconds:0,pendingStartedAt:'',pendingEndedAt:''}; if(state.workClock.runningSince){ const linkedTask=linkedWorkClockTask(); toast(linkedTask?`Stop the timer for "${linkedTask.title}" before starting the Work Clock.`:'The Work Clock is already running.'); return; } const input=$('#workClockStartOffsetMinutes'); const offsetMinutes=Math.max(0,Math.min(1440,Math.round(Number(input?.value)||0))); state.workClock.taskId=''; state.workClock.runningSince=new Date(Date.now()-offsetMinutes*60000).toISOString(); state.workClock.pausedAt=''; state.workClock.pausedSeconds=0; if(input)input.value='0'; await saveState(); startWorkClockTicker(); render(); if(offsetMinutes)toast(`Clock started with ${formatTaskMinutes(offsetMinutes)} already worked.`); }
async function pauseWorkClock(){ state.workClock ||= {runningSince:'',pausedAt:'',pausedSeconds:0,sessions:[],taskId:'',pendingTaskId:'',pendingSeconds:0,pendingStartedAt:'',pendingEndedAt:''}; if(!state.workClock.runningSince||state.workClock.pausedAt)return; state.workClock.pausedAt=new Date().toISOString(); await saveState(); renderWorkClockDialog(); toast('Clock paused. Break time will not be counted.'); }
async function resumeWorkClock(){ state.workClock ||= {runningSince:'',pausedAt:'',pausedSeconds:0,sessions:[],taskId:'',pendingTaskId:'',pendingSeconds:0,pendingStartedAt:'',pendingEndedAt:''}; if(!state.workClock.runningSince||!state.workClock.pausedAt)return; const pausedAt=Date.parse(state.workClock.pausedAt); if(Number.isFinite(pausedAt))state.workClock.pausedSeconds=Math.max(0,Number(state.workClock.pausedSeconds)||0)+Math.max(0,Math.round((Date.now()-pausedAt)/1000)); state.workClock.pausedAt=''; await saveState(); startWorkClockTicker(); toast('Clock resumed.'); }
async function togglePauseWorkClock(){ if(state?.workClock?.pausedAt)await resumeWorkClock(); else await pauseWorkClock(); }
async function stopWorkClock(){
  state.workClock ||= {runningSince:'',pausedAt:'',pausedSeconds:0,sessions:[],taskId:'',pendingTaskId:'',pendingSeconds:0,pendingStartedAt:'',pendingEndedAt:''};
  if(!state.workClock.runningSince)return;
  const startAt=state.workClock.runningSince;
  const actualSeconds=Math.max(1,workClockElapsedSeconds(state.workClock));
  const linkedTaskId=state.workClock.taskId;
  state.workClock.runningSince=''; state.workClock.pausedAt=''; state.workClock.pausedSeconds=0;
  if (linkedTaskId) {
    state.workClock.taskId='';
    state.workClock.pendingTaskId=linkedTaskId;
    state.workClock.pendingSeconds=actualSeconds;
    state.workClock.pendingStartedAt=startAt;
    state.workClock.pendingEndedAt=new Date().toISOString();
    await saveState();
    stopWorkClockTicker();
    render();
    return;
  }
  const endAt=new Date().toISOString();
  state.workClock.sessions ||= [];
  state.workClock.sessions.push({id:uid('clock'),startAt,endAt,actualSeconds});
  await saveState();
  stopWorkClockTicker();
  toast(`Clock stopped · ${formatClockDuration(actualSeconds)} actual.`);
}
function openWorkClock(){ renderWorkClockDialog(); if(!workClockDialog.open) workClockDialog.showModal(); if(state.workClock?.runningSince) startWorkClockTicker(); }

function linkedWorkClockTask() {
  const taskId = state?.workClock?.taskId;
  if (!taskId || !state?.workClock?.runningSince) return null;
  return (state.tasks || []).find((item) => item.id === taskId) || null;
}

async function startTaskTimer(taskId) {
  const task = (state.tasks || []).find((item) => item.id === String(taskId));
  if (!task) return;
  state.workClock ||= { runningSince:'', pausedAt:'', pausedSeconds:0, sessions:[], taskId:'', pendingTaskId:'', pendingSeconds:0, pendingStartedAt:'', pendingEndedAt:'' };
  if (state.workClock.runningSince) {
    if (state.workClock.taskId === task.id) return;
    const linkedTask = state.workClock.taskId ? (state.tasks || []).find((item) => item.id === state.workClock.taskId) : null;
    toast(`Stop ${linkedTask ? `the timer for "${linkedTask.title}"` : 'the Work Clock'} before starting a new timer.`);
    return;
  }
  let overlayPermissionDenied = false;
  if (!state.settings.workClockOverlayEnabled) {
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ['scripting'], origins: ['http://*/*', 'https://*/*'] }); }
    catch { granted = false; }
    state.settings.workClockOverlayEnabled = granted;
    overlayPermissionDenied = !granted;
  }
  state.workClock.taskId = task.id;
  state.workClock.runningSince = new Date().toISOString();
  state.workClock.pausedAt = '';
  state.workClock.pausedSeconds = 0;
  state.workClock.pendingTaskId = '';
  state.workClock.pendingSeconds = 0;
  state.workClock.pendingStartedAt = '';
  state.workClock.pendingEndedAt = '';
  await saveState();
  if (state.settings.workClockOverlayEnabled) { try { await chrome.runtime.sendMessage({ type: 'meshtab-work-clock-overlay-sync' }); } catch {} }
  startWorkClockTicker();
  render();
  toast(overlayPermissionDenied ? `Timer started for "${task.title}". Website overlay stayed off because website access was not granted.` : `Timer started for "${task.title}".`);
}

function renderActiveTaskTimerBar() {
  const bar = $('#activeTaskTimerBar');
  if (!bar) return;
  const running = Boolean(state?.workClock?.runningSince);
  if (!running) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const paused = Boolean(state.workClock.pausedAt);
  const task = linkedWorkClockTask();
  const readout = $('#activeTaskTimerReadout'); if (readout) readout.textContent = `${paused ? '⏸' : '⏱'} ${formatClockDuration(workClockElapsedSeconds())}`;
  const label = $('#activeTaskTimerLabel'); if (label) label.textContent = task ? 'TIMER RUNNING' : 'WORK CLOCK RUNNING';
  const name = $('#activeTaskTimerTaskName'); if (name) name.textContent = task ? task.title : (paused ? 'Paused — not linked to a Task' : 'Not linked to a Task');
}

function maybeOpenPendingTaskTimerEntry() {
  const pendingId = state?.workClock?.pendingTaskId || '';
  if (!pendingId) { pendingTaskTimeDialogOpenedForId = null; return; }
  if (taskTimeDialog.open || pendingTaskTimeDialogOpenedForId === pendingId) return;
  pendingTaskTimeDialogOpenedForId = pendingId;
  openTaskTimeDialog(pendingId, null, Math.max(1, Number(state.workClock.pendingSeconds) || 0));
}


function normalizeSiteOverlayHostInput(value) {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^\*\./, '');
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return String(url.hostname || '').replace(/^\*\./, '').toLowerCase();
  } catch { return ''; }
}

function normalizeSiteOverlayPageInput(value) {
  const raw=String(value||'').trim();
  if(!raw) return '';
  try { const url=new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); if(!/^https?:$/i.test(url.protocol))return ''; return url.href; } catch { return ''; }
}
function parseSiteOverlayTargetInput(value) {
  const raw=String(value||'').trim().replace(/^\*\./,'');
  if(!raw)return {host:'',pageScope:'all',pageUrl:''};
  try {
    const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
    if(!/^https?:$/i.test(url.protocol))return {host:'',pageScope:'all',pageUrl:''};
    const host=String(url.hostname||'').replace(/^\*\./,'').toLowerCase();
    if(!host||!/^[a-z0-9.-]+$/i.test(host))return {host:'',pageScope:'all',pageUrl:''};
    const specific=(url.pathname&&url.pathname!=='/')||Boolean(url.search)||Boolean(url.hash);
    return {host,pageScope:specific?'specific':'all',pageUrl:specific?url.href:''};
  } catch { return {host:'',pageScope:'all',pageUrl:''}; }
}
function siteOverlayTargetInputValue(overlay) {
  return overlay?.pageScope==='specific'&&overlay?.pageUrl ? overlay.pageUrl : (overlay?.host||'');
}
function updateSiteOverlayTargetModeControls(prefix) {
  const mode=document.getElementById(`${prefix}TargetMode`)?.value==='all-sites'?'all-sites':'site';
  const host=document.getElementById(`${prefix}Host`), subdomains=document.getElementById(`${prefix}IncludeSubdomains`), recent=document.getElementById(`${prefix}UseActivePageBtn`);
  if(host){host.disabled=mode==='all-sites';host.required=mode!=='all-sites';host.placeholder=mode==='all-sites'?'All normal website pages in Chrome':'example.com or https://example.com/page';host.closest('label')?.classList.toggle('scope-disabled',mode==='all-sites');}
  if(subdomains){subdomains.disabled=mode==='all-sites';subdomains.closest('label')?.classList.toggle('scope-disabled',mode==='all-sites');}
  if(recent) recent.disabled=mode==='all-sites';
}

function siteOverlayById(overlayId) {
  return (state.siteOverlays || []).find((overlay) => overlay.id === String(overlayId || '')) || null;
}

function siteOverlayFontCss(fontFamily) {
  if (fontFamily === 'serif') return 'Georgia, "Times New Roman", serif';
  if (fontFamily === 'mono') return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  if (fontFamily === 'sans') return 'Arial, Helvetica, sans-serif';
  return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
}

function siteOverlayIsHalfShape(shape) {
  return ['half-rounded', 'half-pill', 'half-oval'].includes(shape);
}

function siteOverlayRadius(shape, edge = 'top') {
  if (shape === 'pill') return '999px';
  if (shape === 'rectangle') return '3px';
  if (!siteOverlayIsHalfShape(shape)) return '14px';
  const base = shape === 'half-rounded' ? '14px' : (shape === 'half-pill' ? '999px' : '50%');
  if (edge === 'bottom') return `${base} ${base} 0 0`;
  if (edge === 'left') return `0 ${base} ${base} 0`;
  if (edge === 'right') return `${base} 0 0 ${base}`;
  return `0 0 ${base} ${base}`;
}

function makeMeshTabMiniLogo(size = 26, overlay = null) {
  if (overlay?.customIconDataUrl) {
    const image = document.createElement('img');
    image.className = 'meshtab-mini-logo-icon';
    image.src = overlay.customIconDataUrl;
    image.style.width = `${size}px`; image.style.height = `${size}px`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    return image;
  }
  const logo = document.createElement('span');
  logo.className = 'meshtab-mini-logo';
  logo.style.width = `${size}px`; logo.style.height = `${size}px`;
  const iconColor = /^#[0-9a-f]{6}$/i.test(String(overlay?.iconColor || '')) ? overlay.iconColor : '';
  for (let i = 0; i < 4; i += 1) {
    const square = document.createElement('i');
    if (iconColor) square.style.borderColor = iconColor;
    logo.append(square);
  }
  logo.setAttribute('aria-hidden', 'true');
  return logo;
}

function siteOverlayDesktopTitle(overlay) {
  if (overlay?.type !== 'links') return '';
  return state.desktops.find((desktop) => desktop.id === overlay.desktopId)?.title || 'Unavailable Tab';
}

function siteOverlayOpenModeLabel(mode) {
  if (mode === 'new-tab') return 'New tab';
  if (mode === 'new-window') return 'New window';
  return 'Same tab';
}

function styleSiteOverlayPreview(element, overlay) {
  if (!element) return;
  element.replaceChildren();
  if (overlay?.type === 'links') {
    element.classList.add('link-overlay-preview');
    element.style.width = '54px'; element.style.height = '54px';
    element.style.color = ''; element.style.background = '#ffffff'; element.style.fontFamily = ''; element.style.fontSize = '';
    element.style.borderRadius = '14px';
    element.style.opacity = String(Math.max(10, Math.min(100, Number.isFinite(Number(overlay?.opacity)) ? Number(overlay.opacity) : 100)) / 100);
    element.append(makeMeshTabMiniLogo(31, overlay));
    element.title = `${overlay.name || 'MeshTab Links'} · ${siteOverlayDesktopTitle(overlay)}`;
    return;
  }
  element.style.opacity = '';
  element.classList.remove('link-overlay-preview');
  const width = Math.max(80, Math.min(520, Number.parseInt(overlay?.width, 10) || 180));
  const height = Math.max(28, Math.min(280, Number.parseInt(overlay?.height, 10) || 44));
  const previewWidth = Math.min(width, 280);
  const previewHeight = Math.min(height, 160);
  element.style.width = `${previewWidth}px`;
  element.style.height = `${previewHeight}px`;
  element.style.color = overlay?.textColor || '#ffffff';
  element.style.background = overlay?.backgroundColor || '#6e49ff';
  element.style.fontFamily = siteOverlayFontCss(overlay?.fontFamily || 'system');
  element.style.fontSize = `${Math.max(8, Math.min(48, Number.parseInt(overlay?.fontSize, 10) || 16))}px`;
  element.style.borderRadius = siteOverlayRadius(overlay?.shape || 'rounded', overlay?.edge || 'top');
  element.textContent = overlay?.name || 'Overlay';
}

function makeSiteOverlayCard(overlay) {
  const card = document.createElement('article');
  card.className = `site-overlay-card${overlay.enabled ? '' : ' disabled'}${overlay.type === 'links' ? ' link-overlay-card' : ''}`;
  card.dataset.overlayId = overlay.id;
  const previewWrap = document.createElement('div'); previewWrap.className = 'site-overlay-card-preview-wrap';
  const preview = document.createElement('div'); preview.className = 'site-overlay-preview'; styleSiteOverlayPreview(preview, overlay); previewWrap.append(preview);
  const copy = document.createElement('div'); copy.className = 'site-overlay-card-copy';
  const title = document.createElement('div'); title.className = 'site-overlay-card-title';
  const name = document.createElement('strong'); name.textContent = overlay.name;
  const type = document.createElement('span'); type.className = 'site-overlay-type'; type.textContent = overlay.type === 'links' ? 'MESHTAB LINK' : 'VISUAL';
  const status = document.createElement('span'); status.className = `site-overlay-status${overlay.enabled ? ' active' : ''}`; status.textContent = overlay.enabled ? 'ACTIVE' : 'PAUSED'; title.append(name, type, status);
  const host = document.createElement('span'); host.className = 'site-overlay-host'; host.textContent = overlay.targetMode==='all-sites' ? 'ALL WEBSITES' : (overlay.pageScope==='specific'&&overlay.pageUrl ? overlay.pageUrl : `${overlay.includeSubdomains ? '*.' : ''}${overlay.host}`);
  const meta = document.createElement('small');
  const pageScopeLabel=overlay.targetMode==='all-sites' ? 'all websites in Chrome' : (overlay.pageScope==='specific' ? `specific page${overlay.includeSubdomains ? ' + subdomains' : ''}` : `all pages on domain${overlay.includeSubdomains ? ' + subdomains' : ''}`);
  meta.textContent = overlay.type === 'links'
    ? `${siteOverlayDesktopTitle(overlay)} · ${siteOverlayOpenModeLabel(overlay.linkOpenMode)} · ${pageScopeLabel} · ${overlay.edge} edge · corner docking ${overlay.cornerDocking ? 'on' : 'off'}`
    : `${overlay.width}×${overlay.height}px · ${overlay.fontSize}px ${overlay.fontFamily} · ${overlay.shape} · ${pageScopeLabel} · ${overlay.edge} edge · corner docking ${overlay.cornerDocking ? 'on' : 'off'}`;
  copy.append(title, host, meta);
  const actions = document.createElement('div'); actions.className = 'site-overlay-card-actions';
  const toggle = createButton(overlay.enabled ? 'Pause' : 'Enable', 'btn btn-secondary compact', 'toggle-site-overlay', overlay.enabled ? 'Pause this overlay' : 'Enable this overlay'); toggle.dataset.overlayId = overlay.id;
  const edit = createButton('Edit', 'btn btn-secondary compact', 'edit-site-overlay', 'Edit overlay'); edit.dataset.overlayId = overlay.id;
  const del = createButton('Delete', 'btn btn-ghost compact danger-text', 'delete-site-overlay', 'Delete overlay'); del.dataset.overlayId = overlay.id;
  actions.append(toggle, edit, del);
  card.append(previewWrap, copy, actions);
  return card;
}

function renderSiteOverlaysCenter(query = '') {
  const wrap = document.createElement('section'); wrap.className = 'site-overlays-center';
  const head = document.createElement('div'); head.className = 'site-overlays-center-head';
  const copy = document.createElement('div'); copy.innerHTML = '<p class="section-kicker">OVERLAYS</p><h2>Website Overlays</h2><span>Create visual site labels or quick MeshTab Link panels that stay available while you work.</span>';
  const headActions = document.createElement('div'); headActions.className = 'site-overlays-head-actions';
  const add = createButton('+ Visual Overlay', 'btn btn-primary compact', 'add-site-overlay', 'Create a visual website overlay');
  const addLinks = createButton('+ MeshTab Link', 'btn btn-secondary compact', 'add-site-link-overlay', 'Create a quick-link overlay from a MeshTab Tab');
  headActions.append(add, addLinks); head.append(copy, headActions); wrap.append(head);
  const status = document.createElement('div'); status.className = `site-overlays-global-status${state.settings.siteOverlaysEnabled ? ' active' : ''}`;
  const statusCopy = document.createElement('div'); statusCopy.innerHTML = state.settings.siteOverlaysEnabled
    ? '<strong>Website overlays are ON</strong><span>Enabled visual and MeshTab Link overlays appear automatically on matching websites.</span>'
    : '<strong>Website overlays are OFF</strong><span>Your overlay definitions are saved, but nothing is drawn on websites until the feature is enabled in Settings.</span>';
  const settingsButton = createButton('Overlay Settings', 'btn btn-secondary compact', 'open-overlay-settings', 'Open overlay settings'); status.append(statusCopy, settingsButton); wrap.append(status);
  const normalized = String(query || '').trim().toLowerCase();
  const overlays = [...(state.siteOverlays || [])].filter((overlay) => !normalized || `${overlay.name} ${overlay.targetMode==='all-sites'?'all websites chrome':overlay.host} ${overlay.pageUrl || ''} ${siteOverlayDesktopTitle(overlay)}`.toLowerCase().includes(normalized)).sort((a,b) => Number(b.enabled)-Number(a.enabled) || a.name.localeCompare(b.name));
  const grid = document.createElement('div'); grid.className = 'site-overlay-grid';
  if (overlays.length) grid.replaceChildren(...overlays.map(makeSiteOverlayCard));
  else {
    const empty = document.createElement('div'); empty.className = 'site-overlay-empty';
    empty.innerHTML = normalized ? '<strong>No overlays match this search.</strong><span>Clear the search or create another overlay.</span>' : '<strong>No website overlays yet.</strong><span>Create a visual label or a MeshTab Link panel for any website or page you use.</span>';
    grid.append(empty);
  }
  wrap.append(grid);
  return wrap;
}

function bucketDesktopTitle(bucket) {
  return state.desktops.find((desktop) => desktop.id === bucket.desktopId)?.title || 'Unavailable Tab';
}

function renderHomeHub() {
  const wrap = document.createElement('section'); wrap.className = 'archive-center home-hub';
  const head = document.createElement('div'); head.className = 'archive-center-head';
  const copy = document.createElement('div'); copy.innerHTML = '<p class="section-kicker">HOME</p><h2>Home</h2><span>Jump to General Notes, Tasks, Reminders, Allocations, Overlays, or the Archive.</span>';
  head.append(copy); wrap.append(head);
  const grid = document.createElement('div'); grid.className = 'home-hub-grid';
  const cards = [];
  if (state.settings.showNotes) cards.push(['general-notes', 'General Notes', `${(state.notes || []).filter((note) => note.general).length} note${(state.notes || []).filter((note) => note.general).length === 1 ? '' : 's'}`]);
  if (state.settings.showTasks) cards.push(['tasks', 'Tasks', `${openTasks().length} open`]);
  if (state.settings.showReminders) cards.push(['reminders', 'Reminders', `${activeReminderCount()} active`]);
  if (state.settings.showTasks) cards.push(['allocations', 'Allocations', `${(state.taskAllocations || []).length} allocation${(state.taskAllocations || []).length === 1 ? '' : 's'}`]);
  if (state.settings.showOverlays) cards.push(['overlays', 'Overlays', `${(state.siteOverlays || []).length} overlay${(state.siteOverlays || []).length === 1 ? '' : 's'}`]);
  const archivedCount = state.buckets.filter((bucket) => bucket.archived).length + state.desktops.filter((desktop) => desktop.archived).length;
  cards.push(['archive', 'Archive', `${archivedCount} archived item${archivedCount === 1 ? '' : 's'}`]);
  grid.replaceChildren(...cards.map(([view, label, meta]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-hub-card';
    card.dataset.action = 'switch-view';
    card.dataset.view = view;
    card.innerHTML = `<strong>${label}</strong><span>${meta}</span>`;
    return card;
  }));
  wrap.append(grid);
  return wrap;
}

function renderArchiveCenter(query = '') {
  const wrap = document.createElement('section'); wrap.className = 'archive-center';
  const head = document.createElement('div'); head.className = 'archive-center-head';
  const copy = document.createElement('div'); copy.innerHTML = '<p class="section-kicker">ARCHIVE</p><h2>Archive</h2><span>Tabs and Groups you archive are kept here with their contents and settings intact — reactivate either any time.</span>';
  head.append(copy); wrap.append(head);
  const normalized = String(query || '').trim().toLowerCase();

  const archivedDesktops = state.desktops
    .filter((desktop) => desktop.archived)
    .filter((desktop) => !normalized || desktop.title.toLowerCase().includes(normalized))
    .sort((a, b) => a.title.localeCompare(b.title));
  const desktopSection = document.createElement('section'); desktopSection.className = 'archive-subsection';
  const desktopHead = document.createElement('h3'); desktopHead.textContent = 'Archived Tabs'; desktopSection.append(desktopHead);
  const desktopGrid = document.createElement('div'); desktopGrid.className = 'archive-grid';
  if (archivedDesktops.length) desktopGrid.replaceChildren(...archivedDesktops.map(makeArchivedDesktopCard));
  else {
    const empty = document.createElement('div'); empty.className = 'archive-empty';
    empty.innerHTML = normalized ? '<strong>No archived Tabs match this search.</strong><span>Clear the search or archive another Tab.</span>' : '<strong>No archived Tabs yet.</strong><span>Use the "Archive Tab" button at the top of any Tab to send it here.</span>';
    desktopGrid.append(empty);
  }
  desktopSection.append(desktopGrid); wrap.append(desktopSection);

  const archived = state.buckets
    .filter((bucket) => bucket.archived)
    .filter((bucket) => !normalized || `${bucket.title} ${bucketDesktopTitle(bucket)}`.toLowerCase().includes(normalized))
    .sort((a, b) => a.title.localeCompare(b.title));
  const bucketSection = document.createElement('section'); bucketSection.className = 'archive-subsection';
  const bucketHead = document.createElement('h3'); bucketHead.textContent = 'Archived Groups'; bucketSection.append(bucketHead);
  const grid = document.createElement('div'); grid.className = 'archive-grid';
  if (archived.length) grid.replaceChildren(...archived.map(makeArchivedBucketCard));
  else {
    const empty = document.createElement('div'); empty.className = 'archive-empty';
    empty.innerHTML = normalized ? '<strong>No archived groups match this search.</strong><span>Clear the search or archive another group.</span>' : `<strong>No archived groups yet.</strong><span>Use "Archive Group" from any group's menu to send it here and tidy up your Tab.</span>`;
    grid.append(empty);
  }
  bucketSection.append(grid); wrap.append(bucketSection);
  return wrap;
}

function makeArchivedDesktopCard(desktop) {
  const card = document.createElement('article'); card.className = 'archive-card';
  card.dataset.desktopId = desktop.id;
  const copy = document.createElement('div'); copy.className = 'archive-card-copy';
  const title = document.createElement('div'); title.className = 'archive-card-title';
  const name = document.createElement('strong'); name.textContent = desktop.title;
  const kind = document.createElement('span'); kind.className = 'archive-card-kind'; kind.textContent = 'TAB';
  title.append(name, kind);
  const bucketCount = state.buckets.filter((bucket) => bucket.desktopId === desktop.id).length;
  const noteCount = (state.notes || []).filter((note) => !note.general && note.desktopId === desktop.id).length;
  const meta = document.createElement('small'); meta.textContent = `${bucketCount} group${bucketCount === 1 ? '' : 's'} · ${noteCount} note${noteCount === 1 ? '' : 's'}`;
  copy.append(title, meta);
  const actions = document.createElement('div'); actions.className = 'archive-card-actions';
  const restore = createButton('Reactivate', 'btn btn-secondary compact', 'reactivate-desktop', 'Reactivate this Tab'); restore.dataset.desktopId = desktop.id;
  const del = createButton('Delete', 'btn btn-ghost compact danger-text', 'delete-archived-desktop', 'Permanently delete this Tab'); del.dataset.desktopId = desktop.id;
  actions.append(restore, del);
  card.append(copy, actions);
  return card;
}

function makeArchivedBucketCard(bucket) {
  const card = document.createElement('article'); card.className = 'archive-card';
  card.dataset.bucketId = bucket.id;
  const copy = document.createElement('div'); copy.className = 'archive-card-copy';
  const title = document.createElement('div'); title.className = 'archive-card-title';
  const name = document.createElement('strong'); name.textContent = bucket.title;
  title.append(name);
  const meta = document.createElement('small'); meta.textContent = `${bucketDesktopTitle(bucket)} · ${bucket.bookmarkIds.length} link${bucket.bookmarkIds.length === 1 ? '' : 's'}`;
  copy.append(title, meta);
  const actions = document.createElement('div'); actions.className = 'archive-card-actions';
  const restore = createButton('Restore', 'btn btn-secondary compact', 'toggle-bucket-archived', 'Restore this group to its Tab'); restore.dataset.bucketId = bucket.id;
  const del = createButton('Delete', 'btn btn-ghost compact danger-text', 'delete-bucket', 'Permanently delete this group'); del.dataset.bucketId = bucket.id;
  actions.append(restore, del);
  card.append(copy, actions);
  return card;
}

function currentSiteOverlayDialogValue() {
  const shape = SITE_OVERLAY_SHAPES.includes($('#siteOverlayShape')?.value) ? $('#siteOverlayShape').value : 'rounded';
  const width = Math.max(80, Math.min(520, Number.parseInt($('#siteOverlayWidth')?.value, 10) || 180));
  const targetMode=SITE_OVERLAY_TARGET_MODES.includes($('#siteOverlayTargetMode')?.value)?$('#siteOverlayTargetMode').value:'site';
  const target=targetMode==='site'?parseSiteOverlayTargetInput($('#siteOverlayHost')?.value||''):{host:'',pageScope:'all',pageUrl:''};
  return {
    name: ($('#siteOverlayName')?.value || '').trim() || 'Overlay',
    targetMode,
    host: target.host,
    includeSubdomains: targetMode==='site' && $('#siteOverlayIncludeSubdomains')?.checked === true,
    pageScope: target.pageScope,
    pageUrl: target.pageUrl,
    enabled: $('#siteOverlayEnabled')?.checked !== false,
    cornerDocking: $('#siteOverlayCornerDocking')?.checked === true,
    textColor: $('#siteOverlayTextColor')?.value || '#ffffff',
    backgroundColor: $('#siteOverlayBackgroundColor')?.value || '#6e49ff',
    fontFamily: SITE_OVERLAY_FONTS.includes($('#siteOverlayFont')?.value) ? $('#siteOverlayFont').value : 'system',
    fontSize: Math.max(8, Math.min(48, Number.parseInt($('#siteOverlayFontSize')?.value, 10) || 16)),
    width,
    height: Math.max(28, Math.min(280, Number.parseInt($('#siteOverlayHeight')?.value, 10) || 44)),
    shape,
    edge: SITE_OVERLAY_EDGES.includes($('#siteOverlayEdge')?.value) ? $('#siteOverlayEdge').value : 'top',
    offsetRatio: Math.max(0, Math.min(1, (Number.isFinite(Number.parseInt($('#siteOverlayEdgePosition')?.value, 10)) ? Number.parseInt($('#siteOverlayEdgePosition').value, 10) : 50) / 100))
  };
}

function updateSiteOverlayDialogPreview() {
  const value = currentSiteOverlayDialogValue();
  const preview = $('#siteOverlayLivePreview'); styleSiteOverlayPreview(preview, value);
  if ($('#siteOverlayEdgePositionValue')) $('#siteOverlayEdgePositionValue').textContent = `${Math.round(value.offsetRatio * 100)}%`;
  const heightInput = $('#siteOverlayHeight'); if (heightInput) heightInput.disabled = false;
}

function openSiteOverlayDialog(overlayId = '') {
  editingSiteOverlayId = overlayId || null;
  const overlay = overlayId ? siteOverlayById(overlayId) : null;
  $('#siteOverlayDialogTitle').textContent = overlay ? 'Edit Website Overlay' : 'Add Website Overlay';
  $('#siteOverlaySubmitBtn').textContent = overlay ? 'Save Overlay' : 'Create Overlay';
  $('#siteOverlayName').value = overlay?.name || 'Website Overlay';
  $('#siteOverlayTargetMode').value = overlay?.targetMode === 'all-sites' ? 'all-sites' : 'site';
  $('#siteOverlayHost').value = siteOverlayTargetInputValue(overlay);
  $('#siteOverlayIncludeSubdomains').checked = overlay?.includeSubdomains === true;
  updateSiteOverlayTargetModeControls('siteOverlay');
  $('#siteOverlayEnabled').checked = overlay?.enabled !== false;
  $('#siteOverlayCornerDocking').checked = overlay?.cornerDocking === true;
  $('#siteOverlayTextColor').value = overlay?.textColor || '#ffffff';
  $('#siteOverlayBackgroundColor').value = overlay?.backgroundColor || '#6e49ff';
  $('#siteOverlayFont').value = overlay?.fontFamily || 'system';
  $('#siteOverlayFontSize').value = String(overlay?.fontSize || 16);
  $('#siteOverlayWidth').value = String(overlay?.width || 180);
  $('#siteOverlayHeight').value = String(overlay?.height || 44);
  $('#siteOverlayShape').value = SITE_OVERLAY_SHAPES.includes(overlay?.shape) ? overlay.shape : (overlay?.shape === 'circle' ? 'pill' : 'rounded');
  $('#siteOverlayEdge').value = overlay?.edge || 'top';
  $('#siteOverlayEdgePosition').value = String(Math.round((overlay?.offsetRatio ?? 0.5) * 100));
  updateSiteOverlayDialogPreview();
  if (!siteOverlayDialog.open) siteOverlayDialog.showModal();
}

function populateSiteLinkOverlayDesktopOptions(selectedId = '') {
  const select = $('#siteLinkOverlayDesktop');
  if (!select) return;
  const workspaces = state.desktops.filter((desktop) => desktop.type !== 'calendar' && !desktop.archived);
  select.replaceChildren(...workspaces.map((desktop) => {
    const option = document.createElement('option'); option.value = desktop.id; option.textContent = desktop.title; return option;
  }));
  const fallback = workspaces.find((desktop) => desktop.id === selectedId)?.id || workspaces.find((desktop) => desktop.id === state.activeDesktopId)?.id || workspaces[0]?.id || '';
  select.value = fallback;
}

function currentSiteLinkOverlayDialogValue() {
  const targetMode=SITE_OVERLAY_TARGET_MODES.includes($('#siteLinkOverlayTargetMode')?.value)?$('#siteLinkOverlayTargetMode').value:'site';
  const target=targetMode==='site'?parseSiteOverlayTargetInput($('#siteLinkOverlayHost')?.value||''):{host:'',pageScope:'all',pageUrl:''};
  return {
    type: 'links',
    name: ($('#siteLinkOverlayName')?.value || '').trim() || 'MeshTab Links',
    targetMode,
    host: target.host,
    includeSubdomains: targetMode==='site' && $('#siteLinkOverlayIncludeSubdomains')?.checked === true,
    pageScope: target.pageScope,
    pageUrl: target.pageUrl,
    enabled: $('#siteLinkOverlayEnabled')?.checked !== false,
    cornerDocking: $('#siteLinkOverlayCornerDocking')?.checked === true,
    desktopId: $('#siteLinkOverlayDesktop')?.value || '',
    linkOpenMode: SITE_OVERLAY_LINK_OPEN_MODES.includes($('#siteLinkOverlayOpenMode')?.value) ? $('#siteLinkOverlayOpenMode').value : 'same-tab',
    textColor: '#6e49ff', backgroundColor: '#ffffff', fontFamily: 'system', fontSize: 16,
    iconColor: /^#[0-9a-f]{6}$/i.test(String($('#siteLinkOverlayIconColor')?.value || '')) ? $('#siteLinkOverlayIconColor').value : '#7048ff',
    customIconDataUrl: siteLinkOverlayIconDataUrl,
    opacity: Math.max(10, Math.min(100, Number.parseInt($('#siteLinkOverlayOpacity')?.value, 10) || 100)),
    width: 48, height: 48, shape: 'rounded',
    edge: SITE_OVERLAY_EDGES.includes($('#siteLinkOverlayEdge')?.value) ? $('#siteLinkOverlayEdge').value : 'top',
    offsetRatio: Math.max(0, Math.min(1, (Number.isFinite(Number.parseInt($('#siteLinkOverlayEdgePosition')?.value, 10)) ? Number.parseInt($('#siteLinkOverlayEdgePosition').value, 10) : 50) / 100))
  };
}

function updateSiteLinkOverlayDialogPreview() {
  const value = currentSiteLinkOverlayDialogValue();
  if ($('#siteLinkOverlayEdgePositionValue')) $('#siteLinkOverlayEdgePositionValue').textContent = `${Math.round(value.offsetRatio * 100)}%`;
  if ($('#siteLinkOverlayOpacityValue')) $('#siteLinkOverlayOpacityValue').textContent = `${value.opacity}%`;
  $('#siteLinkOverlayIconColor')?.classList.toggle('disabled-field', Boolean(value.customIconDataUrl));
  $('#siteLinkOverlayRemoveIconBtn')?.classList.toggle('hidden', !value.customIconDataUrl);
  const preview = $('#siteLinkOverlayLivePreview');
  if (preview) {
    preview.replaceChildren(makeMeshTabMiniLogo(31, value));
    preview.style.opacity = String(value.opacity / 100);
    preview.title = `${value.name} · ${state.desktops.find((desktop) => desktop.id === value.desktopId)?.title || 'MeshTab Tab'}`;
  }
  const caption = $('#siteLinkOverlayPreviewCaption');
  if (caption) caption.textContent = `${state.desktops.find((desktop) => desktop.id === value.desktopId)?.title || 'MeshTab Tab'} · ${siteOverlayOpenModeLabel(value.linkOpenMode)}`;
}

async function handleSiteLinkOverlayIconUpload(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Choose an image file for the icon.'); return; }
  const dataUrl = await imageFileToDataUrl(file, 128);
  if (!/^data:image\//i.test(dataUrl)) { toast('Could not read that image.'); return; }
  siteLinkOverlayIconDataUrl = dataUrl;
  updateSiteLinkOverlayDialogPreview();
}

function removeSiteLinkOverlayIcon() {
  siteLinkOverlayIconDataUrl = '';
  updateSiteLinkOverlayDialogPreview();
}

function openSiteLinkOverlayDialog(overlayId = '') {
  editingSiteOverlayId = overlayId || null;
  const overlay = overlayId ? siteOverlayById(overlayId) : null;
  $('#siteLinkOverlayDialogTitle').textContent = overlay ? 'Edit MeshTab Link Overlay' : 'Add MeshTab Link Overlay';
  $('#siteLinkOverlaySubmitBtn').textContent = overlay ? 'Save Link Overlay' : 'Create Link Overlay';
  $('#siteLinkOverlayName').value = overlay?.name || 'MeshTab Links';
  $('#siteLinkOverlayTargetMode').value = overlay?.targetMode === 'all-sites' ? 'all-sites' : 'site';
  $('#siteLinkOverlayHost').value = siteOverlayTargetInputValue(overlay);
  $('#siteLinkOverlayIncludeSubdomains').checked = overlay?.includeSubdomains === true;
  updateSiteOverlayTargetModeControls('siteLinkOverlay');
  $('#siteLinkOverlayEnabled').checked = overlay?.enabled !== false;
  $('#siteLinkOverlayCornerDocking').checked = overlay?.cornerDocking === true;
  populateSiteLinkOverlayDesktopOptions(overlay?.desktopId || state.activeDesktopId);
  $('#siteLinkOverlayOpenMode').value = SITE_OVERLAY_LINK_OPEN_MODES.includes(overlay?.linkOpenMode) ? overlay.linkOpenMode : 'same-tab';
  $('#siteLinkOverlayEdge').value = overlay?.edge || 'top';
  $('#siteLinkOverlayEdgePosition').value = String(Math.round((overlay?.offsetRatio ?? 0.5) * 100));
  $('#siteLinkOverlayIconColor').value = /^#[0-9a-f]{6}$/i.test(String(overlay?.iconColor || '')) ? overlay.iconColor : '#7048ff';
  $('#siteLinkOverlayOpacity').value = String(Math.max(10, Math.min(100, Number.isFinite(Number(overlay?.opacity)) ? Number(overlay.opacity) : 100)));
  siteLinkOverlayIconDataUrl = overlay?.customIconDataUrl || '';
  updateSiteLinkOverlayDialogPreview();
  if (!siteLinkOverlayDialog.open) siteLinkOverlayDialog.showModal();
}

async function useActivePageForSiteLinkOverlay() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const candidates = tabs.filter((tab) => /^https?:\/\//i.test(tab.url || tab.pendingUrl || '')).sort((a,b) => Number(b.active)-Number(a.active) || Number(b.lastAccessed||0)-Number(a.lastAccessed||0));
    const rawUrl=candidates[0]?.url || candidates[0]?.pendingUrl || ''; const target = parseSiteOverlayTargetInput(rawUrl);
    if (!target.host) { toast('No recent normal website page was found in this window.'); return; }
    $('#siteLinkOverlayHost').value = rawUrl; updateSiteLinkOverlayDialogPreview();
  } catch { toast('Could not read a recent website domain.'); }
}

async function saveSiteLinkOverlay(event) {
  event.preventDefault();
  const value = currentSiteLinkOverlayDialogValue();
  if (value.targetMode==='site' && !value.host) { toast('Enter a valid website domain or page URL, or choose All websites in Chrome.'); $('#siteLinkOverlayHost')?.focus(); return; }
  if (!value.name.trim()) { toast('Give this link overlay a name.'); return; }
  if (!value.desktopId) { toast('Select a MeshTab Tab.'); $('#siteLinkOverlayDesktop')?.focus(); return; }
  state.siteOverlays ||= [];
  const now = new Date().toISOString();
  const existing = editingSiteOverlayId ? siteOverlayById(editingSiteOverlayId) : null;
  if (existing) Object.assign(existing, value, { updatedAt: now });
  else state.siteOverlays.push({ id: uid('overlay'), ...value, createdAt: now, updatedAt: now });
  await saveState();
  siteLinkOverlayDialog.close();
  editingSiteOverlayId = null;
  render();
  toast(existing ? 'MeshTab Link overlay updated.' : 'MeshTab Link overlay created.');
}

async function useActivePageForSiteOverlay() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const candidates = tabs.filter((tab) => /^https?:\/\//i.test(tab.url || tab.pendingUrl || '')).sort((a,b) => Number(b.active)-Number(a.active) || Number(b.lastAccessed||0)-Number(a.lastAccessed||0));
    const tab = candidates[0];
    const rawUrl=tab?.url || tab?.pendingUrl || ''; const target = parseSiteOverlayTargetInput(rawUrl);
    if (!target.host) { toast('No recent normal website page was found in this window.'); return; }
    $('#siteOverlayHost').value = rawUrl; updateSiteOverlayDialogPreview();
  } catch { toast('Could not read a recent website domain.'); }
}

async function saveSiteOverlay(event) {
  event.preventDefault();
  const value = currentSiteOverlayDialogValue();
  if (value.targetMode==='site' && !value.host) { toast('Enter a valid website domain or page URL, or choose All websites in Chrome.'); $('#siteOverlayHost')?.focus(); return; }
  if (!value.name.trim()) { toast('Give this overlay a name.'); return; }
  state.siteOverlays ||= [];
  const now = new Date().toISOString();
  const existing = editingSiteOverlayId ? siteOverlayById(editingSiteOverlayId) : null;
  if (existing) Object.assign(existing, value, { updatedAt: now });
  else state.siteOverlays.push({ id: uid('overlay'), ...value, createdAt: now, updatedAt: now });
  await saveState();
  siteOverlayDialog.close();
  editingSiteOverlayId = null;
  render();
  toast(existing ? 'Overlay updated.' : 'Overlay created.');
}

async function toggleSiteOverlay(overlayId) {
  const overlay = siteOverlayById(overlayId); if (!overlay) return;
  overlay.enabled = !overlay.enabled; overlay.updatedAt = new Date().toISOString();
  await saveState(); render(); toast(overlay.enabled ? 'Overlay enabled.' : 'Overlay paused.');
}

async function deleteSiteOverlay(overlayId) {
  const overlay = siteOverlayById(overlayId); if (!overlay) return;
  if (!confirm(`Delete overlay "${overlay.name}"?`)) return;
  state.siteOverlays = (state.siteOverlays || []).filter((item) => item.id !== overlay.id);
  await saveState(); render(); toast('Overlay deleted.');
}

function openCalendarTabDialog(desktopId='') {
  const desktop=desktopId?state.desktops.find(d=>d.id===desktopId):null;
  $('#calendarTabDialogTitle').textContent=desktop?'Edit Calendar Tab':'Add Google Calendar Tab';
  $('#calendarTabSubmitBtn').textContent=desktop?'Save Calendar Tab':'Create Calendar Tab';
  $('#calendarTabId').value=desktop?.id||''; $('#calendarTabTitle').value=desktop?.title||'Calendar'; $('#calendarTabEmbed').value=desktop?.calendarUrl||'';
  if(!calendarTabDialog.open) calendarTabDialog.showModal();
}
async function saveCalendarTab(event){ event.preventDefault(); const id=$('#calendarTabId').value; const title=($('#calendarTabTitle').value.trim()||'Calendar').slice(0,60); const url=normalizeCalendarEmbedUrl($('#calendarTabEmbed').value); if(!url){toast('Paste a Google Calendar embed URL, embed code, or Calendar ID.');return;} let desktop=id?state.desktops.find(d=>d.id===id):null; if(desktop){desktop.title=title;desktop.type='calendar';desktop.calendarUrl=url;} else {desktop={id:uid('desktop'),title,type:'calendar',calendarUrl:url};state.desktops.push(desktop);} state.activeDesktopId=desktop.id;state.settings.activeView='desktop'; await saveState(); calendarTabDialog.close(); render(); toast(id?'Calendar Tab updated.':'Calendar Tab created.'); }

function render() {
  const query = ($('#globalSearch').value || '').trim().toLowerCase();
  const view = state.settings.activeView || 'desktop';
  const items = [];
  const viewHeading = $('#viewHeading');
  viewHeading?.classList.add('hidden');

  if (view === 'general-notes') {
    items.push(renderGeneralNotesSection(query));
  } else if (view === 'tasks') {
    // handled by renderTaskCenter()
  } else if (view === 'reminders') {
    items.push(renderReminderCenter(query));
  } else if (view === 'allocations') {
    items.push(renderAllocationsCenter(query));
  } else if (view === 'overlays') {
    items.push(renderSiteOverlaysCenter(query));
  } else if (view === 'archive') {
    items.push(renderArchiveCenter(query));
  } else if (view === 'home') {
    items.push(renderHomeHub());
  } else {
    const desktop=activeDesktop();
    if (desktop?.type === 'calendar') { items.push(renderCalendarDesktop(desktop)); }
    const roots = desktop?.type === 'calendar' ? [] : childrenOf(null, state.activeDesktopId).filter((bucket) => bucketBranchMatches(bucket, query));
    const notes = desktop?.type === 'calendar' ? [] : (state.settings.showNotes ? rootNotesForDesktop(state.activeDesktopId).filter((note) => noteBranchMatches(note, query)) : []);
    const groupCanvas = roots.length ? renderFreeGroupCanvas(roots, query) : null;
    const paneItems = [...roots, ...notes];
    const tabAllocations = desktop?.type === 'calendar' ? null : (state.settings.showTasks ? renderTabAllocationsSection() : null);
    const tabTasks = desktop?.type === 'calendar' ? null : (state.settings.showTasks ? renderTabTasksSection() : null);
    if (tabAllocations) items.push(tabAllocations);
    if (tabTasks) items.push(tabTasks);
    if (groupCanvas) items.push(groupCanvas);
    items.push(...notes.map((note) => renderNote(note, query, 0)));
    if (!paneItems.length && desktop?.type !== 'calendar') {
      const empty = document.createElement('div');
      empty.className = 'desktop-empty';
      empty.innerHTML = query ? '<strong>No groups, Tab notes, or links match this search.</strong><span>Try another search or switch Tabs.</span>' : '<strong>This Tab has no groups or Tab notes yet.</strong><span>Create a group or note to start organizing this Pane.</span>';
      items.push(empty);
    }
  }
  bucketGrid.replaceChildren(...items);
  // Restore the saved rail widths before measuring the Mesh canvas. On a fresh
  // browser launch the default rail classes otherwise make the canvas narrower
  // for one render and can incorrectly relocate persisted Groups.
  applyOpenPagesState();
  applyTaskRailState();
  applyFeatureVisibility();
  if (view === 'desktop') initializeFreeGroupCanvas(bucketGrid.querySelector('.free-group-canvas'));
  const desktopBuckets = state.buckets.filter((bucket) => bucket.desktopId === state.activeDesktopId && !bucket.archived);
  $('#bucketCount').textContent = desktopBuckets.length;
  $('#meshCount').textContent = desktopBuckets.reduce((sum, bucket) => sum + bucket.bookmarkIds.length, 0);
  $('#noteCount').textContent = (state.notes || []).filter((note) => !note.general && note.desktopId === state.activeDesktopId).length;
  $('#openTaskCount').textContent = openTasks().length;
  const allocationSummary = activeDesktopAllocationSummary(state.activeDesktopId);
  const allocatedTimeTotal = $('#allocatedTimeTotal');
  const allocatedTimeStat = $('#allocatedTimeStat');
  if (allocatedTimeTotal) allocatedTimeTotal.textContent = allocationSummary.finiteCount ? formatTaskMinutes(allocationSummary.budgetMinutes) : (allocationSummary.openBucketCount ? 'OPEN' : '0h');
  if (allocatedTimeStat) {
    const balance = allocationSummary.finiteCount ? (allocationSummary.remainingMinutes >= 0 ? `${formatTaskMinutes(allocationSummary.remainingMinutes)} remaining` : `OVER ${formatTaskMinutes(Math.abs(allocationSummary.remainingMinutes))}`) : 'No fixed-hour allocation';
    allocatedTimeStat.title = `${allocationSummary.allocations.length} active allocation${allocationSummary.allocations.length === 1 ? '' : 's'} · ${formatTaskMinutes(allocationSummary.loggedMinutes)} logged · ${balance}`;
    allocatedTimeStat.classList.toggle('over-budget', allocationSummary.finiteCount > 0 && allocationSummary.remainingMinutes < 0);
  }
  $('#bookmarkCount').textContent = bookmarks.length;
  const isCalendarTab = view === 'desktop' && activeDesktop()?.type === 'calendar';
  const archiveGearBtn = $('#desktopGearArchiveBtn');
  if (archiveGearBtn) {
    const currentDesktop = activeDesktop();
    const activeDesktopCount = state.desktops.filter((candidate) => !candidate.archived).length;
    const canArchiveTab = view === 'desktop' && currentDesktop && currentDesktop.type !== 'calendar' && activeDesktopCount > 1;
    archiveGearBtn.classList.toggle('hidden', isCalendarTab);
    archiveGearBtn.disabled = !canArchiveTab;
    archiveGearBtn.title = canArchiveTab
      ? `Archive the "${currentDesktop.title}" Tab and move it to the Archive`
      : (activeDesktopCount <= 1 ? 'MeshTab needs at least one active Tab' : 'Switch to a Tab to archive it');
  }
  const calendarSettingsGearBtn = $('#desktopGearCalendarSettingsBtn'); if (calendarSettingsGearBtn) { calendarSettingsGearBtn.classList.toggle('hidden', !isCalendarTab); calendarSettingsGearBtn.disabled = view !== 'desktop'; }
  const renameGearBtn = $('#desktopGearRenameBtn'); if (renameGearBtn) renameGearBtn.disabled = view !== 'desktop';
  const deleteGearBtn = $('#desktopGearDeleteBtn'); if (deleteGearBtn) deleteGearBtn.disabled = view !== 'desktop';
  const creationRow=document.querySelector('.new-project-row');
  updateAddMenuContentItems();
  $('#calendarTabRowActions')?.classList.toggle('hidden', !isCalendarTab);
  // Tab options (⚙ Rename / Archive / Delete, plus "Open in Google Calendar" on calendar Tabs) sit right
  // next to the ⏱ Work Clock button in the command row, on every Tab type.
  const gearCluster = $('#tabGearCluster');
  const commandActions = document.querySelector('.command-actions');
  const workClockBtnEl = $('#workClockBtn');
  if (gearCluster && commandActions && gearCluster.parentElement !== commandActions) commandActions.insertBefore(gearCluster, workClockBtnEl || commandActions.firstChild);
  gearCluster?.classList.toggle('hidden', view !== 'desktop');
  $('#calendarCommandActions')?.classList.add('hidden');
  if (creationRow) creationRow.classList.add('hidden');
  document.querySelector('.stats')?.classList.toggle('hidden', view !== 'desktop' || isCalendarTab);
  renderOpenTabs($('#globalSearch').value || '');
  renderTaskRail();
  renderDesktops();
  renderQuickLinks();
  populateBucketSelect();
  startReminderCountdowns();
  populateParentSelect();
  if (state.workClock?.runningSince && !workClockTickTimer) startWorkClockTicker(); else renderWorkClockDialog();
  renderActiveTaskTimerBar();
  maybeOpenPendingTaskTimerEntry();
}

function hierarchyRows(desktopId = state.activeDesktopId) {
  const rows = [];
  function walk(parentId, depth) {
    for (const bucket of childrenOf(parentId, desktopId)) {
      rows.push({ bucket, depth });
      walk(bucket.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}

function fillBucketOptions(select) {
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  for (const { bucket, depth } of hierarchyRows()) {
    const option = document.createElement('option');
    option.value = bucket.id;
    option.textContent = `${'  '.repeat(depth)}${depth ? '- ' : ''}${bucket.title}`;
    select.append(option);
  }
  if (state.buckets.some((bucket) => bucket.id === current && bucket.desktopId === state.activeDesktopId)) select.value = current;
}

function populateBucketSelect() {
  fillBucketOptions($('#pickerBucketSelect'));
}

function populateParentSelect(selected = pendingParentId, excludeBucketId = editingBucketId) {
  const select = $('#bucketParent');
  if (!select) return;
  select.replaceChildren();
  const excluded = new Set();
  if (excludeBucketId) {
    excluded.add(String(excludeBucketId));
    for (const descendant of descendantsOf(excludeBucketId)) excluded.add(descendant.id);
  }
  const root = document.createElement('option');
  root.value = '';
  root.textContent = `Desktop — ${activeDesktop()?.title || 'Main'}`;
  select.append(root);
  for (const { bucket, depth } of hierarchyRows()) {
    if (excluded.has(bucket.id)) continue;
    const option = document.createElement('option');
    option.value = bucket.id;
    option.textContent = `${'  '.repeat(depth)}${depth ? '↳ ' : ''}${bucket.title}`;
    select.append(option);
  }
  const selectedBucket = selected ? getBucket(selected) : null;
  select.value = selectedBucket && selectedBucket.desktopId === state.activeDesktopId && !excluded.has(selectedBucket.id) ? selected : '';
}

function setBucketDialogMode(mode, bucket = null) {
  const editing = mode === 'edit' && bucket;
  $('#bucketDialogKicker').textContent = editing ? 'EDIT GROUP' : 'NEW GROUP';
  $('#bucketDialogTitle').textContent = editing ? 'Edit Group' : 'Create a Group';
  const submit = $('#bucketSubmitBtn');
  submit.textContent = editing ? 'Save changes' : 'Create';
  submit.disabled = false;
}

function resetBucketDialogState() {
  editingBucketId = null;
  pendingParentId = null;
  $('#bucketForm').reset();
  selectBucketColor('violet');
  $('#bucketColorCustomInput').value = '#6e49ff';
  setBucketDialogMode('create');
}

function selectBucketColor(color) {
  if (COLORS.includes(color)) {
    const input = document.querySelector(`input[name="bucketColor"][value="${color}"]`);
    if (input) input.checked = true;
  } else {
    const hex = isCustomBucketColor(color) ? color : '#6e49ff';
    $('#bucketColorCustomRadio').checked = true;
    $('#bucketColorCustomInput').value = hex;
  }
}


function populateNoteLocationSelect(selected = null, parentNoteId = null) {
  const select = $('#noteLocation'); if (!select) return;
  select.replaceChildren();
  if (parentNoteId) {
    const parent=getNote(parentNoteId); if(parent){ const option=document.createElement('option'); option.value=`parent:${parent.id}`; option.textContent=`Inside Note — ${parent.title}`; select.append(option); }
  }
  const general=document.createElement('option'); general.value='general'; general.textContent='General Notes'; select.append(general);
  for (const desktop of state.desktops.filter((candidate) => !candidate.archived)) { const option=document.createElement('option'); option.value=`desktop:${desktop.id}`; option.textContent=`Tab — ${desktop.title}`; select.append(option); }
  const create=document.createElement('option'); create.value='new-desktop'; create.textContent='+ Create a new Tab'; select.append(create);
  select.value = Array.from(select.options).some((option)=>option.value===selected) ? selected : `desktop:${state.activeDesktopId}`;
  $('#noteNewTabWrap').classList.toggle('hidden', select.value !== 'new-desktop');
}

function populateExistingNoteSelect(currentId = null) {
  const select=$('#noteExistingSelect'); if(!select) return;
  select.replaceChildren(); const fresh=document.createElement('option'); fresh.value=''; fresh.textContent='New note'; select.append(fresh);
  const generalNotes=(state.notes||[]).filter((n)=>n.general).sort((a,b)=>a.title.localeCompare(b.title));
  if(generalNotes.length){ const group=document.createElement('optgroup'); group.label='General Notes'; for(const note of generalNotes){ const option=document.createElement('option'); option.value=note.id; option.textContent=note.title; group.append(option);} select.append(group); }
  for(const desktop of state.desktops){ const notes=(state.notes||[]).filter((n)=>!n.general&&n.desktopId===desktop.id).sort((a,b)=>a.title.localeCompare(b.title)); if(!notes.length) continue; const group=document.createElement('optgroup'); group.label=`Tab — ${desktop.title}`; for(const note of notes){const option=document.createElement('option');option.value=note.id;option.textContent=note.title;group.append(option);} select.append(group);}
  select.value=currentId||'';
}

function resetNoteDialogState() {
  editingNoteId = null; pendingParentNoteId = null; pendingNoteLocation = null;
  $('#noteForm').reset(); $('#noteEditor').innerHTML = ''; $('#noteNewTabWrap').classList.add('hidden');
  $('#noteDialogTitle').textContent = 'Create a note'; $('#noteSubmitBtn').textContent = 'Create note'; $('#noteSubmitBtn').disabled = false;
}

function openNoteDialog(noteId = null, parentNoteId = null, forcedLocation = null) {
  editingNoteId = noteId ? String(noteId) : null;
  pendingParentNoteId = !editingNoteId && parentNoteId ? String(parentNoteId) : null;
  pendingNoteLocation = forcedLocation;
  const note = editingNoteId ? getNote(editingNoteId) : null;
  const parent = (note?.parentNoteId ? getNote(note.parentNoteId) : pendingParentNoteId ? getNote(pendingParentNoteId) : null);
  $('#noteDialogTitle').textContent = note ? 'Edit note' : parent ? `Create a note inside ${parent.title}` : 'Create a note';
  $('#noteSubmitBtn').textContent = note ? 'Save changes' : 'Create note';
  $('#noteTitle').value = note?.title || ''; $('#noteMasked').checked = Boolean(note?.masked); $('#noteEditor').innerHTML = sanitizeNoteHtml(note?.html || ''); $('#noteNewTabName').value='';
  let location = forcedLocation;
  if (!location) location = parent ? `parent:${parent.id}` : note?.general ? 'general' : note ? `desktop:${note.desktopId}` : `desktop:${state.activeDesktopId}`;
  populateNoteLocationSelect(location, parent?.id || null); populateExistingNoteSelect(note?.id || null);
  if (!noteDialog.open) noteDialog.showModal(); setTimeout(() => $('#noteTitle').focus(), 0);
}

function restoreEditorRange(editor, range) {
  editor.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  if (range && editor.contains(range.commonAncestorContainer)) selection.addRange(range);
  else {
    const fallback = document.createRange();
    fallback.selectNodeContents(editor);
    fallback.collapse(false);
    selection.addRange(fallback);
  }
}

function insertNodeAtSelection(editor, node, savedRange = null) {
  restoreEditorRange(editor, savedRange);
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertPlainText(editor, text, savedRange = null) {
  restoreEditorRange(editor, savedRange);
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index) fragment.append(document.createElement('br'));
    fragment.append(document.createTextNode(line));
  });
  const marker = document.createTextNode('');
  fragment.append(marker);
  range.insertNode(fragment);
  range.setStartAfter(marker);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  marker.remove();
}

async function imageFileToDataUrl(file, maxDimension = 1800) {
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 || !bitmap.width || !bitmap.height) { bitmap.close?.(); return raw; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/webp', 0.88) || raw;
  } catch { return raw; }
}

function insertHtmlAtSelection(editor, html, savedRange = null) {
  restoreEditorRange(editor, savedRange);
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function escapeNoteText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NOTE_BULLET_LINE = /^\s*[-*•·▪‣◦]\s+(.*)$/;
const NOTE_NUMBERED_LINE = /^\s*\d+[.)]\s+(.*)$/;

// Turns plain pasted text into note HTML, promoting consecutive "- item" / "• item" /
// "1. item" lines into a real <ul>/<ol> list (so bulleted text pasted from a plain-text
// source, like a .txt file or email, becomes an actual list) instead of flattening
// everything to line breaks.
function plainTextToNoteHtml(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const parts = [];
  let listItems = [];
  let listTag = null;
  let plainLines = [];
  const flushList = () => {
    if (!listItems.length) return;
    parts.push(`<${listTag}>${listItems.map((item) => `<li>${escapeNoteText(item)}</li>`).join('')}</${listTag}>`);
    listItems = []; listTag = null;
  };
  const flushPlain = () => {
    if (!plainLines.length) return;
    parts.push(plainLines.map(escapeNoteText).join('<br>'));
    plainLines = [];
  };
  for (const line of lines) {
    const bulletMatch = line.match(NOTE_BULLET_LINE);
    const numberedMatch = !bulletMatch && line.match(NOTE_NUMBERED_LINE);
    if (bulletMatch) { flushPlain(); if (listTag && listTag !== 'ul') flushList(); listTag = 'ul'; listItems.push(bulletMatch[1]); }
    else if (numberedMatch) { flushPlain(); if (listTag && listTag !== 'ol') flushList(); listTag = 'ol'; listItems.push(numberedMatch[1]); }
    else { flushList(); plainLines.push(line); }
  }
  flushList(); flushPlain();
  return parts.join('');
}

async function handleNotePaste(event) {
  const editor = event.target.closest?.('[contenteditable="true"]') || event.currentTarget;
  const selection = window.getSelection();
  const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const imageFiles = Array.from(event.clipboardData?.items || []).filter((item) => item.type?.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
  if (imageFiles.length) {
    event.preventDefault();
    let insertionRange = savedRange;
    for (const file of imageFiles) {
      const dataUrl = await imageFileToDataUrl(file);
      if (!/^data:image\//i.test(dataUrl)) continue;
      const image = document.createElement('img');
      image.src = dataUrl;
      image.alt = 'Pasted image';
      insertNodeAtSelection(editor, image, insertionRange);
      insertionRange = null;
    }
    return;
  }
  // Prefer the rich clipboard payload when present so a bulleted/numbered list copied
  // from a webpage, Word, or another note keeps its actual <ul>/<ol> structure instead
  // of being flattened to plain lines. sanitizeNoteHtml() strips anything outside the
  // note editor's small safe tag set either way.
  const htmlData = event.clipboardData?.getData('text/html');
  if (htmlData && htmlData.trim()) {
    const cleaned = sanitizeNoteHtml(htmlData);
    if (cleaned) {
      event.preventDefault();
      insertHtmlAtSelection(editor, cleaned, savedRange);
      linkifyNoteElement(editor);
      return;
    }
  }
  const text = event.clipboardData?.getData('text/plain');
  if (text != null) {
    event.preventDefault();
    insertHtmlAtSelection(editor, plainTextToNoteHtml(text), savedRange);
    linkifyNoteElement(editor);
  }
}

async function handleNoteSubmit(event) {
  event.preventDefault(); const submit=$('#noteSubmitBtn'); if(submit.disabled) return; const title=$('#noteTitle').value.trim(); if(!title) return; submit.disabled=true;
  const html=linkifyNoteHtml($('#noteEditor').innerHTML), masked=Boolean($('#noteMasked').checked); let location=$('#noteLocation').value;
  try {
    let targetDesktopId=state.activeDesktopId, general=false, parentNoteId=null;
    if(location==='new-desktop'){ const name=($('#noteNewTabName').value.trim()||'Notes').slice(0,60); const desktop={id:uid('desktop'),title:name,type:'workspace',calendarUrl:''}; state.desktops.push(desktop); targetDesktopId=desktop.id; state.activeDesktopId=desktop.id; }
    else if(location==='general') general=true;
    else if(location.startsWith('desktop:')) targetDesktopId=location.slice(8);
    else if(location.startsWith('parent:')) { const parent=getNote(location.slice(7)); if(parent){ parentNoteId=parent.id; general=Boolean(parent.general); targetDesktopId=parent.desktopId; } }
    if(editingNoteId){
      const note=getNote(editingNoteId); if(!note) throw new Error('That note no longer exists.'); const oldGeneral=note.general, oldDesktopId=note.desktopId, oldParentNoteId=note.parentNoteId; note.title=title.slice(0,100); note.masked=masked; note.html=html; note.parentNoteId=parentNoteId;
      if(general) moveNoteTreeToGeneral(note); else moveNoteTreeToDesktop(note,targetDesktopId);
      if(oldGeneral!==general || (!general && oldDesktopId!==targetDesktopId) || oldParentNoteId!==parentNoteId) note.position=nextNotePosition(targetDesktopId,parentNoteId,general);
      if(!masked) revealedNoteIds.delete(note.id); await saveState(); noteDialog.close(); render(); toast('Note updated.'); return;
    }
    state.notes ||= []; state.notes.push({id:uid('note'),title:title.slice(0,100),desktopId:targetDesktopId,general,parentNoteId,position:nextNotePosition(targetDesktopId,parentNoteId,general),masked,html,layout:{span:parentNoteId?12:4,height:0,previousSpan:0}});
    await saveState(); noteDialog.close(); render(); toast(general?'General Note created.':'Note created.');
  } catch(error){ console.error('Unable to save note',error); toast(error?.message||'Could not save that note.'); submit.disabled=false; }
}

function syncLiveNoteFromEditor(editor) {
  const note = getNote(editor?.dataset?.noteId);
  if (!note) return null;
  note.html = linkifyNoteHtml(editor.innerHTML);
  return note;
}

async function persistLiveNote(noteId) {
  liveNoteSaveTimers.delete(String(noteId));
  try {
    await saveState();
  } catch (error) {
    console.error('Unable to autosave note', error);
    toast(error?.message || 'Could not autosave that note.');
  }
}

function queueLiveNoteSave(editor, immediate = false) {
  const note = syncLiveNoteFromEditor(editor);
  if (!note) return;
  const key = note.id;
  const existing = liveNoteSaveTimers.get(key);
  if (existing) clearTimeout(existing);
  if (immediate) {
    persistLiveNote(key);
    return;
  }
  liveNoteSaveTimers.set(key, setTimeout(() => persistLiveNote(key), 550));
}


function openBucketDialog(parentId = null) {
  editingBucketId = null;
  pendingParentId = parentId;
  setBucketDialogMode('create');
  $('#bucketName').value = '';
  selectBucketColor('violet');
  $('#bucketColorCustomInput').value = '#6e49ff';
  populateParentSelect(parentId, null);
  bucketDialog.showModal();
  setTimeout(() => $('#bucketName').focus(), 0);
}

function openEditBucketDialog(bucketId) {
  const bucket = getBucket(bucketId);
  if (!bucket) return;
  editingBucketId = bucket.id;
  pendingParentId = bucket.parentId;
  setBucketDialogMode('edit', bucket);
  $('#bucketName').value = bucket.title;
  selectBucketColor(bucket.color);
  populateParentSelect(bucket.parentId, bucket.id);
  bucketDialog.showModal();
  setTimeout(() => { $('#bucketName').focus(); $('#bucketName').select(); }, 0);
}

function openBookmarkPicker(bucketId = null) {
  const available = state.buckets.filter((bucket) => bucket.desktopId === state.activeDesktopId && !bucket.archived);
  pickerBucketId = bucketId;
  const chooser = $('#bucketChooserWrap');
  chooser.classList.toggle('hidden', Boolean(bucketId) || !available.length);
  populateBucketSelect();
  if (!bucketId && available.length) $('#pickerBucketSelect').value = available[0].id;
  const bucket = getBucket(bucketId);
  $('#bookmarkDialogTitle').textContent = bucket ? `Add to ${bucket.title}` : 'Browse Chrome bookmarks';
  $('#bookmarkSearch').value = '';
  renderBookmarkResults('');
  bookmarkDialog.showModal();
  setTimeout(() => $('#bookmarkSearch').focus(), 0);
}

function selectedPickerBucketId() {
  return pickerBucketId || $('#pickerBucketSelect').value;
}

function renderBookmarkResults(query) {
  const results = $('#bookmarkResults');
  const normalized = query.trim().toLowerCase();
  let filtered = bookmarks.filter((bookmark) => !normalized || `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(normalized)).slice(0, 40);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'No Chrome bookmarks match that search.';
    results.replaceChildren(empty);
    return;
  }
  const rows = filtered.map((bookmark) => {
    const row = document.createElement('div');
    row.className = 'picker-row';
    const badge = createFaviconBadge(bookmark, 'picker-favicon');
    const meta = document.createElement('div');
    meta.className = 'picker-meta';
    const title = document.createElement('strong');
    title.textContent = bookmark.title || domainFor(bookmark.url);
    const detail = document.createElement('small');
    const assignments = assignedBucketTitles(bookmark.id);
    detail.textContent = `${domainFor(bookmark.url)}${assignments.length ? ` / in ${assignments.join(', ')}` : ''}`;
    meta.append(title, detail);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = 'pick-bookmark';
    button.dataset.bookmarkId = String(bookmark.id);
    const target = selectedPickerBucketId();
    const alreadyThere = assignedBucketIds(bookmark.id).includes(target);
    button.textContent = alreadyThere ? 'Added' : 'Add';
    button.disabled = alreadyThere;
    row.append(badge, meta, button);
    return row;
  });
  results.replaceChildren(...rows);
}

function toast(message, duration = 2200) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), duration);
}

async function handleBucketSubmit(event) {
  event.preventDefault();
  const name = $('#bucketName').value.trim();
  if (!name) return;

  const submit = $('#bucketSubmitBtn');
  if (submit.disabled) return;
  submit.disabled = true;

  let parentId = $('#bucketParent').value || null;
  let color = new FormData(event.currentTarget).get('bucketColor') || 'violet';
  if (color === 'custom') color = $('#bucketColorCustomInput').value || 'violet';
  color = normalizeBucketColor(color);

  try {
    if (editingBucketId) {
      const bucket = getBucket(editingBucketId);
      if (!bucket) {
        bucketDialog.close();
        return;
      }
      const forbiddenParents = new Set([bucket.id, ...descendantsOf(bucket.id).map((item) => item.id)]);
      if (parentId && forbiddenParents.has(parentId)) parentId = bucket.parentId;
      const parentChanged = bucket.parentId !== parentId;
      bucket.title = name.slice(0, 80);
      bucket.color = color;
      bucket.parentId = parentId;
      if (parentChanged) bucket.position = nextSiblingPosition(parentId, bucket.desktopId, bucket.id);
      await saveState();
      const editedTitle = bucket.title;

      // Keep edit mode intact until the dialog actually closes. The close event
      // performs the reset, preventing a second Save click from becoming Create.
      bucketDialog.close();
      render();
      toast(`Updated ${editedTitle}.`);
      return;
    }

    state.buckets.push({ id: uid('bucket'), title: name.slice(0, 80), kind: 'project', color, bookmarkIds: [], bookmarkLabels: {}, desktopId: state.activeDesktopId, parentId, position: nextSiblingPosition(parentId, state.activeDesktopId), layout: { span: parentId ? 12 : 4, height: 0, linkColumns: 1 } });
    await saveState();
    bucketDialog.close();
    render();
    toast('Group created.');
  } catch (error) {
    console.error('Unable to save Group', error);
    toast('Could not save that Group.');
    submit.disabled = false;
  }
}

async function createBookmarkFromForm(event) {
  event.preventDefault();
  const bucketId = selectedPickerBucketId();
  if (!bucketId) { bookmarkDialog.close(); toast('Create a group first, then add bookmarks to it.'); openBucketDialog(); return; }
  const title = $('#newUrlTitle').value.trim();
  const rawUrl = $('#newUrl').value;
  const url = normalizeLinkUrl(rawUrl);
  if (!url) { toast(looksLikeLocalPath(rawUrl) ? 'Local file links are not supported - Chrome bookmarks only work for web URLs.' : 'Add a URL.'); return; }
  try {
    const existing = await chrome.bookmarks.search({ url });
    const bookmark = existing.find((candidate) => candidate.url === url) || await chrome.bookmarks.create({ title: title || domainFor(url), url });
    await refreshBookmarks();
    await addBookmarkToBucket(String(bookmark.id), bucketId);
    event.currentTarget.reset();
    renderBookmarkResults($('#bookmarkSearch').value);
    toast('Bookmark added.');
  } catch (error) { toast(error?.message || 'Could not add that URL.'); }
}

function portableNote(note) { return { id:note.id,parentId:note.parentNoteId,title:note.title,position:note.position,masked:note.masked,html:sanitizeNoteHtml(note.html||''),layout:{...noteLayout(note)} }; }

// Flat, readable list of every logged time entry (the same entries also travel inside each task's
// timeEntries, which is what Import reads). Handy for spreadsheets / invoicing.
function exportTimeEntries() {
  const rows = [];
  for (const task of (state.tasks || [])) {
    const allocation = task.allocationId ? taskAllocationById(task.allocationId) : null;
    const desktopTitle = task.taskGroupId === 'general' ? '' : (state.desktops.find((desktop) => desktop.id === task.taskGroupId)?.title || '');
    for (const entry of (task.timeEntries || [])) rows.push({ id: entry.id, loggedAt: entry.loggedAt, minutes: entry.minutes, hours: Math.round((Number(entry.minutes) || 0) / 60 * 100) / 100, details: entry.details || '', taskId: task.id, taskTitle: task.title, taskStatus: task.status, allocationId: allocation?.id || '', allocationName: allocation?.name || '', allocationType: allocation?.type || '', allocationReference: allocation?.reference || '', desktopTitle });
  }
  return rows.sort((a, b) => String(a.loggedAt).localeCompare(String(b.loggedAt)));
}

function buildExportPayload() {
  const desktops=state.desktops.map((desktop)=>({id:desktop.id,title:desktop.title,type:desktop.type||'workspace',calendarUrl:desktop.calendarUrl||'',archived:Boolean(desktop.archived),notes:(state.notes||[]).filter((note)=>!note.general&&note.desktopId===desktop.id).map(portableNote),buckets:state.buckets.filter((bucket)=>bucket.desktopId===desktop.id).map((bucket)=>({id:bucket.id,parentId:bucket.parentId,title:bucket.title,kind:bucket.kind,color:bucket.color,archived:Boolean(bucket.archived),position:bucket.position,layout:{...bucketLayout(bucket)},links:bucket.bookmarkIds.map((id)=>bookmarkMap.get(String(id))).filter(Boolean).map((bookmark)=>({title:bookmark.title||domainFor(bookmark.url),label:bucket.bookmarkLabels?.[String(bookmark.id)]||'',url:bookmark.url,favIconUrl:MeshTabImport.safeFavicon(state.favicons?.[bookmark.url])||''}))}))}));
  return {format:'meshtab-export',app:"Tim's MeshTab",schemaVersion:23,extensionVersion:chrome.runtime.getManifest().version,exportedAt:new Date().toISOString(),settings:{...state.settings},siteOverlays:(state.siteOverlays||[]).map((overlay)=>({...overlay,desktopTitle:overlay.type==='links'?(state.desktops.find((desktop)=>desktop.id===overlay.desktopId)?.title||''):''})),generalNotes:(state.notes||[]).filter((note)=>note.general).map(portableNote),taskAllocations:(state.taskAllocations||[]).map((allocation)=>({...allocation,desktopTitle:(allocation.taskGroupId&&allocation.taskGroupId!=='general')?(state.desktops.find((desktop)=>desktop.id===allocation.taskGroupId)?.title||''):''})),tasks:(state.tasks||[]).map((task)=>({...task,desktopTitle:task.taskGroupId==='general'?'':(state.desktops.find((desktop)=>desktop.id===task.taskGroupId)?.title||'')})),reminders:(state.reminders||[]).map((reminder)=>({...MeshTabReminders.normalizeReminder(reminder)})),workClock:{...(state.workClock||{}),runningSince:state.workClock?.runningSince||'',pausedAt:state.workClock?.pausedAt||'',pausedSeconds:Math.max(0,Number(state.workClock?.pausedSeconds)||0),sessions:[...(state.workClock?.sessions||[])]},timeEntries:exportTimeEntries(),activeDesktopId:state.activeDesktopId,favicons:{...(state.favicons||{})},desktops};
}

function downloadExportPayload(payload, filenameBase) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportMeshTab() {
  downloadExportPayload(buildExportPayload(), 'tims-meshtab-backup');
  toast('MeshTab backup exported.');
}

function buildDesktopsExportPayload(desktopIds) {
  const full = buildExportPayload();
  const idSet = new Set(desktopIds);
  const desktops = full.desktops.filter((candidate) => idSet.has(candidate.id));
  if (!desktops.length) return null;
  const tasks = full.tasks.filter((task) => idSet.has(task.taskGroupId));
  const includedTaskIds = new Set(tasks.map((task) => task.id));
  const taskAllocations = full.taskAllocations.filter((allocation) => idSet.has(allocation.taskGroupId));
  const reminders = full.reminders.filter((reminder) => reminder.linkedTaskId && includedTaskIds.has(reminder.linkedTaskId));
  const siteOverlays = full.siteOverlays.filter((overlay) => overlay.type === 'links' && idSet.has(overlay.desktopId));
  const timeEntries = full.timeEntries.filter((entry) => includedTaskIds.has(entry.taskId));
  return { ...full, desktops, generalNotes: [], tasks, taskAllocations, reminders, siteOverlays, timeEntries, workClock: { runningSince: '', pausedAt: '', pausedSeconds: 0, sessions: [] } };
}

function exportSelectedDesktops(desktopIds) {
  const payload = buildDesktopsExportPayload(desktopIds);
  if (!payload) { toast('Select at least one Tab to export.'); return; }
  const names = payload.desktops.map((desktop) => desktop.title);
  const safeName = payload.desktops.length === 1
    ? (names[0] || 'tab').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tab'
    : `${payload.desktops.length}-tabs`;
  downloadExportPayload(payload, `tims-meshtab-tabs-${safeName}`);
  toast(`${payload.desktops.length === 1 ? `"${names[0]}"` : `${payload.desktops.length} Tabs`} exported. Use Import to bring it into any MeshTab.`);
}

function openExportSelectionDialog() {
  const scopeAll = $('#exportScopeAll');
  const scopeTabs = $('#exportScopeTabs');
  const toolbar = $('#exportTabSelectToolbar');
  const listWrap = $('#exportTabList');
  const submitBtn = $('#exportSelectionSubmitBtn');
  const selectAllBtn = $('#exportSelectAllTabsBtn');
  const clearAllBtn = $('#exportClearAllTabsBtn');

  function updateSubmitState() {
    if (scopeAll.checked) { submitBtn.disabled = false; return; }
    submitBtn.disabled = !Array.from(listWrap.querySelectorAll('input[type="checkbox"]')).some((input) => input.checked);
  }
  function updateScope() {
    const tabsMode = scopeTabs.checked;
    toolbar.classList.toggle('hidden', !tabsMode);
    listWrap.classList.toggle('hidden', !tabsMode);
    updateSubmitState();
  }

  const desktops = [...state.desktops].sort((a, b) => a.title.localeCompare(b.title));
  listWrap.replaceChildren(...desktops.map((desktop) => {
    const bucketCount = state.buckets.filter((bucket) => bucket.desktopId === desktop.id).length;
    const noteCount = (state.notes || []).filter((note) => !note.general && note.desktopId === desktop.id).length;
    const label = document.createElement('label'); label.className = 'import-selection-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.desktopId = desktop.id; input.checked = desktop.id === state.activeDesktopId;
    input.addEventListener('change', updateSubmitState);
    const span = document.createElement('span');
    const strong = document.createElement('strong'); strong.textContent = desktop.title + (desktop.archived ? ' (archived)' : '');
    const small = document.createElement('small'); small.textContent = `${bucketCount} group${bucketCount === 1 ? '' : 's'} · ${noteCount} note${noteCount === 1 ? '' : 's'}`;
    span.append(strong, small);
    label.append(input, span);
    return label;
  }));

  scopeAll.checked = true;
  updateScope();

  const onSelectAll = () => { for (const input of listWrap.querySelectorAll('input[type="checkbox"]')) input.checked = true; updateSubmitState(); };
  const onClearAll = () => { for (const input of listWrap.querySelectorAll('input[type="checkbox"]')) input.checked = false; updateSubmitState(); };
  const onSubmit = (event) => {
    event.preventDefault();
    if (scopeAll.checked) {
      exportMeshTab();
    } else {
      const selectedIds = Array.from(listWrap.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.dataset.desktopId);
      exportSelectedDesktops(selectedIds);
    }
    exportSelectionDialog.close();
  };
  const onClose = () => {
    scopeAll.removeEventListener('change', updateScope);
    scopeTabs.removeEventListener('change', updateScope);
    selectAllBtn.removeEventListener('click', onSelectAll);
    clearAllBtn.removeEventListener('click', onClearAll);
    $('#exportSelectionForm').removeEventListener('submit', onSubmit);
  };
  scopeAll.addEventListener('change', updateScope);
  scopeTabs.addEventListener('change', updateScope);
  selectAllBtn.addEventListener('click', onSelectAll);
  clearAllBtn.addEventListener('click', onClearAll);
  $('#exportSelectionForm').addEventListener('submit', onSubmit);
  exportSelectionDialog.addEventListener('close', onClose, { once: true });
  exportSelectionDialog.showModal();
}

function findOrCreateDesktop(title, type='workspace', calendarUrl='') {
  const normalized = title.trim().toLowerCase();
  let desktop = state.desktops.find((candidate) => candidate.title.trim().toLowerCase() === normalized);
  const safeType = type === 'calendar' ? 'calendar' : 'workspace';
  const safeCalendarUrl = safeType === 'calendar' ? normalizeCalendarEmbedUrl(calendarUrl) : '';
  if (!desktop) {
    desktop = { id: uid('desktop'), title: cleanTitle(title, 'Imported'), type: safeType, calendarUrl: safeCalendarUrl };
    state.desktops.push(desktop);
  } else if (safeType === 'calendar' && safeCalendarUrl && desktop.type === 'calendar') {
    desktop.calendarUrl = safeCalendarUrl;
  }
  return desktop;
}

function importedBucketLayout(rawLayout, parentId) {
  const layout = rawLayout && typeof rawLayout === 'object' ? rawLayout : {};
  return {
    span: Math.max(2, Math.min(12, Number.parseInt(layout.span, 10) || (parentId ? 12 : 4))),
    height: Math.max(0, Math.min(1600, Number.parseInt(layout.height, 10) || 0)),
    linkColumns: Math.max(1, Math.min(6, Number.parseInt(layout.linkColumns, 10) || 1)),
    previousSpan: Math.max(0, Math.min(12, Number.parseInt(layout.previousSpan, 10) || 0)),
    x: !parentId && layout.x != null && Number.isFinite(Number(layout.x)) ? Math.max(0, Number(layout.x)) : null,
    y: !parentId && layout.y != null && Number.isFinite(Number(layout.y)) ? Math.max(0, Number(layout.y)) : null,
    width: !parentId && Number.isFinite(Number(layout.width)) ? Math.max(180, Number(layout.width)) : 0,
    previousWidth: !parentId && Number.isFinite(Number(layout.previousWidth)) ? Math.max(180, Number(layout.previousWidth)) : 0,
    previousX: !parentId && Number.isFinite(Number(layout.previousX)) ? Math.max(0, Number(layout.previousX)) : 0,
    fullWidth: !parentId && Boolean(layout.fullWidth),
    z: !parentId ? Math.max(0, Number.parseInt(layout.z, 10) || 0) : 0
  };
}

function portableImportCounts(portable) {
  const desktops = Array.isArray(portable?.desktops) ? portable.desktops : [];
  return {
    desktops: desktops.length,
    buckets: desktops.reduce((sum, desktop) => sum + (Array.isArray(desktop?.buckets) ? desktop.buckets.length : 0), 0),
    links: MeshTabImport.countLinks(portable),
    notes: desktops.reduce((sum, desktop) => sum + (Array.isArray(desktop?.notes) ? desktop.notes.length : 0), 0) + (Array.isArray(portable?.generalNotes) ? portable.generalNotes.length : 0),
    allocations: Array.isArray(portable?.taskAllocations) ? portable.taskAllocations.length : 0,
    tasks: Array.isArray(portable?.tasks) ? portable.tasks.length : 0,
    reminders: Array.isArray(portable?.reminders) ? portable.reminders.length : 0,
    workClock: portable?.workClock && (portable.workClock.runningSince || (Array.isArray(portable.workClock.sessions) && portable.workClock.sessions.length)) ? (Array.isArray(portable.workClock.sessions) ? portable.workClock.sessions.length : 0) + (portable.workClock.runningSince ? 1 : 0) : 0,
    siteOverlays: Array.isArray(portable?.siteOverlays) ? portable.siteOverlays.length : 0
  };
}

function choosePortableImportOptions(portable) {
  const counts = portableImportCounts(portable);
  const controls = {
    workspace: $('#importSelectWorkspace'),
    links: $('#importSelectLinks'),
    notes: $('#importSelectNotes'),
    allocations: $('#importSelectAllocations'),
    tasks: $('#importSelectTasks'),
    reminders: $('#importSelectReminders'),
    workClock: $('#importSelectWorkClock'),
    siteOverlays: $('#importSelectSiteOverlays')
  };
  const available = {
    workspace: counts.desktops > 0 || counts.buckets > 0,
    links: counts.links > 0,
    notes: counts.notes > 0,
    allocations: counts.allocations > 0,
    tasks: counts.tasks > 0,
    reminders: counts.reminders > 0,
    workClock: counts.workClock > 0,
    siteOverlays: counts.siteOverlays > 0
  };

  $('#importSelectionSource').textContent = `${portable.source} backup${portable.sourceVersion != null ? ` · source ${portable.sourceVersion}` : ''}`;
  $('#importWorkspaceCount').textContent = `${counts.desktops} Tab${counts.desktops === 1 ? '' : 's'} · ${counts.buckets} Group${counts.buckets === 1 ? '' : 's'}`;
  $('#importLinksCount').textContent = `${counts.links} saved link${counts.links === 1 ? '' : 's'} · requires Tabs & Groups`;
  $('#importNotesCount').textContent = `${counts.notes} Note${counts.notes === 1 ? '' : 's'}`;
  $('#importAllocationsCount').textContent = `${counts.allocations} Allocation${counts.allocations === 1 ? '' : 's'}`;
  $('#importTasksCount').textContent = `${counts.tasks} Task${counts.tasks === 1 ? '' : 's'} · includes time and Task Notes`;
  $('#importRemindersCount').textContent = `${counts.reminders} Reminder${counts.reminders === 1 ? '' : 's'}`;
  $('#importWorkClockCount').textContent = counts.workClock ? `${Array.isArray(portable?.workClock?.sessions) ? portable.workClock.sessions.length : 0} completed session${(portable?.workClock?.sessions?.length||0)===1?'':'s'}${portable?.workClock?.runningSince?' · running clock':''}` : 'No Work Clock data';
  $('#importSiteOverlaysCount').textContent = counts.siteOverlays ? `${counts.siteOverlays} website overlay${counts.siteOverlays===1?'':'s'}` : 'No Website Overlay data';

  const updateControls = () => {
    for (const [key, input] of Object.entries(controls)) {
      const canUse = available[key] && (key !== 'links' || controls.workspace.checked);
      input.disabled = !canUse;
      input.closest('.import-selection-option')?.classList.toggle('unavailable', !canUse);
      if (!canUse) input.checked = false;
    }
    const selected = Object.values(controls).some((input) => input.checked && !input.disabled);
    $('#importSelectionSubmitBtn').disabled = !selected;
    const notes = [];
    if (!controls.workspace.checked && (controls.notes.checked || controls.allocations.checked || controls.tasks.checked)) notes.push('Without Tabs & Groups, Tab Notes are imported as General Notes and Tasks/Allocations are placed in General.');
    if (controls.tasks.checked && !controls.allocations.checked && counts.allocations) notes.push('Tasks will import without their Allocation assignment.');
    if (controls.reminders.checked && !controls.tasks.checked && counts.tasks) notes.push('Reminders will import without linked Task relationships.');
    $('#importSelectionNotice').textContent = notes.join(' ');
    $('#importSelectionNotice').classList.toggle('hidden', notes.length === 0);
  };

  for (const [key, input] of Object.entries(controls)) input.checked = available[key];
  updateControls();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const onChange = () => updateControls();
    const onSelectAll = () => { for (const [key, input] of Object.entries(controls)) input.checked = available[key]; updateControls(); };
    const onClearAll = () => { for (const input of Object.values(controls)) input.checked = false; updateControls(); };
    const onSubmit = (event) => {
      event.preventDefault();
      const value = Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, Boolean(input.checked && !input.disabled)]));
      finish(value);
      importSelectionDialog.close();
    };
    const onClose = () => finish(null);
    for (const input of Object.values(controls)) input.addEventListener('change', onChange);
    $('#importSelectAllBtn').addEventListener('click', onSelectAll);
    $('#importClearAllBtn').addEventListener('click', onClearAll);
    $('#importSelectionForm').addEventListener('submit', onSubmit);
    importSelectionDialog.addEventListener('close', onClose, { once: true });
    importSelectionDialog.showModal();
    importSelectionDialog.addEventListener('close', () => {
      for (const input of Object.values(controls)) input.removeEventListener('change', onChange);
      $('#importSelectAllBtn').removeEventListener('click', onSelectAll);
      $('#importClearAllBtn').removeEventListener('click', onClearAll);
      $('#importSelectionForm').removeEventListener('submit', onSubmit);
    }, { once: true });
  });
}

async function mergePortableImport(portable, selected = {}) {
  const options = { workspace: true, links: true, notes: true, allocations: true, tasks: true, reminders: true, workClock: true, siteOverlays: true, ...selected };
  if (!options.workspace) options.links = false;
  let createdBookmarks = 0;
  let addedAssignments = 0;
  let skippedLinks = 0;
  let createdBuckets = 0;
  let createdDesktops = 0;
  let createdNotes = 0;
  let createdTasks = 0;
  let createdAllocations = 0;
  let createdReminders = 0;
  let importedClockSessions = 0;
  let createdSiteOverlays = 0;
  bulkImporting = true;
  try {
    const byUrl = new Map(bookmarks.filter((bookmark) => bookmark.url).map((bookmark) => [bookmark.url, bookmark]));
    for (const portableDesktop of (portable.desktops || [])) {
      const hasTabNotes = options.notes && Array.isArray(portableDesktop.notes) && portableDesktop.notes.length > 0;
      if (!options.workspace && !hasTabNotes) continue;
      let desktop = activeDesktop();
      if (options.workspace) {
        const before = state.desktops.length;
        desktop = findOrCreateDesktop(portableDesktop.title || `${portable.source} Import`, portableDesktop.type || 'workspace', portableDesktop.calendarUrl || '');
        if (state.desktops.length > before) { createdDesktops += 1; if (portableDesktop.archived && state.desktops.some((candidate) => candidate !== desktop && !candidate.archived)) desktop.archived = true; }
      }
      if (hasTabNotes) {
        state.notes ||= [];
        const noteKeyMap = new Map();
        const importedNotes = [];
        for (const portableNote of portableDesktop.notes) {
          const asGeneral = !options.workspace;
          const note = { id: uid('note'), title: cleanTitle(portableNote.title, 'Imported note'), desktopId: desktop.id, general: asGeneral, parentNoteId: null, position: Number.isFinite(Number(portableNote.position)) ? Number(portableNote.position) : nextNotePosition(desktop.id, null, asGeneral), masked: Boolean(portableNote.masked), html: sanitizeNoteHtml(portableNote.html || ''), layout: { span: Math.max(2, Math.min(12, Number.parseInt(portableNote.layout?.span, 10) || (portableNote.parentKey ? 12 : 4))), height: Math.max(0, Math.min(1600, Number.parseInt(portableNote.layout?.height, 10) || 0)), previousSpan: Math.max(0, Math.min(12, Number.parseInt(portableNote.layout?.previousSpan, 10) || 0)) } };
          state.notes.push(note);
          noteKeyMap.set(portableNote.key, note.id);
          importedNotes.push({ note, portableNote });
          createdNotes += 1;
        }
        for (const { note, portableNote } of importedNotes) {
          note.parentNoteId = portableNote.parentKey && noteKeyMap.has(portableNote.parentKey) ? noteKeyMap.get(portableNote.parentKey) : null;
          if (note.parentNoteId) note.layout.span = Math.max(2, Math.min(12, Number.parseInt(portableNote.layout?.span, 10) || 12));
        }
      }
      if (!options.workspace) continue;
      const keyMap = new Map();
      const pending = [...(portableDesktop.buckets || [])];
      let guard = 0;
      while (pending.length && guard < (portableDesktop.buckets || []).length + 5) {
        guard += 1;
        let progressed = false;
        for (let index = 0; index < pending.length;) {
          const portableBucket = pending[index];
          if (portableBucket.parentKey && !keyMap.has(portableBucket.parentKey)) { index += 1; continue; }
          const parentId = portableBucket.parentKey ? keyMap.get(portableBucket.parentKey) : null;
          let bucket = state.buckets.find((candidate) => candidate.desktopId === desktop.id && candidate.parentId === parentId && candidate.title.trim().toLowerCase() === portableBucket.title.trim().toLowerCase());
          if (!bucket) {
            bucket = { id: uid('bucket'), title: cleanTitle(portableBucket.title, 'Imported project'), kind: portableBucket.kind === 'folder' ? 'folder' : 'project', color: normalizeBucketColor(portableBucket.color), bookmarkIds: [], bookmarkLabels: {}, desktopId: desktop.id, parentId, position: nextSiblingPosition(parentId, desktop.id), layout: importedBucketLayout(portableBucket.layout, parentId) };
            if (portableBucket.archived) bucket.archived = true;
            state.buckets.push(bucket);
            createdBuckets += 1;
          }
          keyMap.set(portableBucket.key, bucket.id);
          if (options.links) {
            for (const link of (portableBucket.links || [])) {
              if (!MeshTabImport.safeUrl(link.url)) { skippedLinks += 1; continue; }
              let bookmark = byUrl.get(link.url);
              if (!bookmark) {
                bookmark = await chrome.bookmarks.create({ title: link.title || domainFor(link.url), url: link.url });
                byUrl.set(link.url, bookmark);
                createdBookmarks += 1;
              }
              const id = String(bookmark.id);
              if (!bucket.bookmarkIds.includes(id)) { bucket.bookmarkIds.push(id); addedAssignments += 1; }
              bucket.bookmarkLabels ||= {};
              if (link.label) bucket.bookmarkLabels[id] = cleanTitle(link.label, '');
              rememberFavicon(link.url, link.favIconUrl);
            }
          }
          pending.splice(index, 1);
          progressed = true;
        }
        if (!progressed) break;
      }
      for (const orphan of pending) {
        const bucket = { id: uid('bucket'), title: cleanTitle(orphan.title, 'Imported project'), kind: orphan.kind === 'folder' ? 'folder' : 'project', color: normalizeBucketColor(orphan.color), bookmarkIds: [], bookmarkLabels: {}, desktopId: desktop.id, parentId: null, position: nextSiblingPosition(null, desktop.id), layout: importedBucketLayout(orphan.layout, null) };
        state.buckets.push(bucket);
        createdBuckets += 1;
      }
    }
    if (options.notes && Array.isArray(portable.generalNotes) && portable.generalNotes.length) {
      const keyMap=new Map(), imported=[]; state.notes ||= [];
      for(const portableNote of portable.generalNotes){ const note={id:uid('note'),title:cleanTitle(portableNote.title,'Imported note'),desktopId:state.activeDesktopId,general:true,parentNoteId:null,position:Number.isFinite(Number(portableNote.position))?Number(portableNote.position):nextNotePosition(state.activeDesktopId,null,true),masked:Boolean(portableNote.masked),html:sanitizeNoteHtml(portableNote.html||''),layout:{span:Math.max(2,Math.min(12,Number.parseInt(portableNote.layout?.span,10)||4)),height:Math.max(0,Math.min(1600,Number.parseInt(portableNote.layout?.height,10)||0)),previousSpan:Math.max(0,Math.min(12,Number.parseInt(portableNote.layout?.previousSpan,10)||0))}}; state.notes.push(note); keyMap.set(portableNote.key,note.id); imported.push({note,portableNote}); createdNotes++; }
      for(const {note,portableNote} of imported) note.parentNoteId=portableNote.parentKey&&keyMap.has(portableNote.parentKey)?keyMap.get(portableNote.parentKey):null;
    }
    const importedAllocationIdMap = new Map();
    if (options.allocations && Array.isArray(portable.taskAllocations)) {
      state.taskAllocations ||= [];
      for (const source of portable.taskAllocations) {
        const now = new Date().toISOString();
        let allocationGroupId='general';
        if(options.workspace && source.taskGroupId!=='general'&&source.desktopTitle){ const desktop=findOrCreateDesktop(source.desktopTitle); allocationGroupId=desktop.id; }
        const allocation = { id: uid('allocation'), name: cleanTitle(source.name,'Imported allocation').slice(0,140), type:TASK_ALLOCATION_TYPES.includes(source.type)?source.type:'project', reference:String(source.reference||'').slice(0,120), taskGroupId:allocationGroupId, mode:TASK_ALLOCATION_MODES.includes(source.mode)?source.mode:'unlimited', hours:source.mode==='unlimited'?0:Math.max(1/60,Math.min(100000,Number(source.hours)||10)), cadence:TASK_ALLOCATION_CADENCES.includes(source.cadence)?source.cadence:'weekly', startDate:/^\d{4}-\d{2}-\d{2}$/.test(String(source.startDate||''))?String(source.startDate):'', endDate:/^\d{4}-\d{2}-\d{2}$/.test(String(source.endDate||''))?String(source.endDate):'', details:String(source.details||'').slice(0,2400), active:source.active!==false, carryOverPeriods:[...new Set((Array.isArray(source.carryOverPeriods)?source.carryOverPeriods:[]).map((key)=>String(key||'')).filter((key)=>/^\d{4}-\d{2}-\d{2}$/.test(key)))].slice(-520), createdAt:Number.isFinite(Date.parse(source.createdAt||''))?new Date(source.createdAt).toISOString():now, updatedAt:Number.isFinite(Date.parse(source.updatedAt||''))?new Date(source.updatedAt).toISOString():now };
        state.taskAllocations.push(allocation); importedAllocationIdMap.set(String(source.id||''),allocation.id); createdAllocations++;
      }
    }
    const importedTaskIdMap = new Map();
    if(options.tasks && Array.isArray(portable.tasks)){
      state.tasks ||= [];
      for(const portableTask of portable.tasks){ let groupId='general'; if(options.workspace && portableTask.taskGroupId!=='general'&&portableTask.desktopTitle){ const desktop=findOrCreateDesktop(portableTask.desktopTitle); groupId=desktop.id; } const status=portableTask.status==='done'?'done':'open'; const importedWorkState=status==='done'?'closed':(TASK_WORK_STATES.includes(portableTask.workState)?portableTask.workState:(portableTask.working?'working':'todo')); const newTask={id:uid('task'),title:cleanTitle(portableTask.title,'Imported task').slice(0,140),details:String(portableTask.details||'').slice(0,1600),taskGroupId:groupId,allocationId:portableTask.allocationId&&importedAllocationIdMap.has(String(portableTask.allocationId))?importedAllocationIdMap.get(String(portableTask.allocationId)):'',priority:TASK_PRIORITIES.includes(portableTask.priority)?portableTask.priority:'medium',status,workState:importedWorkState,working:importedWorkState==='working',workingSince:importedWorkState==='working'?String(portableTask.workingSince||''):'',createdAt:Number.isFinite(Date.parse(portableTask.createdAt||''))?new Date(portableTask.createdAt).toISOString():new Date().toISOString(),updatedAt:Number.isFinite(Date.parse(portableTask.updatedAt||''))?new Date(portableTask.updatedAt).toISOString():new Date().toISOString(),dueDate:/^\d{4}-\d{2}-\d{2}$/.test(String(portableTask.dueDate||''))?String(portableTask.dueDate):'',completedAt:status==='done'&&Number.isFinite(Date.parse(portableTask.completedAt||''))?new Date(portableTask.completedAt).toISOString():'',closureNotes:String(portableTask.closureNotes||'').slice(0,2200),timeEntries:Array.isArray(portableTask.timeEntries)?portableTask.timeEntries.map((entry)=>({...entry})):[],taskLinks:Array.isArray(portableTask.taskLinks)?portableTask.taskLinks.map((link)=>({id:uid('task-link'),title:String(link?.title||'').trim().slice(0,160),url:String(link?.url||'').trim().slice(0,2000),createdAt:Number.isFinite(Date.parse(link?.createdAt||''))?new Date(link.createdAt).toISOString():new Date().toISOString()})).filter((link)=>link.url):[],taskNotes:Array.isArray(portableTask.taskNotes)?portableTask.taskNotes.map((note,noteIndex)=>({id:uid('task-note'),title:(String(note?.title||'').trim().slice(0,160)||`Task note ${noteIndex+1}`),body:String(note?.body||'').trim().slice(0,12000),createdAt:Number.isFinite(Date.parse(note?.createdAt||''))?new Date(note.createdAt).toISOString():new Date().toISOString(),updatedAt:Number.isFinite(Date.parse(note?.updatedAt||''))?new Date(note.updatedAt).toISOString():new Date().toISOString()})):[],minutesSpent:Math.max(0,Math.min(100000,Number.parseInt(portableTask.minutesSpent,10)||0))}; state.tasks.push(newTask); importedTaskIdMap.set(String(portableTask.id||''),newTask.id); createdTasks++; }
    }
    if(options.reminders && Array.isArray(portable.reminders)){
      state.reminders ||= [];
      for(const portableReminder of portable.reminders){ const linkedTaskId=portableReminder.linkedTaskId&&importedTaskIdMap.has(String(portableReminder.linkedTaskId))?importedTaskIdMap.get(String(portableReminder.linkedTaskId)):''; const normalized=MeshTabReminders.normalizeReminder({...portableReminder,id:uid('reminder'),linkedTaskId}); state.reminders.push(normalized); createdReminders++; }
    }
    if (options.siteOverlays && Array.isArray(portable?.siteOverlays)) {
      state.siteOverlays ||= [];
      for (const source of portable.siteOverlays) {
        const targetMode = source?.targetMode === 'all-sites' ? 'all-sites' : 'site';
        const host = targetMode === 'site' ? normalizeSiteOverlayHostInput(source?.host || source?.domain || '') : '';
        if (targetMode === 'site' && !host) continue;
        const type = source?.type === 'links' ? 'links' : 'label';
        const requestedShape = source?.shape === 'circle' ? 'pill' : source?.shape;
        const shape = type === 'links' ? 'rounded' : (SITE_OVERLAY_SHAPES.includes(requestedShape) ? requestedShape : 'rounded');
        const width = type === 'links' ? 48 : Math.max(80, Math.min(520, Number.parseInt(source?.width, 10) || 180));
        const pageUrl = targetMode === 'site' ? normalizeSiteOverlayPageInput(source?.pageUrl || '') : '';
        const pageScope = targetMode === 'site' && source?.pageScope === 'specific' && pageUrl ? 'specific' : 'all';
        const now = new Date().toISOString();
        let desktopId = '';
        if (type === 'links') {
          const title = String(source?.desktopTitle || '').trim();
          const sameTitle = title ? state.desktops.find((desktop) => desktop.title.toLowerCase() === title.toLowerCase() && desktop.type !== 'calendar') : null;
          desktopId = sameTitle?.id || state.desktops.find((desktop) => desktop.id === state.activeDesktopId && desktop.type !== 'calendar')?.id || state.desktops.find((desktop) => desktop.type !== 'calendar')?.id || '';
        }
        state.siteOverlays.push({
          id: uid('overlay'),
          type,
          name: cleanTitle(source?.name, type === 'links' ? 'Imported MeshTab Links' : 'Imported overlay').slice(0,80),
          targetMode,
          host,
          includeSubdomains: targetMode === 'site' && source?.includeSubdomains === true,
          pageScope,
          pageUrl,
          enabled: source?.enabled !== false,
          desktopId,
          linkOpenMode: type === 'links' && SITE_OVERLAY_LINK_OPEN_MODES.includes(source?.linkOpenMode) ? source.linkOpenMode : 'same-tab',
          textColor: /^#[0-9a-f]{6}$/i.test(String(source?.textColor || '')) ? String(source.textColor) : '#ffffff',
          backgroundColor: /^#[0-9a-f]{6}$/i.test(String(source?.backgroundColor || '')) ? String(source.backgroundColor) : '#6e49ff',
          iconColor: /^#[0-9a-f]{6}$/i.test(String(source?.iconColor || '')) ? String(source.iconColor) : '#7048ff',
          customIconDataUrl: /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(String(source?.customIconDataUrl || '')) ? String(source.customIconDataUrl) : '',
          opacity: Math.max(10, Math.min(100, Number.isFinite(Number(source?.opacity)) ? Math.round(Number(source.opacity)) : 100)),
          fontFamily: SITE_OVERLAY_FONTS.includes(source?.fontFamily) ? source.fontFamily : 'system',
          fontSize: Math.max(8, Math.min(48, Number.parseInt(source?.fontSize, 10) || 16)),
          width,
          height: type === 'links' ? 48 : Math.max(28, Math.min(280, Number.parseInt(source?.height, 10) || 44)),
          shape,
          cornerDocking: source?.cornerDocking === true,
          edge: SITE_OVERLAY_EDGES.includes(source?.edge) ? source.edge : 'top',
          offsetRatio: Math.max(0, Math.min(1, Number.isFinite(Number(source?.offsetRatio)) ? Number(source.offsetRatio) : 0.5)),
          createdAt: Number.isFinite(Date.parse(source?.createdAt || '')) ? new Date(source.createdAt).toISOString() : now,
          updatedAt: Number.isFinite(Date.parse(source?.updatedAt || '')) ? new Date(source.updatedAt).toISOString() : now
        });
        createdSiteOverlays++;
      }
    }
    if (options.workClock && portable?.workClock) {
      state.workClock ||= { runningSince:'', sessions:[] };
      const seen=new Set((state.workClock.sessions||[]).map(session=>`${session.startAt}|${session.endAt}|${session.actualSeconds}`));
      for(const session of (Array.isArray(portable.workClock.sessions)?portable.workClock.sessions:[])){
        const startAt=Number.isFinite(Date.parse(session?.startAt||''))?new Date(session.startAt).toISOString():'';
        const endAt=Number.isFinite(Date.parse(session?.endAt||''))?new Date(session.endAt).toISOString():'';
        const actualSeconds=Math.max(1,Math.round(Number(session?.actualSeconds)||((startAt&&endAt)?(Date.parse(endAt)-Date.parse(startAt))/1000:0)));
        if(!startAt||!endAt||!actualSeconds)continue; const key=`${startAt}|${endAt}|${actualSeconds}`; if(seen.has(key))continue; seen.add(key); state.workClock.sessions.push({id:uid('clock'),startAt,endAt,actualSeconds}); importedClockSessions++;
      }
      if(!state.workClock.runningSince && Number.isFinite(Date.parse(portable.workClock.runningSince||''))){
        state.workClock.runningSince=new Date(portable.workClock.runningSince).toISOString();
        state.workClock.pausedAt=Number.isFinite(Date.parse(portable.workClock.pausedAt||''))?new Date(portable.workClock.pausedAt).toISOString():'';
        state.workClock.pausedSeconds=Math.max(0,Math.round(Number(portable.workClock.pausedSeconds)||0));
        state.workClock.taskId=portable.workClock.taskId&&importedTaskIdMap.has(String(portable.workClock.taskId))?importedTaskIdMap.get(String(portable.workClock.taskId)):'';
      }
      const importedClockPosition=portable?.settings?.workClockOverlayPosition;
      if(['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','free'].includes(importedClockPosition)) state.settings.workClockOverlayPosition=importedClockPosition;
      if(Number.isFinite(Number(portable?.settings?.workClockOverlayXRatio))) state.settings.workClockOverlayXRatio=Math.max(0,Math.min(1,Number(portable.settings.workClockOverlayXRatio)));
      if(Number.isFinite(Number(portable?.settings?.workClockOverlayYRatio))) state.settings.workClockOverlayYRatio=Math.max(0,Math.min(1,Number(portable.settings.workClockOverlayYRatio)));
    }
    if (options.links) await refreshBookmarks();
    cleanMissingAssignments();
    await saveState();
    render();
  } finally { bulkImporting = false; }
  return { createdBookmarks, addedAssignments, skippedLinks, createdBuckets, createdNotes, createdTasks, createdAllocations, createdReminders, createdDesktops, importedClockSessions, createdSiteOverlays };
}

function importResultMessage(result) {
  const parts = [];
  if (result.createdDesktops) parts.push(`${result.createdDesktops} Tab${result.createdDesktops === 1 ? '' : 's'}`);
  if (result.createdBuckets) parts.push(`${result.createdBuckets} Group${result.createdBuckets === 1 ? '' : 's'}`);
  if (result.addedAssignments) parts.push(`${result.addedAssignments} link${result.addedAssignments === 1 ? '' : 's'}`);
  if (result.createdNotes) parts.push(`${result.createdNotes} Note${result.createdNotes === 1 ? '' : 's'}`);
  if (result.createdAllocations) parts.push(`${result.createdAllocations} Allocation${result.createdAllocations === 1 ? '' : 's'}`);
  if (result.createdTasks) parts.push(`${result.createdTasks} Task${result.createdTasks === 1 ? '' : 's'}`);
  if (result.createdReminders) parts.push(`${result.createdReminders} Reminder${result.createdReminders === 1 ? '' : 's'}`);
  if (result.importedClockSessions) parts.push(`${result.importedClockSessions} Work Clock session${result.importedClockSessions === 1 ? '' : 's'}`);
  if (result.createdSiteOverlays) parts.push(`${result.createdSiteOverlays} Website Overlay${result.createdSiteOverlays === 1 ? '' : 's'}`);
  return parts.length ? `Imported ${parts.join(', ')}.` : 'Import finished. No new items were added.';
}

async function handleImportFile(event) {
  const [file] = Array.from(event.target.files || []);
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const portable = MeshTabImport.parseImport(data);
    const selected = await choosePortableImportOptions(portable);
    if (!selected) return;
    toast(`Importing selected ${portable.source} data...`, 6000);
    const result = await mergePortableImport(portable, selected);
    toast(importResultMessage(result), 5200);
  } catch (error) {
    console.error('MeshTab import failed:', error);
    toast(error?.message || 'Could not import that JSON file.', 5000);
  }
}

// The single "+" in the Tab row always offers New Tab / New Calendar Tab. New Group / Note / Task
// are added to the same menu only while a regular (non-calendar) Tab is selected.
function updateAddMenuContentItems() {
  const items = $('#addContentMenuItems');
  if (!items) return;
  const view = state.settings.activeView || 'desktop';
  const onRegularTab = view === 'desktop' && activeDesktop()?.type !== 'calendar';
  items.hidden = !onRegularTab;
  const btn = $('#addDesktopMenuBtn');
  if (btn) {
    const label = onRegularTab ? 'Add a Tab, Group, Note, or Task' : 'Add a Tab';
    btn.setAttribute('aria-label', label); btn.title = label;
  }
}

function setDate() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(now);
  const block = $('#dateBlock');
  block.replaceChildren();
  const dayEl = document.createElement('strong'); dayEl.className = 'date-block-day'; dayEl.textContent = weekday;
  const dateEl = document.createElement('span'); dateEl.className = 'date-block-date'; dateEl.textContent = date;
  block.append(dayEl, dateEl);
}

function setVersion() {
  $('#versionNumber').textContent = `v${chrome.runtime.getManifest().version}`;
}

$('#addContentGroupBtn').addEventListener('click', () => openBucketDialog(null));
$('#addContentNoteBtn').addEventListener('click', () => openNoteDialog(null, null, state.settings.activeView === 'general-notes' ? 'general' : `desktop:${state.activeDesktopId}`));
$('#addContentTaskBtn').addEventListener('click', () => openTaskDialog());
$('#taskCenterAddBtn').addEventListener('click', () => openTaskDialog(null, state.activeDesktopId));
$('#addDesktopCalendarItem').addEventListener('click', () => openCalendarTabDialog());
$('#addDesktopMenuBtn').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); updateAddMenuContentItems(); toggleBucketMoreMenu($('#addDesktopMenuBtn'), $('#addDesktopMenu')); });
$('#desktopGearBtn').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); toggleBucketMoreMenu($('#desktopGearBtn'), $('#desktopGearMenu')); });
for (const menu of [$('#addDesktopMenu'), $('#desktopGearMenu')]) {
  menu?.addEventListener('click', (event) => { if (event.target.closest('button')) menu.hidePopover(); });
}
$('#workClockBtn').addEventListener('click', openWorkClock);
$('#workClockStartBtn').addEventListener('click', startWorkClock);
$('#workClockPauseBtn').addEventListener('click', togglePauseWorkClock);
$('#workClockStopBtn').addEventListener('click', stopWorkClock);
$('#workClockSummaryBtn').addEventListener('click', () => openWorkClockSummary());
$('#workClockClearAllBtn').addEventListener('click', clearAllWorkClockSessions);
$('#workClockClearAllSummaryBtn').addEventListener('click', async (event) => { const sessionId=event.currentTarget.dataset.sessionId||''; if(sessionId) await clearWorkClockSession(sessionId); else await clearAllWorkClockSessions(); });
$('#settingWorkClockOverlay').addEventListener('change', (event) => { $('#settingWorkClockOverlayPosition').disabled = !event.target.checked; });
$('#workClockDialog').addEventListener('close', () => { if(!state.workClock?.runningSince) stopWorkClockTicker(); });
$('#calendarTabForm').addEventListener('submit', saveCalendarTab);
$('#siteOverlayForm').addEventListener('submit', saveSiteOverlay);
$('#siteOverlayUseActivePageBtn').addEventListener('click', useActivePageForSiteOverlay);
$('#siteLinkOverlayForm').addEventListener('submit', saveSiteLinkOverlay);
$('#siteLinkOverlayUseActivePageBtn').addEventListener('click', useActivePageForSiteLinkOverlay);
for (const id of ['siteLinkOverlayDesktop','siteLinkOverlayOpenMode','siteLinkOverlayEdge','siteLinkOverlayEdgePosition','siteLinkOverlayName','siteLinkOverlayTargetMode','siteLinkOverlayHost','siteLinkOverlayCornerDocking','siteLinkOverlayIconColor','siteLinkOverlayOpacity']) {
  document.getElementById(id)?.addEventListener('input', updateSiteLinkOverlayDialogPreview);
  document.getElementById(id)?.addEventListener('change', updateSiteLinkOverlayDialogPreview);
}
$('#siteLinkOverlayIconUpload')?.addEventListener('change', handleSiteLinkOverlayIconUpload);
$('#siteLinkOverlayRemoveIconBtn')?.addEventListener('click', removeSiteLinkOverlayIcon);
for (const id of ['siteOverlayName','siteOverlayTargetMode','siteOverlayHost','siteOverlayTextColor','siteOverlayBackgroundColor','siteOverlayFont','siteOverlayFontSize','siteOverlayWidth','siteOverlayHeight','siteOverlayShape','siteOverlayEdge','siteOverlayEdgePosition','siteOverlayCornerDocking']) {
  document.getElementById(id)?.addEventListener('input', updateSiteOverlayDialogPreview);
  document.getElementById(id)?.addEventListener('change', updateSiteOverlayDialogPreview);
}
$('#siteOverlayTargetMode')?.addEventListener('change',()=>updateSiteOverlayTargetModeControls('siteOverlay'));
$('#siteLinkOverlayTargetMode')?.addEventListener('change',()=>updateSiteOverlayTargetModeControls('siteLinkOverlay'));

async function archiveDesktop(desktopId) {
  const desktop = state.desktops.find((candidate) => candidate.id === desktopId);
  if (!desktop) return;
  if (desktop.type === 'calendar') { toast('Calendar Tabs can\'t be archived yet.'); return; }
  const activeCount = state.desktops.filter((candidate) => !candidate.archived).length;
  if (activeCount <= 1) { toast('MeshTab needs at least one active Tab.'); return; }
  const count = state.buckets.filter((bucket) => bucket.desktopId === desktop.id).length;
  const noteCount = (state.notes || []).filter((note) => !note.general && note.desktopId === desktop.id).length;
  if (!confirm(`Archive the "${desktop.title}" Tab? Its ${count} group(s)${noteCount ? ` and ${noteCount} note(s)` : ''}, tasks, and settings stay intact — reactivate it any time from the Archive.`)) return;
  desktop.archived = true;
  if (state.activeDesktopId === desktop.id) {
    const next = state.desktops.find((candidate) => !candidate.archived);
    if (next) state.activeDesktopId = next.id;
  }
  expandedTabTasksDesktopId = null;
  expandedTabAllocationsDesktopId = null;
  state.settings.activeView = 'desktop';
  await saveState();
  render();
  toast(`"${desktop.title}" archived. Find it in the Archive section.`);
}

async function reactivateDesktop(desktopId) {
  const desktop = state.desktops.find((candidate) => candidate.id === desktopId);
  if (!desktop) return;
  desktop.archived = false;
  state.activeDesktopId = desktop.id;
  state.settings.activeView = 'desktop';
  await saveState();
  render();
  toast(`"${desktop.title}" restored.`);
}

async function permanentlyDeleteDesktop(desktopId) {
  const desktop = state.desktops.find((candidate) => candidate.id === desktopId);
  if (!desktop) return;
  const activeCount = state.desktops.filter((candidate) => !candidate.archived).length;
  if (!desktop.archived && activeCount <= 1) { toast('MeshTab needs at least one active Tab.'); return; }
  const count = state.buckets.filter((bucket) => bucket.desktopId === desktop.id).length;
  const noteCount = (state.notes || []).filter((note) => !note.general && note.desktopId === desktop.id).length;
  const taskCount = (state.tasks || []).filter((task) => task.taskGroupId === desktop.id && task.status === 'open').length;
  const allocationCount = (state.taskAllocations || []).filter((allocation) => (allocation.taskGroupId || 'general') === desktop.id).length;
  if (!confirm(`Permanently delete the "${desktop.title}" Tab and its ${count} group(s)${noteCount ? ` and ${noteCount} note(s)` : ''}${taskCount ? `; ${taskCount} open task(s) will move to General Tasks` : ''}${allocationCount ? `; ${allocationCount} allocation(s) will move to General` : ''}? Chrome bookmarks will be kept. This cannot be undone.`)) return;
  state.buckets = state.buckets.filter((bucket) => bucket.desktopId !== desktop.id);
  state.notes = (state.notes || []).filter((note) => note.general || note.desktopId !== desktop.id);
  for (const task of (state.tasks || [])) if (task.taskGroupId === desktop.id) task.taskGroupId = 'general';
  for (const allocation of (state.taskAllocations || [])) if ((allocation.taskGroupId || 'general') === desktop.id) allocation.taskGroupId = 'general';
  state.desktops = state.desktops.filter((candidate) => candidate.id !== desktop.id);
  if (state.settings.taskRailFilter === desktop.id) state.settings.taskRailFilter = 'all';
  if (state.settings.homeDefaultDesktopId === desktop.id) state.settings.homeDefaultDesktopId = 'last-active';
  expandedTabTasksDesktopId = null;
  expandedTabAllocationsDesktopId = null;
  if (state.activeDesktopId === desktop.id) {
    const next = state.desktops.find((candidate) => !candidate.archived) || state.desktops[0];
    state.activeDesktopId = next ? next.id : state.activeDesktopId;
    if (next) state.settings.activeView = 'desktop';
  }
  await saveState();
  render();
  toast('Tab deleted. Chrome bookmarks kept.');
}

$('#addDesktopTabItem').addEventListener('click', async () => {
  const title = prompt('New desktop name')?.trim();
  if (!title) return;
  const desktop = { id: uid('desktop'), title: title.slice(0, 60), type: 'workspace', calendarUrl: '' };
  state.desktops.push(desktop);
  expandedTabTasksDesktopId = null;
  expandedTabAllocationsDesktopId = null;
  state.activeDesktopId = desktop.id;
  state.settings.activeView = 'desktop';
  await saveState();
  render();
  toast('Tab created.');
});
$('#desktopGearRenameBtn').addEventListener('click', () => {
  const desktop = activeDesktop();
  if (!desktop) return;
  renamingDesktopId = desktop.id;
  renderDesktops();
});
$('#desktopGearArchiveBtn').addEventListener('click', async () => {
  const desktop = activeDesktop();
  if (desktop) await archiveDesktop(desktop.id);
});
$('#desktopGearDeleteBtn').addEventListener('click', async () => {
  const desktop = activeDesktop();
  if (!desktop) return;
  await permanentlyDeleteDesktop(desktop.id);
});
$('#desktopGearCalendarSettingsBtn').addEventListener('click', () => {
  const desktop = activeDesktop();
  if (desktop) openCalendarTabDialog(desktop.id);
});
$('#openCalendarExternalBtn').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'https://calendar.google.com/calendar/u/0/r' });
});
$('#settingsBtn').addEventListener('click', openSettingsDialog);
$('#homeScreenBtn').addEventListener('click', async () => {
  try { await chrome.runtime.sendMessage({ type: 'meshtab-open-home-screen' }); } catch (error) { console.warn('Could not open Chrome Home screen.', error); }
});
$('#settingsForm').addEventListener('submit', saveSettings);
$('#settingTabFontSize').addEventListener('input', updateTabSettingReadouts);
$('#settingTabSpacing').addEventListener('input', updateTabSettingReadouts);
$('#settingUseMeshTabNewTab').addEventListener('change', updateNewTabBuildStatus);
$('#openPickerBtn').addEventListener('click', () => openBookmarkPicker());
$('#refreshTabsBtn').addEventListener('click', refreshOpenTabs);
$('#collapseOpenPagesBtn').addEventListener('click', () => setOpenPagesCollapsed(true));
$('#expandOpenPagesBtn').addEventListener('click', () => setOpenPagesCollapsed(false));
$('#exportBtn').addEventListener('click', openExportSelectionDialog);
$('#importBtn').addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', handleImportFile);
$('#bucketForm').addEventListener('submit', handleBucketSubmit);
$('#bucketColorCustomInput').addEventListener('click', () => { $('#bucketColorCustomRadio').checked = true; });
$('#bucketColorCustomInput').addEventListener('input', () => { $('#bucketColorCustomRadio').checked = true; });
$('#noteForm').addEventListener('submit', handleNoteSubmit);
$('#taskForm').addEventListener('submit', handleTaskSubmit);
$('#taskAllocationForm').addEventListener('submit', handleTaskAllocationSubmit);
$('#taskCompleteForm').addEventListener('submit', handleTaskComplete);
$('#taskTimeForm').addEventListener('submit', handleTaskTimeSubmit);
$('#taskNoteForm').addEventListener('submit', handleTaskNoteSubmit);
$('#reminderForm').addEventListener('submit', handleReminderSubmit);
$('#reminderScheduleType').addEventListener('change', setReminderDialogScheduleFields);
$('#noteEditor').addEventListener('paste', handleNotePaste);
document.querySelectorAll('.note-toolbar-btn[data-note-format]').forEach((button) => {
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => { $('#noteEditor').focus(); document.execCommand(button.dataset.noteFormat, false, null); });
});
$('#noteLocation').addEventListener('change', (event) => $('#noteNewTabWrap').classList.toggle('hidden', event.target.value !== 'new-desktop'));
$('#noteExistingSelect').addEventListener('change', (event) => { if (event.target.value) openNoteDialog(event.target.value); else openNoteDialog(null, null, pendingNoteLocation || `desktop:${state.activeDesktopId}`); });
$('#taskOpenGroupFilter').addEventListener('change', async (event) => {
  taskRecommendationsVisible = false;
  state.settings.taskRailFilter = validTaskGroupFilter(event.target.value);
  await saveState();
  renderTaskRail();
});
$('#taskRailGroupFilter').addEventListener('change', async (event) => {
  taskRecommendationsVisible = false;
  state.settings.taskRailFilter = validTaskGroupFilter(event.target.value);
  await saveState();
  renderTaskRail();
});
$('#taskReportRange').addEventListener('change', renderTaskCenter);
$('#taskReportStart').addEventListener('change', renderTaskCenter);
$('#taskReportEnd').addEventListener('change', renderTaskCenter);
$('#taskTimeUnit').addEventListener('change', (event) => {
  const input = $('#taskMinutesSpent');
  const previousUnit = event.target.dataset.previousUnit || 'minutes';
  const nextUnit = event.target.value === 'hours' ? 'hours' : 'minutes';
  const value = Number.parseFloat(input.value);
  if (Number.isFinite(value) && value > 0 && previousUnit !== nextUnit) {
    const converted = previousUnit === 'minutes' ? value / 60 : value * 60;
    input.value = nextUnit === 'hours' ? String(Math.round(converted * 100) / 100) : String(Math.round(converted));
  }
  input.step = nextUnit === 'hours' ? 'any' : '1';
  input.placeholder = nextUnit === 'hours' ? 'e.g. 1.5' : 'e.g. 45';
  event.target.dataset.previousUnit = nextUnit;
});
$('#taskTimeUnitQuick').addEventListener('change', (event) => {
  const input = $('#taskTimeAmount');
  const previousUnit = event.target.dataset.previousUnit || 'hours';
  const nextUnit = event.target.value === 'minutes' ? 'minutes' : 'hours';
  const value = Number.parseFloat(input.value);
  if (Number.isFinite(value) && value > 0 && previousUnit !== nextUnit) input.value = nextUnit === 'hours' ? String(Math.round((value / 60) * 100) / 100) : String(Math.round(value * 60));
  input.step = nextUnit === 'hours' ? 'any' : '1'; input.placeholder = nextUnit === 'hours' ? 'e.g. 1.5' : 'e.g. 45'; event.target.dataset.previousUnit = nextUnit;
});
$('#taskTimePresets').addEventListener('click', (event) => {
  const button=event.target.closest('[data-time-minutes]'); if(!button) return;
  const minutes=Math.max(1,Number.parseInt(button.dataset.timeMinutes,10)||0); const unit=$('#taskTimeUnitQuick').value;
  $('#taskTimeAmount').value = unit === 'minutes' ? String(minutes) : String(Math.round((minutes/60)*100)/100);
  document.querySelectorAll('#taskTimePresets [data-time-minutes]').forEach((item)=>item.classList.toggle('selected',item===button));
  $('#taskTimeDetails').focus();
});
$('#completedTaskList').addEventListener('change', (event) => {
  const checkbox = event.target.closest('.completed-task-select');
  if (!checkbox) return;
  if (checkbox.checked) selectedCompletedTaskIds.add(checkbox.dataset.taskId);
  else selectedCompletedTaskIds.delete(checkbox.dataset.taskId);
  checkbox.closest('.task-row')?.classList.toggle('selected', checkbox.checked);
  updateCompletedSelectionSummary();
});
$('#completedTaskList').addEventListener('click', (event) => {
  if (event.target.closest('button, a, input')) return;
  const row = event.target.closest('.task-row.completed');
  const checkbox = row?.querySelector('.completed-task-select');
  if (checkbox) checkbox.click();
});
$('#collapseTaskRailBtn').addEventListener('click', () => setTaskRailCollapsed(true));
$('#expandTaskRailBtn').addEventListener('click', () => setTaskRailCollapsed(false));
$('#taskRailAddBtn').addEventListener('click', () => openTaskDialog(null, state.activeDesktopId));
document.querySelectorAll('[data-task-analytics]').forEach((input) => input.addEventListener('change', async () => {
  state.settings.taskAnalytics = Array.from(document.querySelectorAll('[data-task-analytics]:checked')).map((item) => item.dataset.taskAnalytics);
  await saveState();
  renderTaskCenter();
}));

bucketGrid.addEventListener('input', (event) => {
  const editor = event.target.closest('.note-live-editor');
  if (!editor) return;
  queueLiveNoteSave(editor, false);
});

bucketGrid.addEventListener('paste', async (event) => {
  const editor = event.target.closest('.note-live-editor');
  if (!editor) return;
  await handleNotePaste(event);
  queueLiveNoteSave(editor, true);
});

bucketGrid.addEventListener('focusout', (event) => {
  const editor = event.target.closest('.note-live-editor');
  if (!editor) return;
  linkifyNoteElement(editor);
  queueLiveNoteSave(editor, true);
});

// Double-clicking a note's header/title (or its masked cover) opens the full-size
// Edit Note dialog for easier review. Double-clicks inside the live editor itself are
// left alone so double-click-to-select-a-word keeps working while writing a note.
bucketGrid.addEventListener('dblclick', (event) => {
  const notePanel = event.target.closest('.note-panel');
  if (!notePanel) return;
  if (event.target.closest('.note-live-editor, button, a, input, select, textarea, [popover]')) return;
  openNoteDialog(notePanel.dataset.noteId);
});

$('#newUrlForm').addEventListener('submit', createBookmarkFromForm);
$('#globalSearch').addEventListener('input', render);
$('#bookmarkSearch').addEventListener('input', (event) => renderBookmarkResults(event.target.value));
$('#pickerBucketSelect').addEventListener('change', () => renderBookmarkResults($('#bookmarkSearch').value));

for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => {
  const dialog = document.getElementById(button.dataset.closeDialog);
  dialog.close();
});

bucketDialog.addEventListener('close', resetBucketDialogState);
noteDialog.addEventListener('close', resetNoteDialogState);
taskDialog.addEventListener('close', () => { editingTaskId = null; $('#taskForm').reset(); });
taskCompleteDialog.addEventListener('close', () => { completingTaskId = null; $('#taskCompleteForm').reset(); });
taskTimeDialog.addEventListener('close', async () => {
  const returnTaskId = returnToTaskTimeHistoryId;
  const fromTimerTaskId = loggingTaskTimeFromTimerSeconds != null ? loggingTaskTimeId : null;
  loggingTaskTimeId = null; editingTaskTimeEntryId = null; loggingTaskTimeFromTimerSeconds = null; returnToTaskTimeHistoryId = null;
  $('#taskTimeForm').reset(); $('#taskTimeSubmitBtn').textContent = 'Add time';
  document.querySelectorAll('#taskTimePresets [data-time-minutes]').forEach((button)=>button.classList.remove('selected'));
  if (fromTimerTaskId && state?.workClock?.pendingTaskId === fromTimerTaskId) {
    state.workClock.pendingTaskId = ''; state.workClock.pendingSeconds = 0; state.workClock.pendingStartedAt = ''; state.workClock.pendingEndedAt = '';
    pendingTaskTimeDialogOpenedForId = null;
    await saveState();
  }
  if (returnTaskId) setTimeout(() => openTaskTimeHistory(returnTaskId), 0);
});
taskTimeHistoryDialog.addEventListener('close', () => { viewingTaskTimeId = null; });
taskNotesDialog.addEventListener('close', () => { if (!taskNoteDialog.open) viewingTaskNotesId = null; });
taskNoteDialog.addEventListener('close', () => { editingTaskNoteId = null; $('#taskNoteForm').reset(); });
taskLinksDialog.addEventListener('close', () => { viewingTaskLinksId = null; $('#taskLinkForm').reset(); });
taskAllocationDialog.addEventListener('close', () => { editingTaskAllocationId = null; $('#taskAllocationForm').reset(); setTaskAllocationFormFields(); });
taskAllocationHistoryDialog.addEventListener('close', () => { viewingTaskAllocationId = null; });
taskAllocationTimeLogDialog.addEventListener('close', () => { viewingTaskAllocationTimeLogId = null; $('#taskAllocationTimeLogCustomRange')?.classList.add('hidden'); });
reminderDialog.addEventListener('close', () => { editingReminderId = null; $('#reminderForm').reset(); setReminderDialogScheduleFields(); });

const currentAllocationDefaultGroup = () => { const filter=validTaskGroupFilter(state.settings.taskRailFilter||'all'); return filter==='general'||state.desktops.some((d)=>d.id===filter)?filter:state.activeDesktopId; };
$('#taskAllocationAddBtn').addEventListener('click', () => openTaskAllocationDialog(null,currentAllocationDefaultGroup()));
$('#taskAllocationSectionAddBtn').addEventListener('click', () => openTaskAllocationDialog(null,currentAllocationDefaultGroup()));
$('#taskAllocationSectionTimeLogBtn').addEventListener('click', () => openAllTimeEntries());
$('#taskAllocationMode').addEventListener('change', setTaskAllocationFormFields);
$('#taskAllocationUnit').addEventListener('change', (event) => {
  const input = $('#taskAllocationHours');
  const previousUnit = event.target.dataset.previousUnit || (state.settings.defaultTimeUnit === 'minutes' ? 'minutes' : 'hours');
  const nextUnit = event.target.value === 'minutes' ? 'minutes' : 'hours';
  const value = Number(input.value);
  if (Number.isFinite(value) && value > 0 && previousUnit !== nextUnit) input.value = nextUnit === 'hours' ? String(Math.round((value / 60) * 100) / 100) : String(Math.round(value * 60));
  event.target.dataset.previousUnit = nextUnit;
  setTaskAllocationFormFields();
});
$('#taskAllocationHistoryEditBtn').addEventListener('click', () => { const allocationId=viewingTaskAllocationId; if(!allocationId) return; taskAllocationHistoryDialog.close(); openTaskAllocationDialog(allocationId); });
$('#taskAllocationHistoryTimeLogBtn').addEventListener('click', () => { const allocationId=viewingTaskAllocationId; if(!allocationId) return; taskAllocationHistoryDialog.close(); openTaskAllocationTimeLog(allocationId); });
$('#taskAllocationTimeLogUsageBtn').addEventListener('click', () => { const allocationId=viewingTaskAllocationTimeLogId; if(!allocationId) return; taskAllocationTimeLogDialog.close(); openTaskAllocationHistory(allocationId); });
$('#taskAllocationTimeLogEditBtn').addEventListener('click', () => { const allocationId=viewingTaskAllocationTimeLogId; if(!allocationId) return; taskAllocationTimeLogDialog.close(); openTaskAllocationDialog(allocationId); });
$('#taskAllocationTimeLogFilter').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogStart').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation && $('#taskAllocationTimeLogFilter').value==='custom') renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogEnd').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation && $('#taskAllocationTimeLogFilter').value==='custom') renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogGroupBy').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogSplitByDay').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogSplitByTask').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogCombineDesc').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogDescLimit').addEventListener('change', () => { const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
$('#taskAllocationTimeLogChartToggle').addEventListener('change', (event) => { taskAllocationTimeLogShowChart = event.target.checked; const allocation=taskAllocationById(viewingTaskAllocationTimeLogId); if(allocation) renderTaskAllocationTimeLog(allocation); });
allTimeEntriesDialog.addEventListener('close', () => { $('#allTimeEntriesCustomRange')?.classList.add('hidden'); });
$('#allTimeEntriesFilter').addEventListener('change', renderAllTimeEntries);
$('#allTimeEntriesStart').addEventListener('change', () => { if ($('#allTimeEntriesFilter').value === 'custom') renderAllTimeEntries(); });
$('#allTimeEntriesEnd').addEventListener('change', () => { if ($('#allTimeEntriesFilter').value === 'custom') renderAllTimeEntries(); });
$('#allTimeEntriesGroupBy').addEventListener('change', renderAllTimeEntries);
$('#allTimeEntriesSplitByDay').addEventListener('change', renderAllTimeEntries);
$('#allTimeEntriesSplitByProject').addEventListener('change', renderAllTimeEntries);
$('#allTimeEntriesCombineDesc').addEventListener('change', renderAllTimeEntries);
$('#allTimeEntriesDescLimit').addEventListener('change', renderAllTimeEntries);
$('#allTimeEntriesChartToggle').addEventListener('change', (event) => { allTimeEntriesShowChart = event.target.checked; renderAllTimeEntries(); });

$('#taskTimeHistoryAddBtn').addEventListener('click', () => {
  const taskId = viewingTaskTimeId; if (!taskId) return;
  returnToTaskTimeHistoryId = taskId;
  taskTimeHistoryDialog.close(); openTaskTimeDialog(taskId);
});
$('#taskTimeHistoryList').addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]'); if (!action || !viewingTaskTimeId) return;
  if (action.dataset.action === 'edit-task-time-entry') {
    const taskId = viewingTaskTimeId; const entryId = action.dataset.entryId; if (!entryId) return;
    returnToTaskTimeHistoryId = taskId;
    taskTimeHistoryDialog.close(); openTaskTimeDialog(taskId, entryId);
    return;
  }
  if (action.dataset.action === 'delete-task-time-entry') await deleteTaskTimeEntry(viewingTaskTimeId, action.dataset.entryId);
});
$('#taskNotesAddBtn').addEventListener('click', () => { if (viewingTaskNotesId) openTaskNoteEditor(viewingTaskNotesId); });
$('#taskNotesList').addEventListener('click', (event) => {
  const card = event.target.closest('[data-action="open-task-note"]'); if (!card || !viewingTaskNotesId) return;
  openTaskNoteEditor(viewingTaskNotesId, card.dataset.noteId);
});
$('#taskNoteDeleteBtn').addEventListener('click', deleteEditingTaskNote);
$('#taskLinkForm').addEventListener('submit', handleTaskLinkSubmit);
$('#taskLinksList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="delete-task-link"]'); if (!button || !viewingTaskLinksId) return;
  await deleteTaskLink(button.dataset.linkId);
});
$('#taskLinkBrowseToggle')?.addEventListener('click', () => {
  const panel = $('#taskLinkBrowsePanel');
  if (!panel) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (opening) {
    renderTaskLinkOpenTabsResults();
    renderTaskLinkBookmarkResults();
    setTimeout(() => $('#taskLinkBrowseSearch')?.focus(), 0);
  }
});
$('#taskLinkBrowseSearch')?.addEventListener('input', (event) => {
  const query = event.target.value || '';
  renderTaskLinkOpenTabsResults(query);
  renderTaskLinkBookmarkResults(query);
});

$('#resetLayoutBtn').addEventListener('click', async () => {
  if (!confirm('Reset MeshTab to the starter Main desktop? Your Chrome bookmarks will not be deleted.')) return;
  const keepFavicons = state.favicons;
  const keepSettings = state.settings;
  state = cloneDefaultState();
  state.favicons = keepFavicons;
  state.settings = keepSettings;
  state.settings.homeDefaultDesktopId = validHomeDefaultDesktopId(state.settings.homeDefaultDesktopId);
  await saveState();
  render();
  toast('MeshTab layout reset.');
});

const NAVIGABLE_VIEWS = ['home', 'tasks', 'reminders', 'allocations', 'overlays', 'archive'];
async function switchToView(view) {
  state.settings.activeView = NAVIGABLE_VIEWS.includes(view) ? view : 'general-notes';
  await saveState();
  render();
}

async function handleNavigationClick(event) {
  const viewButton = event.target.closest('button[data-action="switch-view"]');
  if (viewButton) {
    await switchToView(viewButton.dataset.view);
    return;
  }
  const button = event.target.closest('button[data-action="switch-desktop"]');
  if (!button) return;
  expandedTabTasksDesktopId = null;
  expandedTabAllocationsDesktopId = null;
  state.activeDesktopId = button.dataset.desktopId;
  state.settings.activeView = 'desktop';
  await saveState();
  render();
}

desktopTabs.addEventListener('click', handleNavigationClick);

async function commitDesktopRename(desktopId, rawTitle) {
  if (renamingDesktopId !== desktopId) return;
  renamingDesktopId = null;
  const desktop = state.desktops.find((candidate) => candidate.id === desktopId);
  if (!desktop) { renderDesktops(); return; }
  const title = (rawTitle || '').trim().slice(0, 60);
  if (title && title !== desktop.title) { desktop.title = title; await saveState(); }
  render();
}

desktopTabs.addEventListener('dblclick', (event) => {
  const button = event.target.closest('.desktop-tab[data-desktop-id][data-action="switch-desktop"]');
  if (!button) return;
  renamingDesktopId = button.dataset.desktopId;
  renderDesktops();
});

desktopTabs.addEventListener('keydown', (event) => {
  const input = event.target.closest('.desktop-tab-rename-input');
  if (!input) return;
  if (event.key === 'Enter') { event.preventDefault(); commitDesktopRename(input.dataset.desktopId, input.value); }
  else if (event.key === 'Escape') { event.preventDefault(); renamingDesktopId = null; renderDesktops(); }
});

desktopTabs.addEventListener('focusout', (event) => {
  const input = event.target.closest('.desktop-tab-rename-input');
  if (!input) return;
  commitDesktopRename(input.dataset.desktopId, input.value);
});

function clearDesktopDropIndicators() {
  for (const button of desktopTabs.querySelectorAll('.desktop-tab')) {
    button.classList.remove('drag-over', 'desktop-drop-before', 'desktop-drop-after');
  }
}

async function reorderDesktop(sourceId, targetId, placeAfter) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const sourceIndex = state.desktops.findIndex((desktop) => desktop.id === sourceId);
  if (sourceIndex < 0) return false;
  const [moved] = state.desktops.splice(sourceIndex, 1);
  let targetIndex = state.desktops.findIndex((desktop) => desktop.id === targetId);
  if (targetIndex < 0) {
    state.desktops.splice(sourceIndex, 0, moved);
    return false;
  }
  if (placeAfter) targetIndex += 1;
  state.desktops.splice(targetIndex, 0, moved);
  await saveState();
  render();
  return true;
}

desktopTabs.addEventListener('dragstart', (event) => {
  const desktop = event.target.closest('.desktop-tab[data-desktop-id]');
  if (!desktop) return;
  event.dataTransfer.setData(DESKTOP_DRAG_TYPE, desktop.dataset.desktopId);
  event.dataTransfer.effectAllowed = 'move';
  desktop.classList.add('desktop-dragging');
});

desktopTabs.addEventListener('dragend', (event) => {
  event.target.closest('.desktop-tab[data-desktop-id]')?.classList.remove('desktop-dragging');
  clearDesktopDropIndicators();
});

desktopTabs.addEventListener('dragover', (event) => {
  const desktop = event.target.closest('.desktop-tab[data-desktop-id]');
  if (!desktop) return;
  const types = Array.from(event.dataTransfer.types || []);
  const isDesktopDrag = types.includes(DESKTOP_DRAG_TYPE);
  const isBucketDrag = types.includes(BUCKET_DRAG_TYPE);
  const isNoteDrag = types.includes(NOTE_DRAG_TYPE);
  if (!isDesktopDrag && !isBucketDrag && !isNoteDrag) return;
  const targetDesktop=state.desktops.find(item=>item.id===desktop.dataset.desktopId);
  if ((isBucketDrag || isNoteDrag) && targetDesktop?.type === 'calendar') return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearDesktopDropIndicators();
  if (isDesktopDrag) {
    const rect = desktop.getBoundingClientRect();
    const placeAfter = event.clientX > rect.left + (rect.width / 2);
    desktop.classList.add(placeAfter ? 'desktop-drop-after' : 'desktop-drop-before');
  } else {
    desktop.classList.add('drag-over');
  }
});

desktopTabs.addEventListener('dragleave', (event) => {
  const desktop = event.target.closest('.desktop-tab[data-desktop-id]');
  if (!desktop || desktop.contains(event.relatedTarget)) return;
  desktop.classList.remove('drag-over', 'desktop-drop-before', 'desktop-drop-after');
});

desktopTabs.addEventListener('drop', async (event) => {
  const desktop = event.target.closest('.desktop-tab[data-desktop-id]');
  if (!desktop) return;
  event.preventDefault();
  const desktopId = desktop.dataset.desktopId;
  const targetDesktop=state.desktops.find(item=>item.id===desktopId);
  const sourceDesktopId = event.dataTransfer.getData(DESKTOP_DRAG_TYPE);
  const bucketId = event.dataTransfer.getData(BUCKET_DRAG_TYPE);
  const noteId = event.dataTransfer.getData(NOTE_DRAG_TYPE);
  const rect = desktop.getBoundingClientRect();
  const placeAfter = event.clientX > rect.left + (rect.width / 2);
  clearDesktopDropIndicators();
  if (sourceDesktopId) {
    if (await reorderDesktop(sourceDesktopId, desktopId, placeAfter)) toast('Desktop order updated.');
    return;
  }
  if ((noteId || bucketId) && targetDesktop?.type === 'calendar') { toast('Calendar Tabs are reserved for the embedded calendar.'); return; }
  if (noteId) {
    const note = getNote(noteId);
    if (note) {
      note.parentNoteId = null;
      moveNoteTreeToDesktop(note, desktopId);
      note.position = nextNotePosition(desktopId, null);
      await saveState(); render(); toast(`Note moved to ${state.desktops.find((item) => item.id === desktopId)?.title || 'Tab'}.`);
    }
    return;
  }
  if (!bucketId) return;
  if (await moveBucketNode(bucketId, desktopId, null)) toast(`Moved to ${state.desktops.find((item) => item.id === desktopId)?.title || 'Tab'}.`);
});

bucketGrid.addEventListener('click', async (event) => {
  const noteLink = event.target.closest('.note-live-editor a[href]');
  if (noteLink) {
    event.preventDefault();
    event.stopPropagation();
    const href = normalizeNoteHref(noteLink.getAttribute('href'));
    if (href) await chrome.tabs.create({ url: href, active: true });
    return;
  }
  const smartLink = event.target.closest('a[data-smart-url]');
  if (smartLink) {
    event.preventDefault();
    await openOrFocusUrl(smartLink.dataset.smartUrl);
    return;
  }
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  button.closest('.bucket-more-menu, .note-more-menu')?.hidePopover?.();
  const { action, bucketId, bookmarkId, noteId, taskId } = button.dataset;
  const allocationId = button.dataset.allocationId;
  const reminderId = button.dataset.reminderId;
  if (action === 'switch-view') { await switchToView(button.dataset.view); return; }
  if (action === 'add-site-overlay') { openSiteOverlayDialog(); return; }
  if (action === 'add-site-link-overlay') { openSiteLinkOverlayDialog(); return; }
  if (action === 'edit-site-overlay') { const overlay = siteOverlayById(button.dataset.overlayId); if (overlay?.type === 'links') openSiteLinkOverlayDialog(overlay.id); else openSiteOverlayDialog(button.dataset.overlayId); return; }
  if (action === 'toggle-site-overlay') { await toggleSiteOverlay(button.dataset.overlayId); return; }
  if (action === 'delete-site-overlay') { await deleteSiteOverlay(button.dataset.overlayId); return; }
  if (action === 'open-overlay-settings') { openSettingsDialog(); setTimeout(() => $('#settingSiteOverlaysEnabled')?.scrollIntoView({block:'center',behavior:'smooth'}), 0); return; }
  if (action === 'add-task-allocation') { openTaskAllocationDialog(); return; }
  if (action === 'view-all-time-entries') { openAllTimeEntries(); return; }
  if (action === 'view-task-allocation') { openTaskAllocationHistory(allocationId); return; }
  if (action === 'view-task-allocation-time-log') { openTaskAllocationTimeLog(allocationId); return; }
  if (action === 'edit-task-allocation') { openTaskAllocationDialog(allocationId); return; }
  if (action === 'delete-task-allocation') { await deleteTaskAllocation(allocationId); return; }
  if (action === 'toggle-allocation-carryover') { await toggleAllocationCarryOver(allocationId, button.dataset.periodKey); return; }
  if (action === 'add-reminder') { openReminderDialog(); return; }
  if (action === 'add-task-reminder') { openTaskQuickReminder(taskId || button.dataset.taskId); return; }
  if (action === 'open-linked-task') { await openTaskInCenter(button.dataset.taskId); return; }
  if (action === 'open-linked-reminder') { openReminderDialog(button.dataset.reminderId); return; }
  if (action === 'edit-reminder') { openReminderDialog(reminderId); return; }
  if (action === 'reminder-view') { state.settings.reminderView = REMINDER_VIEW_MODES.includes(button.dataset.mode) ? button.dataset.mode : 'day'; await saveState(); render(); return; }
  if (action === 'snooze-reminder') { const select=button.closest('.reminder-actions')?.querySelector('.reminder-snooze-select'); await snoozeReminderFromUi(reminderId, select?.value || '10m'); return; }
  if (action === 'delete-reminder') {
    const reminder=(state.reminders||[]).find((item)=>item.id===String(reminderId));
    if(!reminder || !confirm(`Delete reminder "${reminder.title}"?`)) return;
    state.reminders=(state.reminders||[]).filter((item)=>item.id!==reminder.id); await saveState(); render(); toast('Reminder deleted.'); return;
  }
  if (action === 'toggle-reminder-enabled') {
    const reminder=(state.reminders||[]).find((item)=>item.id===String(reminderId)); if(!reminder) return;
    if(!reminder.enabled && reminder.scheduleType==='once' && MeshTabReminders.localDateTime(reminder.date,reminder.time)<=Date.now()) { toast('Edit this one-time reminder and choose a new future date/time.'); openReminderDialog(reminder.id); return; }
    reminder.enabled=!reminder.enabled; reminder.snoozedUntil=''; reminder.updatedAt=new Date().toISOString(); if(reminder.enabled && reminder.scheduleType==='once') reminder.lastTriggeredAt='';
    await saveState(); render(); toast(reminder.enabled?'Reminder enabled.':'Reminder paused.'); return;
  }
  if (action === 'toggle-tab-allocations') {
    expandedTabAllocationsDesktopId = expandedTabAllocationsDesktopId === state.activeDesktopId ? null : state.activeDesktopId;
    render(); return;
  }
  if (action === 'add-tab-allocation') { openTaskAllocationDialog(null, button.dataset.desktopId || state.activeDesktopId); return; }
  if (action === 'view-tab-allocations') {
    state.settings.taskRailFilter = validTaskGroupFilter(button.dataset.desktopId || state.activeDesktopId);
    state.settings.activeView = 'tasks';
    await saveState(); render();
    setTimeout(()=>document.querySelector('#taskAllocationsSection')?.scrollIntoView({block:'start',behavior:'smooth'}),0); return;
  }
  if (action === 'toggle-tab-tasks') {
    expandedTabTasksDesktopId = expandedTabTasksDesktopId === state.activeDesktopId ? null : state.activeDesktopId;
    render(); return;
  }
  if (action === 'add-tab-task') { openTaskDialog(null, button.dataset.desktopId || state.activeDesktopId); return; }
  if (action === 'view-tab-tasks') {
    state.settings.taskRailFilter = validTaskGroupFilter(button.dataset.desktopId || state.activeDesktopId);
    state.settings.activeView = 'tasks';
    await saveState(); render(); return;
  }
  if (action === 'complete-task') { openTaskCompletion(taskId); return; }
  if (action === 'add-task-time') { openTaskTimeDialog(taskId); return; }
  if (action === 'start-task-timer') { await startTaskTimer(taskId); return; }
  if (action === 'stop-task-timer') { await stopWorkClock(); return; }
  if (action === 'view-task-time-history') { openTaskTimeHistory(taskId); return; }
  if (action === 'view-task-notes') { openTaskNotes(taskId); return; }
  if (action === 'view-task-links') { openTaskLinks(taskId); return; }
  if (action === 'set-task-work-state') { const task=(state.tasks||[]).find((item)=>item.id===String(taskId)); if(task) await setTaskWorkState(task.id,button.dataset.workState); return; }
  if (action === 'toggle-task-working') { const task=(state.tasks||[]).find((item)=>item.id===String(taskId)); if(task) await setTaskWorking(task.id,!task.working); return; }
  if (action === 'mark-task-working') { await setTaskWorking(taskId,true); return; }
  if (action === 'edit-task') { openTaskDialog(taskId); return; }
  if (action === 'delete-task') {
    const task = (state.tasks || []).find((item) => item.id === taskId);
    if (!task || !confirm(`Delete task "${task.title}"?`)) return;
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    for (const reminder of (state.reminders || [])) if (reminder.linkedTaskId === taskId) reminder.linkedTaskId = '';
    await saveState(); render(); toast('Task deleted.'); return;
  }
  if (action === 'add-general-note') { openNoteDialog(null, null, 'general'); return; }
  if (action === 'open-task-center') { openTaskCenter(); return; }
  if (action === 'toggle-note-mask') {
    const note = getNote(noteId);
    if (!note?.masked) return;
    if (revealedNoteIds.has(note.id)) revealedNoteIds.delete(note.id); else revealedNoteIds.add(note.id);
    render();
    return;
  }
  if (action === 'edit-note') { openNoteDialog(noteId); return; }
  if (action === 'toggle-note-bullets') {
    const editor = bucketGrid.querySelector(`.note-live-editor[data-note-id="${CSS.escape(String(noteId))}"]`);
    if (editor) { editor.focus(); document.execCommand('insertUnorderedList', false, null); queueLiveNoteSave(editor, true); }
    return;
  }
  if (action === 'add-child-note') { openNoteDialog(null, noteId); return; }
  if (action === 'toggle-note-full-width') {
    const note = getNote(noteId);
    if (!note) return;
    const layout = noteLayout(note);
    if (layout.span === 12) layout.span = Math.max(2, Math.min(12, Number.parseInt(layout.previousSpan, 10) || 4));
    else { layout.previousSpan = layout.span; layout.span = 12; }
    await saveState(); render(); return;
  }
  if (action === 'delete-note') {
    const note = getNote(noteId);
    if (!note) return;
    const descendants = descendantNotesOf(note.id);
    if (!confirm(`Delete the note "${note.title}"${descendants.length ? ` and ${descendants.length} nested note(s)` : ''}?`)) return;
    const ids = new Set([note.id, ...descendants.map((child) => child.id)]);
    state.notes = (state.notes || []).filter((candidate) => !ids.has(candidate.id));
    for (const id of ids) {
      revealedNoteIds.delete(id);
      const timer = liveNoteSaveTimers.get(id);
      if (timer) clearTimeout(timer);
      liveNoteSaveTimers.delete(id);
    }
    await saveState(); render(); toast('Note deleted.'); return;
  }
  if (action === 'add-bookmark') openBookmarkPicker(bucketId);
  if (action === 'add-child') openBucketDialog(bucketId);
  if (action === 'remove-bookmark') await removeFromBucket(bucketId, bookmarkId);
  if (action === 'rename-bookmark') {
    const bucket = getBucket(bucketId);
    const bookmark = bookmarkMap.get(String(bookmarkId));
    if (!bucket || !bookmark) return;
    const current = bookmarkLabel(bookmark, bucket);
    const next = prompt('Rename this MeshTab link', current)?.trim();
    if (!next || next === current) return;
    bucket.bookmarkLabels ||= {};
    bucket.bookmarkLabels[String(bookmarkId)] = next.slice(0, 120);
    await saveState();
    render();
    toast('Bookmark label renamed.');
  }
  if (action === 'cycle-columns') {
    const bucket = getBucket(bucketId);
    if (!bucket) return;
    const layout = bucketLayout(bucket);
    layout.linkColumns = layout.linkColumns >= 6 ? 1 : layout.linkColumns + 1;
    await saveState();
    render();
    toast(`${layout.linkColumns} link column${layout.linkColumns === 1 ? '' : 's'}.`);
  }
  if (action === 'toggle-full-width') {
    const bucket = getBucket(bucketId);
    if (!bucket) return;
    const layout = bucketLayout(bucket);
    if (!bucket.parentId) {
      const element = bucketGrid.querySelector(`.free-root-bucket[data-bucket-id="${CSS.escape(bucket.id)}"]`);
      const canvas = element?.closest('.free-group-canvas');
      if (!element || !canvas) return;
      const height = snapGroupMeshSize(layout.height || element.getBoundingClientRect().height || GROUP_MESH_MIN_HEIGHT, GROUP_MESH_MIN_HEIGHT);
      if (layout.fullWidth) {
        layout.fullWidth = false;
        const width = snapGroupMeshSize(layout.previousWidth || Math.round((canvas.clientWidth || 960) / 3), GROUP_MESH_MIN_WIDTH);
        const desiredX = layout.previousX || 0;
        const placement = findNearestGroupMeshPosition(canvas, bucket, desiredX, layout.y || 0, width, height);
        layout.x = placement.x;
        layout.y = placement.y;
        layout.width = placement.width;
        layout.height = placement.height;
      } else {
        const rect = element.getBoundingClientRect();
        layout.previousX = snapGroupMesh(layout.x || 0);
        layout.previousWidth = snapGroupMeshSize(layout.width || rect.width || 320, GROUP_MESH_MIN_WIDTH);
        const fullWidth = groupMeshCanvasWidth(canvas);
        const placement = findNearestGroupMeshPosition(canvas, bucket, 0, layout.y || 0, fullWidth, height, { fullWidth: true });
        layout.x = 0;
        layout.y = placement.y;
        layout.height = placement.height;
        layout.fullWidth = true;
      }
    } else if (layout.span === 12) layout.span = Math.max(2, Math.min(12, Number.parseInt(layout.previousSpan, 10) || 12));
    else { layout.previousSpan = layout.span; layout.span = 12; }
    await saveState();
    render();
  }
  if (action === 'rename-bucket') {
    openEditBucketDialog(bucketId);
  }
  if (action === 'toggle-bucket-archived') {
    const bucket = getBucket(bucketId);
    if (!bucket) return;
    bucket.archived = !bucket.archived;
    await saveState();
    render();
    toast(bucket.archived ? `"${bucket.title}" archived. Find it in the Archive section.` : `"${bucket.title}" restored to ${bucketDesktopTitle(bucket)}.`);
  }
  if (action === 'delete-bucket') {
    const bucket = getBucket(bucketId);
    if (!bucket) return;
    const descendants = descendantsOf(bucket.id);
    if (!confirm(`Delete "${bucket.title}"${descendants.length ? ` and ${descendants.length} nested item(s)` : ''} from MeshTab? Chrome bookmarks will be kept.`)) return;
    const ids = new Set([bucket.id, ...descendants.map((item) => item.id)]);
    state.buckets = state.buckets.filter((candidate) => !ids.has(candidate.id));
    await saveState();
    render();
    toast('Project/folder removed. Chrome bookmarks kept.');
  }
  if (action === 'reactivate-desktop') {
    await reactivateDesktop(button.dataset.desktopId);
  }
  if (action === 'delete-archived-desktop') {
    await permanentlyDeleteDesktop(button.dataset.desktopId);
  }
});

bucketGrid.addEventListener('pointerdown', (event) => {
  const bucketElement = event.target.closest('.free-root-bucket');
  const head = event.target.closest('.bucket-head');
  const freeHandle = event.target.closest('.bucket-drag-handle');
  if (!bucketElement || !head) return;
  if (!freeHandle && event.target.closest('button,a,input,select,textarea,summary,details,[contenteditable="true"]')) return;
  const bucket = getBucket(bucketElement.dataset.bucketId);
  const canvas = bucketElement.closest('.free-group-canvas');
  if (!bucket || !canvas) return;
  event.preventDefault();
  const layout = bucketLayout(bucket);
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = Math.max(0, Number(layout.x) || 0);
  const startTop = Math.max(0, Number(layout.y) || 0);
  const startWidth = bucketElement.getBoundingClientRect().width;
  const startHeight = bucketElement.getBoundingClientRect().height;
  const preferredWidth = snapGroupMeshSize(layout.fullWidth ? (layout.previousWidth || Math.min(startWidth, 420)) : (layout.width || startWidth), GROUP_MESH_MIN_WIDTH);
  const preferredHeight = snapGroupMeshSize(layout.height || startHeight || GROUP_MESH_MIN_HEIGHT, GROUP_MESH_MIN_HEIGHT);
  const topZ = Math.max(0, ...state.buckets.filter((item) => item.desktopId === bucket.desktopId && !item.parentId).map((item) => bucketLayout(item).z || 0));
  layout.z = topZ + 1;
  bucketElement.style.zIndex = String(layout.z);
  const captureTarget = freeHandle || head;
  captureTarget.setPointerCapture?.(event.pointerId);
  bucketElement.classList.add('free-moving');
  let moved = false;

  const move = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 2) return;
    moved = true;
    if (layout.fullWidth) layout.fullWidth = false;
    const placement = findAdaptiveGroupMeshPlacement(canvas, bucket, startLeft + dx, startTop + dy, preferredWidth, preferredHeight);
    layout.x = placement.x;
    layout.y = placement.y;
    layout.width = placement.width;
    layout.height = placement.height;
    groupLayoutDirty = true;
    const autoFit = placement.width < preferredWidth || placement.height < preferredHeight;
    bucketElement.classList.toggle('mesh-autofit', autoFit);
    bucketElement.style.left = `${layout.x}px`;
    bucketElement.style.top = `${layout.y}px`;
    bucketElement.style.width = `${layout.width}px`;
    bucketElement.style.height = `${layout.height}px`;
    freeCanvasExtent(canvas);
  };
  const finish = async () => {
    captureTarget.removeEventListener('pointermove', move);
    captureTarget.removeEventListener('pointerup', finish);
    captureTarget.removeEventListener('pointercancel', finish);
    const autoFit = bucketElement.classList.contains('mesh-autofit');
    bucketElement.classList.remove('free-moving', 'mesh-autofit');
    freeCanvasExtent(canvas);
    if (moved) { await saveState(); groupLayoutDirty = false; toast(autoFit ? 'Group resized to fit the nearest Mesh slot.' : 'Group snapped to the Mesh.'); }
  };
  captureTarget.addEventListener('pointermove', move);
  captureTarget.addEventListener('pointerup', finish, { once: true });
  captureTarget.addEventListener('pointercancel', finish, { once: true });
});

bucketGrid.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.note-resizer');
  if (!handle) return;
  const panel = handle.closest('.note-panel');
  const note = getNote(handle.dataset.noteId);
  const grid = panel?.parentElement;
  if (!panel || !note || !grid) return;
  event.preventDefault();
  event.stopPropagation();
  const layout = noteLayout(note);
  const startX = event.clientX;
  const startY = event.clientY;
  const startSpan = layout.span;
  const startHeight = panel.getBoundingClientRect().height;
  const gridWidth = grid.getBoundingClientRect().width;
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
  const columnWidth = Math.max(1, (gridWidth - gap * 11) / 12);
  handle.setPointerCapture?.(event.pointerId);
  panel.classList.add('resizing');
  const move = (moveEvent) => {
    const deltaColumns = Math.round((moveEvent.clientX - startX) / Math.max(1, columnWidth + gap));
    layout.span = Math.max(2, Math.min(12, startSpan + deltaColumns));
    layout.height = Math.max(110, Math.min(1600, Math.round(startHeight + moveEvent.clientY - startY)));
    panel.style.gridColumn = `span ${layout.span}`;
    panel.style.height = `${layout.height}px`;
  };
  const finish = async () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    panel.classList.remove('resizing');
    await saveState(); render(); toast(`Note resized to ${layout.span}/12 width.`);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', finish, { once: true });
  handle.addEventListener('pointercancel', finish, { once: true });
});

bucketGrid.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.bucket-resizer');
  if (!handle) return;
  const bucketElement = handle.closest('.bucket');
  const bucket = getBucket(handle.dataset.bucketId);
  const grid = bucketElement?.parentElement;
  if (!bucketElement || !bucket || !grid) return;
  event.preventDefault();
  event.stopPropagation();
  const layout = bucketLayout(bucket);
  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = bucketElement.getBoundingClientRect();
  const freeRoot = bucketElement.classList.contains('free-root-bucket');
  const startSpan = layout.span;
  const startHeight = startRect.height;
  const gridWidth = grid.getBoundingClientRect().width;
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
  const columnWidth = Math.max(1, (gridWidth - gap * 11) / 12);
  handle.setPointerCapture?.(event.pointerId);
  bucketElement.classList.add('resizing');
  let lastValidWidth = snapGroupMeshSize(startRect.width, GROUP_MESH_MIN_WIDTH);
  let lastValidHeight = snapGroupMeshSize(startHeight, GROUP_MESH_MIN_HEIGHT);
  let resizeBlocked = false;

  const move = (moveEvent) => {
    if (freeRoot) {
      layout.fullWidth = false;
      const desiredWidth = snapGroupMeshSize(Math.max(GROUP_MESH_MIN_WIDTH, Math.min(2600, startRect.width + moveEvent.clientX - startX)), GROUP_MESH_MIN_WIDTH);
      const desiredHeight = snapGroupMeshSize(Math.max(GROUP_MESH_MIN_HEIGHT, Math.min(1600, startHeight + moveEvent.clientY - startY)), GROUP_MESH_MIN_HEIGHT);
      const x = snapGroupMesh(layout.x || 0);
      const y = snapGroupMesh(layout.y || 0);
      const desired = { x, y, width: desiredWidth, height: desiredHeight };
      const exactValid = groupMeshPositionAvailable(grid, bucket, desired) ? desired : null;
      const fitted = exactValid || fitGroupMeshAtPosition(grid, bucket, x, y, desiredWidth, desiredHeight);
      const valid = fitted || (groupMeshPositionAvailable(grid, bucket, { x, y, width: lastValidWidth, height: lastValidHeight })
        ? { x, y, width: lastValidWidth, height: lastValidHeight }
        : null);
      if (valid) {
        lastValidWidth = valid.width;
        lastValidHeight = valid.height;
        layout.width = valid.width;
        layout.height = valid.height;
        groupLayoutDirty = true;
        bucketElement.style.width = `${layout.width}px`;
        bucketElement.style.height = `${layout.height}px`;
        bucketElement.classList.remove('mesh-blocked');
        resizeBlocked = false;
        freeCanvasExtent(grid);
      } else {
        bucketElement.classList.add('mesh-blocked');
        resizeBlocked = true;
      }
    } else {
      const deltaColumns = Math.round((moveEvent.clientX - startX) / Math.max(1, columnWidth + gap));
      layout.span = Math.max(2, Math.min(12, startSpan + deltaColumns));
      layout.height = Math.max(100, Math.min(1600, Math.round(startHeight + moveEvent.clientY - startY)));
      bucketElement.style.gridColumn = `span ${layout.span}`;
      bucketElement.style.height = `${layout.height}px`;
    }
  };
  const finish = async () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    bucketElement.classList.remove('resizing', 'mesh-blocked');
    if (freeRoot) freeCanvasExtent(grid);
    await saveState();
    groupLayoutDirty = false;
    render();
    toast(freeRoot ? (resizeBlocked ? 'Group kept at the nearest non-overlapping Mesh size.' : 'Group size snapped to the Mesh.') : `Project resized to ${layout.span}/12 width.`);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', finish, { once: true });
  handle.addEventListener('pointercancel', finish, { once: true });
});


taskRail.addEventListener('click', async (event) => {
  const button=event.target.closest('button[data-action]'); if(!button) return;
  const action=button.dataset.action;
  const allocationId=button.dataset.allocationId;
  if(action==='view-task-allocation'){ openTaskAllocationHistory(allocationId); return; }
  if(action==='view-task-allocation-time-log'){ openTaskAllocationTimeLog(allocationId); return; }
  if(action==='edit-task-allocation'){ openTaskAllocationDialog(allocationId); return; }
  if(action==='delete-task-allocation'){ await deleteTaskAllocation(allocationId); return; }
  if(action==='toggle-allocation-carryover'){ await toggleAllocationCarryOver(allocationId,button.dataset.periodKey); return; }
  if(action==='add-task-allocation'){ openTaskAllocationDialog(); return; }
  if(action==='view-all-time-entries'){ openAllTimeEntries(); return; }
  const taskId=button.dataset.taskId; const task=(state.tasks||[]).find((item)=>item.id===taskId);
  if(action==='toggle-compact-task-actions'){ expandedTaskRailTaskId=expandedTaskRailTaskId===taskId?null:taskId; renderTaskRail(); return; }
  if(action==='open-task-in-center'){ await openTaskInCenter(taskId); return; }
  if(action==='complete-task'){ openTaskCompletion(taskId); return; }
  if(action==='add-task-time'){ openTaskTimeDialog(taskId); return; }
  if(action==='start-task-timer'){ await startTaskTimer(taskId); return; }
  if(action==='stop-task-timer'){ await stopWorkClock(); return; }
  if(action==='view-task-time-history'){ openTaskTimeHistory(taskId); return; }
  if(action==='view-task-notes'){ openTaskNotes(taskId); return; }
  if(action==='view-task-links'){ openTaskLinks(taskId); return; }
  if(action==='add-task-reminder'){ openTaskQuickReminder(taskId); return; }
  if(action==='open-linked-reminder'){ openReminderDialog(button.dataset.reminderId); return; }
  if(action==='set-task-work-state'){ if(task) await setTaskWorkState(task.id,button.dataset.workState); return; }
  if(action==='toggle-task-working'){ if(task) await setTaskWorking(task.id,!task.working); return; }
  if(action==='mark-task-working'){ await setTaskWorking(taskId,true); return; }
  if(action==='toggle-task-recommendations'){ taskRecommendationsVisible=!taskRecommendationsVisible; renderTaskCenter(); return; }
  if(action==='show-task-recommendations'){ taskRecommendationsVisible=true; renderTaskCenter(); return; }
  if(action==='hide-task-recommendations'){ taskRecommendationsVisible=false; renderTaskCenter(); return; }
  if(action==='edit-task'){ openTaskDialog(taskId); return; }
  if(action==='delete-task'){ if(!task||!confirm(`Delete task "${task.title}"?`)) return; state.tasks=state.tasks.filter((item)=>item.id!==taskId); for(const reminder of (state.reminders||[])) if(reminder.linkedTaskId===taskId) reminder.linkedTaskId=''; await saveState(); render(); toast('Task deleted.'); return; }
  if(action==='reopen-task'){ if(!task) return; task.status='open'; task.workState='todo'; task.working=false; task.workingSince=''; task.completedAt=''; task.updatedAt=new Date().toISOString(); await saveState(); render(); toast('Task reopened.'); return; }
});

$('#bookmarkResults').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action="pick-bookmark"]');
  if (!button) return;
  const bucketId = selectedPickerBucketId();
  if (!bucketId) { bookmarkDialog.close(); toast('Create a group first, then add bookmarks to it.'); openBucketDialog(); return; }
  await addBookmarkToBucket(button.dataset.bookmarkId, bucketId);
  renderBookmarkResults($('#bookmarkSearch').value);
  toast('Bookmark meshed.');
});

openTabsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action="focus-tab"]');
  if (!button) return;
  try {
    await chrome.tabs.update(Number(button.dataset.tabId), { active: true });
    await chrome.windows.update(Number(button.dataset.windowId), { focused: true });
  } catch (error) { toast(error?.message || 'That tab is no longer available.'); await refreshOpenTabs(); }
});

openTabsList.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.open-tab-card');
  if (!card || !card.draggable) return;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(TAB_DRAG_TYPE, card.dataset.tabId);
});
openTabsList.addEventListener('dragend', (event) => {
  event.target.closest('.open-tab-card')?.classList.remove('dragging');
  clearAllDragIndicators();
});

function clearBookmarkDropIndicators() {
  document.querySelectorAll('.bookmark-drop-before,.bookmark-drop-after').forEach((item) => item.classList.remove('bookmark-drop-before', 'bookmark-drop-after'));
}

function clearAllDragIndicators() {
  clearBookmarkDropIndicators();
  document.querySelectorAll('.drag-over,.bucket-nest-target,.bucket-reorder-target').forEach((item) => item.classList.remove('drag-over', 'bucket-nest-target', 'bucket-reorder-target'));
}

bucketGrid.addEventListener('dragstart', (event) => {
  const noteHandle = event.target.closest('.note-drag-handle');
  if (noteHandle) {
    const panel = noteHandle.closest('.note-panel');
    panel?.classList.add('note-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(NOTE_DRAG_TYPE, noteHandle.dataset.noteId);
    return;
  }
  const bucketHandle = event.target.closest('.bucket-drag-handle');
  if (bucketHandle) {
    const bucket = bucketHandle.closest('.bucket');
    bucket?.classList.add('dragging-bucket');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(BUCKET_DRAG_TYPE, bucketHandle.dataset.bucketId);
    return;
  }
  const card = event.target.closest('.bookmark-card');
  if (!card) return;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, JSON.stringify({ bookmarkId: card.dataset.bookmarkId, sourceBucketId: card.dataset.bucketId }));
});
bucketGrid.addEventListener('dragend', (event) => {
  event.target.closest('.bookmark-card')?.classList.remove('dragging');
  event.target.closest('.bucket')?.classList.remove('dragging-bucket');
  event.target.closest('.note-panel')?.classList.remove('note-dragging');
  document.querySelectorAll('.note-drop-before,.note-drop-after').forEach((item) => item.classList.remove('note-drop-before', 'note-drop-after'));
  clearAllDragIndicators();
});

bucketGrid.addEventListener('dragover', (event) => {
  const types = Array.from(event.dataTransfer.types || []);
  const notePanel = event.target.closest('.note-panel');
  if (types.includes(NOTE_DRAG_TYPE) && notePanel) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.note-drop-before,.note-drop-after').forEach((item) => item.classList.remove('note-drop-before', 'note-drop-after'));
    if (!notePanel.classList.contains('note-dragging')) {
      const rect = notePanel.getBoundingClientRect();
      notePanel.classList.add(event.clientX >= rect.left + rect.width / 2 ? 'note-drop-after' : 'note-drop-before');
    }
    return;
  }
  const bucket = event.target.closest('.bucket');
  if (!bucket) return;
  if (![TAB_DRAG_TYPE, BOOKMARK_DRAG_TYPE, BUCKET_DRAG_TYPE].some((type) => types.includes(type))) return;
  event.preventDefault();
  if (types.includes(BUCKET_DRAG_TYPE)) {
    clearBookmarkDropIndicators();
    event.dataTransfer.dropEffect = 'move';
    const overOwnHeader = event.target.closest('.bucket-head')?.closest('.bucket') === bucket;
    bucket.classList.toggle('bucket-reorder-target', Boolean(overOwnHeader));
    bucket.classList.toggle('bucket-nest-target', !overOwnHeader);
  } else if (types.includes(BOOKMARK_DRAG_TYPE)) {
    event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.bucket.drag-over').forEach((item) => { if (item !== bucket) item.classList.remove('drag-over'); });
    bucket.classList.add('drag-over');
    clearBookmarkDropIndicators();
    const targetCard = event.target.closest('.bookmark-card');
    if (targetCard && targetCard.dataset.bucketId === bucket.dataset.bucketId && !targetCard.classList.contains('dragging')) {
      const rect = targetCard.getBoundingClientRect();
      const after = event.clientY >= rect.top + rect.height / 2;
      targetCard.classList.add(after ? 'bookmark-drop-after' : 'bookmark-drop-before');
    }
  } else {
    clearBookmarkDropIndicators();
    event.dataTransfer.dropEffect = 'copy';
    bucket.classList.add('drag-over');
  }
});
bucketGrid.addEventListener('dragleave', (event) => {
  const notePanel = event.target.closest('.note-panel');
  if (notePanel && !notePanel.contains(event.relatedTarget)) notePanel.classList.remove('note-drop-before', 'note-drop-after');
  const card = event.target.closest('.bookmark-card');
  if (card && !card.contains(event.relatedTarget)) card.classList.remove('bookmark-drop-before', 'bookmark-drop-after');
  const bucket = event.target.closest('.bucket');
  if (bucket && !bucket.contains(event.relatedTarget)) bucket.classList.remove('drag-over', 'bucket-nest-target', 'bucket-reorder-target');
});
bucketGrid.addEventListener('drop', async (event) => {
  const targetNote = event.target.closest('.note-panel');
  const draggedNoteId = event.dataTransfer.getData(NOTE_DRAG_TYPE);
  if (draggedNoteId && targetNote) {
    event.preventDefault();
    event.stopPropagation();
    const source = getNote(draggedNoteId);
    const target = getNote(targetNote.dataset.noteId);
    const placeAfter = targetNote.classList.contains('note-drop-after');
    document.querySelectorAll('.note-drop-before,.note-drop-after').forEach((item) => item.classList.remove('note-drop-before', 'note-drop-after'));
    if (!source || !target || source.id === target.id) return;
    const sourceDescendants = new Set(descendantNotesOf(source.id).map((note) => note.id));
    if (sourceDescendants.has(target.id)) { toast('A note cannot be moved into its own nested branch.'); return; }
    source.parentNoteId = target.parentNoteId;
    if (target.general) moveNoteTreeToGeneral(source); else moveNoteTreeToDesktop(source, target.desktopId);
    const siblings = noteChildrenOf(target.parentNoteId, target.desktopId, target.general).filter((note) => note.id !== source.id);
    let index = siblings.findIndex((note) => note.id === target.id);
    if (index < 0) index = siblings.length; else if (placeAfter) index += 1;
    siblings.splice(index, 0, source);
    siblings.forEach((note, i) => { note.position = i; });
    await saveState(); render(); toast('Note order updated.');
    return;
  }
  const bucket = event.target.closest('.bucket');
  if (!bucket) return;
  event.preventDefault();
  event.stopPropagation();

  const targetCard = event.target.closest('.bookmark-card');
  const targetBookmarkId = targetCard?.dataset.bucketId === bucket.dataset.bucketId ? targetCard.dataset.bookmarkId : null;
  const placeAfter = Boolean(targetCard?.classList.contains('bookmark-drop-after'));
  bucket.classList.remove('drag-over', 'bucket-nest-target', 'bucket-reorder-target');
  clearBookmarkDropIndicators();

  const draggedBucketId = event.dataTransfer.getData(BUCKET_DRAG_TYPE);
  if (draggedBucketId) {
    const target = getBucket(bucket.dataset.bucketId);
    const reorder = event.target.closest('.bucket-head')?.closest('.bucket') === bucket;
    if (reorder) {
      if (await moveBucketNode(draggedBucketId, target.desktopId, target.parentId, target.id)) toast(`Moved before ${target.title}.`);
    } else if (await moveBucketNode(draggedBucketId, target.desktopId, target.id)) toast(`Nested inside ${target.title}.`);
    return;
  }
  const tabId = event.dataTransfer.getData(TAB_DRAG_TYPE);
  if (tabId) { await addOpenTabToBucket(Number(tabId), bucket.dataset.bucketId); return; }
  const dragData = event.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
  if (dragData) {
    try {
      const parsed = JSON.parse(dragData);
      const changed = await moveBookmark(parsed.bookmarkId, parsed.sourceBucketId, bucket.dataset.bucketId, targetBookmarkId, placeAfter);
      if (changed) {
        toast(parsed.sourceBucketId === bucket.dataset.bucketId ? 'Bookmark reordered.' : 'Bookmark moved.');
      }
    } catch { toast('Could not move that bookmark.'); }
  }
});

window.addEventListener('pagehide', () => {
  if (!groupLayoutDirty || !state) return;
  // Best-effort final write for the rare case where Chrome closes during an
  // active drag/resize gesture before pointerup can finish the normal save.
  try { chrome.storage.local.set({ [STORAGE_KEY]: normalizeState(state) }); } catch {}
});

document.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (event.key === '/' && !typing) { event.preventDefault(); $('#globalSearch').focus(); }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
  state = normalizeState(changes[STORAGE_KEY].newValue);
  applyAppearance();
  const activeLiveEditor = document.activeElement?.closest?.('.note-live-editor');
  if (activeLiveEditor) return;
  render();
});

[chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged, chrome.bookmarks.onMoved].forEach((event) => event.addListener(async () => {
  if (bulkImporting) return;
  await refreshBookmarks();
  if (cleanMissingAssignments()) await saveState();
  render();
}));

[chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabs.onActivated, chrome.tabs.onReplaced].forEach((event) => event.addListener(scheduleTabRefresh));
chrome.tabs.onUpdated.addListener(scheduleTabRefresh);
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tabId !== currentMeshTabId || typeof tab?.pinned !== 'boolean') return;
  const pinned = Boolean(tab.pinned);
  if (currentMeshTabPinned === pinned) return;
  currentMeshTabPinned = pinned;
  applyHomeScreenControl();
});
chrome.windows.onCreated.addListener(scheduleTabRefresh);
chrome.windows.onRemoved.addListener(scheduleTabRefresh);
chrome.windows.onFocusChanged.addListener(scheduleTabRefresh);

globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
  if (state?.settings?.appearance === 'system') applyAppearance();
});

(async function init() {
  setDate();
  setVersion();
  state = await loadState();
  await refreshCurrentMeshTabPinState();
  applyAppearance();
  await Promise.all([refreshBookmarks(), refreshOpenTabs()]);
  if (cleanMissingAssignments()) await saveState();
  applyDefaultHomeTabForLaunch();
  render();
  if (location.hash === '#tasks' && state.settings.showTasks) setTimeout(openTaskCenter, 0);
  const taskHash=location.hash.match(/^#task=(.+)$/); if(taskHash&&state.settings.showTasks){let taskId='';try{taskId=decodeURIComponent(taskHash[1]);}catch{taskId=taskHash[1];}if(taskId)setTimeout(()=>openTaskInCenter(taskId),0);}
  if (location.hash === '#reminders' && state.settings.showReminders) { state.settings.activeView = 'reminders'; await saveState(); render(); }
})();
