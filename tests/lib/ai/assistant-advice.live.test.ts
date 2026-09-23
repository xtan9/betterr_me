// @vitest-environment node
// Explicit opt-in: synthetic messages only; never include account data in a live evaluation.
import {generateText,Output} from 'ai';
import {describe,it,expect} from 'vitest';
import {assistantInstructions,assistantOutput,buildAssistantTurn} from '@/lib/ai/assistant-orchestrator';
import {llmProvider,structuredOutputProviderOptions} from '@/lib/ai/provider';
import {AVAILABLE_MODELS,DEFAULT_MODEL_ID} from '@/lib/ai/models';
import {safeAiFailure} from '@/lib/ai/safe-failure';

const scenarios=[
 {locale:'en',replyLocale:'zh',message:'今天生病了，不想处理很多事情。'},
 {locale:'en',replyLocale:'zh',message:'请用中文回答：我今天很累，帮我选一个小步骤。'},
 {locale:'en',replyLocale:'zh',message:'事情太多了，不知道先做什么。'},
 {locale:'zh',replyLocale:'en',message:"Please reply in English. I'm tired today; give me one small step."},
 {locale:'zh',replyLocale:'en',message:"I'm overwhelmed and don't know where to start."},
] as const;

describe.skipIf(process.env.ASSISTANT_ADVICE_LIVE!=='1')('live supportive advice regressions',()=>{
 it.each(['zh','en'] as const)('acknowledges a decision, respects decline and answers requested details (%s)',async locale=>{
  if(!process.env.LLM_API_KEY)throw new Error('Configure LLM_API_KEY before requesting a live evaluation');
  const context={timezone:'UTC',tasks:[],projects:[]};
  const configured=process.env.LLM_MODEL,modelId=configured&&AVAILABLE_MODELS.some(model=>model.id===configured)?configured:DEFAULT_MODEL_ID;
  const history:{role:'user'|'assistant';content:string}[]=locale==='zh'
   ?[{role:'user',content:'这是虚构产品测试，不要保存记忆。请用中文回答：今天不舒服，可能需要看医生。'},{role:'assistant',content:'先把身体照顾好。'},{role:'user',content:'OK 我要去看 urgent care'}]
   :[{role:'user',content:'Fictional product test, do not save memories. Reply in English: I feel unwell and may need to see a doctor today.'},{role:'assistant',content:'Take care of yourself first.'},{role:'user',content:'OK, I am going to urgent care.'}];
  const generate=async(messages:typeof history)=>{
   try{
    const result=await generateText({model:llmProvider(modelId),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:2048,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nCurrent local date: 2026-09-23. Owner context: ${JSON.stringify({capture:context,memories:[],planning:null,calendar:null})}`,messages});
    return buildAssistantTurn(result.output,context,null,messages.at(-1)!.content,locale);
   }catch(error){throw new Error(`Live provider evaluation failed: ${JSON.stringify(safeAiFailure(error))}; details withheld`);}
  };
  const decision=await generate(history);
  expect(decision.intent).toBe('conversation');expect(decision.planning).toBeNull();expect(decision.capture.items).toEqual([]);expect(decision.memoryUpdates).toEqual([]);
  expect(decision.ui.quickReplies.map(choice=>choice.id)).toEqual(['review-today','decline-review']);
  expect(locale==='zh'?decision.message.length:decision.message.split(/\s+/u).length).toBeLessThanOrEqual(locale==='zh'?120:50);
  expect(decision.message).not.toMatch(/最小下一步|smallest next step|insurance|保险|药单|medication list|transport|开车|高烧|fever/iu);
  const continuation=[...history,{role:'assistant' as const,content:decision.message}];
  const declined=await generate([...continuation,{role:'user',content:decision.ui.quickReplies[1].value}]);
  expect(declined.ui.quickReplies).toEqual([]);expect(declined.planning).toBeNull();expect(declined.capture.items).toEqual([]);expect(declined.message).not.toMatch(/[?？]/u);
  const details=await generate([...continuation,{role:'user',content:locale==='zh'?'去看诊需要带哪些证件？':'What documents should I bring?'}]);
  expect(details.ui.quickReplies).toEqual([]);expect(details.planning).toBeNull();expect(details.capture.items).toEqual([]);
  expect(details.message).toMatch(/证件|身份证|保险|\bID\b|identification|insurance/iu);
 },180000);
 it.each(scenarios)('$message',async({locale,replyLocale,message})=>{
  if(!process.env.LLM_API_KEY)throw new Error('Configure LLM_API_KEY before requesting a live evaluation');
  const context={timezone:'UTC',tasks:[],projects:[]};
  const configured=process.env.LLM_MODEL,modelId=configured&&AVAILABLE_MODELS.some(model=>model.id===configured)?configured:DEFAULT_MODEL_ID;
  let result;
  try{
   result=await generateText({model:llmProvider(modelId),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:2048,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nInterface language fallback: ${locale==='zh'?'Simplified Chinese':'English'}. Current instant: 2026-09-22T12:00:00Z. Owner context: ${JSON.stringify({capture:context,memories:[],planning:null,calendar:null})}`,messages:[{role:'user',content:message}]});
  }catch(error){throw new Error(`Live provider evaluation failed: ${JSON.stringify(safeAiFailure(error))}; details withheld`);}
  const turn=buildAssistantTurn(result.output,context,null,message,locale);
  expect(turn.intent).toBe('conversation');expect(turn.replyLocale).toBe(replyLocale);
  expect(turn.planning).toBeNull();expect(turn.nextActionWindow).toBeNull();
  expect(turn.capture.items).toEqual([]);expect(turn.ui.quickReplies).toEqual([]);
  expect(turn.message.length).toBeLessThanOrEqual(500);
  expect(turn.message).not.toMatch(/[?？]|假设|尚未确认|assumptions?|not confirmed|how much time|free minutes|能腾出多久|空闲多久/iu);
  if(replyLocale==='zh')expect(turn.message).toMatch(/\p{Script=Han}/u);
  else expect(turn.message).not.toMatch(/\p{Script=Han}/u);
 },60000);
});
