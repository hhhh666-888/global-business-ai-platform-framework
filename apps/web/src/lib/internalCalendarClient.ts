import { api } from './gbapClient';

export type InternalCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  fullDay: boolean;
  timeZone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InternalCalendarEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  fullDay?: boolean;
  timeZone?: string | null;
};

export async function listInternalCalendarEvents() {
  return (await api<{ events: InternalCalendarEvent[] }>('/api/calendar-events')).events;
}

export async function createInternalCalendarEvent(input: InternalCalendarEventInput) {
  return (await api<{ event: InternalCalendarEvent }>('/api/calendar-events', {
    method: 'POST',
    body: JSON.stringify(input),
  })).event;
}

export async function updateInternalCalendarEvent(id: string, input: Partial<InternalCalendarEventInput>) {
  return (await api<{ event: InternalCalendarEvent }>(`/api/calendar-events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })).event;
}

export async function deleteInternalCalendarEvent(id: string) {
  return api<{ removed: string }>(`/api/calendar-events/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
