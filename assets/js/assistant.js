/* Fixed assistant: local navigation/search first, Gemini only for interpretation. */
(() => {
 function init(){
  const panel=document.getElementById('mlg-ai');
  panel.innerHTML=`<div class="mlg-chat-response"><div class="mlg-chat-label"><span>✦ Assistente MLG</span><button type="button" data-help aria-label="O que posso pedir?">?</button></div><p role="status" aria-live="polite">O que vamos organizar? Escreva, fale ou arraste uma imagem.</p><div class="mlg-ai-review" hidden><span></span><div><button type="button" data-confirm>Confirmar</button><button type="button" data-cancel>Cancelar</button></div></div></div><div class="mlg-chat-attachment" hidden><img alt="Imagem anexada ao lançamento"><span>Imagem pronta · será salva com o lançamento</span><button type="button" data-remove-image aria-label="Remover imagem">×</button></div><form class="mlg-chat-composer"><input type="file" data-image-input accept="image/png,image/jpeg,image/webp" hidden><button type="button" data-attach aria-label="Anexar imagem"><i class="fa-regular fa-image" aria-hidden="true"></i></button><textarea rows="1" maxlength="2000" aria-label="Mensagem para o assistente" placeholder="Escreva uma mensagem…"></textarea><button type="button" data-mic aria-label="Gravar comando de voz" aria-pressed="false"><i class="fa-solid fa-microphone" aria-hidden="true"></i></button><button type="submit" data-send aria-label="Enviar mensagem"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button></form><div class="mlg-recording-bar" hidden><button type="button" data-cancel-audio aria-label="Descartar áudio"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button><span class="mlg-record-dot"></span><output data-elapsed>0:00</output><canvas data-wave width="240" height="36" aria-label="Volume do microfone em tempo real"></canvas><button type="button" data-pause aria-label="Pausar gravação"><i class="fa-solid fa-pause" aria-hidden="true"></i></button><button type="button" data-audio-send aria-label="Enviar áudio"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button></div>`;
  if(window.ResizeObserver){const resize=new ResizeObserver(()=>document.body.style.setProperty('--mlg-chat-space',Math.ceil(panel.getBoundingClientRect().height+32)+'px'));resize.observe(panel);}
  const $=s=>panel.querySelector(s),form=$('form'),input=$('textarea'),status=$('[role=status]'),review=$('.mlg-ai-review'),send=$('[data-send]'),mic=$('[data-mic]'),imagePreview=$('.mlg-chat-attachment');
  let pending=null,busy=false,version=0,attached=null,pendingPhoto='',imageVersion=0;
  const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const help=()=>status.textContent='Experimente: “gastei 40 no mercado”, “buscar internet”, “abrir dezembro”, “anote: conferir a fatura”, “resumo”, “gráficos”, “caixinhas” ou “apagar financeiro”. Arraste JPG, PNG ou WebP para lançar com foto.';
  $('[data-help]').onclick=help;
  const clearImage=()=>{imageVersion++;attached=null;imagePreview.hidden=true;imagePreview.querySelector('img').removeAttribute('src');$('[data-image-input]').value='';};
  $('[data-remove-image]').onclick=()=>{if(busy)return;pending=null;pendingPhoto='';review.hidden=true;clearImage();};
  async function chooseImage(files){
   if(busy||voice.isActive()){status.textContent='Conclua o comando atual antes de anexar uma imagem.';return;}
   pending=null;pendingPhoto='';review.hidden=true;const token=++imageVersion;
   try{
    if(files.length!==1)throw Error('Anexe uma imagem por mensagem.');
    const file=files[0];if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>8e6)throw Error('Só aceito imagens JPG, PNG ou WebP de até 8 MB.');
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    let photo='';for(const quality of [.82,.65,.45]){photo=canvas.toDataURL('image/jpeg',quality);if(photo.length<680000)break;}if(photo.length>=680000)throw Error('Esta imagem é grande demais. Recorte o comprovante e tente novamente.');
    if(token!==imageVersion)return;const thumb=document.createElement('canvas'),ratio=Math.min(1,512/Math.max(canvas.width,canvas.height));thumb.width=Math.max(1,Math.round(canvas.width*ratio));thumb.height=Math.max(1,Math.round(canvas.height*ratio));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);const savedPhoto=thumb.toDataURL('image/jpeg',.72);attached={mimeType:'image/jpeg',data:photo.split(',')[1],photo:savedPhoto};imagePreview.querySelector('img').src=savedPhoto;imagePreview.hidden=false;status.textContent='Imagem anexada. Diga o que deseja lançar ou envie para interpretar o comprovante.';input.focus();
   }catch(error){status.textContent=error.message;}
  }
  $('[data-attach]').onclick=()=>$('[data-image-input]').click();$('[data-image-input]').onchange=e=>chooseImage(e.target.files);
  panel.ondragover=e=>{e.preventDefault();panel.classList.add('is-dragging');};panel.ondragleave=e=>{if(!panel.contains(e.relatedTarget))panel.classList.remove('is-dragging');};panel.ondrop=e=>{e.preventDefault();panel.classList.remove('is-dragging');chooseImage(e.dataTransfer.files);};
  input.onpaste=e=>{const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();chooseImage(files);}};
  input.oninput=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,96)+'px';};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}};
  async function api(path,payload){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Não consegui completar o pedido.'),{status:r.status});return data;}
  function proposeNote(text){pending={action:'note',text};pendingPhoto='';review.querySelector('span').textContent='Adicionar às notas do mês: '+text;review.hidden=false;status.textContent='Confira a anotação antes de salvar.';}
  function localCommand(text){
   const clean=MLGDomain.normalize(text),search=text.match(/^(?:\/buscar|busque|buscar|pesquise|pesquisar|procure|procurar|encontre)\s+(.+)/i),note=text.match(/^(?:\/nota|anote|anotar|salve uma nota|nota)\s*:?\s+(.+)/i);
   if(search){MLGFinance.search(search[1]);status.textContent='Abri os resultados da pesquisa. Nenhum dado foi enviado à IA.';return true;}
   if(note){proposeNote(note[1]);return true;}
   const targets={'graficos':'analytics-button','calculadora':'calculator-button','configuracoes':'settings-button','caixinhas':'mlg-box-manage','simulacao':'simulation-mode-toggle-btn','historico':'timeline-button','apagar financeiro':'clear-financial-data-btn','apagar tudo':'clear-financial-data-btn'};
   const name=clean.replace(/^(abrir|abra|ver|mostrar|mostre)\s+/,'');
   if(targets[name]){document.getElementById(targets[name]).click();status.textContent='Pronto. Use os controles da janela para continuar.';return true;}
   if(['ano','ano completo','visao anual'].includes(name)){document.querySelector('[data-view=year]').click();status.textContent='Aqui está a visão dos 12 meses.';return true;}
   if(['ajuda','o que posso fazer','help'].includes(clean)){help();return true;}
   if(['resumo','saldo','meu saldo','resumo do mes'].includes(clean)){showSummary();return true;}
   const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
   const navigation=clean.match(/^(?:abrir|abra|ir para|ver|mostrar)\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+(?:de\s+)?(\d{4}))?$/);
   if(navigation){MLGFinance.goTo(`${navigation[2]||MLGFinance.getDate().slice(0,4)}-${String(months.indexOf(navigation[1])+1).padStart(2,'0')}-01`);status.textContent='Mês aberto.';return true;}return false;
  }
  function showSummary(date=MLGFinance.getDate()){if(MLGFinance.isPrivate())throw Error('Revele os dados pelo ícone de privacidade para consultar o resumo.');const [year,month]=date.split('-').map(Number),m=MLGFinance.getYear(year)[month-1].metrics;status.textContent=`${String(month).padStart(2,'0')}/${year} · Entradas ${money(m.entradas)} · Saídas ${money(m.despesas)} · Pago ${money(m.pago)} · Pendente ${money(m.pendente)} · Saldo previsto ${money(m.saldo)}.`;}
  async function submitCommand(audio=null){
   if(busy)return;const text=input.value.trim();if(!text&&!audio&&!attached)return;
   pending=null;review.hidden=true;
   try{if(!audio&&!attached&&localCommand(text)){input.value='';return;}}catch(e){status.textContent=e.message;return;}
   busy=true;send.disabled=true;panel.classList.add('is-busy');status.textContent='Interpretando sua mensagem…';const requestVersion=version,photo=attached?.photo||'';
   const payload={text:audio?'':text,referenceDate:MLGFinance.getDate(),...(audio?{audio}:{}),...(attached?{image:{data:attached.data,mimeType:attached.mimeType}}:{})};
   try{
    let result;try{result=await api('/api/command',payload);}catch(error){if(error.status!==401)throw error;await api('/api/session',{});result=await api('/api/command',payload);}
    if(requestVersion!==version)return;if(result.transcript)input.value=result.transcript;
    if(result.action==='search'){MLGFinance.search(result.query);status.textContent='Encontrei a pesquisa que você pediu.';return;}
    if(result.action==='navigate'){MLGFinance.goTo(result.date);status.textContent='Mês aberto.';return;}
    if(result.action==='note'){proposeNote(result.query);return;}
    if(result.action==='summary'){showSummary(result.date);return;}
    if(result.action==='help'){help();return;}
    pending=MLGDomain.validateCommand(result.command);pendingPhoto=photo;const rows=MLGDomain.installments(pending);
    review.querySelector('span').textContent=`${pending.type==='despesas'?'Saída':'Entrada'} · ${pending.name} · ${rows.length} parcela(s) · total ${money(rows.reduce((n,r)=>n+r.valor,0))} · ${pending.date.split('-').reverse().join('/')}${photo?' · com foto':''}`;review.hidden=false;status.textContent='Confira os dados antes de adicionar. Ctrl+Z desfaz a operação.';
   }catch(error){if(requestVersion===version)status.textContent=error.message;}
   finally{busy=false;send.disabled=false;panel.classList.remove('is-busy');}
  }
  form.onsubmit=e=>{e.preventDefault();if(voice.isActive())return;submitCommand();};
  $('[data-confirm]').onclick=()=>{if(!pending)return;try{if(pending.action==='note')MLGFinance.addNote(pending.text);else MLGFinance.addCommand(pending,pendingPhoto);pending=null;pendingPhoto='';review.hidden=true;input.value='';clearImage();status.textContent='Salvo neste navegador. Ctrl+Z desfaz.';}catch(e){status.textContent=e.message;}};
  $('[data-cancel]').onclick=()=>{pending=null;pendingPhoto='';review.hidden=true;status.textContent='Cancelado. Nenhum dado foi alterado.';};
  const voice=MLGVoice.attach({button:mic,cancel:$('[data-cancel-audio]'),status,onAudio:submitCommand,isBusy:()=>busy,bar:$('.mlg-recording-bar'),composer:form,pause:$('[data-pause]'),sendAudio:$('[data-audio-send]'),elapsed:$('[data-elapsed]'),canvas:$('[data-wave]'),onStart:()=>{pending=null;review.hidden=true;}});
  function reset(){version++;pending=null;pendingPhoto='';review.hidden=true;input.value='';clearImage();status.textContent='O que vamos organizar?';}
  window.addEventListener('mlg-finance-reset',reset);window.addEventListener('mlg-session-lock',reset);
 }
 if(window.MLGFinance)init();else window.addEventListener('mlg-finance-ready',init,{once:true});
})();
