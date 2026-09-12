import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'customer', label: 'Customer' },
  { value: 'inactive', label: 'Inactive' },
];

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  company: '',
  position: '',
  status: 'lead',
  source: '',
  notes: '',
  tags: [],
  last_contact_date: '',
};

export default function ContactModal({ open, onClose, onSave, contact }) {
  const [form, setForm] = useState(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contact) {
      setForm({
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        position: contact.position || '',
        status: contact.status || 'lead',
        source: contact.source || '',
        notes: contact.notes || '',
        tags: contact.tags || [],
        last_contact_date: contact.last_contact_date || '',
      });
    } else {
      setForm(EMPTY);
    }
    setTagInput('');
  }, [contact, open]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      update('tags', [...form.tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (t) => update('tags', form.tags.filter(x => x !== t));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit Contact' : 'New Contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name} onChange={e => update('name', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" value={form.company} onChange={e => update('company', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={e => update('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={e => update('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">Position</Label>
              <Input id="position" value={form.position} onChange={e => update('position', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Input id="source" value={form.source} onChange={e => update('source', e.target.value)} placeholder="Referral, website..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={v => update('status', v)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_contact">Last Contact</Label>
              <Input id="last_contact" type="date" value={form.last_contact_date} onChange={e => update('last_contact_date', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Type a tag and press Enter"
              />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="text-primary/60 hover:text-primary">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}