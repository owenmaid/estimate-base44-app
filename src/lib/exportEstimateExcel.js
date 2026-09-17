// Exports the full estimate (client info + all sections/line items + summary) as an
// Excel-compatible .xls file using an HTML table — opens natively in Excel, no library needed.

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const fmt = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2));

export function exportEstimateToExcel({ clientInfo, sections, subtotal, taxAmount, total, estimateNumber }) {
  const rows = [];

  // Title
  rows.push(`<tr><td colspan="6" style="font-size:18px;font-weight:bold;background:#1f1f1f;color:#ff8a00;">Estimate${estimateNumber ? ` — ${escapeHtml(estimateNumber)}` : ''}</td></tr>`);
  rows.push('<tr><td colspan="6"></td></tr>');

  // Client / project info
  const infoRows = [
    ['Client Name', clientInfo.client_name],
    ['Project Name', clientInfo.project_name],
    ['Project Number', clientInfo.project_number],
    ['Client Email', clientInfo.client_email],
    ['Client Phone', clientInfo.client_phone],
    ['Client Address', clientInfo.client_address],
    ['Start Date', clientInfo.start_date],
    ['End Date', clientInfo.end_date],
    ['Tax Rate (%)', clientInfo.tax_rate],
    ['Discount', fmt(clientInfo.discount)],
    ['Notes', clientInfo.notes],
  ];
  infoRows.forEach(([label, val]) => {
    rows.push(`<tr><td style="font-weight:bold;background:#2a2a2a;color:#fff;">${escapeHtml(label)}</td><td colspan="5">${escapeHtml(val)}</td></tr>`);
  });
  rows.push('<tr><td colspan="6"></td></tr>');

  // Line items header
  rows.push(
    `<tr>
      <th style="background:#1f1f1f;color:#ff8a00;border:1px solid #555;">Section</th>
      <th style="background:#1f1f1f;color:#ff8a00;border:1px solid #555;">Description</th>
      <th style="background:#1f1f1f;color:#ff8a00;border:1px solid #555;">Quantity</th>
      <th style="background:#1f1f1f;color:#ff8a00;border:1px solid #555;">Unit Price</th>
      <th style="background:#1f1f1f;color:#ff8a00;border:1px solid #555;">Markup %</th>
      <th style="background:#1f1f1f;color:#ff8a00;border:1px solid #555;">Total</th>
    </tr>`
  );

  // Sections & items
  sections.forEach((section) => {
    if (section._isSummary) return; // summary handled separately at the bottom
    const isBracket = (desc) => /[\[\]]/.test(desc || '');
    const isSpacer = (desc) => (desc || '') === '__SPACER__';

    section.items.forEach((item) => {
      if (isSpacer(item.description)) return;
      const isHeader = isBracket(item.description);
      const style = isHeader
        ? 'font-weight:bold;background:#333;color:#fff;'
        : '';
      rows.push(
        `<tr>
          <td style="border:1px solid #555;${style}">${escapeHtml(section.title)}</td>
          <td style="border:1px solid #555;${style}">${escapeHtml(item.description)}</td>
          <td style="border:1px solid #555;text-align:right;${style}">${isHeader ? '' : escapeHtml(item.quantity)}</td>
          <td style="border:1px solid #555;text-align:right;${style}">${isHeader ? '' : fmt(item.unit_price)}</td>
          <td style="border:1px solid #555;text-align:right;${style}">${isHeader ? '' : escapeHtml(item.markup)}</td>
          <td style="border:1px solid #555;text-align:right;${style}">${fmt(item.total)}</td>
        </tr>`
      );
    });
  });

  rows.push('<tr><td colspan="6"></td></tr>');

  // Summary totals
  rows.push(`<tr><td colspan="5" style="font-weight:bold;text-align:right;background:#2a2a2a;color:#fff;">Subtotal</td><td style="text-align:right;font-weight:bold;background:#2a2a2a;color:#fff;">${fmt(subtotal)}</td></tr>`);
  rows.push(`<tr><td colspan="5" style="font-weight:bold;text-align:right;background:#2a2a2a;color:#fff;">Tax Amount</td><td style="text-align:right;font-weight:bold;background:#2a2a2a;color:#fff;">${fmt(taxAmount)}</td></tr>`);
  rows.push(`<tr><td colspan="5" style="font-weight:bold;text-align:right;background:#1f1f1f;color:#ff8a00;">Total</td><td style="text-align:right;font-weight:bold;background:#1f1f1f;color:#ff8a00;">${fmt(total)}</td></tr>`);

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Estimate</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table>${rows.join('')}</table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = (clientInfo.project_name || clientInfo.client_name || 'estimate').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  link.download = `estimate_${safeName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}