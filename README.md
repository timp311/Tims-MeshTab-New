# Tim's MeshTab — New Tab Edition

**Version 1.51.0 — New Tab Edition**




## v1.51.0 — Text size setting (Small, Medium, Large, MONSTROUS)

- **New setting: Text size.** Under Settings → Appearance, pick **Small**, **Medium**, **Large**, or **MONSTROUS** to make all of MeshTab's text bigger at once.
  - **Small** is the default and matches the original look.
  - Medium is 1.2×, Large is 1.4×, and MONSTROUS is 1.75× the original size.
- It stacks with the existing **Tab font size** and **Day & date size** settings, so those scale up too.
- At the larger sizes, Group cards may need to be resized (drag the bottom-right corner) to show all their contents.
- The Work Clock and Website overlays that appear on other sites aren't affected.


## v1.50.2 — Weekly total cards always visible; only the breakdown collapses

- In the Allocation Center's **Weekly total**, the three total cards (**Budgeted this week**, **Logged this week**, **Remaining**) are now always visible.
- Only the per-allocation list collapses. It's now an **Allocation breakdown** row inside Weekly total (▸ to expand), collapsed by default, and shows how many active allocations it holds.
- **All allocations** further down is unchanged and still collapsible, collapsed by default.


## v1.50.1 — Day and date only in the top right (no time)

- Removed the clock time added in v1.50.0. The top right is back to the **day** (e.g. "Tuesday") over the **date** (e.g. "Sep 22, 2026"), the same as before.
- The size setting stays and was renamed **Day & date size** (Settings → Appearance): Small (the original size), Medium (the default, a bit bigger), or Large.


## v1.50.0 — Collapsible Allocation Center, bigger clock, Tab options next to the timer, complete export

- **Collapsible Allocation Center sections.** **Weekly total** and **All allocations** can each be collapsed or expanded by clicking their header (▸ / ▾). Both start collapsed every time MeshTab opens, and stay the way you left them while the page is open.
  - When collapsed, Weekly total still shows a one-line summary: "43.25h budgeted · 28h logged · 12h remaining" (red if you're over).
  - When collapsed, All allocations shows how many allocations there are and how many are active.
- **Bigger day and date.** (v1.50.0 briefly added the clock time here; v1.50.1 removed it.)
- **New setting: Time & date size** (renamed Day & date size in v1.50.1). Under Settings → Appearance: **Small** (the old size), **Medium** (the default), or **Large**.
- **Tab options gear moved next to the timer.** The ⚙ Tab options button (Rename / Calendar Settings / Archive / Delete) now sits right beside the ⏱ Work Clock button instead of on its own row below it. On a Calendar Tab, "Open in Google Calendar" sits there too. It's hidden on Home, Tasks, Allocations, and the other non-Tab screens, where it didn't do anything. The now-empty row under the stats is gone.
- **Complete export.** Export (full backup or selected Tabs) now includes everything:
  - **Time entries:** every Task still carries its own time entries, and there's also a new top-level `timeEntries` list with one row per entry: date, minutes, hours, details, Task, Allocation name/type/reference, and Tab. Handy for spreadsheets or invoicing. A selected-Tabs export includes only the entries for Tasks in those Tabs.
  - Archived state for Tabs and Groups, the active Tab, saved favicons, and the full Work Clock state, including which Task a running timer is linked to.
- **Import fixes so a backup restores everything:**
  - Task Links were being dropped on import. They're now restored.
  - Groups with a custom hex color came back as violet. They now keep their color.
  - Archived Tabs and Groups now come back archived. A Tab is only archived if at least one other Tab stays active.
  - A running Work Clock that was linked to a Task is re-linked to the imported Task.
  - `importers.js` changed along with `app.js`, and both are updated in the `chrome/` and `firefox/` folders.


## v1.49.1 — Weekly Total spreads monthly, quarterly, and total budgets across the week

- In the Allocation Center's Weekly Total, monthly, quarterly, and total allocations now count toward **Budgeted this week**. Before, only weekly allocations were counted.
- The budget is spread evenly by day. Each day of this week gets that period's budget ÷ the number of days in the period:
  - **Monthly:** 40h in a 30-day month → 9.33h for a full week. A week that straddles two months takes the right share of each month's budget.
  - **Quarterly:** 91h in a 92-day quarter → 6.92h for a full week.
  - **Total** (with both a start and end date): the budget ÷ the days between those dates. Days outside the allocation's dates count as zero.
  - If an allocation starts or ends partway through a month or quarter, its budget is spread over just the days it's active in that period. Carry-over adjustments are included.
- Each row shows the weekly share (e.g. "9.33h this week") with the full budget underneath (e.g. "of 40h / month, spread by day"), plus its own Remaining (weekly share − logged this week).
- Open buckets, and total allocations missing a start or end date, can't be spread. They still appear in the list but aren't counted, and the Budgeted card says how many were left out.


## v1.49.0 — One "+" menu, Settings gear in the header, and a Weekly Total for allocations

- **One "+" button.** The second "+" (New Group / New Note / New Task) that sat under the Tab row is gone. The "+" at the end of the Tab row now does everything:
  - On a regular Tab it shows **New Tab, New Calendar Tab, New Group, New Note, New Task**.
  - On Home, a Calendar Tab, or any other screen (Tasks, Allocations, Archive, etc.) it shows only **New Tab** and **New Calendar Tab**.
  - New Note and New Task still hide when Notes or Tasks are turned off in Settings. The Tab options gear (⚙ Rename / Archive / Delete) stays where it was.
- **Settings moved to the header.** The Settings button is now a ⚙ gear icon in the top right, next to the date. It opens the same Settings dialog. The ⏱ Work Clock button stays where it was.
- **Weekly Total in the Allocation Center.** A new section at the top of the Allocation Center lists every active allocation for the current week (Monday–Sunday) with:
  - **Budgeted**: the allocation's budget. Weekly allocations show "Xh / week" (including any carry-over adjustment) and a per-allocation Remaining. Monthly, quarterly, total, and open-bucket allocations show their own budget and a "—" for Remaining.
  - **Logged this week**: the time logged against that allocation this week.
  - Three total cards: **Budgeted this week** (the sum of the weekly allocations only; the card says how many other allocations aren't counted), **Logged this week** (the same number as the THIS WEEK summary card), and **Remaining** (your weekly billable target minus logged time this week). If you go past the target it shows "OVER Xh" in red.
- **New setting: Total billable hours per week.** It's under Settings → Time entry and defaults to **40**. The Weekly Total's Remaining is calculated from it. It accepts 0–168 in quarter-hour steps, and a blank or invalid entry resets to 40.


## v1.48.10 — Bulleted notes, a bigger note view, and quick timers from the Task Rail

- Notes support real bullet lists now. A "• Bullets" button above the note editor (in the full Edit Note dialog, on every note card, and in the popup's Quick Note) turns the current line into a bulleted list; click it again to turn it back into normal text.
- Pasting bulleted or numbered text into a note now keeps the list structure instead of flattening it to plain lines: pasting from a webpage, Word, or another note preserves the actual list, and pasting plain text where lines start with "-", "•", "*", or "1." turns those lines into a real list too.
- Double-clicking a note's title bar (or its masked cover) now opens that note in the full-size Edit Note dialog, so it's easier to review a long note without needing the "⋯" menu. Double-clicking inside the note's text still just selects a word, like normal.
- Added a "▶ Start Timer" / "■ Stop Timer" button to the quick-action row in the Mesh Tasks side rail (click a task there to expand its buttons) — the Work Clock can now be started or stopped straight from the rail without opening the full Task Center.


## v1.48.9 — Split into separate chrome/ and firefox/ folders

- The project is now two self-contained folders instead of one flat folder with both manifests mixed in: `chrome/` and `firefox/`, each holding a full copy of every file plus its own `manifest.json`. Load `chrome/manifest.json` in `chrome://extensions` and `firefox/manifest.json` in Firefox's `about:debugging` — no more copying or renaming files before loading either one. See `FIREFOX-BUILD.md`.
- No filesystem-level linking (symlinks/hard links) between the two — this project folder is synced by OneDrive, which doesn't handle either reliably. Instead, the two folders are kept in sync by hand going forward: any change to a shared file gets pushed to both.
- One-time cleanup: the old files sitting directly in the project root (app.js, background.js, manifest.json, manifest.firefox.json, and the rest — everything now duplicated inside `chrome/` and `firefox/`) are safe to delete. They're leftover from before the split.


## v1.48.8 — Firefox build

- Added a Firefox-compatible build alongside the existing Chrome one. One shared codebase — every script now aliases `chrome` to Firefox's native `browser` API at the top of the file (a no-op in Chrome), so no logic had to fork or duplicate.
- Added `manifest.firefox.json` with the manifest keys Firefox needs differently: a classic background page (`background.scripts`) instead of Chrome's service worker, and the `browser_specific_settings.gecko` block Firefox requires for an add-on ID and minimum version.
- See `FIREFOX-BUILD.md` for how to load it in Firefox for testing (`about:debugging` → Load Temporary Add-on) and notes on eventually publishing to addons.mozilla.org.
- Known limitation: Firefox doesn't have Chrome's `/_favicon/` lookup, so favicons that aren't already cached (from a dragged-in open tab, or a bookmark that already carries its own icon) fall back to the plain letter badge instead of the site's icon. Nothing else about the layout changes.
- This has not been tested in an actual Firefox browser — only verified against Firefox's documented WebExtensions behavior. Please test and report back anything that looks off.


## v1.48.7 — Minimized Work Clock overlay shows just the icon

- The minimized Work Clock tab (added in v1.48.6) was still showing the running time next to the icon, defeating the point of minimizing it. It now shows only the clock icon (⏱, or ⏸ while paused) when minimized — no time text. Click it to expand and see the full readout again.


## v1.48.6 — Minimize the Work Clock overlay

- The floating Work Clock overlay (the pill that shows your running timer on regular web pages and on the New Tab page) now has a minimize button. Click it and the overlay shrinks down to a small tab docked flush against the nearest side of the screen — just a clock icon and the time, out of your way.
- Click the minimized tab to bring it back to the full view with Pause/Resume and Stop.
- You can still drag it around while minimized — drop it near the left or right edge and it snaps flush to whichever side it's closest to. The minimized state is remembered and stays in sync across every open tab (and the New Tab page) until you expand it again.


## v1.48.5 — Removed local file links (didn't work reliably)

- Local file links (e.g. `C:\Users\you\file.xlsx`) are no longer supported in Task Links or bucket bookmarks. Even with "Allow access to file URLs" enabled, Chrome's Downloads API kept failing to read local files from the extension, so this feature never worked reliably — it's been pulled out rather than left half-broken. The **downloads** permission added for it in v1.48.3 has also been removed.
- If you were relying on this, the recommended place for a local file path now is a task's **Notes** — paste the path there as plain text for reference.
- Typing a local path into the Task Links or bucket "add URL" box now shows a clear message that it isn't supported, instead of silently saving a broken link.


## v1.48.4 — Fix for local file links failing to download

- The v1.48.3 "open with OS default app" feature was failing every time for local files — Chrome's Downloads API needs an extra permission before it can read files on your computer, separate from the extension's normal permissions. Clicking a local file link now shows a clear message telling you exactly where to turn that on: **chrome://extensions → Tim's MeshTab → Details → "Allow access to file URLs."** This is a one-time toggle; once it's on, local file links will download and open normally.
- Added the same tip under the Task Links form so it's visible before you hit the problem, not just after.


## v1.48.3 — Local file links now open with your OS default app

- Clicking a local file link (bucket bookmark or Task Link, e.g. `C:\Users\you\file.xlsx`) used to have Chrome try to display it in a browser tab — readable text files would just render as plain text in-tab, and other types would silently download. Now MeshTab hands the file to Chrome's Downloads API and asks Chrome to launch it with your OS's default app for that file type (Notepad, Excel, etc.), the same as clicking "Open" on a download. The first click copies the file into your Downloads folder; later clicks on the same link reuse that copy instead of piling up duplicates.
- If your browser blocks the automatic open (this can happen depending on how the click reached Chrome), you'll get a toast telling you it's in your Downloads folder — one click on "Open" there finishes the job.
- This needed a new **Downloads** permission for the extension — reload it from `chrome://extensions` to pick it up.
- Added a small hint under the Task Links "+ Link" form clarifying that the same box accepts local file paths, not just URLs — this was already supported but wasn't obvious.


## v1.48.2 — Add task links from open tabs and bookmarks, revert Open Pages quick-add

- Removed the Open Pages "Add to" dropdown and the small **+** quick-add button added in v1.48.1 — that wasn't the right place for this. Open Pages is back to how it was: drag a page into a project, or click to switch to it.
- The **Task Links** dialog now has a **Browse open tabs & bookmarks** button. Click it to search your currently open browser tabs and your Chrome bookmarks side by side, then click **Add** on any result to attach it to the task instantly — no copying/pasting URLs required. You can still type or paste a link (or a local file path) into the form below it, same as before.
- Adding a link that's already on the task (same URL) is now blocked with a toast instead of creating a duplicate — this applies to both the manual form and the new browse picker.


## v1.48.1 — Quick-add from Open Pages, and local file links

- The Open Pages panel now has an **Add to** dropdown (choose a Group in the current Tab) plus a small **+** button on every open browser tab. Click + to instantly add that page as a bookmark to the selected Group — no more needing to drag it in. Dragging still works too.
- You can now paste a local file path (e.g. `C:\Users\you\Documents\file.xlsx`) into any "add a link" box — the bucket "add URL" form and the new Task Links box — and it's saved as a proper file link. Clicking it opens the file through Chrome the same way any local file:// link does; for file types Chrome can't display in the browser (like .xlsx), that means Chrome will download it rather than opening Excel directly — that part is normal Chrome behavior, not something MeshTab controls.


## v1.48.0 — Add Links to a Task

- Tasks now have a **Links** button next to Notes, wherever a task appears (task rail, Task Center, compact rows). Click it to attach one or more URLs to a task — an optional label plus the link — and reopen that panel any time to view, open, or remove them.
- This works just like the existing task Notes feature: a small dialog scoped to that one task, separate from its Details field, that you can come back to and add more to over time.


## v1.47.12 — Bookmark link cursor fix, take three: whole row is now pointer

- The earlier fixes only changed the cursor over the link's own text/icon, not the favicon square or the empty space around it — so hovering slightly off the text could still show the drag-hand cursor. The whole bookmark row (favicon, text, and the empty space between) now shows the pointer/finger cursor. I verified this in an isolated browser test against the exact row markup MeshTab renders, confirming every part of the row now computes to the pointer cursor.


## v1.47.11 — Bookmark link cursor fix, take two

- The previous attempt only covered part of the bookmark's clickable text and left gaps (top/bottom padding, trailing empty space) where the drag-hand cursor could still show through. The link area now stretches to fill its full row so the hand/finger cursor shows anywhere over it, not just directly on the text.


## v1.47.10 — Fixed the cursor when hovering a bookmark link

- Hovering directly over a bookmark's link now shows the normal pointer/finger cursor, like any link on the web. Previously it showed the drag-hand cursor (since the whole bookmark row is draggable), which didn't look like a clickable link. The rest of the row still shows the drag-hand cursor.


## v1.47.9 — Removed the "Move / nest Group" menu option

- Removed **Move / nest Group** from a Group's "⋯" menu. It only worked by dragging the menu item itself (clicking it did nothing), which wasn't discoverable and looked broken. You can still nest a Group inside another Group in the same Tab via **Edit Group → Location**; a top-level Group can still be repositioned by dragging its header.


## v1.47.8 — New Task now defaults to an allocation when the Tab has one

- Clicking **New Task** while on a Tab that has one or more allocations now automatically pre-selects an allocation for the task (instead of leaving it as "No allocation"). If the Tab has several allocations, one is picked for you automatically — you can still change it before saving.
- If the Tab has no allocations, new tasks are left unset, same as before.
- Editing an existing task is unaffected — it still shows whatever allocation was already assigned to it.


## v1.47.7 — Merged Project/Folder into one "Group", added custom colors, taller bookmark rows

- Removed the Project vs. Folder distinction entirely — it wasn't meaningful, since both worked identically. The "Create a project or folder" dialog is now just "Create a Group," and the **Type** dropdown is gone; you now only set Name, Location, and Color.
- Removed the small "P"/"F" badge that used to sit on every Group's header (and the "PROJECT"/"FOLDER" label on Archive cards) — it showed the now-removed distinction and served no purpose.
- Added a **custom color** option to the Group color picker. Click the new swatch (next to Violet/Blue/Green/Orange/Rose) to open your browser's color picker and choose any color you like.
- Made each bookmark row in a Group slightly taller, so the clickable area for opening a link is a bit more forgiving.

Existing Groups keep working exactly as before — this only changes how you create/edit them and how they're labeled.


## v1.47.6 — Removed the unresponsive drag-grip icon on top-level Groups

- Removed the small ":: " grip icon that sat to the left of a Group's name. On a regular (top-level) Group it never did anything when clicked — you can still drag the Group to reposition it by grabbing its header/title, same as before. The icon is kept only on nested Groups, where it's still needed to move or re-nest them.


## v1.47.5 — Fixed: Bookmarks button opened "New Group" instead of the bookmark browser

- Clicking **Bookmarks** in the Open Pages panel now always opens the Chrome bookmark browser, even if the current Tab has no Groups yet. Previously, if the Tab you were viewing had zero Groups, it skipped straight to "New Group" instead of letting you browse.
- You can still search and browse freely with no Groups. If you try to actually add a bookmark to a project at that point, MeshTab now asks you to create a Group first (since a bookmark still needs somewhere to live) instead of blocking you from browsing in the first place.


## v1.47.4 — Calendar Tab's gear menu: Rename, Calendar Settings, Delete

- On a Calendar Tab, the gear menu now shows **Rename**, **Calendar Settings**, and **Delete** — no **Archive**, since Calendar Tabs can't be archived. (A regular Tab's gear menu is unchanged: Rename, Archive, Delete.)
- Removed the standalone **Calendar settings** button from the row next to the calendar — that row now just has **Open in Google Calendar**, with Calendar Settings living in the gear menu instead.


## v1.47.3 — Fixed the Calendar Tab still needing a scroll to see the bottom

- The calendar's height was set to never shrink below a fixed floor (620px, or 540px as a fallback), which was taller than the actual space left on screen on most monitors — so the page still scrolled. The floor is now much smaller (just a safety net for a tiny window) and the calendar's height is calculated from your actual screen height minus MeshTab's own header/toolbar rows, so it now fits without scrolling on a normal-sized window.


## v1.47.2 — Calendar Tab now fills the screen

- Removed the "GOOGLE CALENDAR" bar that used to sit above the embedded calendar. The **Calendar settings** and **Open in Google Calendar** buttons moved up next to (and in front of) the gear button.
- On a Calendar Tab, the Groups/meshed links/meshed notes/open tasks/allocated time/Chrome bookmarks stats and the row below it are hidden — those don't apply to a calendar — and Calendar settings/Open in Google Calendar/the gear button now sit where the stats used to be, so everything moves up.
- The calendar itself now fills the available screen instead of needing to scroll to see the whole thing.


## v1.47.1 — Quick Links row, Bookmarks button, + button reordered

- Added a **Quick Links** row directly below the Tab strip, with buttons for General Notes, Tasks, Reminders, Allocations, Overlays, and Archive. It always shows while you're already on one of those screens (so you can jump straight between them); a new **Settings → Show features → SHOW Quick Links** toggle (off by default) also shows it while you're on a regular Tab.
- **Browse bookmarks** is no longer a small pencil icon — it's now a full **Bookmarks** button sitting directly above your open Chrome tabs in the Open Pages panel.
- The **+Group/Note/Task** button is now just **+**, and it's swapped to sit before the gear button (so the order is **+** then gear).


## v1.47.0 — Layout cleanup: combined menus, a Home hub, and inline renaming

- **Import / Export** moved out of the top command row and into **Settings → Backup**.
- **+ Tab** and **+ Calendar** are now one **+** button next to the Tab strip. Click it to choose **New Tab** or **New Calendar Tab**.
- The standalone **Rename** button is gone. Double-click any Tab's label in the Tab strip to rename it right there — type the new name and press Enter (or click away) to save, Escape to cancel.
- **Browse bookmarks** moved into the **Open Pages** rail — it's now the pencil icon button next to the refresh/collapse controls at the top of that panel.
- **+Group**, **+Note**, and **+Task** are now one **+Group/Note/Task** button. Click it to choose which one to create.
- Added a permanent **Home** tab (the house icon), always first in the Tab strip. Click it to open a hub screen with cards for General Notes, Tasks, Reminders, Allocations, Overlays, and Archive — click any card to jump straight to that screen. This replaces the old row of individual utility-view buttons.
- **Archive Tab** and **Delete** are gone from the row. In their place is a single gear button next to +Group/Note/Task — click it for **Rename**, **Archive**, or **Delete**, all acting on the Tab you're currently viewing.


## v1.46.9 — "Use MeshTab for New Tabs" now defaults OFF, and fixed a bug that broke "Open MeshTab"

- The **Use MeshTab for New Tabs** setting (Settings → New Tab / Home screen) now defaults to **off** on a fresh install, instead of being forced on. New Chrome tabs go to Chrome's normal New Tab page unless you turn this on yourself. If you already have it saved as on from an earlier version, your choice is kept as-is — flip it off in Settings if you want the new default.
- Fixed a real bug this exposed: with the setting off, clicking **Open MeshTab** from the extension's popup (or opening MeshTab from a Task, Reminder, or Website Overlay link, or a pinned startup tab) would get bounced straight to Chrome's built-in New Tab page instead of opening MeshTab — because the same "send this to Chrome's Home screen" check ran on every load of the page, not just organic new-tab opens. Every deliberate way of opening MeshTab now always opens MeshTab, regardless of this setting; only a plain, un-requested new tab respects it.


## v1.46.8 — Tab stats hidden outside a Tab

- The stats row (**Groups**, **meshed links**, **meshed notes**, **open tasks**, **allocated time**, **Chrome bookmarks**) now only shows while you're viewing an actual Tab, same as the Archive Tab/Delete/+Group/+Note/+Task row. It's hidden on General Notes, Tasks, Reminders, Allocations, Overlays, and the Archive screen, since those counts describe a specific Tab and don't apply there.


## v1.46.7 — Tab-only controls and Open Pages hidden outside a Tab

- **Archive Tab**, **Delete**, **+Group**, **+Note**, and **+Task** now only show up while you're viewing an actual Tab. Switch to General Notes, Tasks, Reminders, Allocations, Overlays, or the Archive screen and that row disappears — those buttons don't apply there.
- The **Open Pages** rail (your open Chrome tabs) is now hidden on those same screens too, so General Notes, Reminders, and Overlays get the same clean full-width treatment Tasks, Allocations, and Archive already had.
- Also fixed a bug from a couple of versions back where a couple of these show/hide toggles were setting the HTML `hidden` attribute on elements that had their own `display: flex` style — which silently overrode it and kept them visible. They now use the same hide mechanism as the rest of MeshTab.


## v1.46.6 — Reset moved into Settings, Delete moved next to Archive Tab

- The **Reset** button is no longer sitting loose next to Settings — it's now inside the Settings dialog, under a new "Maintenance" section, labeled "Reset MeshTab layout".
- The **Delete** Tab button moved out of the Rename row and now sits right next to the **Archive Tab** button at the far left of the Groups row. Rename stays where it was.


## v1.46.5 — Archive Tab button repositioned and italicized

- The **Archive Tab** button now sits at the far left of its row, separated from +Group/+Note/+Task which stay grouped on the right.
- Its label is now italicized to set it apart from the creation buttons next to it.


## v1.46.4 — Export Tab folded into Export, with a picker

- Removed the standalone **Export Tab** button. The **Export** button now opens a picker instead of downloading immediately: choose **Everything** for a full MeshTab backup, or **Selected Tabs only** to check off exactly the Tab(s) you want (with a Select all / Clear all shortcut). Exporting selected Tabs produces the same lightweight per-Tab JSON as before — just for as many Tabs as you pick at once, in one file.
- The existing Import button already supports files exported this way, whether they contain one Tab or several.


## v1.46.3 — Archive Tab now actually archives the Tab, plus Reactivate

- The **Archive Tab** button (top of every Tab, next to +Group/+Note/+Task) now does what its name says: it archives the Tab you're viewing — moving it out of your Tab strip — instead of just opening the Archive screen. Its groups, notes, tasks, and settings are kept intact; MeshTab always keeps at least one active Tab, so the button disables itself if yours is the last one.
- The **Archive** screen (in the top utility row) now has two sections: **Archived Tabs** and **Archived Groups**. Each archived Tab card has a **Reactivate** button that brings it back to your Tab strip exactly as it was, and a **Delete** button to permanently remove it (Chrome bookmarks are kept either way).
- Archived Tabs no longer appear as destinations when creating a note or picking your startup Tab, so you won't accidentally file something into a Tab you can't currently see.


## v1.46.2 — Fixed a squashed layout in the Closed tasks group

- Fixed a bug in the inline Tab Tasks panel (the expanded WORKING/ONGOING/TO DO/CLOSED view) where each row in the **CLOSED** group rendered a stray "null" and broke the row layout, pushing the action buttons out of place. Closed task rows now line up the same as every other group.


## v1.46.1 — Archive button on every Tab, single-Tab export, and a dead dropzone removed

- Added an **Archive** button next to +Group/+Note/+Task at the top of every Tab, so archived Groups are reachable without hunting through the top nav row (the "Archive" entry is still there too).
- Removed the "Drop a group here to place it directly on this Tab" dropzone above the Groups area — it wasn't functioning reliably and is gone now, HTML, styling, and all.
- Added an **Export Tab** button next to Rename/Delete. It exports just the active Tab — its Groups, links, Tab Notes, Tasks, Allocations, linked Reminders, and MeshTab Link overlays — as its own small JSON file, instead of a full MeshTab backup.
- The existing **Import** button already supports single-Tab files like this one — pick "Import" and choose which pieces (Groups, Notes, Tasks, etc.) to bring in, same as any backup; MeshTab will create a new Tab (or merge into a same-named one) from just that file.


## v1.46.0 — Icon color, custom icons, and opacity for MeshTab Link overlays

- MeshTab Link overlays now have an **Icon color** picker that recolors the floating badge's icon (and the link panel's header icon), wherever the built-in icon is used.
- A new **Custom icon** upload lets you replace the built-in icon with your own image, on the badge and the panel header alike; a **Remove custom icon** button reverts to the built-in icon. While a custom icon is set, the icon color picker is disabled since it only affects the built-in icon.
- An **Overlay opacity** slider (10–100%) fades the floating badge to blend more with the page behind it. The link panel itself always opens fully visible so links stay easy to read.


## v1.45.7 — Group-by-day view in the individual Allocation Time Log

- An individual allocation's own Time Log (opened from that allocation's card) now has the same **Group by** dropdown as the all-allocations Time Log — Running record, Task, or Day — plus **Also split by day** (when grouped by Task) or **Also split by task** (when grouped by Day), **Combine descriptions** with a character **Limit**, and a toggleable bar chart.


## v1.45.6 — Archive a Group, and drop the redundant day summary

- Removed the whole-day combined-description box from the Time Log when grouped by Day — it duplicated the per-project/per-task descriptions shown right below it. **Combine descriptions** now only applies to the day/project/task breakdown rows themselves.
- Every Group's **⋯** menu now has an **Archive Group** action. Archiving sends the Group (and anything nested inside it) out of its Tab and into a new **Archive** section in the top nav, without touching your Chrome bookmarks or any of the Group's settings.
- The Archive section lists every archived Group with its Tab, kind, and link count, and lets you **Restore** it back to its original Tab at any time, or **Delete** it permanently.


## v1.45.5 — Split a day by project, plus a whole-day summary

- When the Time Log is grouped by **Day**, a new **Also split by project** checkbox appears (matching the existing **Also split by day** checkbox for Task/Project grouping). Turning it on breaks each day's total down into its individual projects/allocations, so you can see exactly which project the time that day went to, not just a task-by-task list.
- **Combine descriptions** now also gives you a whole-day summary: with Group by set to Day, checking it rolls every entry from that day — across every task and project — into one combined description for the day, in addition to (and independent of) the per-project descriptions shown when Also split by project is on.


## v1.45.4 — Combined descriptions in the Time Log

- Whenever a Day dimension is in view — grouped by Day, or grouped by Task/Project with **Also split by day** turned on — a new **Combine descriptions** checkbox appears. Turning it on rolls up every time entry's work details for that day into a single read-only text box under the day, separated by bullets, instead of showing them one entry at a time.
- A **Limit** field next to it (default 500 characters) truncates each combined description box to that many characters, adding an ellipsis if it was cut off, so a busy day's notes stay a manageable size.


## v1.45.3 — Group by day in the Time Log

- The Time Log's grouping controls are now a **Group by** dropdown — Running record, Task, Project / Allocation, or Day — replacing the old three-button toggle. Grouping by Day collapses every entry in the period into one row per calendar day, most recent first.
- When grouped by Task or by Project / Allocation, an **Also split by day** checkbox appears. Turning it on nests a day-by-day breakdown inside each Task or allocation's row, so you can see time-per-day within time-per-project (or time-per-task) at the same time, instead of only one dimension at a time.
- The bar chart above the totals still tracks whatever the top-level Group by selection is (Task, Allocation, or Day) and stays toggleable with **Show chart**, independent of whether day-splitting is turned on.


## v1.45.2 — Unframed Allocation Center header

- Removed the boxed card styling (border, background, padding) from the "Allocations / Allocation Center / All Project, Job, Ticket, and Bucket allocations in one place." header at the top of the Allocation Center screen — it's now plain text sitting directly on the page, matching the look of other section headers. The "All allocations" list header further down keeps its card styling.


## v1.45.1 — Group, chart, and reposition the Time Log

- The **Time Log** dialog now has a **Running record / By Task / By Allocation** toggle. Running record is the original flat, chronologically-sorted list of every entry. By Task and By Allocation collapse the same entries into totals — how much time was spent on each Task, or each allocation — sorted highest first, with a percent-of-period and entry count for each.
- Grouped views add a horizontal bar chart above the totals, one bar per Task or allocation, sized relative to the largest total. A **Show chart** checkbox (next to the view toggle, only shown in a grouped view) hides or shows it without losing the numbers underneath.
- Moved the **Time Log** button on the Allocation Center screen: it now sits below the row of 6 summary cards (This week, This month, and the four allocation types) instead of next to + Allocation up top.


## v1.45.0 — All time entries view

- The Allocation Center screen now has a **Time Log** button next to **+ Allocation** that opens every logged Task Time entry across all Tasks — allocated or not — for a chosen time period, not just one allocation's usage. The same button is available in Task Center's collapsible Allocations section.
- Time frame choices: This week, Last week, This month, Last month, This quarter, Last quarter, This year, Last year, All time, or a Custom date range.
- Each row shows the date/time it was logged, the Task, the Task's allocation (or "Unassigned"), the duration, and the work details you entered, sorted most recent first, with a running total for the selected period.
- This is a read-only view; edit or remove a time entry from the Task's own Time history the way you already do.


## v1.44.3 — Task Timer overlay styling + arbitrary decimal hours

- The on-page Work Clock overlay (the small floating badge shown while you're on the MeshTab New Tab page itself, as opposed to the version injected into other websites) now also turns purple and shows the linked Task's name when the running clock is tied to a Task, matching the website overlay. Previously it always looked like the plain, untied clock, which made a Task Timer look like it hadn't started even when it had.
- The Task row's **▶ Start Timer** / **■ Stop Timer** button is unchanged and still there — starting a timer from it opens/updates this overlay immediately, wherever you're looking at MeshTab, so you can Pause/Resume or Stop right from the floating badge; stopping opens the "Task Time" Work details dialog to note what you did, same as before.
- Starting the plain (task-less) Work Clock while a timer — linked or not — is already running now shows a toast explaining why, instead of silently doing nothing; this matches the guard Task Timer already had, so it's consistent from either direction that only one clock can run at a time.
- Fixed logging task time with a decimal like 1.18 hours getting rejected or silently rounded to the nearest quarter-hour (e.g. 1.25). The Custom amount, final-time, and Allocation hours fields now accept any decimal value.


## v1.44.2 — Fix squashed buttons in Task Center's Closed section

- Task rows in the Closed section of Task Center (the section listing completed tasks) had their action buttons (+ Time, Time history, Notes, + Reminder, Reopen, View/Edit) collapse into a squashed, mostly-hidden vertical strip instead of laying out normally. This came from two different stylesheet rules disagreeing about how many grid columns a completed task row has, which left the buttons placed in whichever narrow column won that conflict.
- Buttons on completed task rows now always span the row's full width on their own line below the title, the same robust layout approach already used for open task rows — this no longer depends on the two rules agreeing with each other.
- Purely a visual fix; no data, settings, or schema changes.


## v1.44.1 — Task Timer is the Work Clock

- The Task Timer introduced in v1.44.0 is not a second timer — it is the same single Work Clock, optionally linked to a Task when it's started. Only one clock can ever be running at a time, whether or not it's linked, so starting a timer on a Task while the Work Clock (linked or unlinked) is already running now asks you to stop the current one first instead of silently doing nothing.
- Starting a timer from a Task's **▶ Start Timer** button now automatically turns on the Work Clock overlay (requesting website access the first time, same as before) — this fixes a v1.44.0 bug where the overlay never appeared because it required a separate, easy-to-miss Settings toggle. There's now only one overlay switch, under **Settings → Work Clock**.
- The floating overlay — on other websites and the in-page bar at the top of Task Center — is the same Work Clock overlay whether or not it's linked. When linked to a Task, it turns purple and shows the Task's name alongside the elapsed time, with the same Pause/Resume and Stop controls the plain Work Clock has always had; unlinked, it looks and behaves exactly as before.
- Clicking **■ Stop Timer** (Task row, Task Center bar, or overlay) stops the clock; if it was linked to a Task, this opens the existing "Task Time" Work details dialog prefilled with the elapsed duration, and saving it creates a normal Task Time entry, same as v1.44.0. Stopping an unlinked clock logs a plain Work Clock session as it always has.
- Canceling the Work details dialog discards that run's unsaved elapsed time; it does not delete anything already logged.
- The Task Center bar and the toolbar Work Clock button both reflect the single running clock regardless of link status, so it's always visible that a timer is running and you can't start a second one.
- The separate v1.44.0 `task-timer-overlay.js` content script and its own Settings toggle are removed; anyone who already had that overlay registered gets it automatically cleaned up.
- Export/import schema stays at **v24** (added in v1.44.0 for the clock's Task-link fields); v1.44.0's local-only run state — not included in export/import — is unchanged. All v1.43.0 Work Clock offset and earlier functionality is retained.


## v1.43.0 — Work Clock start offset

- The Work Clock can now start with a positive time offset for work that began before the timer was started.
- The main Work Clock dialog includes a **Start offset** field in minutes; for example, entering 15 starts the clock at 15 minutes instead of zero.
- MeshTab Link popouts also provide an offset-minutes field beside **Start Clock**.
- Offset time is represented by the session's effective start time, so Pause/Resume, floating-clock elapsed time, completed Actual time, history, and export/import all include it automatically.
- Start offsets are limited to 0–1440 minutes and reset to zero after starting from the main Work Clock dialog.
- Schema remains v23 because no new persisted field is required.
- All v1.42.0 Pause/Resume functionality and earlier features are retained.


## v1.42.0 — Work Clock pause / resume

- Active Work Clock sessions can now be **paused** and **resumed** without creating a separate completed timer.
- Paused time is excluded from Actual time, including across multiple pause/resume cycles in the same session.
- The MeshTab Work Clock dialog and floating website clock both expose Pause/Resume while a timer is active; Stop remains available while running or paused.
- A paused floating clock stays visible, shows a paused state, remains freely draggable, and resumes from the same saved position.
- MeshTab Link popouts show when the clock is paused and provide a Resume Clock action.
- Export/import advances to schema **v23** so a running clock's paused state and accumulated paused duration are retained.
- All v1.41.0 allocation visibility improvements and earlier functionality are retained.

## v1.41.0 — Allocation remaining visibility

- Tab Allocation rows now place **REMAINING** directly beside **CONSUMED** in the center metrics block.
- Remaining time uses MeshTab purple and bold typography for faster scanning.
- Unlimited allocations display **OPEN** and over-consumed allocations display **OVER** with the exceeded duration.
- All v1.40.0 task status and allocation consumption functionality is retained.

## v1.40.0 — Allocation consumption prominence + Ongoing Task status

- Tab Allocation rows now show **CONSUMED** time prominently in the middle of each allocation row with larger, bold time text.
- Tasks now support four visible statuses: **To Do**, **Working**, **Ongoing**, and **Closed**.
- Existing Working tasks migrate to Working; other existing open tasks migrate to To Do.
- Ongoing is intended for recurring meetings, continuing assistance, and other long-running responsibilities that are active but not the immediate task being worked.
- Task Center separates Working, Ongoing, To Do, and Closed work.
- Each project/Tab Task section groups tasks under WORKING, ONGOING, TO DO, and CLOSED.
- Task rows and MeshTab Link task entries display the new status labels.
- Export/import schema advances to v22 so Ongoing status is retained.

## v1.39.0 — Work Clock history cleanup

- Add **Clear all** controls for completed Work Clock sessions.
- Add per-session **Clear** actions so individual timer entries can be removed without clearing the rest.
- Clearing completed history does not stop or delete a currently running timer.
- Confirmation prompts protect against accidental history deletion.
- All v1.38.0 overlay layout fixes and earlier functionality are retained.

## v1.38.0 — Overlay website-field layout fix

- Makes the **Website domain or page** field span the full available editor width in both Visual and MeshTab Link overlay dialogs.
- Uses an actual 80/20 split inside that full-width row: roughly 80% for the website text box and 20% for **Use recent page**.
- Constrains the recent-page button so its label stays inside the button instead of overflowing.
- Replaces Salesforce-specific new-overlay defaults and placeholders with neutral website examples such as **example.com**.

## v1.37.0 — Open MeshTab from Link overlays

- MeshTab Link overlay popouts now include an **Open MeshTab** action in the header.
- If any MeshTab tab is already open, the action focuses that tab (preferring one in the current window).
- If MeshTab is not open, the action opens MeshTab in a new browser tab next to the current page.
- Existing overlay links, Tasks, Work Clock controls, targeting, docking, and drag behavior are unchanged.

## v1.36.0 — Overlay website field layout
- Rebalances the **Website domain or page** row in both Visual and MeshTab Link overlay editors so the website field uses approximately 80% of the row and **Use recent page** uses approximately 20%.
- Targeting behavior is unchanged from v1.35.0.


## v1.35.0 — Global overlays and MeshTab Link click fix
- Adds an explicit **Show overlay on** choice to both Visual and MeshTab Link overlays: **Website domain / page** or **All websites in Chrome**. Global overlays appear on every normal HTTP/HTTPS page where MeshTab website access is enabled; Chrome internal pages remain protected by Chrome and cannot host extension overlays.
- Domain/page targeting keeps the existing automatic behavior: a bare domain applies to all pages on that domain, while a URL containing a path, query, or hash targets that specific page; **Also show on subdomains** remains available for website-targeted overlays.
- Fixes the MeshTab Link badge click regression by separating click from drag activation. A normal click now opens/closes the MeshTab Link popout without first entering the transformed drag path; dragging begins only after real pointer movement.
- Moves the MeshTab Link popout into its own untransformed viewport layer so it stays upright, visible, and clickable even when the badge itself is rotated on a side or diagonal corner.
- Export/import advances to schema **v21** to retain the new global-overlay targeting mode. Existing v20 overlays continue as website-targeted overlays.

## v1.34.0 — Simplified overlay targeting and Link-popout Work Clock
- Removes the redundant **Page scope** dropdown and **Specific page URL** field from both Visual and MeshTab Link overlay editors. The single **Website domain or page** field now determines scope automatically: a domain targets all pages on that site, while a URL containing a path, query, or hash targets only that page.
- Keeps **Also show on subdomains**. When enabled, the selected all-pages or exact-page rule also applies to matching subdomains. Existing saved specific-page overlays migrate into the single Website field when edited.
- Adds **Start Clock** to the bottom of each MeshTab Link popout. Starting there enables the running-clock overlay and places it at the bottom by default unless the user has already saved a custom dragged position.
- The floating Work Clock no longer appears while stopped and no longer contains Start. While running it shows elapsed time plus **Stop**; pressing Stop ends the session and immediately makes the floating clock disappear.
- The running clock remains freely draggable, and its custom proportional position continues to persist. Existing MeshTab Work Clock history and the main Work Clock dialog remain available.
- No export/import schema change is required; existing schema v20 page targeting and clock-position fields are retained.

## v1.33.0 — Diagonal corner bridges and rotated side overlays
- Reworks optional corner docking so a corner overlay no longer pivots outward from the exact browser corner. Instead, the rotated overlay sits fully inside the viewport and spans diagonally between the horizontal edge and the adjacent side edge, creating a clean corner bridge.
- Bottom-left and bottom-right corner overlays run diagonally from the bottom edge into the side edge; top corners use the same bridge behavior between the top and side edges.
- Overlays docked on the left or right side now rotate 90 degrees. The overlay's original bottom edge always faces and sits flush against the browser side edge.
- Half Rounded, Half Pill, and Half Oval overlays keep their flat/borderless side facing the viewport edge after side rotation. At corners, their flat side faces the corner wedge.
- Dragging a rotated side or corner overlay temporarily returns it to its normal orientation for predictable repositioning, then reapplies the correct edge/corner rotation after drop.
- No export/import schema change is required; existing v20 overlay position and corner-docking data continues to work.


## v1.32.0 — Page-scoped overlays, overlay Tasks, and draggable Work Clock
- Visual and MeshTab Link overlays can target **all pages on a domain** or one **specific full page URL**. Specific-page overlays also follow SPA-style URL changes without requiring a reload.
- MeshTab Link panels now include open **Tasks** assigned to the selected MeshTab Tab. Working status, priority, and due date are shown when available.
- Clicking an overlay Task always opens a **new MeshTab browser tab**, switches to Task Center, scrolls to the task, and highlights it for interaction.
- The Work Clock overlay now remains available while stopped and has direct **Start / Stop** controls on both MeshTab and normal websites.
- Click-hold-drag the Work Clock overlay to place it freely anywhere in the viewport. The custom position is saved proportionally so it adapts to different browser sizes; Settings shows this as **Custom (dragged)**.
- Export/import advances to schema **v20** for page scope and the new clock placement settings while retaining v1.31.0 behavior.

## v1.31.0 — Overlay edge shapes and opt-in corner docking
- Corner docking is now a **per-overlay option**. Overlays stay intact at the edge/corner unless **Allow corner docking** is enabled in that overlay.
- Corner-docked visual labels now size themselves around their text and pivot into the corner from the viewport edge so label text remains visible instead of being heavily clipped.
- Removes the Circle overlay shape. Existing/imported Circle overlays migrate forward as Pill overlays.
- Adds **Half Rounded**, **Half Pill**, and **Half Oval** visual shapes. Their page-facing side is flat and the touching border is removed so they read as edge tabs.
- Website overlays now sit directly against their selected browser edge with no 8 px page gap. Dragging and saved edge positions use the full viewport edge.
- MeshTab Link overlays also gain the optional **Allow corner docking** control; when disabled, their badge remains intact at the edge.
- Export/import advances to schema **v19** to preserve the new corner-docking choice while retaining older overlay data.

## v1.30.0 — MeshTab Link overlays
- Website Overlays can now be created as **MeshTab Link overlays** in addition to visual labels.
- A MeshTab Link overlay shows a compact MeshTab four-square badge on the matching website. Click it to open a small quick-link panel populated live from the Groups and Chrome bookmarks in a selected MeshTab Tab.
- Nested Groups stay distinguishable in the quick-link panel, and bookmark placement labels are respected.
- Each MeshTab Link overlay can open links in the **same tab**, a **new tab**, or a **new window**.
- The badge uses the same draggable edge/corner positioning as visual overlays.
- Export/import advances to schema **v18** so link-overlay type, selected MeshTab Tab, open behavior, and position are retained.


## v1.29.2 — Compact Overlay editor + corner docking

- Reworks the Add/Edit Website Overlay dialog into a compact, viewport-aware layout so the full editor and Save/Cancel actions fit without scrolling the whole popup.
- Overlay name/domain are arranged side-by-side on normal desktop widths, enable/subdomain switches share a compact row, and style/size controls use a denser four-column grid. Explanatory helper text and the preview collapse at very small window sizes instead of forcing a dialog scrollbar.
- Website overlays can now be dragged into any browser corner. Dropping near a corner stores an exact corner position instead of leaving the normal 8 px edge gap.
- Corner-docked overlays intentionally sit partly outside the viewport so the browser clips the shape into a compact corner badge. Rectangle/Rounded/Pill overlays angle into the corner for a wedge-like clipped appearance; Circle overlays become a clipped circular corner marker.
- Dragging a corner-docked overlay back out returns it to the normal edge-bound overlay behavior. Existing overlay definitions and schema v17 data remain compatible.


## v1.29.1 — Website Overlays workspace layout fix

- Fixes the Website Overlays manager being constrained to the first column of the 12-column content grid.
- The Overlays manager now spans the full center content area, like the other utility workspaces.
- Open Pages remains on the left and Mesh Tasks remains on the right while managing Overlays; only the center workspace is used for the Overlays manager.
- Existing Website Overlay definitions, positions, styles, schema v17 data, and all v1.29.0 behavior are retained.


## v1.29.0 — Website Overlays

- Adds **Overlays** to the second-row utility views, with its visibility controlled by **Settings → Show features → SHOW Overlays**.
- Adds a global **Enable website overlays** Settings switch. Website access remains optional and is requested only when website overlays or the Work Clock website overlay are enabled.
- Create named, domain-specific overlays such as **Website Overlay**. Each overlay can target an exact domain or optionally include subdomains.
- Each overlay has configurable text color, background color, font family, font size, width, height, and shape (Rectangle, Rounded, Pill, or Circle).
- Overlays stay bound to a browser-window edge. Drag one anywhere and release it; it snaps to the nearest edge and MeshTab remembers both the edge and the position along that edge for future visits.
- Overlay definitions can be enabled/paused individually without deleting them.
- Adds a full-width **Website Overlays** manager with visual previews, matching-domain details, status, Edit, Pause/Enable, and Delete controls.
- Export/import advances to **schema v17** and Website Overlays are independently selectable in the Select What to Import screen.
- All v1.28.3 Work Clock behavior, Calendar Tabs, Allocation Center, Tasks, Reminders, Notes, and Mesh layout behavior are retained.

## v1.28.3 — Individual Work Clock session details

- Clicking a completed Work Clock session now opens that exact session instead of an aggregate of recent clocks.
- Session Details shows the selected session's date, start time, stop time, actual duration, rounded 1/2-hour value, and rounded hour value.
- Recent Sessions is now a history list only; aggregate/summed Work Clock totals were removed from this view.
- Clicking Recent Sessions opens the history list, and clicking any row from either screen opens only that session.
- Schema remains v16; all v1.28.2 behavior is retained.



## v1.28.2 — Correct Work Clock rounding totals

- Work Clock rounding now calculates directly from raw actual seconds using fixed 30-minute and 60-minute billing blocks.
- Recent Session Summary adds all actual session time first and rounds the combined total once, instead of rounding every short session separately and then summing inflated values.
- Day-by-day summary rows use the same aggregate-then-round behavior. For example, **45m 25s → 1h Rounded ½ Hour and 1h Rounded Hour**.

## v1.28.1 — Safe clickable Work Clock overlay

- Clicking the running timer overlay now **stops the Work Clock and closes the overlay**.
- Overlay clicks are captured by MeshTab instead of passing through to page controls underneath, preventing accidental actions such as Allocation deletion.
- The same stop-only behavior works on MeshTab and on normal HTTP/HTTPS pages when the optional overlay is enabled.

## v1.28.0 — Work Clock live display, billing rounding, session summary, overlay

- While Work Clock is running, the top command-row stopwatch now shows the live elapsed time beside the ⏱ icon.
- Rounded Work Clock values now round **up** to the next billing block: the ½-hour value uses 30-minute blocks (29 min → 30 min, 31 min → 1h), and the hour value uses the same upward-block rule.
- Recent Work Clock sessions are clickable. A Recent Session Summary dialog shows session count, total actual time, total ½-hour-rounded time, total hour-rounded time, and a date-by-date summary for the 30 most recent sessions.
- Settings adds **Show running timer overlay** and an **Overlay position** selector (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right).
- When enabled, the overlay appears on MeshTab and normal HTTP/HTTPS web pages while the timer is running. Website access is requested as an optional Chrome permission only when the user enables the feature.
- Existing schema v16 Work Clock history remains compatible.

## v1.27.1 — Allocation summary units + compact Work Clock

- Allocation Center summary cards now honor **Settings → Default time unit**. Hours displays summary totals in hours (including `0h` and decimal hours such as `0.5h`); Minutes displays the same totals in minutes.
- The Work Clock launcher is now a compact **stopwatch icon (⏱)** instead of the words “Work Clock”. While running, its tooltip/accessible label includes the live elapsed time.
- The Work Clock dialog is now viewport-aware and vertically compact. Start/Stop and the three clock readouts remain visible without scrolling the whole dialog; recent-session history uses the remaining internal space and scrolls independently when needed.

## v1.27.0 — Layout, Tab presentation, time-unit settings, Calendar sizing

- Allocation Center now uses the full MeshTab workspace width.
- Calendar Tabs use the full workspace width and the embedded calendar fills the available area.
- Calendar Tabs are styled light blue so they are visually distinct from normal workspace Tabs.
- The Calendar setup dialog is viewport-aware and compact enough to fit without unnecessary page scrolling.
- Primary Tabs are visually stronger than the utility row; utility buttons use slimmer square frames.
- Settings adds adjustable Tab font size and Tab spacing.
- Settings adds a default Task/Allocation time-entry unit (Hours by default, or Minutes). Allocation budget entry now supports the selected unit while preserving normalized stored hours.


- Note headers now use the same always-on three-dot top-layer action menu as Groups, preventing action clipping.
- General Notes, Tasks, Reminders, and Allocations use larger square-framed utility buttons.
- Adds a dedicated Allocation Center with all allocations plus This Week, This Month, and Project/Job/Ticket/Bucket rollups.
- Adds a persistent Work Clock with Start/Stop, actual elapsed time, nearest-half-hour rounding, nearest-hour rounding, and recent session history.
- Adds Google Calendar Tabs. Use + Calendar and paste a Google Calendar embed URL, embed code, or Calendar ID; Calendar Tabs render the supported Google Calendar embed inside MeshTab.
- Export/import schema advances to **v16** to preserve Calendar Tab configuration and Work Clock state/history.



## v1.25.3 — Always-on Group action menu

- Group headers now always show a single **three-dot (⋯) actions menu** instead of switching between a row of buttons and an overflow menu at different widths.
- The Group name remains the highest-priority header content at every width.
- The actions menu is now a browser top-layer popover, so it can extend beyond the Group frame without being clipped by the Group's internal overflow/scroll area.
- The menu keeps all existing Group actions: Move / nest Group, Add bookmark, Add nested Group, Link columns, Full/Restore width, Edit Group, and Delete Group.
- No storage migration is required; schema v15 remains current.


## v1.25.2 — Pin-aware bookmark opening

- Saved MeshTab bookmark clicks still search all Chrome windows first and focus an existing matching URL when one is already open.
- When the current MeshTab tab is **not pinned** and the bookmark is not already open, the bookmark opens in that same tab.
- When the current MeshTab tab **is pinned** and the bookmark is not already open, MeshTab preserves the pinned workspace and opens the bookmark in a new tab.
- No storage migration is required; schema v15 remains current.

## v1.25.1 — Mesh layout persistence fix

- Fixes top-level Group positions/sizes shifting after Chrome is fully closed and reopened.
- Saved Mesh X/Y/width/height is now treated as authoritative on startup instead of being reflowed because the left/right rails have not finished restoring yet.
- The saved Open Pages and Mesh Tasks rail states are applied before Mesh canvas measurements are taken.
- Reopening in a narrower window no longer rewrites an otherwise valid saved Group layout; the canvas can scroll horizontally rather than moving Groups behind the user's back.
- Adds a best-effort final layout write if Chrome closes during an active Group drag/resize gesture.
- All v1.25.0 selective import behavior and schema v15 data remain unchanged.

## v1.25.0 — Selective import

- Import now opens a **Select what to import** screen before changing MeshTab data.
- Categories include **Tabs & Groups, Saved Links, Notes, Allocations, Tasks, and Reminders**.
- Everything available in the backup is selected by default, with **Select all** and **Clear all** controls.
- Saved Links require Tabs & Groups because links need a Group destination.
- If Tabs & Groups are skipped, imported Tab Notes become General Notes and imported Tasks/Allocations are placed in General.
- Allocation assignments are preserved only when Allocations and Tasks are both selected; Reminder-to-Task links are preserved only when Tasks and Reminders are both selected.
- Import remains merge-only and never deletes existing MeshTab data.
- No storage migration is required; schema v15 remains current.







## v1.24.2 — Reminder-to-Task navigation

- Clicking a linked **Task** in Reminder Center now opens **Task Center** instead of the Task edit dialog.
- MeshTab automatically switches to the linked Task's General/Tab filter, scrolls directly to the Task, and highlights it.
- If the linked Task is already completed, Task Center automatically selects a custom completed-date range for that Task so it remains visible and can still be highlighted.
- All v1.24.1 Working controls, Quick Reminders, Allocation totals, schema v15 data, Mesh behavior, and New Tab functionality are retained.

## v1.24.0 — Allocation totals + Task Quick Reminders

- The top Tab summary now shows the current active fixed-hour Allocation total beside Open Tasks. Hover it to see active allocation count, logged time, and remaining/over time.
- Every Task now has a **+ Reminder** action in Task Center, per-Tab TASKS, and the compact right-side Mesh Tasks drawer.
- Task Quick Reminder opens the existing Reminder editor already linked to that Task, prefilled with the Task title/context. Choose one-time, daily, or selected-day scheduling and edit the reminder details before saving.
- Linked Task reminders continue to appear on the Task and in Reminder Center.
- No storage migration is required; schema v15 remains current.

## v1.23.0 — Allocation Time Log

- Adds a separate **Time Log** action to every Allocation while keeping the existing **Usage** screen.
- Allocation Time Log shows the underlying Task time entries with **date/time, Task, duration, and work details**.
- Time Log can be filtered by **allocation periods**, **this/last week**, **this/last month**, **this/last quarter**, **all allocation time**, or a **custom date range**.
- Recurring Allocations expose their historical weekly/monthly/quarterly periods directly in the Time frame selector.
- Usage and Time Log dialogs link directly to each other, and Time Log is also available from the per-Tab ALLOCATIONS block.
- No storage migration is required; existing schema v15 Task time entries are used directly.

## v1.22.1 — Allocation Header + Task Metrics UI Cleanup

- Renames **Task Details** to **Task Metrics**.
- Allocation cards now keep the allocation name, prominent budget model (for example **10 h WEEKLY**), and **ACTIVE / PAUSED** status on the same header line at normal Task Center widths.
- Removes visible expand/collapse arrow icons from **Task Metrics**, **Allocations**, and the per-Tab **ALLOCATIONS / TASKS** blocks. The headers remain clickable and still open/close normally.
- All v1.22.0 Allocation placement, right-rail Task actions, schema v15 data, borrowing, time history, Task Notes, Mesh layout, and New Tab behavior are retained.

## v1.22.0 — Allocation Groups + Right-Rail Task Actions

- Allocations can now be assigned to General or a specific MeshTab Tab through a new **Group / Tab** field.
- Normal Tab workspaces show a collapsible **ALLOCATIONS** block directly above **TASKS**, matching the existing per-Tab task workflow.
- The per-Tab allocation list shows budget model, logged time, remaining/over status, plus Usage and Edit actions.
- The compact right-side **Mesh Tasks** drawer now expands a Task when clicked and exposes **+ Time, Time, Notes, Edit, Close, and Task Center** actions.
- **Task Center** jumps to and highlights the selected Task.
- Fixed Task Center Allocation **Usage / Edit / Delete / Borrow** buttons by routing Allocation actions through the Task Center/right-rail event handler.
- Export/import advances to **schema v15** to preserve Allocation Group/Tab placement while retaining carry-over borrowing choices.
- Deleting a MeshTab Tab moves its allocations to General instead of deleting them.

## v1.21.0 — Task Details + Allocation Borrowing

- Renames **Analytics** to **Task Details** and moves the framed, collapsible section above **Working now**. Task Details remains collapsed by default.
- **Allocations** remains collapsible but now starts **expanded by default**.
- Allocation cards make the hour model (for example **10 h WEEKLY**) a centered, prominent headline using the same visual weight as the Project / Job / Ticket name.
- Logged, available/budget, remaining/over, and Task counts use larger values so allocation time is easy to read at a glance.
- Over-budget recurring allocations get a clear **OVER** callout.
- When a weekly/monthly/quarterly allocation is over, you can **Borrow from next period**. The overage is deducted from the next period's available budget while the original base allocation remains visible.
- Borrowing can be undone. Usage history shows adjusted budgets plus carry-in/carry-forward information.
- Backup/import schema advances to **v14** to preserve allocation borrowing choices.
- All v1.20.1 Task Center layout, v1.20.0 allocations, v1.19.2 time editing, Task Notes, Working state, Mesh layout, and New Tab behavior are retained.

## v1.20.1 — Task Center Focus Layout

- **Working now** is moved directly under the Task Center header and given stronger spacing, contrast, border treatment, and an active-count badge so current work is the primary focus.
- **Recommend next** remains inside Working now and is visually emphasized as the main action for choosing additional active Tasks.
- **Analytics** is now a collapsible section and starts **collapsed by default**. Open it when you want the configured metric cards; metric selection remains available through **Choose metrics**.
- **Allocations** is now a collapsible section and starts collapsed, keeping allocation management available without dominating the active-work view.
- Allocation counts and analytics-selection counts remain visible in their collapsed headers.
- All v1.20.0 allocation budgets/history, v1.19.2 Task time editing, Task Notes, Working state, Mesh layout, and New Tab behavior are retained.

## v1.20.0 — Task Allocations

- Adds **Project / Job / Ticket / Bucket allocations** inside Task Center.
- Assign any Task to an allocation; all logged time on that Task automatically rolls up to its allocation.
- Supports **Open bucket / track only**, **Total hours**, and **Recurring hours** models.
- Recurring allocations replenish **weekly, monthly, or quarterly** and show period-by-period usage history.
- Optional **Start date** and **End date** allow fixed engagement windows or open-ended allocations.
- Allocation cards show current logged time, budget, remaining/over time, assigned Task count, and the active period.
- **Usage** opens historical periods with budget, logged time, remaining/over time, and per-Task breakdowns.
- Deleting an allocation keeps every Task and time entry; only the allocation assignment is removed.
- Backup/import schema advances to **v13** to preserve allocations and Task assignments.


## v1.19.2 Editable and Backdated Task Time

- Every Time History row now has **Edit** and **Delete** actions.
- Edit can change the work date, duration, and details for an existing time entry.
- Deleting an entry immediately recalculates the Task's total logged time.
- **+ Time** now includes a **Work date** field that defaults to today's local date and can be adjusted for catch-up/backdated time.
- The optional final time entry in **Complete Task** also includes an adjustable Work date.
- Existing time entries, Task Notes, Working state, schema v12 data, Mesh layout, and New Tab behavior are retained.

## v1.19.1 Task Dialog Layout Patch

- + Time, Time History, Task Notes, and individual Task Note dialogs now use a much larger viewport-aware panel instead of the older narrow Task dialog limit.
- Dialog content scrolls inside the panel when the browser window is short, preventing clipping while keeping headers/actions accessible.
- Time History and Task Notes lists use the dialog's available height rather than being trapped inside a second small scrolling box.
- Working now has additional padding, margins, and separation around its header, help text, recommendations, and active-task list.
- All v1.19.0 Task Notes, time history, Working state, schema v12 data, and prior MeshTab functionality are retained.

## v1.19.0 Task Center Workflow

- Task Center no longer creates a horizontal scrollbar: task actions wrap within the available width and the Task workspace is constrained to the visible screen width.
- Every Task now has a **Time history** button with a clear list view showing Date, Time, Duration, and Details for each logged work session.
- Every Task now has a **Notes** button. Task Notes are separate, individually saved notes with title, full details, created/updated timestamps, a readable list preview, and a full detail editor when opened.
- Add as many Task Notes as needed; completed Tasks keep their Task Notes and time history.
- **Recommend next** now lives only inside the **Working now** section. Clicking it reveals the logical next-task choices; there is no separate recommendation launch card or right-rail recommendation button.
- Backup/import schema advances to **v12** to preserve Task Notes while retaining Working state and time-entry history. Existing `meshtabState` data is normalized forward without a reset.


## v1.18.2 Group Header Priority

- Group names are never ellipsized; the full name can wrap when a Group is narrow.
- Header actions now collapse before the Group name does.
- Medium-width Groups keep essential quick actions and move secondary controls into a **More** menu.
- Very narrow Groups show the Group name plus a compact **More** menu so every action remains available.
- The responsive menu includes move/nest, add bookmark, add nested Group, link columns, full/restore width, edit, and delete.
- Existing 20-pixel Mesh placement, adaptive slot fitting, Tasks, Notes, Reminders, and saved state remain compatible.



## v1.18.1 Adaptive Mesh Slot Fitting

- Dragging a top-level Group toward an occupied area now prefers the nearest usable Mesh slot instead of simply jumping above or below another Group.
- If the intended slot is narrower than the Group, MeshTab automatically reduces the Group width to the largest Mesh width that fits.
- If the intended slot is shorter than the Group, MeshTab automatically reduces the height to the largest Mesh height that fits.
- If both dimensions are constrained, MeshTab finds the largest non-overlapping width/height combination that fits the nearest slot.
- While dragging, the Group can temporarily shrink in a tight slot and return to its preferred size when moved back into a larger open area; the final fitted size is saved on drop.
- Manual top-level resizing uses the same adaptive collision logic so both dimensions can be reduced together when necessary.
- Groups still snap to the 20-pixel Mesh and never overlap. Existing `meshtabState` data and schema v11 remain compatible.


## v1.18.0 Snapping Group Mesh

- Top-level Groups now move on a visible **20 px Mesh** instead of unrestricted pixel placement.
- Drag a Group with the `::` handle or title/header and it snaps to the nearest Mesh position.
- Top-level Groups **cannot overlap**. If the desired position is occupied, MeshTab chooses the nearest valid open Mesh position.
- Width and height resizing also snap to the Mesh and stop before colliding with another Group.
- Full-width Groups are placed at the nearest non-overlapping Mesh row.
- Existing v1.16/v1.17 free-position layouts migrate automatically: positions and sizes are snapped and any existing overlaps are resolved to the nearest open Mesh location.
- The `↗` structural drag control still moves/nests Groups across Tabs and Groups. Nested Groups retain their existing internal layout.
- MeshTab continues as a single **New Tab Edition** release; there is no separate Standard Edition.
- Existing `meshtabState` data and export schema v11 remain compatible; no storage reset is introduced.

## v1.17.0 Working tasks + incremental time

- Mark any number of open Tasks as **Working**. Working tasks appear in a dedicated section at the top of Task Center and are prioritized in compact task lists.
- **Recommend tasks** is now an action: click it to see several logical next choices based on chosen priority, age, and due date, then mark any of those choices Working.
- Add Task time incrementally with a **+ Time** action. Quick choices include 1 hour, 30 minutes, 2 hours, 4 hours, 6 hours, and 8 hours, plus custom hours/minutes (Hours is the default).
- Each time entry stores the date/time it was logged, duration, and optional work details.
- Completing a Task shows the full time-entry history and total, and optionally lets you add a final time entry before closing.
- Reopening a Task keeps all time history. Existing task analytics continue to total the combined logged time.
- Backup/import schema advances to **v11** to preserve Working state and time-entry history.

## v1.16.0 Free-position Group canvas
- Top-level Groups on each MeshTab Tab now use a free-position canvas instead of row-based grid flow.
- Drag a Group's title/header area to place it at any X/Y position on the Tab. Groups can sit directly below shorter Groups even when a taller Group is beside them.
- Resize top-level Groups freely in pixels for both width and height; the old 12-column row boundary no longer controls top-level placement.
- Groups may overlap if you intentionally place them that way; the most recently moved Group is brought to the front.
- Drag the `::` handle or the Group title/header to freely position a top-level Group. A separate `↗` structural drag control keeps drag-to-another-Tab and drag-to-nest behavior available. Nested Groups continue using the compact internal grid inside their parent.
- Existing v1.15.x layouts migrate automatically to an initial free-position arrangement that resembles their prior order. New Groups are initially placed below the current canvas and can then be moved anywhere.
- Full-width, link-column, Edit/Location, Tasks, Notes, Reminders, New Tab/Home, Appearance, and Settings behavior remain retained.
- MeshTab export/import advances to schema v10 so free Group X/Y/width/height placement is preserved in backups.

## v1.15.3 Default Home Tab
- Settings > New Tab / Home screen now includes **Default Home Tab**.
- Choose **Last active Tab** or any saved MeshTab Tab.
- In the New Tab Edition, a fresh Chrome New Tab opens the selected MeshTab Tab when **Use MeshTab for New Tabs** is enabled.
- This landing choice applies only to fresh New Tab/Home-screen launches; opening an existing MeshTab, startup MeshTabs, Task Center, or Reminder Center does not force the default Tab.
- If the selected Tab is deleted, MeshTab safely falls back to **Last active Tab**.

## v1.15.1 Pinned-tab Home Screen behavior
- In the New Tab Edition, the **Home Screen** control is shown only when the current MeshTab page is **not pinned**.
- Pinning that MeshTab hides Home Screen immediately; unpinning it shows the control again while **Use MeshTab for New Tabs** remains enabled.
- Existing New Tab, Settings, Reminder, Task, Note, Appearance, and storage behavior is otherwise unchanged.

## v1.15.0 Selectable New Tab + Reminder color/Next Reminder emphasis
- The New Tab Edition now exposes **Use MeshTab for New Tabs** in Settings. When ON, new tabs open MeshTab; when OFF, the override page hands the tab to Chrome's built-in New Tab/Home screen.
- While MeshTab New Tab mode is ON, a **Home Screen** control appears in the top header between Search and the date and opens Chrome's built-in New Tab page. Turning MeshTab New Tab mode OFF hides that control.
- Chrome does not expose the exact previously controlling third-party New Tab extension to another extension, so automatic restoration is limited to Chrome's built-in New Tab page. MeshTab can return new tabs to Chrome's built-in New Tab page when its New Tab setting is turned off.
- The **Next Reminder** card now puts the scheduled date/time in the visual center using large bold type, matching the emphasis used by reminder rows.
- Reminder UI accents and **+ Reminder** now use a lighter purple family instead of mustard/yellow.
- All v1.14.0 task/reminder linking, Appearance, Settings, startup/window behavior, and storage compatibility remain retained.



## v1.14.0 Reminder emphasis + Task links

- Reminder cards now use the center of the card for the scheduled date/time with much larger bold typography, making upcoming times easier to scan.
- Reminders can optionally link to any Mesh Task from Create/Edit Reminder and from Quick Reminder in the toolbar popup.
- Linked tasks are shown directly on reminder cards and can be opened from the reminder.
- Task rows show any linked reminder(s); clicking a reminder chip opens that reminder for editing. The compact right Task drawer also shows a linked-reminder count.
- Deleting a task safely clears its reminder links without deleting the reminders.
- MeshTab export/import advances to schema v9 and preserves reminder-to-task relationships, including remapping links when a backup is merged.
- Existing `meshtabState`, Notes, Tasks, Reminders, Settings, appearance, startup behavior, and v1.13 New Tab editions remain compatible.

## v1.13.0 Appearance + New Tab editions

- Adds **Appearance** settings: Light, Dark, or System. Light remains the default for upgrades; System follows the OS/Chrome dark preference.
- Dark appearance applies to the main workspace, Notes, Tasks, Reminders, dialogs, toolbar popup, and About page.
- Chrome does not expose a runtime API that lets a multi-purpose extension safely toggle `chrome_url_overrides.newtab` or discover/restore the exact previous New Tab provider.
- The standard MeshTab build therefore continues to leave the Chrome New Tab page untouched.
- An optional **MeshTab New Tab edition** is packaged separately. That edition declares the supported `chrome_url_overrides.newtab` manifest entry so new Chrome tabs open MeshTab. To restore Chrome's current/default/previous New Tab provider, return to the standard build and reload it from the same extension folder.
- Settings show the New Tab ownership/status for the installed MeshTab build.
- No change to the `meshtabState` storage key or saved workspace schema.

## v1.12.3 Pin on Open

- Adds a separate **Pin on Open** option in MeshTab Settings. It defaults ON.
- When **Open MeshTab** must create a new MeshTab tab, the new tab is created pinned when Pin on Open is enabled.
- If the requested MeshTab already exists, Open MeshTab only focuses/reuses it. It does **not** re-pin an existing tab that the user manually unpinned.
- **Pin on Open** is independent from **Pin on start**. Startup pinning behavior remains controlled only by Pin on start.
- One MeshTab per Window / One MeshTab for All Windows behavior is unchanged.
- No `meshtabState` reset or export-schema change.

## v1.12.2 Reminder Center restoration

- Restores the Reminder Center workspace layout and visual styling from v1.11.1.
- Reminder Center again stays in the normal MeshTab workspace with Open Pages on the left and Mesh Tasks on the right (when those features are enabled).
- Removes the v1.12.x special full-width Reminder Center layout that made the view feel compressed/unusable.
- Keeps the v1.12 Settings panel, per-window/all-window MeshTab behavior, feature visibility settings, and the larger Reminder Create/Edit time control.
- The right side remains Tasks-only; there is no Mesh Reminders drawer.

## v1.12.2 Task drawer restoration

- Removed the right-side Mesh Reminders drawer introduced in v1.12.0.
- The right side is again dedicated to the single Mesh Tasks drawer.
- Reminders are opened from the thin-row **Reminders** utility button, matching the v1.11.x workflow.
- The v1.12.0 Settings system remains: Open on start, Pin on start, MeshTab window scope, and SHOW controls for Notes, Tasks, and Reminders.
- The lighter-purple Reminders screen and enlarged reminder Time control remain unchanged.

## v1.12.0 Mesh Reminders drawer + Settings

- Adds a collapsible **Mesh Reminders** drawer above **Mesh Tasks** on the right. It shows all saved reminders and can filter by **All reminders, One-time, Daily, Scheduled days, All recurring, or Snoozed**. Click a reminder to edit it or use **+** to create one.
- The full **Reminders** screen now takes the main workspace and hides the right-side drawers while it is open.
- Reminder styling now uses a lighter purple palette instead of the previous yellow/gold treatment.
- The Reminder Create/Edit dialog makes **Schedule** and **Time** the same larger height; the Time value uses a much larger regular-weight font.
- Replaces **Open + pin on Chrome start** with a **Settings** button. Settings now separate **Open on start** and **Pin on start**.
- Adds window behavior choices: **One MeshTab per Window** (default) or **One MeshTab for All Windows**. In per-window mode, **Open MeshTab** reuses the MeshTab in the current Chrome window only; if none exists there, it opens a new one in that window.
- Adds visual SHOW controls for **Notes, Tasks, and Reminders**. They default on and hide only the feature UI; saved data is retained.
- New-install defaults are **Open on start ON**, **Pin on start ON**, **One MeshTab per Window**, and Notes/Tasks/Reminders shown. Existing startup preference is preserved when upgrading.
- No `meshtabState` reset and no export-schema change.

## v1.11.1 Completed Tasks: Last Week

- Adds **Last Week** to the Completed Tasks date-range selector.
- Last Week covers the previous Monday through Sunday, matching the existing Last week task analytics card.
- Displayed completion count, logged-time total, and selected-task subtotal all update using the Last Week range.
- No storage key, task data, reminder data, or export schema changes.


## v1.11.0 Reminders

- Adds **Reminders** immediately next to **Tasks** on the thin utility row. No Reminder control is added to the main Tab row.
- Reminder Center provides clean **Daily** and **Weekly** views, upcoming times, live countdowns, recurring indicators, and inactive/completed one-time reminders.
- Reminders can be one-time, daily, or recur on selected days of the week.
- Reminder notifications use Chrome system notifications and remain visible until acted on when the platform supports it.
- Notification actions include **Snooze 10 min** and **Snooze 15 min**. Reminder Center adds **10 min, 15 min, 30 min, Bottom of hour, Top of hour, and 1 hour** snooze choices.
- The Chrome toolbar popup now includes **+ Reminder** for quick capture without leaving the page you are working on.
- Reminder Center supports create, edit, pause/enable, delete, recurrence, and snooze.
- MeshTab export/import advances to **schema v8** and includes reminders and their recurring schedule state. Existing `meshtabState` data, bookmarks, Notes, Tasks, and task history upgrade in place.
- Adds the Chrome `alarms` and `notifications` permissions required for scheduled system reminders.

## v1.10.3 Tab task blocks + right-side filtering

- Every normal MeshTab Tab now has its own **TASKS** block at the top of the Pane. It is collapsed by default and shows that Tab's open-task count.
- Expanding the TASKS block shows only open tasks assigned to that Tab, with Done/Edit/Delete controls plus a quick **+ Task** action targeted to the Tab.
- Switching to any other Tab always collapses the local TASKS block again. The expanded state is intentionally not persisted.
- The right-side Mesh Tasks drawer now has an **All Tasks / General Tasks / Tab** filter. The filter is shared with the full Task Center so the selected task group stays consistent when moving between compact and full task views.
- **Task Center** from a Tab's local TASKS block opens the full Tasks workspace already filtered to that Tab.
- Existing task data, analytics, completion history, Notes, bookmarks, and the `meshtabState` storage key are unchanged.

## v1.10.2 Time units + utility strip

- Completed-task time can now be entered in **Minutes** or **Hours**. Hour entries accept decimals such as `1.5`; MeshTab normalizes them to minutes internally so all existing analytics and time totals stay compatible.
- **General Notes** and **Tasks** now live on a dedicated thin utility strip directly below the main MeshTab Tab row instead of sharing the same row with normal Tabs.
- Existing Tabs remain the primary full-size navigation row and retain drag/reorder behavior.
- No storage key or task-history migration changes; existing v1.10.1 workspace data remains compatible.

## v1.10.1 Closed-task time analytics

- Adds a configurable **Closed** analytics card showing the all-time count of completed tasks.
- Hovering any completed-task analytics card (Closed, Closed today/yesterday, week/month/year periods) shows the combined logged time for the tasks represented by that card.
- The Completed section now always totals the tasks currently displayed by its date filter, including combined logged time.
- Completed task rows are selectable. Click any subset of completed tasks to see the selected task count and combined logged time; click again to remove a task from the subset.
- The new Closed analytics preference is added to existing visible analytics when upgrading from v1.10.0; users who had hidden all analytics remain hidden. It can then be independently shown or hidden like the other analytics cards.
- No bookmark, Note, Task, storage-key, or export-schema reset is introduced. Existing `meshtabState` data remains compatible.

## v1.10.0 Task drawer + Tasks workspace

- **General Notes** and **Tasks** now appear as fixed tabs alongside your existing MeshTab Tabs.
- Removed the always-visible General Notes and Recommended/Next Task blocks from above each normal Tab workspace.
- Adds a **right-side Mesh Tasks drawer**. During normal work it shows a compact urgency-sorted list of all open tasks.
- The Mesh Tasks drawer is collapsible to a narrow right-side tab, similar to Open Pages on the left. Its collapsed/expanded state is remembered across reloads and Chrome restarts.
- The top of the drawer shows **total Mesh Tasks** plus the current open-task count.
- Clicking the **Tasks** tab expands the Tasks drawer into the main full-width Task workspace. Clicking General Notes or a normal Tab returns Tasks to the compact right-side drawer.
- The full Tasks workspace keeps Recommended Next Task, open-task filtering, completion history, closure notes, and time tracking from v1.9.0.
- Adds configurable task analytics for **Open, Past due, Closed today, Closed yesterday, This week, Last week, This month, and This year**. Each metric can be independently shown or hidden; all analytics can be hidden.
- Analytics preferences are stored in `meshtabState`. Existing v1.9.0 bookmarks, Tabs, Groups, Notes, Tasks, task history, and settings remain compatible.
- The toolbar popup's **Open Task Center** shortcut now opens MeshTab directly on the full Tasks tab.

## v1.8.1 Open MeshTab behavior

- **Open MeshTab** now always creates a new MeshTab tab instead of focusing/reusing an existing MeshTab tab.
- MeshTab requests the new tab as **pinned by default**. If Chrome rejects the pin request, MeshTab falls back to opening the same page as a normal new tab.
- The About page's **Open MeshTab** link uses the same behavior.
- The separate **Open + pin on Chrome start** setting is unchanged.


## v1.8.0 About page

- Added a compact About page using the supplied TP-Soft, LLC logo.
- Shows the installed MeshTab version, a brief product description, authorship, and `© 2026 TP-Soft, LLC. All rights reserved.`
- The About page is linked from the main MeshTab footer and toolbar popup.
- This release does not change the MeshTab storage key or saved workspace schema.

## v1.7.2 Pane note statistics

- Adds **meshed notes** beside **meshed links** in the Pane statistics.
- The count includes every Note in the active Pane/Tab, including Notes nested inside other Notes.
- The statistic updates with the rest of the Pane whenever Notes are created, moved, imported, or deleted.

## v1.7.1 Note links

- Web addresses typed or pasted into a Note are rendered as clickable hyperlinks.
- `https://`, `http://`, and `www.` links are supported; `www.` addresses are normalized to HTTPS.
- Clicking a Note hyperlink always opens it in a new Chrome tab and leaves MeshTab in place.
- Note links are preserved by autosave and MeshTab export/import.


## v1.7.0 Notes

- Adds **+Note** beside **+Group**. Notes are resizable panels stored on the active MeshTab Tab.
- Notes accept typed text and pasted screenshots/pictures. Images are stored locally with the note.
- Notes can be marked **Masked**. Masked content stays hidden until the eye icon is clicked, and starts hidden again after reload. Masking is visual privacy, not encryption.
- Unmasked notes are always visible and do not show an eye control.
- Notes can be edited, deleted, resized, expanded to full width, reordered with other notes, and dragged to another MeshTab Tab.
- MeshTab export/import schema is now version 5 and includes note panels, pasted images, mask settings, and note layout. TABME bookmark import remains supported.
- The extension requests Chrome's `unlimitedStorage` permission so locally pasted images do not run into the normal `storage.local` quota.


A visual Chrome workspace for organizing bookmarks and open pages into nested projects/folders and switchable Desktops.

&#169; 2026 &#183; Written by Tim Place, TP-Soft, LLC.






## v1.5.9 visual fix

- Restored the **+ Tab** control to MeshTab's purple primary-button styling.
- No storage, migration, layout, or behavior changes from v1.5.8.

## v1.5.8 recovery fix

- Restores the complete v1.5.6 page shell so existing `meshtabState` data loads normally again.
- Keeps the v1.5.6 collapsible **Open Pages** drawer and its remembered state.
- Applies the requested UI terminology only: **+ Tab**, **GROUPS**, **+Group**, and nested **+G**.
- Does not reset or rename the `meshtabState` storage key. Existing saved MeshTab data remains compatible.

## v1.5.6 collapsible Open Pages drawer

- The left-side **Open Pages** rail can now be collapsed to a narrow tab and expanded again at any time.
- Open Pages is expanded by default for first-time users.
- A user's collapsed/expanded choice is saved in MeshTab storage and restored after reloads and Chrome restarts.
- The collapsed tab still shows the current open-page count so the drawer remains useful without consuming project workspace.

## v1.5.5 location + editor fixes

- Renamed the project/folder **Inside** field to **Location**.
- The location menu now uses plain labels such as **Desktop — Main**, **Project — Name**, and indented **Folder — Name** entries.
- Saving an edited Project/Folder now closes the editor immediately after the save completes.
- Edit state is cleared only after the dialog has actually closed, preventing a second **Save changes** click from accidentally creating a new Project/Folder.
- The Save button is temporarily disabled while a save is in progress to prevent duplicate submissions.

## v1.5.4 project/folder editing

- The **Edit** control on a Project/Folder now opens a proper edit dialog rather than a rename prompt.
- Edit the item name, switch between Project and Folder/group, move it under another Project/Folder (or back to the desktop root), and change its accent color.
- The edit dialog reuses the New Project/Folder layout with existing values prefilled and a **Save changes** action.
- MeshTab prevents an item from being moved inside itself or any of its descendants.

## v1.5.3 command layout tweak

- **New Project/Folder** now sits on its own dedicated row beneath the utility button group.
- Reset remains with the Browse bookmarks / Import / Export / startup controls.
- This keeps the primary create action visually separate and easier to find.

## v1.5.2 pinned startup fix
- MeshTab no longer overrides Chrome's New Tab page.
- **Open + pin on Chrome start** opens MeshTab as a separate extension tab and pins it.
- Your normal Chrome Home/New Tab behavior is left unchanged.

## v1.5.0 compact layout and customization

- Rename any bookmark inside MeshTab without changing the original Chrome bookmark title. Use the edit button that appears when you hover a link.
- Bookmark rows are now a compact single line: favicon + your label. Hover shows the destination URL.
- Each Project/folder has a bottom-right resize handle. Drag horizontally to change its 12-column width and vertically to set its height.
- Use the square/full-width header control to expand a Project/folder across the available workspace.
- Use the `1c` through `6c` control to configure multiple bookmark columns inside a Project/folder.
- Custom bookmark labels, panel dimensions, and link-column settings persist locally and are included in MeshTab schema v4 exports.

## What's new in 1.4.0

- **Bookmark reordering:** drag a bookmark above or below another bookmark in the same project/folder.
- **Cross-project positioned moves:** drag bookmarks between projects/folders and drop at the exact position you want.
- **Persistent order:** custom bookmark order is saved in MeshTab and retained in MeshTab exports/imports.
- **Clear drop indicators:** a visible line shows whether the bookmark will land before or after the target link.

- Smart saved-link behavior: clicking a MeshTab link searches every open Chrome window first. If the exact URL is already open, MeshTab activates that tab and focuses its window. If it is not open, MeshTab creates a new tab instead of navigating away from MeshTab.
- Nested projects and folders: projects can contain other projects or folders, and folders can contain additional nested items.
- Drag a project/folder onto another project/folder to nest it.
- Drag a nested project/folder to the top-level drop zone to move it back to the desktop root.
- Desktops: create separate top-level workspaces and switch between them instantly.
- Drag an entire project/folder onto a Desktop tab to move that project and all of its nested children to the other Desktop.
- Optional **Open + pin on Chrome start** setting. When enabled, MeshTab's Manifest V3 service worker opens one separate pinned MeshTab tab when the Chrome profile starts and avoids creating a duplicate if one already exists.
- Toolbar quick-save now shows nested projects/folders grouped by Desktop.
- Export format upgraded to schema version 4 so Desktops and nested project relationships are preserved.
- TABME import now maps each TABME space to a MeshTab Desktop and preserves folders/groups as actual nested structures instead of flattening their names.
- Existing MeshTab 1.2.x state migrates automatically into a `Main` Desktop with the existing buckets intact.

## Core features

- Opens as its own extension tab; it does not replace Chrome Home or New Tab.
- Shows open Chrome pages in a left-side collapsible rail, grouped by browser window; its collapsed/expanded state is remembered.
- Keeps site favicons visible for open tabs and saved links.
- Drag an open page into any project/folder to create or reuse its Chrome bookmark and add it to MeshTab.
- Click an open-tab card to switch directly to that browser tab/window.
- Click a saved MeshTab link to jump to an already-open matching tab anywhere in Chrome; otherwise open it in a new tab.
- Create projects or folders directly on a Desktop or inside another project/folder.
- Drag projects/folders to reorganize the hierarchy or move them between Desktops.
- Browse/search all existing Chrome bookmarks and add them to one or more MeshTab projects.
- Search open tabs, project/folder names, and saved links from the same search field.
- Create a new Chrome bookmark directly from MeshTab.
- Toolbar popup saves the current page into any nested project/folder and supports quick **+ Note**, **+ Task**, and **+ Reminder** capture.
- Manage General Notes plus Tab-specific notes, and use Task Center for prioritized work and completion history.
- Export a portable MeshTab JSON backup.
- Import/merge MeshTab backups or TABME exports.
- MeshTab layout is stored locally with `chrome.storage.local`.
- Removing MeshTab cards, projects, folders, or Desktops does **not** delete the underlying Chrome bookmarks.

## Desktops and nesting

MeshTab uses this hierarchy:

`Desktop -> Project/Folder -> Project/Folder -> ... -> Links`

Nesting can continue to multiple levels. A project/folder and all of its children always live on the same Desktop. Moving a parent to another Desktop moves the full nested branch together.

## TABME import behavior

MeshTab auto-detects TABME backups with `isTabme: true`.

- Each TABME space becomes a MeshTab Desktop.
- Each TABME folder becomes a top-level project/folder on that Desktop.
- TABME groups remain nested beneath their original parent.
- Empty folders/groups are preserved.
- Bookmark titles, URLs, supported favicon URLs, and approximate accent colors are retained.
- Existing Chrome bookmarks with the same URL are reused.
- Missing links are created as Chrome bookmarks so MeshTab can manage them consistently.
- Repeated links can appear in multiple MeshTab projects/folders.
- TABME widgets/stickers are intentionally not imported; the importer is limited to bookmark organization.

## Export format

MeshTab exports a human-readable JSON file named like:

`tims-meshtab-backup-2026-08-07.json`

Schema version 9 stores Tab names, nested project/folder relationships, General Notes, nested note panels, Tasks and completion history, Reminders and recurring schedules, link titles/URLs/favicons, and MeshTab settings without relying on Chrome profile-specific bookmark IDs.

## Startup and window behavior

Open **Settings** from the MeshTab command bar to configure startup and window behavior. **Open on start** controls whether MeshTab opens when the Chrome profile starts, while **Pin on start** independently controls whether those startup MeshTab tabs are pinned. **Pin on Open** controls whether a newly created tab from the Open MeshTab action starts pinned; it never re-pins an already-existing MeshTab that the user unpinned.

The default **One MeshTab per Window** mode keeps one MeshTab in each Chrome window. Clicking **Open MeshTab** reuses the MeshTab in the current window only; if that window does not have one, MeshTab opens a new tab there and does not jump to another Chrome window. **One MeshTab for All Windows** instead reuses one MeshTab across the whole Chrome profile.

MeshTab **does not override Chrome's New Tab or Home page**. Opening a normal new tab continues to use whatever New Tab experience Chrome or your other extensions provide.

**Pin on start** pins the MeshTab **tab**. Chrome does not provide an extension API that lets an extension silently pin its own toolbar/action icon; toolbar pinning remains under user control.

## Install locally

1. Unzip this project if needed.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Choose the `tims-meshtab` folder.
6. Click the MeshTab toolbar button and choose **Open MeshTab**.
7. Open **Settings** in MeshTab to choose startup, pinning, window behavior, and visible features.

When updating an existing unpacked copy, replace the old files and click **Reload** on the MeshTab extension card in `chrome://extensions`.

## Permissions

- `bookmarks` - reads/creates Chrome bookmarks used by MeshTab.
- `storage` - stores Desktops, nesting, layout, settings, and retained favicon references locally.
- `activeTab` - supports the toolbar quick-save flow.
- `tabs` - reads open tab URL/title/favicon information and activates/creates tabs for smart link behavior.
- `favicon` - displays Chrome's cached favicon for saved bookmark URLs.
- `alarms` - schedules MeshTab reminder timers.
- `notifications` - displays reminder notifications.
- `unlimitedStorage` - allows image-rich Notes and workspace data to exceed the normal local extension storage quota.

### Chrome Web Store — Privacy practices tab (submission text)

Reference copy of the text used to satisfy the Web Store's "justification required" fields, kept here so future version submissions can reuse it without re-deriving it.

**Single purpose description**

> Tim's MeshTab is a personal New Tab workspace that lets a user organize their open tabs, bookmarks, notes, tasks, and reminders into a single visual dashboard that replaces the default Chrome New Tab page.

**Permission justifications**

- `activeTab` - Used by the toolbar button's quick-save flow to read the URL, title, and favicon of the page the user is currently viewing when they click the extension icon, so that page can be saved as a link into a MeshTab Tab. Not used to inject scripts into pages the user hasn't interacted with.
- `alarms` - MeshTab lets users schedule one-time and recurring reminders on their tasks and links. The alarms API schedules the timers that fire these reminders at the configured time, including after the browser has been idle, so a reminder isn't missed.
- `bookmarks` - Reads and creates Chrome bookmarks so a user can save a link from the browser into MeshTab's workspace, and optionally save a MeshTab link back out as a native Chrome bookmark. Used only for bookmark folders/items the user explicitly interacts with inside MeshTab.
- `favicon` - MeshTab displays each saved link and open tab with its site favicon so links are visually identifiable in the workspace. This permission retrieves Chrome's already-cached favicon image for a URL instead of fetching icons from a third-party server.
- `notifications` - Shows a desktop notification when a scheduled reminder (see `alarms`) comes due, so the user is alerted even when the MeshTab tab isn't focused.
- `remote code` (Does this extension use remote code?) - **No.** MeshTab does not download or execute any remote code. All JavaScript, HTML, and CSS the extension runs is packaged inside the extension at install time; there is no `eval`/`new Function` on remote strings, no remotely hosted script, and no code imported from an external URL at runtime.
- `storage` - Uses `chrome.storage.local` to save the user's workspace on their own device: Desktops/Tabs, nested projects/folders, Notes, Tasks, Reminders, saved links, and Settings, so the layout persists between sessions without any external server.
- `tabs` - Powers the "open tabs" rail so a user can see and drag their currently open browser tabs (title, URL, favicon) into their saved workspace, and activates or creates a tab when the user clicks a saved link (reusing an already-open tab instead of opening a duplicate). Required to read this basic tab metadata and to switch/open tabs at the user's request.
- `unlimitedStorage` - Users can paste screenshots/images into Notes and build a large personal workspace (many Tabs, links, favicons, notes) stored entirely on-device. This permission removes the standard ~10 MB `chrome.storage` cap so that locally stored content isn't truncated or rejected as a workspace grows.

**Data usage compliance certification**

MeshTab makes no network requests and collects no user data (no analytics, no remote logging, nothing transmitted off-device); everything lives in local `chrome.storage`. On the Data Usage / Data Disclosure section of the Privacy practices tab, select "This item does not collect any of the following data types" for every category, then check the certification box affirming compliance with the Developer Program Policies — the statement is accurate for this extension as written.

**Publisher contact email**

Not something a submission can pre-fill: on the Web Store Developer Dashboard's account **Settings** page, enter the publisher contact email, then open that inbox and click the verification link Google sends before the item can be published.

## Notes

- MeshTab can see tabs in Chrome windows for the Chrome profile where it is installed. It cannot enumerate tabs in separate browsers such as Edge, Firefox, or Safari.
- Chrome internal pages such as `chrome://settings` can be shown in the open-pages rail for navigation but cannot be saved as normal bookmarks by MeshTab.
- Dragging an open page into MeshTab does not close or move the original tab.
- No remote JavaScript, frameworks, trackers, or external services are used.

## v1.5.2 changes

- Desktop tabs can be dragged left/right to change their saved order.
- The **New Project/Folder** button label was standardized; its placement was refined again in v1.5.3.
- The button label is now **New Project/Folder**.
- Fixed the New Project/Folder dialog close button: clicking the **X** now closes the dialog without submitting or creating an item.


## v1.7.0 note improvements

- Click directly into any visible note panel to type or edit its contents; changes autosave locally.
- Paste screenshots or pictures directly into a visible note panel without opening the Edit dialog.
- The **E** button still opens the full note editor/settings for title, content, and masking.
- Use **+N** on a note to create a nested note inside it. Nested notes can contain further nested notes, retain their own masking/settings, and resize independently.
- MeshTab export/import schema v6 preserves nested-note relationships.


