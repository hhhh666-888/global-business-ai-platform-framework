import { api } from './gbapClient';

export type IdentityRoleTier = 'employee' | 'manager' | 'super-admin';

export type IdentityAdminUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
  roles: string[];
  roleTier: IdentityRoleTier;
};

export type IdentityPasswordInput = {
  password?: string;
  requirePasswordChange?: boolean;
};

export type IdentityCredentialResult = {
  user: IdentityAdminUser;
  generatedPassword?: string;
  passwordGenerated: boolean;
  requirePasswordChange: boolean;
};

export async function listIdentityUsers() {
  return (await api<{ users: IdentityAdminUser[] }>('/api/identity/users')).users;
}

export async function createIdentityUser(input: {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roleTier: IdentityRoleTier;
  password?: string;
  requirePasswordChange?: boolean;
}) {
  return api<IdentityCredentialResult>('/api/identity/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateIdentityUser(userId: string, changes: Partial<Pick<IdentityAdminUser, 'email' | 'firstName' | 'lastName' | 'enabled' | 'roleTier'>>) {
  return (await api<{ user: IdentityAdminUser }>(`/api/identity/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })).user;
}

export async function resetIdentityUserPassword(userId: string, input: IdentityPasswordInput = {}) {
  return api<IdentityCredentialResult>(`/api/identity/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteIdentityUser(userId: string) {
  return api<{ removed: string }>(`/api/identity/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
