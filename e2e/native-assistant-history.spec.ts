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
