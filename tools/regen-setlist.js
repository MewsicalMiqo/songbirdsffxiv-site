/* Regenerate js/setlist.js (the offline fallback) from the live Google Sheet CSV.
   Run: node tools/regen-setlist.js
   Safe to run from CI or locally; writes the raw CSV into a window.__SETLIST_CSV
   template literal that js/songs.js parses with the same parseCsv(). */
const fs = require('fs');
const path = require('path');

const SHEET =
  'https://docs.google.com/spreadsheets/d/11OQlZcT47EdxhrQsVoqSgxDSZO_5woaWy9YhXHYplIQ/export?format=csv';

function embed(csv) {
  // Escape anything that would break out of a JS template literal.
  return csv.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

(async () => {
  const res = await fetch(SHEET);
  if (!res.ok) throw new Error('Sheet fetch failed: HTTP ' + res.status);
  let csv = (await res.text()).replace(/^\ufeff/, '');
  if (!csv.trim()) throw new Error('Sheet returned an empty CSV');

  const out =
    '/* Songbirds static setlist fallback. Auto-generated from: ' + SHEET + ' */\n' +
    'window.__SETLIST_CSV =\n`' + embed(csv) + '`;\n';

  const dest = path.join(__dirname, '..', 'js', 'setlist.js');
  fs.writeFileSync(dest, out);
  const rows = csv.split(/\r?\n/).filter((l) => l.trim()).length;
  console.log('Wrote ' + dest + ' (' + out.length + ' chars, ~' + rows + ' CSV rows)');
})().catch((err) => {
  console.error('regen-setlist failed:', err.message);
  process.exit(1);
});
