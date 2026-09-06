import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { actionScript } from './site.ts';
import type { ChainState } from './contract.ts';
const account='0x2222222222222222222222222222222222222222';
const contract='0x3333333333333333333333333333333333333333';
const hash='0x'+'a'.repeat(64);
function harness(mode: 'success'|'unknown'|'pending'|'rejected'|'account') {
 let click!:()=>Promise<void>, saved: string|null=null, selected=account;
 const attrs:Record<string,string>={'data-act':'claim','data-id':'1','data-owner':account};
 const button={textContent:'Claim',hidden:false,getAttribute:(k:string)=>attrs[k],setAttribute:(k:string,v:string)=>{attrs[k]=v},removeAttribute:(k:string)=>{delete attrs[k]},addEventListener:(_e:string,fn:()=>Promise<void>)=>{click=fn}};
 const out={textContent:'',insertAdjacentHTML(){}};
 const location={href:'https://one.onenft.click/'+account};
 let sends=0;
 runInNewContext(actionScript({address:contract,chainId:8453} as unknown as ChainState).replace(/^<script>\s*/,'').replace(/<\/script>$/,''), {
 document:{querySelectorAll:()=>[button],getElementById:()=>out}, URL,location,confirm:()=>false,
 setTimeout:(fn:()=>void)=>queueMicrotask(fn),localStorage:{getItem:()=>saved,setItem:(_k:string,v:string)=>{saved=v},removeItem:()=>{saved=null}},
 window:{ethereum:{on(){},request:async({method}: {method:string})=>{
 if(method==='eth_requestAccounts'||method==='eth_accounts')return [selected];
 if(method==='eth_chainId')return '0x2105';
 if(method==='wallet_switchEthereumChain'){if(mode==='account')selected=contract;return null;}
 if(method==='eth_sendTransaction'){sends++;if(mode==='unknown')throw new Error('RPC timeout https://secret.invalid/key');if(mode==='rejected')throw Object.assign(new Error('no'),{code:4001});return hash;}
 if(method==='eth_getTransactionReceipt')return mode==='pending'?null:{status:'0x1',blockNumber:'0x123'};
 throw new Error(method);
 }}}
 });
 return {click:()=>click(),get saved(){return saved},get sends(){return sends},out,location};
}
test('a confirmed action refreshes holdings at the receipt block',async()=>{const h=harness('success');await h.click();expect(h.sends).toBe(1);expect(h.saved).toBeNull();const url=new URL(h.location.href);expect(url.searchParams.get('refresh')).toBe('1');expect(url.searchParams.get('afterBlock')).toBe('291');});
test('an uncertain action send stays blocked on another click',async()=>{const h=harness('unknown');await h.click();await h.click();expect(h.sends).toBe(1);expect(JSON.parse(h.saved!).uncertain).toBe(true);expect(h.out.textContent).toContain('will not resend');expect(h.out.textContent).not.toContain('secret.invalid');});
test('a known pending action resumes checking without another transaction',async()=>{const h=harness('pending');await h.click();await h.click();expect(h.sends).toBe(1);expect(JSON.parse(h.saved!).hash).toBe(hash);expect(h.out.textContent).toContain('Check it before trying again');});
test('cancelled actions clear the pending marker',async()=>{const h=harness('rejected');await h.click();expect(h.saved).toBeNull();expect(h.out.textContent).toContain('Cancelled in the wallet');});
test('account changes during network switch prevent sending',async()=>{const h=harness('account');await h.click();expect(h.sends).toBe(0);expect(h.out.textContent).toContain('account changed');});
