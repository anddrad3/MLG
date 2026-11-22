const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

async function app(t, mobile = true) {
  const html = fs.readFileSync('financeiro/index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, {url:'http://localhost/financeiro/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(() => dom.window.close()); const w = dom.window;
  const mql = {matches:mobile, addEventListener(_event, listener){this.listener=listener;}};
  w.matchMedia = () => mql;
  w.MLGVault = require('../assets/js/vault.js'); w.MLGDomain = require('../assets/js/domain.js');
  w.MLGAccount = {ready:Promise.resolve(),unlock:async()=>true,renderBadge:()=>{}};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  w.HTMLDialogElement.prototype.close = function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.localStorage.setItem('financialControlState', JSON.stringify({currentDate:new Date(2026,10,1).getTime(),financialData:{}}));
  await new Promise(resolve => w.document.readyState==='loading' ? w.document.addEventListener('DOMContentLoaded',resolve,{once:true}) : resolve());
  const ready = new Promise(resolve => w.addEventListener('mlg-finance-ready',resolve,{once:true}));
  w.eval(fs.readFileSync('assets/js/finance.js','utf8')); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await ready;
  for(const script of ['workspace','finance-design','mobile']) w.eval(fs.readFileSync('assets/js/'+script+'.js','utf8'));
  const q = selector => w.document.querySelector(selector);
  return {w,q,nav:screen=>q('[data-mobile-screen='+screen+']').click(),resize:mobile=>{mql.matches=mobile;mql.listener();}};
}

test('mobile navigation keeps one live editor and uses all desktop tools without losing state on resize',async t=>{
  const a=await app(t),{w,q}=a,notes=q('#geral-anotacao'),calculator=q('#calculator-window');
  const settings=q('#settings-button'),theme=q('#theme-toggle-button');
  assert.equal(w.document.body.dataset.mobileScreen,'overview');
  assert.equal(q('#mlg-mobile-nav [aria-current=page]').dataset.mobileScreen,'overview');
  assert.equal(q('.mlg-mobile-tool-grid').children.length,10);
  for(const screen of ['ledger','notes','calculator','notes']) {
    a.nav(screen); assert.equal(w.document.body.dataset.mobileScreen,screen);
    assert.equal(q('#mlg-workspace').dataset.panel,screen); assert.equal(q('#geral-anotacao'),notes); assert.equal(q('#calculator-window'),calculator);
  }
  notes.value='Nota preservada no celular';notes.dispatchEvent(new w.Event('input'));
  a.nav('calculator');q('#calculator-window [data-key="7"]').click();q('#calculator-window [data-key="+"]').click();q('#calculator-window [data-key="2"]').click();q('#calculator-window [data-key="="]').click();
  assert.equal(q('#calculator-display').textContent,'9');
  a.nav('more');assert.equal(q('#mlg-mobile-tools').open,true);theme.click();assert.equal(q('#mlg-mobile-tools').open,false);
  a.resize(false);assert.equal(w.document.body.classList.contains('mlg-mobile'),false);
  assert.equal(q('.mlg-header-navigation #settings-button'),settings);assert.equal(q('.mlg-header-navigation').children.length,5);assert.equal(q('.mlg-header-tools').children.length,5);
  assert.equal(q('#geral-anotacao').value,'Nota preservada no celular');assert.equal(q('#calculator-display').textContent,'9');
  assert.equal(q('.mlg-mobile-calc-history'),null);
  a.resize(true);assert.equal(q('.mlg-mobile-tool-grid').children.length,10);assert.equal(q('#geral-anotacao'),notes);assert.equal(w.document.querySelectorAll('#calculator-window').length,1);
  a.nav('more');settings.click();assert.equal(q('#mlg-mobile-tools').open,false);assert.equal(q('#settings-modal').classList.contains('hidden'),false);
});

test('mobile shortcuts route to existing forms, year returns to accounts, and locking closes the tools sheet',async t=>{
  const a=await app(t),{w,q}=a;
  q('#mlg-mobile-quick [data-add=entradas]').click();
  assert.equal(w.document.body.dataset.mobileScreen,'ledger');assert.equal(q('[data-ledger=entradas]').getAttribute('aria-selected'),'true');
  assert.equal(q('#item-editor-modal').classList.contains('hidden'),false);
  // Form opening uses the existing modal; no copy of the editor is created.
  assert.equal(w.document.querySelectorAll('#item-editor-modal').length,1);q('#item-editor-cancelar-btn').click();
  a.nav('notes');a.nav('more');q('[data-annual]').click();assert.equal(w.document.body.dataset.mobileScreen,'year');assert.equal(q('#mlg-mobile-tools').open,false);
  q('.mlg-month-open').click();assert.equal(w.document.body.dataset.mobileScreen,'ledger');
  a.nav('more');q('#calculator-button').click();assert.equal(w.document.body.dataset.mobileScreen,'calculator');assert.equal(q('#calculator-window').classList.contains('is-docked'),true);assert.equal(q('#mlg-mobile-tools').open,false);
  a.nav('more');w.dispatchEvent(new w.Event('mlg-session-lock'));assert.equal(q('#mlg-mobile-tools').open,false);
});

test('desktop startup keeps original header positions and overview, with mobile tools dormant',async t=>{
  const a=await app(t,false),{w,q}=a;
  assert.equal(w.document.body.classList.contains('mlg-mobile'),false);
  assert.equal(q('.mlg-header-navigation').children.length,5);assert.equal(q('.mlg-header-tools').children.length,5);
  assert.equal(q('.mlg-mobile-tool-grid').children.length,0);assert.equal(q('.mlg-mobile-calc-history'),null);
  assert.equal(q('.mlg-view-switch [aria-pressed=true]').dataset.view,'overview');
});
