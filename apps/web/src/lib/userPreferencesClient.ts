import { api } from './gbapClient';

export type UserPreference<T> = {
  key: string;
  value: T;
  updatedAt: string;
};

export async function getUserPreference<T>(key: string): Promise<UserPreference<T> | null> {
  const result = await api<{ preference: UserPreference<T> | null }>(`/api/user-preferences/${encodeURIComponent(key)}`);
  return result.preference;
}

export async function setUserPreference<T>(key: string, value: T): Promise<UserPreference<T>> {
  const result = await api<{ preference: UserPreference<T> }>(`/api/user-preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  return result.preference;
}

export async function deleteUserPreference(key: string): Promise<boolean> {
  const result = await api<{ removed: boolean }>(`/api/user-preferences/${encodeURIComponent(key)}`, { method: 'DELETE' });
  return result.removed;
}
