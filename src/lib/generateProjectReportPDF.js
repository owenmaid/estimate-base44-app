import jsPDF from 'jspdf';

const fmtMoney = (val) => `$${Number(val || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d || '—';

const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

/**
 * Generates a clean PDF summary for a project.
 * @param {object} project  - The full project record
 * @param {object} summary  - Pre-computed allocation summary from the reporting page
 *   { statusLabel, durationDays, totalTasks, doneTasks, progress,
 *     assignees: [{name, tasks, done, projects: []}],
 *     equipmentRows: [{label, cost}],
 *     totalEquipmentCost, totalManpowerItems, conflicts: [] }
 */
export function generateProjectReportPDF(project, summary) {
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

  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);

  const checkPage = (needed = 24) => {
    if (y + needed > pageH - margin - 24) {
      // Footer
      setStroke(light);
      doc.setLineWidth(0.5);
      doc.line(margin, pageH - margin - 4, pageW - margin, pageH - margin - 4);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      setColor(muted);
      doc.text(`Project Report — ${project.name || ''}`, margin, pageH - margin + 10);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - margin, pageH - margin + 10, { align: 'right' });

      doc.addPage();
      y = margin;
    }
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setColor(orange);
  doc.text('Project Summary Report', margin, y + 6);
  y += 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(muted);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Generated ${dateStr}`, margin, y + 10);
  y += 22;

  setStroke([200, 195, 190]);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  // ── Project Details ──────────────────────────────────────────────────────────
  const detailRows = [
    { label: 'Project Name', value: project.name || '—' },
    { label: 'Project Number', value: project.project_number || '—' },
    { label: 'Client', value: project.client || '—' },
    { label: 'Site', value: project.site || '—' },
    { label: 'Location', value: project.location || '—' },
    { label: 'Plant', value: project.plant || '—' },
    { label: 'Start Date', value: fmtDate(project.start_date) },
    { label: 'End Date', value: fmtDate(project.end_date) },
    { label: 'Duration', value: summary.durationDays > 0 ? `${summary.durationDays} days` : '—' },
    { label: 'Phone', value: project.phone || '—' },
  ];

  const labelW = 130;
  const rowH = 15;
  doc.setFontSize(9);

  detailRows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      setFill([250, 249, 247]);
      doc.rect(margin, y - 10, contentW, rowH, 'F');
    }
    doc.setFont('helvetica', 'bold');
    setColor(dark);
    doc.text(row.label, margin + 4, y);
    doc.setFont('helvetica', 'normal');
    setColor(orange);
    doc.text(String(row.value), margin + labelW, y);
    y += rowH;
  });

  y += 6;

  // ── Status & Progress box ───────────────────────────────────────────────────
  checkPage(80);
  setStroke(orange);
  doc.setLineWidth(0.75);
  const boxH = 64;
  doc.rect(margin, y, contentW, boxH, 'S');

  // Status (left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(muted);
  doc.text('CURRENT STATUS', margin + 16, y + 18);
  doc.setFontSize(16);
  setColor(orange);
  doc.text(summary.statusLabel, margin + 16, y + 38);

  // Progress (center)
  const centerX = margin + contentW * 0.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(muted);
  doc.text('PROGRESS', centerX, y + 18);
  doc.setFontSize(16);
  setColor(dark);
  doc.text(`${summary.progress}%`, centerX, y + 38);
  // Progress bar
  const barW = 120;
  setFill(light);
  doc.rect(centerX, y + 46, barW, 6, 'F');
  setFill(orange);
  doc.rect(centerX, y + 46, barW * (summary.progress / 100), 6, 'F');

  // Tasks (right)
  const rightX = margin + contentW - 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(muted);
  doc.text('TASKS COMPLETED', rightX, y + 18, { align: 'right' });
  doc.setFontSize(16);
  setColor(dark);
  doc.text(`${summary.doneTasks} / ${summary.totalTasks}`, rightX, y + 38, { align: 'right' });

  y += boxH + 18;

  // ── Resource Allocation Summary ─────────────────────────────────────────────
  checkPage(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setColor(dark);
  doc.text('Resource Allocation', margin, y);
  y += 6;
  setFill(orange);
  doc.rect(margin, y, contentW, 2, 'F');
  y += 14;

  // Summary tiles
  const tileW = (contentW - 16) / 3;
  const tiles = [
    { label: 'Assigned Resources', value: String(summary.assignees.length) },
    { label: 'Total Line Items', value: String(summary.totalTasks) },
    { label: 'Equipment Cost', value: fmtMoney(summary.totalEquipmentCost) },
  ];
  tiles.forEach((tile, i) => {
    const tx = margin + i * (tileW + 8);
    setFill(light);
    doc.rect(tx, y, tileW, 44, 'F');
    setFill(orange);
    doc.rect(tx, y, 3, 44, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(muted);
    doc.text(tile.label.toUpperCase(), tx + 10, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setColor(dark);
    doc.text(tile.value, tx + 10, y + 34);
  });
  y += 58;

  // ── Assignee table ────────────────────────────────────────────────────────────
  checkPage(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setColor(dark);
  doc.text('Assigned Personnel', margin, y);
  y += 8;

  // Column positions
  const colName = margin;
  const colTasks = margin + contentW * 0.45;
  const colDone = margin + contentW * 0.62;
  const colProjects = margin + contentW * 0.78;
  const colStatus = margin + contentW;

  // Header row
  setFill(light);
  doc.rect(margin, y - 2, contentW, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setColor(muted);
  doc.text('RESOURCE', colName + 6, y + 9);
  doc.text('ITEMS', colTasks, y + 9, { align: 'right' });
  doc.text('DONE', colDone, y + 9, { align: 'right' });
  doc.text('PROJECTS', colProjects, y + 9, { align: 'right' });
  doc.text('STATUS', colStatus, y + 9, { align: 'right' });
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  if (summary.assignees.length === 0) {
    setColor(muted);
    doc.text('No personnel assigned to this project.', margin + 6, y + 4);
    y += 20;
  } else {
    summary.assignees.forEach((a, idx) => {
      checkPage(16);
      if (idx % 2 === 0) {
        setFill([250, 249, 247]);
        doc.rect(margin, y - 9, contentW, 14, 'F');
      }
      setColor(dark);
      const nameLines = doc.splitTextToSize(a.name || '', colTasks - colName - 12);
      doc.text(nameLines[0] || '', colName + 6, y);

      doc.text(String(a.tasks), colTasks, y, { align: 'right' });
      doc.text(String(a.done), colDone, y, { align: 'right' });
      doc.text(String(a.projects), colProjects, y, { align: 'right' });

      // Status badge text
      const isComplete = a.done >= a.tasks && a.tasks > 0;
      setColor(isComplete ? [22, 163, 74] : [180, 130, 30]);
      doc.setFont('helvetica', 'bold');
      doc.text(isComplete ? 'Complete' : 'In Progress', colStatus, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 14;
    });
  }

  y += 12;

  // ── Equipment breakdown ──────────────────────────────────────────────────────
  if (summary.equipmentRows.length > 0) {
    checkPage(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(dark);
    doc.text('Equipment Breakdown', margin, y);
    y += 8;

    setFill(light);
    doc.rect(margin, y - 2, contentW, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColor(muted);
    doc.text('EQUIPMENT', colName + 6, y + 9);
    doc.text('COST', colStatus, y + 9, { align: 'right' });
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    summary.equipmentRows.forEach((row, idx) => {
      checkPage(16);
      if (idx % 2 === 0) {
        setFill([250, 249, 247]);
        doc.rect(margin, y - 9, contentW, 14, 'F');
      }
      setColor(dark);
      const labelLines = doc.splitTextToSize(row.label || '', contentW - 140);
      doc.text(labelLines[0] || '', colName + 6, y);
      doc.setFont('helvetica', 'bold');
      doc.text(fmtMoney(row.cost), colStatus, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 14;
    });

    // Total row
    checkPage(18);
    setFill(orange);
    doc.rect(margin, y - 9, contentW, 18, 'F');
    setColor(white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL EQUIPMENT COST', colName + 6, y + 3);
    doc.text(fmtMoney(summary.totalEquipmentCost), colStatus, y + 3, { align: 'right' });
    y += 26;
  }

  // ── Conflicts ─────────────────────────────────────────────────────────────────
  if (summary.conflicts.length > 0) {
    checkPage(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor([200, 50, 50]);
    doc.text('Scheduling Conflicts', margin, y);
    y += 8;

    setFill([254, 242, 242]);
    doc.rect(margin, y - 2, contentW, 16, 'F');
    setFill([200, 50, 50]);
    doc.rect(margin, y - 2, 3, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColor(muted);
    doc.text('RESOURCE', colName + 6, y + 9);
    doc.text('CONFLICT', colStatus, y + 9, { align: 'right' });
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    summary.conflicts.forEach((c, idx) => {
      checkPage(16);
      setColor(dark);
      doc.text(c.resource, colName + 6, y);
      const conflictLines = doc.splitTextToSize(c.detail, contentW - 200);
      setColor([200, 50, 50]);
      doc.text(conflictLines[0] || '', colStatus, y, { align: 'right' });
      y += 14;
    });
    y += 8;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────
  if (project.notes && project.notes.trim()) {
    checkPage(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(dark);
    doc.text('Notes', margin, y);
    y += 8;
    setFill(light);
    doc.rect(margin, y - 2, contentW, 40, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(dark);
    const noteLines = doc.splitTextToSize(project.notes, contentW - 12);
    let noteY = y + 10;
    noteLines.slice(0, 3).forEach((line) => {
      doc.text(line, margin + 6, noteY);
      noteY += 11;
    });
    y += 44;
  }

  // ── Footer on last page ─────────────────────────────────────────────────────────
  setStroke(light);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - margin - 4, pageW - margin, pageH - margin - 4);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  setColor(muted);
  doc.text(`Project Report — ${project.name || ''}`, margin, pageH - margin + 10);
  doc.text(`Generated ${dateStr}`, pageW - margin, pageH - margin + 10, { align: 'right' });

  // ── Save ────────────────────────────────────────────────────────────────────────
  const safeName = (project.name || 'project').replace(/[^\w-]+/g, '_');
  doc.save(`Project-Report-${safeName}.pdf`);
}