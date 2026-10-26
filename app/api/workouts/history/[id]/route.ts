import { historyCookieRoute } from '@/lib/fitness/history-cookie-route';
import { historyReadResponse } from '@/lib/fitness/train-history';
export function GET(request:Request, context:{params:Promise<{id:string}>}){return historyCookieRoute(request,'read',async(client,owner)=>historyReadResponse('detail',request,client,owner,(await context.params).id));}
