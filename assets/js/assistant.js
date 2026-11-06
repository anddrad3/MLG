(() => {
  function init() {
    const panel = document.getElementById('mlg-ai');
    panel.innerHTML = `<form><span aria-hidden="true">✦</span><input aria-label="Comando para a IA" placeholder="Adicione uma saída de R$ 120 em dezembro para internet…" maxlength="2000" required><button type="button" data-mic aria-label="Ditar comando" aria-pressed="false"><i class="fa-solid fa-microphone"></i></button><button class="mlg-primary" data-send>Enviar</button></form><p role="status" aria-live="polite">Digite ou dite um lançamento. Confira a interpretação antes de adicionar.</p><div class="mlg-ai-review" hidden><span></span><button class="mlg-primary" data-confirm>Adicionar</button><button data-cancel>Cancelar</button></div>`;
    const form = panel.querySelector('form'), input = panel.querySelector('input'), status = panel.querySelector('[role=status]'), review = panel.querySelector('.mlg-ai-review'), send = panel.querySelector('[data-send]'), mic = panel.querySelector('[data-mic]');
    let pending = null, busy = false;
    async function api(path, payload) {
      const response = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Falha de comunicação.'),{status:response.status});
      return data;
    }
    async function authorize() {
      return new Promise(resolve => {
        const dialog = document.createElement('dialog');dialog.className='mlg-dialog';
        dialog.innerHTML='<form class="mlg-account-form"><h2>Conectar à IA</h2><p>Informe o código de acesso definido pelo proprietário deste servidor.</p><label>Código de acesso<input type="password" autocomplete="off" required></label><p role="status"></p><div class="mlg-form-actions"><button type="button">Cancelar</button><button class="mlg-primary">Conectar</button></div></form>';
        const close = ok => {dialog.close();dialog.remove();resolve(ok);};
        dialog.oncancel=e=>{e.preventDefault();close(false);};
        dialog.querySelector('[type=button]').onclick=()=>close(false);
        dialog.querySelector('form').onsubmit=async e=>{
          e.preventDefault();const button=dialog.querySelector('.mlg-primary');button.disabled=true;
          try {await api('/api/session',{accessCode:dialog.querySelector('input').value});close(true);}
          catch(error){dialog.querySelector('[role=status]').textContent=error.message;}
          finally{button.disabled=false;}
        };
        document.body.append(dialog);dialog.showModal();
      });
    }
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      busy=true;send.disabled=true;pending=null;review.hidden=true;status.textContent='Interpretando seu comando…';
      const payload={text:input.value.trim(),referenceDate:MLGFinance.getDate()};
      try {
        let result;
        try {result=await api('/api/command',payload);}
        catch(error){if(error.status!==401)throw error;if(!await authorize()){status.textContent='Conexão cancelada.';return;}result=await api('/api/command',payload);}
        pending=MLGDomain.validateCommand(result.command);
        const rows=MLGDomain.installments(pending);
        review.querySelector('span').textContent=`${pending.type==='despesas'?'Saída':'Entrada'} · ${pending.name} · ${rows.length} parcela(s) · total ${rows.reduce((n,r)=>n+r.valor,0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · início ${pending.date.split('-').reverse().join('/')}`;
        review.hidden=false;status.textContent='Confira os dados. Você pode cancelar ou adicionar e depois desfazer com Ctrl+Z.';
      } catch(error){status.textContent=error.message;}
      finally{busy=false;send.disabled=false;}
    };
    panel.querySelector('[data-confirm]').onclick=()=>{
      if (!pending) return;
      try {MLGFinance.addCommand(pending);pending=null;review.hidden=true;input.value='';status.textContent='Lançamento adicionado. Ctrl+Z desfaz toda a operação.';}
      catch(error){status.textContent=error.message;}
    };
    panel.querySelector('[data-cancel]').onclick=()=>{pending=null;review.hidden=true;status.textContent='Cancelado. Nenhum lançamento foi criado.';};
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Speech) {
      const recognition=new Speech();recognition.lang='pt-BR';recognition.interimResults=false;recognition.continuous=false;
      recognition.onresult=e=>{input.value=e.results[0][0].transcript;form.requestSubmit();};
      recognition.onerror=e=>{status.textContent=e.error==='not-allowed'?'Permita o microfone no navegador ou digite o comando.':'Não consegui ouvir. Tente novamente ou digite.';};
      recognition.onend=()=>mic.setAttribute('aria-pressed','false');
      mic.onclick=()=>{if(mic.getAttribute('aria-pressed')==='true'){recognition.stop();return;}try{recognition.start();mic.setAttribute('aria-pressed','true');status.textContent='Ouvindo… O reconhecimento de voz é fornecido pelo navegador.';}catch{status.textContent='O microfone já está em uso.';}};
    } else {mic.disabled=true;mic.title='Este navegador não oferece reconhecimento de voz. Use o campo de texto.';}
    fetch('/api/config').then(r=>r.json()).then(config=>{if(!config.aiConfigured)status.textContent='IA pronta para configurar: falta conectar a chave Gemini no servidor. Os lançamentos manuais continuam disponíveis.';}).catch(()=>{status.textContent='Execute o servidor MLG para usar a IA.';});
  }
  if (window.MLGFinance) init(); else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
