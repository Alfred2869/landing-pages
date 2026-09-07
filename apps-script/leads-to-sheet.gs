/**
 * Alpha Abilities landing page - quiz submissions to the leads sheet.
 *
 * Lives as a bound Apps Script on the "Alpha-Hedgehog LeadSheet":
 *   Extensions -> Apps Script -> paste this file -> Deploy -> New deployment
 *   -> type "Web app" -> Execute as: Me -> Who has access: Anyone -> Deploy.
 * The web app URL that deployment produces is the page's FORM_ENDPOINT.
 *
 * The page POSTs the payload as JSON in a text/plain body (Apps Script
 * cannot answer a CORS preflight, so the request must stay "simple").
 *
 * ROUTING: strictly by the suburb the person typed into the form (and any
 * 4-digit postcode found in that field), looked up in the explicit
 * region mapping below. The Meta ad set / campaign name is NOT used for
 * routing any more - it told us which ads the person saw, not where they
 * live, which is how leads ended up in the wrong tabs. If the suburb
 * field holds no mapped suburb/postcode, the Q4 region answer routes the
 * lead instead: current labels ("Werribee & surrounding suburbs (Western
 * region)" etc.) via the anchor-suburb scan, legacy compass labels
 * ("Melbourne West" etc.) via Q4_LABEL_TABS. "Other (Somewhere else)"
 * and anything still unmatched goes to the "Unsorted" tab with a review
 * flag in the Sales Notes column.
 *
 * resortUnsorted() is a one-off you run from the editor (Run button) to
 * move rows already sitting in Unsorted into their region tabs using the
 * same rules. Rows it cannot place stay where they are.
 *
 * Region tabs are found by consonant skeleton (lowercase, letters only,
 * vowels stripped), so the existing "Cragieburn" tab still matches the
 * Craigieburn region and renamed tabs like "Werribee & Surrounding
 * Suburbs" keep working.
 *
 * COLUMNS: A-F (Name, Number, Email, Postcode, created_time, Sales Notes)
 * match the existing tabs and are never renamed - the sales flow owns
 * them. Quiz answers and ad attribution live in G onward; those headers
 * are written to a tab the first time a lead lands there.
 */

var BASE_HEADERS = ['Name', 'Number', 'Email', 'Postcode', 'created_time', 'Sales Notes'];

var EXTRA_HEADERS = [
  'Suburb',                // G - self-reported in the form
  'Preferred contact time',
  'Quiz outcome',          // qualified | funding_unsure
  'Q1 NDIS participant',
  'Q2 Therapy funding',
  'Q3 Child age',
  'Q4 Region',             // self-reported broad region
  'Q5 Looking for',
  'Ad set',                // utm_content <- Meta {{adset.name}}
  'Campaign',              // utm_campaign <- Meta {{campaign.name}}
  'Ad',                    // utm_term <- Meta {{ad.name}}
  'UTM source',
  'UTM medium'
];

// Suburb (name) and postcode lists per region tab, as supplied by sales.
// A suburb name matches on the whole normalised string; a postcode matches
// anywhere it appears in the suburb field. Postcodes are unambiguous - no
// postcode appears in two regions.
var REGIONS = [
  {
    tab: 'Werribee',
    suburbs: ['Werribee', 'Hoppers Crossing', 'Point Cook', 'Tarneit', 'Truganina',
      'Wyndham Vale', 'Manor Lakes', 'Williams Landing', 'Laverton', 'Laverton North',
      'Altona', 'Altona Meadows', 'Altona North', 'Seabrook', 'Mount Cottrell',
      'Little River', 'Cocoroc', 'Mambourin', 'Quandong'],
    postcodes: ['3030', '3029', '3024', '3027', '3028', '3026', '3018', '3025', '3211']
  },
  {
    tab: 'Melton',
    suburbs: ['Melton', 'Melton South', 'Melton West', 'Kurunjang', 'Harkness',
      'Brookfield', 'Exford', 'Eynesbury', 'Toolern Vale', 'Weir Views', 'Cobblebank',
      'Aintree', 'Deanside', 'Rockbank', 'Caroline Springs', 'Taylors Hill',
      'Burnside', 'Burnside Heights', 'Sunbury', 'Diggers Rest', 'Wildwood', 'Bulla',
      'Gisborne', 'New Gisborne', 'Riddells Creek', 'Goonawarra'],
    postcodes: ['3337', '3338', '3336', '3335', '3023', '3037', '3429', '3427',
      '3428', '3437', '3438', '3431']
  },
  {
    tab: 'Craigieburn',
    suburbs: ['Craigieburn', 'Roxburgh Park', 'Mickleham', 'Kalkallo', 'Donnybrook',
      'Wollert', 'Epping', 'Epping North', 'Greenvale', 'Meadow Heights',
      'Broadmeadows', 'Campbellfield', 'Somerton', 'Coolaroo', 'Attwood', 'Wallan',
      'Beveridge', 'Yuroke', 'Merrifield'],
    postcodes: ['3064', '3756', '3750', '3076', '3059', '3048', '3047', '3061',
      '3062', '3049', '3753', '3063']
  },
  {
    tab: 'Cranbourne',
    suburbs: ['Cranbourne', 'Cranbourne East', 'Cranbourne West', 'Cranbourne North',
      'Cranbourne South', 'Botanic Ridge', 'Junction Village', 'Lyndhurst', 'Lynbrook',
      'Hampton Park', 'Narre Warren', 'Narre Warren South', 'Narre Warren North',
      'Berwick', 'Beaconsfield', 'Officer', 'Pakenham', 'Clyde', 'Clyde North',
      'Pearcedale', 'Devon Meadows', 'Tooradin', 'Blind Bight'],
    postcodes: ['3977', '3975', '3976', '3805', '3804', '3806', '3807', '3809',
      '3810', '3978', '3912', '3980']
  },
  {
    tab: 'Ringwood',
    suburbs: ['Ringwood', 'Ringwood East', 'Ringwood North', 'Mitcham', 'Heathmont',
      'Vermont', 'Vermont South', 'Wantirna', 'Wantirna South', 'Croydon',
      'Croydon Hills', 'Croydon North', 'Croydon South', 'Bayswater',
      'Bayswater North', 'Boronia', 'Kilsyth', 'Kilsyth South', 'Chirnside Park',
      'Lilydale', 'Donvale', 'Doncaster', 'Doncaster East', 'Nunawading'],
    postcodes: ['3134', '3135', '3132', '3133', '3152', '3136', '3153', '3155',
      '3137', '3116', '3140', '3111', '3108', '3109', '3131']
  },
  {
    tab: 'Geelong',
    suburbs: ['Geelong', 'Geelong West', 'East Geelong', 'South Geelong',
      'North Geelong', 'Newtown', 'Belmont', 'Highton', 'Wandana Heights',
      'Grovedale', 'Marshall', 'Waurn Ponds', 'Armstrong Creek', 'Mount Duneed',
      'Freshwater Creek', 'Torquay', 'Jan Juc', 'Ocean Grove', 'Barwon Heads',
      'Leopold', 'Clifton Springs', 'Drysdale', 'Portarlington', 'Lara', 'Corio',
      'Norlane', 'Lovely Banks', 'Bell Post Hill', 'Hamlyn Heights', 'Herne Hill',
      'Fyansford', 'Charlemont', 'Curlewis'],
    postcodes: ['3220', '3218', '3219', '3215', '3216', '3217', '3228', '3226',
      '3227', '3224', '3222', '3223', '3212', '3214', '3213']
  }
];

function skeleton(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
}

// Lowercase letters only, with a trailing "vic"/"victoria" dropped, so
// "Hoppers Crossing VIC" still equals "hopperscrossing".
function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/(victoria|vic)$/, '');
}

// First 4-digit Victorian-looking postcode in the text, or ''.
function extractPostcode(s) {
  var m = String(s || '').match(/(?:^|\D)(3\d{3})(?:\D|$)/);
  return m ? m[1] : '';
}

// Legacy broad Q4 quiz labels -> region tab (the quiz used compass regions
// until Sep 2026). Kept so old rows still re-sort. Keys are normalise()d.
// Current Q4 labels ("Werribee & surrounding suburbs (Western region)", etc.)
// name their anchor suburb and are matched by the anchor scan in
// regionForLead; "Other (Somewhere else)" matches nothing -> Unsorted.
var Q4_LABEL_TABS = {
  melbournewest: 'Werribee',
  melbournenorthwest: 'Melton',
  melbournenorth: 'Craigieburn',
  melbournesoutheast: 'Cranbourne',
  geelong: 'Geelong'
};

// The region whose suburb list or postcode list covers this lead, or null.
function regionFor(suburbText) {
  var name = normalise(suburbText);
  var postcode = extractPostcode(suburbText);
  for (var i = 0; i < REGIONS.length; i++) {
    var r = REGIONS[i];
    for (var j = 0; j < r.suburbs.length; j++) {
      if (name && normalise(r.suburbs[j]) === name) return r;
    }
    if (postcode && r.postcodes.indexOf(postcode) !== -1) return r;
  }
  return null;
}

function regionForTabName(tabName) {
  for (var i = 0; i < REGIONS.length; i++) {
    if (REGIONS[i].tab === tabName) return REGIONS[i];
  }
  return null;
}

// Suburb/postcode mapping first; broad Q4 label (in the Q4 answer or left
// sitting in the suburb field) second; null means Unsorted.
function regionForLead(suburbText, q4Region) {
  var region = regionFor(suburbText);
  if (region) return region;
  var byLabel = Q4_LABEL_TABS[normalise(q4Region)] || Q4_LABEL_TABS[normalise(suburbText)];
  if (byLabel) return regionForTabName(byLabel);
  // Anchor scan: current Q4 labels contain their region's anchor suburb
  // ("Ringwood & surrounding suburbs (Eastern region)" -> Ringwood).
  var q4 = normalise(q4Region);
  for (var i = 0; i < REGIONS.length; i++) {
    if (q4 && q4.indexOf(normalise(REGIONS[i].tab)) !== -1) return REGIONS[i];
  }
  return null;
}

// Find the region's tab by consonant skeleton so "Cragieburn" (sheet
// spelling) and longer names like "Werribee & Surrounding Suburbs" match.
function tabForRegion(ss, region) {
  var want = skeleton(region.tab);
  var tabs = ss.getSheets();
  for (var t = 0; t < tabs.length; t++) {
    if (skeleton(tabs[t].getName()).indexOf(want) !== -1) return tabs[t];
  }
  return ss.insertSheet(region.tab);
}

function ensureHeaders(sheet) {
  if (!sheet.getRange(1, 1).getValue()) {
    sheet.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);
  }
  if (!sheet.getRange(1, 7).getValue()) {
    sheet.getRange(1, 7, 1, EXTRA_HEADERS.length).setValues([EXTRA_HEADERS]);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var utm = data.utm || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var region = regionForLead(data.suburb, data.q4_region);
    var sheet = region
      ? tabForRegion(ss, region)
      : (ss.getSheetByName('Unsorted') || ss.insertSheet('Unsorted'));
    ensureHeaders(sheet);

    sheet.appendRow([
      data.name || '',
      // Leading apostrophe keeps Sheets from stripping the 0 off 04xx numbers.
      "'" + (data.mobile || ''),
      data.email || '',
      extractPostcode(data.suburb),
      new Date(),                  // created_time
      region ? '' : 'REVIEW: suburb/postcode not in region mapping',
      data.suburb || '',
      data.preferredContactTime || '',
      data.outcome || '',
      data.q1_ndisParticipant || '',
      data.q2_therapyFunding || '',
      data.q3_childAge || '',
      data.q4_region || '',
      data.q5_lookingFor || '',
      utm.utm_content || '',
      utm.utm_campaign || '',
      utm.utm_term || '',
      utm.utm_source || '',
      utm.utm_medium || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * One-off: move rows already sitting in Unsorted into their region tabs
 * using the suburb/postcode mapping (with the Q4-label fallback). Run it
 * from the editor (select resortUnsorted, press Run). Safe to run again
 * later - rows it cannot place stay where they are, with the REVIEW flag
 * added to Sales Notes if that cell is empty.
 */
function resortUnsorted() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName('Unsorted');
  if (!src || src.getLastRow() < 2) return;
  var lastCol = Math.max(src.getLastColumn(), BASE_HEADERS.length + EXTRA_HEADERS.length);
  var rows = src.getRange(2, 1, src.getLastRow() - 1, lastCol).getValues();
  var moved = 0;

  // 0-based columns in the row array: 3 = D Postcode, 5 = F Sales Notes,
  // 6 = G Suburb, 12 = M Q4 Region.
  for (var r = rows.length - 1; r >= 0; r--) {
    var row = rows[r];
    if (!row.join('')) continue; // blank row
    var region = regionForLead(row[6], row[12]) ||
      (row[3] ? regionForLead(String(row[3]), '') : null);
    if (!region) {
      if (!row[5]) src.getRange(r + 2, 6).setValue('REVIEW: suburb/postcode not in region mapping');
      continue;
    }
    var target = tabForRegion(ss, region);
    ensureHeaders(target);
    // Re-apply the leading apostrophe so mobiles keep their 0.
    var out = row.slice();
    if (out[1] !== '' && String(out[1]).charAt(0) !== "'") out[1] = "'" + out[1];
    target.appendRow(out);
    src.deleteRow(r + 2);
    moved++;
  }
  Logger.log('Moved ' + moved + ' row(s) out of Unsorted.');
}
