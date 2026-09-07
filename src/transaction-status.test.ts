import { expect, test } from "bun:test";
import { transactionApi } from "./transaction-status.ts";
const address="0x"+"1".repeat(40), token="0x"+"2".repeat(40), hash="0x"+"a".repeat(64);
const url=(path:string)=>new URL("https://site.test"+path+(path.includes("?")?"&":"?")+"chainId=8453&contract="+address);
test("receipts are no-store and scoped to the configured chain and contract",async()=>{
 const api=transactionApi({address,chainId:8453},{receipt:async()=>({status:"0x1",logs:[]}),usdc:async()=>token,call:async()=>null});
 const response=(await api(url('/api/transaction/'+hash)))!;
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect((await response.json()).receipt.status).toBe('0x1');
 expect((await api(new URL('https://site.test/api/transaction/'+hash)))!.status).toBe(409);
 expect((await api(url('/api/transaction/bad')))!.status).toBe(400);
});
test("unavailable receipt is unknown, while RPC errors are 503 without private details",async()=>{
 for(const error of [false,true]){
 const api=transactionApi({address,chainId:8453},{receipt:async()=>{if(error)throw new Error('https://private-rpc/key');return null;},usdc:async()=>token,call:async()=>null});
 const r=(await api(url('/api/transaction/'+hash)))!;expect(r.status).toBe(error?503:200);expect(await r.text()).not.toContain('private-rpc');
 }
});
test("USDC reads reject arbitrary targets, selectors, spender and malformed results",async()=>{
 let calls=0,value:unknown='0x'+'0'.repeat(64);
 const api=transactionApi({address,chainId:8453,tokenReads:true},{receipt:async()=>null,usdc:async()=>token,call:async()=>{calls++;return value;}});
 const read=(to:string,data:string)=>api(url('/api/token-read?to='+to+'&data='+data));
 const balance='0x70a08231'+token.slice(2).padStart(64,'0');
 expect((await read(token,balance))!.status).toBe(200);
 expect((await read(address,balance))!.status).toBe(400);
 expect((await read(token,'0xdeadbeef'))!.status).toBe(400);
 expect((await read(token,'0xdd62ed3e'+token.slice(2).padStart(64,'0')+token.slice(2).padStart(64,'0')))!.status).toBe(400);
 expect(calls).toBe(1);value='0x';expect((await read(token,balance))!.status).toBe(503);
});


test("failed primary RPC falls back to another endpoint for receipts", async () => {
 let first=0,second=0;
 const a=Bun.serve({port:0,fetch:()=>{first++;return new Response('unavailable',{status:503})}});
 const b=Bun.serve({port:0,fetch:async req=>{second++;const j=await req.json();return Response.json({jsonrpc:'2.0',id:j.id,result:{status:'0x1',blockNumber:'0x123',logs:[],transactionHash:hash,gasUsed:'0x1',cumulativeGasUsed:'0x1',effectiveGasPrice:'0x1',transactionIndex:'0x0',type:'0x2'}})}});
 try{
  const api=transactionApi({address,chainId:8453,rpcUrls:[`http://localhost:${a.port}`,`http://localhost:${b.port}`]});
  const r=(await api(url('/api/transaction/'+hash)))!;
  expect(r.status).toBe(200);expect((await r.json()).receipt.status).toBe('0x1');expect(first).toBe(1);expect(second).toBe(1);
 }finally{a.stop(true);b.stop(true)}
});
