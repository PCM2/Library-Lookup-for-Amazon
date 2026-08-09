var librarySearchURL = 'https://sfpl.bibliocommons.com/v2/search?query=';
var isbnREdelimited = /\/(\d{9}[\dX])(?:[/?#]|$)/;

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

	return null;
}

var isbn = findISBN();

function insertLink(data) {
	var div = document.getElementById('bylineInfo');
	if (!div) {
		return;
	}
	var sp = document.createElement('br');
	var link = document.createElement('a');
	//link.setAttribute ( 'title', data.hrefTitle );
	link.setAttribute('href', librarySearchURL+encodeURIComponent(data.isbn));
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
