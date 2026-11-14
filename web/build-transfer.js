(function(root){
'use strict';
const b64=b=>{let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
async function encode(request){
 const bytes=new TextEncoder().encode(JSON.stringify(request));const packed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12)),k=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(request.id)},k,packed));const result={payload:b64(encrypted),key:b64(key),iv:b64(iv)};
 if(result.payload.length>60000){const e=Error('配置超过在线传输限制，请减小 Logo 体积或使用本机打包');e.code='BUILD_INPUT_TOO_LARGE';throw e;}return result;
}
async function prepare(request,approve){
 try{return await encode(request)}catch(e){if(e.code!=='BUILD_INPUT_TOO_LARGE')throw e;}
 const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Logo 图片无法解析'));img.src=request.logo;});
 for(const size of [512,256,128,64]){const ratio=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);let transfer;try{transfer=await encode({...request,logo:canvas.toDataURL('image/png')})}catch(e){if(e.code==='BUILD_INPUT_TOO_LARGE')continue;throw e;}
 if(!await approve('本次配置超过在线传输限制。是否仅为本次打包使用 '+canvas.width+' × '+canvas.height+' 的 Logo？浏览器中的原图和 JSON 备份保持不变；取消后可优化原图体积或使用本机打包。'))throw Error('已取消在线打包，原始品牌配置未改变');return transfer;
 }
 throw Error('配置超过在线传输限制，请使用本机打包');
}
root.BuildTransfer={encode,prepare};
})(globalThis);
