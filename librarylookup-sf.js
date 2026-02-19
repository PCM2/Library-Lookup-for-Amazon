var libraryBaseURL = 'https://sflib1.sfpl.org';
var isbnREdelimited = /\/(\d{7,9}[\d|X])\//;

try {
	var isbn = location.href.match(isbnREdelimited)[1];
}
catch(e) {
}

function insertLink(data) {
	var div = document.getElementById('bylineInfo');
	var sp = document.createElement('br');
	var link = document.createElement('a');
	//link.setAttribute ( 'title', data.hrefTitle );
	link.setAttribute('href', libraryBaseURL+'/search/?searchtype=i&searcharg='+data.isbn);
	link.setAttribute('target','_blank');
	var label = document.createTextNode( data.aLabel );
	link.appendChild(label);
	div.appendChild(sp);
	div.appendChild(link);
}

chrome.extension.sendRequest(
		{
		'action' : 'doLookup',
		'isbn' : isbn
		}, 
		insertLink
);
