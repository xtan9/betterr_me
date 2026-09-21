import {horizonDays,type HorizonPlanningInput} from '@/lib/ai/horizon-planning';

/** Author a complete provider response while preserving existing test events. */
export function datedOutput<T extends {events:Array<{date:string}>}>(value:T,horizon:HorizonPlanningInput['horizon']){
 const {events,...metadata}=value;
 return {...metadata,days:Object.fromEntries(horizonDays(horizon).map(date=>[date,events.filter(event=>event.date===date).map(({date:_,...event})=>event)]))};
}
