const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{JSDOM}=require('jsdom');
async function account(t){
 const dom=new JSDOM('<html><body><main>Local data</main></body></html>',{url:'http://localhost/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.TextEncoder=TextEncoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const salt=crypto.randomBytes(16),profile={name:'Teste',photo:'',presence:'online',idleMinutes:1,salt:salt.toString('base64'),passwordHash:crypto.pbkdf2Sync('OriginalTest!',salt,310000,32,'sha256').toString('base64')};
 w.localStorage.setItem('mlg.account.v1',JSON.stringify(profile));w.localStorage.setItem('financialControlState','{"unchanged":true}');w.sessionStorage.setItem('mlg.unlocked',profile.salt);w.sessionStorage.setItem('mlg.lastActive',String(Date.now()));
 w.eval(fs.readFileSync('assets/js/profile.js','utf8'));w.eval(fs.readFileSync('assets/js/account.js','utf8'));await w.MLGAccount.ready;return w;
}
test('profile and password change preserve financial cache and reject incorrect current password',async t=>{
 const w=await account(t);await assert.rejects(w.MLGAccount.updateProfile({name:'Novo'},'wrong','NewTestPassword!'),/incorreta/);assert.equal(w.MLGAccount.profile.name,'Teste');
 const oldHash=w.MLGAccount.profile.passwordHash;await w.MLGAccount.updateProfile({name:'Novo',presence:'busy'},'OriginalTest!','NewTestPassword!');assert.notEqual(w.MLGAccount.profile.passwordHash,oldHash);assert.equal(w.MLGAccount.profile.name,'Novo');assert.equal(w.localStorage.getItem('financialControlState'),'{"unchanged":true}');
 const badge=w.document.createElement('button');w.MLGAccount.renderBadge(badge);assert.match(badge.style.getPropertyValue('--presence'),/#/);assert.match(badge.textContent,/Novo/);
});
test('expired session hides app and requires existing password; closing profile permits reopening',async t=>{
 const w=await account(t);w.MLGAccount.openSettings();w.document.querySelector('.mlg-settings').close();w.MLGAccount.openSettings();assert.equal(w.document.querySelectorAll('.mlg-settings').length,1);w.document.querySelector('.mlg-settings').close();
 w.sessionStorage.setItem('mlg.lastActive',String(Date.now()-61000));w.document.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(w.document.documentElement.classList.contains('mlg-locked'),true);assert.equal(w.sessionStorage.getItem('mlg.unlocked'),null);assert.match(w.document.querySelector('dialog').textContent,/inatividade/);
 const form=w.document.querySelector('dialog form');form.querySelector('input').value='OriginalTest!';await form.onsubmit({preventDefault(){}});assert.equal(w.document.documentElement.classList.contains('mlg-locked'),false);
});
