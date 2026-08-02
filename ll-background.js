/* Code for the background service worker of SF Library Lookup */

var libraryBaseURL = 'https://sflib1.sfpl.org';
var libraryName = 'SF Public';
var libraryAvailability = /CHECK SHELF/;
var libraryDueBack = /DUE (\d{2}-\d{2}-\d{2})/;
var libraryNoRecord = /no matches found/i;
var libraryOrdered = /ordered for/i;

async function doLookup(isbn) {
	var data = {
		'isbn' : isbn,
		'hrefTitle' : null,
		'aLabel': null
	};

	var res = await fetch(libraryBaseURL+'/search/?searchtype=i&searcharg='+isbn);
	var page = await res.text();

	if (libraryNoRecord.test(page)) {
		return null;
	}

	var ordered = libraryOrdered.test(page);

	var libraryFullURL = libraryBaseURL+"/search?/i"+isbn+"/i"+isbn+"/1,1,1,E/holdings&FF=i"+isbn+"&1,1,";
	var resb = await fetch(libraryFullURL);
	var pageb = await resb.text();

	if (libraryAvailability.test(pageb)) {
		data.aLabel = "Hey! It's available at the "+libraryName+" Library!";
		return data;
	}
	if (libraryDueBack.test(pageb)) {
		var due = pageb.match(libraryDueBack)[1];
		data.aLabel = "Due back at the "+libraryName+" Library on or before "+due;
		return data;
	}
	if (ordered) {
		data.aLabel = "On order at the "+libraryName+" Library. Check again soon!";
		return data;
	}

	return null;
}

// Handles messages sent via chrome.runtime.sendMessage().
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.action == 'doLookup') {
		doLookup(request.isbn).then(sendResponse);
		return true; // keep the message channel open for the async response
	}
});
