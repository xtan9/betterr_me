import type {SupabaseClient} from '@supabase/supabase-js';
import {nextActionFacts} from './next-action';
import {getLocalDateInTimeZone} from '@/lib/recurring-tasks/scheduling';

/** A bounded candidate, never a claim that an empty calendar is consent. */
export async function currentExecutionWindow(client:SupabaseClient,userId:string,now=Date.now()) {
 const facts=await nextActionFacts(client,userId,now,now+60*60_000);
 if(facts.window.gapMinutes<1)return null;
 return {start:facts.window.start,end:facts.window.availableUntil,timezone:facts.window.timezone,minutes:facts.window.gapMinutes,requiresConfirmation:true as const};
}

export type ReminderSettings={enabled:boolean;timezone:string;startMinute:number;endMinute:number;lastSentAt:string|null;sentDate:string|null;sentCount:number;snoozedUntil:string|null};
export function reminderDue(settings:ReminderSettings,now:number) {
 if(!settings.enabled||settings.snoozedUntil&&Date.parse(settings.snoozedUntil)>now||settings.lastSentAt&&now-Date.parse(settings.lastSentAt)<2*60*60_000)return false;
 const date=getLocalDateInTimeZone(new Date(now),settings.timezone);
 if(settings.sentDate===date&&settings.sentCount>=3)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const minute=Number(parts.find(p=>p.type==='hour')?.value)*60+Number(parts.find(p=>p.type==='minute')?.value);
 return minute>=settings.startMinute&&minute<settings.endMinute;
}

/** Explicit start/later feedback suppresses repeat recommendations, not saved priority order. */
export async function executionRecommendation(client:SupabaseClient,userId:string,end:number,excluded:string[]=[],now=Date.now()) {
 const feedback=await client.from('assistant_execution_events').select('task_id,until_at').eq('user_id',userId).gt('until_at',new Date(now).toISOString()).limit(200);
 if(feedback.error||!feedback.data||feedback.data.length===200)throw new Error('Unavailable execution history');
 const excludedIds=[...new Set([...excluded,...feedback.data.map(row=>row.task_id as string)])];
 return nextActionFacts(client,userId,now,end,{excludedIds});
}
