/** Hevy's English workout export. Raw fields remain authoritative import evidence. */
export const hevyHeaders = ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', 'weight_lbs', 'reps', 'distance_miles', 'duration_seconds', 'rpe'] as const;
export type HevyRow = Record<typeof hevyHeaders[number], string>;
export type HevySet = { source: HevyRow; weightKg: number | null; reps: number | null; distanceMeters: number | null; durationSeconds: number | null; rpe: number | null };
export type HevyExercise = { title: string; notes: string; supersetId: string; sets: HevySet[] };
export type HevyWorkout = { sourceKey: string; contentKey: string; title: string; day: string; startTime: string; endTime: string; description: string; exercises: HevyExercise[] };
export type HevyCsv = { workouts: HevyWorkout[]; sets: number; exerciseNames: string[]; from: string; through: string };
export class HevyCsvError extends Error {
  readonly code: 'too_large' | 'invalid_csv' | 'unsupported_header' | 'invalid_value' | 'ambiguous_workout' | 'empty';
  readonly row?: number;
  constructor(code: HevyCsvError['code'], row?: number) { super(code); this.code = code; this.row = row; }
}

/** RFC 4180 records, including quoted commas/newlines and escaped quotes. */
function records(input: string): string[][] {
  if (input.length > 5_000_000) throw new HevyCsvError('too_large');
  const text = input.replace(/^\uFEFF/, ''), rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const push = () => { row.push(field); field = ''; closed = false; };
  const finish = () => { push(); if (row.some(value => value !== '')) rows.push(row); row = []; if (rows.length > 25_001) throw new HevyCsvError('too_large'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === ',') push();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finish(); }
    else if (char === '"' && field === '' && !closed) quoted = true;
    else { if (closed || char === '"') throw new HevyCsvError('invalid_csv', rows.length + 1); field += char; }
  }
  if (quoted) throw new HevyCsvError('invalid_csv', rows.length + 1);
  if (field !== '' || row.length || closed) finish();
  return rows;
}
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function civilTime(value: string, row: number) {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}), ([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match || !months.includes(match[2])) throw new HevyCsvError('invalid_value', row);
  const day = `${match[3]}-${String(months.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new HevyCsvError('invalid_value', row);
  return { day, clock: `${match[4]}:${match[5]}:${match[6] ?? '00'}` };
}
function numeric(value: string, row: number, integer = false, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (value === '') return null;
  if (value.length > 128 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new HevyCsvError('invalid_value', row);
  const number = Number(value);
  if (!Number.isFinite(number) || number > maximum || integer && !Number.isSafeInteger(number) || number === 0 && /[1-9]/.test(value)) throw new HevyCsvError('invalid_value', row);
  return number;
}
// Apply exact decimal unit factors before the final conversion to a JS number.
function converted(value: string, factor: bigint, scale: number): number {
  const [whole, fraction = ''] = value.split('.');
  return Number(`${BigInt(whole + fraction) * factor}e-${fraction.length + scale}`);
}
export function parseHevyCsv(input: string): HevyCsv {
  const [header, ...rows] = records(input);
  if (!header || header.length !== hevyHeaders.length || new Set(header).size !== header.length || hevyHeaders.some(key => !header.includes(key))) throw new HevyCsvError('unsupported_header');
  if (!rows.length) throw new HevyCsvError('empty');
  const groups = new Map<string, { workout: HevyWorkout; rows: HevyRow[] }>(), names = new Set<string>();
  for (const [index, cells] of rows.entries()) {
    const position = index + 2;
    if (cells.length !== header.length) throw new HevyCsvError('invalid_csv', position);
    const source = Object.fromEntries(header.map((key, column) => [key, cells[column]])) as HevyRow;
    if (!source.title.trim() || !source.exercise_title.trim() || !['normal', 'warmup', 'failure', 'dropset'].includes(source.set_type)) throw new HevyCsvError('invalid_value', position);
    const start = civilTime(source.start_time, position); civilTime(source.end_time, position);
    numeric(source.set_index, position, true, 2147483646);
    if (source.set_index === '') throw new HevyCsvError('invalid_value', position);
    const weight = numeric(source.weight_lbs, position), distance = numeric(source.distance_miles, position);
    const set: HevySet = { source, weightKg: weight === null ? null : converted(source.weight_lbs, BigInt(45359237), 8), distanceMeters: distance === null ? null : converted(source.distance_miles, BigInt(1609344), 3),
      reps: numeric(source.reps, position, true), durationSeconds: numeric(source.duration_seconds, position, true), rpe: numeric(source.rpe, position, false, 10) };
    if (set.rpe !== null && set.rpe < 1) throw new HevyCsvError('invalid_value', position);
    const sourceKey = JSON.stringify([source.title, source.start_time, source.end_time]);
    let group = groups.get(sourceKey);
    if (!group) { group = { workout: { sourceKey, contentKey: '', title: source.title, day: start.day, startTime: source.start_time, endTime: source.end_time, description: source.description, exercises: [] }, rows: [] }; groups.set(sourceKey, group); }
    if (group.workout.description !== source.description) throw new HevyCsvError('ambiguous_workout', position);
    group.rows.push(source); names.add(source.exercise_title);
    const entries = group.workout.exercises;
    let entry = entries.at(-1);
    if (!entry || entry.title !== source.exercise_title || entry.notes !== source.exercise_notes || entry.supersetId !== source.superset_id || Number(source.set_index) <= Number(entry.sets.at(-1)!.source.set_index)) {
      entry = { title: source.exercise_title, notes: source.exercise_notes, supersetId: source.superset_id, sets: [] }; entries.push(entry);
    }
    entry.sets.push(set);
  }
  const workouts = [...groups.values()].map(group => ({ ...group.workout, contentKey: JSON.stringify(group.rows.map(row => hevyHeaders.map(key => row[key]))) }));
  const days = workouts.map(workout => workout.day).sort();
  return { workouts, sets: rows.length, exerciseNames: [...names].sort(), from: days[0], through: days.at(-1)! };
}
