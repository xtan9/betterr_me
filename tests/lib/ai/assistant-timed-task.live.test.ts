// @vitest-environment node
// Opt-in generation only: synthetic prompts, no database client or mutation.
import {describe,expect,it} from 'vitest';
import {generateText,Output} from 'ai';
import {assistantInstructions,assistantOutput,buildAssistantTurn} from '@/lib/ai/assistant-orchestrator';
import {llmProvider,structuredOutputProviderOptions} from '@/lib/ai/provider';
import {DEFAULT_MODEL_ID} from '@/lib/ai/models';
import {safeAiFailure} from '@/lib/ai/safe-failure';

describe.skipIf(process.env.TIMED_CAPTURE_LIVE!=='1')('live timed task capture',()=>{
 it.each([
  ['zh','今晚九点检查门窗','检查门窗'],
  ['en','Create a task to check the doors and windows at nine tonight.','check'],
 ] as const)('extracts %s activity and exact time without inventing an estimate',async(locale,prompt,title)=>{
  if(!process.env.LLM_API_KEY)throw new Error('Configure LLM_API_KEY for live generation');
  const context={timezone:'America/Los_Angeles',supportsTimedTasks:true,referenceAt:Date.parse('2026-10-18T19:00:00Z'),tasks:[],projects:[]};
  let generated;
  try{
   generated=(await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:4096,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nCurrent instant: 2026-10-18T19:00:00.000Z; current local date: 2026-10-18. Interface language fallback: ${locale==='zh'?'Simplified Chinese':'English'}. Owner context: ${JSON.stringify({capture:context,memories:[],planning:null,calendar:null})}`,messages:[{role:'user',content:prompt}]})).output;
  }catch(error){throw new Error(`Synthetic live generation failed: ${JSON.stringify(safeAiFailure(error))}`);}
  const turn=buildAssistantTurn(generated,context,null,prompt,locale);
  const item=turn.capture.items[0];
  console.info(JSON.stringify({fixture:locale,intent:turn.intent,items:turn.capture.items.map(item=>({kind:item.kind,changes:item.changes,...('schedule' in item?{schedule:item.schedule}:{})}))}));
  expect(turn.intent).toBe('capture');expect(turn.capture.items).toHaveLength(1);
  expect(item).toMatchObject({kind:'task-create',changes:{estimate_minutes:null,due_date:null},schedule:{startDate:'2026-10-18',startTime:'21:00',endDate:'2026-10-18',endTime:'21:30',timezone:'America/Los_Angeles',durationSource:'default'}});
  expect(item.changes.title?.toLowerCase()).toContain(title);
  expect(item.changes.title).not.toMatch(/今晚|九点|tonight|nine|21:00/iu);
 },60000);
});
