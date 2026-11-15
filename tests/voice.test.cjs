const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(t,{deny=false,pendingPermission=false}={}){
  const dom=new JSDOM('<button id="mic"></button><button id="cancel" hidden></button><p></p>',{url:'https://localhost',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;w.isSecureContext=true;
  let stopped=0,requests=0,recorder,resolvePermission,holdReader;
  const sent=[],track={enabled:true,stop:()=>stopped++},stream={getTracks:()=>[track]};
  w.navigator.mediaDevices={getUserMedia:async()=>{requests++;if(deny)throw Object.assign(new Error(),{name:'NotAllowedError'});if(pendingPermission)return new Promise(r=>resolvePermission=r);return stream;}};
  w.MediaRecorder=class {
    static isTypeSupported(){return true;}
    constructor(){recorder=this;this.mimeType='audio/webm;codecs=opus';this.state='inactive';}
    start(){this.state='recording';}
    pause(){this.state='paused';}
    resume(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new w.Blob(['x'.repeat(200)])});queueMicrotask(()=>this.onstop());}
  };
  w.FileReader=class {readAsDataURL(){holdReader=()=>{this.result='data:audio/webm;base64,VEVTVA==';this.onload();};}};
  w.eval(fs.readFileSync('assets/js/voice.js','utf8'));
  const button=w.document.querySelector('#mic'),cancel=w.document.querySelector('#cancel'),status=w.document.querySelector('p');
  const pause=w.document.createElement('button'),bar=w.document.createElement('div');
  const control=w.MLGVoice.attach({button,cancel,status,pause,bar,onAudio:async a=>sent.push(a),isBusy:()=>false});
  return {w,button,cancel,status,control,sent,pause,track,recorder:()=>recorder,stopped:()=>stopped,requests:()=>requests,finishEncoding:()=>holdReader(),grant:()=>resolvePermission(stream)};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('voice sends once after stop, releases microphone, and blocks a second recording while encoding',async t=>{
  const a=setup(t);await a.button.onclick();assert.equal(a.button.getAttribute('aria-pressed'),'true');
  await a.button.onclick();await tick();assert.equal(a.stopped(),1);assert.equal(a.sent.length,0);
  await a.button.onclick();assert.equal(a.requests(),1);
  a.finishEncoding();await tick();assert.equal(a.sent.length,1);assert.equal(a.sent[0].mimeType,'audio/webm');assert.equal(a.control.isActive(),false);
});
test('cancel and session lock discard audio without a model request',async t=>{
  const a=setup(t);await a.button.onclick();a.cancel.onclick();await tick();assert.equal(a.sent.length,0);assert.equal(a.stopped(),1);
  await a.button.onclick();await a.button.onclick();await tick();a.w.dispatchEvent(new a.w.Event('mlg-session-lock'));a.finishEncoding();await tick();assert.equal(a.sent.length,0);assert.equal(a.control.isActive(),false);
});
test('permission denied provides recovery instructions; cancellation during permission releases late stream',async t=>{
  const a=setup(t,{deny:true});await a.button.onclick();assert.match(a.status.textContent,/permita o microfone/);assert.equal(a.control.isActive(),false);
  const b=setup(t,{pendingPermission:true});const start=b.button.onclick();b.control.abort();b.grant();await start;assert.equal(b.stopped(),1);assert.equal(b.sent.length,0);assert.equal(b.control.isActive(),false);
});

test('voice pauses without sending, resumes and cancels a paused recording',async t=>{
 const a=setup(t);await a.button.onclick();a.pause.click();assert.equal(a.recorder().state,'paused');assert.equal(a.track.enabled,false);assert.equal(a.control.isActive(),true);assert.equal(a.sent.length,0);a.pause.click();assert.equal(a.track.enabled,true);a.pause.click();a.cancel.onclick();await tick();assert.equal(a.sent.length,0);assert.equal(a.stopped(),1);assert.equal(a.control.isActive(),false);
});
