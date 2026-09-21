import {safeAiFailure} from './safe-failure';
import {log} from '@/lib/logger';
export class AssistantStreamError extends Error {
 constructor(public readonly reason:'conflict'|'invalid'|'unavailable'){super(reason);}
}

/** Only public reply text is provisional. Completion carries the stored response and proposal. */
export function captureStreamResponse(
 parent:AbortSignal,
 headers:Record<string,string>,
 generate:(emit:(text:string)=>void,signal:AbortSignal)=>Promise<Record<string,unknown>|undefined>,
){
 const abort=new AbortController();
 let closed=false;
 const cancel=()=>abort.abort();
 parent.addEventListener('abort',cancel,{once:true});
 if(parent.aborted)cancel();
 // Planning can classify intent, reload horizon context, and regenerate once.
 // Stop before the route's 120-second execution limit so recovery stays typed.
 const timeout=setTimeout(cancel,115000);
 const cleanup=()=>{clearTimeout(timeout);parent.removeEventListener('abort',cancel);};
 const encoder=new TextEncoder();
 const stream=new ReadableStream<Uint8Array>({
  async start(controller){
   const write=(event:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));};
   let previous='';
   try{
    const response=await generate(text=>{
     if(abort.signal.aborted)return;
     if(text.length>8000)throw new Error('Reply too long');
     if(text!==previous){write({type:'text',text});previous=text;}
    },abort.signal);
    if(!abort.signal.aborted&&response)write({type:'complete',...response});
    else write({type:'error',error:'unavailable'});
   }catch(error){
    log.error('[mobile-assistant] Stream failed',undefined,{failure:safeAiFailure(error)});
    write({type:'error',error:error instanceof AssistantStreamError?error.reason:'unavailable'});
   }finally{
    cleanup();
    if(!closed){closed=true;controller.close();}
   }
  },
  cancel(){closed=true;cancel();cleanup();},
 });
 return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
