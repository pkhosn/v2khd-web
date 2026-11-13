(function(root){
'use strict';
const b64=bytes=>btoa(String.fromCharCode(...bytes));
function newKey(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
function origin(value){const url=new URL(value);if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('请填写有效的 API 源地址，不含账号、查询参数或片段');return url.toString().replace(/\/$/,'');}
async function encode(value,mode,key,support){
 const data={api:origin(value)};
 const normalized=(typeof module!=='undefined'&&module.exports?require('./support-config.js'):root.SupportConfig).normalizeSupport(support);
 if(normalized)data.support=normalized;
 if(mode!=='aes-256-gcm')return data;
 if(!/^[A-Za-z0-9+/]{43}=$/.test(key||''))throw Error('加密密钥无效，请重新生成');
 const raw=Uint8Array.from(atob(key),c=>c.charCodeAt(0));
 const imported=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('v2khd.remote-config:v1'),tagLength:128},imported,new TextEncoder().encode(JSON.stringify(data)));
 return {format:'v2khd.remote-config',version:1,alg:'A256GCM',iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
root.RemoteConfig={newKey,encode};
})(globalThis);
