/* Short, explicit microphone recordings. Audio stays in memory until sent. */
(() => {
  function attach({button,cancel,status,onAudio,isBusy,bar,composer,pause,sendAudio,elapsed,canvas,onStart}){
    let recorder=null,stream=null,timer=null,discard=false,starting=false,processing=false,context=null,animation=null,activeMs=0,segmentStart=0;
    const duration=()=>Math.min(30000,activeMs+(recorder?.state==='recording'?Date.now()-segmentStart:0));
    const stop=()=>{if(['recording','paused'].includes(recorder?.state)){activeMs=duration();processing=true;recorder.stop();}};
    function togglePause(){if(!recorder||processing)return;if(recorder.state==='recording'){activeMs=duration();recorder.pause();stream?.getTracks().forEach(t=>t.enabled=false);}else if(recorder.state==='paused'&&activeMs<30000){segmentStart=Date.now();stream?.getTracks().forEach(t=>t.enabled=true);recorder.resume();}const paused=recorder.state==='paused';bar?.classList.toggle('is-paused',paused);if(pause){pause.setAttribute('aria-label',paused?'Continuar gravação':'Pausar gravação');pause.innerHTML=paused?'<i class="fa-solid fa-play" aria-hidden="true"></i>':'<i class="fa-solid fa-pause" aria-hidden="true"></i>';}}
    if(pause)pause.onclick=togglePause;if(sendAudio)sendAudio.onclick=stop;
    function animateWave(){
      const Audio=window.AudioContext||window.webkitAudioContext;if(!canvas||!Audio)return;
      try{context=new Audio();const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);context.resume().catch(()=>{});const values=new Uint8Array(analyser.fftSize),history=Array(42).fill(2),ctx=canvas.getContext('2d');let last=0;
      const draw=now=>{if(now-last>65){last=now;analyser.getByteTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,v)=>sum+Math.pow((v-128)/128,2),0)/values.length);history.shift();history.push(recorder?.state==='recording'?Math.max(2,Math.min(32,rms*140)):2);ctx.clearRect(0,0,240,36);ctx.fillStyle=recorder?.state==='paused'?'#7b8390':'#b9c5d4';history.forEach((h,i)=>ctx.fillRect(i*5.7,18-h/2,3,h));}animation=requestAnimationFrame(draw);};animation=requestAnimationFrame(draw);
      }catch{status.textContent='Gravando. A visualização de volume não está disponível neste navegador.';}
    }
    const release=()=>{clearInterval(timer);window.cancelAnimationFrame?.(animation);context?.close().catch(()=>{});context=null;if(bar)bar.hidden=true;if(composer)composer.hidden=false;stream?.getTracks().forEach(t=>t.stop());stream=null;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Gravar comando de voz');button.classList.remove('is-recording');cancel.hidden=true;};
    const abort=()=>{discard=true;stop();release();};
    cancel.onclick=()=>{abort();status.textContent='Gravação cancelada. Nenhum áudio foi enviado.';};
    window.addEventListener('mlg-session-lock',abort);window.addEventListener('mlg-finance-reset',abort);window.addEventListener('pagehide',abort);
    button.onclick=async()=>{
      if(['recording','paused'].includes(recorder?.state)){stop();return;}
      if(starting||processing||isBusy())return;
      if(!window.isSecureContext){status.textContent='O microfone precisa de HTTPS. Abra o endereço seguro do MLG.';return;}
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status.textContent='Este navegador não permite gravar áudio. Abra o MLG no Chrome, Edge, Firefox ou Safari atualizado, ou use o ditado do teclado.';return;}
      starting=true;discard=false;status.textContent='Aguardando permissão do microfone…';
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
        if(discard){release();return;}
        const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
        recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});
        const chunks=[];let size=0;activeMs=0;segmentStart=Date.now();
        recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>512000){discard=true;status.textContent='O áudio ficou grande demais. Grave uma frase mais curta.';stop();}}};
        recorder.onerror=()=>{abort();status.textContent='A gravação falhou. Verifique se outro aplicativo está usando o microfone.';};
        recorder.onstop=async()=>{
          const durationMs=Math.max(1,activeMs);
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
        recorder.start(250);onStart?.();if(bar){bar.hidden=false;bar.classList.remove('is-paused');}if(composer)composer.hidden=true;if(elapsed)elapsed.textContent='0:00';if(pause){pause.setAttribute('aria-label','Pausar gravação');pause.innerHTML='<i class="fa-solid fa-pause" aria-hidden="true"></i>';}animateWave();button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Parar gravação e interpretar');button.classList.add('is-recording');cancel.hidden=false;status.textContent='Gravando. Pause para pensar, descarte pela lixeira ou envie pela seta.';timer=setInterval(()=>{const ms=duration();if(elapsed)elapsed.textContent='0:'+String(Math.floor(ms/1000)).padStart(2,'0');if(ms>=30000&&recorder?.state==='recording'){if(bar){togglePause();status.textContent='30 segundos gravados. Envie o áudio ou descarte.';}else stop();}},100);
      }catch(error){release();status.textContent=error.name==='NotAllowedError'?'Microfone bloqueado. No cadeado ao lado do endereço, permita o microfone para este site e tente novamente.':error.name==='NotFoundError'?'Nenhum microfone encontrado. Conecte um microfone e tente novamente.':'Não consegui abrir o microfone. Feche outros aplicativos que possam estar usando ele e tente novamente.';}
      finally{starting=false;}
    };
    return {abort,isActive:()=>starting||processing||['recording','paused'].includes(recorder?.state)};
  }
  window.MLGVoice={attach};
})();
