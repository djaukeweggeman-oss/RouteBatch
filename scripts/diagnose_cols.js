const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/Users/aukeweggeman/Desktop/AH_POS_PLANNING_WEEK_10.01.xlsx';
const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
const sheet = workbook.Sheets['AH POS PLANNING WEEK 10 '];
const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

// Print the full header row (row 7, index 7)
const hdrRow = allRows[7];
console.log("Header columns:");
hdrRow.forEach((col, idx) => console.log(`  [${idx}] "${col}"`));

// Print data for row 8 (first data row)
console.log("\nFirst data row values:");
const dataRow = allRows[8];
dataRow.forEach((val, idx) => {
    if (String(val).trim()) console.log(`  [${idx}] "${hdrRow[idx]}" = "${val}"`);
});

// Check how many rows have same address for Dinsdag
const allRows2 = allRows.slice(8).filter(r => r.length > 0);
const dinsdag = allRows2.filter(r => {
    const val = String(r[2] || '').trim();
    const numVal = Number(val);
    if (!isNaN(numVal)) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + numVal * 86400000);
        return date.toLocaleDateString('nl-NL', { weekday: 'long' }).toLowerCase().includes('dinsdag');
    }
    return val.toLowerCase().includes('dinsdag');
});

console.log(`\nDinsdag rows: ${dinsdag.length}`);
const harderwijkRows = dinsdag.filter(r => String(r[6] || '').includes('Harderwijkerweg'));
console.log(`Rows with Harderwijkerweg: ${harderwijkRows.length}`);
harderwijkRows.forEach(r => {
    console.log(`  Merchandiser="${r[1]}", Adres="${r[6]}", Postcode="${r[7]}", Plaats="${r[8]}"`);
    // Print the tail columns (product plaatings)
    const tail = r.slice(12).filter(v => String(v).trim());
    console.log(`  Tail values (from col 12):`, r.slice(12, 25));
});
