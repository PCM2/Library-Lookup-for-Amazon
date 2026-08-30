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

var isbn = findISBN();

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
