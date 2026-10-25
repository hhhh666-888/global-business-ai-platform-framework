import { createContext, useContext, useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

export type AppearanceMode = 'light' | 'dark' | 'black' | 'system';
export type ResolvedAppearance = 'light' | 'dark';

type AppearanceContextValue = {
  mode: AppearanceMode;
  resolved: ResolvedAppearance;
  setMode: (mode: AppearanceMode) => void;
  choiceVersion: React.RefObject<number>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function systemAppearance(): ResolvedAppearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function appearanceStorageKey(subject?: string | null) {
  return `gbap.appearance.${subject?.trim() || 'device'}`;
}

function validMode(value: string | null): value is AppearanceMode {
  return value === 'light' || value === 'dark' || value === 'black' || value === 'system';
}

function initialDevicePreference(): AppearanceMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(appearanceStorageKey());
    return validMode(saved) ? saved : 'light';
  } catch { return 'light'; }
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  // Light is the product default. A dark/system mode can only appear here when an
  // explicit device preference already exists; App later applies the signed-in
  // user's own preference or Light when that user has never chosen one.
  const [mode, updateMode] = useState<AppearanceMode>(() => initialDevicePreference());
  const [systemMode, setSystemMode] = useState<ResolvedAppearance>(() => systemAppearance());
  const choiceVersion = useRef(0);
  const setMode = useCallback((next: AppearanceMode) => { choiceVersion.current += 1; updateMode(next); }, []);
  const resolved: ResolvedAppearance = mode === 'system' ? systemMode : mode === 'black' ? 'dark' : mode;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemMode(event.matches ? 'dark' : 'light');
    setSystemMode(media.matches ? 'dark' : 'light');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.appearance = mode;
    root.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'black' ? '#080809' : resolved === 'dark' ? '#09111f' : '#f4f6f9');
  }, [mode, resolved]);

  const value = useMemo(() => ({ mode, resolved, setMode, choiceVersion }), [mode, resolved, setMode]);

  return <AppearanceContext.Provider value={value}><ThemeProvider colorScheme={resolved}>{children}</ThemeProvider></AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
