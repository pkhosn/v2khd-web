(function(root){
'use strict';
const targetDetails={
 'mac-arm64':{name:'macOS',detail:'Apple Silicon · DMG',arch:'arm64',selected:true},
 'mac-x64':{name:'macOS',detail:'Intel · DMG',arch:'x64',selected:true},
 'win-x64':{name:'Windows',detail:'安装向导 · EXE',arch:'x64',selected:true},
 'android-arm':{name:'Android',detail:'ARM64 + ARM32 手机通用 · APK',arch:'2 ARM ABI',selected:true}
};
const buildTargets=Object.freeze(Object.keys(targetDetails));
// Historical downloads/expiry cleanup must still recognize earlier split APKs.
const artifactTargets=Object.freeze([...buildTargets,'android-arm64','android-arm32','android']);
const androidAbis=Object.freeze({'android-arm':'arm'});
function buildTarget(target){
 if(!buildTargets.includes(target))throw Error('Invalid target');
 const abi=androidAbis[target];
 if(abi)return {os:'macos-15',abi,artifactSuffix:'-android-arm.apk'};
 const [platform,arch]=target.split('-');
 return {os:platform==='win'?'windows-2022':arch==='x64'?'macos-15-intel':'macos-15',platform,arch,runtime:platform==='mac'?'webview':'electron',coreTarget:platform+'-'+arch,artifactSuffix:'-'+target+(platform==='mac'?'.dmg':'.exe')};
}
function normalizeAppId(value){
 if(typeof value!=='string'||!value.trim())throw Error('请填写应用标识，例如 com.example.client');
 const id=value.trim();
 if(/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*){1,}$/.test(id))return id;
 if(/^[A-Za-z][\w]*$/.test(id))return 'com.'+id+'.client';
 throw Error('应用标识格式不正确：使用英文字母、数字和点，例如 com.baimaoyun.client；每段以字母开头');
}
function validateBuildConfig(raw){
 if(!raw||typeof raw!=='object')throw Error('缺少品牌配置');
 const c=JSON.parse(JSON.stringify(raw));c.appId=normalizeAppId(c.appId);
 if(typeof c.productName!=='string'||!c.productName.trim()||c.productName.length>64||/[<>:"/\\|?*\x00-\x1f]/.test(c.productName)||/[. ]$/.test(c.productName)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(c.productName))throw Error('软件名称不能为空，且不能包含文件名禁用字符');
 if(typeof c.version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z.-]+)?$/.test(c.version)||c.version.split(/[.-]/).slice(0,3).some(x=>Number(x)>65535))throw Error('版本格式不正确，例如 4.1.1');
 const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw Error(label+'必须为 '+min+'–'+max+' 的整数');};
 integer(c.proxy?.port??7890,1024,65535,'代理端口');integer(c.android?.versionCode??211115,1,2100000000,'Android 构建号');
 integer(c.nodes?.refreshIntervalMinutes??0,0,10080,'节点更新间隔');
 if(c.nodes?.refreshOnStartup!==undefined&&typeof c.nodes.refreshOnStartup!=='boolean')throw Error('启动更新节点必须为开关值');
 if(c.login?.branding!==undefined&&!['name','logo'].includes(c.login.branding))throw Error('登录页显示必须选择品牌名或 logo');
 if(!['direct','objectStorage'].includes(c.api?.mode))throw Error('请选择 API 模式');
 const value=c.api.mode==='direct'?c.api.origin:c.api.objectStorageUrl;let u;try{u=new URL(value)}catch{throw Error('请填写有效的 API 或对象存储地址');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw Error('API 或对象存储地址必须为不含账号密码和片段的 HTTP(S) URL');
 integer(c.api.configRefreshSeconds??60,15,86400,'远程配置检查间隔');
 const path=c.api.path??'/api/v1';if(typeof path!=='string'||!/^\/(?:[A-Za-z0-9._~-]+\/?)*$/.test(path)||path.includes('..'))throw Error('API 路径格式不正确，例如 /api/v1');
 if(!['none','aes-256-gcm'].includes(c.api.remoteConfigEncryption||'none'))throw Error('请选择支持的远程配置加密方式');
 if(c.api.remoteConfigEncryption==='aes-256-gcm'&&!/^[A-Za-z0-9+/]{43}=$/.test(c.api.remoteConfigKey||''))throw Error('加密配置缺少有效密钥，请重新选择加密并保存');
 if(c.api.remoteSupport){const support=(typeof module!=='undefined'&&module.exports?require('./support-config.js'):root.SupportConfig).normalizeSupport(c.api.remoteSupport);if(support){let remote;try{remote=new URL(c.api.objectStorageUrl)}catch{throw Error('请填写用于下发客服的远程配置 JSON 地址')}if(remote.hostname==='example.invalid')throw Error('请把示例远程配置地址替换为实际对象存储地址');c.api.remoteSupport=support;}}
 if(c.api.mode==='direct'&&c.api.objectStorageUrl){const remote=new URL(c.api.objectStorageUrl);if(!['http:','https:'].includes(remote.protocol)||remote.username||remote.password||remote.hash)throw Error('远程配置地址格式不正确');}
 for(const key of ['primary','background','onPrimary'])if(!/^#[\da-fA-F]{6}$/.test(c.theme?.[key]||''))throw Error('品牌颜色格式不正确');
 return c;
}
const api={normalizeAppId,validateBuildConfig,buildTargets,artifactTargets,androidAbis,targetDetails,buildTarget};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BuildConfig=api;
})(globalThis);
