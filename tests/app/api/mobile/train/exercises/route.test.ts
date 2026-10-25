import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/mobile/train/exercises/commands/route';
import { GET as capabilities } from '@/app/api/mobile/train/exercises/capabilities/route';
import { GET as list } from '@/app/api/mobile/train/exercises/route';
import { GET as detail } from '@/app/api/mobile/train/exercises/[id]/route';
import { POST as cookieCommand } from '@/app/api/exercises/commands/route';
import { POST as cookieCreate } from '@/app/api/exercises/route';
import { PATCH as cookieUpdate, DELETE as cookieArchive } from '@/app/api/exercises/[id]/route';
import { NextRequest } from 'next/server';
import contract from '@/tests/fixtures/train-custom-exercise-contract.json';

const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/supabase-js', async importOriginal => ({
  ...await importOriginal<typeof import('@supabase/supabase-js')>(),
  createClient: vi.fn(() => ({ rpc, auth: { getUser } })),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({ rpc, auth: { getUser } })) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const owner='64181000-0000-4000-8000-000000000001';
const id='64181000-0000-4000-8000-000000000010';
const operationId='64181000-0000-4000-8000-000000000020';
const definition={id,ownerId:owner,name:'Renamed',equipment:'band',mode:'duration_weight',convention:null,
  primaryMuscle:'other',secondaryMuscles:['legacy-muscle'],archivedAt:null,version:'9007199254740993',createdAt:null,updatedAt:'2026-10-25T10:00:00+00:00'};
const receipt={operationId,operation:'update-metadata',ownerId:owner,exerciseId:id,acceptedAt:'2026-10-25T10:00:00+00:00',definition};
const envelope={protocolVersion:1,operationId,command:{kind:'update-metadata',exerciseId:id,expectedVersion:'9007199254740992',patch:{name:'Renamed'}}};
const readiness=(ready:boolean)=>({protocolVersion:1,customExercises:{contractVersion:1,ready},completionVersions:ready?[1,2,3]:[1,2]});
const request=(body:unknown,bearer=true)=>new Request('https://example.test/api/mobile/train/exercises/commands',{
  method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer fixture-session'}:{'X-Train-Owner':owner})},body:JSON.stringify(body)});

describe('custom exercise authenticated command and readiness contract',()=>{
  afterEach(()=>vi.unstubAllEnvs());
  beforeEach(()=>{
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture-public-key');
    getUser.mockReset().mockResolvedValue({data:{user:{id:owner}},error:null});
    rpc.mockReset().mockImplementation(async(name:string)=>({data:name==='train_custom_exercise_capabilities'?readiness(true):{status:'accepted',receipt},error:null}));
  });
  it('returns exact durable first evidence to bearer and cookie clients without losing bigint versions',async()=>{
    expect(await (await POST(request(envelope))).json()).toEqual({protocolVersion:1,receipt});
    expect(await (await cookieCommand(request(envelope,false))).json()).toEqual({protocolVersion:1,receipt});
    expect(rpc).toHaveBeenLastCalledWith('execute_train_exercise_command',{p_request:envelope});
    expect(definition.version).toBe('9007199254740993');
  });
  it('advertises false readiness and blocks native commands while cookie maintenance remains available',async()=>{
    rpc.mockImplementation(async(name:string)=>({data:name==='train_custom_exercise_capabilities'?readiness(false):{status:'accepted',receipt},error:null}));
    const cap=await capabilities(new Request('https://example.test',{headers:{Authorization:'Bearer fixture-session'}}));
    expect(await cap.json()).toEqual(readiness(false));
    const blocked=await POST(request(envelope));
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toEqual({protocolVersion:1,error:{code:'not_ready'}});
    expect(rpc.mock.calls.filter(([name])=>name==='execute_train_exercise_command')).toEqual([]);
    expect((await cookieCommand(request(envelope,false))).status).toBe(200);
  });
  it('keeps definitive rejection evidence distinct from success and preserves its exact current version',async()=>{
    const rejection={operationId,operation:'update-metadata',ownerId:owner,exerciseId:id,rejectedAt:'2026-10-25T10:00:00Z',code:'version_conflict',current:definition};
    rpc.mockImplementation(async(name:string)=>({data:name==='train_custom_exercise_capabilities'?readiness(true):{status:'version_conflict',rejection},error:null}));
    const response=await POST(request(envelope));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({protocolVersion:1,error:{code:'version_conflict'},rejection});
  });
  it('passes forbidden nested JSON keys unchanged to authoritative rejection',async()=>{
    const original=JSON.parse(JSON.stringify(envelope).replace('"patch":{','"patch":{"__proto__":{"private":"retained"},'));
    rpc.mockImplementation(async(name:string)=>({data:name==='train_custom_exercise_capabilities'?readiness(true):{status:'invalid_request'},error:null}));
    const response=await POST(request(original));
    expect(response.status).toBe(400);
    expect(Object.hasOwn(rpc.mock.calls.at(-1)?.[1].p_request.command.patch,'__proto__')).toBe(true);
  });
  it('does not expose another owner or treat infrastructure failure as a definitive rejection',async()=>{
    rpc.mockImplementation(async(name:string)=>({data:name==='train_custom_exercise_capabilities'?readiness(true):{status:'accepted',receipt:{...receipt,ownerId:id}},error:null}));
    let response=await POST(request(envelope));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({protocolVersion:1,error:{code:'unavailable'}});
    rpc.mockResolvedValue({data:null,error:{message:'private database body'}});
    response=await cookieCommand(request(envelope,false));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({protocolVersion:1,error:{code:'unavailable'}});
    expect((await POST(request(envelope,false))).status).toBe(401);
  });
  it('reads an owned archived unsupported definition without coercing its metadata or version',async()=>{
    const archived={...definition,archivedAt:'2026-10-25T10:00:00Z'};
    rpc.mockResolvedValueOnce({data:{status:'available',definitions:[archived],nextCursor:id},error:null})
      .mockResolvedValueOnce({data:{status:'available',definition:archived},error:null});
    const headers={Authorization:'Bearer fixture-session'};
    const page=await list(new Request(`https://example.test/api/mobile/train/exercises?after=${operationId}`,{headers}));
    expect(await page.json()).toEqual({protocolVersion:1,definitions:[archived],nextCursor:id});
    expect(rpc).toHaveBeenNthCalledWith(1,'read_train_custom_exercises',{p_id:null,p_after:operationId});
    const item=await detail(new Request('https://example.test',{headers}),{params:Promise.resolve({id})});
    expect(await item.json()).toEqual({protocolVersion:1,definition:archived});
  });
  it('exposes the jointly frozen create receipt and command without inventing a replacement identity',async()=>{
    getUser.mockResolvedValue({data:{user:{id:contract.create.response.receipt.ownerId}},error:null});
    rpc.mockImplementation(async(name:string)=>({data:name==='train_custom_exercise_capabilities'?contract.capabilities.ready:{status:'accepted',receipt:contract.create.response.receipt},error:null}));
    expect(await (await POST(request(contract.create.request))).json()).toEqual(contract.create.response);
    expect(rpc).toHaveBeenLastCalledWith('execute_train_exercise_command',{p_request:contract.create.request});
  });
  it('adapts existing cookie route locations to commands and rejects unversioned or mismatched mutations',async()=>{
    const cookie=(body:unknown,method='POST')=>new NextRequest('https://example.test/api/exercises',{method,headers:{'X-Train-Owner':owner},body:JSON.stringify(body)});
    expect((await cookieUpdate(cookie(envelope,'PATCH'),{params:Promise.resolve({id})})).status).toBe(200);
    expect((await cookieUpdate(cookie(envelope,'PATCH'),{params:Promise.resolve({id:operationId})})).status).toBe(400);
    expect((await cookieUpdate(cookie({name:'Unversioned'},'PATCH'),{params:Promise.resolve({id})})).status).toBe(400);
    expect((await cookieCreate(cookie({name:'Unversioned'}))).status).toBe(400);
    const archive={...envelope,command:{kind:'archive',exerciseId:id,expectedVersion:'9007199254740992'}};
    const archived={...receipt,operation:'archive',definition:{...definition,archivedAt:'2026-10-25T10:00:00Z'}};
    rpc.mockResolvedValue({data:{status:'accepted',receipt:archived},error:null});
    expect(await (await cookieArchive(cookie(archive,'DELETE'),{params:Promise.resolve({id})})).json()).toEqual({protocolVersion:1,receipt:archived});
    expect(rpc).toHaveBeenLastCalledWith('execute_train_exercise_command',{p_request:archive});
    rpc.mockClear();
    const switched=new NextRequest('https://example.test/api/exercises',{method:'POST',headers:{'X-Train-Owner':id},body:JSON.stringify(envelope)});
    expect((await cookieCommand(switched)).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
    getUser.mockResolvedValue({data:{user:null},error:null});
    expect((await cookieArchive(cookie(archive,'DELETE'),{params:Promise.resolve({id})})).status).toBe(401);
  });
});
