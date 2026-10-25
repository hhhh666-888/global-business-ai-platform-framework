import { useCallback, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconCalendar, IconRefresh } from 'twenty-ui/icon';
import {
  createInternalCalendarEvent,
  deleteInternalCalendarEvent,
  listInternalCalendarEvents,
  updateInternalCalendarEvent,
  type InternalCalendarEvent,
} from '../lib/internalCalendarClient';
import { actorQueryKey, useGbapQuery } from '../lib/queryCache';
import type { GbapSession } from '../hooks/useGbapSession';
import { BusinessRecordModal } from './BusinessRecordModal';
import './crm-advanced-surfaces.css';
import './crm-object-surfaces.css';
import './calendar.css';

type Props = { session: GbapSession; search: string; onOpenAdminSettings?: () => void };
type CalendarView = 'month' | 'week' | 'day' | 'agenda';
type EventDraft = {
  mode: 'create' | 'edit';
  eventId: string | null;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  isFullDay: boolean;
  timeZone: string;
};

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function isoToLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localDateTimeValue(date);
}
function defaultEventDraft(date = new Date()): EventDraft {
  const start = new Date(date);
  if (date.getTime() <= Date.now() + 5 * 60 * 1000) start.setTime(Date.now() + 60 * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    mode: 'create',
    eventId: null,
    title: '',
    description: '',
    location: '',
    startsAt: localDateTimeValue(start),
    endsAt: localDateTimeValue(end),
    isFullDay: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}
function editEventDraft(event: InternalCalendarEvent): EventDraft {
  return {
    mode: 'edit',
    eventId: event.id,
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    startsAt: isoToLocalInput(event.startsAt),
    endsAt: isoToLocalInput(event.endsAt),
    isFullDay: event.fullDay,
    timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}
function startOfDay(date: Date) { const next = new Date(date); next.setHours(0, 0, 0, 0); return next; }
function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function dateKey(value: Date | string | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function weekStart(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  return addDays(next, day === 0 ? -6 : 1 - day);
}
function monthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
function sameMonth(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function eventTime(event: InternalCalendarEvent) {
  if (event.fullDay) return '全天';
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const fmt = (value: Date) => value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(start)}–${fmt(end)}`;
}
function cursorTitle(date: Date, view: CalendarView) {
  if (view === 'month') return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  if (view === 'day') return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  if (view === 'week') {
    const start = weekStart(date); const end = addDays(start, 6);
    return `${start.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`;
  }
  return '近期日程';
}

export function CalendarSurface({ session, search }: Props) {
  const actorKey = session.status === 'authenticated' ? (session.identity?.subject ?? 'authenticated') : session.status;
  const calendarQuery = useGbapQuery<InternalCalendarEvent[]>({
    queryKey: actorQueryKey(actorKey, 'calendar', 'personal'),
    enabled: session.status === 'authenticated',
    queryFn: listInternalCalendarEvents,
  });
  const records = calendarQuery.data ?? [];
  const loading = calendarQuery.isPending && !calendarQuery.data;
  const refreshing = calendarQuery.isFetching && Boolean(calendarQuery.data);
  const loadError = calendarQuery.error ? '日历加载失败，请刷新后重试。' : null;
  const setRecords = useCallback((updater: React.SetStateAction<InternalCalendarEvent[]>) => {
    calendarQuery.setData((current) => {
      const list = current ?? [];
      return typeof updater === 'function' ? updater(list) : updater;
    });
  }, [calendarQuery.setData]);

  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((item) => `${item.title} ${item.description ?? ''} ${item.location ?? ''}`.toLowerCase().includes(q));
  }, [records, search]);
  const selectedEvent = useMemo(() => filtered.find((event) => event.id === selectedEventId) ?? null, [filtered, selectedEventId]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, InternalCalendarEvent[]>();
    for (const event of filtered) {
      const key = dateKey(event.startsAt);
      if (!key) continue;
      const items = map.get(key) ?? [];
      items.push(event);
      map.set(key, items);
    }
    for (const items of map.values()) items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return map;
  }, [filtered]);

  const openCreate = (date?: Date) => {
    setError(null);
    setSuccess(null);
    setEventDraft(defaultEventDraft(date));
  };
  const openEdit = (event: InternalCalendarEvent) => {
    setError(null);
    setSuccess(null);
    setEventDraft(editEventDraft(event));
  };
  const saveEvent = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!eventDraft || saving || !eventDraft.title.trim() || !eventDraft.startsAt || !eventDraft.endsAt) return;
    const start = new Date(eventDraft.startsAt);
    const end = new Date(eventDraft.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError('结束时间必须晚于开始时间。');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        title: eventDraft.title.trim(),
        description: eventDraft.description.trim() || null,
        location: eventDraft.location.trim() || null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        fullDay: eventDraft.isFullDay,
        timeZone: eventDraft.timeZone.trim() || null,
      };
      if (eventDraft.mode === 'create') {
        const created = await createInternalCalendarEvent(payload);
        setRecords((current) => [...current, created].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
        setSelectedEventId(created.id);
        setSuccess('日程已创建。');
      } else {
        if (!eventDraft.eventId) throw new Error('calendar_event_id_missing');
        const updated = await updateInternalCalendarEvent(eventDraft.eventId, payload);
        setRecords((current) => current.map((item) => item.id === updated.id ? updated : item).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
        setSuccess('日程已保存。');
      }
      setEventDraft(null);
    } catch {
      setError(eventDraft.mode === 'create' ? '日程创建失败，请稍后重试。' : '日程保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };
  const removeEvent = async (event: InternalCalendarEvent) => {
    if (!window.confirm(`确认删除“${event.title}”？`)) return;
    setActionBusy(event.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteInternalCalendarEvent(event.id);
      setRecords((current) => current.filter((item) => item.id !== event.id));
      setSelectedEventId((current) => current === event.id ? null : current);
      setSuccess('日程已删除。');
    } catch {
      setError('日程删除失败，请稍后重试。');
    } finally {
      setActionBusy(null);
    }
  };
  const moveCursor = (direction: -1 | 1) => {
    if (view === 'month') setCursor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
    else if (view === 'week') setCursor((current) => addDays(current, direction * 7));
    else setCursor((current) => addDays(current, direction));
  };

  if (session.status !== 'authenticated') {
    return <Gate title="登录后查看日历" detail="登录企业账号后可使用自己的 GBAP 日历。" action={<Button title="企业登录" onClick={() => void session.login('calendar')} />} />;
  }

  const monthDays = monthGrid(cursor);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart(cursor), index));
  const dayEvents = eventsByDay.get(dateKey(cursor)) ?? [];
  const eventButton = (event: InternalCalendarEvent, compact = false) => <button key={event.id} className={`calendar-product-event ${selectedEventId === event.id ? 'active' : ''} ${compact ? 'compact' : ''}`} onClick={() => setSelectedEventId(event.id)}><time>{eventTime(event)}</time><span>{event.title}</span></button>;
  const visibleError = error ?? loadError;

  return <section className="panel flush calendar-product-page" data-surface="real-calendar-wiring">
    <div className="object-toolbar calendar-product-toolbar">
      <div><h2>日历</h2><p>{loading ? '正在加载日历…' : `个人日历${refreshing ? ' · 后台刷新中' : ''}`}</p></div>
      <div className="toolbar-actions">
        <button className="tool-button" onClick={() => void calendarQuery.refetch()} disabled={calendarQuery.isFetching}><IconRefresh size={15} />{calendarQuery.isFetching ? '刷新中' : '刷新'}</button>
        <button className="tool-button page-primary-action" onClick={() => openCreate()}>新建日程</button>
      </div>
    </div>
    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}
    {success && <div className="real-success" role="status">{success}</div>}

    {eventDraft && <BusinessRecordModal title={eventDraft.mode === 'create' ? '新建日程' : '编辑日程'} description="保存在 GBAP 个人日历中，不连接邮箱，也不向外部日历同步。" onClose={() => setEventDraft(null)} width="large">
      <form className="crm-record-editor calendar-editor" onSubmit={saveEvent}>
        <div className="crm-record-editor-fields calendar-fields">
          <label>标题<input aria-label="日程标题" value={eventDraft.title} onChange={(event) => setEventDraft((current) => current ? { ...current, title: event.target.value } : current)} autoFocus /></label>
          <label>开始时间<input aria-label="开始时间" type="datetime-local" value={eventDraft.startsAt} onChange={(event) => setEventDraft((current) => current ? { ...current, startsAt: event.target.value } : current)} /></label>
          <label>结束时间<input aria-label="结束时间" type="datetime-local" value={eventDraft.endsAt} onChange={(event) => setEventDraft((current) => current ? { ...current, endsAt: event.target.value } : current)} /></label>
          <label>时区<input aria-label="时区" value={eventDraft.timeZone} onChange={(event) => setEventDraft((current) => current ? { ...current, timeZone: event.target.value } : current)} placeholder="Asia/Shanghai" /></label>
          <label className="crm-wide-field">地点<input aria-label="地点" value={eventDraft.location} onChange={(event) => setEventDraft((current) => current ? { ...current, location: event.target.value } : current)} /></label>
          <label className="crm-wide-field">说明<textarea aria-label="日程说明" value={eventDraft.description} onChange={(event) => setEventDraft((current) => current ? { ...current, description: event.target.value } : current)} rows={6} /></label>
          <div className="calendar-checkbox-row"><label><input aria-label="全天事件" type="checkbox" checked={eventDraft.isFullDay} onChange={(event) => setEventDraft((current) => current ? { ...current, isFullDay: event.target.checked } : current)} />全天事件</label></div>
        </div>
        <div className="crm-form-actions"><Button title="取消" variant="secondary" size="small" type="button" onClick={() => setEventDraft(null)} /><Button title={saving ? '保存中…' : eventDraft.mode === 'create' ? '创建日程' : '保存修改'} ariaLabel={saving ? '保存中…' : eventDraft.mode === 'create' ? '创建日程' : '保存修改'} size="small" type="submit" disabled={saving || !eventDraft.title.trim() || !eventDraft.startsAt || !eventDraft.endsAt} /></div>
      </form>
    </BusinessRecordModal>}

    <div className="calendar-product-shell">
      <div className="calendar-product-controls">
        <div className="calendar-product-nav"><button className="tool-button" onClick={() => setCursor(startOfDay(new Date()))}>今天</button><button className="tool-button calendar-arrow" aria-label="上一个日期范围" onClick={() => moveCursor(-1)}>‹</button><button className="tool-button calendar-arrow" aria-label="下一个日期范围" onClick={() => moveCursor(1)}>›</button><strong>{cursorTitle(cursor, view)}</strong></div>
        <div className="calendar-product-view-switch">{(['month', 'week', 'day', 'agenda'] as CalendarView[]).map((mode) => <button key={mode} className={view === mode ? 'active' : ''} onClick={() => setView(mode)}>{mode === 'month' ? '月' : mode === 'week' ? '周' : mode === 'day' ? '日' : '日程'}</button>)}</div>
      </div>

      <div className={`calendar-product-workarea ${selectedEvent ? 'has-detail' : ''}`}>
        <div className="calendar-product-canvas">
          {view === 'month' && <div className="calendar-product-month"><div className="calendar-product-weekdays">{['日','一','二','三','四','五','六'].map((day) => <span key={day}>周{day}</span>)}</div><div className="calendar-product-month-grid">{monthDays.map((day) => { const items = eventsByDay.get(dateKey(day)) ?? []; const today = dateKey(day) === dateKey(new Date()); return <div key={dateKey(day)} className={`calendar-product-day-cell ${sameMonth(day, cursor) ? '' : 'outside'} ${today ? 'today' : ''}`} onDoubleClick={() => { setCursor(day); openCreate(day); }}><header><button onClick={() => { setCursor(day); setView('day'); }}>{day.getDate()}</button></header>{items.slice(0, 3).map((event) => eventButton(event, true))}{items.length > 3 && <button className="calendar-product-more" onClick={() => { setCursor(day); setView('day'); }}>+{items.length - 3} 更多</button>}</div>; })}</div></div>}
          {view === 'week' && <div className="calendar-product-week">{weekDays.map((day) => <section key={dateKey(day)} className={dateKey(day) === dateKey(new Date()) ? 'today' : ''}><header><button onClick={() => { setCursor(day); setView('day'); }}><span>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><strong>{day.getDate()}</strong></button></header><div>{(eventsByDay.get(dateKey(day)) ?? []).map((event) => eventButton(event))}</div></section>)}</div>}
          {view === 'day' && <div className="calendar-product-day"><header><strong>{cursor.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</strong><button className="tool-button page-primary-action" onClick={() => openCreate(cursor)}>新建日程</button></header>{dayEvents.length ? dayEvents.map((event) => <div className="calendar-product-day-event" key={event.id}>{eventButton(event)}<span>{event.location || '未填写地点'}</span></div>) : <div className="real-empty">这一天暂无日程。</div>}</div>}
          {view === 'agenda' && <div className="calendar-product-agenda">{filtered.length ? [...filtered].sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map((event) => <div key={event.id}><time>{new Date(event.startsAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</time>{eventButton(event)}<span>{event.location || '未填写地点'}</span></div>) : <div className="real-empty">当前没有日程。</div>}</div>}
        </div>

        {selectedEvent && <aside className="calendar-product-detail"><button className="calendar-product-detail-close" aria-label="关闭日程详情" onClick={() => setSelectedEventId(null)}>×</button><span className="calendar-product-detail-date">{new Date(selectedEvent.startsAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span><h3>{selectedEvent.title}</h3><p><strong>{eventTime(selectedEvent)}</strong></p><p>{selectedEvent.location || '未填写地点'}</p>{selectedEvent.description && <div className="calendar-product-description">{selectedEvent.description}</div>}<div className="calendar-product-detail-actions"><button className="tool-button" onClick={() => openEdit(selectedEvent)}>编辑</button><button className="tool-button danger" disabled={actionBusy === selectedEvent.id} onClick={() => void removeEvent(selectedEvent)}>{actionBusy === selectedEvent.id ? '删除中…' : '删除日程'}</button></div></aside>}
      </div>
    </div>
  </section>;
}

function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <section className="real-data-gate"><div className="real-data-gate-icon"><IconCalendar size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>;
}
