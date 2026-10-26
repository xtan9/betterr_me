import { historyCookieRoute } from '@/lib/fitness/history-cookie-route';
import { historyReadResponse } from '@/lib/fitness/train-history';
export function POST(request:Request){return historyCookieRoute(request,'read',async(client,owner)=>historyReadResponse('list',request,client,owner));}
