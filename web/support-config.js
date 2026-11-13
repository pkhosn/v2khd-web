(function(root){
'use strict';
function normalizeSupport(value){
 if(!value||value.provider==='none'||value.enabled===false)return null;
 if(typeof value!=='object'||!['crisp','custom','url'].includes(value.provider))throw Error('请选择 Crisp 或自建网页客服');
 if(typeof value.url!=='string'||value.url.length>4096)throw Error('请填写客服网页地址');
 let url;try{url=new URL(value.url.trim())}catch(_){throw Error('客服地址格式不正确')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('客服地址必须为不含账号密码的 HTTP(S) URL');
 if(value.provider==='crisp'&&(url.protocol!=='https:'||url.hostname!=='go.crisp.chat'||url.pathname!=='/chat/embed/'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(url.searchParams.get('website_id')||'')))throw Error('请填写含 Website ID 的 Crisp 聊天链接');
 return {provider:value.provider==='crisp'?'crisp':'custom',url:url.href};
}
function createController(environment){
 return {async open(external){const support=await environment.brandApi.getSupport();if(!support)throw Error('客服暂未配置，请稍后重试');return environment.require('electron').ipcRenderer.invoke('support-open',{url:support.url,external:external===true})}};
}
const api={normalizeSupport,createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportConfig=api;
})(globalThis);
