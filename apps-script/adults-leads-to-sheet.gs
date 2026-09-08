/**
 * Alpha Abilities ADULTS landing page (go.alphaabilities.com.au/adults/) -
 * quiz submissions to the adults leads sheet.
 *
 * Lives as a bound Apps Script on the adults LeadSheet
 * (spreadsheet id 16z-q3j5CEDxtndsf28PXi_nvjiHxudOB-qtT-q06PoE):
 *   Extensions -> Apps Script -> paste this file -> Deploy -> New deployment
 *   -> type "Web app" -> Execute as: Me -> Who has access: Anyone -> Deploy.
 * The web app URL that deployment produces is the adults page's FORM_ENDPOINT.
 *
 * The page POSTs the payload as JSON in a text/plain body (Apps Script
 * cannot answer a CORS preflight, so the request must stay "simple").
 *
 * ROUTING: by the Q2 answer - "Would you prefer in-home or in-clinic
 * sessions?" - into the two tabs sales works from:
 *   "In-home sessions"   -> tab "In-home"
 *   "In-clinic sessions" -> tab "Clinic"
 * Anything else (should not happen - Q2 is required to reach the form)
 * lands in "In-home" with a REVIEW flag in Sales Notes.
 *
 * COLUMNS: A-F (Name, Number, Email, Postcode, created_time, Sales Notes)
 * match the LeadSheet template - the sales flow owns them and they are
 * never renamed. Quiz answers and ad attribution live in G onward; those
 * headers are written to a tab the first time a lead lands there (and by
 * setupTabs(), which you can run once from the editor).
 *
 * Payload keys sent by the adults page:
 *   name, mobile, email, postcode, preferredContactTime, outcome, page,
 *   q1_ndisParticipant, q2_sessionPreference, q3_region, utm{...}
 */

var SPREADSHEET_ID = '16z-q3j5CEDxtndsf28PXi_nvjiHxudOB-qtT-q06PoE';

var BASE_HEADERS = ['Name', 'Number', 'Email', 'Postcode', 'created_time', 'Sales Notes'];

var EXTRA_HEADERS = [
  'Preferred contact time', // G
  'Q1 NDIS participant',    // H
  'Q2 Session preference',  // I  - drives the tab (In-home / Clinic)
  'Q3 Region',              // J  - self-reported broad region
  'Ad set',                 // K  - utm_content <- Meta {{adset.name}}
  'Campaign',               // L  - utm_campaign <- Meta {{campaign.name}}
  'Ad',                     // M  - utm_term <- Meta {{ad.name}}
  'UTM source',             // N
  'UTM medium',             // O
  'Page'                    // P  - which landing page sent the lead
];

function skeleton(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// First 4-digit Victorian-looking postcode in the text, or ''.
function extractPostcode(s) {
  var m = String(s || '').match(/(?:^|\D)(3\d{3})(?:\D|$)/);
  return m ? m[1] : '';
}

// "In-clinic sessions" -> Clinic, "In-home sessions" -> In-home, else null.
function tabNameForPreference(pref) {
  var p = skeleton(pref);
  if (p.indexOf('clinic') !== -1) return 'Clinic';
  if (p.indexOf('home') !== -1) return 'In-home';
  return null;
}

// Find a tab by consonant-insensitive match so a renamed "In Home" or
// "clinic" tab keeps working; create it if it is missing entirely.
function findTab(ss, name) {
  var want = skeleton(name);
  var tabs = ss.getSheets();
  for (var t = 0; t < tabs.length; t++) {
    if (skeleton(tabs[t].getName()).indexOf(want) !== -1) return tabs[t];
  }
  return ss.insertSheet(name);
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
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var tabName = tabNameForPreference(data.q2_sessionPreference);
    var sheet = findTab(ss, tabName || 'In-home');
    ensureHeaders(sheet);

    sheet.appendRow([
      data.name || '',
      // Leading apostrophe keeps Sheets from stripping the 0 off 04xx numbers.
      "'" + (data.mobile || ''),
      data.email || '',
      extractPostcode(data.postcode) || (data.postcode || ''),
      new Date(),                  // created_time
      tabName ? '' : 'REVIEW: no session preference in payload',
      data.preferredContactTime || '',
      data.q1_ndisParticipant || '',
      data.q2_sessionPreference || '',
      data.q3_region || '',
      utm.utm_content || '',
      utm.utm_campaign || '',
      utm.utm_term || '',
      utm.utm_source || '',
      utm.utm_medium || '',
      data.page || ''
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
 * One-off: run from the editor after pasting this script to write the
 * headers onto the Clinic and In-home tabs so the columns are visible
 * before the first lead arrives.
 */
function setupTabs() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureHeaders(findTab(ss, 'Clinic'));
  ensureHeaders(findTab(ss, 'In-home'));
}
