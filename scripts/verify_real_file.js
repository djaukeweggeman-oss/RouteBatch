const XLSX = require('xlsx');
const fs = require('fs');

function excelDateToDayName(value) {
    const strVal = String(value).trim();
    const days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
    if (days.includes(strVal)) return strVal;
    const lowerVal = strVal.toLowerCase();
    if (lowerVal.includes('maandag')) return 'Maandag';
    if (lowerVal.includes('dinsdag')) return 'Dinsdag';
    if (lowerVal.includes('woensdag')) return 'Woensdag';
    if (lowerVal.includes('donderdag')) return 'Donderdag';
    if (lowerVal.includes('vrijdag')) return 'Vrijdag';
    if (lowerVal.includes('zaterdag')) return 'Zaterdag';
    if (lowerVal.includes('zondag')) return 'Zondag';
    const numVal = Number(value);
    if (!isNaN(numVal)) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + numVal * 86400000);
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    }
    return strVal || undefined;
}

const filePath = '/Users/aukeweggeman/Desktop/AH_POS_PLANNING_WEEK_10.01.xlsx';
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

const sortedSheets = [...workbook.SheetNames].sort((a, b) => {
    const aUpper = a.toUpperCase();
    const bUpper = b.toUpperCase();
    const aWeight = aUpper.includes('PLANNING') ? 10 : (aUpper.includes('WEEK') ? 5 : 0);
    const bWeight = bUpper.includes('PLANNING') ? 10 : (bUpper.includes('WEEK') ? 5 : 0);
    return bWeight - aWeight;
});

const cleanKey = (val) => String(val || '').trim().toUpperCase().replace(/[^A-Z]/g, '');

let globalBest = { addresses: [], sheetName: '' };

for (const sheetName of sortedSheets) {
    const worksheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    if (!allRows || allRows.length === 0) continue;

    const parseWithHeader = (hdrIdx) => {
        const hdrRow = allRows[hdrIdx] || [];
        const findCol = (keywords) => hdrRow.findIndex(h => {
            const val = cleanKey(h);
            return keywords.some(k => val.includes(cleanKey(k)));
        });

        const adresIdx = findCol(['ADRES', 'STRAAT', 'STREET', 'ADDRESS']);
        // KEY FIX: Added MERCHAN as a short-form to match MERCHANSIDERS
        const mercIdx = findCol(['MERCHANDISER', 'MERCHANSIDER', 'MERCHAND', 'MERCHAN', 'CHAUFFEUR', 'DRIVER', 'CHAUF']);

        if (adresIdx === -1 || mercIdx === -1) return null;

        const plaatsnaamIdx = findCol(['PLAATS', 'CITY', 'TOWN', 'LOCATION']);
        const bezoekdagIdx = findCol(['BEZOEK', 'DAG', 'DAY']);

        const results = [];
        for (let i = hdrIdx + 1; i < allRows.length; i++) {
            const row = allRows[i] || [];
            const adres = String(row[adresIdx] || '').trim();
            const merchandiser = String(row[mercIdx] || '').trim();
            if (!adres || !merchandiser) continue;
            if (cleanKey(adres) === 'ADRES') continue;
            const bezoekdag = bezoekdagIdx >= 0 ? excelDateToDayName(row[bezoekdagIdx]) : undefined;
            const plaats = plaatsnaamIdx >= 0 ? String(row[plaatsnaamIdx] || '').trim() : '';
            results.push({ adres, merchandiser, bezoekdag, plaats });
        }
        return results;
    };

    let sheetBest = [];
    for (let r = 0; r < Math.min(allRows.length, 50); r++) {
        const res = parseWithHeader(r);
        if (res && res.length > sheetBest.length) {
            sheetBest = res;
            if (res.length > 50) break;
        }
    }

    if (sheetBest.length > globalBest.addresses.length) {
        globalBest = { addresses: sheetBest, sheetName };
    }
}

if (globalBest.addresses.length > 0) {
    console.log(`✅ SUCCESS! Sheet: "${globalBest.sheetName}", Found ${globalBest.addresses.length} records`);
    console.log("Sample entry:", globalBest.addresses[0]);
    console.log("Unique drivers:", [...new Set(globalBest.addresses.map(a => a.merchandiser))].slice(0, 5));
} else {
    console.log("❌ FAILED");
}
