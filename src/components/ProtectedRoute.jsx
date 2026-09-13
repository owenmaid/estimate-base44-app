import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({
  fallback = <DefaultFallback />,
  unauthenticatedElement = <Navigate to="/login" replace />,
  unauthorizedElement = <Navigate to="/" replace />,
  roles = null, // e.g. ['admin'] — null means "any authenticated user"
}) {
  const {
    isAuthenticated,
    isLoadingAuth,
    authChecked,
    authError,
    checkUserAuth,
    user,
  } = useAuth();

  const dispatched = useRef(false);

  useEffect(() => {
    if (!authChecked && !isLoadingAuth && !dispatched.current) {
      dispatched.current = false;
      authChecked();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  if (roles) {
    const userRole = user?.role;
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!userRole || !allowed.includes(userRole)) {
      return unauthorizedElement;
    }
  }

  return <Outlet />;
}
