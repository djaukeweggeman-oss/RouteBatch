const XLSX = require('xlsx');
const fs = require('fs');

function excelDateToDayName(value) {
    const strVal = String(value).trim();
    const days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
    if (days.includes(strVal)) return strVal;
    const lowerVal = strVal.toLowerCase();
    for (const [d, name] of [['maandag', 'Maandag'], ['dinsdag', 'Dinsdag'], ['woensdag', 'Woensdag'], ['donderdag', 'Donderdag'], ['vrijdag', 'Vrijdag'], ['zaterdag', 'Zaterdag'], ['zondag', 'Zondag']]) {
        if (lowerVal.includes(d)) return name;
    }
    const numVal = Number(value);
    if (!isNaN(numVal)) {
        const date = new Date(new Date(1899, 11, 30).getTime() + numVal * 86400000);
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    }
    return strVal || undefined;
}

const filePath = '/Users/aukeweggeman/Desktop/AH_POS_PLANNING_WEEK_10.01.xlsx';
const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
const sheet = workbook.Sheets['AH POS PLANNING WEEK 10 '];
const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
const hdrRow = allRows[7];
const cleanKey = v => String(v || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
const findCol = keywords => hdrRow.findIndex(h => { const val = cleanKey(h); return keywords.some(k => val.includes(cleanKey(k))); });

const adresIdx = findCol(['ADRES']);
const mercIdx = findCol(['MERCHANDISER', 'MERCHANSIDER', 'MERCHAND', 'MERCHAN']);
const bezoekdagIdx = findCol(['BEZOEK']);
const teVerwijderenIdx = findCol(['VERWIJDER']);
const plaatsnaamIdx = findCol(['PLAATS']);
const postcodeIdx = findCol(['POSTCODE']);

console.log('Column indices: adres=' + adresIdx + ' merc=' + mercIdx + ' bezoek=' + bezoekdagIdx + ' teverwijderen=' + teVerwijderenIdx);
const productStartIdx = teVerwijderenIdx >= 0 ? teVerwijderenIdx + 1 : 12;
console.log('productStartIdx:', productStartIdx, '-> col header:', hdrRow[productStartIdx]);

// Test first data row
const row = allRows[8];
const adres = String(row[adresIdx] || '').trim();
const merchandiser = String(row[mercIdx] || '').trim();
const bezoekdag = excelDateToDayName(row[bezoekdagIdx]);
let aantalPlaatsingen = 0;
for (let j = productStartIdx; j < row.length; j++) {
    if (String(row[j] || '').trim().toUpperCase() === 'JA') aantalPlaatsingen++;
}
console.log('Row 8:', { adres, merchandiser, bezoekdag, aantalPlaatsingen });

// Count unique addresses per day
const byDay = {};
const uniqueByDay = {};
for (let i = 8; i < allRows.length; i++) {
    const r = allRows[i] || [];
    const a = String(r[adresIdx] || '').trim();
    const m = String(r[mercIdx] || '').trim();
    if (!a || !m) continue;
    const d = excelDateToDayName(r[bezoekdagIdx]) || 'Onbekend';
    const pl = String(r[plaatsnaamIdx] || '').trim();
    const key = `${a}|${pl}`;
    byDay[d] = (byDay[d] || 0) + 1;
    if (!uniqueByDay[d]) uniqueByDay[d] = new Set();
    uniqueByDay[d].add(key);
}
console.log('\nRaw rows per day:', byDay);
console.log('Unique adres+plaats per day:', Object.fromEntries(Object.entries(uniqueByDay).map(([k, v]) => [k, v.size])));
