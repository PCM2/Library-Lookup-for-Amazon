var isbnREdelimited = /\/(\d{9}[\dX])(?:[/?#]|$)/;

// Pulls digits (and a trailing X check digit) out of a product-details
// label's text, e.g. "ISBN-13 ‏ : ‎ 979-8217046959" -> "9798217046959".
// Returns null unless the result is a plausible ISBN-10 or ISBN-13 length.
function digitsFromLabel(text) {
	var digits = text.replace(/[^0-9Xx]/g, '').toUpperCase();
	return (digits.length === 10 || digits.length === 13) ? digits : null;
}

// Newer and self-published books are often assigned an Amazon ASIN that
// isn't derived from their ISBN at all -- notably books with a 979-prefixed
// ISBN, which has no ISBN-10 equivalent for the ASIN to encode in the first
// place. Neither the current URL nor the format-switcher links contain the
// ISBN in that case, even on the print edition's own page. The ISBN is
// still printed as plain text in the product-details panel, though, so read
// it from there as a last resort. Prefer ISBN-13 (toISBN13 in the
// background worker passes it through unchanged; an ISBN-10 still needs
// converting, and a 979-prefixed book won't even have one).
function findISBNInDetails() {
	var rows = document.querySelectorAll(
		'#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr'
	);
	var isbn10 = null, isbn13 = null;
	for (var i = 0; i < rows.length; i++) {
		var text = rows[i].textContent;
		if (/ISBN-13/.test(text)) {
			isbn13 = isbn13 || digitsFromLabel(text.split(/ISBN-13/)[1]);
		} else if (/ISBN-10/.test(text)) {
			isbn10 = isbn10 || digitsFromLabel(text.split(/ISBN-10/)[1]);
		}
	}
	return isbn13 || isbn10 || null;
}

function findISBN() {
	var m = location.href.match(isbnREdelimited);
	if (m) {
		return m[1];
	}

	// Amazon's default listing for a book is often the Kindle or Audible
	// edition, which has no ISBN in its URL. Fall back to the print-format
	// links in the format switcher, which point at ISBN-bearing URLs even
	// when the current page doesn't.
	var swatchLinks = document.querySelectorAll('#tmmSwatches a[href*="/dp/"]');
	for (var i = 0; i < swatchLinks.length; i++) {
		var sm = swatchLinks[i].getAttribute('href').match(isbnREdelimited);
		if (sm) {
			return sm[1];
		}
	}

	return findISBNInDetails();
}

// Product-details rows as {label, value} pairs. Covers both the bulleted
// layout ("Item model number ‏ : ‎ 191329253045", with invisible direction
// marks around the colon) and the older two-column table layout.
function detailPairs() {
	var pairs = [];
	document.querySelectorAll('#detailBullets_feature_div li').forEach(function(li) {
		var text = li.textContent.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ');
		var m = text.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
		if (m) {
			pairs.push({ label: m[1], value: m[2] });
		}
	});
	document.querySelectorAll('#productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr').forEach(function(tr) {
		var th = tr.querySelector('th'), td = tr.querySelector('td');
		if (th && td) {
			pairs.push({
				label: th.textContent.replace(/\s+/g, ' ').trim(),
				value: td.textContent.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim()
			});
		}
	});
	return pairs;
}

function detailValue(pairs, labelRE) {
	var pair = pairs.find(function(p) { return labelRE.test(p.label); });
	return pair ? pair.value : null;
}

// Trailing words Amazon appends to disc titles that library catalogs don't
// use: format names, edition names, packaging. Removed repeatedly from the
// end, so "The Princess Bride 30th Anniversary Edition DVD" -> "The Princess
// Bride".
var DISC_TITLE_JUNK = new RegExp('(?:[\\s+,/&]|\\band\\b)*(?:\\b\\d+-)?\\b(?:dvd|blu-?ray|bd|4k|ultra hd|uhd|hd|digital|' +
	'widescreen|full ?screen|steelbook|combo pack|box set|\\d+ discs?|' +
	'(?:\\d+(?:st|nd|rd|th) )?anniversary edition|' +
	"(?:(?:special|collector'?s|limited|deluxe|extended|unrated|remastered|criterion) )+edition|" +
	"director'?s cut|edition)\\s*$", 'i');

function cleanDiscTitle(title) {
	var t = title
		.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
		.split(/\s+-\s+/)[0]
		.replace(/\s+/g, ' ')
		.trim();
	var prev;
	do {
		prev = t;
		t = t.replace(DISC_TITLE_JUNK, '').trim();
	} while (t && t !== prev);
	return t;
}

// For DVD/Blu-ray/4K pages: the UPC (when Amazon shows one), candidate
// titles to search for, the disc format, and director names. Returns null
// for anything that isn't a disc.
function findDiscInfo() {
	var pairs = detailPairs();
	// Check both the Media Format row and the byline's "Format:". Either
	// can be the only one naming the disc type: the row sometimes holds
	// just "Collector's Edition" (e.g. the Lord of the Rings box set).
	var mediaFormat = detailValue(pairs, /^(Media )?Format$/i) || '';
	var byline = document.getElementById('bylineInfo');
	var bm = byline && byline.textContent.match(/Format:\s*([^\n]+)/);
	if (bm) {
		mediaFormat += ' '+bm[1];
	}
	if (!/\bDVD\b(?!-ROM)|Blu-?ray|\b4K\b/i.test(mediaFormat)) {
		return null;
	}
	var format = /Blu-?ray|\b4K\b/i.test(mediaFormat) ? 'BLURAY' : 'DVD';

	// Studios' recent releases list the UPC as the "Item model number";
	// others put a catalog number there (e.g. Criterion's "CTIN1877"), which
	// the 12/13-digit check rules out.
	var upc = null;
	var model = (detailValue(pairs, /^(Item model number|UPC)$/i) || '').replace(/\s+/g, '');
	if (/^\d{12,13}$/.test(model)) {
		upc = model;
	}

	var titles = [];
	var titleEl = document.getElementById('productTitle');
	var cleaned = titleEl ? cleanDiscTitle(titleEl.textContent) : '';
	if (cleaned) {
		titles.push(cleaned);
		// "The Office: The Complete Series" is cataloged as "The Office".
		var beforeColon = cleaned.split(':')[0].trim();
		if (beforeColon && beforeColon !== cleaned) {
			titles.push(beforeColon);
		}
	}

	var directors = [];
	var directorRow = detailValue(pairs, /^Directors?$/i);
	if (directorRow) {
		directors = directorRow.split(',');
	}
	var bylineEl = document.getElementById('bylineInfo');
	if (bylineEl) {
		var re = /([^,()]+?)\s*\(Director\)/g, dm;
		while ((dm = re.exec(bylineEl.textContent))) {
			directors.push(dm[1]);
		}
	}
	directors = directors.map(function(d) { return d.trim(); }).filter(Boolean);

	if (!upc && !titles.length) {
		return null;
	}
	return { upc: upc, titles: titles, format: format, directors: directors };
}

function insertLink(data) {
	var div = document.getElementById('bylineInfo');
	if (!div) {
		return;
	}
	var sp = document.createElement('br');
	var link = document.createElement('a');
	if (data.hrefTitle) {
		link.setAttribute('title', data.hrefTitle);
	}
	link.setAttribute('href', data.searchHref);
	link.setAttribute('target','_blank');
	var label = document.createTextNode( data.aLabel );
	link.appendChild(label);
	div.appendChild(sp);
	div.appendChild(link);
}

// Check for a disc page before looking for an ISBN. Movie pages can have
// a book edition in the format switcher (e.g. a "Paperback" swatch on The
// Good, the Bad and the Ugly), and older discs often have all-digit ASINs
// that look like ISBN-10s in the URL. Either would send a disc page down
// the book path, which finds nothing.
var disc = findDiscInfo();
if (disc) {
	chrome.runtime.sendMessage(
			{
			'action' : 'doDiscLookup',
			'upc' : disc.upc,
			'titles' : disc.titles,
			'format' : disc.format,
			'directors' : disc.directors
			},
			function(data) {
				// Book link (if any) first, then the disc link.
				(data && data.links || []).forEach(insertLink);
			}
	);
} else {
	var isbn = findISBN();
	if (isbn) {
		chrome.runtime.sendMessage(
				{
				'action' : 'doLookup',
				'isbn' : isbn
				},
				function(data) {
					if (data) {
						insertLink(data);
					}
				}
		);
	}
}
