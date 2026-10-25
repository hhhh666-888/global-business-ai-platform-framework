import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

export const GBAP_QUERY_STALE_MS = 30_000;
export const GBAP_QUERY_GC_MS = 30 * 60_000;

type QueryKey = readonly unknown[];
type QueryUpdater<T> = T | ((current: T | undefined) => T | undefined);
type QueryEntry<T> = {
  data: T | undefined;
  error: unknown;
  updatedAt: number;
  isFetching: boolean;
  promise: Promise<T> | null;
  version: number;
  listeners: Set<() => void>;
  gcTimer: ReturnType<typeof setTimeout> | null;
};

type UseGbapQueryOptions<T> = {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
};

type PrefetchGbapQueryOptions<T> = {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number;
  gcTime?: number;
};

const queryCache = new Map<string, QueryEntry<unknown>>();

function cacheKey(queryKey: QueryKey) {
  return JSON.stringify(queryKey);
}

function getEntry<T>(key: string): QueryEntry<T> {
  let entry = queryCache.get(key) as QueryEntry<T> | undefined;
  if (!entry) {
    entry = {
      data: undefined,
      error: null,
      updatedAt: 0,
      isFetching: false,
      promise: null,
      version: 0,
      listeners: new Set(),
      gcTimer: null,
    };
    queryCache.set(key, entry as QueryEntry<unknown>);
  }
  return entry;
}

function notify(entry: QueryEntry<unknown>) {
  entry.version += 1;
  entry.listeners.forEach((listener) => listener());
}

async function fetchEntry<T>(entry: QueryEntry<T>, queryFn: () => Promise<T>) {
  if (entry.promise) return entry.promise;
  entry.isFetching = true;
  entry.error = null;
  notify(entry as QueryEntry<unknown>);

  const promise = Promise.resolve()
    .then(queryFn)
    .then((data) => {
      entry.data = data;
      entry.error = null;
      entry.updatedAt = Date.now();
      return data;
    })
    .catch((error) => {
      entry.error = error;
      throw error;
    })
    .finally(() => {
      entry.promise = null;
      entry.isFetching = false;
      notify(entry as QueryEntry<unknown>);
    });

  entry.promise = promise;
  return promise;
}

function scheduleGc(key: string, entry: QueryEntry<unknown>, gcTime: number) {
  if (entry.gcTimer) clearTimeout(entry.gcTimer);
  entry.gcTimer = setTimeout(() => {
    entry.gcTimer = null;
    if (entry.listeners.size === 0 && !entry.isFetching) queryCache.delete(key);
  }, gcTime);
}

export function actorQueryKey(actorSubject: string | null | undefined, ...parts: readonly unknown[]) {
  return ['gbap', actorSubject ?? 'anonymous', ...parts] as const;
}

export async function prefetchGbapQuery<T>({
  queryKey,
  queryFn,
  staleTime = GBAP_QUERY_STALE_MS,
  gcTime = GBAP_QUERY_GC_MS,
}: PrefetchGbapQueryOptions<T>) {
  const serializedKey = cacheKey(queryKey);
  const entry = getEntry<T>(serializedKey);
  const fresh = entry.data !== undefined && Date.now() - entry.updatedAt < staleTime;
  if (fresh) return entry.data;
  try {
    return await fetchEntry(entry, queryFn);
  } finally {
    if (entry.listeners.size === 0) scheduleGc(serializedKey, entry as QueryEntry<unknown>, gcTime);
  }
}

export function invalidateGbapQuery(queryKey: QueryKey) {
  const entry = queryCache.get(cacheKey(queryKey));
  if (!entry) return;
  entry.updatedAt = 0;
  notify(entry);
}

export function useGbapQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = GBAP_QUERY_STALE_MS,
  gcTime = GBAP_QUERY_GC_MS,
}: UseGbapQueryOptions<T>) {
  const serializedKey = useMemo(() => cacheKey(queryKey), [queryKey]);
  const entry = useMemo(() => getEntry<T>(serializedKey), [serializedKey]);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useSyncExternalStore(
    useCallback((listener) => {
      if (entry.gcTimer) {
        clearTimeout(entry.gcTimer);
        entry.gcTimer = null;
      }
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0) scheduleGc(serializedKey, entry as QueryEntry<unknown>, gcTime);
      };
    }, [entry, gcTime, serializedKey]),
    useCallback(() => entry.version, [entry]),
    useCallback(() => entry.version, [entry]),
  );

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      await fetchEntry(entry, () => queryFnRef.current());
    } catch {
      // Error state is retained in the cache and surfaced to the consumer.
    }
  }, [enabled, entry]);

  useEffect(() => {
    if (!enabled) return;
    const stale = entry.data === undefined || Date.now() - entry.updatedAt >= staleTime;
    if (stale) void refetch();
  }, [enabled, entry, refetch, staleTime]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - entry.updatedAt >= staleTime) void refetch();
    };
    const onOnline = () => {
      if (Date.now() - entry.updatedAt >= staleTime) void refetch();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, entry, refetch, staleTime]);

  const setData = useCallback((updater: QueryUpdater<T>) => {
    const next = typeof updater === 'function'
      ? (updater as (current: T | undefined) => T | undefined)(entry.data)
      : updater;
    entry.data = next;
    entry.error = null;
    entry.updatedAt = Date.now();
    notify(entry as QueryEntry<unknown>);
  }, [entry]);

  return {
    data: entry.data,
    error: entry.error,
    isPending: enabled && entry.data === undefined,
    isFetching: entry.isFetching,
    updatedAt: entry.updatedAt,
    refetch,
    setData,
  };
}
