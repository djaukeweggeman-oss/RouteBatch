import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Mock the types since we are in a script
type Address = {
    filiaalnr?: string;
    formule?: string;
    straat: string;
    postcode: string;
    plaats: string;
    merchandiser: string;
    volledigAdres: string;
    aantalPlaatsingen: number;
    bezoekdag?: string;
};

// Re-implement or import the logic from excel.ts
// For the sake of this test, I will copy the logic directly to see where it fails

function excelDateToDayName(value: any): string | undefined {
    try {
        const strVal = String(value).trim();
        const days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
        if (days.includes(strVal)) return strVal;

        // This is where it might fail for "maandag 2 maart 2026"
        if (strVal.toLowerCase().startsWith('maandag')) return 'Maandag';
        if (strVal.toLowerCase().startsWith('dinsdag')) return 'Dinsdag';
        if (strVal.toLowerCase().startsWith('woensdag')) return 'Woensdag';
        if (strVal.toLowerCase().startsWith('donderdag')) return 'Donderdag';
        if (strVal.toLowerCase().startsWith('vrijdag')) return 'Vrijdag';
        if (strVal.toLowerCase().startsWith('zaterdag')) return 'Zaterdag';
        if (strVal.toLowerCase().startsWith('zondag')) return 'Zondag';

        const numVal = Number(value);
        if (isNaN(numVal)) return strVal || undefined;
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + numVal * 86400000);
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    } catch (e) {
        return String(value).trim() || undefined;
    }
}

async function testParsing() {
    console.log("🚀 Creating mock Excel file...");

    const data = [
        [], // Row 1
        ["", "", "", "", "", "", "MAAND OVERZICHT"], // Row 2
        [], [], [], [], [], // Rows 3-7
        ["TERRNR", "MERCHANDISERS", "BEZOEKDAG", "BOX", "FILIAALNR", "FORMULE", "ADRES", "POSTCODE", "PLAATSNAAM"], // Row 8 (Header)
        ["TERR059", "Alissa Rozema", "maandag 2 maart 2026", "Shurgard Utrecht", "1249", "Albert Heijn", "Hondstrug 60", "3524BR", "UTRECHT"], // Row 9
        ["TERR059", "Alissa Rozema", "maandag 2 maart 2026", "Shurgard Utrecht", "1316", "Albert Heijn", "Handelstraat 53", "3533GJ", "UTRECHT"], // Row 10
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AH POS PLANNING WEEK 10");

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    console.log("🧪 Running parsing logic...");

    // --- START OF LOGIC FROM EXCEL.TS ---
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sortedSheets = [...workbook.SheetNames].sort((a, b) => {
            const aHasPlan = a.toUpperCase().includes('PLANNING') ? 1 : 0;
            const bHasPlan = b.toUpperCase().includes('PLANNING') ? 1 : 0;
            return bHasPlan - aHasPlan;
        });

        let globalBestResult: any = { addresses: [], drivers: [], sheetName: "" };

        for (const sheetName of sortedSheets) {
            const worksheet = workbook.Sheets[sheetName];
            const allRows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: "" }) as any[][];
            const clean = (val: any) => String(val || '').trim().toUpperCase();

            const parseWithHeader = (hdrIdx: number) => {
                const resultAddrs: Address[] = [];
                const resultDrivers = new Set<string>();
                const hdrRow = allRows[hdrIdx] || [];

                const findCol = (keywords: string[]) => {
                    return hdrRow.findIndex(h => {
                        const val = clean(h);
                        return keywords.some(k => val.includes(k.toUpperCase()));
                    });
                };

                const adresIdx = findCol(['ADRES', 'STRAAT', 'STREET', 'ADDRESS']);
                const mercIdx = findCol(['MERCHAND', 'CHAUFFEUR', 'DRIVER', 'CHAUF']);

                if (adresIdx === -1 || mercIdx === -1) return null;

                const plaatsnaamIdx = findCol(['PLAATS', 'CITY', 'TOWN', 'LOCATION']);
                const postcodeIdx = findCol(['POSTCODE', 'ZIP']);
                const filiaalnrIdx = findCol(['FILIAAL', 'SHOP', 'STORE', 'ID']);
                const formuleIdx = findCol(['FORMULE', 'BRAND', 'KRT']);
                const bezoekdagIdx = findCol(['BEZOEK', 'DAG', 'DAY']);
                const gripperboxIdx = findCol(['GRIPPER', 'BOX']);

                for (let i = hdrIdx + 1; i < allRows.length; i++) {
                    const row = allRows[i] || [];
                    if (row.length === 0) continue;
                    const adres = String(row[adresIdx] || '').trim();
                    const merchandiser = String(row[mercIdx] || '').trim();
                    if (!adres || !merchandiser) continue;
                    if (clean(adres) === 'ADRES' || clean(adres).includes('STRAAT')) continue;

                    resultDrivers.add(merchandiser);
                    const plaats = plaatsnaamIdx >= 0 ? String(row[plaatsnaamIdx] || '').trim() : '';
                    const postcode = postcodeIdx >= 0 ? String(row[postcodeIdx] || '').trim() : '';
                    const filiaalnr = filiaalnrIdx >= 0 ? String(row[filiaalnrIdx] || '').trim() : '';
                    const formule = formuleIdx >= 0 ? String(row[formuleIdx] || '').trim() : '';
                    const bezoekdag = bezoekdagIdx >= 0 ? excelDateToDayName(row[bezoekdagIdx]) : undefined;
                    const volledigAdres = `${adres}, ${plaats}, Nederland`.replace(/, ,/g, ',').replace(/^, /, '');

                    resultAddrs.push({
                        filiaalnr, formule, straat: adres, postcode, plaats,
                        merchandiser, volledigAdres, aantalPlaatsingen: 0, bezoekdag,
                    });
                }
                return { addresses: resultAddrs, drivers: Array.from(resultDrivers).sort() };
            };

            let sheetBest: any = { addresses: [], drivers: [] };
            for (let r = 0; r < Math.min(allRows.length, 50); r++) {
                const res = parseWithHeader(r);
                // BUG HERE: if res is null it will crash in the real app if not careful,
                // but in my previous code I had: if (res && res.addresses.length > sheetBest.addresses.length)
                // Wait, let's check the actual code in excel.ts
                if (res && res.addresses.length > sheetBest.addresses.length) {
                    sheetBest = res;
                }
            }

            if (sheetBest.addresses.length > globalBestResult.addresses.length) {
                globalBestResult = { ...sheetBest, sheetName };
            }
        }

        if (globalBestResult.addresses.length === 0) {
            console.log("❌ FAILED: No addresses found.");
        } else {
            console.log(`✅ SUCCESS: Found ${globalBestResult.addresses.length} addresses in sheet "${globalBestResult.sheetName}"`);
            console.log("Drivers:", globalBestResult.drivers);
            console.log("Sample Address:", globalBestResult.addresses[0]);
        }
    } catch (e) {
        console.error("💥 ERROR during parsing:", e);
    }
}

testParsing();
