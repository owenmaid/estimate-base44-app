import React, { useState } from 'react';
import { GripVertical, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function SummarySection({ title, leftTitle, rightTitle, children }) {
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
          <span className="text-xs font-semibold text-foreground">
            {title}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-2 gap-2 px-3 py-2">
          {/* Left Subsection */}
          <div className="border-r border-border pr-2">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">{leftTitle}</h4>
            <div className="space-y-2">
              {children.left}
            </div>
          </div>
          {/* Right Subsection */}
          <div className="pl-2">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">{rightTitle}</h4>
            <div className="space-y-2">
              {children.right}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}