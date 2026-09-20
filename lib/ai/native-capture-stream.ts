import {safeAiFailure} from './safe-failure';
import {log} from '@/lib/logger';

/** Only public reply text is provisional. A complete event carries the stored, validated proposal. */
export function captureStreamResponse(
 parent:AbortSignal,
 headers:Record<string,string>,
 generate:(emit:(text:string)=>void,signal:AbortSignal)=>Promise<unknown>,
){
 const abort=new AbortController();
 let closed=false;
 const cancel=()=>abort.abort();
 parent.addEventListener('abort',cancel,{once:true});
 if(parent.aborted)cancel();
 const timeout=setTimeout(cancel,55000);
 const cleanup=()=>{clearTimeout(timeout);parent.removeEventListener('abort',cancel);};
 const encoder=new TextEncoder();
 const stream=new ReadableStream<Uint8Array>({
  async start(controller){
   const write=(event:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));};
   let previous='';
   try{
    const proposal=await generate(text=>{
     if(abort.signal.aborted)return;
     if(text.length>8000)throw new Error('Reply too long');
     if(text!==previous){write({type:'text',text});previous=text;}
    },abort.signal);
    if(!abort.signal.aborted&&proposal)write({type:'complete',proposal});
    else write({type:'error',error:'unavailable'});
   }catch(error){
    log.error('[mobile-assistant] Stream failed',undefined,{failure:safeAiFailure(error)});
    write({type:'error',error:'unavailable'});
   }finally{
    cleanup();
    if(!closed){closed=true;controller.close();}
   }
  },
  cancel(){closed=true;cancel();cleanup();},
 });
 return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
