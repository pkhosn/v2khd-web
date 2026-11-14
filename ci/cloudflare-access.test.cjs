'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const worker=()=>import('./cloudflare/worker.mjs');const secret='test-only-code-123456';
function env(extra={}){return {BUILD_ACCESS_CODE:secret,LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('private app')},...extra};}
function req(path='/',options={}){return new Request('https://build.example.com'+path,options);}
function post(code=secret,origin='https://build.example.com'){return req('/__auth/login',{method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code})});}
async function cookie(w,e){const r=await w.fetch(post(),e);assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);return r.headers.get('set-cookie').split(';')[0];}
test('No secret or weak secret fails closed',async()=>{const {default:w}=await worker();for(const code of [undefined,'short'])assert.equal((await w.fetch(req(),env({BUILD_ACCESS_CODE:code}))).status,503);});
test('Unauthenticated visitors see only code form; scripts and forged cookies are blocked',async()=>{const {default:w}=await worker();let calls=0;const e=env({ASSETS:{fetch:()=>{calls++;return new Response('private')}}});const r=await w.fetch(req(),e);assert.equal(r.status,200);assert.match(await r.text(),/输入授权码后进入/);for(const path of ['/app.js','/cloud.js','/index.html'])assert.equal((await w.fetch(req(path),e)).status,401);assert.equal((await w.fetch(req('/app.js',{headers:{cookie:'__Host-v2khd_session=fake.fake'}}),e)).status,401);assert.equal(calls,0);});
test('Wrong code, cross-site login and rate-limited attempts do not issue sessions',async()=>{const {default:w}=await worker();for(const [r,e,status] of [[post('incorrect'),env(),401],[post(secret,'https://attacker.example'),env(),403],[post(),env({LOGIN_RATE_LIMITER:{limit:async()=>({success:false})}}),429],[post(),env({LOGIN_RATE_LIMITER:null}),503]]){const out=await w.fetch(r,e);assert.equal(out.status,status);assert.equal(out.headers.get('set-cookie'),null);}});
test('Correct code grants signed session without exposing code; rotating code invalidates it',async()=>{const {default:w}=await worker();const e=env(),c=await cookie(w,e);assert.ok(!c.includes(secret));const r=await w.fetch(req('/app.js',{headers:{cookie:c}}),e);assert.equal(r.status,200);assert.equal(await r.text(),'private app');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal((await w.fetch(req('/app.js',{headers:{cookie:c}}),env({BUILD_ACCESS_CODE:'another-secret-1234'}))).status,401);});
test('Expired and tampered sessions are rejected',async()=>{const {default:w}=await worker();const c=await cookie(w,env());assert.equal((await w.fetch(req('/app.js',{headers:{cookie:c+'x'}}),env())).status,401);const crypto=require('node:crypto'),body=Buffer.from(JSON.stringify({exp:1,nonce:'expired'})).toString('base64url'),sig=crypto.createHmac('sha256','v2khd-session-v1:'+secret).update(body).digest('base64url');assert.equal((await w.fetch(req('/app.js',{headers:{cookie:'__Host-v2khd_session='+body+'.'+sig}}),env())).status,401);});
test('Logout expires the browser cookie and cross-site logout is blocked',async()=>{const {default:w}=await worker();const r=await w.fetch(req('/__auth/logout',{method:'POST',headers:{origin:'https://build.example.com'}}),env());assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await w.fetch(req('/__auth/logout',{method:'POST',headers:{origin:'https://attacker.example'}}),env())).status,403);});
test('Default and legacy deploy configs use the same protected worker without managing existing DNS',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
 const files=[path.join(root,'wrangler.jsonc'),path.join(root,'ci/cloudflare/wrangler.jsonc')];
 for(const file of files){const c=JSON.parse(fs.readFileSync(file));assert.equal(c.name,'v2khd-web');assert.equal(c.workers_dev,true);assert.equal(c.preview_urls,false);assert.equal(c.routes,undefined);assert.equal(c.assets.run_worker_first,true);assert.equal(path.resolve(path.dirname(file),c.main),path.join(root,'ci/cloudflare/worker.mjs'));assert.equal(path.resolve(path.dirname(file),c.assets.directory),path.join(root,'web'));assert.equal(c.ratelimits[0].name,'LOGIN_RATE_LIMITER');}
});
test('Login page preserves same-origin form Origin instead of causing an opaque Origin',async()=>{
 const {default:w}=await worker(),e=env(),page=await w.fetch(req(),e);
 // Fetch's append-Origin algorithm serializes navigation POST Origin as null with no-referrer.
 assert.equal(page.headers.get('referrer-policy'),'same-origin');
 const origin=page.headers.get('referrer-policy')==='no-referrer'?'null':new URL('https://build.example.com/').origin;
 const loggedIn=await w.fetch(post(secret,origin),e);assert.equal(loggedIn.status,303);
 for(const badOrigin of ['null','https://attacker.example'])assert.equal((await w.fetch(post(secret,badOrigin),e)).status,403);
});
