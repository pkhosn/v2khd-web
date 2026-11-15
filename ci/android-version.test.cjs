'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {automaticAndroidVersion,validateBuildConfig}=require('../web/build-config.js');
test('one display version generates a stable Android counter above the historical default',()=>{
 const a=automaticAndroidVersion('1.0.6');assert.equal(a.versionName,'1.0.6');assert(a.versionCode>211115);assert.deepEqual(automaticAndroidVersion('1.0.6',a),a);assert(automaticAndroidVersion('1.0.7',a).versionCode>a.versionCode);
 assert(automaticAndroidVersion('1.10.0').versionCode>automaticAndroidVersion('1.9.999').versionCode);
 assert(automaticAndroidVersion('2.0.0').versionCode>automaticAndroidVersion('1.999.999').versionCode);
});
test('legacy high counters migrate once, retain signing options and permit later overwrite upgrades',()=>{
 const old={versionCode:900000000,signing:{alias:'existing-key'},packageName:'unchanged'};const a=automaticAndroidVersion('1.0.6',old);assert.equal(a.versionCode,900000001);assert.equal(a.signing.alias,old.signing.alias);assert.equal(a.packageName,old.packageName);assert.deepEqual(automaticAndroidVersion('1.0.6',a),a);
 const b=automaticAndroidVersion('1.0.7',a),c=automaticAndroidVersion('1.0.5',b);assert(b.versionCode>a.versionCode);assert(c.versionCode>b.versionCode);assert.equal(c.versionName,'1.0.5');assert.equal(old.versionCode,900000000);
 const rc=automaticAndroidVersion('2.0.0-rc.1');assert(automaticAndroidVersion('2.0.0',rc).versionCode>rc.versionCode);
});
test('malformed or exhausted internal counters fail before producing an un-upgradeable package',()=>{
 for(const code of [0,-1,1.5,'211115',2100000000])assert.throws(()=>automaticAndroidVersion('1.0.6',{versionCode:code}));
 for(const version of ['bad','1.1000.0','1.0.1000','2100.0.0'])assert.throws(()=>automaticAndroidVersion(version));
});
test('saving twice is stable; changing only the unified version updates internal Android metadata',()=>{
 const base=require('../web/brand-default.json'),first=validateBuildConfig({...structuredClone(base),version:'1.0.6'});assert.deepEqual(validateBuildConfig(first),first);
 const next=validateBuildConfig({...first,version:'1.0.7'});assert.equal(next.version,'1.0.7');assert.equal(next.android.versionName,next.version);assert(next.android.versionCode>first.android.versionCode);
});
test('small version button works for old brands with no Android section',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),handler=source.match(/\$\('#bump'\)\.onclick=(\(\)=>\{.*?\});\$\('#newBrand'\)/)[1];let filled=0,marked=0;const context={config:{version:'1.0.6'},fill:()=>filled++,mark:()=>marked++};vm.runInNewContext('('+handler+')()',context);assert.equal(context.config.version,'1.0.7');assert.equal(filled,1);assert.equal(marked,1);
});
