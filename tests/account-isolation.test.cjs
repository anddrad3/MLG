const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const storageFactory=require('../assets/js/storage.js');
const PASSWORD='FictionalTestOnly!';
function sample(id,name){const salt=crypto.randomBytes(16);return {id,name,photo:'',bio:'',emoji:'😎',message:'Tudo certo',presence:'online',idleMinutes:15,salt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync(PASSWORD,salt,310000,32,'sha256').toString('base64')};}
const A=sample('profile-a','Conta A'),B=sample('profile-b','Conta B');
async function account(t,{finance=false,legacy=false}={}){
  const vc=new VirtualConsole();vc.on('jsdomError',error=>{if(!/navigation/.test(error.message))throw error;});
  const dom=new JSDOM('<html class="mlg-boot"><body><main>Dados privados</main></body></html>',{url:'http://localhost/'+(finance?'financeiro/':''),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});t.after(()=>dom.window.close());const w=dom.window;
  Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.TextEncoder=TextEncoder;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let hidden=false;Object.defineProperty(w.document,'hidden',{configurable:true,get:()=>hidden});
  const registry={version:2,legacyOwner:A.id,profiles:[A,B]};
  if(legacy){const {id,...old}=A;w.localStorage.setItem('mlg.account.v1',JSON.stringify(old));}
  else w.localStorage.setItem('mlg.accounts.v2',JSON.stringify(registry));
  w.localStorage.setItem('financialControlState',JSON.stringify({owner:'A',data:'original'.repeat(1000)}));
  w.localStorage.setItem('mlg.user.'+B.id+'.financialControlState',JSON.stringify({owner:'B'}));
  w.localStorage.setItem('mlg.user.'+B.id+'.mlg.notes.v1','Somente B');
  w.sessionStorage.setItem('mlg.unlocked',A.salt);w.sessionStorage.setItem('mlg.lastActive',String(Date.now()));
  if(!legacy)w.sessionStorage.setItem('mlg.activeProfile',A.id);
  await new Promise(resolve=>w.document.readyState==='loading'?w.document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
  ['storage','profile','account'].forEach(name=>w.eval(fs.readFileSync('assets/js/'+name+'.js','utf8')));
  if(!finance)await w.MLGAccount.ready;
  return {w,registry:()=>JSON.parse(w.localStorage.getItem('mlg.accounts.v2')),setHidden(value){hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},async submit(password=PASSWORD){const form=w.document.querySelector('.mlg-auth-gate form');form.elements.password.value=password;await form.onsubmit({preventDefault(){}});}};
}
test('legacy account migration keeps original financial bytes and does not duplicate financial cache',async t=>{
  const {w,registry}=await account(t,{legacy:true}),original=w.localStorage.getItem('financialControlState');
  assert.equal(registry().profiles.length,1);assert.equal(registry().legacyOwner,w.MLGAccount.profile.id);
  assert.equal(w.MLGStorage.getItem('financialControlState'),original);
  assert.equal(w.localStorage.getItem('mlg.user.'+w.MLGAccount.profile.id+'.financialControlState'),null);
  w.MLGStorage.setItem('mlg.notes.v1','Nota legada');assert.equal(w.localStorage.getItem('mlg.notes.v1'),'Nota legada');
});
test('per-profile adapter isolates financial data and notes and rejects writes after deletion',async t=>{
  const {w}=await account(t),a=w.MLGStorage,b=storageFactory(w.localStorage);b.bind(B.id,A.id);
  const before=a.getItem('financialControlState');assert.equal(b.getItem('mlg.notes.v1'),'Somente B');assert.equal(a.getItem('mlg.notes.v1'),null);
  b.setItem('financialControlState','{"owner":"B","changed":true}');assert.equal(a.getItem('financialControlState'),before);
  const exported=w.MLGAccount.exportProfile();assert.equal(exported.storage.financialControlState,before);assert.equal(JSON.stringify(exported).includes('Somente B'),false);
  w.MLGAccount.deleteProfile(B.id);
  assert.equal(w.localStorage.getItem('financialControlState'),before);assert.equal(w.localStorage.getItem('mlg.user.'+B.id+'.financialControlState'),null);
  assert.throws(()=>b.setItem('financialControlState','resurrected'),/removido/);
});
test('finance always authenticates on entry and locks immediately when hidden until password succeeds',async t=>{
  const a=await account(t,{finance:true}),w=a.w;
  assert.equal(w.sessionStorage.getItem('mlg.unlocked'),null);assert.ok(w.document.querySelector('.mlg-auth-gate'));
  await a.submit();await w.MLGAccount.ready;assert.equal(w.document.documentElement.classList.contains('mlg-locked'),false);
  a.setHidden(true);assert.equal(w.sessionStorage.getItem('mlg.unlocked'),null);assert.equal(w.document.documentElement.classList.contains('mlg-locked'),true);
  a.setHidden(false);assert.ok(w.document.querySelector('.mlg-auth-gate'));await a.submit('wrong');assert.equal(w.document.documentElement.classList.contains('mlg-locked'),true);
  await a.submit();assert.equal(w.document.documentElement.classList.contains('mlg-locked'),false);
});
test('a password verification started before leaving the tab cannot unlock on completion',async t=>{
  const a=await account(t,{finance:true}),w=a.w,pending=a.submit();a.setHidden(true);await pending;
  assert.equal(w.sessionStorage.getItem('mlg.unlocked'),null);assert.equal(w.document.documentElement.classList.contains('mlg-locked'),true);
  a.setHidden(false);await a.submit();await w.MLGAccount.ready;assert.equal(w.document.documentElement.classList.contains('mlg-locked'),false);
});
test('password change in progress is rejected when the finance tab is hidden',async t=>{
  const a=await account(t,{finance:true}),w=a.w;await a.submit();await w.MLGAccount.ready;
  const oldHash=w.MLGAccount.profile.passwordHash,pending=w.MLGAccount.updateProfile({name:'Alterado'},PASSWORD,'NewFictionalTest!');a.setHidden(true);
  await assert.rejects(pending,/bloqueada/);assert.equal(w.MLGAccount.profile.passwordHash,oldHash);assert.equal(w.MLGAccount.profile.name,A.name);
});
test('an unrelated profile update does not switch active data and a current password change locks the session',async t=>{
  const {w,registry}=await account(t);let r=registry();r.profiles[1].name='Outro perfil atualizado';w.localStorage.setItem('mlg.accounts.v2',JSON.stringify(r));
  w.dispatchEvent(new w.StorageEvent('storage',{key:'mlg.accounts.v2'}));assert.equal(w.MLGAccount.profile.id,A.id);assert.equal(w.MLGStorage.activeId,A.id);assert.equal(w.document.querySelector('.mlg-auth-gate'),null);
  r=registry();r.profiles[0].passwordHash='changed';w.localStorage.setItem('mlg.accounts.v2',JSON.stringify(r));w.dispatchEvent(new w.StorageEvent('storage',{key:'mlg.accounts.v2'}));
  assert.ok(w.document.querySelector('.mlg-auth-gate'));assert.equal(w.sessionStorage.getItem('mlg.unlocked'),null);
});
test('switching the selected account during password verification cannot open the previous account',async t=>{
  const a=await account(t,{finance:true}),w=a.w,pending=a.submit();
  const select=w.document.querySelector('[name=account]');select.value=B.id;select.onchange();await pending;
  assert.equal(w.sessionStorage.getItem('mlg.unlocked'),null,'stale authentication must be discarded');
  assert.ok(w.document.querySelector('.mlg-auth-gate'));await a.submit();await w.MLGAccount.ready;
  assert.equal(w.MLGAccount.profile.id,B.id);assert.equal(w.MLGStorage.activeId,B.id);assert.equal(w.MLGStorage.getItem('mlg.notes.v1'),'Somente B');
});
