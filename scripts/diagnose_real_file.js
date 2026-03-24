const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/Users/aukeweggeman/Desktop/AH_POS_PLANNING_WEEK_10.01.xlsx';
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log("📋 Sheet names:", workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
    console.log(`\n=== SHEET: "${sheetName}" ===`);
    const worksheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    console.log(`Total rows: ${allRows.length}`);

    // Print first 12 rows to see structure
    for (let i = 0; i < Math.min(12, allRows.length); i++) {
        const row = allRows[i];
        const preview = row.slice(0, 12).map(v => String(v).substring(0, 25));
        console.log(`Row[${i}]: [${preview.join(' | ')}]`);
    }
}
