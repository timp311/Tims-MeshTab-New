(function (root) {
  'use strict';

  const MESH_COLORS = {
    violet: '#6e49ff',
    blue: '#3f7cff',
    green: '#33a06f',
    orange: '#e88639',
    rose: '#d65378'
  };

  function cleanText(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function safeUrl(value) {
    const url = cleanText(value);
    return /^(https?|file):/i.test(url) ? url : '';
  }

  function safeFavicon(value) {
    const icon = cleanText(value);
    if (/^https?:\/\//i.test(icon)) return icon;
    if (/^data:image\//i.test(icon)) return icon;
    return '';
  }

  function hexToRgb(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(cleanText(hex));
    if (!match) return null;
    const n = Number.parseInt(match[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function nearestMeshColor(hex, fallback = 'violet') {
    const source = hexToRgb(hex);
    if (!source) return fallback;
    let best = fallback;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [name, paletteHex] of Object.entries(MESH_COLORS)) {
      const target = hexToRgb(paletteHex);
      const distance = ((source.r - target.r) ** 2) + ((source.g - target.g) ** 2) + ((source.b - target.b) ** 2);
      if (distance < bestDistance) { best = name; bestDistance = distance; }
    }
    return best;
  }

  function bookmarkFromTabme(item) {
    const url = safeUrl(item?.url);
    if (!url) return null;
    const title = cleanText(item?.title, url) || url;
    return { title, label: title, url, favIconUrl: safeFavicon(item?.favIconUrl) };
  }

  function isGroup(item) {
    return Boolean(item && (item.type === 'group' || item.objectType === 'group' || Array.isArray(item.groupItems)));
  }

  function tabmeContainerToPortable(container, parentKey, inheritedColor, output, keyPrefix, kind = 'folder') {
    const ownColor = cleanText(container?.color) || inheritedColor || '';
    const key = `${keyPrefix}-${String(container?.id || output.length + 1)}`;
    const items = Array.isArray(container?.items) ? container.items : Array.isArray(container?.groupItems) ? container.groupItems : [];
    const links = [];
    const groups = [];
    for (const item of items) {
      if (isGroup(item)) groups.push(item);
      else {
        const link = bookmarkFromTabme(item);
        if (link) links.push(link);
      }
    }
    output.push({
      key,
      parentKey: parentKey || null,
      title: cleanText(container?.title, 'Folder') || 'Folder',
      kind: kind === 'project' ? 'project' : 'folder',
      color: nearestMeshColor(ownColor, 'violet'),
      links
    });
    for (const group of groups) tabmeContainerToPortable(group, key, ownColor, output, `${keyPrefix}-group`, 'folder');
  }

  function tabmeToPortable(data) {
    if (!data || data.isTabme !== true || !Array.isArray(data.spaces)) throw new Error('This file is not a recognized TABME export.');
    const desktops = data.spaces.map((space, spaceIndex) => {
      const buckets = [];
      const folders = Array.isArray(space?.folders) ? space.folders : [];
      for (const folder of folders) tabmeContainerToPortable(folder, null, cleanText(folder?.color), buckets, `space-${spaceIndex}-folder`, 'folder');
      return { title: cleanText(space?.title, `TABME ${spaceIndex + 1}`) || `TABME ${spaceIndex + 1}`, buckets, notes: [] };
    });
    return { source: 'TABME', sourceVersion: data.version ?? null, desktops, generalNotes: [], taskAllocations: [], tasks: [], reminders: [], siteOverlays: [] };
  }

  function linksFromPortableBucket(bucket) {
    return (Array.isArray(bucket?.links) ? bucket.links : []).map((link) => {
      const url = safeUrl(link?.url);
      if (!url) return null;
      return { title: cleanText(link?.title, url) || url, label: cleanText(link?.label), url, favIconUrl: safeFavicon(link?.favIconUrl) };
    }).filter(Boolean);
  }

  function meshTabToPortable(data) {
    if (!data) throw new Error('This file is not a recognized MeshTab export.');

    if (Array.isArray(data.desktops)) {
      const desktops = data.desktops.map((desktop, desktopIndex) => {
        const sourceBuckets = Array.isArray(desktop?.buckets) ? desktop.buckets : [];
        const buckets = sourceBuckets.map((bucket, bucketIndex) => ({
          key: String(bucket?.id || `desktop-${desktopIndex}-bucket-${bucketIndex}`),
          parentKey: bucket?.parentId == null ? null : String(bucket.parentId),
          title: cleanText(bucket?.title, `Project ${bucketIndex + 1}`) || `Project ${bucketIndex + 1}`,
          kind: bucket?.kind === 'folder' ? 'folder' : 'project',
          color: Object.hasOwn(MESH_COLORS, bucket?.color) || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(bucket?.color || '')) ? bucket.color : 'violet',
          archived: Boolean(bucket?.archived),
          layout: bucket?.layout && typeof bucket.layout === 'object' ? {
            span: Number(bucket.layout.span) || 0, height: Number(bucket.layout.height) || 0, linkColumns: Number(bucket.layout.linkColumns) || 1, previousSpan: Number(bucket.layout.previousSpan) || 0,
            x: bucket.layout.x != null && Number.isFinite(Number(bucket.layout.x)) ? Number(bucket.layout.x) : null, y: bucket.layout.y != null && Number.isFinite(Number(bucket.layout.y)) ? Number(bucket.layout.y) : null,
            width: Number(bucket.layout.width) || 0, previousWidth: Number(bucket.layout.previousWidth) || 0, previousX: Number(bucket.layout.previousX) || 0,
            fullWidth: Boolean(bucket.layout.fullWidth), z: Number(bucket.layout.z) || 0
          } : null,
          links: linksFromPortableBucket(bucket)
        }));
        const notes = (Array.isArray(desktop?.notes) ? desktop.notes : []).map((note, noteIndex) => ({
          key: String(note?.id || `desktop-${desktopIndex}-note-${noteIndex}`),
          parentKey: note?.parentId == null ? null : String(note.parentId),
          position: Number.isFinite(Number(note?.position)) ? Number(note.position) : noteIndex,
          title: cleanText(note?.title, `Note ${noteIndex + 1}`) || `Note ${noteIndex + 1}`,
          masked: Boolean(note?.masked),
          html: typeof note?.html === 'string' ? note.html : '',
          layout: note?.layout && typeof note.layout === 'object' ? { span: Number(note.layout.span) || 0, height: Number(note.layout.height) || 0, previousSpan: Number(note.layout.previousSpan) || 0 } : null
        }));
        return { title: cleanText(desktop?.title, `Desktop ${desktopIndex + 1}`) || `Desktop ${desktopIndex + 1}`, type: desktop?.type === 'calendar' ? 'calendar' : 'workspace', calendarUrl: cleanText(desktop?.calendarUrl), archived: Boolean(desktop?.archived), buckets, notes };
      });
      const generalNotes = (Array.isArray(data.generalNotes) ? data.generalNotes : []).map((note, noteIndex) => ({
        key: String(note?.id || `general-note-${noteIndex}`),
        parentKey: note?.parentId == null ? null : String(note.parentId),
        position: Number.isFinite(Number(note?.position)) ? Number(note.position) : noteIndex,
        title: cleanText(note?.title, `General Note ${noteIndex + 1}`) || `General Note ${noteIndex + 1}`,
        masked: Boolean(note?.masked),
        html: typeof note?.html === 'string' ? note.html : '',
        layout: note?.layout && typeof note.layout === 'object' ? { span: Number(note.layout.span) || 0, height: Number(note.layout.height) || 0, previousSpan: Number(note.layout.previousSpan) || 0 } : null
      }));
      const tasks = (Array.isArray(data.tasks) ? data.tasks : []).map((task, taskIndex) => ({
        id: String(task?.id || `task-${taskIndex}`), title: cleanText(task?.title, `Task ${taskIndex + 1}`) || `Task ${taskIndex + 1}`, details: cleanText(task?.details),
        taskGroupId: task?.taskGroupId === 'general' ? 'general' : String(task?.taskGroupId || 'general'), desktopTitle: cleanText(task?.desktopTitle), allocationId: cleanText(task?.allocationId),
        priority: ['low','medium','high','critical'].includes(task?.priority) ? task.priority : 'medium', status: task?.status === 'done' ? 'done' : 'open', workState: task?.status === 'done' ? 'closed' : (['todo','working','ongoing'].includes(task?.workState) ? task.workState : (task?.working ? 'working' : 'todo')), working: task?.status !== 'done' && (task?.workState === 'working' || (!task?.workState && Boolean(task?.working))), workingSince: cleanText(task?.workingSince),
        createdAt: cleanText(task?.createdAt), updatedAt: cleanText(task?.updatedAt), dueDate: cleanText(task?.dueDate), completedAt: cleanText(task?.completedAt),
        closureNotes: cleanText(task?.closureNotes), timeEntries: (Array.isArray(task?.timeEntries) ? task.timeEntries : []).map((entry, entryIndex) => ({ id: String(entry?.id || `time-${taskIndex}-${entryIndex}`), minutes: Math.max(0, Number.parseInt(entry?.minutes, 10) || 0), details: cleanText(entry?.details), loggedAt: cleanText(entry?.loggedAt) })).filter((entry) => entry.minutes > 0), taskNotes: (Array.isArray(task?.taskNotes) ? task.taskNotes : []).map((note, noteIndex) => ({ id: String(note?.id || `task-note-${taskIndex}-${noteIndex}`), title: cleanText(note?.title, `Task note ${noteIndex + 1}`) || `Task note ${noteIndex + 1}`, body: cleanText(note?.body), createdAt: cleanText(note?.createdAt), updatedAt: cleanText(note?.updatedAt) })), taskLinks: (Array.isArray(task?.taskLinks) ? task.taskLinks : []).map((link) => ({ title: cleanText(link?.title), url: /^\s*(javascript|vbscript|data):/i.test(cleanText(link?.url)) ? '' : cleanText(link?.url), createdAt: cleanText(link?.createdAt) })).filter((link) => link.url), minutesSpent: Math.max(0, Number.parseInt(task?.minutesSpent, 10) || 0)
      }));
      const taskAllocations = (Array.isArray(data.taskAllocations) ? data.taskAllocations : []).map((allocation, allocationIndex) => ({ id:String(allocation?.id || `allocation-${allocationIndex}`), name:cleanText(allocation?.name,`Allocation ${allocationIndex+1}`)||`Allocation ${allocationIndex+1}`, type:['project','job','ticket','bucket'].includes(allocation?.type)?allocation.type:'project', reference:cleanText(allocation?.reference), taskGroupId:allocation?.taskGroupId==='general'?'general':String(allocation?.taskGroupId||'general'), desktopTitle:cleanText(allocation?.desktopTitle), mode:['unlimited','total','recurring'].includes(allocation?.mode)?allocation.mode:'unlimited', hours:Math.max(0,Number(allocation?.hours)||0), cadence:['weekly','monthly','quarterly'].includes(allocation?.cadence)?allocation.cadence:'weekly', startDate:cleanText(allocation?.startDate), endDate:cleanText(allocation?.endDate), details:cleanText(allocation?.details), active:allocation?.active!==false, carryOverPeriods:(Array.isArray(allocation?.carryOverPeriods)?allocation.carryOverPeriods:[]).map((key)=>cleanText(key)).filter(Boolean), createdAt:cleanText(allocation?.createdAt), updatedAt:cleanText(allocation?.updatedAt) }));
      const reminders = (Array.isArray(data.reminders) ? data.reminders : []).map((reminder, reminderIndex) => ({
        id: String(reminder?.id || `reminder-${reminderIndex}`), title: cleanText(reminder?.title, `Reminder ${reminderIndex + 1}`) || `Reminder ${reminderIndex + 1}`, details: cleanText(reminder?.details),
        scheduleType: ['once','daily','selected-days'].includes(reminder?.scheduleType) ? reminder.scheduleType : 'once', date: cleanText(reminder?.date), time: cleanText(reminder?.time),
        days: Array.isArray(reminder?.days) ? reminder.days.map(Number).filter((day)=>Number.isInteger(day)&&day>=0&&day<=6) : [], enabled: reminder?.enabled !== false,
        linkedTaskId: cleanText(reminder?.linkedTaskId), createdAt: cleanText(reminder?.createdAt), updatedAt: cleanText(reminder?.updatedAt), lastTriggeredAt: cleanText(reminder?.lastTriggeredAt), snoozedUntil: cleanText(reminder?.snoozedUntil)
      }));
      return { source: 'MeshTab', sourceVersion: data.schemaVersion ?? data.version ?? null, desktops, generalNotes, taskAllocations, tasks, reminders, workClock: data.workClock && typeof data.workClock === 'object' ? data.workClock : null, settings: data.settings && typeof data.settings === 'object' ? { ...data.settings } : null, siteOverlays: Array.isArray(data.siteOverlays) ? data.siteOverlays : [] };
    }

    if (Array.isArray(data.buckets)) {
      const buckets = data.buckets.map((bucket, index) => ({
        key: `legacy-${index}`,
        parentKey: null,
        title: cleanText(bucket?.title, `Project ${index + 1}`) || `Project ${index + 1}`,
        kind: 'project',
        color: Object.hasOwn(MESH_COLORS, bucket?.color) ? bucket.color : 'violet',
        links: linksFromPortableBucket(bucket)
      }));
      return { source: 'MeshTab', sourceVersion: data.schemaVersion ?? data.version ?? null, desktops: [{ title: 'Imported', buckets, notes: [] }], generalNotes: [], taskAllocations: [], tasks: [], reminders: [], siteOverlays: [] };
    }

    throw new Error('This file is not a recognized MeshTab export.');
  }

  function parseImport(data) {
    if (data?.isTabme === true) return tabmeToPortable(data);
    if (data?.format === 'meshtab-export' || data?.app === "Tim's MeshTab") return meshTabToPortable(data);
    throw new Error('Unsupported JSON. Choose a MeshTab export or TABME backup.');
  }

  function countLinks(portable) {
    return portable.desktops.reduce((sum, desktop) => sum + desktop.buckets.reduce((bucketSum, bucket) => bucketSum + bucket.links.length, 0), 0);
  }

  root.MeshTabImport = { MESH_COLORS, safeUrl, safeFavicon, nearestMeshColor, parseImport, tabmeToPortable, meshTabToPortable, countLinks };
})(globalThis);
