import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import EstimatesList from '@/pages/EstimatesList';
import CreateEstimate from '@/pages/CreateEstimate';
import EstimateDetail from '@/pages/EstimateDetail';
import Projects from '@/pages/Projects';
import ProjectPlanning from '@/pages/ProjectPlanning';
import ProjectBoard from '@/pages/ProjectBoard';
import CalendarPage from '@/pages/CalendarPage';
import GanttPage from '@/pages/GanttPage';
import Settings from '@/pages/Settings';
import { ThemeProvider } from '@/lib/ThemeContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/estimates" element={<EstimatesList />} />
        <Route path="/estimates/new" element={<CreateEstimate />} />
        <Route path="/estimates/:id" element={<EstimateDetail />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project-planning/:id" element={<ProjectPlanning />} />
        <Route path="/project-board" element={<ProjectBoard />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/gantt" element={<GanttPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ThemeProvider>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App