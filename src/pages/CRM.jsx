import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Search, Mail, Phone, FolderKanban, FileText, Users, TrendingUp, CheckCircle2 } from 'lucide-react';
import ContactModal from '@/components/crm/ContactModal';
import ContactDetail from '@/components/crm/ContactDetail';

const STATUS_STYLES = {
  lead: 'bg-blue-500/20 text-blue-400',
  contacted: 'bg-amber-500/20 text-amber-400',
  qualified: 'bg-purple-500/20 text-purple-400',
  customer: 'bg-green-500/20 text-green-400',
  inactive: 'bg-muted text-muted-foreground',
};

export default function CRM() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailContact, setDetailContact] = useState(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date'),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list(),
  });

  // Real-time refresh
  React.useEffect(() => {
    const unsub = base44.entities.Contact.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [queryClient]);

  const stats = useMemo(() => {
    const total = contacts.length;
    const leads = contacts.filter(c => c.status === 'lead').length;
    const qualified = contacts.filter(c => c.status === 'qualified').length;
    const customers = contacts.filter(c => c.status === 'customer').length;
    return { total, leads, qualified, customers };
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.name, c.company, c.email, c.phone, c.position, c.source]
        .filter(Boolean).some(v => v.toLowerCase().includes(q));
    });
  }, [contacts, search, statusFilter]);

  const handleSave = async (form) => {
    if (editing) {
      await base44.entities.Contact.update(editing.id, form);
    } else {
      await base44.entities.Contact.create(form);
    }
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const handleDelete = async (contact) => {
    if (!confirm(`Delete ${contact.name}?`)) return;
    await base44.entities.Contact.delete(contact.id);
    setDetailContact(null);
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const linkProject = async (contact, projectId) => {
    const ids = [...(contact.linked_project_ids || []), projectId];
    await base44.entities.Contact.update(contact.id, { linked_project_ids: ids });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setDetailContact(prev => prev ? { ...prev, linked_project_ids: ids } : prev);
  };

  const unlinkProject = async (contact, projectId) => {
    const ids = (contact.linked_project_ids || []).filter(id => id !== projectId);
    await base44.entities.Contact.update(contact.id, { linked_project_ids: ids });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setDetailContact(prev => prev ? { ...prev, linked_project_ids: ids } : prev);
  };

  const linkEstimate = async (contact, estimateId) => {
    const ids = [...(contact.linked_estimate_ids || []), estimateId];
    await base44.entities.Contact.update(contact.id, { linked_estimate_ids: ids });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setDetailContact(prev => prev ? { ...prev, linked_estimate_ids: ids } : prev);
  };

  const unlinkEstimate = async (contact, estimateId) => {
    const ids = (contact.linked_estimate_ids || []).filter(id => id !== estimateId);
    await base44.entities.Contact.update(contact.id, { linked_estimate_ids: ids });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setDetailContact(prev => prev ? { ...prev, linked_estimate_ids: ids } : prev);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts & Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage relationships linked to your projects and estimates</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <UserPlus className="h-4 w-4" />New Contact
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Contacts" value={stats.total} color="text-primary" />
        <StatCard icon={TrendingUp} label="Leads" value={stats.leads} color="text-blue-400" />
        <StatCard icon={CheckCircle2} label="Qualified" value={stats.qualified} color="text-purple-400" />
        <StatCard icon={CheckCircle2} label="Customers" value={stats.customers} color="text-green-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, email..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 text-center text-muted-foreground text-sm">Loading contacts...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <Users className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground text-sm">{contacts.length === 0 ? 'No contacts yet. Create your first one!' : 'No contacts match your filters.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Company</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Contact</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell text-center">Projects</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell text-center">Estimates</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => setDetailContact(c)}
                      className="border-b border-border/50 hover:bg-white/25 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name}</div>
                        {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{c.company || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {c.email && <span className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" />{c.email}</span>}
                          {c.phone && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{c.phone}</span>}
                          {!c.email && !c.phone && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_STYLES[c.status] || STATUS_STYLES.lead}>{c.status}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-center">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <FolderKanban className="h-3.5 w-3.5" />
                          {(c.linked_project_ids || []).length}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-center">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          {(c.linked_estimate_ids || []).length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContactModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        contact={editing}
      />
      <ContactDetail
        open={!!detailContact}
        onClose={() => setDetailContact(null)}
        contact={detailContact}
        projects={projects}
        estimates={estimates}
        onEdit={(c) => { setDetailContact(null); setEditing(c); setModalOpen(true); }}
        onDelete={handleDelete}
        onLinkProject={linkProject}
        onUnlinkProject={unlinkProject}
        onLinkEstimate={linkEstimate}
        onUnlinkEstimate={unlinkEstimate}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}