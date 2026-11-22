/* Local profiles. The password locks this browser; it is not a server account. */
(() => {
  const KEY='mlg.accounts.v2', LEGACY='mlg.account.v1', store=window.MLGStorage;
  const finance=/^\/financeiro(?:\/|$)/.test(location.pathname);
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}};
  let registry=read();
  if(!registry){
    let old;try{old=JSON.parse(localStorage.getItem(LEGACY)||'null');}catch{}
    const migrated=old?.salt&&old?.passwordHash?{...old,id:crypto.randomUUID()}:null;
    registry={version:2,legacyOwner:migrated?.id||null,profiles:migrated?[migrated]:[]};
    localStorage.setItem(KEY,JSON.stringify(registry));
  }
  let profile=registry.profiles.find(p=>p.id===sessionStorage.getItem('mlg.activeProfile'))||registry.profiles.find(p=>p.id===localStorage.getItem('mlg.lastProfile'))||registry.profiles[0]||null;
  let started=false,auth=null,lastTouch=0,epoch=0;
  if(profile)store?.bind(profile.id,registry.legacyOwner);
  const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  async function derive(password,salt){
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    return encode(await crypto.subtle.deriveBits({name:'PBKDF2',salt:decode(salt),iterations:310000,hash:'SHA-256'},key,256));
  }
  function touch(force=false){const now=Date.now();if(force||now-lastTouch>1000){sessionStorage.setItem('mlg.lastActive',String(now));lastTouch=now;}}
  function isUnlocked(){return profile&&sessionStorage.getItem('mlg.unlocked')===profile.salt&&(!sessionStorage.getItem('mlg.activeProfile')||sessionStorage.getItem('mlg.activeProfile')===profile.id)&&Date.now()-Number(sessionStorage.getItem('mlg.lastActive')||0)<(profile.idleMinutes||15)*60000;}
  function invalidate(){epoch++;sessionStorage.removeItem('mlg.unlocked');document.documentElement.classList.add('mlg-locked');window.dispatchEvent(new Event('mlg-session-lock'));}
  function enter(next=profile){
    sessionStorage.setItem('mlg.activeProfile',next.id);localStorage.setItem('mlg.lastProfile',next.id);
    sessionStorage.setItem('mlg.unlocked',next.salt);touch(true);
    if(started&&next.id!==profile?.id){document.documentElement.classList.add('mlg-locked');location.reload();return false;}
    profile=next;registry=read();store?.bind(profile.id,registry.legacyOwner);
    document.documentElement.classList.remove('mlg-locked','mlg-boot');return true;
  }
  function persist(next){
    const fresh=read(),index=fresh.profiles.findIndex(p=>p.id===next.id);
    if(index<0)throw Error('Este perfil foi removido. Reabra o MLG.');
    fresh.profiles[index]=next;localStorage.setItem(KEY,JSON.stringify(fresh));registry=fresh;profile=next;
    if(next.id===fresh.legacyOwner)localStorage.setItem(LEGACY,JSON.stringify(next));
    // The profile is the source of truth; a full cache must not undo a saved profile.
    try{(store||localStorage).setItem('profilePicData',next.photo||'');(store||localStorage).setItem('userBio',next.bio||'');}catch{}
    window.dispatchEvent(new Event('mlg-profile-change'));
  }
  function nameAvailable(name,id){return !(read()?.profiles||[]).some(p=>p.id!==id&&p.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));}
  function avatar(element,p){
    element.replaceChildren();element.classList.add('mlg-avatar');
    const img=document.createElement('img');img.src=p?.photo||'/assets/logo.png?v=2';img.alt='';element.append(img);
    if(p?.emoji){const bubble=document.createElement('span');bubble.className='mlg-avatar-emoji';bubble.textContent=p.emoji;element.append(bubble);}
    element.style.setProperty('--presence',MLGProfile.statuses[p?.presence||'online']?.[1]||'#36c990');
  }
  function passwordDialog(title,cancellable=false,allowAccounts=true){
    if(auth){if(!cancellable){auth.cancellable=false;auth.dialog.querySelector('[data-cancel]')?.setAttribute('hidden','');}return auth.promise;}
    let resolve;const promise=new Promise(r=>resolve=r),d=document.createElement('dialog');d.className='mlg-dialog mlg-auth-gate';
    const task={dialog:d,promise,cancellable};auth=task;
    let chosen=profile,registration=!chosen,step=1,photo=()=>'';
    const finish=result=>{if(auth===task)auth=null;d.close();d.remove();resolve(result);};
    d.oncancel=e=>{e.preventDefault();if(task.cancellable)finish(false);};
    function render(){
      epoch++;
      d.innerHTML='<form class="mlg-account-form mlg-auth-card"><a class="mlg-auth-brand" href="/" aria-label="Página inicial MLG"><img src="/assets/logo.png?v=2" alt=""><span>Mlg.<small>my life graphs</small></span></a><div class="mlg-auth-content"></div><p data-error role="status" aria-live="polite"></p><div class="mlg-auth-footer">Seu espaço pessoal. Salvo neste navegador.</div></form>';
      const form=d.querySelector('form'),content=d.querySelector('.mlg-auth-content');
      if(registration){
        content.innerHTML='<div class="mlg-auth-heading"><span class="mlg-auth-eyebrow">UM NOVO COMEÇO · <b data-step>1 / 2</b></span><h1>Seu espaço. Seu ritmo.</h1><p>Crie um perfil com dados separados neste navegador.</p></div><fieldset data-first><label>Nome de usuário<input name="username" autocomplete="username" minlength="2" maxlength="60" required placeholder="Como podemos chamar você?"></label><div data-photo></div></fieldset><fieldset data-second hidden disabled><label>Crie sua senha<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Pelo menos 8 caracteres" required></label><label>Confirme a senha<input name="confirm" type="password" autocomplete="new-password" required></label><p class="mlg-password-warning">Não há recuperação de senha. Se esquecer, será preciso excluir este perfil e seus dados para recomeçar. Guarde a senha e exporte backups.</p><label class="mlg-ack"><input name="understood" type="checkbox" required> Entendi e vou guardar minha senha.</label></fieldset><button class="mlg-primary" type="submit">Continuar <span aria-hidden="true">→</span></button><button type="button" data-back class="mlg-auth-link">Já tenho um perfil · Entrar</button>';
        photo=MLGProfile.photoPicker(content.querySelector('[data-photo]'));step=1;
        content.querySelector('[data-back]').hidden=!read().profiles.length;
        content.querySelector('[data-back]').onclick=()=>{if(step===2){setStep(1);return;}registration=false;chosen=read().profiles[0];render();};
      }else{
        content.innerHTML='<div class="mlg-auth-portrait"></div><div class="mlg-auth-heading"><span class="mlg-auth-eyebrow"></span><h1></h1><p></p></div><label data-chooser>Perfil neste navegador<select name="account" aria-label="Escolher perfil"></select></label><label>Senha<div class="mlg-password-field"><input name="password" type="password" autocomplete="current-password" required placeholder="Digite sua senha"><button type="button" data-reveal aria-label="Mostrar senha">Mostrar</button></div></label><button type="button" data-forgot class="mlg-forgot">Esqueci minha senha</button><button type="submit" class="mlg-primary">Entrar <span aria-hidden="true">→</span></button><div class="mlg-auth-links"><button type="button" data-register class="mlg-auth-link">Registre-se</button><button type="button" data-cancel class="mlg-auth-link">Cancelar</button></div>';
        avatar(content.querySelector('.mlg-auth-portrait'),chosen);
        content.querySelector('.mlg-auth-eyebrow').textContent=title;
        content.querySelector('h1').textContent='Olá, '+chosen.name.split(' ')[0]+'.';
        content.querySelector('.mlg-auth-heading p').textContent=finance?'Seu financeiro, com tudo no lugar.':'Bom ter você por aqui.';
        const select=content.querySelector('select');(read()?.profiles||[]).forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;select.append(o);});select.value=chosen.id;
        content.querySelector('[data-chooser]').hidden=!allowAccounts||select.options.length<2;
        select.onchange=()=>{chosen=read().profiles.find(p=>p.id===select.value);render();};
        content.querySelector('[data-reveal]').onclick=()=>{const input=form.elements.password,show=input.type==='password';input.type=show?'text':'password';content.querySelector('[data-reveal]').textContent=show?'Ocultar':'Mostrar';content.querySelector('[data-reveal]').setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');};
        content.querySelector('[data-forgot]').onclick=()=>MLGProfile.forgotPassword(chosen.id);
        content.querySelector('[data-register]').hidden=!allowAccounts;
        content.querySelector('[data-register]').onclick=()=>{registration=true;render();};
        content.querySelector('[data-cancel]').hidden=!task.cancellable;
        content.querySelector('[data-cancel]').onclick=()=>finish(false);
      }
      function setStep(next){step=next;form.querySelector('[data-first]').hidden=step!==1;form.querySelector('[data-first]').disabled=step!==1;form.querySelector('[data-second]').hidden=step!==2;form.querySelector('[data-second]').disabled=step!==2;form.querySelector('[data-step]').textContent=step+' / 2';form.querySelector('[type=submit]').textContent=step===1?'Continuar →':'Criar perfil e entrar';form.querySelector('[data-back]').textContent=step===2?'← Voltar':'Já tenho um perfil · Entrar';form.querySelector('[data-back]').hidden=step===1&&!read().profiles.length;form.querySelector(step===1?'[name=username]':'[name=password]').focus();}
      form.onsubmit=async e=>{
        e.preventDefault();const button=form.querySelector('[type=submit]'),error=form.querySelector('[data-error]'),attempt=epoch;error.textContent='';button.disabled=true;
        try{
          if(registration){
            const name=form.elements.username.value.trim();
            if(name.length<2)throw Error('Digite seu nome de usuário.');
            if(!nameAvailable(name))throw Error('Já existe um perfil com esse nome. Escolha outro nome.');
            if(step===1){setStep(2);return;}
            const password=form.elements.password.value;
            if(password.length<8)throw Error('Use pelo menos 8 caracteres.');
            if(password!==form.elements.confirm.value)throw Error('As senhas não coincidem.');
            if(!form.elements.understood.checked)throw Error('Confirme que guardará sua senha.');
            const salt=encode(crypto.getRandomValues(new Uint8Array(16))),passwordHash=await derive(password,salt);
            if(attempt!==epoch||(finance&&document.hidden))throw Error('A sessão foi bloqueada. Tente novamente com esta aba aberta.');
            const next={id:crypto.randomUUID(),name,photo:photo(),emoji:'',message:'',bio:'',presence:'online',idleMinutes:15,salt,passwordHash,createdAt:new Date().toISOString()};
            const fresh=read();if(!nameAvailable(name))throw Error('Já existe um perfil com esse nome.');
            if(!fresh.profiles.length&&!fresh.legacyOwner&&store?.hasLegacyData())fresh.legacyOwner=next.id;
            fresh.profiles.push(next);localStorage.setItem(KEY,JSON.stringify(fresh));
            if(enter(next))finish(true);
          }else{
            const fresh=read().profiles.find(p=>p.id===chosen.id);if(!fresh)throw Error('Este perfil foi removido. Reabra o MLG.');
            const ok=await derive(form.elements.password.value,fresh.salt)===fresh.passwordHash;
            if(attempt!==epoch||(finance&&document.hidden))throw Error('A sessão foi bloqueada. Digite sua senha novamente.');
            if(!ok)throw Error('Senha incorreta. Tente novamente.');
            if(read().profiles.find(p=>p.id===fresh.id)?.passwordHash!==fresh.passwordHash)throw Error('A senha foi alterada. Tente novamente.');
            if(enter(fresh))finish(true);
          }
        }catch(err){error.textContent=err.name==='QuotaExceededError'?'O armazenamento está cheio. Libere espaço ou exporte um backup.':err.message;}
        finally{button.disabled=false;}
      };
    }
    render();document.body.append(d);d.showModal();return promise;
  }
  function lock(title='Sessão bloqueada por inatividade'){
    invalidate();document.querySelectorAll('dialog[open]:not(.mlg-auth-gate)').forEach(d=>d.close());
    return passwordDialog(title,false,true);
  }
  const ready=new Promise(resolve=>{
    async function start(){
      if(finance||!isUnlocked())await lock(profile?(finance?'Acessar Financeiro':'Entrar no MLG'):'Criar seu perfil');else enter();
      started=true;resolve(profile);
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  });
  window.MLGAccount={
    ready,get profile(){return profile;},get profiles(){return (read()?.profiles||[]).map(p=>({id:p.id,name:p.name}));},
    async unlock(title='Desbloquear Financeiro',force=false){await ready;if(!force&&isUnlocked())return true;return passwordDialog(title,true,false);},
    lock:()=>lock('Entrar no MLG'),openSettings:()=>{if(isUnlocked())MLGProfile.openSettings();},
    async updateProfile(values,currentPassword,newPassword){
      if(!isUnlocked())throw Error('Desbloqueie seu perfil para salvar.');const attempt=epoch;
      let salt=profile.salt,passwordHash=profile.passwordHash;
      if(newPassword){if(newPassword.length<8||newPassword.length>128)throw Error('Use de 8 a 128 caracteres.');if(await derive(currentPassword,salt)!==passwordHash)throw Error('Senha atual incorreta.');salt=encode(crypto.getRandomValues(new Uint8Array(16)));passwordHash=await derive(newPassword,salt);}
      if(attempt!==epoch||!isUnlocked())throw Error('A sessão foi bloqueada. Desbloqueie para salvar.');
      const next={...profile,salt,passwordHash};
      for(const key of ['name','bio','photo','presence','idleMinutes','emoji','message'])if(Object.hasOwn(values,key))next[key]=values[key];
      next.name=String(next.name).trim().slice(0,60);if(next.name.length<2||!nameAvailable(next.name,next.id))throw Error('Escolha um nome diferente para este perfil.');
      next.bio=String(next.bio||'').slice(0,240);next.message=String(next.message||'').trim().slice(0,120);
      next.emoji=MLGProfile.normalizeEmoji(next.emoji);if(!MLGProfile.statuses[next.presence])next.presence='online';
      next.idleMinutes=[1,5,15,30,60].includes(Number(next.idleMinutes))?Number(next.idleMinutes):15;
      persist(next);enter();
    },
    updatePhoto(photo){if(!isUnlocked())return;persist({...profile,photo});},
    deleteProfile(id=profile?.id){
      const fresh=read();if(!fresh.profiles.some(p=>p.id===id))return;
      invalidate();fresh.profiles=fresh.profiles.filter(p=>p.id!==id);localStorage.setItem(KEY,JSON.stringify(fresh));
      store?.removeProfileData(id);if(fresh.legacyOwner===id)localStorage.removeItem(LEGACY);
      if(sessionStorage.getItem('mlg.activeProfile')===id)sessionStorage.removeItem('mlg.activeProfile');
      if(localStorage.getItem('mlg.lastProfile')===id)localStorage.removeItem('mlg.lastProfile');
      location.href='/';
    },
    exportProfile(){return {version:2,exportedAt:new Date().toISOString(),profile:{...profile},storage:store?store.snapshot():{}};},
    renderAvatar:avatar,
    renderBadge(element){
      if(!element||!profile)return;element.replaceChildren();element.classList.add('mlg-profile-badge');
      const photo=document.createElement('span');avatar(photo,profile);
      const info=document.createElement('span');info.className='mlg-profile-info';const name=document.createElement('strong');name.textContent=profile.name;info.append(name);
      if(profile.message){const message=document.createElement('small');message.textContent=profile.message;info.append(message);}
      element.append(photo,info);element.title=profile.name+(profile.message?' · '+profile.message:'')+' · Meu perfil';element.dataset.mlgBadge='true';
      element.setAttribute('aria-label',element.title);element.onclick=e=>{e.preventDefault();MLGAccount.openSettings();};element.style.setProperty('--presence',MLGProfile.statuses[profile.presence||'online'][1]);
    }
  };
  function checkIdle(){if(started&&profile&&!auth&&!isUnlocked())lock();}
  ['pointerdown','keydown','wheel','touchstart'].forEach(type=>document.addEventListener(type,()=>{if(!started||!profile)return;checkIdle();if(!auth&&isUnlocked())touch();},{passive:true}));
  document.addEventListener('visibilitychange',()=>{if(finance&&document.hidden){if(document.readyState!=='loading')lock('Desbloqueie para continuar');else invalidate();}else checkIdle();});
  window.addEventListener('pagehide',()=>{if(finance)invalidate();});window.addEventListener('pageshow',e=>{if(finance&&e.persisted)lock('Acessar Financeiro');});
  setInterval(checkIdle,15000);
  window.addEventListener('mlg-profile-change',()=>document.querySelectorAll('[data-mlg-badge]').forEach(el=>MLGAccount.renderBadge(el)));
  window.addEventListener('storage',e=>{if(e.key!==KEY||!profile)return;const next=read()?.profiles.find(p=>p.id===profile.id);if(!next){invalidate();location.href='/';return;}const changed=next.passwordHash!==profile.passwordHash;profile=next;window.dispatchEvent(new Event('mlg-profile-change'));if(changed)lock('Sua senha foi alterada');else checkIdle();});
})();
