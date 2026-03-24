const XLSX = require('xlsx');

function excelDateToDayName(value) {
    const strVal = String(value).trim();
    const days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
    if (days.includes(strVal)) return strVal;
    if (strVal.toLowerCase().startsWith('maandag')) return 'Maandag';
    if (strVal.toLowerCase().startsWith('dinsdag')) return 'Dinsdag';
    if (strVal.toLowerCase().startsWith('woensdag')) return 'Woensdag';
    if (strVal.toLowerCase().startsWith('donderdag')) return 'Donderdag';
    if (strVal.toLowerCase().startsWith('vrijdag')) return 'Vrijdag';
    if (strVal.toLowerCase().startsWith('zaterdag')) return 'Zaterdag';
    if (strVal.toLowerCase().startsWith('zondag')) return 'Zondag';
    return strVal || undefined;
}

function testParsing() {
    console.log("🚀 Creating mock Excel file...");
    const data = [
        [], [], [], [], [], [], [], // Row 1-7 (index 0-6)
        ["TERRNR", "MERCHANDISERS", "BEZOEKDAG", "BOX", "FILIAALNR", "FORMULE", "ADRES", "POSTCODE", "PLAATSNAAM"], // Row 8 (index 7)
        ["TERR059", "Alissa Rozema", "maandag 2 maart 2026", "Shurgard Utrecht", "1249", "Albert Heijn", "Hondstrug 60", "3524BR", "UTRECHT"], // Row 9 (index 8)
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AH POS PLANNING WEEK 10");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    console.log("🧪 Running parsing logic...");
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    console.log(`[DEBUG] allRows.length = ${allRows.length}`);

    const clean = (val) => String(val || '').trim().toUpperCase();

    const parseWithHeader = (hdrIdx) => {
        const hdrRow = allRows[hdrIdx] || [];
        const findCol = (keywords) => {
            return hdrRow.findIndex(h => {
                const val = clean(h);
                return keywords.some(k => val.includes(k.toUpperCase()));
            });
        };

        const adresIdx = findCol(['ADRES', 'STRAAT', 'STREET', 'ADDRESS']);
        const mercIdx = findCol(['MERCHAND', 'CHAUFFEUR', 'DRIVER', 'CHAUF']);

        console.log(`Checking Row ${hdrIdx}: adresIdx=${adresIdx}, mercIdx=${mercIdx}`);

        if (adresIdx === -1 || mercIdx === -1) return null;

        const results = [];
        for (let i = hdrIdx + 1; i < allRows.length; i++) {
            const row = allRows[i] || [];
            const adres = String(row[adresIdx] || '').trim();
            const merchandiser = String(row[mercIdx] || '').trim();
            if (!adres || !merchandiser) continue;
            if (clean(adres) === 'ADRES' || clean(adres).includes('STRAAT')) continue;
            results.push({ adres, merchandiser });
        }
        return results;
    };

    let found = false;
    for (let r = 0; r < 20; r++) {
        const res = parseWithHeader(r);
        if (res && res.length > 0) {
            console.log(`✅ SUCCESS! Found it at row ${r} with ${res.length} rows.`);
            found = true;
            break;
        }
    }
    if (!found) console.log("❌ FAILED: Header never found.");
}

testParsing();
