/* eslint-disable no-unused-vars */
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, X, SlidersHorizontal, Search, Loader2, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format, isWeekend } from 'date-fns';
import { ProjectCostSummary, StatHolidaySummary } from '@/components/project-details/ProjectDetailsSummaries';
export default function ProjectDetailsSetupView({model}) {
  const { navigate, equipmentInventory, projects, saveProjectMutation, updateProjectMutation, renameProjectMutation, startDate, setStartDate, endDate, setEndDate, dates, setDates, viewMonth, setViewMonth, dateOffset, setDateOffset, equipmentRows, setEquipmentRows, equipmentGrid, setEquipmentGrid, typeGrid, setTypeGrid, selectedProjectId, setSelectedProjectId, search, setSearch, editingName, setEditingName, isEditingName, setIsEditingName, projectNumber, setProjectNumber, projectSite, setProjectSite, projectLocation, setProjectLocation, projectPlant, setProjectPlant, projectPhone, setProjectPhone, projectNotes, setProjectNotes, newEquipmentItemId, setNewEquipmentItemId, newEquipmentCategory, setNewEquipmentCategory, statHolidays, setStatHolidays, loadingHolidays, setLoadingHolidays, expandedSchedule, setExpandedSchedule, showProjectDropdown, setShowProjectDropdown, searchRef, convertingEstimate, setConvertingEstimate, tableScrollRef, bottomScrollRef, isSyncingScroll, tableScrollWidth, setTableScrollWidth, queryClient, handleRenameProject, handleCloseProject, handleLoadProject, getNextSampleNumber, buildTypeGridFromDates, handleCreateDates, autoSaveTimer, isInitialLoad, PAGE_SIZE, visibleDates, canGoPrevPage, canGoNextPage, addEquipmentRow, removeEquipmentRow, handleEquipmentCellChange, calculateEquipmentDayTotal, handleEquipmentDragEnd, sampleProjects, fetchStatHolidays, saSuStList, inventoryValueMap, rowCol4, rowCol5, rowCol6, rowCol7, rowCol8, rowSums, calculateRowCosts, buildCalculationGrid, handleSaveSchedule, handleConvertToEstimate }=model;
  return (
    <div className="p-6 space-y-6">
      {/* Header with Load Project */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Details Setup</h1>
          <p className="text-muted-foreground text-sm mt-1">Define your project timeline and assign manpower to each day.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/control-page">
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Control Page
            </Button>
          </Link>
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              placeholder="Search or select project..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowProjectDropdown(true); }}
              onFocus={() => setShowProjectDropdown(true)}
              onBlur={() => setTimeout(() => setShowProjectDropdown(false), 150)}
              className="px-3 py-2 border border-border rounded-md bg-secondary text-foreground text-sm w-64"
            />
            {showProjectDropdown && sampleProjects.length > 0 && (
              <div className="absolute top-full mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-10 max-h-72 overflow-y-auto">
                {sampleProjects.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      handleLoadProject(p.id);
                      setSearch('');
                      setShowProjectDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors border-b border-border last:border-b-0 text-sm"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedProjectId && (
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <>
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    placeholder="Enter project name"
                    className="w-40 h-9"
                    autoFocus
                  />
                  <Button onClick={handleRenameProject} size="sm" variant="default">
                    Save
                  </Button>
                  <Button onClick={() => setIsEditingName(false)} size="sm" variant="outline">
                    Cancel
                  </Button>
                </>
              ) : (
               <>
                  <Button onClick={() => {
                    const currentProject = projects.find(p => p.id === selectedProjectId);
                    setEditingName(currentProject?.name || '');
                    setIsEditingName(true);
                  }} size="sm" variant="ghost">
                    Rename
                  </Button>
                  <Button onClick={handleCloseProject} size="sm" variant="ghost">
                    <X className="h-4 w-4" /> Close
                  </Button>
                  <Button onClick={handleSaveSchedule} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500">
                    Save Schedule
                  </Button>
                  <Button
                    onClick={handleConvertToEstimate}
                    size="sm"
                    disabled={convertingEstimate}
                    className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-red-600"
                  >
                    {convertingEstimate ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Convert to Estimate
                  </Button>
               </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Date Range Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Set Project Dates
            {selectedProjectId && (
              <div className="flex items-center gap-2 ml-auto">
                <Input
                  value={projectNumber}
                  onChange={e => {
                    setProjectNumber(e.target.value);
                    base44.entities.Project.update(selectedProjectId, { project_number: e.target.value, site: projectSite, location: projectLocation, plant: projectPlant });
                  }}
                  placeholder="Project #"
                  className="w-32 h-8"
                />
                <Input
                  value={projects.find(p => p.id === selectedProjectId)?.name || ''}
                  onChange={e => {
                    const newName = e.target.value;
                    base44.entities.Project.update(selectedProjectId, { name: newName });
                  }}
                  placeholder="Project Name"
                  className="w-48 h-8"
                />
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {startDate ? format(parseISO(startDate), 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? parseISO(startDate) : undefined}
                    onSelect={date => setStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {endDate ? format(parseISO(endDate), 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate ? parseISO(endDate) : undefined}
                    onSelect={date => setEndDate(date ? format(date, 'yyyy-MM-dd') : '')}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleCreateDates} disabled={!startDate || !endDate}>
              Create Dates
            </Button>
            <Button
              variant="outline"
              onClick={fetchStatHolidays}
              disabled={!startDate || !endDate || loadingHolidays}
            >
              {loadingHolidays ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Find Stat Holidays
            </Button>
          </div>
          {dates.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {dates.length} days generated — {format(dates[0], 'MMM d, yyyy')} to {format(dates[dates.length - 1], 'MMM d, yyyy')}
            </p>
          )}

          {/* Site / Location / Plant / Phone / Notes fields */}
          <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-border">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Site</label>
              <Input
                value={projectSite}
                onChange={e => setProjectSite(e.target.value)}
                placeholder="Site name…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                value={projectLocation}
                onChange={e => setProjectLocation(e.target.value)}
                placeholder="Location…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Plant</label>
              <Input
                value={projectPlant}
                onChange={e => setProjectPlant(e.target.value)}
                placeholder="Plant…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input
                value={projectPhone}
                onChange={e => setProjectPhone(e.target.value)}
                placeholder="Phone…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-48">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input
                value={projectNotes}
                onChange={e => setProjectNotes(e.target.value)}
                placeholder="Notes…"
                className="w-full h-9"
              />
            </div>
          </div>

        </CardContent>
      </Card>

      <StatHolidaySummary holidays={statHolidays} startDate={startDate} endDate={endDate} />
      <ProjectCostSummary
        selectedProjectId={selectedProjectId}
        equipmentRows={equipmentRows}
        equipmentInventory={equipmentInventory}
        rowCosts={calculateRowCosts}
      />

      {/* Equipment Spreadsheet + Calculations */}
      {dates.length > 0 && (
        <div className={expandedSchedule ? "fixed inset-0 z-50 bg-background p-4 overflow-auto flex gap-4 items-start" : "flex gap-4 items-start"}>
        <Card className="flex-1 min-w-0">
          <CardHeader className={`pb-2${expandedSchedule ? ' sticky top-0 z-30 bg-card border-b border-border' : ''}`}>
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Equipment Schedule</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExpandedSchedule(e => !e)}
                >
                  {expandedSchedule ? 'Collapse' : 'Expand Equip Schedule'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    const newTypeGrid = { ...typeGrid };
                    dates.forEach(d => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const dayOfWeek = d.getDay();
                      let type = 'N'; // default to weekday
                      
                      if (dayOfWeek === 6) {
                        type = 'Sa'; // Saturday
                      } else if (dayOfWeek === 0) {
                        type = 'Su'; // Sunday
                      } else {
                        // Check if it's a stat holiday
                        const isHoliday = statHolidays.some(h => {
                          try {
                            const hDate = format(parseISO(h.date), 'yyyy-MM-dd');
                            return hDate === dateStr;
                          } catch {
                            return false;
                          }
                        });
                        if (isHoliday) type = 'St';
                      }
                      newTypeGrid[dateStr] = type;
                    });
                    setTypeGrid(newTypeGrid);
                  }}
                >
                  Auto-fill Types
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                {dates.length > 0 && visibleDates.length > 0
                  ? `${format(visibleDates[0], 'MMM d')} – ${format(visibleDates[visibleDates.length - 1], 'MMM d, yyyy')}`
                  : ''}
              </span>
            </div>
            {dates.length > PAGE_SIZE && (
              <div className="flex items-center gap-2 mt-2">
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setDateOffset(o => Math.max(0, o - PAGE_SIZE))} disabled={!canGoPrevPage}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, dates.length - PAGE_SIZE)}
                  step={1}
                  value={dateOffset}
                  onChange={e => setDateOffset(Number(e.target.value))}
                  className="flex-1 accent-primary h-1.5 cursor-pointer"
                />
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setDateOffset(o => Math.min(dates.length - PAGE_SIZE, o + PAGE_SIZE))} disabled={!canGoNextPage}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={tableScrollRef}
              className="overflow-x-auto"
              onScroll={e => {
                if (isSyncingScroll.current) return;
                isSyncingScroll.current = true;
                if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = e.target.scrollLeft;
                isSyncingScroll.current = false;
              }}
            >
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Type row — references Sa_Su_St list from Control Page */}
                  <tr className="bg-secondary/40 border-b border-border" style={{ height: '36px', ...(expandedSchedule ? { position: 'sticky', top: 0, zIndex: 20 } : {}) }}>
                    <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold text-primary border-r border-border text-xs min-w-[50px] w-[50px]" style={expandedSchedule ? { backgroundColor: 'hsl(var(--card))' } : {}}>
                    </th>
                    <th className="sticky bg-card px-2 py-2 text-left font-semibold text-primary border-r border-border text-xs min-w-[90px] w-[90px]" style={{ left: '50px', ...(expandedSchedule ? { backgroundColor: 'hsl(var(--card))' } : {}) }}>
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-primary min-w-[260px] border-r border-border text-xs" style={expandedSchedule ? { backgroundColor: 'hsl(var(--secondary) / 0.6)' } : {}}>
                     Type
                    </th>
                    {visibleDates.map((d) => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const typeVal = typeGrid[dateStr] !== undefined ? typeGrid[dateStr] : '';
                      return (
                        <th key={d.toISOString()} className="px-1 py-1 text-center border-r border-border last:border-r-0 w-[100px]">
                          <select
                            className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 text-xs text-foreground outline-none cursor-pointer appearance-none"
                            style={{ backgroundImage: 'none' }}
                            value={typeVal}
                            onChange={e => setTypeGrid(prev => ({ ...prev, [dateStr]: e.target.value }))}
                          >
                            <option value=""></option>
                            <option value="N">N</option>
                            <option value="Sa">Sa</option>
                            <option value="Su">Su</option>
                            <option value="St">St</option>
                            {saSuStList.map((item, idx) => (
                              <option key={idx} value={item}>{item}</option>
                            ))}
                          </select>
                        </th>
                      );
                    })}
                  </tr>
                  <tr className="bg-secondary/60 border-b border-border" style={{ height: '40px', ...(expandedSchedule ? { position: 'sticky', top: '36px', zIndex: 20 } : {}) }}>
                    <th className="sticky left-0 z-10 bg-secondary/100 px-2 py-2.5 text-left font-semibold text-muted-foreground border-r border-border min-w-[50px] w-[50px]">
                     Line_ID
                   </th>
                    <th className="sticky bg-secondary/100 px-2 py-2.5 text-left font-semibold text-muted-foreground border-r border-border min-w-[90px] w-[90px]" style={{ left: '50px' }}>
                     Item_ID
                   </th>
                   <th className="bg-secondary/100 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[260px] border-r border-border">
                    Services
                   </th>
                    {visibleDates.map(d => {
                      const weekend = isWeekend(d);
                      return (
                        <th
                          key={d.toISOString()}
                          className={`px-1.5 py-2.5 text-center font-medium w-[100px] border-r border-border last:border-r-0 ${weekend ? 'text-muted-foreground/50' : 'text-foreground'}`}
                        >
                          <div>{format(d, 'EEE')}</div>
                          <div className="font-bold">{format(d, 'd')}</div>
                        </th>
                        );
                        })}
                        </tr>
                        </thead>
                        <DragDropContext onDragEnd={handleEquipmentDragEnd}>
                        <Droppable droppableId="equipment-rows">
                          {(provided) => (
                            <tbody ref={provided.innerRef} {...provided.droppableProps}>
                        {equipmentRows.map((row, rIdx) => (
                    <Draggable key={String(row.id)} draggableId={String(row.id)} index={rIdx}>
                      {(dragProvided, dragSnapshot) => (
                      <tr
                       ref={dragProvided.innerRef}
                       {...dragProvided.draggableProps}
                       className={`border-b border-border hover:bg-secondary/20 transition-colors ${dragSnapshot.isDragging ? 'bg-secondary/40' : ''}`}
                       style={{ ...dragProvided.draggableProps.style, height: '40px' }}
                      >
                      <td className="sticky left-0 z-10 bg-card px-2 py-2 border-r border-border min-w-[50px] w-[50px] text-center">
                       <span className="font-mono text-xs text-muted-foreground">{rIdx + 1}</span>
                      </td>
                      <td className="sticky bg-card px-2 py-2 border-r border-border min-w-[90px] w-[90px]" style={{ left: '50px' }}>
                       <span className="font-mono text-xs text-primary truncate block max-w-[80px]" title={row.item_id || '—'}>
                         {row.item_id ? row.item_id.slice(-8) : <span className="opacity-30">—</span>}
                       </span>
                      </td>
                      <td className="bg-card px-4 py-2 border-r border-border">
                        <div className="flex items-center gap-1">
                          <span {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium text-foreground truncate max-w-[220px]" title={row.label}>{row.label}</span>
                          {equipmentRows.length > 0 && (
                            <button
                              onClick={() => removeEquipmentRow(row.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors text-xs ml-auto"
                              title="Remove row"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      {visibleDates.map(d => {
                        const dateStr = format(d, 'yyyy-MM-dd');
                        const key = `${row.id}_${dateStr}`;
                        const weekend = isWeekend(d);
                        return (
                          <td
                            key={dateStr}
                            className={`px-1 py-1 border-r border-border last:border-r-0 w-[200px] ${weekend ? 'bg-secondary/30' : ''}`}
                            >
                              <input
                                 type="number"
                                 min="0"
                                 max="999"
                                 value={equipmentGrid[key] || ''}
                                 onChange={e => handleEquipmentCellChange(row.id, dateStr, e.target.value)}
                                 className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-1 text-xs text-foreground outline-none cursor-pointer transition-all"
                                 placeholder="—"
                               />
                          </td>
                        );
                      })}
                    </tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  </tbody>
                  )}
                  </Droppable>
                  </DragDropContext>
                  <tbody>
                  <tr className="bg-secondary/40 border-t-2 border-border font-semibold">
                    <td className="sticky left-0 z-10 bg-secondary/40 px-2 py-2 border-r border-border min-w-[50px] w-[50px]"></td>
                    <td className="sticky bg-secondary/40 px-2 py-2 border-r border-border min-w-[90px] w-[90px]" style={{ left: '50px' }}></td>
                    <td className="bg-secondary/40 px-4 py-2 border-r border-border text-muted-foreground min-w-[260px]">
                      Daily Total
                    </td>
                    {visibleDates.map(d => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const weekend = isWeekend(d);
                      return (
                        <td
                          key={dateStr}
                          className={`px-1.5 py-2 text-center border-r border-border last:border-r-0 text-foreground w-[200px] ${weekend ? 'bg-secondary/30' : ''}`}
                        >
                          {calculateEquipmentDayTotal(dateStr)}
                        </td>
                      );
                    })}
                  </tr>
                  </tbody>
              </table>
            </div>
            {/* Mirror scrollbar — syncs with the table above */}
            <div
              ref={bottomScrollRef}
              className="overflow-x-auto border-t border-border"
              style={{ height: '12px' }}
              onScroll={e => {
                if (isSyncingScroll.current) return;
                isSyncingScroll.current = true;
                if (tableScrollRef.current) tableScrollRef.current.scrollLeft = e.target.scrollLeft;
                isSyncingScroll.current = false;
              }}
            >
              <div style={{ width: tableScrollWidth || '100%', height: '1px' }} />
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center gap-2">
              <select
                value={newEquipmentCategory}
                onChange={e => { setNewEquipmentCategory(e.target.value); setNewEquipmentItemId(''); }}
                className="px-2 py-1 border border-border rounded bg-secondary text-foreground text-sm"
              >
                <option value="">Select category...</option>
                {[...new Set(equipmentInventory.map(i => i.category).filter(Boolean))].sort().map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={newEquipmentItemId}
                onChange={e => setNewEquipmentItemId(e.target.value)}
                className="px-2 py-1 border border-border rounded bg-secondary text-foreground text-sm"
                disabled={!newEquipmentCategory}
              >
                <option value="">Select item...</option>
                {equipmentInventory
                  .filter(i => i.category === newEquipmentCategory)
                  .map(item => (
                    <option key={item.id} value={item.id}>{item.sku || item.name}</option>
                  ))}
              </select>
              <Button variant="outline" size="sm" onClick={addEquipmentRow} disabled={!newEquipmentItemId}>
                + Add Equipment
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Equipment Calculations Panel */}
         <Card className="w-96 shrink-0 self-start">
           <CardHeader className="pb-2">
             <CardTitle style={{ fontSize: '20.5px' }}>Equipment Calculations</CardTitle>
           </CardHeader>
           <CardContent className="p-0">
             <table className="w-full text-xs border-collapse">
               <thead>
                 <tr className="bg-secondary/60 border-b border-border" style={{ height: '36px' }}>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground border-r border-border">Reg Cost</th>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground border-r border-border">OT Cost</th>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground border-r border-border">Spec Cost</th>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground">Total</th>
                 </tr>
               </thead>
               <tbody>
                 <tr style={{ height: '34px' }}>
                   <td colSpan={4} className="px-0 py-0"></td>
                 </tr>
                 <tr style={{ height: '36px', backgroundColor: 'rgba(249, 115, 22, 0.2)' }}>
                   <td colSpan={4} className="px-4 py-2 text-center font-bold text-foreground leading-tight" style={{ fontSize: '18px' }}>
                     <div>Calculation</div>
                     <div>Engine</div>
                   </td>
                 </tr>
                 {equipmentRows.map((row, idx) => {
                   const rowTotal = Object.entries(equipmentGrid).reduce((sum, [key, value]) => {
                     return key.startsWith(`${row.id}_`) ? sum + (parseInt(value) || 0) : sum;
                   }, 0);
                   const costs = calculateRowCosts[row.id] || {};
                   return (
                     <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors" style={{ height: '40px' }}>
                         <td className="px-4 py-2 text-foreground font-semibold border-r border-border text-right">{costs.regCost != null && costs.regCost > 0 ? costs.regCost.toFixed(2) : '—'}</td>
                         <td className="px-4 py-2 text-foreground font-semibold border-r border-border text-right">{costs.otCost != null && costs.otCost > 0 ? costs.otCost.toFixed(2) : '—'}</td>
                         <td className="px-4 py-2 text-foreground font-semibold border-r border-border text-right">{costs.specialCost != null && costs.specialCost > 0 ? costs.specialCost.toFixed(2) : '—'}</td>
                         <td className="px-4 py-2 text-foreground font-semibold text-right">{(costs.regCost || 0) + (costs.otCost || 0) + (costs.specialCost || 0) > 0 ? ((costs.regCost || 0) + (costs.otCost || 0) + (costs.specialCost || 0)).toFixed(2) : '—'}</td>
                         </tr>
                         );
                         })}
                 <tr className="bg-secondary/40 border-t-2 border-border font-semibold" style={{ height: '36px' }}>
                   <td className="px-4 py-2 text-foreground border-r border-border text-right">
                     {equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.regCost || 0), 0).toFixed(2)}
                   </td>
                   <td className="px-4 py-2 text-foreground border-r border-border text-right">
                     {equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.otCost || 0), 0).toFixed(2)}
                   </td>
                   <td className="px-4 py-2 text-foreground border-r border-border text-right">
                     {equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.specialCost || 0), 0).toFixed(2)}
                   </td>
                   <td className="px-4 py-2 text-foreground text-right">
                     {(equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.regCost || 0), 0) + 
                       equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.otCost || 0), 0) + 
                       equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.specialCost || 0), 0)).toFixed(2)}
                   </td>
                 </tr>
               </tbody>
             </table>
           </CardContent>
         </Card>
        </div>
      )}
    </div>
  );
}
