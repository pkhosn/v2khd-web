const COOKIE='__Host-v2khd_session',TTL=8*60*60;
const encode=new TextEncoder();
function base64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unbase64(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey('raw',encode.encode('v2khd-session-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function session(secret){const body=base64(encode.encode(JSON.stringify({exp:Math.floor(Date.now()/1000)+TTL,nonce:crypto.randomUUID()})));return body+'.'+base64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encode.encode(body))));}
async function validSession(value,secret){try{if(!value||value.length>512)return false;const parts=value.split('.');if(parts.length!==2)return false;const [body,sig]=parts;if(!await crypto.subtle.verify('HMAC',await key(secret),unbase64(sig),encode.encode(body)))return false;const data=JSON.parse(new TextDecoder().decode(unbase64(body))),now=Math.floor(Date.now()/1000);return Number.isInteger(data.exp)&&data.exp>now&&data.exp<=now+TTL&&typeof data.nonce==='string';}catch{return false;}}
async function equalCode(a,b){const hash=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(v)));const [x,y]=await Promise.all([hash(a),hash(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
function response(body,status=200,extra={}){return new Response(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});}
function login(message='',status=200){return response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>打包工作台 · 授权</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5f9;color:#17233b;font-family:system-ui,-apple-system,sans-serif;padding:24px}.card{width:100%;max-width:380px;padding:36px;background:white;border-radius:20px;box-shadow:0 12px 50px #17233b12}h1{font-size:24px;margin:0 0 12px}p{color:#67748a;font-size:14px;line-height:1.6}label{display:block;font-size:14px;margin-top:26px}input,button{width:100%;height:48px;border-radius:10px;font:inherit;margin-top:10px}input{border:1px solid #ccd3df;padding:0 14px}input:focus{outline:2px solid #1677ff}button{border:0;background:#1264d8;color:white;cursor:pointer;font-weight:600}.error{color:#c0392b;min-height:23px;margin-bottom:0}</style><main class="card"><h1>打包工作台</h1><p>输入授权码后进入</p><form method="post" action="/__auth/login"><label for="code">授权码</label><input id="code" name="code" type="password" required maxlength="512" autocomplete="current-password" autofocus placeholder="请输入授权码"><button type="submit">进入工作台</button><p class="error" role="status">${message}</p></form></main></html>`,status,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});}
async function smallBody(request){
 const reader=request.body?.getReader();if(!reader)return '';const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return null;}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),secret=env.BUILD_ACCESS_CODE;
  if(url.protocol!=='https:')return response(null,308,{Location:'https://'+url.host+url.pathname+url.search});
  if(typeof secret!=='string'||secret.length<12||secret.length>512)return response('管理员尚未设置授权码，请配置 BUILD_ACCESS_CODE（至少 12 位）。',503,{'Content-Type':'text/plain; charset=utf-8'});
  if(url.pathname==='/__auth/login'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return response('Forbidden',403);
   if(!env.LOGIN_RATE_LIMITER)return response('Authentication unavailable',503);
   const {success}=await env.LOGIN_RATE_LIMITER.limit({key:'v2khd-login:'+ (request.headers.get('CF-Connecting-IP')||'unknown')});
   if(!success)return login('尝试次数较多，请稍后再试。',429);
   if(Number(request.headers.get('content-length'))>4096)return response('Request too large',413);
   const text=await smallBody(request);if(text===null)return response('Request too large',413);
   const code=new URLSearchParams(text).get('code')||'';
   if(!await equalCode(code,secret))return login('授权码不正确，请重新输入。',401);
   return response(null,303,{Location:'/', 'Set-Cookie':`${COOKIE}=${await session(secret)}; Path=/; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Strict`});
  }
  if(url.pathname==='/__auth/logout'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return response('Forbidden',403);
   return response(null,303,{Location:'/', 'Set-Cookie':`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`});
  }
  const value=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!await validSession(value,secret))return url.pathname==='/'||url.pathname==='/login'?login():response('Authorization required',401);
  const result=await env.ASSETS.fetch(request);const headers=new Headers(result.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
 }
};
