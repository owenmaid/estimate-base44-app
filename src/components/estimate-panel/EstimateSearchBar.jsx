import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search } from 'lucide-react';

export default function EstimateSearchBar({ onLoad }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list('-created_date'),
  });

  const filtered = query.trim()
    ? estimates.filter(e =>
        (e.client_name || '').toLowerCase().includes(query.toLowerCase()) ||
        (e.project_name || '').toLowerCase().includes(query.toLowerCase()) ||
        (e.estimate_number || '').toLowerCase().includes(query.toLowerCase())
      )
    : estimates.slice(0, 10);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 border border-border rounded bg-secondary px-2 py-1">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="bg-transparent text-xs text-foreground outline-none w-44 placeholder:text-muted-foreground"
          placeholder="Search estimates to edit…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full mt-1 right-0 w-72 bg-card border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {filtered.map(e => (
            <button
              key={e.id}
              onClick={() => { onLoad(e); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors border-b border-border last:border-b-0"
            >
              <div className="text-xs font-medium text-foreground">{e.project_name || '(No project name)'}</div>
              <div className="text-xs text-muted-foreground">{e.client_name} · {e.estimate_number} · <span className="capitalize">{e.status}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}