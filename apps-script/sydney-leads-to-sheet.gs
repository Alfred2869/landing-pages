/**
 * Alpha Abilities Care (Sydney) landing page - quiz submissions to the
 * Sydney leads sheet.
 *
 * Lives as a bound Apps Script on the "Sydney-Alpha Care-Hedgehog
 * LeadSheet" (id 1Ll1QdGvmD5C5AppekdF2kwt5fnpoY4YuSV0pC9imkM4):
 *   Extensions -> Apps Script -> paste this file -> Deploy -> New deployment
 *   -> type "Web app" -> Execute as: Me -> Who has access: Anyone -> Deploy.
 * The web app URL that deployment produces is the page's FORM_ENDPOINT.
 *
 * The page POSTs the payload as JSON in a text/plain body (Apps Script
 * cannot answer a CORS preflight, so the request must stay "simple").
 *
 * ROUTING: STRICTLY by the suburb the person typed into the form (and any
 * 4-digit NSW postcode found in that field), looked up in the explicit
 * Sydney region mapping below - the same strict model as the Rize webhook.
 * There is no broad-region fallback: a lead whose suburb/postcode is not
 * in the mapping goes to the "Unsorted" tab with a REVIEW flag in the
 * Sales Notes column for manual filing.
 *
 * resortUnsorted() is a one-off you run from the editor (Run button) to
 * move rows already sitting in Unsorted into their region tabs using the
 * same rules - Suburb (column G) first, then Postcode (column D). Rows it
 * cannot place stay where they are.
 *
 * Region tabs are found by consonant skeleton (lowercase, letters only,
 * vowels stripped), so "Parramatta (Greater Western Sydney)" matches the
 * Parramatta region and renamed tabs keep working.
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

// Suburb (name) and postcode lists per Sydney region tab, as supplied by
// sales. A suburb name matches on the whole normalised string; a postcode
// matches anywhere it appears in the suburb field. Postcodes are
// unambiguous - no postcode appears in two regions.
var REGIONS = [
  {
    tab: 'Parramatta',
    suburbs: ['Parramatta', 'Westmead', 'Harris Park', 'Granville', 'Merrylands',
      'Rydalmere', 'North Parramatta', 'Holroyd', 'Wentworthville', 'Rosehill'],
    postcodes: ['2150', '2145', '2142', '2160', '2116', '2151']
  },
  {
    tab: 'Hurstville',
    suburbs: ['Hurstville', 'Penshurst', 'Mortdale', 'Oatley', 'Peakhurst',
      'Beverly Hills', 'Kingsgrove', 'Allawah', 'Carlton'],
    postcodes: ['2220', '2222', '2223', '2210', '2209', '2208', '2218']
  },
  {
    tab: 'Penrith',
    suburbs: ['Penrith', 'Emu Plains', 'Jamisontown', 'Cranebrook', 'Kingswood',
      'Cambridge Park', 'Glenmore Park', 'Werrington', 'Jordan Springs'],
    postcodes: ['2750', '2749', '2747', '2745']
  },
  {
    tab: 'Liverpool',
    suburbs: ['Liverpool', 'Casula', 'Moorebank', 'Warwick Farm', 'Lurnea',
      'Chipping Norton', 'Prestons', 'Miller', 'Busby', 'Hoxton Park'],
    postcodes: ['2170', '2168', '2171']
  },
  {
    tab: 'Campbelltown',
    suburbs: ['Campbelltown', 'Macarthur', 'Narellan', 'Camden', 'Leumeah',
      'Minto', 'Ingleburn', 'Gregory Hills', 'Oran Park', 'Mount Annan'],
    postcodes: ['2560', '2567', '2570', '2566', '2565', '2557']
  },
  {
    tab: 'Blacktown',
    suburbs: ['Blacktown', 'Doonside', 'Seven Hills', 'Prospect', 'Marayong',
      'Woodcroft', 'Rooty Hill', 'Mount Druitt', 'Quakers Hill'],
    postcodes: ['2148', '2767', '2147', '2766', '2770', '2763']
  },
  {
    tab: 'Chatswood',
    suburbs: ['Chatswood', 'Willoughby', 'Lane Cove', 'Artarmon', 'Roseville',
      'Lindfield', 'Gordon', 'Pymble', 'Hornsby', 'Asquith', 'Waitara'],
    postcodes: ['2067', '2068', '2066', '2064', '2069', '2070', '2072', '2073', '2077']
  }
];

function skeleton(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
}

// Lowercase letters only, with a trailing "nsw"/"new south wales" dropped,
// so "Penrith NSW" still equals "penrith".
function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/(newsouthwales|nsw)$/, '');
}

// First 4-digit NSW-looking postcode in the text, or ''.
function extractPostcode(s) {
  var m = String(s || '').match(/(?:^|\D)(2\d{3})(?:\D|$)/);
  return m ? m[1] : '';
}

// The region whose suburb list or postcode list covers this lead, or null.
// STRICT: nothing but the mapping routes a lead.
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

// Find the region's tab by consonant skeleton so the long tab names like
// "Parramatta (Greater Western Sydney)" match.
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

// Everyone who gets an email the moment a new lead lands, whichever tab
// it routes to. Sent via MailApp from the account the web app executes as
// (quota: 100 recipients/day on a Gmail account, SHARED with the other
// webhooks on the same account - raise with sales if volume gets near it).
var NOTIFY_EMAILS = [
  'info@alphaabilities.com.au',
  'andrew@alphaabilities.com.au',
  'tina@alphaabilities.com.au'
];

function notifyNewLead_(ss, sheet, data, utm) {
  MailApp.sendEmail({
    to: NOTIFY_EMAILS.join(','),
    subject: 'New lead: ' + (data.name || '(no name)') + ' - ' + sheet.getName() + ' (Alpha Abilities Care Sydney)',
    name: 'Sydney LeadSheet',
    body: [
      'A new lead just landed in the "' + sheet.getName() + '" tab of the Sydney-Alpha Care-Hedgehog LeadSheet.',
      '',
      'Name: ' + (data.name || ''),
      'Mobile: ' + (data.mobile || ''),
      'Email: ' + (data.email || ''),
      'Suburb: ' + (data.suburb || ''),
      'Preferred contact time: ' + (data.preferredContactTime || ''),
      'Quiz outcome: ' + (data.outcome || ''),
      'Ad set: ' + (utm.utm_content || ''),
      'Campaign: ' + (utm.utm_campaign || ''),
      '',
      'Open the tab: ' + ss.getUrl() + '#gid=' + sheet.getSheetId()
    ].join('\n')
  });
}

/**
 * Run ONCE from the editor after pasting this file: triggers the one-time
 * "send email as you" authorisation and emails a sample notification to
 * yourself only (not the team), so you can check the format.
 */
function sendTestNotification() {
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'Sydney LeadSheet lead notifications are set up',
    body: 'Test of the new-lead email. Real leads will notify: ' + NOTIFY_EMAILS.join(', ')
  });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var utm = data.utm || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var region = regionFor(data.suburb);
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
      region ? '' : 'REVIEW: suburb/postcode not in Sydney region mapping',
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

    // Email the team. A mail failure (quota, outage) must never stop the
    // lead from being captured, so it cannot escape this try/catch.
    try { notifyNewLead_(ss, sheet, data, utm); } catch (mailErr) {}

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
 * using the strict suburb/postcode mapping - Suburb (column G) first,
 * then Postcode (column D). Run it from the editor (select resortUnsorted,
 * press Run). Safe to run again later - rows it cannot place stay where
 * they are, with the REVIEW flag added to Sales Notes if that cell is
 * empty.
 */
function resortUnsorted() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName('Unsorted');
  if (!src || src.getLastRow() < 2) return;
  var lastCol = Math.max(src.getLastColumn(), BASE_HEADERS.length + EXTRA_HEADERS.length);
  var rows = src.getRange(2, 1, src.getLastRow() - 1, lastCol).getValues();
  var moved = 0;

  // 0-based columns in the row array: 3 = D Postcode, 5 = F Sales Notes,
  // 6 = G Suburb.
  for (var r = rows.length - 1; r >= 0; r--) {
    var row = rows[r];
    if (!row.join('')) continue; // blank row
    var region = regionFor(row[6]) ||
      (row[3] ? regionFor(String(row[3])) : null);
    if (!region) {
      if (!row[5]) src.getRange(r + 2, 6).setValue('REVIEW: suburb/postcode not in Sydney region mapping');
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

/**
 * One-off tidy-up: delete completely empty rows sitting between leads on
 * every tab (appendRow can leave gaps after rows are cleared by hand).
 * Run it from the editor. Only rows with no content in any cell are
 * removed - anything with even one filled cell is left alone, and no
 * routing rules are involved.
 */
function removeBlankRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = ss.getSheets();
  var total = 0;
  for (var t = 0; t < tabs.length; t++) {
    var sh = tabs[t];
    var last = sh.getLastRow();
    if (last < 2) continue;
    var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
    for (var r = last - 1; r >= 1; r--) { // 0-based; row 0 is the header
      if (!values[r].join('')) {
        sh.deleteRow(r + 1);
        total++;
      }
    }
  }
  Logger.log('Removed ' + total + ' blank row(s).');
}
