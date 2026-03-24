const XLSX = require('xlsx');
const fs = require('fs');

function generate() {
  // Create 8 blank rows, then header row at row 9
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push([]);

  // Header row at index 8 (row 9)
  rows.push(['ADRES', 'Merchandiser', 'FILIAALNR', 'FORMULE', 'POSTCODE', 'PLAATSNAAM']);

  // Data rows
  rows.push(['Vlamoven 7', 'Auke Weggeman', 'START01', 'TestFormule', '6814AA', 'Arnhem']);
  rows.push(['Stadsbrink 375', 'Auke Weggeman', '1103', 'Albert Heijn', '6708AA', 'WAGENINGEN']);
  rows.push(['Molenstraat 2', 'Auke Weggeman', '1094', 'Albert Heijn', '4000AA', 'TIEL']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PLANNING WEEK 08');

  const outPath = 'scripts/test_upload.xlsx';
  XLSX.writeFile(wb, outPath);
  console.log('Wrote', outPath);
}

generate();
