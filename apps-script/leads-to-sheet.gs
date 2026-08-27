/**
 * Alpha Abilities landing page - quiz submissions to the leads sheet.
 *
 * Lives as a bound Apps Script on the Google leads sheet:
 *   Extensions -> Apps Script -> paste this file -> Deploy -> New deployment
 *   -> type "Web app" -> Execute as: Me -> Who has access: Anyone -> Deploy.
 * The web app URL that deployment produces is the page's FORM_ENDPOINT.
 *
 * The page POSTs the payload as JSON in a text/plain body (Apps Script
 * cannot answer a CORS preflight, so the request must stay "simple").
 *
 * Column layout: the sheet's existing columns A-F (Name, Number, Email,
 * Postcode, created_time, Sales Notes) are written to but never renamed -
 * the sales flow owns them. Quiz answers and ad attribution live in G
 * onward; those headers are written once, the first time a lead arrives.
 */

var EXTRA_HEADERS = [
  'Suburb',                // G - self-reported in the form (Postcode stays blank)
  'Preferred contact time',
  'Quiz outcome',          // qualified | funding_unsure
  'Q1 NDIS participant',
  'Q2 Therapy funding',
  'Q3 Child age',
  'Q4 Region',             // self-reported region, cross-check against Ad set
  'Q5 Looking for',
  'Ad set (location)',     // utm_content <- Meta {{adset.name}}
  'Campaign',              // utm_campaign <- Meta {{campaign.name}}
  'Ad',                    // utm_term <- Meta {{ad.name}}
  'UTM source',
  'UTM medium'
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var utm = data.utm || {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    if (!sheet.getRange(1, 7).getValue()) {
      sheet.getRange(1, 7, 1, EXTRA_HEADERS.length).setValues([EXTRA_HEADERS]);
    }

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
