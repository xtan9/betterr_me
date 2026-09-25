import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GoogleConnectionError, type GoogleCalendar, type GoogleEvent, type GoogleMail } from './contracts';
import { type GoogleConnections, publicConnection } from './connections';

const calendarSchema = z.object({ id: z.string(), summary: z.string().optional(), primary: z.boolean().optional(), accessRole: z.string().optional() });
const dateSchema = z.object({ date: z.string().optional(), dateTime: z.string().optional() });
const eventSchema = z.object({ id: z.string(), status: z.string().optional(), summary: z.string().optional(), start: dateSchema.optional(), end: dateSchema.optional(), htmlLink: z.string().optional(), transparency: z.string().optional(), attendees: z.array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() })).optional() });
const pageSchema = z.object({ items: z.array(z.unknown()).optional(), nextPageToken: z.string().optional() });
const sourceLink = (value: string | undefined, hostname: string) => { try { const url = new URL(value ?? ''); return url.protocol === 'https:' && url.hostname === hostname ? url.toString() : null; } catch { return null; } };

export function validRange(start: string, end: string) {
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 93 * 86400000) throw new GoogleConnectionError('invalid');
}

export class GoogleReads {
  constructor(private readonly connections: GoogleConnections) {}
  private async pages(url: URL, token: string, limit: number): Promise<unknown[]> {
    const items: unknown[] = [], seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const result = pageSchema.parse(await this.connections.provider(url.toString(), token));
      items.push(...(result.items ?? []));
      if (items.length > limit) throw new GoogleConnectionError('limited');
      if (!result.nextPageToken) return items;
      if (seen.has(result.nextPageToken)) throw new GoogleConnectionError('unavailable');
      seen.add(result.nextPageToken); url.searchParams.set('pageToken', result.nextPageToken);
    }
    throw new GoogleConnectionError('limited');
  }
  async calendars(userId: string): Promise<GoogleCalendar[]> {
    return this.connections.read(userId, 'calendar', async (_, token) => {
      const rows = await this.pages(new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250'), token, 500);
      return rows.map(row => calendarSchema.parse(row)).filter(row => ['owner', 'writer', 'reader'].includes(row.accessRole ?? '')).map(row => ({ id: row.id, title: row.summary || row.id, primary: !!row.primary }));
    });
  }
  async selectCalendars(userId: string, ids: string[]) {
    const before = await this.connections.store.get(userId, 'calendar');
    if (!before) throw new GoogleConnectionError('disconnected');
    const available = await this.calendars(userId);
    if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !available.some(row => row.id === id))) throw new GoogleConnectionError('invalid');
    const next = { ...before, selectedCalendars: ids, status: 'connected' as const, revision: randomUUID() };
    if (!await this.connections.store.save(next, before.revision)) throw new GoogleConnectionError('conflict');
    return publicConnection(next);
  }
  async events(userId: string, start: string, end: string): Promise<GoogleEvent[]> {
    validRange(start, end);
    return this.connections.read(userId, 'calendar', async (record, token) => {
      if (!record.selectedCalendars.length) throw new GoogleConnectionError('select-calendars');
      const calendars = (await this.pages(new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250'), token, 500)).map(row => calendarSchema.parse(row));
      const events: GoogleEvent[] = [];
      // Bound concurrency and reject the whole overlay when any selected calendar is unavailable.
      for (const id of record.selectedCalendars) {
        const calendar = calendars.find(row => row.id === id);
        if (!calendar || !['owner', 'writer', 'reader'].includes(calendar.accessRole ?? '')) throw new GoogleConnectionError('select-calendars');
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`);
        url.search = new URLSearchParams({ timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), singleEvents: 'true', showDeleted: 'false', maxResults: '2500', orderBy: 'startTime' }).toString();
        const rows = await this.pages(url, token, 2000 - events.length);
        for (const raw of rows) {
          const event = eventSchema.parse(raw);
          if (event.status === 'cancelled' || event.attendees?.some(a => a.self && a.responseStatus === 'declined')) continue;
          const eventStart = event.start?.dateTime ?? event.start?.date, eventEnd = event.end?.dateTime ?? event.end?.date;
          if (!eventStart || !eventEnd || !Number.isFinite(Date.parse(eventStart)) || !Number.isFinite(Date.parse(eventEnd)) || Date.parse(eventEnd) <= Date.parse(eventStart)) throw new GoogleConnectionError('unavailable');
          events.push({ id: `google:${encodeURIComponent(id)}:${event.id}`, calendarId: id, calendarTitle: calendar.summary || id, title: event.summary || '(Untitled)', start: eventStart, end: eventEnd, allDay: !!event.start?.date, url: sourceLink(event.htmlLink, 'calendar.google.com'), busy: event.transparency !== 'transparent' });
        }
      }
      return events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    });
  }
  async mail(userId: string, query: string): Promise<{ messages: GoogleMail[]; more: boolean }> {
    if (!query.trim() || query.length > 500) throw new GoogleConnectionError('invalid');
    return this.connections.read(userId, 'gmail', async (record, token) => {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.search = new URLSearchParams({ q: query, maxResults: '10', includeSpamTrash: 'false' }).toString();
      const found = z.object({ messages: z.array(z.object({ id: z.string() })).max(10).optional(), nextPageToken: z.string().optional() }).parse(await this.connections.provider(url.toString(), token));
      const messages: GoogleMail[] = [];
      for (const { id } of found.messages ?? []) {
        const raw = await this.connections.provider(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, token);
        const message = mailSchema.parse(raw), headers = message.payload?.headers ?? [];
        const header = (name: string) => headers.find(item => item.name.toLowerCase() === name)?.value ?? '';
        messages.push({ id, subject: header('subject'), from: header('from'), date: header('date'), body: mailText(message.payload) || message.snippet || '', url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(record.email ?? '')}#all/${encodeURIComponent(id)}` });
      }
      return { messages, more: !!found.nextPageToken };
    });
  }
}
type MailPart = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: MailPart[]; headers?: { name: string; value: string }[] };
const partSchema: z.ZodType<MailPart> = z.lazy(() => z.object({ mimeType: z.string().optional(), filename: z.string().optional(), body: z.object({ data: z.string().optional() }).optional(), parts: z.array(partSchema).optional(), headers: z.array(z.object({ name: z.string(), value: z.string() })).optional() }));
const mailSchema = z.object({ payload: partSchema.optional(), snippet: z.string().optional() });
function mailText(part: MailPart | undefined, depth = 0): string {
  if (!part || part.filename || depth > 12) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8').slice(0, 6000);
  // Never download attachments or execute/render email HTML.
  return (part.parts ?? []).map(child => mailText(child, depth + 1)).filter(Boolean).join('\n').slice(0, 6000);
}
