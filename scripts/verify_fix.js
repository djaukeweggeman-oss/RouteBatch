const XLSX = require('xlsx');

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
    return strVal || undefined;
}

function testParsing() {
    console.log("🚀 Creating mock Excel file mirroring user structure...");
    const data = [
        [], [], [], [], [], [], [], // Row 1-7 (empty/logo)
        ["TERRNR", "MERCHANDISERS", "BEZOEKDAG", "BOX", "FILIAALNR", "FORMULE", "ADRES", "POSTCODE", "PLAATSNAAM"], // Row 8 (Header)
        ["TERR059", "Alissa Rozema", "maandag 2 maart 2026", "Shurgard", "1249", "AH", "Hondstrug 60", "3524BR", "UTRECHT"], // Data
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AH POS PLANNING WEEK 10");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    console.log("🧪 Running SUPER ROBUST logic...");
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });

    const cleanKey = (val) => String(val || '').trim().toUpperCase().replace(/[^A-Z]/g, '');

    const parseWithHeader = (hdrIdx) => {
        const hdrRow = allRows[hdrIdx] || [];
        const findCol = (keywords) => {
            return hdrRow.findIndex(h => {
                const val = cleanKey(h);
                return keywords.some(k => val.includes(cleanKey(k)));
            });
        };

        const adresIdx = findCol(['ADRES', 'STRAAT', 'STREET', 'ADDRESS']);
        const mercIdx = findCol(['MERCHANDISER', 'CHAUFFEUR', 'DRIVER', 'CHAUF']);

        if (adresIdx === -1 || mercIdx === -1) return null;

        const results = [];
        const bezoekdagIdx = findCol(['BEZOEK', 'DAG', 'DAY']);

        for (let i = hdrIdx + 1; i < allRows.length; i++) {
            const row = allRows[i] || [];
            const adres = String(row[adresIdx] || '').trim();
            const merchandiser = String(row[mercIdx] || '').trim();
            if (!adres || !merchandiser) continue;

            const bezoekdag = bezoekdagIdx >= 0 ? excelDateToDayName(row[bezoekdagIdx]) : undefined;
            results.push({ adres, merchandiser, bezoekdag });
        }
        return results;
    };

    let bestRes = null;
    for (let r = 0; r < 50; r++) {
        const res = parseWithHeader(r);
        if (res && (!bestRes || res.length > bestRes.length)) {
            bestRes = res;
            console.log(`📌 Found potential header at row ${r}`);
        }
    }

    if (bestRes && bestRes.length > 0) {
        console.log(`✅ SUCCESS! Found ${bestRes.length} records.`);
        console.log(`Sample:`, bestRes[0]);
        if (bestRes[0].bezoekdag === 'Maandag') {
            console.log("📅 Date parsing verified!");
        } else {
            console.log("❌ Date parsing FAILED:", bestRes[0].bezoekdag);
        }
    } else {
        console.log("❌ FAILED: Header never found.");
    }
}

testParsing();
