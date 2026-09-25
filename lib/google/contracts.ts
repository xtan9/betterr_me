export const googleServices = ['gmail', 'calendar'] as const;
export type GoogleService = typeof googleServices[number];
export type ConnectionStatus = 'disconnected' | 'connected' | 'reconnect' | 'select-calendars';
export type GoogleConnection = {
  service: GoogleService;
  status: ConnectionStatus;
  email: string | null;
  selectedCalendars: string[];
};
export type ConnectionRecord = GoogleConnection & {
  userId: string; revision: string; subject: string | null; credential: string | null;
};
export type ConnectionAttempt = {
  userId: string; service: GoogleService; revision: string; verifier: string; expiresAt: string;
};
export type GoogleCalendar = { id: string; title: string; primary: boolean };
export type GoogleEvent = {
  id: string; calendarId: string; calendarTitle: string; title: string;
  start: string; end: string; allDay: boolean; url: string | null;
  busy: boolean;
};
export type GoogleMail = { id: string; subject: string; from: string; date: string; body: string; url: string };
export type GoogleFailure = 'invalid' | 'conflict' | 'reconnect' | 'disconnected' | 'select-calendars' | 'unavailable' | 'limited' | 'not-configured';
export class GoogleConnectionError extends Error {
  constructor(public readonly reason: GoogleFailure) { super(reason); }
}
export interface GoogleConnectionStore {
  list(userId: string): Promise<ConnectionRecord[]>;
  get(userId: string, service: GoogleService): Promise<ConnectionRecord | null>;
  begin(record: ConnectionRecord, stateHash: string, attempt: ConnectionAttempt, expectedRevision: string | null): Promise<void>;
  consume(userId: string, stateHash: string, now: string): Promise<ConnectionAttempt | null>;
  save(record: ConnectionRecord, expectedRevision: string): Promise<boolean>;
  remove(userId: string, service: GoogleService, revision: string): Promise<boolean>;
}
export const GOOGLE_RETURN_URL = 'betterrme://connections/callback';
