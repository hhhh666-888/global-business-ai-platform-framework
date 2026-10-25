import { useCallback, useEffect, useState } from 'react';
import {
  beginLogin,
  consumeReturnPage,
  exchangeOidcCodeIfPresent,
  getIdentity,
  hasStoredSession,
  logout,
  type GbapIdentity,
} from '../lib/gbapClient';
import {
  beginSilentOidcRecovery,
  canAttemptSilentOidcRecovery,
  completeSilentOidcRecovery,
  consumeSilentOidcFailureIfPresent,
  markExplicitLogout,
} from '../lib/silentOidcRecovery';

export type GbapSession = {
  status: 'initializing' | 'anonymous' | 'authenticated' | 'error';
  identity: GbapIdentity | null;
  error: string | null;
  returnPage: string | null;
  login: (returnPage?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

export function useGbapSession(): GbapSession {
  const [status, setStatus] = useState<GbapSession['status']>('initializing');
  const [identity, setIdentity] = useState<GbapIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnPage, setReturnPage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasStoredSession()) {
      setIdentity(null);
      setStatus('anonymous');
      return;
    }
    try {
      const me = await getIdentity();
      setIdentity(me);
      setError(null);
      setStatus('authenticated');
    } catch (cause) {
      setIdentity(null);
      setError(cause instanceof Error ? cause.message : 'session_refresh_failed');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const silentFailed = consumeSilentOidcFailureIfPresent();
        if (silentFailed) {
          if (cancelled) return;
          setIdentity(null);
          setError(null);
          setStatus('anonymous');
          return;
        }

        const exchanged = await exchangeOidcCodeIfPresent();
        if (cancelled) return;
        if (exchanged) {
          completeSilentOidcRecovery();
          setReturnPage(consumeReturnPage());
        }

        if (!hasStoredSession() && canAttemptSilentOidcRecovery()) {
          beginSilentOidcRecovery('companies');
          return;
        }
        await refresh();
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'session_initialization_failed');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const endSession = useCallback(() => {
    markExplicitLogout();
    logout();
  }, []);

  return {
    status,
    identity,
    error,
    returnPage,
    login: beginLogin,
    logout: endSession,
    refresh,
  };
}
