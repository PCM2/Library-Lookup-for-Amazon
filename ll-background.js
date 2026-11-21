/* Code for the background service worker of Library Lookup */

importScripts('ll-libraries.js');

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

// Cache of resolved lookups for this browser session, keyed by library slug
// and lookup id (an ISBN, or a "disc:..." id for DVDs/Blu-rays), so bouncing
// between formats/editions (or reloading) doesn't re-fetch from
// BiblioCommons for an answer that hasn't changed. Keying by slug too means
// switching libraries never serves a stale result cached under a different
// library. Only genuine successes are cached — chrome.storage.session is
// cleared automatically when the browser session ends, so entries never
// need an explicit expiry.
var CACHE_KEY_PREFIX = 'isbnCache:';

async function getCachedLookup(slug, id) {
	var key = CACHE_KEY_PREFIX+slug+':'+id;
	var stored = await chrome.storage.session.get(key);
	return stored[key] || null;
}

async function setCachedLookup(slug, id, data) {
	var key = CACHE_KEY_PREFIX+slug+':'+id;
	await chrome.storage.session.set({ [key]: data });
}

// Reads the user's selected library from chrome.storage.sync (so it follows
// them across Chrome installs), falling back to San Francisco Public if
// unset or no longer recognized. Re-read on every lookup rather than cached
// in memory, so a library switch in the options page takes effect on the
// very next lookup with no extra invalidation logic.
async function getSelectedLibrary() {
	var stored = await chrome.storage.sync.get('selectedLibrary');
	return llResolveLibrary(stored.selectedLibrary);
}

// Runs a gateway search and returns the matching bibs as an array.
async function searchBibs(library, query, params) {
	var res = await fetch(llApiURL(library, params)+encodeURIComponent(query));
	if (!res.ok) {
		throw new Error('lookup request failed with status '+res.status);
	}
	var json = await res.json();
	return Object.values((json.entities && json.entities.bibs) || {});
}

function isAvailable(bib) {
	var availability = bib.availability || {};
	return availability.statusType === 'AVAILABLE' && availability.availableCopies > 0;
}

// Builds the link text for a matched bib. On movie pages, noun names what
// was found ("book", "Blu-ray", "DVD") so the two links can't be confused;
// book pages pass nothing and get the original wording.
function labelFor(bib, library, noun) {
	var availability = bib.availability || {};
	var where = " at the "+library.name+" Library";
	var subject = noun ? "The "+noun : null;
	if (isAvailable(bib)) {
		return (subject ? "Hey! "+subject+" is available" : "Hey! It's available")+where+"!";
	}
	if (availability.onOrderCopies > 0) {
		return (subject ? subject+" is on order" : "On order")+where+". Check again soon!";
	}
	return (subject ? subject+" is checked out" : "Checked out")+where+". Place a hold to get it next!";
}

async function doLookup(isbn) {
	var library = await getSelectedLibrary();
	var isbn13 = toISBN13(isbn);
	var queryISBN = isbn13 || isbn;

	var cached = await getCachedLookup(library.slug, queryISBN);
	if (cached) {
		return cached;
	}

	var data = {
		'isbn' : queryISBN,
		'hrefTitle' : null,
		'aLabel': null,
		'searchHref': llSearchURL(library)+encodeURIComponent(queryISBN)
	};

	try {
		var bibs = await searchBibs(library, queryISBN);

		var bib = bibs.find(function(b) {
			var isbns = (b.briefInfo && b.briefInfo.isbns) || [];
			return isbns.indexOf(isbn) !== -1 || isbns.some(function(x) {
				return toISBN13(x) === isbn13;
			});
		});

		if (!bib) {
			return null;
		}

		data.hrefTitle = bib.briefInfo.title;
		data.aLabel = labelFor(bib, library);

		await setCachedLookup(library.slug, queryISBN, data);
		return data;
	} catch (err) {
		// Network error, CORS failure, BiblioCommons downtime, bad JSON, etc.
		// Surface it in the same spot the success message would appear,
		// rather than failing silently.
		console.error('Library Lookup: lookup failed for ISBN '+queryISBN+':', err);
		data.aLabel = "Couldn't check the "+library.name+" Library right now. Try again later.";
		return data;
	}
}

/* ---- DVDs and Blu-rays ----
   Discs have no ISBN, but they do have a UPC. BiblioCommons records carry it
   (in the Syndetics jacket URL, and at some libraries in the isbns list),
   and a bare-UPC keyword search finds the exact disc. Amazon shows the UPC
   only sometimes (as "Item model number"), so when it's missing or the
   library doesn't own that exact disc, fall back to an exact-title search
   restricted to DVD/Blu-ray. */

var DISC_FORMAT_NAMES = { DVD: 'DVD', BLURAY: 'Blu-ray' };

function stripLeadingZeros(digits) {
	return String(digits || '').replace(/^0+/, '');
}

// All UPCs recorded on a bib, with leading zeros stripped so the 12-digit
// UPC-A and 13-digit zero-padded EAN forms compare equal.
function bibUPCs(bib) {
	var info = bib.briefInfo || {};
	var upcs = [];
	var jacket = info.jacket || {};
	['small', 'medium', 'large'].forEach(function(size) {
		var m = (jacket[size] || '').match(/[?&]upc=(\d+)/);
		if (m) {
			upcs.push(stripLeadingZeros(m[1]));
		}
	});
	(info.isbns || []).forEach(function(x) {
		if (/^\d{12,13}$/.test(x)) {
			upcs.push(stripLeadingZeros(x));
		}
	});
	return upcs;
}

// Lowercased, punctuation-free, leading-article-free form of a title, for
// exact comparison. Bracketed text is kept as words, so a library record
// titled "Oppenheimer [documentary]" doesn't match "Oppenheimer".
function normalizeTitle(title) {
	return String(title || '')
		.normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/^(the|a|an) /, '');
}

var INSTALLMENT_RE = /\b(part|season|series|volume|vol|episode|chapter|book|disc|collection)\b|\b[ivx]+\b|\d/i;

// Keeps the bibs whose title is the one wanted (already normalized).
// Catalogs put two kinds of thing in the subtitle:
//   - a different work: "The Godfather" / "Part III", "Breaking Bad" /
//     "The Complete First Season", "The Lord of the Rings" / "The Return
//     of the King";
//   - the same work: "Seven samurai" / "Shichinin no samurai" (original
//     title), "The Godfather" / "The Coppola Restoration" (edition).
// Title + subtitle matching the wanted title is always a match. Title alone
// matching is accepted only when the subtitle is empty or reads as the
// same work: it doesn't look like an installment, and the matches don't
// carry several different subtitles (which means a series of works).
function filterTitleMatches(bibs, wanted) {
	var exact = bibs.filter(function(b) {
		var info = b.briefInfo || {};
		return info.subtitle && normalizeTitle(info.title+' '+info.subtitle) === wanted;
	});
	if (exact.length) {
		return exact;
	}
	var loose = bibs.filter(function(b) {
		var info = b.briefInfo || {};
		return normalizeTitle(info.title) === wanted && !INSTALLMENT_RE.test(info.subtitle || '');
	});
	var subtitles = {};
	loose.forEach(function(b) {
		var sub = normalizeTitle(b.briefInfo.subtitle);
		if (sub) {
			subtitles[sub] = true;
		}
	});
	if (Object.keys(subtitles).length > 1) {
		loose = loose.filter(function(b) { return !normalizeTitle(b.briefInfo.subtitle); });
	}
	return loose;
}

// Picks the best of several matching bibs: same format as the Amazon page
// first, then a director match (for remakes that share a title), then
// whatever is available right now.
function pickBestDisc(bibs, format, directors) {
	function score(b) {
		var info = b.briefInfo || {};
		var groupKey = (info.groupKey || '').toLowerCase();
		var s = 0;
		if (info.format === format) {
			s += 4;
		}
		if (directors.some(function(d) { return groupKey.indexOf(d) !== -1; })) {
			s += 2;
		}
		if (isAvailable(b)) {
			s += 1;
		}
		return s;
	}
	return bibs.slice().sort(function(a, b) { return score(b) - score(a); })[0];
}

// Colons and quotes would be read as search syntax.
function titleQuery(title) {
	return title.replace(/[:"()\[\]]/g, ' ');
}

function bibFullTitle(bib) {
	var info = bib.briefInfo;
	return info.title+(info.subtitle ? ': '+info.subtitle : '');
}

// Subtitles of books that share a film's title but aren't the novel it was
// made from: screenplays, companions, study guides and the like. (Movie
// tie-in editions of the novel are fine, so "movie"/"tie-in" aren't here.)
var NOT_SOURCE_BOOK_RE = /\b(screenplays?|scripts?|companion|guide|making of|art of|cookbook|recipes|summary|analysis|study|workbook|coloring|activity|sticker|trivia|quiz)\b/i;

// Finds the novel a film was based on, or null. The library's catalog
// doesn't link films to their source books, so this looks for fiction
// with exactly the film's title, and accepts it only when the author is
// unambiguous:
//   - one author: accepted. This leaves out Casablanca (only a
//     nonfiction cookbook has that title) and Sahara (only nonfiction
//     travel books), while finding The Da Vinci Code, Jurassic Park, etc.
//   - several authors: accepted only if one author's book is far more
//     widely rated (Alcott's Little Women vs. a critical study cataloged as
//     fiction; Frank vs. Brian Herbert for Dune). Toy Story's
//     tie-in picture books have almost no ratings, so they're rejected.
// Ratings counts are shared across BiblioCommons libraries but sometimes
// missing, which is why a lone author doesn't need them.
async function findSourceBook(library, titles) {
	for (var i = 0; i < titles.length; i++) {
		var wanted = normalizeTitle(titles[i]);
		var bibs = (await searchBibs(library, titleQuery(titles[i]), {
			searchType: 'title',
			f_FORMAT: 'BK'
		})).filter(function(b) {
			var info = b.briefInfo || {};
			var sub = info.subtitle || '';
			return normalizeTitle(info.title) === wanted
				&& info.contentType === 'FICTION'
				&& !INSTALLMENT_RE.test(sub)
				&& !NOT_SOURCE_BOOK_RE.test(sub);
		});
		if (!bibs.length) {
			continue;
		}

		// Group by author, tracking each author's best-rated record. Use
		// the max rather than a sum: editions of one work share a count.
		var byAuthor = {};
		bibs.forEach(function(b) {
			var author = normalizeTitle((b.briefInfo.authors || [])[0]);
			var count = (b.briefInfo.rating && b.briefInfo.rating.totalCount) || 0;
			var entry = byAuthor[author] = byAuthor[author] || { bibs: [], ratings: 0 };
			entry.bibs.push(b);
			entry.ratings = Math.max(entry.ratings, count);
		});
		var authors = Object.keys(byAuthor).sort(function(a, b) {
			return byAuthor[b].ratings - byAuthor[a].ratings;
		});
		var top = byAuthor[authors[0]];
		if (authors.length > 1) {
			var runnerUp = byAuthor[authors[1]].ratings;
			if (!authors[0] || top.ratings < 50 || top.ratings < 5 * runnerUp) {
				return null;
			}
		}

		return top.bibs.slice().sort(function(a, b) {
			return (isAvailable(b) ? 1 : 0) - (isAvailable(a) ? 1 : 0);
		})[0];
	}
	return null;
}

// "Brown, Dan" -> "Dan Brown".
function displayAuthor(author) {
	var m = String(author || '').match(/^([^,]+),\s*(.+)$/);
	return m ? m[2]+' '+m[1] : String(author || '');
}

// Finds the disc itself: by UPC when Amazon gave one, then by exact title.
// Returns { bib, viaTitle } or null.
async function findDisc(library, upc, titles, format, directors) {
	var bib = null;

	if (upc) {
		// Some libraries index only the 12-digit form, others only the
		// zero-padded 13-digit form, so try both.
		var forms = [upc.padStart(12, '0'), upc.padStart(13, '0')]
			.filter(function(f, i, all) { return all.indexOf(f) === i; });
		for (var i = 0; i < forms.length && !bib; i++) {
			var hits = (await searchBibs(library, forms[i])).filter(function(b) {
				return bibUPCs(b).indexOf(upc) !== -1;
			});
			if (hits.length) {
				bib = pickBestDisc(hits, format, directors);
			}
		}
		if (bib) {
			return { bib: bib, viaTitle: false };
		}
	}

	for (var j = 0; j < titles.length; j++) {
		var titleHits = filterTitleMatches(await searchBibs(library, titleQuery(titles[j]), {
			searchType: 'title',
			f_FORMAT: 'DVD|BLURAY'
		}), normalizeTitle(titles[j]));
		if (titleHits.length) {
			return { bib: pickBestDisc(titleHits, format, directors), viaTitle: true };
		}
	}
	return null;
}

// Lookup for DVD/Blu-ray pages. Returns { links: [...] } with up to two
// links, each shaped like doLookup's result: the book the film is based on
// first (that's usually what people are after), then the disc itself.
// Returns null if neither is in the catalog.
async function doDiscLookup(info) {
	var library = await getSelectedLibrary();
	var format = info.format === 'BLURAY' ? 'BLURAY' : 'DVD';
	var upc = /^\d{12,13}$/.test(info.upc || '') ? stripLeadingZeros(info.upc) : null;
	var titles = (info.titles || []).filter(function(t) { return normalizeTitle(t); });
	// Directors' surnames, lowercased, for comparing against groupKey
	// (e.g. "oppenheimer�christopher_nolan�video").
	var directors = (info.directors || []).map(function(d) {
		var parts = normalizeTitle(d).split(' ');
		return parts[parts.length - 1];
	}).filter(function(s) { return s && s.length > 2; });

	if (!upc && !titles.length) {
		return null;
	}

	var cacheId = 'disc2:'+format+':'+(upc || 'title:'+normalizeTitle(titles[0]));
	var cached = await getCachedLookup(library.slug, cacheId);
	if (cached) {
		return cached;
	}

	// Run both searches at once. A failed book search just means no book
	// link; a failed disc search shows the usual "couldn't check" message.
	var results = await Promise.all([
		findSourceBook(library, titles).catch(function(err) {
			console.error('Library Lookup: book search failed for "'+titles[0]+'":', err);
			return null;
		}),
		findDisc(library, upc, titles, format, directors).then(
			function(found) { return { found: found }; },
			function(err) { return { error: err }; }
		)
	]);
	var book = results[0], disc = results[1];
	var links = [];

	if (book) {
		var author = displayAuthor((book.briefInfo.authors || [])[0]);
		links.push({
			'hrefTitle': bibFullTitle(book)+(author ? ' by '+author : '')+' (book with the same title as this movie)',
			'aLabel': labelFor(book, library, 'book'),
			'searchHref': llRecordURL(library, book.id || book.briefInfo.id)
		});
	}

	if (disc.error) {
		console.error('Library Lookup: disc lookup failed for '+(upc ? 'UPC '+upc : '"'+titles[0]+'"')+':', disc.error);
		links.push({
			'hrefTitle': null,
			'aLabel': "Couldn't check the "+library.name+" Library right now. Try again later.",
			'searchHref': llSearchURL(library)+encodeURIComponent(upc || titles[0])
		});
		// Don't cache: the next page load should retry.
		return { links: links };
	}

	if (disc.found) {
		var bib = disc.found.bib;
		links.push({
			'hrefTitle': bibFullTitle(bib)+(disc.found.viaTitle ? ' (matched by title; may be a different edition)' : ''),
			'aLabel': labelFor(bib, library, DISC_FORMAT_NAMES[bib.briefInfo.format] || 'disc'),
			'searchHref': llRecordURL(library, bib.id || bib.briefInfo.id)
		});
	}

	if (!links.length) {
		return null;
	}
	var data = { links: links };
	await setCachedLookup(library.slug, cacheId, data);
	return data;
}

// Handles messages sent via chrome.runtime.sendMessage().
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.action == 'doLookup') {
		doLookup(request.isbn).then(sendResponse);
		return true; // keep the message channel open for the async response
	}
	if (request.action == 'doDiscLookup') {
		doDiscLookup(request).then(sendResponse);
		return true;
	}
});
