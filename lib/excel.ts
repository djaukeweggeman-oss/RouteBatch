import * as XLSX from 'xlsx';
import { Address } from '@/types';

/**
 * Convert Excel date serial number or Dutch date string to day name
 */
function excelDateToDayName(value: any): string | undefined {
    try {
        const strVal = String(value).trim();
        const days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

        // Direct match
        if (days.includes(strVal)) return strVal;

        // Handle common Dutch date strings like "maandag 2 maart"
        const lowerVal = strVal.toLowerCase();
        if (lowerVal.includes('maandag')) return 'Maandag';
        if (lowerVal.includes('dinsdag')) return 'Dinsdag';
        if (lowerVal.includes('woensdag')) return 'Woensdag';
        if (lowerVal.includes('donderdag')) return 'Donderdag';
        if (lowerVal.includes('vrijdag')) return 'Vrijdag';
        if (lowerVal.includes('zaterdag')) return 'Zaterdag';
        if (lowerVal.includes('zondag')) return 'Zondag';

        // Try to parse as a number (Excel date serial)
        const numVal = Number(value);
        if (isNaN(numVal)) {
            return strVal || undefined;
        }

        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + numVal * 86400000);
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    } catch (e) {
        console.warn('Could not convert bezoekdag value:', value, e);
        return String(value).trim() || undefined;
    }
}

export const processExcel = async (buffer: ArrayBuffer): Promise<{ addresses: Address[], drivers: string[] }> => {
    try {
        console.log("📊 Starting SUPER ROBUST Excel processing...");
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        console.log("📋 Available sheets:", workbook.SheetNames);

        let allValidAddresses: Address[] = [];
        let allValidDrivers = new Set<string>();
        let processedSheetNames: string[] = [];

        // Priority for sheet names
        const sortedSheets = [...workbook.SheetNames].sort((a, b) => {
            const aUpper = a.toUpperCase();
            const bUpper = b.toUpperCase();
            const aWeight = aUpper.includes('PLANNING') ? 10 : (aUpper.includes('WEEK') ? 5 : 0);
            const bWeight = bUpper.includes('PLANNING') ? 10 : (bUpper.includes('WEEK') ? 5 : 0);
            return bWeight - aWeight;
        });

        for (const sheetName of sortedSheets) {
            console.log(`🔍 Testing sheet: ${sheetName}`);
            const worksheet = workbook.Sheets[sheetName];
            const allRows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: "" }) as any[][];

            if (!allRows || allRows.length === 0) continue;

            // Very lenient cleaner for keyword matching
            const cleanKey = (val: any) => String(val || '').trim().toUpperCase().replace(/[^A-Z]/g, '');

            const parseWithHeader = (hdrIdx: number) => {
                const hdrRow = allRows[hdrIdx] || [];
                const findCol = (keywords: string[]) => {
                    return hdrRow.findIndex(h => {
                        const val = cleanKey(h);
                        return keywords.some(k => val.includes(cleanKey(k)));
                    });
                };

                const adresIdx = findCol(['ADRES', 'STRAAT', 'STREET', 'ADDRESS']);
                const mercIdx = findCol(['MERCHANDISER', 'MERCHANSIDER', 'MERCHAND', 'MERCHAN', 'CHAUFFEUR', 'DRIVER', 'CHAUF']);

                const plaatsnaamIdx = findCol(['PLAATS', 'CITY', 'TOWN', 'LOCATION']);
                const postcodeIdx = findCol(['POSTCODE', 'ZIP']);
                const filiaalnrIdx = findCol(['FILIAAL', 'SHOP', 'STORE', 'WINKEL']);
                const formuleIdx = findCol(['FORMULE', 'BRAND', 'KRT']);
                const bezoekdagIdx = findCol(['BEZOEK', 'DAG', 'DAY']);
                const terrIdx = findCol(['TERRNR', 'TERR']); // Match TERRNR correctly
                const boxIdx = findCol(['BOX']); // Exact feature for user requirement

                // Adres is mandatory
                if (adresIdx === -1) return null;

                const resultAddrs: Address[] = [];
                const resultDrivers = new Set<string>();

                // Product columns (Ja/Nee for each brand) come AFTER 'Te verwijderen'
                const teVerwijderenIdx = findCol(['VERWIJDER']);
                const goedgekeurdIdx2 = findCol(['GOEDGEKEURD']);
                let productStartIdx: number;
                if (teVerwijderenIdx >= 0) {
                    productStartIdx = teVerwijderenIdx + 1;
                } else if (goedgekeurdIdx2 >= 0) {
                    productStartIdx = goedgekeurdIdx2 + 2; 
                } else {
                    productStartIdx = Math.max(adresIdx, mercIdx >= 0 ? mercIdx : adresIdx, plaatsnaamIdx, postcodeIdx) + 4;
                }

                for (let i = hdrIdx + 1; i < allRows.length; i++) {
                    const row = allRows[i] || [];
                    if (row.length === 0) continue;

                    const adres = String(row[adresIdx] || '').trim();
                    const merchandiser = mercIdx >= 0 ? String(row[mercIdx] || '').trim() : '';

                    // Adres is definitely mandatory
                    if (!adres) continue;
                    
                    // Skip rows where the address cell is literally a column header
                    const cleanedAdres = cleanKey(adres);
                    if (cleanedAdres === 'ADRES' || cleanedAdres === 'STRAAT' || cleanedAdres === 'STREET' || cleanedAdres === 'ADDRESS') continue;

                    // Fallback to "Onbekend" to group any empty merchandisers
                    const finalMerch = merchandiser || 'Onbekend';
                    resultDrivers.add(finalMerch);

                    const plaats = plaatsnaamIdx >= 0 ? String(row[plaatsnaamIdx] || '').trim() : '';
                    const postcode = postcodeIdx >= 0 ? String(row[postcodeIdx] || '').trim() : '';
                    const filiaalnr = filiaalnrIdx >= 0 ? String(row[filiaalnrIdx] || '').trim() : '';
                    const formule = formuleIdx >= 0 ? String(row[formuleIdx] || '').trim() : '';
                    const bezoekdag = bezoekdagIdx >= 0 ? excelDateToDayName(row[bezoekdagIdx]) : undefined;
                    const terr = terrIdx >= 0 ? String(row[terrIdx] || '').trim() : '';
                    const boxName = boxIdx >= 0 ? String(row[boxIdx] || '').trim() : '';
                    const volledigAdres = [adres, postcode, plaats, 'Nederland'].filter(Boolean).join(', ');

                    let aantalPlaatsingen = 0;
                    for (let j = productStartIdx; j < row.length; j++) {
                        const val = String(row[j] || '').trim().toUpperCase();
                        if (val === 'JA' || val === 'X' || val === '1' || val === 'V') aantalPlaatsingen++;
                    }

                    resultAddrs.push({
                        filiaalnr, formule, straat: adres, postcode, plaats,
                        merchandiser: finalMerch, volledigAdres, aantalPlaatsingen, bezoekdag, terr, boxName
                    });
                }
                return { addresses: resultAddrs, drivers: Array.from(resultDrivers).sort() };
            };

            // Scan first 50 rows for the best possible header in this sheet
            let sheetBest = { addresses: [] as Address[], drivers: [] as string[] };
            for (let r = 0; r < Math.min(allRows.length, 50); r++) {
                const res = parseWithHeader(r);
                if (res && res.addresses.length > sheetBest.addresses.length) {
                    sheetBest = res;
                    // Optimization: if we found a good amount of data, assume we found the right header
                    if (res.addresses.length > 50) break;
                }
            }

            if (sheetBest.addresses.length > 0) {
                console.log(`✅ Found ${sheetBest.addresses.length} addresses in sheet "${sheetName}"`);
                allValidAddresses.push(...sheetBest.addresses);
                sheetBest.drivers.forEach(d => allValidDrivers.add(d));
                processedSheetNames.push(sheetName);
            }
        }

        if (allValidAddresses.length === 0) {
            console.error("❌ FAILED TO FIND ANY DATA ACROSS ALL SHEETS");
            throw new Error("Kon geen geldige gegevens vinden. Zorg dat de kolom 'Adres' aanwezig is.");
        }

        console.log(`✅ Success! Found ${allValidAddresses.length} total addresses across sheets: ${processedSheetNames.join(', ')}`);

        const grouped = new Map<string, Address>();
        for (const addr of allValidAddresses) {
            // Include filiaalnr in key so different stores at the same address are NOT merged
            const key = `${addr.filiaalnr || ''}|${addr.volledigAdres}|${addr.merchandiser}|${addr.bezoekdag || ''}|${addr.terr || ''}|${addr.boxName || ''}`;
            if (grouped.has(key)) {
                const existing = grouped.get(key)!;
                existing.aantalPlaatsingen = (existing.aantalPlaatsingen || 0) + (addr.aantalPlaatsingen || 0);
            } else {
                grouped.set(key, { ...addr });
            }
        }
        
        const uniqueAddresses = Array.from(grouped.values());

        return { addresses: uniqueAddresses, drivers: Array.from(allValidDrivers).sort() };

    } catch (error) {
        console.error("💥 Excel processing error:", error);
        throw error;
    }
};
