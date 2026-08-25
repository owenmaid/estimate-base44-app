import jsPDF from 'jspdf';

const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
const isSpacer = (desc) => (desc || '') === '__SPACER__';
const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();

const HOUR_ITEMS = [
  'total labour | logistics cost',
  'dcsm est total hours',
  'total ventilation labour hours',
  'total project labour hours',
];
const isHourItem = (desc) => HOUR_ITEMS.includes(normalizeDesc(desc));
const isProjectTotalsSection = (title) => normalizeDesc(title) === 'project totals';

// Sections that should always use leaf-only summation (never bracket subtotals)
const LEAF_ONLY_SECTIONS = [
  'indirects total',
  'directs total',
  'support and logistics',
  'total equipment | consumables cost',
  'ventilation total labour | logistics cost',
  'ventilation total equipment | consumable costs',
];

// Items whose display total comes directly from item.total (injected by the calculation passes)
const INJECTED_TOTAL_ITEMS = [
  'dcsm est total',
  'ventilation total cost',
  'total cost for ventilation',
  'total project cost',
  'dcsm est total hours',
  'total ventilation labour hours',
  'total project labour hours',
];

const fmtMoney = (val) => `$${Number(val || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHours = (val) => Math.round(val || 0).toLocaleString('en-CA');
const fmtVal = (val, isHour) => isHour ? fmtHours(val) : fmtMoney(val);

// For each [bracket] row, sum all regular items below it until the next [bracket] row.
// Items in INJECTED_TOTAL_ITEMS use their item.total directly.
function buildSubtotals(items) {
  const map = {};
  items.forEach((item, idx) => {
    if (!isSubtotalHeader(item.description)) return;
    const n = normalizeDesc(item.description);
    if (INJECTED_TOTAL_ITEMS.includes(n)) {
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

// Compute the section total matching the CreateEstimatePanel logic
function getSectionTotal(section) {
  const items = section.items;
  const titleN = normalizeDesc(section.title);
  const bracketItems = items.filter(i => isSubtotalHeader(i.description));

  if (LEAF_ONLY_SECTIONS.includes(titleN) || bracketItems.length === 0) {
    // Sum leaves only
    return items
      .filter(i => !isSubtotalHeader(i.description) && !isSpacer(i.description))
      .reduce((s, i) => s + (i.total || 0), 0);
  }
  // Sum bracket subtotals (use injected total for special brackets)
  const subtotalMap = buildSubtotals(items);
  return bracketItems.reduce((s, i) => s + (subtotalMap[i.id] || 0), 0);
}

export async function generateEstimatePDF({ clientInfo, sections, subtotal, taxAmount, total, estimateNumber, logoUrls = {}, manwayAvgDCSM = 0, conventionalCostsTotal = 0, hideZeroItems = false }) {
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

  const setFill  = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);

  const checkPage = (needed = 20) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

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
  const dynaVentImg   = logoUrls.dynaVentLogo   ? await loadImage(logoUrls.dynaVentLogo)   : null;

  // ── Header: 3-column layout ─────────────────────────────────────────────────
  const logoH = 38;
  const logoY = y;

  if (infoSignalImg) {
    doc.addImage(infoSignalImg, 'PNG', margin, logoY, 110, logoH);
  } else {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    setColor(orange);
    doc.text('InfoSignal', margin, logoY + 26);
  }

  const centerX = pageW / 2;
  if (dynaVentImg) {
    doc.addImage(dynaVentImg, 'PNG', centerX - 30, logoY + (logoH - logoH * 0.5) / 2, 60, logoH * 0.5);
  } else {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    setColor(orange);
    doc.text('DynaVent', centerX, logoY + 26, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('BREATHE INNOVATION', centerX, logoY + 36, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setColor(dark);
  doc.text('DCSM Project Budgetary Estimate', pageW - margin, logoY + 20, { align: 'right' });

  y = logoY + logoH + 10;

  // Separator
  doc.setDrawColor(200, 195, 190);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // ── Customer details block ─────────────────────────────────────────────────
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${months[now.getMonth()]}-${String(now.getDate()).padStart(2,'0')},-${String(now.getFullYear()).slice(-2)}`;

  // Format dates to match app display (e.g. 2026-05-01 → 2026-05-01)
  const fmtDate = (d) => d || '—';

  // Layout: labels are RIGHT-aligned at labelRightX, values start at valueX (matching app)
  // Right column: date labels right-aligned at dateRightX, values start after
  const labelRightX = margin + 110;  // labels flush right here
  const valueX      = margin + 118;  // values start here (orange)
  const rightColX   = pageW - margin - 150; // right-side label area start
  const rightValX   = pageW - margin;       // right-side values (right-aligned)
  const rowGap = 14;

  doc.setFontSize(8.5);

  const mainFields = [
    { label: 'Customer',               value: clientInfo.client_name    || '' },
    { label: 'Site / Location / Plant', value: clientInfo.client_address || '' },
    { label: 'Attention',              value: clientInfo.client_email   || '' },
    { label: 'Project Name',           value: clientInfo.project_name   || '' },
    { label: 'Project',                value: clientInfo.project_number || '' },
  ];

  const rightFields = [
    { label: 'Date',       value: dateStr },
    { label: 'Start Date', value: fmtDate(clientInfo.start_date) },
    { label: 'End Date',   value: fmtDate(clientInfo.end_date) },
  ];

  const totalRows = Math.max(mainFields.length, rightFields.length);
  for (let idx = 0; idx < totalRows; idx++) {
    const rowY = y + idx * rowGap;

    // Left column: label right-aligned, value left-aligned in orange
    if (idx < mainFields.length) {
      const field = mainFields[idx];
      doc.setFont('helvetica', 'bold');
      setColor(dark);
      doc.text(field.label, labelRightX, rowY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      setColor(orange);
      doc.text(field.value, valueX, rowY);
    }

    // Right column: label right-aligned, value right-aligned in orange
    if (idx < rightFields.length) {
      const rf = rightFields[idx];
      doc.setFont('helvetica', 'bold');
      setColor(dark);
      doc.text(rf.label, rightColX, rowY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      setColor(orange);
      doc.text(rf.value, rightValX, rowY, { align: 'right' });
    }
  }

  y += totalRows * rowGap + 6;

  // Phone + Notes in a 2-column row (matching app layout)
  if (clientInfo.client_phone || (clientInfo.notes && clientInfo.notes.trim())) {
    const halfW = contentW / 2 - 8;
    const notesX = margin + contentW / 2 + 4;

    // Light background row
    setFill([249, 250, 251]);
    doc.rect(margin, y - 4, contentW, 36, 'F');
    doc.setDrawColor(220, 215, 210);
    doc.setLineWidth(0.5);
    doc.rect(margin, y - 4, contentW, 36, 'S');

    // Phone label + value
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(muted);
    doc.text('Phone', margin + 6, y + 4);
    doc.setFontSize(8.5);
    setColor(dark);
    doc.text(clientInfo.client_phone || '', margin + 6, y + 18);

    // Notes label + value
    setColor(muted);
    doc.setFontSize(7.5);
    doc.text('Notes', notesX, y + 4);
    doc.setFontSize(8.5);
    setColor(dark);
    if (clientInfo.notes && clientInfo.notes.trim()) {
      const noteLines = doc.splitTextToSize(clientInfo.notes, halfW);
      doc.text(noteLines[0] || '', notesX, y + 18);
    }

    y += 44;
  }

  // Separator
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
  const nonSummarySections = sections.filter(s => !s._isSummary);
  const summarySection     = sections.find(s => s._isSummary);

  nonSummarySections.forEach((section) => {
    checkPage(40);

    const sectionStartY = y;
    const isProjTotals  = isProjectTotalsSection(section.title);
    const subtotalMap   = buildSubtotals(section.items);
    const secTotal      = getSectionTotal(section);

    // Section header
    setFill(light);
    doc.rect(margin, y - 2, contentW, 18, 'F');
    setFill(orange);
    doc.rect(margin, y - 2, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setColor(dark);
    doc.text(section.title, margin + 10, y + 10);

    if (!isProjTotals) {
      const titleN = normalizeDesc(section.title);
      const sectionIsHour = HOUR_ITEMS.includes(titleN);
      setColor(orange);
      doc.text(fmtVal(secTotal, sectionIsHour), colTotal, y + 10, { align: 'right' });
    }
    y += 22;

    // Items — hide zero-value leaf items when hideZeroItems is set (project linked)
    const visibleItems = section.items.filter(item => {
      if (!hideZeroItems) return true;
      if (isSubtotalHeader(item.description) || isSpacer(item.description)) return true;
      return (item.total || 0) !== 0 || (item.unit_price || 0) !== 0;
    });

    // Column headers
    if (visibleItems.length > 0 && !isProjTotals) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      setColor(muted);
      doc.text('DESCRIPTION', colDesc, y);
      doc.text('QTY',    colQty,   y, { align: 'right' });
      doc.text('UNIT $', colUnit,  y, { align: 'right' });
      doc.text('MKP%',   colMkup,  y, { align: 'right' });
      doc.text('TOTAL',  colTotal, y, { align: 'right' });
      y += 4;
      setStroke(muted);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentW, y);
      y += 10;
    }

    // Items — hide zero-value leaf items when hideZeroItems is set (project linked)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    let regularRowIdx = 0;

    visibleItems.forEach((item) => {
      const isHeader = isSubtotalHeader(item.description);
      const spacer   = isSpacer(item.description);
      checkPage(18);

      if (spacer) {
        doc.setFillColor(180, 180, 180);
        doc.rect(margin, y - 6, contentW, 10, 'F');
        y += 10;
        return;
      }

      if (isHeader) {
        doc.setFillColor(255, 237, 213);
        doc.rect(margin, y - 10, contentW, 16, 'F');
        setFill(orange);
        doc.rect(margin, y - 10, 3, 16, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setColor(orange);
        const descLines = doc.splitTextToSize(item.description || '', isProjTotals ? contentW - 100 : colQty - colDesc - 12);
        doc.text(descLines, colDesc + 6, y);

        const n = normalizeDesc(item.description);
        const isInjected = INJECTED_TOTAL_ITEMS.includes(n);
        const displayTotal = isInjected ? (item.total || 0) : (subtotalMap[item.id] || 0);
        const isHourBracket = isHourItem(item.description);

        if (isProjTotals) {
          doc.text(fmtVal(displayTotal, isHourBracket), colTotal, y, { align: 'right' });
        } else {
          const unitPrice = (item.unit_price || 0) > 0 ? item.unit_price : displayTotal;
          doc.text('1', colQty, y, { align: 'right' });
          doc.text(fmtVal(unitPrice, isHourBracket), colUnit, y, { align: 'right' });
          doc.text('0%', colMkup, y, { align: 'right' });
          doc.text(fmtVal(displayTotal, isHourBracket), colTotal, y, { align: 'right' });
        }

        doc.setFont('helvetica', 'normal');
        y += descLines.length > 1 ? descLines.length * 11 : 16;
        regularRowIdx = 0;
      } else {
        if (!isProjTotals && regularRowIdx % 2 === 0) {
          doc.setFillColor(250, 249, 247);
          doc.rect(margin, y - 9, contentW, 14, 'F');
        }
        setColor(dark);
        doc.setFont('helvetica', 'normal');
        const descLines = doc.splitTextToSize(item.description || '', isProjTotals ? contentW - 100 : colQty - colDesc - 8);
        doc.text(descLines, colDesc, y);

        if (isProjTotals) {
          doc.setFont('helvetica', 'bold');
          doc.text(fmtVal(item.total || 0, isHourItem(item.description)), colTotal, y, { align: 'right' });
          doc.setFont('helvetica', 'normal');
        } else {
          doc.text(String(item.quantity ?? 1), colQty, y, { align: 'right' });
          doc.text(fmtMoney(item.unit_price || 0), colUnit, y, { align: 'right' });
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
    const sectionEndY  = y;
    const sectionPadding = 6;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin - sectionPadding / 2, sectionStartY - 2 - sectionPadding / 2, contentW + sectionPadding, sectionEndY - sectionStartY + 2 + sectionPadding, 'S');
  });

  // ── Summary Section ─────────────────────────────────────────────────────────
  if (summarySection) {
    checkPage(120);
    const summaryStartY = y;
    y += 8;

    setFill(light);
    doc.rect(margin, y - 2, contentW, 18, 'F');
    setFill(orange);
    doc.rect(margin, y - 2, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setColor(dark);
    doc.text(summarySection.title || 'Summary', margin + 10, y + 10);
    y += 22;

    const colWidth = contentW / 2 - 10;
    const leftX  = margin;
    const rightX = margin + contentW / 2 + 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setColor(dark);
    doc.text('DCSM and Ventilation Cost per Manway/Day', leftX,  y);
    doc.text('Conventional Costs Per Manway/Day',       rightX, y);
    y += 8;

    setStroke(muted);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentW, y);
    y += 10;

    const durationDays = (() => {
      if (!clientInfo.start_date || !clientInfo.end_date) return 0;
      const start = new Date(clientInfo.start_date);
      const end   = new Date(clientInfo.end_date);
      const diff  = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      return diff > 0 ? diff : 0;
    })();

    const manwayStr = manwayAvgDCSM > 0 ? manwayAvgDCSM.toFixed(2) : '0';
    const costPerManwayDay = (durationDays > 0 && manwayAvgDCSM > 0)
      ? fmtMoney((subtotal / durationDays) / manwayAvgDCSM)
      : '$0.00';
    const convCostPerManwayDay = (durationDays > 0 && manwayAvgDCSM > 0)
      ? fmtMoney((conventionalCostsTotal / durationDays) / manwayAvgDCSM)
      : '$0.00';

    const leftRows  = [
      { label: 'Number of Manways (Averaged out over duration) DCSM', value: manwayStr },
      { label: 'Number of days DCSM',                                  value: String(durationDays) },
      { label: 'Total Cost',                                            value: fmtMoney(subtotal),     bold: true },
      { label: 'Cost per manway/day',                                  value: costPerManwayDay,        bold: true, primary: true },
    ];
    const rightRows = [
      { label: 'Number of Manways (Averaged out over duration)', value: manwayStr },
      { label: 'Number of days',                                  value: String(durationDays) },
      { label: 'Total Cost',                                      value: fmtMoney(conventionalCostsTotal), bold: true },
      { label: 'Cost per manway/day',                             value: convCostPerManwayDay,             bold: true, primary: true },
    ];

    const rowSpacing = 22;

    leftRows.forEach((row, idx) => {
      const rowY = y + idx * rowSpacing;
      setColor(muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(row.label, leftX, rowY);
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      setColor(row.primary ? orange : dark);
      doc.text(row.value, leftX + colWidth, rowY, { align: 'right' });
    });

    rightRows.forEach((row, idx) => {
      const rowY = y + idx * rowSpacing;
      setColor(muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(row.label, rightX, rowY);
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      setColor(row.primary ? orange : dark);
      doc.text(row.value, rightX + colWidth, rowY, { align: 'right' });
    });

    y += leftRows.length * rowSpacing + 12;
    const summaryEndY  = y;
    const summaryPadding = 6;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(margin - summaryPadding / 2, summaryStartY - 2 - summaryPadding / 2, contentW + summaryPadding, summaryEndY - summaryStartY + 2 + summaryPadding, 'S');
  }

  // ── Totals box ──────────────────────────────────────────────────────────────
  checkPage(90);
  y += 8;
  const boxW = 200;
  const boxX = pageW - margin - boxW;

  setStroke(orange);
  doc.setLineWidth(0.5);
  doc.rect(boxX, y, boxW, clientInfo.discount > 0 ? 82 : 68, 'S');

  const rowH = 17;
  doc.setFontSize(8.5);

  const drawTotalRow = (label, value) => {
    doc.setFont('helvetica', 'normal');
    setColor(muted);
    doc.text(label, boxX + 12, y + 12);
    setColor(dark);
    doc.text(value, boxX + boxW - 12, y + 12, { align: 'right' });
    y += rowH;
  };

  drawTotalRow('Subtotal', fmtMoney(subtotal));
  drawTotalRow(`Tax (${clientInfo.tax_rate || 0}%)`, fmtMoney(taxAmount));
  if (clientInfo.discount > 0) {
    drawTotalRow('Discount', `-${fmtMoney(clientInfo.discount || 0)}`);
  }

  setFill(orange);
  doc.rect(boxX, y, boxW, rowH + 4, 'F');
  setColor(white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', boxX + 12, y + 13);
  doc.text(fmtMoney(total), boxX + boxW - 12, y + 13, { align: 'right' });

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerY = pageH - 28;
  setStroke(light);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 8, pageW - margin, footerY - 8);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  setColor(muted);
  doc.text('This estimate is valid for 30 days from the date issued.', margin, footerY);
  doc.text('Page 1', pageW - margin, footerY, { align: 'right' });

  // ── Save ────────────────────────────────────────────────────────────────────
  const filename = `Estimate${estimateNumber ? `-${estimateNumber}` : ''}${clientInfo.client_name ? `-${clientInfo.client_name.replace(/\s+/g, '_')}` : ''}.pdf`;
  doc.save(filename);
}