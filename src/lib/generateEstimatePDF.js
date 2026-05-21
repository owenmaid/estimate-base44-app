import jsPDF from 'jspdf';

const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
const isSpacer = (desc) => (desc || '') === '__SPACER__';
const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();
const HOUR_ITEMS = ['total labour | logistics cost', 'dcsm est total hours', 'total ventilation labour hours', 'total project labour hours', '[total project labour hours]'];
const isHourItem = (desc) => HOUR_ITEMS.includes(normalizeDesc(desc));
const isHourSection = (title) => HOUR_ITEMS.includes(normalizeDesc(title));
const isProjectTotalsSection = (title) => normalizeDesc(title) === 'project totals';

const fmtVal = (val, isHour) =>
  isHour ? Math.round(val).toLocaleString('en-CA') : `$${val.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;

// For each [bracket] row, sum all regular items below it until the next [bracket] row.
// Exception: Hour-based brackets and [Total Project Labour Hours] use their injected item.total directly.
function buildSubtotals(items) {
  const map = {};
  items.forEach((item, idx) => {
    if (!isSubtotalHeader(item.description)) return;
    const n = normalizeDesc(item.description);
    // Hour-based brackets and [Total Project Labour Hours] use injected total, not sum of items below
    if (n === 'total project labour hours' || n === 'dcsm est total hours' || n === 'total ventilation labour hours') {
      map[item.id] = item.total || 0;
      return;
    }
    // DCSM Est Total and Ventilation Total Cost use injected total directly
    if (n === 'dcsm est total' || n === 'ventilation total cost' || n === 'total cost for ventilation') {
      map[item.id] = item.total || 0;
      return;
    }
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

export async function generateEstimatePDF({ clientInfo, sections, subtotal, taxAmount, total, estimateNumber, logoUrls = {} }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
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

  // Helper to load image from URL as data URL
  const loadImage = async (url) => {
    if (!url) return null;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  };

  // Load logos
  const infoSignalImg = logoUrls.infoSignalLogo ? await loadImage(logoUrls.infoSignalLogo) : null;
  const dynaVentImg = logoUrls.dynaVentLogo ? await loadImage(logoUrls.dynaVentLogo) : null;

  // ── Header: white background, 3-column layout ──────────────────────────────
  // Left: InfoSignal logo
  const logoH = 38;
  const logoY = y;

  if (infoSignalImg) {
    doc.addImage(infoSignalImg, 'PNG', margin, logoY, 110, logoH);
  } else {
    // Fallback text
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...orange);
    doc.text('InfoSignal', margin, logoY + 26);
  }

  // Center: DynaVent logo
  const centerX = pageW / 2;
  if (dynaVentImg) {
    doc.addImage(dynaVentImg, 'PNG', centerX - 30, logoY + (logoH - logoH * 0.5) / 2, 60, logoH * 0.5);
  } else {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...orange);
    doc.text('DynaVent', centerX, logoY + 26, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('BREATHE INNOVATION', centerX, logoY + 36, { align: 'center' });
  }

  // Right: Title — bold, dark, right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text('DCSM Project Budgetary Estimate', pageW - margin, logoY + 20, { align: 'right' });

  y = logoY + logoH + 10;

  // ── Thin separator line under logos ──────────────────────────────────────
  doc.setDrawColor(200, 195, 190);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // ── Customer details block ────────────────────────────────────────────────
  // Format date as "08-Jul-24"
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${String(now.getDate()).padStart(2,'0')}-${months[now.getMonth()]}-${String(now.getFullYear()).slice(-2)}`;

  const labelX = margin;
  const valueX = margin + 105;
  const e2X = pageW / 2 - 10;
  const dateLabelX = pageW - margin - 80;
  const dateValueX = pageW - margin;
  const rowGap = 13;

  doc.setFontSize(8.5);

  const fields = [
    { label: 'Customer',               value: clientInfo.client_name || '' },
    { label: 'Site / Location / Plant', value: clientInfo.client_address || '', e2: true },
    { label: 'Attention',              value: clientInfo.client_email || '' },
    { label: 'Phone',                  value: clientInfo.client_phone || '' },
    { label: 'Project',                value: clientInfo.project_number || '' },
  ];

  fields.forEach((field, idx) => {
    // Label — dark, bold
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.text(field.label, labelX, y);

    // Value — orange
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...orange);
    doc.text(field.value, valueX, y);

    // Date on first row, top-right
    if (idx === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...dark);
      doc.text('Date', dateLabelX, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...orange);
      doc.text(dateStr, dateValueX, y, { align: 'right' });
    }

    y += rowGap;
  });

  y += 8;

  // Add Notes field if present
  if (clientInfo.notes && clientInfo.notes.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...dark);
    doc.text('Notes:', labelX, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...orange);
    const noteLines = doc.splitTextToSize(clientInfo.notes, contentW - 105);
    doc.text(noteLines, valueX, y + 4);
    y += noteLines.length * 13 + 4;
  }

  // ── Second separator line under customer details ──────────────────────────
  doc.setDrawColor(200, 195, 190);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // ── Column layout ───────────────────────────────────────────────────────────
  const colDesc  = margin;
  const colQty   = margin + contentW * 0.52;
  const colUnit  = margin + contentW * 0.65;
  const colMkup  = margin + contentW * 0.78;
  const colTotal = margin + contentW;

  // ── Sections ────────────────────────────────────────────────────────────────
  // Filter out Summary sections (they're rendered separately at the bottom)
  const nonSummarySections = sections.filter(s => !s._isSummary);
  const summarySection = sections.find(s => s._isSummary);
  
  nonSummarySections.forEach((section) => {
    checkPage(40);

    const sectionStartY = y;

    const subtotalMap = buildSubtotals(section.items);
    const bracketItems = section.items.filter(i => isSubtotalHeader(i.description));
    const secTotal = bracketItems.length > 0
      ? bracketItems.reduce((s, i) => s + (subtotalMap[i.id] || 0), 0)
      : section.items.filter(i => !isSpacer(i.description)).reduce((s, i) => s + (i.total || 0), 0);

    const isProjTotals = isProjectTotalsSection(section.title);

    // Section header
    doc.setFillColor(...light);
    doc.rect(margin, y - 2, contentW, 18, 'F');
    doc.setFillColor(...orange);
    doc.rect(margin, y - 2, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text(section.title, margin + 10, y + 10);
    // Don't show totals value for Project Totals section header
    if (!isProjTotals) {
      const sectionIsHour = isHourSection(section.title);
      doc.setTextColor(...orange);
      doc.text(fmtVal(secTotal, sectionIsHour), colTotal, y + 10, { align: 'right' });
    }
    y += 22;

    // Column headers — only if section has items AND is not Project Totals
    if (section.items.length > 0 && !isProjTotals) {
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
        // Dark grey 50% opacity spacer row
        doc.setFillColor(180, 180, 180);
        doc.rect(margin, y - 6, contentW, 10, 'F');
        y += 10;
        return;
      }

      if (isHeader) {
        // Subtotal header row — orange tinted background, left accent bar
        doc.setFillColor(255, 237, 213);
        doc.rect(margin, y - 10, contentW, 16, 'F');
        doc.setFillColor(...orange);
        doc.rect(margin, y - 10, 3, 16, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...orange);
        const descLines = doc.splitTextToSize(item.description || '', isProjTotals ? contentW - 100 : colQty - colDesc - 12);
        doc.text(descLines, colDesc + 6, y);

        // For hour-based brackets and [Total Project Cost], use item.total directly; otherwise use subtotalMap
        const isProjectCostBracket = normalizeDesc(item.description) === 'total project cost';
        const itemN = normalizeDesc(item.description);
        const isHourBracket = itemN === 'total project labour hours' || itemN === 'dcsm est total hours' || itemN === 'total ventilation labour hours';
        const displayTotal = (isProjectCostBracket || isHourBracket) ? (item.total || 0) : (subtotalMap[item.id] || 0);
        
        doc.text(fmtVal(displayTotal, isHourItem(item.description)), colTotal, y, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        y += descLines.length > 1 ? descLines.length * 11 : 16;
        regularRowIdx = 0;
      } else {
        // Normal item row
        if (!isProjTotals && regularRowIdx % 2 === 0) {
          doc.setFillColor(250, 249, 247);
          doc.rect(margin, y - 9, contentW, 14, 'F');
        }
        doc.setTextColor(...dark);
        doc.setFont('helvetica', 'normal');
        const descLines = doc.splitTextToSize(item.description || '', isProjTotals ? contentW - 100 : colQty - colDesc - 8);
        doc.text(descLines, colDesc, y);
        
        if (isProjTotals) {
          // Project Totals: only Description and Total columns
          doc.setFont('helvetica', 'bold');
          doc.text(fmtVal(item.total || 0, isHourItem(item.description)), colTotal, y, { align: 'right' });
          doc.setFont('helvetica', 'normal');
        } else {
          // Regular section: all columns
          doc.text(String(item.quantity ?? 1), colQty, y, { align: 'right' });
          doc.text(`$${(item.unit_price || 0).toFixed(2)}`, colUnit, y, { align: 'right' });
          doc.text(`${item.markup || 0}%`, colMkup, y, { align: 'right' });
          doc.setFont('helvetica', 'bold');
          doc.text(fmtVal(item.total || 0, isHourItem(item.description)), colTotal, y, { align: 'right' });
          doc.setFont('helvetica', 'normal');
        }
        
        y += descLines.length > 1 ? descLines.length * 11 : 14;
        regularRowIdx++;
      }
    });

    y += 8;
    const sectionEndY = y;

    // Draw thin black border around the entire section
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin, sectionStartY - 2, contentW, sectionEndY - sectionStartY + 2, 'S');
  });

  // ── Summary Section (rendered as two-column layout matching the UI) ───────
  if (summarySection) {
    checkPage(120);
    const summaryStartY = y;
    y += 8;

    // Section header
    doc.setFillColor(...light);
    doc.rect(margin, y - 2, contentW, 18, 'F');
    doc.setFillColor(...orange);
    doc.rect(margin, y - 2, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text(summarySection.title || 'Summary', margin + 10, y + 10);
    y += 22;

    // Two-column layout matching the UI SummarySection component
    const colWidth = contentW / 2 - 10;
    const leftX = margin;
    const rightX = margin + contentW / 2 + 5;
    
    // Left column title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...dark);
    doc.text('DCSM and Ventilation Cost per Manway/Day', leftX, y);
    
    // Right column title
    doc.text('Conventional Costs Per Manway/Day', rightX, y);
    y += 8;
    
    // Divider line
    doc.setDrawColor(...muted);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentW, y);
    y += 10;

    // Calculate duration days
    const durationDays = (() => {
      if (!clientInfo.start_date || !clientInfo.end_date) return 0;
      const start = new Date(clientInfo.start_date);
      const end = new Date(clientInfo.end_date);
      const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      return diff > 0 ? diff : 0;
    })();

    // Left column content (DCSM and Ventilation)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    
    const leftRows = [
      { label: 'Number of Manways (Averaged out over duration) DCSM', value: '' },
      { label: 'Number of days DCSM', value: '' },
      { label: 'Total Cost', value: `$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, bold: true },
      { label: 'Cost per manway/day', value: '$0.00' },
    ];
    
    const rightRows = [
      { label: 'Number of Manways (Averaged out over duration)', value: '' },
      { label: 'Number of days', value: '' },
      { label: 'Total Cost', value: `$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, bold: true, primary: true },
      { label: 'Cost per manway/day', value: '$0.00' },
    ];

    const rowSpacing = 22;
    
    // Render left column
    leftRows.forEach((row, idx) => {
      const rowY = y + idx * rowSpacing;
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(row.label, leftX, rowY);
      
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      if (row.primary) {
        doc.setTextColor(...orange);
      } else {
        doc.setTextColor(...dark);
      }
      doc.text(row.value, leftX + colWidth, rowY, { align: 'right' });
    });
    
    // Render right column
    rightRows.forEach((row, idx) => {
      const rowY = y + idx * rowSpacing;
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(row.label, rightX, rowY);
      
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      if (row.primary) {
        doc.setTextColor(...orange);
      } else {
        doc.setTextColor(...dark);
      }
      doc.text(row.value, rightX + colWidth, rowY, { align: 'right' });
    });
    
    y += leftRows.length * rowSpacing + 12;
    const summaryEndY = y;

    // Draw thin black border around the Summary section
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin, summaryStartY - 2, contentW, summaryEndY - summaryStartY + 2, 'S');
  }

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