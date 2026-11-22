/* Optional tools load once, when requested, rather than delaying sign-in. */
(() => {
 const pending=new Map();
 function script(src){if(pending.has(src))return pending.get(src);const promise=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.async=true;const timeout=setTimeout(()=>fail(),20000);function fail(){clearTimeout(timeout);el.remove();pending.delete(src);reject(Error('Não foi possível carregar a ferramenta. Verifique a conexão e tente novamente.'));}el.onload=()=>{clearTimeout(timeout);resolve();};el.onerror=fail;document.head.append(el);});pending.set(src,promise);return promise;}
 const cdn='https://cdnjs.cloudflare.com/ajax/libs/';
 const specs={xlsx:()=>window.XLSX?Promise.resolve():script('/assets/vendor/xlsx.full.min.js'),excel:()=>window.ExcelJS?Promise.resolve():script('/assets/vendor/exceljs.min.js'),chart:()=>window.Chart?Promise.resolve():script('https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'),crop:()=>window.Cropper?Promise.resolve():script(cdn+'cropperjs/1.6.1/cropper.min.js'),pdf:async()=>{if(!window.jspdf)await script(cdn+'jspdf/2.5.1/jspdf.umd.min.js');if(!window.jspdf.jsPDF.API.autoTable)await script(cdn+'jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');}};
 window.MLGTools={load:name=>specs[name]()};
 const routes={'export-family-andrade-btn':'excel','download-model-workbook-btn':'excel','analytics-button':'chart','open-analytics-modal-btn':'chart','download-trash-pdf-btn':'pdf','download-pdf-btn':'pdf','download-analytics-report-btn':'pdf','download-manual-pdf-btn':'pdf'};
 const ready=new Set(),busy=new Set();
 document.addEventListener('click',async event=>{
  const button=event.target.closest('button'),tool=routes[button?.id];if(!tool||ready.has(tool))return;
  event.preventDefault();event.stopImmediatePropagation();if(busy.has(button))return;
  busy.add(button);button.setAttribute('aria-busy','true');button.disabled=true;
  const label=document.createElement('span');label.className='mlg-tool-loading';label.role='status';label.textContent='Carregando ferramenta…';document.body.append(label);
  try{await specs[tool]();ready.add(tool);if(!document.documentElement.classList.contains('mlg-locked')){button.disabled=false;button.click();}}
  catch(error){label.textContent=error.message;setTimeout(()=>label.remove(),6000);return;}
  finally{button.disabled=false;button.removeAttribute('aria-busy');busy.delete(button);}
  label.remove();
 },true);
})();
