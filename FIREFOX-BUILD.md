# Running Tim's MeshTab in Firefox

This extension now has a Firefox-compatible build alongside the Chrome one. The
JavaScript is shared — there's no separate Firefox copy of app.js, background.js,
etc. Each script now starts with a small compatibility shim:

```js
if (typeof browser !== 'undefined') { globalThis.chrome = browser; }
```

Firefox's native WebExtension API is `browser.*` and is promise-based (matching
how this codebase already calls `chrome.*` with `await`, no callbacks). Chrome
doesn't define a `browser` global, so this line does nothing there — one
codebase, both browsers, no forked logic to maintain.

The project folder is now split into two self-contained folders — `chrome/`
and `firefox/` — each with its own complete copy of every file, including its
own `manifest.json`. They're independently loadable as-is; no copying or
renaming needed before loading either one. The two copies are kept in sync by
hand: whenever a shared file (app.js, styles.css, etc.) changes, I push that
change to both folders. The one file that differs between them is the
manifest itself, which needs a handful of keys Firefox requires differently:

- `background.scripts: ["reminders.js", "background.js"]` instead of
  `background.service_worker` — Firefox's stable Manifest V3 background is a
  classic background page, not a service worker. `background.js` already
  guards its `importScripts('reminders.js')` call so it only runs where
  `importScripts` actually exists (Chrome's service worker); on Firefox,
  `reminders.js` is loaded first as a sibling script instead.
- `browser_specific_settings.gecko.id` and `strict_min_version` — Firefox
  requires a stable add-on ID for updates to work, and this pins the minimum
  Firefox version (109, when Firefox added general Manifest V3 support) so it
  won't try to load on something too old to support the `scripting` API this
  extension uses for the Work Clock overlay.
- The `favicon` permission was dropped — it's specific to Chrome's `/_favicon/`
  internal endpoint, which Firefox doesn't have. Favicons that aren't already
  cached (e.g. from dragging an open tab, or a bookmark that already carries
  its own icon) will fall back to the plain letter badge instead of a site
  icon. Everything else about the layout works the same either way.

## Loading it in Firefox to test

1. In Firefox, go to `about:debugging#/runtime/this-firefox` → **Load
   Temporary Add-on…** → select `manifest.json` inside the `firefox/` folder.

That loads it for the current Firefox session (it unloads when Firefox
closes — this is Firefox's version of Chrome's "Load unpacked" for
development, not a permanent install). The Chrome build lives in `chrome/`
and loads into `chrome://extensions` → Load unpacked the same way it always
has — just point it at that subfolder now instead of the project root.

## Publishing to addons.mozilla.org (AMO), if you want that later

That's a separate account and review process from the Chrome Web Store, run
by Mozilla instead of Google — I can't submit on your behalf, same as with
the Chrome listing. A few things worth doing before you do:

- Pick a real `gecko.id` — right now it's set to the placeholder
  `tims-meshtab@timp311.example`. It doesn't need to be a working email, just
  a syntactically similar, unique string you won't need to change later
  (changing it after publishing breaks update continuity for anyone who
  installed the old ID).
- AMO runs its own automated + human review, similar in spirit to Chrome's,
  with its own content policy — worth a skim before submitting.
- The Store listing copy (summary/description) you already have for Chrome
  can be reused for the AMO listing as a starting point.

## What to test

I don't have Firefox available in this environment to run it myself, so this
is a best-effort conversion based on Firefox's documented WebExtensions
behavior, not something I've clicked through end to end. Worth checking once
loaded: the New Tab override actually taking over, bookmarks import/create,
drag-and-drop of open tabs, the Work Clock overlay (including the minimize
feature) on a couple of real websites, and Reminders actually firing. If
anything's off, send me what you're seeing and I'll dig in.
