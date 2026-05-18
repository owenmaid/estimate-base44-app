import jsPDF from 'jspdf';

export function generateEstimatePDF({ clientInfo, sections, subtotal, taxAmount, total, estimateNumber }) {
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

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...orange);
  doc.rect(0, 0, pageW, 70, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATE', margin, 42);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (estimateNumber) doc.text(`#${estimateNumber}`, margin, 58);

  // Date top-right
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(dateStr, pageW - margin, 42, { align: 'right' });

  y = 90;

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

    // Section header
    doc.setFillColor(...light);
    doc.rect(margin, y - 2, contentW, 18, 'F');
    doc.setFillColor(...orange);
    doc.rect(margin, y - 2, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text(section.title, margin + 10, y + 10);

    const secTotal = section.items.reduce((s, i) => s + (i.total || 0), 0);
    doc.setTextColor(...orange);
    doc.text(`$${secTotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, colTotal, y + 10, { align: 'right' });
    y += 22;

    // Column headers
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

    // Items
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    section.items.forEach((item, idx) => {
      checkPage(16);
      if (idx % 2 === 0) {
        doc.setFillColor(250, 249, 247);
        doc.rect(margin, y - 9, contentW, 14, 'F');
      }
      doc.setTextColor(...dark);
      const descLines = doc.splitTextToSize(item.description || '', colQty - colDesc - 8);
      doc.text(descLines, colDesc, y);
      doc.text(String(item.quantity ?? 1), colQty, y, { align: 'right' });
      doc.text(`$${(item.unit_price || 0).toFixed(2)}`, colUnit, y, { align: 'right' });
      doc.text(`${item.markup || 0}%`, colMkup, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(`$${(item.total || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, colTotal, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += descLines.length > 1 ? descLines.length * 11 : 14;
    });

    if (section.items.length === 0) {
      doc.setTextColor(...muted);
      doc.setFontSize(8);
      doc.text('(no items)', colDesc, y);
      y += 14;
    }

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