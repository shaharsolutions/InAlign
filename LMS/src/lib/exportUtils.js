export function exportToCSV(rows) {
  if (!rows || !rows.length) {
    return null;
  }

  const headers = Object.keys(rows[0]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      headers.map(header => {
        let cell = row[header] === null || row[header] === undefined ? '' : row[header];
        cell = cell.toString().replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(',')
    )
  ].join('\n');

  // Add BOM for Excel Hebrew support
  const bom = '\uFEFF';
  return new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
}

export function printReportAsPdf(elementId) {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('לא נמצאו נתונים להדפסה');

  const clonedElement = element.cloneNode(true);
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים ונסה שוב.');

  printWindow.opener = null;
  printWindow.document.title = 'דוח לומדים - Align';
  const style = printWindow.document.createElement('style');
  style.textContent = `
    @page { size: A4 landscape; margin: 12mm; }
    body { direction: rtl; font-family: Arial, sans-serif; color: #111827; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; text-align: right; }
    th { background: #f3f4f6; }
  `;
  printWindow.document.head.append(style);
  printWindow.document.body.append(clonedElement);
  printWindow.addEventListener('load', () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  printWindow.document.close();
}
