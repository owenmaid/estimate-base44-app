import React, { useState } from 'react';
import { GripVertical, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function SummarySection({ title, onRename, leftTitle, rightTitle, children }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(title);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-3">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/60">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="cursor-default text-muted-foreground shrink-0">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <button onClick={() => setCollapsed(v => !v)} className="text-muted-foreground hover:text-foreground">
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          {editingTitle ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                autoFocus
                className="flex-1 text-xs bg-secondary border border-primary rounded px-2 py-0.5 text-foreground outline-none"
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onBlur={() => { onRename(titleVal); setEditingTitle(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onRename(titleVal); setEditingTitle(false); }
                  if (e.key === 'Escape') { setEditingTitle(false); }
                }}
              />
            </div>
          ) : (
            <span
              className="text-xs font-semibold text-foreground truncate cursor-text hover:text-primary transition-colors"
              onClick={() => { setTitleVal(title); setEditingTitle(true); }}
              title="Click to rename section"
            >
              {title}
            </span>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 py-2">
          {/* Titles row above the spanning line */}
          <div className="grid grid-cols-2 gap-2 mb-0">
            <div className="pr-2">
              <h4 className="text-xs font-semibold text-foreground">{leftTitle}</h4>
            </div>
            <div className="pl-2">
              <h4 className="text-xs font-semibold text-foreground">{rightTitle}</h4>
            </div>
          </div>
          {/* Spanning divider line */}
          <div className="border-t border-border my-2"></div>
          {/* Content row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border-r border-border pr-2 h-[160px]">
              <div className="space-y-2">
                {children.left}
              </div>
            </div>
            <div className="pl-2 h-[160px]">
              <div className="space-y-2">
                {children.right}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}