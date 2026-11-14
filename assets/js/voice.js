/* Short, explicit microphone recordings. Audio stays in memory until sent. */
(() => {
  function attach({button,cancel,status,onAudio,isBusy}){
    let recorder=null,stream=null,timer=null,discard=false,starting=false,processing=false;
    const stop=()=>{if(recorder?.state==='recording'){processing=true;recorder.stop();}};
    const release=()=>{clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Gravar comando de voz');button.classList.remove('is-recording');cancel.hidden=true;};
    const abort=()=>{discard=true;stop();release();};
    cancel.onclick=()=>{abort();status.textContent='Gravação cancelada. Nenhum áudio foi enviado.';};
    window.addEventListener('mlg-session-lock',abort);window.addEventListener('mlg-finance-reset',abort);window.addEventListener('pagehide',abort);
    button.onclick=async()=>{
      if(recorder?.state==='recording'){stop();return;}
      if(starting||processing||isBusy())return;
      if(!window.isSecureContext){status.textContent='O microfone precisa de HTTPS. Abra o endereço seguro do MLG.';return;}
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status.textContent='Este navegador não permite gravar áudio. Abra o MLG no Chrome, Edge, Firefox ou Safari atualizado, ou use o ditado do teclado.';return;}
      starting=true;discard=false;status.textContent='Aguardando permissão do microfone…';
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
        if(discard){release();return;}
        const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
        recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});
        const chunks=[];let size=0;const started=Date.now();
        recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>512000){discard=true;status.textContent='O áudio ficou grande demais. Grave uma frase mais curta.';stop();}}};
        recorder.onerror=()=>{abort();status.textContent='A gravação falhou. Verifique se outro aplicativo está usando o microfone.';};
        recorder.onstop=async()=>{
          const durationMs=Math.max(1,Math.min(30000,Date.now()-started));
          processing=true;release();
          try{
            if(discard)return;
            const blob=new Blob(chunks,{type:recorder.mimeType});
            if(blob.size<100){status.textContent='Nenhum áudio foi capturado. Tente falar mais perto do microfone.';return;}
            const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
            if(!discard)await onAudio({data,mimeType:blob.type.split(';')[0],durationMs});
          }catch{status.textContent='Não foi possível ler a gravação. Tente novamente.';}
          finally{processing=false;}
        };
        recorder.start(250);button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Parar gravação e interpretar');button.classList.add('is-recording');cancel.hidden=false;status.textContent='Gravando até 30 segundos. Clique no microfone para parar e enviar à IA, ou cancele.';timer=setTimeout(stop,30000);
      }catch(error){release();status.textContent=error.name==='NotAllowedError'?'Microfone bloqueado. No cadeado ao lado do endereço, permita o microfone para este site e tente novamente.':error.name==='NotFoundError'?'Nenhum microfone encontrado. Conecte um microfone e tente novamente.':'Não consegui abrir o microfone. Feche outros aplicativos que possam estar usando ele e tente novamente.';}
      finally{starting=false;}
    };
    return {abort,isActive:()=>starting||processing||recorder?.state==='recording'};
  }
  window.MLGVoice={attach};
})();
