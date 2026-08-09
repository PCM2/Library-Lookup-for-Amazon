Long story short, I cooked up a cute little Chrome extension where, whenever you're browsing a book listing on Amazon.com, it will automatically look up that book's ISBN and let you know if it's available at your local public library. Thinking of buying a book? Maybe you can save some money (and support your community) by picking up a copy at the library.

The extension notifies you with a link right underneath the author's name, like so:

![Screenshot illusration of Library Lookup for SFPL](https://github.com/PCM2/Library-Lookup-for-Amazon/blob/main/LibraryLookup-SF.png)

Note that because the plugin is keyed off ISBN, it doesn't always register on every product page at Amazon. For example, if you're looking at the Kindle page, it might not find anything at all. You might also need to play around, switching between the paperback and hardcover versions of the book.

The extension is confirmed to work on Microsoft Edge, and it will probably work on any other Chromium-based browser, too. You can [install it from the Chrome Web Store here](https://chromewebstore.google.com/detail/library-lookup-for-amazon/pamchhengjpajoahfigloobiagiabjjc).

### Choosing your library

By default, the extension checks San Francisco Public Library. To use a different one, right-click the extension's icon and choose "Options" (or find it via `chrome://extensions` → Library Lookup for Amazon → Details → Extension options), then pick your library from the dropdown. Your choice is saved automatically and synced across any Chrome you're signed into.

Currently supported (all run on the BiblioCommons catalog platform):

- San Francisco Public Library
- Alameda County Library
- Contra Costa County Library
- Hayward Public Library
- Livermore Public Library
- Marin County Free Library
- Napa County Library
- Oakland Public Library
- Palo Alto City Library
- Pleasanton Public Library
- San José Public Library
- San Mateo County Libraries
- Santa Clara County Library
- Sonoma County Library

Don't see your library? It needs to run on BiblioCommons for this extension to work with it — let me know if there's one you'd like added.

### Tech Notes
The current version is much improved from previous ones. For one thing, in keeping with the Chrome Extension Manifest v3 format, it no longer uses a Background Page, so it's no longer running all the time in the background. I've also switched it from using the legacy SFPL online catalog to the new catalog based on Bibliocommons. An additional prompt has also been added that suggests you reserve a copy of a book when all available copies are currently checked out. There's now also better error handling for when the extension can't reach Bibliocommons for some reason.

The list of supported libraries lives in `ll-libraries.js`, shared between the background service worker and the options page; your selected library is persisted via `chrome.storage.sync`.

Amazon occasionally changes its product page UI, which can break how this extension works. If you think you've spotted such an instance, let me know.
