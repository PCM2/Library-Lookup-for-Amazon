/* Code for the background page of SF Library Lookup */

var libraryBaseURL = 'https://sflib1.sfpl.org';
var libraryName = 'SF Public';
var libraryAvailability = /CHECK SHELF/;
var libraryDueBack = /DUE (\d{2}-\d{2}-\d{2})/;
var libraryNoRecord = /no matches found/i;
var libraryOrdered = /ordered for/i;
var isbnREplain = /(\d{7,9}[\d|X])/ig;
var isbnREdelimited = /\/(\d{7,9}[\d|X])\//;
var ordered = false;

function doLookup(isbn, callback) {
	var data = {
		'isbn' : isbn,
		'hrefTitle' : null,
		'aLabel': null
	};
	var xhr = new XMLHttpRequest();
	xhr.open("GET",libraryBaseURL+'/search/?searchtype=i&searcharg='+isbn,true);
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4) {
			var page = xhr.responseText;
			if(!libraryNoRecord.test(page)) {
				if(libraryOrdered.test(page)) {
					ordered = true;
				}
				var xhrb = new XMLHttpRequest();
				var libraryFullURL = libraryBaseURL+"/search?/i"+isbn+"/i"+isbn+"/1,1,1,E/holdings&FF=i"+isbn+"&1,1,";
				xhrb.open("GET", libraryFullURL, true);
				xhrb.onreadystatechange = function() {
					if(xhrb.readyState == 4) {
						var page = xhrb.responseText;
						if(libraryAvailability.test(page)) {
							data.aLabel = "Hey! It's available at the "+libraryName+" Library!";
							callback(data);
						}
						if(libraryDueBack.test(page)) {
							var due = page.match(libraryDueBack)[1];
							data.aLabel = "Due back at the "+libraryName+" Library on or before "+due;
							callback(data);
						}
						if(ordered) {
							data.aLabel = "On order at the "+libraryName+" Library. Check again soon!";
							callback(data);
						}
					}
				};
				xhrb.send(null);
			}
		}
	};
	xhr.send(null);
}


//  Handles data sent via chrome.extension.sendRequest().
//  @param request Object Data sent in the request.
//  @param sender Object Origin of the request.
//  @param callback Function The method to call when the request completes.
function onRequest(request, sender, callback) {
	// Only supports the 'fetchTwitterFeed' method, although this could be
	// generalized into a more robust RPC system.
	if (request.action == 'doLookup') {
		doLookup(request.isbn, callback);
	}
}

// Wire up the listener
chrome.extension.onRequest.addListener(onRequest);