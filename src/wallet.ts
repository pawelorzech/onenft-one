/**
 * Wallet helpers shared by the pages: the address form, the connect script,
 * the download bar and its script. Copied from faces.onenft.click and kept in
 * step with the hub's wallet page, with "coin" as the unit.
 */
import { esc } from "./site.ts";

export const FILE_PREFIX = "one";
export const PIXEL = true;
export const SIZES = [1024, 2048, 4096];

export function whoBlock(canConnect: boolean): string {
  return `<div class="whobox"><div class="who">${canConnect ? `<button class="cta syne" id="connect" type="button">Connect wallet</button>` : ""}<form action="/go" method="get"><label for="who">Wallet address or ENS name</label><div class="line"><input class="field" id="who" name="who" placeholder="0x1234… or name.eth" autocomplete="off" spellcheck="false" required pattern="^\\s*(0x[0-9a-fA-F]{40}|[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)*\\.eth)\\s*$" title="A 42-character address starting with 0x, or an ENS name ending in .eth"><button class="cta ghost syne" type="submit">View wallet</button></div></form></div>
<p class="msg" id="msg" aria-live="polite"></p>
<p class="small" id="last" hidden>Last time here: <a href="/">…</a>.</p></div>`;
}
export function sizePicker(): string {
  return `<div class="dl" style="border:0;padding:0;margin:0"><span class="lab" id="sizelab">PNG and JPEG size</span><div class="sizes" role="group" aria-labelledby="sizelab">${SIZES.map((s) => `<button type="button" data-size="${s}" aria-pressed="${s === 2048}">${s}</button>`).join("")}</div></div>`;
}
/** The download bar under one coin. SVG is the file itself; PNG without JavaScript is a 1024 pixel PNG the server draws; JPEG needs JavaScript. */
export function downloadBar(id: number, bg: string): string {
  const d = `data-id="${id}" data-unit="coin" data-src="/coin/${id}.svg" data-bg="${bg}"`;
  return `<div class="dl"><span class="lab">Download coin ${id}</span><a class="btn" href="/coin/${id}.svg" download="${FILE_PREFIX}-coin-${id}.svg" aria-label="SVG of coin ${id}">SVG</a><a class="btn" href="/coin/${id}-1024.png" download="${FILE_PREFIX}-coin-${id}-1024.png" data-dl="png" ${d} aria-label="PNG of coin ${id}">PNG</a><a class="btn" href="/coin/${id}-1024.png" data-dl="jpeg" ${d} hidden data-js aria-label="JPEG of coin ${id}">JPEG</a><a class="btn" href="/api/coin/${id}">JSON</a><noscript><span class="small">JPEG needs JavaScript; the PNG link saves a 1024 pixel PNG.</span></noscript></div>`;
}
export function nameHeading(name: string): string {
  const size = name.length <= 11 ? "" : name.length <= 16 ? ' style="font-size:26px"' : ' style="font-size:20px;letter-spacing:-.02em"';
  return `<span class="wname"${size}>${esc(name).replace(/\./g, "<wbr>.")}</span>`;
}
export function goTarget(who: string | null, base = "/", back = "/yours"): string {
  const w = (who ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(w) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$/i.test(w)) return base + w;
  return `${back}?bad=${encodeURIComponent(w.slice(0, 80))}`;
}

export function connectScript(base = "/", entry = false): string {
  return `<script>
(function(){
var BASE=${JSON.stringify(base)};var ENTRY=${entry ? "true" : "false"};var KEY='onenft_who';var btn=document.getElementById('connect');var out=document.getElementById('msg');var last=document.getElementById('last');
function say(t){if(out)out.textContent=t}
function here(a){return location.pathname.toLowerCase()===(BASE+a).toLowerCase()}
function remember(a){try{localStorage.setItem(KEY,a)}catch(e){}}
function offer(a,label){if(!last||here(a))return;var l=last.querySelector('a');l.href=BASE+a;l.textContent=a.slice(0,6)+'\\u2026'+a.slice(-4);last.firstChild.textContent=label+': ';last.hidden=false}
var who=null;try{who=localStorage.getItem(KEY)}catch(e){}
if(who&&/^0x[0-9a-fA-F]{40}$/.test(who))offer(who,'Last time here');
if(!btn)return;var eth=window.ethereum;
if(!eth||!eth.request){btn.disabled=true;btn.textContent='No wallet detected';say('No wallet detected. Enter a public address to browse, or open this site in your wallet\\u2019s browser to connect.');return}
function known(accs){if(!accs||!accs.length){btn.textContent='Connect wallet';btn.onclick=null;btn.disabled=false;return}var a=accs[0];remember(a);if(here(a)){btn.textContent='This is your wallet';btn.disabled=true;return}if(ENTRY){location.replace(BASE+a);return}btn.textContent='Your wallet';btn.disabled=false;btn.onclick=function(){location.href=BASE+a};offer(a,'Connected')}
eth.request({method:'eth_accounts'}).then(known).catch(function(){});
if(eth.on){eth.on('accountsChanged',known);eth.on('disconnect',function(){known([])})}
btn.addEventListener('click',async function(){if(btn.onclick)return;btn.disabled=true;
  try{var accs=await eth.request({method:'eth_requestAccounts'});if(!accs||!accs.length)throw new Error('the wallet gave no account');var acc=accs[0];remember(acc);location.href=BASE+acc}
  catch(e){say(e&&e.code===4001?'Cancelled in the wallet.':e&&e.code===-32002?'The wallet is already asking. Open it to answer.':'Failed: '+((e&&e.message)||e));btn.disabled=false}});
})();
</script>`;
}
export function downloadScript(prefix = FILE_PREFIX, pixel = PIXEL): string {
  return `<script>
(function(){
var PREFIX=${JSON.stringify(prefix)};var PIXEL=${pixel ? "true" : "false"};var KEY='onenft_size';var SIZES=${JSON.stringify(SIZES)};
var size=2048;try{var s=+localStorage.getItem(KEY);if(SIZES.indexOf(s)>=0)size=s}catch(e){}
var out=document.getElementById('msg');function say(t){if(out)out.textContent=t}
var picks=document.querySelectorAll('.sizes button');
function paint(){picks.forEach(function(b){b.setAttribute('aria-pressed',String(+b.getAttribute('data-size')===size))})}
picks.forEach(function(b){b.addEventListener('click',function(){size=+b.getAttribute('data-size');try{localStorage.setItem(KEY,String(size))}catch(e){}paint()})});paint();
document.querySelectorAll('[data-js]').forEach(function(el){el.hidden=false});
function save(blob,name){var a=document.createElement('a');var u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},10000)}
function timeout(ms,what){return new Promise(function(_,no){setTimeout(function(){no(new Error(what+' took too long'))},ms)})}
var busy=false;
document.querySelectorAll('[data-dl]').forEach(function(el){el.addEventListener('click',async function(ev){
  ev.preventDefault();if(busy){say('One download at a time. The other one is still drawing.');return}
  var kind=el.getAttribute('data-dl');var n=el.getAttribute('data-id')||el.getAttribute('data-day');var unit=el.getAttribute('data-unit')||'face';var prefix=el.getAttribute('data-prefix')||PREFIX;
  var pixel=el.hasAttribute('data-pixel')?el.getAttribute('data-pixel')==='1':PIXEL;var bg=el.getAttribute('data-bg')||'#000000';
  busy=true;var was=el.textContent;el.textContent='\\u2026';el.setAttribute('aria-busy','true');say('');var u=null;
  try{
    var ctl=new AbortController();var t=setTimeout(function(){ctl.abort()},20000);
    var res;try{res=await fetch(el.getAttribute('data-src'),{signal:ctl.signal})}finally{clearTimeout(t)}
    if(!res.ok)throw new Error('the image answered '+res.status);var text=await res.text();
    if(kind==='svg'){save(new Blob([text],{type:'image/svg+xml'}),prefix+'-'+unit+'-'+n+'.svg');return}
    text=text.replace(/ width="\\d+" height="\\d+"/,' width="'+size+'" height="'+size+'"');
    u=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));var img=new Image();
    await Promise.race([new Promise(function(ok,no){img.onload=ok;img.onerror=function(){no(new Error('the browser could not draw the image'))};img.src=u}),timeout(20000,'drawing')]);
    if(img.decode){try{await img.decode()}catch(e){}}
    var c=document.createElement('canvas');c.width=size;c.height=size;var ctx=c.getContext('2d');if(!ctx)throw new Error('the browser gave no canvas');ctx.imageSmoothingEnabled=!pixel;
    if(kind==='jpeg'){ctx.fillStyle=bg;ctx.fillRect(0,0,size,size)}
    ctx.drawImage(img,0,0,size,size);
    var blob=await Promise.race([new Promise(function(ok){c.toBlob(ok,kind==='jpeg'?'image/jpeg':'image/png',0.92)}),timeout(30000,'encoding')]);
    if(!blob)throw new Error('the browser gave no file, try a smaller size');
    save(blob,prefix+'-'+unit+'-'+n+'-'+size+(kind==='jpeg'?'.jpg':'.png'));c.width=c.height=1;
  }catch(e){say('Download failed: '+((e&&e.name==='AbortError')?'the image took too long':((e&&e.message)||e)))}
  finally{if(u)URL.revokeObjectURL(u);el.textContent=was;el.removeAttribute('aria-busy');busy=false}
})});
})();
</script>`;
}
