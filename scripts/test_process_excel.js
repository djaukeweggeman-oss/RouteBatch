const fs = require('fs');
const XLSX = require('xlsx');

function countPlacementsFromFile(path) {
  const workbook = XLSX.readFile(path);
  let sheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('PLANNING')) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 8, defval: '' });

  jsonData.forEach((row, idx) => {
    if (!row.ADRES || !row.Merchandiser) return;
    const cols = Object.keys(row);
    const gripperIndex = cols.findIndex(c => String(c).trim().toUpperCase() === 'GRIPPERBOX');
    let count = 0;
    if (gripperIndex >= 0) {
      for (let i = gripperIndex + 1; i < cols.length; i++) {
        const val = row[cols[i]];
        if (val !== null && val !== undefined) {
          if (String(val).trim().toUpperCase() === 'JA') count++;
        }
      }
    }
    console.log(`Row ${idx + 9}: ADRES=${row.ADRES}, Merchandiser=${row.Merchandiser}, aantalPlaatsingen=${count}`);
  });
}

countPlacementsFromFile('scripts/test_upload_gripper.xlsx');
