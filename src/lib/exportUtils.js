// html2pdf is loaded globally via script tag in index.html to avoid ESM resolution errors

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

export async function exportToPDF(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return null;

  const clonedElement = element.cloneNode(true);
  clonedElement.style.direction = 'rtl';
  clonedElement.style.fontFamily = 'Heebo, sans-serif';
  clonedElement.style.padding = '20px';

  const opt = {
    margin:       10,
    filename:     'report.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  if (typeof window.html2pdf === 'function') {
    // Return Blob directly to handle download manually
    return await window.html2pdf().set(opt).from(clonedElement).output('blob');
  } else {
    throw new Error('ספריית יצירת ה-PDF לא נטענה מהשרת החיצוני (CDN).');
  }
}

