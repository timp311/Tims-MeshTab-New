(function (root) {
  'use strict';

  const DAY_MS = 86400000;
  const VALID_SCHEDULES = ['once', 'daily', 'selected-days'];
  const DEFAULT_DAYS = [1,2,3,4,5];

  function pad(value) { return String(value).padStart(2, '0'); }
  function localDateKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
  function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
  function cleanDays(days) { return Array.from(new Set((Array.isArray(days) ? days : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a,b)=>a-b); }
  function safeIso(value) { return Number.isFinite(Date.parse(value || '')) ? new Date(value).toISOString() : ''; }

  function normalizeReminder(reminder, index = 0) {
    const now = new Date();
    const fallbackWhen = new Date(Date.now() + 5 * 60000);
    const scheduleType = VALID_SCHEDULES.includes(reminder?.scheduleType) ? reminder.scheduleType : 'once';
    const date = validDate(reminder?.date) ? String(reminder.date) : localDateKey(fallbackWhen);
    const time = validTime(reminder?.time) ? String(reminder.time) : `${pad(fallbackWhen.getHours())}:${pad(fallbackWhen.getMinutes())}`;
    let days = cleanDays(reminder?.days);
    if (scheduleType === 'daily') days = [0,1,2,3,4,5,6];
    if (scheduleType === 'selected-days' && !days.length) days = [...DEFAULT_DAYS];
    return {
      id: String(reminder?.id || `reminder-${Date.now()}-${index}`),
      title: String(reminder?.title || `Reminder ${index + 1}`).trim().slice(0, 140) || `Reminder ${index + 1}`,
      details: String(reminder?.details || '').trim().slice(0, 1600),
      linkedTaskId: reminder?.linkedTaskId ? String(reminder.linkedTaskId) : '',
      scheduleType,
      date,
      time,
      days,
      enabled: reminder?.enabled !== false,
      createdAt: safeIso(reminder?.createdAt) || new Date().toISOString(),
      updatedAt: safeIso(reminder?.updatedAt) || safeIso(reminder?.createdAt) || new Date().toISOString(),
      lastTriggeredAt: safeIso(reminder?.lastTriggeredAt),
      snoozedUntil: safeIso(reminder?.snoozedUntil)
    };
  }

  function localDateTime(dateKey, timeValue) {
    if (!validDate(dateKey) || !validTime(timeValue)) return NaN;
    const [y,m,d] = dateKey.split('-').map(Number);
    const [h,min] = timeValue.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0, 0).getTime();
  }

  function nextBaseOccurrence(reminder, afterMs = Date.now()) {
    const item = normalizeReminder(reminder);
    if (!item.enabled) return null;
    if (item.scheduleType === 'once') {
      const when = localDateTime(item.date, item.time);
      return Number.isFinite(when) && when >= afterMs ? when : null;
    }
    const allowedDays = item.scheduleType === 'daily' ? [0,1,2,3,4,5,6] : item.days;
    const [hour, minute] = item.time.split(':').map(Number);
    const start = new Date(afterMs);
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, hour, minute, 0, 0);
      if (candidate.getTime() < afterMs) continue;
      if (allowedDays.includes(candidate.getDay())) return candidate.getTime();
    }
    return null;
  }

  function effectiveNextOccurrence(reminder, afterMs = Date.now()) {
    const item = normalizeReminder(reminder);
    const snooze = item.snoozedUntil ? Date.parse(item.snoozedUntil) : NaN;
    if (Number.isFinite(snooze) && snooze >= afterMs) return snooze;
    return nextBaseOccurrence(item, afterMs);
  }

  function occurrencesBetween(reminder, startMs, endMs, max = 16) {
    const item = normalizeReminder(reminder);
    const result = [];
    const snooze = item.snoozedUntil ? Date.parse(item.snoozedUntil) : NaN;
    if (Number.isFinite(snooze) && snooze >= startMs && snooze <= endMs) result.push({ when: snooze, snoozed: true });
    if (!item.enabled) return result.slice(0, max);
    if (item.scheduleType === 'once') {
      if (Number.isFinite(snooze) && snooze >= Date.now()) return result.slice(0, max);
      const when = localDateTime(item.date, item.time);
      if (Number.isFinite(when) && when >= startMs && when <= endMs) result.push({ when, snoozed: false });
      return result.sort((a,b)=>a.when-b.when).slice(0,max);
    }
    const allowedDays = item.scheduleType === 'daily' ? [0,1,2,3,4,5,6] : item.days;
    const [hour, minute] = item.time.split(':').map(Number);
    const baseStart = Number.isFinite(snooze) && snooze >= startMs ? Math.max(startMs, snooze + 60000) : startMs;
    const cursor = new Date(baseStart);
    cursor.setHours(0,0,0,0);
    const endDate = new Date(endMs); endDate.setHours(23,59,59,999);
    for (let day = new Date(cursor); day <= endDate && result.length < max; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      if (!allowedDays.includes(day.getDay())) continue;
      const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0).getTime();
      if (when >= baseStart && when <= endMs) result.push({ when, snoozed: false });
    }
    return result.sort((a,b)=>a.when-b.when).slice(0,max);
  }

  function snoozeTarget(option, nowMs = Date.now()) {
    const now = new Date(nowMs);
    if (option === '10m') return nowMs + 10 * 60000;
    if (option === '15m') return nowMs + 15 * 60000;
    if (option === '30m') return nowMs + 30 * 60000;
    if (option === '1h') return nowMs + 60 * 60000;
    if (option === 'bottom') {
      const target = new Date(now);
      if (target.getMinutes() < 30) target.setMinutes(30,0,0);
      else { target.setHours(target.getHours() + 1, 30, 0, 0); }
      return target.getTime();
    }
    if (option === 'top') {
      const target = new Date(now);
      target.setHours(target.getHours() + 1, 0, 0, 0);
      return target.getTime();
    }
    if (option === 'tomorrow') {
      const target = new Date(now);
      target.setDate(target.getDate() + 1);
      return target.getTime();
    }
    return nowMs + 10 * 60000;
  }

  function recurrenceLabel(reminder) {
    const item = normalizeReminder(reminder);
    if (item.scheduleType === 'once') return 'One time';
    if (item.scheduleType === 'daily') return `Daily at ${item.time}`;
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `${item.days.map((day)=>names[day]).join(', ')} at ${item.time}`;
  }

  root.MeshTabReminders = { DAY_MS, DEFAULT_DAYS, normalizeReminder, nextBaseOccurrence, effectiveNextOccurrence, occurrencesBetween, snoozeTarget, recurrenceLabel, localDateKey, localDateTime };
})(globalThis);
