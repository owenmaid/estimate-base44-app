import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Building2, Briefcase, Calendar, Pencil, Trash2, FolderKanban, FileText, Link2, Unlink } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const STATUS_STYLES = {
  lead: 'bg-blue-500/20 text-blue-400',
  contacted: 'bg-amber-500/20 text-amber-400',
  qualified: 'bg-purple-500/20 text-purple-400',
  customer: 'bg-green-500/20 text-green-400',
  inactive: 'bg-muted text-muted-foreground',
};

export default function ContactDetail({
  open,
  onClose,
  contact,
  projects,
  estimates,
  onEdit,
  onDelete,
  onLinkProject,
  onUnlinkProject,
  onLinkEstimate,
  onUnlinkEstimate,
}) {
  const [linkProjectId, setLinkProjectId] = useState('');
  const [linkEstimateId, setLinkEstimateId] = useState('');

  if (!contact) return null;

  const linkedProjects = (contact.linked_project_ids || []).map(id => projects.find(p => p.id === id)).filter(Boolean);
  const linkedEstimates = (contact.linked_estimate_ids || []).map(id => estimates.find(e => e.id === id)).filter(Boolean);
  const availableProjects = projects.filter(p => !(contact.linked_project_ids || []).includes(p.id));
  const availableEstimates = estimates.filter(e => !(contact.linked_estimate_ids || []).includes(e.id));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between pr-8">
            <span className="truncate">{contact.name}</span>
            <Badge className={STATUS_STYLES[contact.status] || STATUS_STYLES.lead}>{contact.status}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {/* Contact info */}
          <div className="space-y-2 text-sm">
            {contact.company && (
              <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4 shrink-0" />{contact.company}</div>
            )}
            {contact.position && (
              <div className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-4 w-4 shrink-0" />{contact.position}</div>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-primary hover:underline"><Mail className="h-4 w-4 shrink-0" />{contact.email}</a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-primary hover:underline"><Phone className="h-4 w-4 shrink-0" />{contact.phone}</a>
            )}
            {contact.last_contact_date && (
              <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4 shrink-0" />Last contact: {format(parseISO(contact.last_contact_date), 'MMM d, yyyy')}</div>
            )}
            {contact.source && (
              <div className="text-muted-foreground">Source: {contact.source}</div>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map(t => (
                <span key={t} className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">{t}</span>
              ))}
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</h4>
              <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          {/* Linked Projects */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <FolderKanban className="h-3.5 w-3.5" />Linked Projects
            </h4>
            <div className="space-y-1.5">
              {linkedProjects.length === 0 && <p className="text-xs text-muted-foreground">No projects linked.</p>}
              {linkedProjects.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded border border-border bg-card px-3 py-1.5 text-sm">
                  <span className="truncate">{p.name}</span>
                  <button onClick={() => onUnlinkProject(contact, p.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-2">
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {availableProjects.length > 0 && (
              <div className="flex gap-2 mt-2">
                <select
                  value={linkProjectId}
                  onChange={e => setLinkProjectId(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-border rounded bg-white/25 text-foreground text-sm"
                >
                  <option value="">Select project...</option>
                  {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={!linkProjectId} onClick={() => { onLinkProject(contact, linkProjectId); setLinkProjectId(''); }}>
                  <Link2 className="h-3.5 w-3.5" />Link
                </Button>
              </div>
            )}
          </div>

          {/* Linked Estimates */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />Linked Estimates
            </h4>
            <div className="space-y-1.5">
              {linkedEstimates.length === 0 && <p className="text-xs text-muted-foreground">No estimates linked.</p>}
              {linkedEstimates.map(e => (
                <div key={e.id} className="flex items-center justify-between rounded border border-border bg-card px-3 py-1.5 text-sm">
                  <span className="truncate">{e.estimate_number || e.project_name || 'Estimate'}</span>
                  <button onClick={() => onUnlinkEstimate(contact, e.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-2">
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {availableEstimates.length > 0 && (
              <div className="flex gap-2 mt-2">
                <select
                  value={linkEstimateId}
                  onChange={e => setLinkEstimateId(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-border rounded bg-white/25 text-foreground text-sm"
                >
                  <option value="">Select estimate...</option>
                  {availableEstimates.map(e => <option key={e.id} value={e.id}>{e.estimate_number || e.project_name || 'Estimate'}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={!linkEstimateId} onClick={() => { onLinkEstimate(contact, linkEstimateId); setLinkEstimateId(''); }}>
                  <Link2 className="h-3.5 w-3.5" />Link
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(contact)}><Pencil className="h-4 w-4" />Edit</Button>
            <Button variant="destructive" className="flex-1" onClick={() => onDelete(contact)}><Trash2 className="h-4 w-4" />Delete</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}