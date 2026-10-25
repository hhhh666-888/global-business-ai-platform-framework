import { api, type CrmFile } from './gbapClient';

export async function listDeletedCrmFiles() {
  return (await api<{ files: CrmFile[] }>('/api/crm-native/files/recycle')).files;
}

export async function restoreCrmFile(id: string) {
  return (await api<{ file: CrmFile }>(`/api/crm-native/files/${encodeURIComponent(id)}/restore`, { method: 'POST' })).file;
}

export async function destroyCrmFile(id: string) {
  return api<{ destroyed: string }>(`/api/crm-native/files/${encodeURIComponent(id)}/destroy`, { method: 'POST' });
}
