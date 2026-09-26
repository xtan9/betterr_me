import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({facts:vi.fn()}));
vi.mock('@/lib/ai/next-action',()=>({nextActionFacts:mocks.facts}));
import {currentExecutionWindow,reminderDue} from '@/lib/ai/assistant-execution';
beforeEach(()=>{vi.clearAllMocks();});
it('offers only the current calendar gap, without claiming personal availability',async()=>{
 mocks.facts.mockResolvedValue({window:{start:'2030-01-01T10:00:00.000Z',end:'2030-01-01T11:00:00.000Z',availableUntil:'2030-01-01T10:25:00.000Z',gapMinutes:25,timezone:'UTC'}});
 const result=await currentExecutionWindow({} as never,'owner',Date.parse('2030-01-01T10:00:00Z'));
 expect(result).toEqual({start:'2030-01-01T10:00:00.000Z',end:'2030-01-01T10:25:00.000Z',timezone:'UTC',minutes:25,requiresConfirmation:true});
 expect(mocks.facts).toHaveBeenCalledWith({},'owner',Date.parse('2030-01-01T10:00:00Z'),Date.parse('2030-01-01T11:00:00Z'));
});
it('does not offer availability during an occupied event',async()=>{
 mocks.facts.mockResolvedValue({window:{gapMinutes:0}});
 expect(await currentExecutionWindow({} as never,'owner',0)).toBeNull();
});
it('fails closed when recurring occupancy cannot be verified',async()=>{
 mocks.facts.mockRejectedValue(new Error('Incomplete occurrence coverage'));
 await expect(currentExecutionWindow({} as never,'owner',0)).rejects.toThrow();
});
it('enforces opt-in, local hours, daily cap, two-hour spacing and snooze',()=>{
 const now=Date.parse('2030-01-01T18:00:00Z');
 const settings={enabled:true,timezone:'America/Los_Angeles',startMinute:540,endMinute:1020,lastSentAt:null,sentDate:null,sentCount:0,snoozedUntil:null};
 expect(reminderDue(settings,now)).toBe(true);
 expect(reminderDue({...settings,enabled:false},now)).toBe(false);
 expect(reminderDue({...settings,sentDate:'2030-01-01',sentCount:3},now)).toBe(false);
 expect(reminderDue({...settings,lastSentAt:'2030-01-01T17:00:00Z'},now)).toBe(false);
 expect(reminderDue({...settings,snoozedUntil:'2030-01-01T19:00:00Z'},now)).toBe(false);
 expect(reminderDue(settings,Date.parse('2030-01-02T02:00:00Z'))).toBe(false);
});
it('uses elapsed spacing across the DST fold and resets the cap at local midnight',()=>{
 const settings={enabled:true,timezone:'America/Los_Angeles',startMinute:0,endMinute:1440,lastSentAt:'2026-11-01T08:30:00Z',sentDate:'2026-11-01',sentCount:1,snoozedUntil:null};
 expect(reminderDue(settings,Date.parse('2026-11-01T09:30:00Z'))).toBe(false);
 expect(reminderDue(settings,Date.parse('2026-11-01T10:30:00Z'))).toBe(true);
 expect(reminderDue({...settings,lastSentAt:null,sentCount:3},Date.parse('2026-11-02T07:59:59Z'))).toBe(false);
 expect(reminderDue({...settings,lastSentAt:null,sentCount:3},Date.parse('2026-11-02T08:00:00Z'))).toBe(true);
 expect(reminderDue({...settings,lastSentAt:null,startMinute:180,endMinute:240},Date.parse('2026-03-08T10:00:00Z'))).toBe(true);
});
