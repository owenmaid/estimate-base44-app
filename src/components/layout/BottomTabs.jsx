import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PieChart, FileText, FolderKanban, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Costs', path: '/project-cost-dashboard', icon: PieChart },
  { label: 'Estimates', path: '/estimates', icon: FileText },
  { label: 'Projects', path: '/projects', icon: FolderKanban },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function BottomTabs() {
  const location = useLocation();
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch justify-around px-1"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(tab => {
        const isActive = tab.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-2 py-2 flex-1 min-h-[56px] text-[11px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <tab.icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}