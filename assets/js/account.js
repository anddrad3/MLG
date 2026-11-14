/* Local account. Password verification is a device lock, not a server login. */
(() => {
  const KEY = 'mlg.account.v1';
  let profile;
  let locking=null, lastTouch=0;
  try { profile = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { profile = null; }
  const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  async function derive(password, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return encode(await crypto.subtle.deriveBits({name:'PBKDF2', salt:decode(salt), iterations:310000, hash:'SHA-256'}, key, 256));
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(profile)); localStorage.setItem('profilePicData',profile.photo||''); window.dispatchEvent(new Event('mlg-profile-change')); }
  function touch(){const now=Date.now();if(now-lastTouch>1000){sessionStorage.setItem('mlg.lastActive',String(now));lastTouch=now;}}
  function isUnlocked(){return profile && sessionStorage.getItem('mlg.unlocked')===profile.salt && Date.now()-Number(sessionStorage.getItem('mlg.lastActive')||0)<(profile.idleMinutes||15)*60000;}
  function enter(){sessionStorage.setItem('mlg.unlocked',profile.salt);touch();document.documentElement.classList.remove('mlg-locked','mlg-boot');}
  function lock(title='Sessão bloqueada por inatividade'){if(locking)return locking;sessionStorage.removeItem('mlg.unlocked');document.documentElement.classList.add('mlg-locked');window.dispatchEvent(new Event('mlg-session-lock'));locking=passwordDialog(title,false).finally(()=>locking=null);return locking;}
  function passwordDialog(title, cancellable = true) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'mlg-dialog';
      dialog.innerHTML = '<form class="mlg-account-form"><h2></h2><label>Sua senha<input type="password" autocomplete="current-password" required></label><p role="status"></p><div class="mlg-form-actions"><button type="button" data-cancel>Cancelar</button><button class="mlg-primary">Desbloquear</button></div></form>';
      dialog.querySelector('h2').textContent = title;
      const finish = result => {dialog.close(); dialog.remove(); resolve(result);};
      dialog.querySelector('[data-cancel]').hidden = !cancellable;
      dialog.querySelector('[data-cancel]').onclick = () => finish(false);
      dialog.oncancel = event => {event.preventDefault(); if (cancellable) finish(false);};
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const button = dialog.querySelector('.mlg-primary');
        button.disabled = true;
        try {
          const ok = await derive(dialog.querySelector('input').value, profile.salt) === profile.passwordHash;
          if (ok) {enter(); finish(true);}
          else dialog.querySelector('[role=status]').textContent = 'Senha incorreta.';
        } catch {dialog.querySelector('[role=status]').textContent = 'Não foi possível verificar a senha.';}
        finally {button.disabled = false;}
      };
      document.body.append(dialog); dialog.showModal();
    });
  }
  async function photoData(file) {
    if (!file) return '';
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8e6) throw new Error('Escolha PNG, JPG ou WebP de até 8 MB.');
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 256, 256);
    bitmap.close(); return canvas.toDataURL('image/webp', .85);
  }
  function createAccount() {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'mlg-dialog mlg-onboarding';
      dialog.innerHTML = `<form class="mlg-account-form">
        <img src="/assets/logo.png" class="mlg-brand-image" alt="Logo MLG">
        <div><h1>MLG</h1><p class="mlg-subtitle">my life graphs</p></div>
        <div><h2>Seu espaço começa aqui.</h2><p>Crie sua conta neste navegador.</p></div>
        <label>Nome de usuário<input name="username" autocomplete="username" minlength="2" maxlength="60" placeholder="Como podemos chamar você?" required></label>
        <div data-photo-picker></div>
        <label>Senha dos aplicativos<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Pelo menos 8 caracteres" required></label>
        <label>Confirme a senha<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label>
        <p role="status" aria-live="polite"></p><button class="mlg-primary">Criar conta e entrar</button>
        <small>Perfil e finanças ficam neste navegador. Limpar os dados do site os remove; exporte seus dados para manter uma cópia.</small>
      </form>`;
      dialog.oncancel = event => event.preventDefault();
      const chosenPhoto=MLGProfile.photoPicker(dialog.querySelector('[data-photo-picker]'));
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget, fields = form.elements, button = form.querySelector('.mlg-primary');
        button.disabled = true;
        try {
          if (fields.password.value !== fields.confirm.value) throw new Error('As senhas não coincidem.');
          if (fields.username.value.trim().length < 2) throw new Error('Digite seu nome de usuário.');
          const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
          profile = {name:fields.username.value.trim(), photo:chosenPhoto(), presence:'online', idleMinutes:15, salt, passwordHash:await derive(fields.password.value, salt), createdAt:new Date().toISOString()};
          persist();
          if (profile.photo) localStorage.setItem('profilePicData', profile.photo);
          enter();
          dialog.close(); dialog.remove(); resolve(profile);
        } catch (error) {form.querySelector('[role=status]').textContent = error.message;}
        finally {button.disabled = false;}
      };
      document.body.append(dialog); dialog.showModal();
    });
  }
  const ready = new Promise(resolve => {
    const start = async () => {
      if (!profile?.salt || !profile?.passwordHash) await createAccount();
      else if(!isUnlocked()) await lock('Entrar no MLG');
      else enter();
      resolve(profile);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
  });
  window.MLGAccount = {
    ready,
    get profile() {return profile;},
    async unlock(title = 'Desbloquear Financeiro', force = false) {
      await ready;
      if (!force && isUnlocked()) return true;
      return passwordDialog(title);
    },
    lock:()=>lock('Entrar no MLG'),
    openSettings:()=>MLGProfile.openSettings(),
    async updateProfile(values,currentPassword,newPassword){
      let salt=profile.salt,passwordHash=profile.passwordHash;
      if(newPassword){if(newPassword.length<8)throw Error('Use pelo menos 8 caracteres.');if(await derive(currentPassword,salt)!==passwordHash)throw Error('Senha atual incorreta.');salt=encode(crypto.getRandomValues(new Uint8Array(16)));passwordHash=await derive(newPassword,salt);}
      profile={...profile,...values,salt,passwordHash};persist();enter();
    },
    updatePhoto(photo) {profile.photo = photo; persist();},
    renderBadge(element) {
      if (!element) return;
      element.replaceChildren(); element.classList.add('mlg-profile-badge');
      const photo = document.createElement('img'); photo.src = profile.photo || '/assets/logo.png'; photo.alt = '';
      const name = document.createElement('span'); name.textContent = profile.name;
      element.append(photo, name); element.title = 'Meu perfil · MLG'; element.dataset.mlgBadge='true';
      element.onclick=e=>{e.preventDefault();MLGProfile.openSettings();};
      element.style.setProperty('--presence',MLGProfile.statuses[profile.presence||'online'][1]);
    }
  };
  function checkIdle(){if(profile&&!locking&&!isUnlocked())lock();}
  ['pointerdown','keydown','wheel','touchstart'].forEach(type=>document.addEventListener(type,()=>{if(!profile)return;checkIdle();if(!locking)touch();},{passive:true}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkIdle();});setInterval(checkIdle,15000);
  window.addEventListener('mlg-profile-change',()=>document.querySelectorAll('[data-mlg-badge]').forEach(el=>MLGAccount.renderBadge(el)));
  window.addEventListener('storage',e=>{if(e.key===KEY){try{profile=JSON.parse(e.newValue);}catch{}if(!profile){location.href='/';return;}window.dispatchEvent(new Event('mlg-profile-change'));checkIdle();}});
})();
