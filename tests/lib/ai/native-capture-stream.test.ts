// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {captureStreamResponse} from '@/lib/ai/native-capture-stream';
vi.mock('@/lib/logger',()=>({log:{error:vi.fn()}}));
afterEach(()=>vi.useRealTimers());

it('lets a planning turn finish after two model passes exceed one minute',async()=>{
 vi.useFakeTimers();let signal!:AbortSignal;
 const response=captureStreamResponse(new AbortController().signal,{},async(_emit,current)=>{
  signal=current;
  await new Promise(resolve=>setTimeout(resolve,70000));
  return {message:'Two-week draft',intent:'planning'};
 });
 const body=response.text();await vi.advanceTimersByTimeAsync(70000);
 expect(signal.aborted).toBe(false);
 expect(await body).toContain('"type":"complete"');
 expect(vi.getTimerCount()).toBe(0);
});

it.each(['deadline','user stop'])('still aborts unfinished generation on %s without completion',async(reason)=>{
 vi.useFakeTimers();const parent=new AbortController();let signal!:AbortSignal;
 const response=captureStreamResponse(parent.signal,{},async(_emit,current)=>{
  signal=current;await new Promise<void>(resolve=>current.addEventListener('abort',()=>resolve(),{once:true}));
  return {message:'Must not complete'};
 });
 const body=response.text();
 if(reason==='deadline'){
  await vi.advanceTimersByTimeAsync(114000);expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
 }else parent.abort();
 expect(await body).toBe('{"type":"error","error":"unavailable"}\n');
 expect(signal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
