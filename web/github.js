'use strict';
// No tokens are embedded in the published site or saved to browser storage.
class GitHubBuildClient {
 constructor({repository,token,fetcher=globalThis.fetch.bind(globalThis),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){if(!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('仓库格式应为 owner/repo');this.repository=repository;this.token=GitHubBuildClient.cleanToken(token);this.fetcher=fetcher;this.sleep=sleep;this.branch=null;this.cached=null;this.cacheAt=0;this.logos=new Map();this.statePending=null;this.completedJobs=new Map();this.logs=new Map();this.retryAt=0}
 static cleanToken(value){
 if(typeof value!=='string')throw Error('请输入 GitHub Token');
 const token=value.replace(/[\u200B-\u200D\uFEFF]/g,'').trim().replace(/^Bearer\s+/i,'').replace(/^["“‘']|["”’']$/g,'').trim();
 if(!token||!/^[A-Za-z0-9_.-]+$/.test(token))throw Error('GitHub Token 格式不正确：请粘贴原始 Token，不含中文、说明文字或空格');
 return token;
 }
 rateError(){const error=Error('GitHub API 已限流，将于 '+new Date(this.retryAt).toLocaleTimeString('zh-CN',{hour12:false})+' 后重试');error.status=429;error.retryAt=this.retryAt;return error}
 async request(route,options={}){if(Date.now()<this.retryAt)throw this.rateError();const target=(!options.method||options.method==='GET')?route+(route.includes('?')?'&':'?')+'_t='+Date.now():route;const r=await this.fetcher('https://api.github.com/repos/'+this.repository+target,{cache:'no-store',...options,signal:options.signal||AbortSignal.timeout(options.raw?600000:30000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+this.token,...options.headers}});if(!r.ok){let d;try{d=await r.json()}catch{}const reset=Number(r.headers.get('x-ratelimit-reset'))*1000,retry=Number(r.headers.get('retry-after'));if((r.status===403||r.status===429)&&(r.headers.get('x-ratelimit-remaining')==='0'||r.status===429||/rate limit/i.test(d?.message||''))){this.retryAt=Math.max(Date.now()+1000,r.headers.get('x-ratelimit-remaining')==='0'&&Number.isFinite(reset)&&reset>Date.now()?reset:Date.now()+(retry>0?retry:60)*1000);throw this.rateError();}const error=Error(r.status===401?'GitHub 授权已失效，请重新连接':r.status===404?'无法访问仓库或工作流，请检查仓库名及授权范围':r.status===403?'GitHub 拒绝访问，请检查权限、账户额度及 API 频率限制':(d?.message||'GitHub 请求失败')+' ('+r.status+')');error.status=r.status;throw error}if(r.status===204)return null;return options.raw?r:r.json()}
 encode(text){const bytes=new TextEncoder().encode(text);let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result)}
 decode(text){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
 async file(name){const r=await this.request('/contents/'+name+'?ref='+encodeURIComponent(this.branch),{cache:'no-store',headers:{Accept:'application/vnd.github.raw+json'},raw:true});return JSON.parse(await r.text())}
 async write(name,value,message){let sha;try{const old=await this.request('/contents/'+name+'?ref='+encodeURIComponent(this.branch)+'&t='+Date.now(),{cache:'no-store',headers:{Accept:'application/vnd.github.object+json'}});if(typeof old.sha!=='string'||!/^[a-f0-9]{40}$/i.test(old.sha))throw Error('无法读取文件版本，请刷新页面后重试');sha=old.sha}catch(e){if(e.status!==404)throw e}return this.request('/contents/'+name,{method:'PUT',body:JSON.stringify({message,branch:this.branch,...(sha?{sha}:{}),content:this.encode(JSON.stringify(value,null,2))}),headers:{'Content-Type':'application/json'}})}
 async connect(){const repo=await this.request('');if(!repo.permissions?.push)throw Error('当前授权没有该仓库写入权限');this.branch=repo.default_branch;await this.request('/actions/workflows/build-client.yml');return this}
 async metadata(){return this.file('.build-studio/state.json')}
 async state(force=false){if(this.statePending)return this.statePending;if(!force&&this.cached)return this.expire(this.cached);this.statePending=this.loadState(force).finally(()=>{this.statePending=null});return this.statePending}
 expire(state){for(const j of state.jobs){if(Date.now()-Date.parse(j.createdAt)>=86400000||j.artifacts.some(a=>a.expiredAt&&Date.now()>=Date.parse(a.expiredAt))){j.artifacts=[];j.status='interrupted';j.step='安装包已过24小时保存期限，请重新打包';}}return state}
 async mapJobs(rows,fn){let next=0;const result=[];await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(next<rows.length){const index=next++;result[index]=await fn(rows[index]);}}));return result}
 async loadState(checkJobs=true){const data=await this.metadata();const recent=(data.jobs||[]).slice(0,50).filter(j=>Date.now()-Date.parse(j.createdAt)<86400000);const runs=checkJobs&&recent.length?(await this.request('/actions/workflows/build-client.yml/runs?per_page=100')).workflow_runs:[];
 const jobs=await this.mapJobs((data.jobs||[]).slice(0,50),async j=>{const run=runs.find(r=>r.display_title==='build-'+j.id);const out={...j,artifacts:[],status:'queued',step:'等待 GitHub 分配构建任务'};
 if(Date.now()-Date.parse(j.createdAt)>=86400000){out.status='interrupted';out.step='安装包已过24小时保存期限，请重新打包';return out}
 if(!checkJobs){out.status='unknown';out.step='点击“检查构建状态”获取最新进度';return out}
 if(!run){const age=Date.now()-Date.parse(j.createdAt);if(age>=24*60*60*1000){out.status='interrupted';out.step='安装包已过24小时保存期限，请重新打包';}else if(age>300000){out.status='interrupted';out.step='未找到构建任务，请检查 Actions 是否已启用';}return out}
 out.runUrl=run.html_url;out.runId=run.id;out.status=run.status==='completed'?(run.conclusion==='success'?'success':run.conclusion==='cancelled'?'interrupted':'failed'):run.status==='queued'?'queued':'running';out.step=out.status==='success'?'云端打包完成':out.status==='failed'?'云端构建失败，请查看 GitHub 日志':'GitHub '+run.status;
 if(run.status==='completed'&&run.conclusion!=='success')return out;
 const cachedJob=this.completedJobs.get(j.id);if(run.status==='completed'&&cachedJob?.runId===run.id&&Date.now()-cachedJob.at<600000)return this.expire({jobs:[structuredClone(cachedJob.value)]}).jobs[0];
 if(run.status==='completed'){const rows=(await this.request('/actions/runs/'+run.id+'/artifacts?per_page=100')).artifacts;out.artifacts=rows.filter(a=>!a.expired&&(!a.created_at||Date.now()-Date.parse(a.created_at)<24*60*60*1000)&&j.targets.includes(a.name)).map(a=>({name:a.name+'.zip',target:a.name,bytes:a.size_in_bytes,sha256:(a.digest||'').replace(/^sha256:/,''),artifactId:a.id,expiredAt:a.created_at?new Date(Date.parse(a.created_at)+24*60*60*1000).toISOString():a.expires_at}));
 for(const target of j.targets.filter(target=>!out.artifacts.some(a=>a.target===target))){try{const tag='build-'+j.id+'-'+target+'-'+run.id,release=await this.request('/releases/tags/'+encodeURIComponent(tag)),asset=release.assets.find(a=>a.name===target+'.zip'&&a.state==='uploaded');const expiresAt=Date.parse(release.published_at)+24*60*60*1000;if(asset&&Date.now()<expiresAt)out.artifacts.push({name:asset.name,target,bytes:asset.size,sha256:(asset.digest||'').replace(/^sha256:/,''),releaseAssetId:asset.id,expiredAt:new Date(expiresAt).toISOString()});}catch(error){if(error.status!==404)throw error;}}
 if(out.status==='success'&&out.artifacts.length!==j.targets.length){out.status='interrupted';out.step='安装包不存在或已过24小时保存期限，请重新打包'}}
 if(run.status==='completed')this.completedJobs.set(j.id,{runId:run.id,at:Date.now(),value:structuredClone(out)});return out});
 const result={brands:data.brands.map(b=>{this.logos.set(b.id,b.logo||data.defaultLogo);return b}),jobs,engine:{ready:true,version:'GitHub Actions',cloud:true},targets:['mac-arm64','mac-x64','win-x64','android']};this.cached=result;this.cacheAt=Date.now();return result}
 async saveBrand({id,config,logo}){const data=await this.metadata();id=id||crypto.randomUUID();const index=data.brands.findIndex(b=>b.id===id);const brand={id,label:config.productName,config,logo:logo||data.brands[index]?.logo||data.defaultLogo,updatedAt:new Date().toISOString()};if(index<0)data.brands.push(brand);else data.brands[index]=brand;await this.write('.build-studio/state.json',data,'Save brand '+id);this.logos.set(id,brand.logo);this.cached=null;return brand}
 async build({brandId,targets}){const data=await this.metadata(),brand=data.brands.find(b=>b.id===brandId);if(!brand)throw Error('品牌不存在');const allowed=['mac-arm64','mac-x64','win-x64','android'];if(!Array.isArray(targets)||!targets.length||targets.some(t=>!allowed.includes(t)))throw Error('请选择有效平台');const id=crypto.randomUUID(),request={id,config:brand.config,logo:brand.logo||data.defaultLogo};
 await this.write('.build-studio/requests/'+id+'.json',request,'Create build snapshot '+id);
 // Record before dispatch so a completed dispatch remains discoverable if the browser closes.
 data.jobs.unshift({id,brandId,productName:brand.config.productName,version:brand.config.version,targets:[...new Set(targets)],createdAt:new Date().toISOString()});await this.write('.build-studio/state.json',data,'Queue build '+id);
 await this.request('/actions/workflows/build-client.yml/dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:this.branch,inputs:{request_id:id,targets:JSON.stringify([...new Set(targets)])}})});this.cached=null;return{id}}
 async log(id){const s=await this.state(true),j=s.jobs.find(j=>j.id===id);if(!j?.runId)return{log:j?.status==='interrupted'?'任务已过保存期限。历史日志可在 GitHub Actions 查看：https://github.com/'+this.repository+'/actions/workflows/build-client.yml':'等待 GitHub 分配任务…'};const cachedLog=this.logs.get(j.runId);if(cachedLog&&(cachedLog.done||Date.now()-cachedLog.at<30000))return cachedLog.value;const rows=(await this.request('/actions/runs/'+j.runId+'/jobs?per_page=100')).jobs;const value={log:rows.map(x=>x.name+' · '+x.status+(x.conclusion?' / '+x.conclusion:'')+'\n'+(x.steps||[]).map(s=>'  '+s.name+' · '+(s.conclusion||s.status)).join('\n')).join('\n\n')+'\n\n完整日志：'+j.runUrl};this.logs.set(j.runId,{at:Date.now(),done:!['queued','running'].includes(j.status),value});return value}
 async download(id,index,onProgress=()=>{}){
 const state=await this.state(),asset=state.jobs.find(j=>j.id===id)?.artifacts[index];
 if(!asset||asset.expiredAt&&Date.now()>=Date.parse(asset.expiredAt))throw Error('安装包已过24小时保存期限，请重新打包');
 const kind=asset.releaseAssetId?'release':'artifact',assetId=asset.releaseAssetId||asset.artifactId;
 if(!/^\d{1,20}$/.test(String(assetId)))throw Error('Invalid installer identity');
 const path='.build-studio/download-links/'+kind+'-'+assetId+'.json';
 const read=async()=>{let ticket;try{ticket=await this.file(path)}catch(e){if(e.status===404)return null;throw e;}
 if(ticket.kind!==kind||ticket.assetId!==assetId||ticket.bytes!==asset.bytes||ticket.name!==asset.name)throw Error('下载信息不匹配，请重新检查构建状态');
 if(!Number.isFinite(Date.parse(ticket.expiresAt))||Date.parse(ticket.expiresAt)<=Date.now()+15000)return null;
 if(asset.sha256&&ticket.sha256!==asset.sha256)throw Error('安装包校验信息不匹配');
 const url=new URL(ticket.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||!(url.hostname==='release-assets.githubusercontent.com'||/^productionresultssa\d+\.blob\.core\.windows\.net$/.test(url.hostname))||ticket.url.includes(this.token))throw Error('下载地址校验失败');
 return {url:url.href,name:ticket.name,sha256:ticket.sha256,expiresAt:ticket.expiresAt};};
 const existing=await read();if(existing)return existing;
 onProgress('正在准备安全下载链接…');
 await this.request('/actions/workflows/prepare-download.yml/dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:this.branch,inputs:{kind,asset_id:String(assetId)}})});
 // Only runs while the user has explicitly requested this download.
 for(let attempt=0;attempt<24;attempt++){await this.sleep(5000);const ticket=await read();if(ticket)return ticket;}
 throw Error('下载链接准备超时，请稍后再次点击下载，或查看下载准备工作流');
 }
}
if(typeof module!=='undefined')module.exports={GitHubBuildClient};
