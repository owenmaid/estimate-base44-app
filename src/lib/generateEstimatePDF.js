import jsPDF from 'jspdf';

const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
const isSpacer = (desc) => (desc || '') === '__SPACER__';
const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();
const HOUR_ITEMS = ['total labour | logistics cost', 'dcsm est total hours'];
const isHourItem = (desc) => HOUR_ITEMS.includes(normalizeDesc(desc));
const isHourSection = (title, items = []) =>
  HOUR_ITEMS.includes(normalizeDesc(title)) || items.some(i => isHourItem(i.description));

const fmtVal = (val, isHour) =>
  isHour ? Math.round(val).toLocaleString('en-CA') : `$${val.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;

// For each [bracket] row, sum all regular items below it until the next [bracket] row.
function buildSubtotals(items) {
  const map = {};
  items.forEach((item, idx) => {
    if (!isSubtotalHeader(item.description)) return;
    let sum = 0;
    for (let j = idx + 1; j < items.length; j++) {
      if (isSubtotalHeader(items[j].description)) break;
      if (isSpacer(items[j].description)) continue;
      sum += items[j].total || 0;
    }
    map[item.id] = sum;
  });
  return map;
}

export function generateEstimatePDF({ clientInfo, sections, subtotal, taxAmount, total, estimateNumber, logoUrls = {} }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const orange = [220, 110, 30];
  const dark = [30, 25, 20];
  const muted = [120, 115, 110];
  const light = [245, 243, 240];
  const white = [255, 255, 255];

  const checkPage = (needed = 20) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Header bar with logos ───────────────────────────────────────────────────
  doc.setFillColor(...orange);
  doc.rect(0, 0, pageW, 70, 'F');

  // Left logo (InfoSignal)
  if (logoUrls.infoSignalLogo) {
    try {
      doc.addImage(logoUrls.infoSignalLogo, 'JPEG', margin, 15, 50, 20);
    } catch (e) {
      // Logo failed to load, skip
    }
  }

  // Center logo (DynaVent)
  if (logoUrls.dynaVentLogo) {
    try {
      doc.addImage(logoUrls.dynaVentLogo, 'JPEG', pageW / 2 - 25, 15, 50, 20);
    } catch (e) {
      // Logo failed to load, skip
    }
  }

  // Right side - Title
  doc.setTextColor(...white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DCSM Project Budgetary Estimate', pageW - margin, 25, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (estimateNumber) doc.text(`#${estimateNumber}`, pageW - margin, 40, { align: 'right' });

  // Date top-right (below estimate number)
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(dateStr, pageW - margin, 52, { align: 'right' });

  y = 90;

  // ── Customer Details Section ───────────────────────────────────────────────
  doc.setTextColor(...dark);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer Details:', margin, y);
  y += 8;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  
  // Site/Location/Plant
  if (clientInfo.client_address) {
    doc.text(`Site/Location/Plant: ${clientInfo.client_address}`, margin, y);
    y += 12;
  }
  
  // Attention
  if (clientInfo.client_name) {
    doc.text(`Attention: ${clientInfo.client_name}`, margin, y);
    y += 12;
  }
  
  // Project
  if (clientInfo.project_name) {
    doc.text(`Project: ${clientInfo.project_name}`, margin, y);
    y += 12;
  }
  
  // Project location code (E2) - center
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('E2', pageW / 2, 85, { align: 'center' });
  
  y += 10;

  // ── Client & Project Info ───────────────────────────────────────────────────
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENT INFORMATION', margin, y);
  y += 4;
  doc.setDrawColor(...orange);
  doc.setLineWidth(1);
  doc.line(margin, y, margin + 140, y);
  y += 12;

  const infoFields = [
    ['Client', clientInfo.client_name],
    ['Project #', clientInfo.project_number],
    ['Email', clientInfo.client_email],
    ['Phone', clientInfo.client_phone],
    ['Address', clientInfo.client_address],
  ].filter(([, v]) => v && v.trim());

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  infoFields.forEach(([label, value]) => {
    doc.setTextColor(...muted);
    doc.text(`${label}:`, margin, y);
    doc.setTextColor(...dark);
    doc.text(value, margin + 60, y);
    y += 14;
  });

  if (clientInfo.notes && clientInfo.notes.trim()) {
    y += 4;
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Notes:', margin, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...dark);
    const noteLines = doc.splitTextToSize(clientInfo.notes, contentW);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 12;
  }

  y += 16;

  // ── Column layout ───────────────────────────────────────────────────────────
  const colDesc  = margin;
  const colQty   = margin + contentW * 0.52;
  const colUnit  = margin + contentW * 0.65;
  const colMkup  = margin + contentW * 0.78;
  const colTotal = margin + contentW;

  // ── Sections ────────────────────────────────────────────────────────────────
  sections.forEach((section) => {
    checkPage(40);

    const subtotalMap = buildSubtotals(section.items);
    const bracketItems = section.items.filter(i => isSubtotalHeader(i.description));
    const secTotal = bracketItems.length > 0
      ? bracketItems.reduce((s, i) => s + (subtotalMap[i.id] || 0), 0)
      : section.items.filter(i => !isSpacer(i.description)).reduce((s, i) => s + (i.total || 0), 0);

    // Section header
    doc.setFillColor(...light);
    doc.rect(margin, y - 2, contentW, 18, 'F');
    doc.setFillColor(...orange);
    doc.rect(margin, y - 2, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text(section.title, margin + 10, y + 10);
    const sectionIsHour = isHourSection(section.title, section.items);
    doc.setTextColor(...orange);
    doc.text(fmtVal(secTotal, sectionIsHour), colTotal, y + 10, { align: 'right' });
    y += 22;

    // Column headers — only if section has items
    if (section.items.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...muted);
      doc.text('DESCRIPTION', colDesc, y);
      doc.text('QTY', colQty, y, { align: 'right' });
      doc.text('UNIT $', colUnit, y, { align: 'right' });
      doc.text('MKP%', colMkup, y, { align: 'right' });
      doc.text('TOTAL', colTotal, y, { align: 'right' });
      y += 4;
      doc.setDrawColor(...muted);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentW, y);
      y += 10;
    }

    // Items
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    let regularRowIdx = 0;
    section.items.forEach((item) => {
      const isHeader = isSubtotalHeader(item.description);
      const spacer = isSpacer(item.description);
      checkPage(18);

      if (spacer) {
        // Dark grey 50% opacity spacer row (approximated as mid-grey fill)
        doc.setFillColor(180, 180, 180); // ~50% grey
        doc.rect(margin, y - 6, contentW, 10, 'F');
        y += 10;
        return;
      }

      if (isHeader) {
        // Subtotal header row — orange tinted background, left accent bar
        doc.setFillColor(255, 237, 213); // light orange
        doc.rect(margin, y - 10, contentW, 16, 'F');
        doc.setFillColor(...orange);
        doc.rect(margin, y - 10, 3, 16, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...orange);
        const descLines = doc.splitTextToSize(item.description || '', colQty - colDesc - 12);
        doc.text(descLines, colDesc + 6, y);

        const headerSum = subtotalMap[item.id] || 0;
        doc.text(fmtVal(headerSum, isHourItem(item.description)), colTotal, y, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        y += descLines.length > 1 ? descLines.length * 11 : 16;
        regularRowIdx = 0; // reset alternating for items after this header
      } else {
        // Normal item row — alternating shading
        if (regularRowIdx % 2 === 0) {
          doc.setFillColor(250, 249, 247);
          doc.rect(margin, y - 9, contentW, 14, 'F');
        }
        doc.setTextColor(...dark);
        doc.setFont('helvetica', 'normal');
        const descLines = doc.splitTextToSize(item.description || '', colQty - colDesc - 8);
        doc.text(descLines, colDesc, y);
        doc.text(String(item.quantity ?? 1), colQty, y, { align: 'right' });
        doc.text(`$${(item.unit_price || 0).toFixed(2)}`, colUnit, y, { align: 'right' });
        doc.text(`${item.markup || 0}%`, colMkup, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(fmtVal(item.total || 0, isHourItem(item.description)), colTotal, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        y += descLines.length > 1 ? descLines.length * 11 : 14;
        regularRowIdx++;
      }
    });

    y += 8;
  });

  // ── Totals box ──────────────────────────────────────────────────────────────
  checkPage(90);
  y += 8;
  const boxW = 200;
  const boxX = pageW - margin - boxW;

  doc.setDrawColor(...orange);
  doc.setLineWidth(0.5);
  doc.rect(boxX, y, boxW, clientInfo.discount > 0 ? 82 : 68, 'S');

  const rowH = 17;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');

  const drawTotalRow = (label, value, bold = false, color = dark) => {
    doc.setTextColor(...muted);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, boxX + 12, y + 12);
    doc.setTextColor(...color);
    doc.text(value, boxX + boxW - 12, y + 12, { align: 'right' });
    y += rowH;
  };

  drawTotalRow('Subtotal', `$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`);
  drawTotalRow(`Tax (${clientInfo.tax_rate || 0}%)`, `$${taxAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`);
  if (clientInfo.discount > 0) {
    drawTotalRow('Discount', `-$${(clientInfo.discount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`);
  }

  // Total row with fill
  doc.setFillColor(...orange);
  doc.rect(boxX, y, boxW, rowH + 4, 'F');
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', boxX + 12, y + 13);
  doc.text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, boxX + boxW - 12, y + 13, { align: 'right' });

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerY = pageH - 28;
  doc.setDrawColor(...light);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 8, pageW - margin, footerY - 8);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('This estimate is valid for 30 days from the date issued.', margin, footerY);
  doc.text(`Page 1`, pageW - margin, footerY, { align: 'right' });

  // ── Save ────────────────────────────────────────────────────────────────────
  const filename = `Estimate${estimateNumber ? `-${estimateNumber}` : ''}${clientInfo.client_name ? `-${clientInfo.client_name.replace(/\s+/g, '_')}` : ''}.pdf`;
  doc.save(filename);
}