import React, {
  createContext, useState, useContext, useEffect, useCallback, useMemo, useRef
} from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext(null);

const KNOWN_AUTH_REASONS = Object.freeze([
  'auth_required',
  'user_not_registered',
  'app_disabled',
  'app_not_found',
]);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // Guards against stale writes from a superseded check.
  const runIdRef = useRef(0);

  const checkUserAuth = useCallback(async (runId) => {
    const isCurrent = () => runId === undefined || runId === runIdRef.current;
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      if (!isCurrent()) return;
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null); // clear stale errors on success
    } catch (error) {
      if (!isCurrent()) return;
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);

      if (error?.status === 401 || error?.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        // Fail closed, but distinguishably: retryable, not a logout.
        setAuthError({
          type: 'unknown',
          message: error?.message || 'Unable to verify your session',
        });
      }
    } finally {
      if (isCurrent()) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  }, []);

  const checkAppState = useCallback(async () => {
    const runId = ++runIdRef.current;
    const isCurrent = () => runId === runIdRef.current;

    setIsLoadingPublicSettings(true);
    setAuthError(null);

    try {
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: { 'X-App-Id': appParams.appId },
        token: appParams.token,
        interceptResponses: true,
      });

      const publicSettings = await appClient.get(
        `/prod/public-settings/by-id/${appParams.appId}`
      );
      if (!isCurrent()) return;
      setAppPublicSettings(publicSettings);
      setIsLoadingPublicSettings(false);

      if (appParams.token) {
        await checkUserAuth(runId);
      } else if (isCurrent()) {
        setIsAuthenticated(false);
        setUser(null);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    } catch (appError) {
      if (!isCurrent()) return;
      console.error('App state check failed:', appError);

      const reason = appError?.status === 403
        ? appError?.data?.extra_data?.reason
        : undefined;

      if (reason && KNOWN_AUTH_REASONS.includes(reason)) {
        setAuthError({
          type: reason,
          message: reason === 'user_not_registered'
            ? 'User not registered for this app'
            : 'Authentication required',
        });
      } else {
        setAuthError({
          type: 'unknown',
          message: appError?.message || 'Failed to load app',
        });
      }

      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  const logout = useCallback((shouldRedirect = true) => {
    runIdRef.current++; // invalidate in-flight checks
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setAuthChecked(true);

    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    base44.auth.redirectToLogin(window.location.href);
  }, []);

  // Single source of truth for role checks.
  const role = useMemo(
    () => (typeof user?.role === 'string' ? user.role.trim().toLowerCase() : null),
    [user]
  );

  const hasRole = useCallback(
    (allowed) => {
      if (!isAuthenticated || !role) return false;
      const list = Array.isArray(allowed) ? allowed : [allowed];
      return list.some((r) => String(r).trim().toLowerCase() === role);
    },
    [isAuthenticated, role]
  );

  const value = useMemo(
    () => ({
      user,
      role,
      hasRole,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }),
    [
      user, role, hasRole, isAuthenticated, isLoadingAuth,
      isLoadingPublicSettings, authError, appPublicSettings,
      authChecked, logout, navigateToLogin, checkUserAuth, checkAppState,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
