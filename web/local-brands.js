(function(root){
'use strict';
class BrowserBrandStorage{
 constructor(indexedDB){this.db=new Promise((resolve,reject)=>{const req=indexedDB.open('v2khd-private-browser',1);req.onupgradeneeded=()=>req.result.createObjectStore('brands');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开浏览器本地数据库'));});}
 async getItem(key){const db=await this.db;return new Promise((resolve,reject)=>{const q=db.transaction('brands').objectStore('brands').get(key);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});}
 async setItem(key,value){const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('brands','readwrite');tx.objectStore('brands').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
}
const FORMAT='v2khd.brand-backup',KEY='v2khd.local-brands.v1';
class LocalBrandStore{
 constructor({storage,defaults,key=KEY}){this.storage=storage;this.defaults=defaults;this.key=key;}
 async load(){const text=await this.storage.getItem(this.key);if(!text)return {schemaVersion:1,brands:[{id:'default',label:this.defaults.productName,config:structuredClone(this.defaults),logo:'',updatedAt:null}],jobs:[],defaultLogo:'./default-logo.png'};const data=JSON.parse(text);if(data.schemaVersion!==1||!Array.isArray(data.brands)||!Array.isArray(data.jobs))throw Error('本地品牌数据损坏，请导入备份恢复');return data;}
 async write(data){try{await this.storage.setItem(this.key,JSON.stringify(data))}catch{throw Error('浏览器本地存储失败或空间不足，请先导出配置备份');}}
 async saveBrand({id,config,logo}){const validate=typeof module!=='undefined'&&module.exports?require('./build-config.js'):root.BuildConfig;config=validate.validateBuildConfig(config);const data=await this.load();id=id||crypto.randomUUID();const index=data.brands.findIndex(b=>b.id===id),old=data.brands[index];const brand={id,label:config.productName,config,logo:logo||old?.logo||'',updatedAt:old?.updatedAt||null};const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 if(old&&JSON.stringify(stable(old.config))===JSON.stringify(stable(config))&&old.logo===brand.logo)return {...old,changed:false};brand.updatedAt=new Date().toISOString();if(index<0)data.brands.push(brand);else data.brands[index]=brand;await this.write(data);return {...brand,changed:true};}
 async exportBrand(id){const b=(await this.load()).brands.find(b=>b.id===id);if(!b)throw Error('请先保存当前品牌');return {format:FORMAT,version:1,brand:{label:b.label,config:structuredClone(b.config),logo:b.logo||''}};}
 async importBrand(payload){if(!payload||payload.format!==FORMAT||payload.version!==1||!payload.brand?.config)throw Error('不是受支持的完整品牌备份 JSON');const b=payload.brand;if(b.logo&&(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.logo)||b.logo.length>7*1024*1024))throw Error('备份 Logo 格式或大小不正确');return this.saveBrand({id:crypto.randomUUID(),config:b.config,logo:b.logo});}
}
if(typeof module!=='undefined'&&module.exports)module.exports={LocalBrandStore,BrowserBrandStorage};else {root.LocalBrandStore=LocalBrandStore;root.BrowserBrandStorage=BrowserBrandStorage;}
})(globalThis);
