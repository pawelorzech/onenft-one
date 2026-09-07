import {expect,test} from 'bun:test';
import {runInNewContext} from 'node:vm';
import {mintScript} from './site.ts';
const A='0x'+'2'.repeat(40),C='0x'+'1'.repeat(40);
async function run(badRead=false,storageFailure=false){
 const calls:string[]=[];const nodes=new Map<string,any>();
 const node=(id:string)=>{if(!nodes.has(id))nodes.set(id,{value:'1',textContent:'',handlers:new Map(),hasAttribute:()=>true,setAttribute(){},getAttribute:(k:string)=>k==='data-units'?'5000000':'0',addEventListener(e:string,f:Function){this.handlers.set(e,f)}});return nodes.get(id)};
 runInNewContext(mintScript({address:C,chainId:8453,usdc:C,author:C,maxBatch:40,vrfFeeWei:1n} as any).replace(/^<script>\s*/,'').replace(/<\/script>$/,''),{
 document:{getElementById:node,querySelectorAll:(s:string)=>s==='.classes button'?[node('class')]:[]},
 window:{ethereum:{on(){},request:async({method}:{method:string})=>{calls.push(method);if(method==='eth_accounts'||method==='eth_requestAccounts')return[A];if(method==='eth_chainId')return'0x2105';if(method==='eth_sendTransaction')throw Object.assign(new Error('cancelled'),{code:4001});throw new Error('wallet RPC unsupported')}}},
 localStorage:{getItem:()=>null,setItem(){if(storageFailure)throw new Error('storage unavailable')},removeItem(){}},
 fetch:async(url:string)=>{calls.push(url);return{ok:!badRead,json:async()=>({chainId:8453,contract:C,value:'0x'+(10000000n).toString(16).padStart(64,'0')})}},AbortController,setTimeout,clearTimeout,
 });
 await Bun.sleep(1);await node('mint-btn').handlers.get('click')();return{calls,message:node('msg').textContent};
}
test('ONE mint reads USDC via scoped API without wallet eth_call or redundant switching',async()=>{const r=await run();expect(r.calls.filter(c=>c.startsWith('/api/token-read'))).toHaveLength(2);expect(r.calls).not.toContain('eth_call');expect(r.calls).not.toContain('wallet_switchEthereumChain');expect(r.calls).toContain('eth_sendTransaction')});
test('failed USDC read is not interpreted as zero balance and sends nothing',async()=>{const r=await run(true);expect(r.calls).not.toContain('eth_sendTransaction');expect(r.message).not.toContain('holds 0.00')});
test('storage failure prevents signing a transaction that could not be tracked',async()=>{const r=await run(false,true);expect(r.calls).not.toContain('eth_sendTransaction')});
