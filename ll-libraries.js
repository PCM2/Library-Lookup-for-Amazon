/* Shared list of supported BiblioCommons libraries, used by both the
   background service worker (via importScripts) and the options page (via
   a <script> tag). Only slug + display name are stored per library — the
   API and search URLs are templated from the slug so there's exactly one
   string per fact. */

var LL_DEFAULT_SLUG = 'sfpl';

var LL_LIBRARIES = [
	{ slug: 'sfpl',             name: 'San Francisco Public' },
	{ slug: 'aclibrary',        name: 'Alameda County' },
	{ slug: 'ccclib',           name: 'Contra Costa County' },
	{ slug: 'marinlibrary',     name: 'Marin County' },
	{ slug: 'smcl',             name: 'San Mateo County' },
	{ slug: 'sccl',             name: 'Santa Clara County' },
	{ slug: 'sonoma',           name: 'Sonoma County' },
	{ slug: 'livermorelibrary', name: 'Livermore' },
	{ slug: 'hayward',          name: 'Hayward' },
	{ slug: 'paloalto',         name: 'Palo Alto' },
	{ slug: 'sjpl',             name: 'San José' },
	{ slug: 'oaklandlibrary',   name: 'Oakland' },
	{ slug: 'napalibrary',      name: 'Napa County' }
];

function llGetLibrary(slug) {
	return LL_LIBRARIES.find(function(lib) {
		return lib.slug === slug;
	}) || null;
}

// Falls back to the default library if slug is unset or not (or no longer)
// in LL_LIBRARIES.
function llResolveLibrary(slug) {
	return llGetLibrary(slug) || llGetLibrary(LL_DEFAULT_SLUG);
}

function llApiURL(lib) {
	return 'https://gateway.bibliocommons.com/v2/libraries/'+lib.slug+'/bibs/search?searchType=keyword&query=';
}

function llSearchURL(lib) {
	return 'https://'+lib.slug+'.bibliocommons.com/v2/search?query=';
}
