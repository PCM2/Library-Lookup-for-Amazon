# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Library Lookup for Amazon" is a Chrome Extension (Manifest V3) with no build step, no
package manager, and no test suite — it's three plain JS/JSON files loaded directly by
Chrome. While browsing a book's product page on Amazon.com, it extracts the ISBN from the
page, checks San Francisco Public Library's catalog for availability, and injects a link/
message underneath the author byline.

There is no build/lint/test tooling in this repo. To verify a change, load the extension
unpacked (`chrome://extensions` → Developer mode → "Load unpacked" → select the repo root)
and visit an Amazon.com book page.

## Architecture

The extension has exactly two JS files with a strict separation of concerns, connected by
`chrome.runtime.sendMessage`:

- **`librarylookup-sf.js`** — content script injected into `*://*.amazon.com/*`. Runs on
  page load, has DOM access. Its only jobs are: (1) extract the ISBN from the current page
  (`findISBN`), and (2) inject the result link into the page (`insertLink`). It never talks
  to the network directly.
  - `findISBN` first tries to parse a 10-digit ISBN out of the current URL. If the page is
    a Kindle/Audible edition (no ISBN in the URL), it falls back to scanning the format
    switcher (`#tmmSwatches`) for a sibling print-edition link that does have one.
  - `insertLink` requires a `#bylineInfo` element to exist on the page (Amazon's UI). If
    Amazon changes this DOM structure, the extension silently does nothing — this is the
    most likely thing to break when Amazon updates its product page.
- **`ll-background.js`** — Manifest V3 service worker (not a persistent background page;
  it's event-driven and can be unloaded between messages). Owns all network access. Listens
  for `{action: 'doLookup', isbn}` messages, queries the BiblioCommons catalog API, and
  returns a result object (or `null`) via `sendResponse`. Because the fetch is async, the
  listener must `return true` to keep the message channel open.
  - `toISBN13` normalizes ISBN-10 → ISBN-13 (with check-digit calculation) before querying,
    because BiblioCommons' search index doesn't reliably match bare ISBN-10 queries and
    catalog records mix ISBN-10/ISBN-13 forms in their `isbns` list. The matching bib is
    found by comparing both raw and ISBN-13-normalized forms against the catalog's `isbns`.
  - The returned `aLabel` message varies by availability status (available / on order /
    checked out — with a hold suggestion).

**Data flow:** `librarylookup-sf.js` finds ISBN on page load → sends it to the background
worker → worker fetches `gateway.bibliocommons.com` and returns `{isbn, hrefTitle, aLabel}`
(or `null`) → content script injects a `<br><a>` under `#bylineInfo` linking to a search on
`sfpl.bibliocommons.com` for that ISBN.

`manifest.json`'s `host_permissions` (network fetch target) and `content_scripts.matches`
(DOM injection target) must stay in sync with the hosts actually used in the two JS files.

## Library-specific fork notes

This codebase is specific to SFPL/BiblioCommons (see `libraryName`, `libraryAPIURL`,
`librarySearchURL`). Adapting it for a different library means changing those constants and
the BiblioCommons `slug` in the API URL (`.../libraries/sfpl/bibs/search...`) — the response
shape (`entities.bibs`, `briefInfo.isbns`, `availability.statusType`) is BiblioCommons'
schema, not SFPL-specific, so it should hold for any other BiblioCommons-based library
catalog.
