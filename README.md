Long story short, I cooked up a cute little Chrome extension where, whenever you're browsing a book listing on Amazon.com, it will automatically look up that book's ISBN and let you know if it's available at the San Francisco Public Library. Thinking of buying a book? Maybe you can save some money (and support your community) by picking up a copy at the library.

The extension notifies you with a link right underneath the author's name, like so:

<img width="1280" height="800" alt="LibraryLookup-SF" src="https://github.com/user-attachments/assets/bcb88423-e360-4388-8cf9-4376bd605516" />


Note that because the plugin is keyed off ISBN, it doesn't always register on every product page at Amazon. For example, if you're looking at the Kindle page, it might not find anything at all. You might also need to play around, switching between the paperback and hardcover versions of the book.

The extension is confirmed to work on Microsoft Edge, and it will probably work on any other Chromium-based browser, too. You can [install it from the Chrome Web Store here](https://chromewebstore.google.com/detail/library-lookup-for-amazon/pamchhengjpajoahfigloobiagiabjjc).

### Tech Notes
The current version is much improved from previous ones. For one thing, in keeping with the Chrome Extension Manifest v3 format, it no longer uses a Background Page, so it's no longer running all the time in the background. I've also switched it from using the legacy SFPL online catalog to the new catalog based on Bibliocommons. An additional prompt has also been added that suggests you reserve a copy of a book when all available copies are currently checked out at the SFPL.

Amazon occasionally changes its product page UI, which can break how this extension works. If you think you've spotted such an instance, let me know.
