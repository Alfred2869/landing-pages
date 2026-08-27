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
 * ROUTING: the sheet keeps one tab per location (Werribee, Melton,
 * Cragieburn, Cranbourne, Geelong, Ringwood). Each lead lands in the tab
 * matching the Meta ad set name carried in utm_content (ad sets are split
 * by location), falling back to the suburb typed into the form. Matching
 * uses a consonant skeleton - lowercase, letters only, vowels stripped -
 * so "Craigieburn | Broad" still hits the "Cragieburn" tab and "Melton "
 * (trailing space) matches "Melton". Anything unmatched goes to an
 * "Unsorted" tab rather than being misfiled.
 *
 * COLUMNS: A-F (Name, Number, Email, Postcode, created_time, Sales Notes)
 * match the existing tabs and are never renamed - the sales flow owns
 * them. Quiz answers and ad attribution live in G onward; those headers
 * are written to a tab the first time a lead lands there.
 */

var BASE_HEADERS = ['Name', 'Number', 'Email', 'Postcode', 'created_time', 'Sales Notes'];

var EXTRA_HEADERS = [
  'Suburb',                // G - self-reported in the form (Postcode stays blank)
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

function skeleton(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
}

function pickSheet(ss, data, utm) {
  var candidates = [utm.utm_content, data.suburb];
  var tabs = ss.getSheets();
  for (var c = 0; c < candidates.length; c++) {
    var cand = skeleton(candidates[c]);
    if (!cand) continue;
    for (var t = 0; t < tabs.length; t++) {
      var name = skeleton(tabs[t].getName());
      if (name && name !== 'nsrtd' && cand.indexOf(name) !== -1) return tabs[t];
    }
  }
  return ss.getSheetByName('Unsorted') || ss.insertSheet('Unsorted');
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
    var sheet = pickSheet(ss, data, utm);
    ensureHeaders(sheet);

    sheet.appendRow([
      data.name || '',
      // Leading apostrophe keeps Sheets from stripping the 0 off 04xx numbers.
      "'" + (data.mobile || ''),
      data.email || '',
      '',                          // Postcode - the quiz collects suburb (col G)
      new Date(),                  // created_time
      '',                          // Sales Notes - yours to fill in
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
