import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Columns } from 'lucide-react';
import SectionBlock from './SectionBlock';
import SummarySection from './SummarySection';

const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
const isSpacer = (desc) => (desc || '') === '__SPACER__';
const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();
const HOUR_ITEMS = ['total labour | logistics cost', 'dcsm est total hours', 'total ventilation labour hours', 'total project labour hours'];
const isHourItem = (desc) => HOUR_ITEMS.includes(normalizeDesc(desc));
const isHourSection = (title) => HOUR_ITEMS.includes(normalizeDesc(title));

export default function EstimateCanvas({
  clientInfo, onClientInfoChange,
  sections, onRenameSection, onRemoveSection, onSplitSection,
  onUpdateItem, onRemoveItem, onReorderItems, onReorderSections,
  subtotal, taxAmount, total, inventory = [], logoUrls = {}, manwayAvgDCSM = 0, conventionalCostsTotal = 0,
}) {
  const [showClient, setShowClient] = useState(true);

  const update = (field, value) => onClientInfoChange(prev => ({ ...prev, [field]: value }));

  const durationDays = (() => {
    if (!clientInfo.start_date || !clientInfo.end_date) return 0;
    const start = new Date(clientInfo.start_date);
    const end = new Date(clientInfo.end_date);
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  })();

  const handleSectionDragEnd = (result) => {
    if (!result.destination) return;
    const nonSummary = sections.filter(s => !s._isSummary);
    const [moved] = nonSummary.splice(result.source.index, 1);
    nonSummary.splice(result.destination.index, 0, moved);
    const summarySection = sections.filter(s => s._isSummary);
    onReorderSections([...nonSummary, ...summarySection]);
  };

  const handleSplit = (sectionId) => {
    if (onSplitSection) {
      onSplitSection(sectionId);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-5 space-y-4">
      {/* Header Preview — matches PDF layout */}
      <div className="border border-border rounded-lg overflow-hidden bg-white text-black">
        {/* Logo row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          {/* Left: InfoSignal logo */}
          <div className="w-32 flex items-center">
            {logoUrls.infoSignalLogo
              ? <img src={logoUrls.infoSignalLogo} alt="InfoSignal" className="h-9 w-auto object-contain" />
              : <span className="font-bold text-lg" style={{ color: '#dc6e1e' }}>InfoSignal</span>
            }
          </div>
          {/* Center: DynaVent logo */}
          <div className="flex flex-col items-center">
            {logoUrls.dynaVentLogo
              ? <img src={logoUrls.dynaVentLogo} alt="DynaVent" className="h-9 w-auto object-contain" />
              : <>
                  <span className="font-bold text-base" style={{ color: '#dc6e1e' }}>DynaVent</span>
                  <span className="text-gray-400 uppercase tracking-widest" style={{ fontSize: '7px' }}>Breathe Innovation</span>
                </>
            }
          </div>
          {/* Right: Title */}
          <div className="text-right">
            <span className="font-bold text-sm text-gray-900">DCSM Project Budgetary Estimate</span>
          </div>
        </div>

        {/* Customer details row */}
        <div className="flex px-5 py-2.5 text-xs gap-4 border-b border-gray-200">
          {/* Left: labels + values */}
          <div className="flex gap-4 flex-1">
            <div className="space-y-0.5 text-right shrink-0">
              {['Customer', 'Site / Location / Plant', 'Attention', 'Project Name', 'Project'].map(l => (
                <div key={l} className="font-semibold text-gray-800 leading-5">{l}</div>
              ))}
            </div>
            <div className="space-y-0.5">
              {[
                { field: 'client_name', placeholder: 'Client name' },
                { field: 'client_address', placeholder: 'Site / Location / Plant', wide: true },
                { field: 'client_email', placeholder: 'Attention / Contact' },
                { field: 'project_name', placeholder: 'Project Name', wide: true },
                { field: 'project_number', placeholder: 'Project Number' },
              ].map(({ field, placeholder, wide }) => (
                <input
                  key={field}
                  className={`block leading-5 bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-500 outline-none transition-colors ${wide ? 'w-72' : 'w-48'}`}
                  style={{ color: '#dc6e1e' }}
                  value={clientInfo[field]}
                  onChange={e => update(field, e.target.value)}
                  placeholder={placeholder}
                />
              ))}
            </div>
          </div>
          {/* Right: Date + Start/End */}
          <div className="shrink-0 text-right self-start space-y-0.5">
            <div className="flex gap-2 items-center justify-end">
              <span className="font-semibold text-gray-800">Date</span>
              <span style={{ color: '#dc6e1e' }}>{new Date().toLocaleDateString('en-CA', { day:'2-digit', month:'short', year:'2-digit' }).replace(/ /g, '-')}</span>
            </div>
            <div className="flex gap-2 items-center justify-end">
              <span className="font-semibold text-gray-800">Start Date</span>
              <input
                type="date"
                className="text-xs bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-500 outline-none transition-colors"
                style={{ color: '#dc6e1e' }}
                value={clientInfo.start_date || ''}
                onChange={e => update('start_date', e.target.value)}
              />
            </div>
            <div className="flex gap-2 items-center justify-end">
              <span className="font-semibold text-gray-800">End Date</span>
              <input
                type="date"
                className="text-xs bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-500 outline-none transition-colors"
                style={{ color: '#dc6e1e' }}
                value={clientInfo.end_date || ''}
                onChange={e => update('end_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Edit remaining fields in collapsed section */}
        <div>
          <button
            onClick={() => setShowClient(v => !v)}
            className="w-full flex items-center justify-between px-4 py-1.5 bg-gray-50 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span>Additional fields (Phone, Notes)</span>
            {showClient ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showClient && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Phone</label>
                <input
                  className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 outline-none focus:border-orange-400 transition-colors"
                  value={clientInfo.client_phone}
                  onChange={e => update('client_phone', e.target.value)}
                  placeholder="Phone"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <textarea
                  className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 outline-none focus:border-orange-400 transition-colors resize-none h-12"
                  value={clientInfo.notes}
                  onChange={e => update('notes', e.target.value)}
                  placeholder="Notes / terms…"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <DragDropContext onDragEnd={handleSectionDragEnd}>
        <Droppable droppableId="sections-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
              {sections.filter(s => !s._isSummary).map((section, idx) => (
                <Draggable key={String(section.id)} draggableId={`sec-${section.id}`} index={idx}>
                  {(drag) => (
                    <div ref={drag.innerRef} {...drag.draggableProps}>
                      <SectionBlock
                        section={section}
                        onRename={onRenameSection}
                        onRemove={onRemoveSection}
                        onSplit={handleSplit}
                        onUpdateItem={onUpdateItem}
                        onRemoveItem={onRemoveItem}
                        onReorderItems={onReorderItems}
                        inventory={inventory}
                        dragHandleProps={drag.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Summary Section */}
      <SummarySection
        title={sections.find(s => s._isSummary)?.title || 'Summary'}
        onRename={(newTitle) => {
          const summarySection = sections.find(s => s._isSummary);
          if (summarySection) {
            onRenameSection(summarySection.id, newTitle);
          }
        }}
        leftTitle="DCSM and Ventilation Cost per Manway/Day"
        rightTitle="Conventional Costs Per Manway/Day"
      >
        {{
          left: (
            <>
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                <span>Number of Manways (Averaged out over duration) DCSM</span>
                <span>{manwayAvgDCSM > 0 ? manwayAvgDCSM.toFixed(2) : 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                <span>Number of days DCSM</span>
                <span>{durationDays}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-foreground font-bold mb-2">
                <span>Total Cost</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-muted-foreground">Cost per manway/day</span>
                <span style={{ color: '#dc6e1e' }}>
                  {(durationDays > 0 && manwayAvgDCSM > 0)
                    ? `$${((subtotal / durationDays) / manwayAvgDCSM).toFixed(2)}`
                    : '$0.00'}
                </span>
              </div>
            </>
          ),
          right: (
            <>
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                <span>Number of Manways (Averaged out over duration)</span>
                <span>{manwayAvgDCSM > 0 ? manwayAvgDCSM.toFixed(2) : 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                <span>Number of days</span>
                <span>{durationDays}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-foreground">
                <span>Total Cost</span>
                <span>${conventionalCostsTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold mt-2">
                <span className="text-muted-foreground">Cost per manway/day</span>
                <span style={{ color: '#dc6e1e' }}>
                  {(durationDays > 0 && manwayAvgDCSM > 0)
                    ? `$${((conventionalCostsTotal / durationDays) / manwayAvgDCSM).toFixed(2)}`
                    : '$0.00'}
                </span>
              </div>
            </>
          )
        }}
      </SummarySection>

      {/* Totals */}
      <div className="border border-border rounded-lg p-4 bg-card ml-auto max-w-xs space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
          <span>Tax %</span>
          <input
            type="number" min="0" max="100"
            className="w-16 text-xs bg-secondary border border-border rounded px-2 py-0.5 text-foreground outline-none text-right"
            value={clientInfo.tax_rate}
            onChange={e => update('tax_rate', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Tax Amount</span>
          <span>${taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
          <span>Discount $</span>
          <input
            type="number" min="0"
            className="w-16 text-xs bg-secondary border border-border rounded px-2 py-0.5 text-foreground outline-none text-right"
            value={clientInfo.discount}
            onChange={e => update('discount', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="border-t border-border pt-2 flex justify-between text-sm font-bold text-foreground">
          <span>Total</span>
          <span className="text-primary">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}