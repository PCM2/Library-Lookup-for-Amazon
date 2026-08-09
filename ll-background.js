/* Code for the background service worker of SF Library Lookup */

var libraryName = 'SF Public';
var libraryAPIURL = 'https://gateway.bibliocommons.com/v2/libraries/sfpl/bibs/search?searchType=keyword&query=';

// Converts an ISBN-10 to its equivalent ISBN-13, or passes an ISBN-13 through
// unchanged. Needed because BiblioCommons' search index doesn't reliably
// match a bare ISBN-10 query even when the title is in the catalog, and
// catalog records mix ISBN-10/ISBN-13 forms in their isbns list.
function toISBN13(isbn) {
	var digits = (isbn || '').toUpperCase();
	if (digits.length === 13) {
		return digits;
	}
	if (digits.length !== 10) {
		return null;
	}
	var core = '978'+digits.slice(0, 9);
	var sum = 0;
	for (var i = 0; i < 12; i++) {
		sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
	}
	var check = (10 - (sum % 10)) % 10;
	return core+check;
}

// Cache of resolved lookups for this browser session, keyed by ISBN, so
// bouncing between formats/editions of the same book (or reloading) doesn't
// re-fetch from BiblioCommons for an answer that hasn't changed. Only
// genuine successes are cached (see doLookup) — chrome.storage.session is
// cleared automatically when the browser session ends, so entries never
// need an explicit expiry.
var CACHE_KEY_PREFIX = 'isbnCache:';

async function getCachedLookup(isbn) {
	var key = CACHE_KEY_PREFIX+isbn;
	var stored = await chrome.storage.session.get(key);
	return stored[key] || null;
}

async function setCachedLookup(isbn, data) {
	var key = CACHE_KEY_PREFIX+isbn;
	await chrome.storage.session.set({ [key]: data });
}

async function doLookup(isbn) {
	var isbn13 = toISBN13(isbn);
	var queryISBN = isbn13 || isbn;

	var cached = await getCachedLookup(queryISBN);
	if (cached) {
		return cached;
	}

	var data = {
		'isbn' : queryISBN,
		'hrefTitle' : null,
		'aLabel': null
	};

	try {
		var res = await fetch(libraryAPIURL+queryISBN);
		if (!res.ok) {
			throw new Error('lookup request failed with status '+res.status);
		}
		var json = await res.json();
		var bibs = (json.entities && json.entities.bibs) || {};

		var bib = Object.values(bibs).find(function(b) {
			var isbns = (b.briefInfo && b.briefInfo.isbns) || [];
			return isbns.indexOf(isbn) !== -1 || isbns.some(function(x) {
				return toISBN13(x) === isbn13;
			});
		});

		if (!bib) {
			return null;
		}

		data.hrefTitle = bib.briefInfo.title;

		var availability = bib.availability || {};
		if (availability.statusType === 'AVAILABLE' && availability.availableCopies > 0) {
			data.aLabel = "Hey! It's available at the "+libraryName+" Library!";
		} else if (availability.onOrderCopies > 0) {
			data.aLabel = "On order at the "+libraryName+" Library. Check again soon!";
		} else {
			data.aLabel = "Checked out at the "+libraryName+" Library. Place a hold to get it next!";
		}

		await setCachedLookup(queryISBN, data);
		return data;
	} catch (err) {
		// Network error, CORS failure, BiblioCommons downtime, bad JSON, etc.
		// Surface it in the same spot the success message would appear,
		// rather than failing silently.
		console.error('Library Lookup: lookup failed for ISBN '+queryISBN+':', err);
		data.aLabel = "Couldn't check the "+libraryName+" Library right now. Try again later.";
		return data;
	}
}

// Handles messages sent via chrome.runtime.sendMessage().
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.action == 'doLookup') {
		doLookup(request.isbn).then(sendResponse);
		return true; // keep the message channel open for the async response
	}
});
