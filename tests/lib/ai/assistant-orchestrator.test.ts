import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {buildAssistantTurn,selectMemories,type Memory} from '@/lib/ai/assistant-orchestrator';

const context={timezone:'America/Los_Angeles',tasks:[],projects:[]};
const golden=readFileSync('tests/fixtures/assistant/two-week-planning.txt','utf8');
const output={intent:'planning',message:'Family time after pickup stays protected. Calls can remain tasks, with one clear next action.',actions:[],memoryUpdates:[],nextActionWindow:null,
 planning:{horizon:null,facts:[
  {dimension:'sleep',state:'missing',detail:null},
  {dimension:'caregiving',state:'partial',detail:'School Monday–Thursday; leave at 8:30. Pickup time unknown. Family time after pickup; Friday and weekends mostly family time.'},
  {dimension:'fixedCommitments',state:'known',detail:'School drop-off before 9.'},
  {dimension:'workBoundaries',state:'known',detail:'No focused work after pickup.'},
  {dimension:'meals',state:'known',detail:'Three meals, finish by 4pm.'},
  {dimension:'exercise',state:'known',detail:'Gym Monday–Saturday, rest Sunday.'},
  {dimension:'deadlines',state:'not_relevant',detail:null},
  {dimension:'priorities',state:'known',detail:'Handle admin early without blocking every call. Finish three hours of video work; split remaining focus equally between app and YouTube.'},
 ],questions:[],assumptions:[],draft:null,skipDiscovery:false}};
describe('planning discovery and draft contract',()=>{
 it('asks only dates, sleep and pickup for the golden request, without creating schedule changes',()=>{
  const turn=buildAssistantTurn(output,context,null,golden,'en');
  expect(turn.planning?.status).toBe('discovering');
  expect(turn.missing).toEqual(['horizon','sleep','caregiving']);
  expect(turn.message).toContain('Which dates');expect(turn.message).toContain('sleep and wake');expect(turn.message).toContain('pickup');
  expect(turn.message.match(/\?/g)).toHaveLength(3);
  expect(turn.message).toContain('Calls can remain tasks');expect(turn.message).toContain('Family time');
  expect(turn.message).not.toMatch(/capture step|subsystem|unsupported schedule optimization|endpoint limitation/);
  expect(turn.capture.items).toEqual([]);expect(turn.ui.quickReplies[0].value).toBe('Skip. Plan now.');
 });
 it('skips discovery with explicit unknowns and keeps the plan a prose draft',()=>{
  const first=buildAssistantTurn(output,context,null,golden,'en');
  const draft=buildAssistantTurn({...output,planning:{...output.planning,facts:[],draft:'Across both weeks, keep afternoons for family. Make one admin call before choosing the next task.'}},context,first.planning,'Skip. Plan now.','en');
  expect(draft.planning?.status).toBe('drafted');expect(draft.planning?.horizon).toBeNull();
  expect(draft.planning?.assumptions).toEqual(expect.arrayContaining(['horizon: not confirmed; keep this flexible.','sleep: not confirmed; keep this flexible.','caregiving: not confirmed; keep this flexible.']));
  expect(draft.message).toContain('no tasks or calendar entries have been changed');expect(draft.capture.items).toEqual([]);expect(draft.ui.quickReplies).toEqual([]);
 });
 it('captures a multi-day horizon and does not re-ask known dates or preferences',()=>{
  const first=buildAssistantTurn(output,context,null,golden,'en');
  const next=buildAssistantTurn({...output,planning:{...output.planning,draft:'Keep each afternoon for family and prioritize admin calls early in the first week.',horizon:{startDate:'2026-09-21',endDate:'2026-10-04',timezone:context.timezone},facts:[{dimension:'sleep',state:'known',detail:'Sleep 10pm, wake 6am.'},{dimension:'caregiving',state:'known',detail:'Leave at 3pm for pickup; then family time.'}]}},context,first.planning,'Sep 21–Oct 4, sleep 10 to 6, pickup 3.','en');
  expect(next.planning?.horizon?.endDate).toBe('2026-10-04');expect(next.missing).toEqual([]);expect(next.planning?.facts.exercise).toContain('Gym');expect(next.planning?.status).toBe('drafted');
 });
 it('rejects invalid horizons, arbitrary mutations and fabricated known facts',()=>{
  expect(()=>buildAssistantTurn({...output,planning:{...output.planning,horizon:{startDate:'2026-02-31',endDate:'2026-03-02',timezone:'UTC'}}},context,null,golden,'en')).toThrow();
  expect(()=>buildAssistantTurn({...output,actions:[{kind:'task-create',title:'Unapproved task',estimateMinutes:null,dueDate:null,projectId:null,projectKey:null}]},context,null,golden,'en')).toThrow();
  expect(()=>buildAssistantTurn({...output,planning:{...output.planning,facts:[{dimension:'sleep',state:'known',detail:null}]}},context,null,golden,'en')).toThrow();
 });
 it('selects bounded durable context without promoting inference or reviving expired temporary facts',()=>{
  const memories:Memory[]=Array.from({length:30},(_,i)=>({id:String(i),kind:'preference',key:String(i),content:'A preference',confidence:1,temporality:'durable',updated_at:'2026-09-19T00:00:00Z',effective_until:null}));
  memories.unshift({...memories[0],id:'stale',kind:'current_state',temporality:'temporary',effective_until:'2026-09-18T00:00:00Z'});
  const selected=selectMemories(memories,null,new Date('2026-09-19'));
  expect(selected).toHaveLength(24);expect(selected.some(m=>m.id==='stale')).toBe(false);
  const inference={...memories[1],kind:'inference',confidence:0.6};expect(selectMemories([inference],null,new Date('2026-09-19'))[0].kind).toBe('inference');
 });
});
