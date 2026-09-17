import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import CRM from '@/pages/CRM';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ThemeProvider } from '@/lib/ThemeContext';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const EstimatesList = lazy(() => import('@/pages/EstimatesList'));
const CreateEstimate = lazy(() => import('@/pages/CreateEstimate'));
const EstimateDetail = lazy(() => import('@/pages/EstimateDetail'));
const Projects = lazy(() => import('@/pages/Projects'));
const ProjectPlanning = lazy(() => import('@/pages/ProjectPlanning'));
const ProjectList = lazy(() => import('@/pages/ProjectList'));
const ProjectBoard = lazy(() => import('@/pages/ProjectBoard'));
const ProjectTemplates = lazy(() => import('@/pages/ProjectTemplates'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const GanttPage = lazy(() => import('@/pages/GanttPage'));
const Settings = lazy(() => import('@/pages/Settings'));
const ResourceAllocation = lazy(() => import('@/pages/ResourceAllocation'));
const ProjectDetailsSetup = lazy(() => import('@/pages/ProjectDetailsSetup'));
const CalculationRouting = lazy(() => import('@/pages/CalculationRouting'));
const CalculationEngine = lazy(() => import('@/pages/CalculationEngine'));
const ControlPage = lazy(() => import('@/pages/ControlPage'));
const CreateEstimatePanel = lazy(() => import('@/pages/CreateEstimatePanel'));
const ProjectCostDashboard = lazy(() => import('@/pages/ProjectCostDashboard'));
const LineItemComparison = lazy(() => import('@/pages/LineItemComparison'));
const ItemCostComparison = lazy(() => import('@/pages/ItemCostComparison'));
const DetailedProjectGantt = lazy(() => import('@/pages/DetailedProjectGantt'));
const ProjectReport = lazy(() => import('@/pages/ProjectReport'));
const PageNotFound = lazy(() => import('./lib/PageNotFound'));

const RouteLoadingFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading page">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
  </div>
);

const LoginRedirect = () => {
  const { navigateToLogin } = useAuth();

  useEffect(() => {
    navigateToLogin();
  }, [navigateToLogin]);

  return <RouteLoadingFallback />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

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
      return <LoginRedirect />;
    }
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route element={<ProtectedRoute unauthenticatedElement={<LoginRedirect />} />}>
        <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/estimates" element={<EstimatesList />} />
        <Route path="/estimates/new" element={<CreateEstimate />} />
        <Route path="/estimates/:id" element={<EstimateDetail />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project-planning" element={<ProjectPlanning />} />
        <Route path="/project-list" element={<ProjectList />} />
        <Route path="/project-board" element={<ProjectBoard />} />
        <Route path="/project-templates" element={<ProjectTemplates />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/gantt" element={<GanttPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/resources" element={<ResourceAllocation />} />
        <Route path="/project-details-setup" element={<ProjectDetailsSetup />} />
        <Route path="/calculation-routing" element={<CalculationRouting />} />
        <Route path="/calculation-engine" element={<CalculationEngine />} />
        <Route path="/control-page" element={<ControlPage />} />
        <Route path="/create-estimate-panel" element={<CreateEstimatePanel />} />
        <Route path="/project-cost-dashboard" element={<ProjectCostDashboard />} />
        <Route path="/line-item-comparison" element={<LineItemComparison />} />
        <Route path="/item-cost-comparison" element={<ItemCostComparison />} />
        <Route path="/detailed-project-gantt" element={<DetailedProjectGantt />} />
        <Route path="/project-report" element={<ProjectReport />} />
        <Route path="/crm" element={<CRM />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
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