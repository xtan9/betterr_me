import {test,expect} from '@playwright/test';

test('native history reaches bearer authentication without a cookie login redirect',async({playwright,baseURL})=>{
 const client=await playwright.request.newContext({baseURL,storageState:{cookies:[],origins:[]}});
 try{
  const preflight=await client.fetch('/api/mobile/assistant/history',{method:'OPTIONS',maxRedirects:0,headers:{Origin:'http://localhost:8082','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}});
  expect(preflight.status()).toBe(204);expect(preflight.headers()['access-control-allow-origin']).toBe('*');
  const response=await client.get('/api/mobile/assistant/history',{maxRedirects:0});
  expect(response.status()).toBe(401);expect(await response.json()).toEqual({error:'unauthorized'});
 }finally{await client.dispose();}
});

test('execution and reminder routes reach their own auth without browser cookies',async({playwright,baseURL})=>{
 const client=await playwright.request.newContext({baseURL,storageState:{cookies:[],origins:[]}});
 try{
  for(const path of ['/api/mobile/execution','/api/mobile/execution/settings']){
   const preflight=await client.fetch(path,{method:'OPTIONS',maxRedirects:0,headers:{Origin:'http://localhost:8082','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
   expect(preflight.status()).toBe(204);expect(preflight.headers()['access-control-allow-origin']).toBe('*');
  }
  const execution=await client.post('/api/mobile/execution',{maxRedirects:0,data:{operation:'window',consent:true}});
  expect(execution.status()).toBe(401);expect(await execution.json()).toEqual({error:'unauthorized'});
  const settings=await client.get('/api/mobile/execution/settings',{maxRedirects:0});
  expect(settings.status()).toBe(401);expect(await settings.json()).toEqual({error:'unauthorized'});
  const dispatch=await client.get('/api/cron/assistant-reminders',{maxRedirects:0});
  expect([401,503]).toContain(dispatch.status());expect(dispatch.headers().location).toBeUndefined();
 }finally{await client.dispose();}
});
