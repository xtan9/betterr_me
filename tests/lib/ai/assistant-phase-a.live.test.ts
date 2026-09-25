// @vitest-environment node
// Explicit opt-in; synthetic fixture only. Never print provider errors or private context.
import {readFileSync} from 'node:fs';
import {generateText,Output} from 'ai';
import {describe,it,expect} from 'vitest';
import {assistantInstructions,assistantOutput,buildAssistantTurn} from '@/lib/ai/assistant-orchestrator';
import {llmProvider,structuredOutputProviderOptions} from '@/lib/ai/provider';
import {DEFAULT_MODEL_ID} from '@/lib/ai/models';
import {safeAiFailure} from '@/lib/ai/safe-failure';

describe.skipIf(process.env.PHASE_A_LIVE!=='1')('live Phase A golden planning behavior',()=>{
 it('discovers dates/sleep/pickup, reflects constraints, then drafts on skip',async()=>{
  if(!process.env.LLM_API_KEY)throw new Error('Configure LLM_API_KEY before requesting a live evaluation');
  const context={timezone:'America/Los_Angeles',tasks:[],projects:[]};
  const golden=readFileSync('tests/fixtures/assistant/two-week-planning.txt','utf8');
  const messages:{role:'user'|'assistant';content:string}[]=[{role:'user',content:golden}];
  async function generate(planning:unknown){
   try{return (await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:6144,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nReply in English. Current local date: 2026-09-20. Owner context: ${JSON.stringify({capture:context,planning,memories:[],calendar:{events:[],coverageComplete:false}})}`,messages})).output;}
   catch(error){throw new Error(`Live provider evaluation failed: ${JSON.stringify(safeAiFailure(error))}; details withheld`);}
  }
  const first=buildAssistantTurn(await generate(null),context,null,golden,'en');
  expect(first.intent).toBe('planning');expect(first.planning?.status).toBe('discovering');
  expect(first.missing).toEqual(expect.arrayContaining(['horizon','sleep','caregiving']));
  expect(first.message.match(/[?？]/g)?.length).toBeLessThanOrEqual(3);
  // Readiness tracks all missing dimensions; current UX asks only the next necessary question.
  expect(first.message).toMatch(/dates|date range/i);expect(first.message.match(/[?？]/g)?.length).toBeLessThanOrEqual(1);
  expect(first.message).toMatch(/family/i);expect(first.message).toMatch(/calls|admin/i);expect(first.message).toMatch(/next action|one.*(?:task|step|action)|decision/i);
  expect(first.capture.items).toEqual([]);
  messages.push({role:'assistant',content:first.message},{role:'user',content:'Skip. Plan now.'});
  const next=buildAssistantTurn(await generate(first.planning),context,first.planning,'Skip. Plan now.','en');
  expect(next.planning?.status).toBe('drafted');expect(next.planning?.assumptions.length).toBeGreaterThan(0);expect(next.capture.items).toEqual([]);expect(next.message).not.toContain('?');
 },120000);
 it('keeps a skipped provisional morning inside the stated eating window',async()=>{
  if(!process.env.LLM_API_KEY)throw new Error('Configure LLM_API_KEY before requesting a live evaluation');
  const context={timezone:'America/Los_Angeles',tasks:[],projects:[]};
  const prompt='Fictional planning test; do not save memories. Reply in English. Plan a provisional school-day morning. I leave for school drop-off at 08:30 and return by 09:00. I want an 18:6 eating window ending at 16:00. Skip all other questions. Plan now. State when my first meal belongs relative to drop-off, in one sentence; do not reserve calendar time.';
  let output;try{output=(await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:4096,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nCurrent local date: 2026-09-25. Owner context: ${JSON.stringify({capture:context,planning:null,memories:[],calendar:null})}`,messages:[{role:'user',content:prompt}]})).output;}catch(error){throw new Error(`Live provider evaluation failed: ${JSON.stringify(safeAiFailure(error))}; details withheld`);}
  const turn=buildAssistantTurn(output,context,null,prompt,'en');
  expect(turn.message).toMatch(/10(?::00)?\s*(?:a\.?m\.?)?/i);
  expect(turn.message).toMatch(/after.*(?:drop.off|school)|(?:drop.off|school).*then.*(?:meal|breakfast)/i);
  expect(turn.message).not.toMatch(/(?:breakfast|first meal)\s*(?:before|then)\s*(?:school|drop.off)/i);
  expect(turn.capture.items).toEqual([]);expect(turn.memoryUpdates).toEqual([]);
 },60000);
});
