import { historyCookieRoute } from '@/lib/fitness/history-cookie-route';
import { executeHistoryCommand } from '@/lib/fitness/train-history';
export function POST(request:Request){return historyCookieRoute(request,'write',async(client,owner)=>executeHistoryCommand(request,client,owner));}
