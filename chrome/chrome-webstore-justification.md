# Tim's MeshTab — Chrome Web Store Justification (v1.46.6)

## Single Purpose Description

Tim's MeshTab is a New Tab replacement and personal workspace tool. Its single purpose is to give the user one visual home screen — in place of Chrome's default New Tab page — where they can organize their bookmarks into named Groups on multiple Tabs (virtual desktops), attach Notes and Tasks to that work, track time against Tasks and Allocations, set Reminders, and optionally overlay small reference widgets on specific websites. Every feature in the extension serves this single goal: replacing the New Tab page with a more useful, organized workspace built around the user's own bookmarks and self-authored content. The extension does not browse, scrape, or act on the user's behalf across the web; it only organizes and displays what the user explicitly saves into it.

## Why This Update Needs Review

Version 1.46.6 is a user-experience update to the existing New Tab workspace. It does not add, remove, or change any permission from the prior reviewed version. The changes are: (1) archiving and reactivating an entire Tab (virtual desktop) without deleting its contents; (2) folding a "single Tab" export into the existing Export flow so the user can choose a full backup or just the Tabs they select; (3) moving a destructive "Reset layout" action into Settings, away from everyday buttons; and (4) minor label/layout changes to existing buttons. All of this stays inside the extension's own `chrome.storage.local` — nothing new touches the network, the user's files, or other tabs.

## Permission Justifications

**storage** — Tim's MeshTab is a local-first tool. Every Tab, Group, Note, Task, Allocation, Reminder, Work Clock session, and Website Overlay the user creates is persisted with `chrome.storage.local` so it survives browser restarts. This is the core permission the extension is built on; without it, nothing the user organizes would be saved.

**unlimitedStorage** — Users who accumulate many Groups, long-running Notes, months of Task time entries, and Work Clock history can exceed Chrome's default local storage quota. This permission simply raises that ceiling so a long-time user's saved workspace is never silently truncated or lost.

**bookmarks** — The extension's core feature is organizing Chrome bookmarks into visual Groups. It reads the user's existing bookmark tree so they can browse and drag bookmarks into a Group, and it can create/update bookmarks when the user saves a link through MeshTab. It never deletes or modifies bookmarks the user hasn't explicitly acted on inside the extension's own UI.

**favicon** — Used only to display each saved link's own site icon next to it inside a Group, so the visual bookmark grid is scannable at a glance instead of showing bare URLs. This is purely cosmetic and reads only the favicon for links the user has already saved.

**activeTab** — Used for the "Browse bookmarks"/"Use active page" style actions, where the user explicitly asks MeshTab to grab the URL, title, or favicon of the tab they are currently looking at (for example, when creating a Website Overlay for "this site" or saving the current page into a Group). It only activates in direct response to a user-initiated click, never in the background.

**tabs** — Enumerates the user's open tabs for the "Open Pages" rail (drag an open tab into a Group), and detects when a saved link is already open so clicking it in MeshTab focuses that tab instead of duplicating it. Also opens/pins/focuses MeshTab's own New Tab pages per the user's startup/window settings.

**alarms** — Powers the Reminders feature. Chrome's alarms API is the standard, battery-friendly way for an extension to fire a callback at a future time without keeping a persistent background process alive; it is used exclusively to trigger the reminder notifications the user has scheduled.

**notifications** — Used to actually display the Reminder alert to the user at the scheduled time, and to surface Task/Work Clock related nudges the user has opted into. No notification is shown unless the user created the underlying Reminder or Task themselves.

**chrome_url_overrides (newtab)** — This is the delivery mechanism for the extension's single purpose: replacing the default New Tab page with the MeshTab workspace. The user can turn this off in Settings ("Use MeshTab for New Tabs") and fall back to Chrome's built-in New Tab screen at any time.

**optional_host_permissions (http://*/*, https://*/*)** — Optional, not requested at install. Requested per-site only if the user turns on Website Overlays and defines an overlay for a specific site (a small MeshTab widget, or floating badge, pinned to a page the user chose). Nothing is requested until the user opts in from Settings and configures an overlay.

**optional_permissions (scripting)** — Also optional and tied to the same Website Overlays feature above. It is the mechanism used to inject the small overlay UI (the floating badge/panel) onto the host page the user selected, and is requested at the same time as the matching host permission, only on user action.

**content_security_policy (frame-src https://calendar.google.com)** — Used solely to let a user embed their own Google Calendar inside a "Calendar Tab," a feature where MeshTab shows the user's calendar as one of their virtual desktops. This is a narrow, single-domain allowance for an iframe the user opts into by pasting their own calendar embed link.

## Data Handling Summary

Tim's MeshTab does not transmit user data to any remote server; there is no analytics, telemetry, or third-party data collection anywhere in the extension. All Tabs, Groups, Notes, Tasks, Reminders, Allocations, Work Clock sessions, and Overlay definitions live exclusively in the browser's local extension storage on the user's own machine. The optional Export feature (updated this release to let the user pick "everything" or specific Tabs) writes a JSON file to the user's downloads via a local Blob URL — a local file save, not a network upload. Import reads a local file the same way, in reverse. No permission requested by this extension is used for anything beyond organizing the user's own bookmarks, notes, and tasks on a New Tab workspace.
