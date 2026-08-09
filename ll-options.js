/* Code for the extension's options page: lets the user pick which
   BiblioCommons library to check against, persisted to chrome.storage.sync
   so it follows them across Chrome installs. */

function populateOptions() {
	var select = document.getElementById('librarySelect');
	LL_LIBRARIES.forEach(function(lib) {
		var option = document.createElement('option');
		option.value = lib.slug;
		option.textContent = lib.name+' Library';
		select.appendChild(option);
	});
}

async function restoreSelection() {
	var select = document.getElementById('librarySelect');
	var stored = await chrome.storage.sync.get('selectedLibrary');
	select.value = stored.selectedLibrary || LL_DEFAULT_SLUG;
}

async function saveSelection() {
	var select = document.getElementById('librarySelect');
	await chrome.storage.sync.set({ selectedLibrary: select.value });
}

document.addEventListener('DOMContentLoaded', function() {
	populateOptions();
	restoreSelection();
	document.getElementById('librarySelect').addEventListener('change', saveSelection);
});
