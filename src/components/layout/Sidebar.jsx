import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FilePlus, FileText, X, FolderKanban, Settings, HelpCircle, LogOut, User, ChevronDown, Calendar, BarChart2, LayoutTemplate, Package, Users, TableProperties, GitBranch, Cpu, SlidersHorizontal, PanelLeftOpen, PieChart, GitCompare, TrendingUp, CalendarRange, ContactRound, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Cost Dashboard', path: '/project-cost-dashboard', icon: PieChart },
  { label: 'New Estimate', path: '/estimates/new', icon: FilePlus },
  { label: 'Create Estimate Panel', path: '/create-estimate-panel', icon: PanelLeftOpen },
  { label: 'All Estimates', path: '/estimates', icon: FileText },
  { label: 'Templates', path: '/project-templates', icon: LayoutTemplate },
  { label: 'Inventory', path: '/inventory', icon: Package },
];

const bottomSections = [
  [
    { label: 'Calendar', path: '/calendar', icon: Calendar },
    { label: 'Gantt Chart', path: '/gantt', icon: BarChart2 },
    { label: 'Detailed Gantt', path: '/detailed-project-gantt', icon: CalendarRange },
  ],
  [
    { label: 'Projects', path: '/projects', icon: FolderKanban },
    { label: 'Project Details Setup', path: '/project-details-setup', icon: TableProperties },
    { label: 'Project Report', path: '/project-report', icon: ClipboardList },
    { label: 'Line Item Comparison', path: '/line-item-comparison', icon: GitCompare },
    { label: 'Item Cost Comparison', path: '/item-cost-comparison', icon: TrendingUp },
    { label: 'Calculation Engine', path: '/calculation-engine', icon: Cpu },
  ],
  [
    { label: 'Manpower and Equipment Estimation', path: '/calculation-routing', icon: GitBranch },
    { label: 'Contacts & Leads', path: '/crm', icon: ContactRound },
    { label: 'Manpower Resources', path: '/resources', icon: Users },
  ],
  [
    { label: 'Control Page', path: '/control-page', icon: SlidersHorizontal },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Help', path: '/help', icon: HelpCircle },
  ],
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between px-6 h-16 border-b border-border">
          <Link to="/" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">InfoSignal</span>
          </Link>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
            const isHighlighted = item.label === 'Create Estimate Panel';
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isHighlighted
                      ? "bg-white/25 text-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom nav items — 4 divided sections */}
        <div className="px-3 py-2 border-t border-border">
          {bottomSections.map((section, sIdx) => (
            <div key={sIdx} className={cn("space-y-1 py-1", sIdx < bottomSections.length - 1 && "border-b border-border")}>
              {section.map(item => {
                const isActive = location.pathname.startsWith(item.path);
                const isProjects = item.label === 'Projects' || item.label === 'Project Details Setup';
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : isProjects
                          ? "bg-white/25 text-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* User profile / logout */}
        <div className="px-3 py-3 border-t border-border">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <span className="flex-1 text-left truncate">My Account</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", userMenuOpen && "rotate-180")} />
          </button>
          {userMenuOpen && (
            <div className="mt-1 ml-2 pl-3 border-l border-border space-y-1">
              <button
                onClick={() => base44.auth.logout()}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}