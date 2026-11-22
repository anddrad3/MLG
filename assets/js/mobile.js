/* Mobile navigation reuses the live desktop controls and editors. */
(() => {
  function init() {
    const $ = id => document.getElementById(id);
    const media = window.matchMedia('(max-width: 800px), (max-height: 500px) and (pointer: coarse)');
    const body = document.body, workspace = $('mlg-workspace');
    const nav = document.createElement('nav');
    nav.id = 'mlg-mobile-nav'; nav.setAttribute('aria-label', 'Navegação do Financeiro');
    const screens = [['overview', 'Visão geral', 'Resumo', 'house'], ['ledger', 'Lançamentos', 'Contas', 'list-ul'], ['notes', 'Anotações', 'Notas', 'note-sticky'], ['calculator', 'Calculadora', 'Calcular', 'calculator'], ['more', 'Mais ferramentas', 'Mais', 'ellipsis']];
    screens.forEach(([id, label, text, icon]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.mobileScreen = id;
      b.setAttribute('aria-label', label); b.innerHTML = `<i class="fa-solid fa-${icon}" aria-hidden="true"></i><span>${text}</span>`;
      if (id === 'more') { b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-controls', 'mlg-mobile-tools'); }
      nav.append(b);
    });
    body.append(nav);
    const sheet = document.createElement('dialog'); sheet.id = 'mlg-mobile-tools'; sheet.setAttribute('aria-labelledby', 'mlg-mobile-tools-title');
    sheet.innerHTML = '<header><div><small>SEU FINANCEIRO</small><h2 id="mlg-mobile-tools-title">Tudo à mão.</h2></div><button type="button" data-close aria-label="Fechar ferramentas">×</button></header><div class="mlg-mobile-shortcuts"><button type="button" data-annual><i class="fa-solid fa-table-cells" aria-hidden="true"></i><span>Ano completo</span></button><button type="button" data-simulate><i class="fa-solid fa-flask" aria-hidden="true"></i><span>Simulação</span></button><button type="button" data-boxes><i class="fa-solid fa-piggy-bank" aria-hidden="true"></i><span>Caixinhas</span></button></div><div class="mlg-mobile-tool-grid"></div>';
    body.append(sheet);
    const buttons = [...document.querySelectorAll('.mlg-header-navigation>.header-button, .mlg-header-tools>.header-button')];
    const labels = {'settings-button':'Configurações','theme-toggle-button':'Tema','toggle-visibility-button':'Privacidade','timeline-button':'Cronologia','analytics-button':'Gráficos','calculator-button':'Calculadora','undo-action-button':'Desfazer','toggle-edit-lock-button':'Trava de edição','go-to-current-month-button':'Mês atual'};
    const originals = buttons.map(button => {
      const marker = document.createComment('Mobile tool position'); button.before(marker);
      const label = document.createElement('span'); label.className = 'mlg-mobile-tool-label'; label.textContent = labels[button.id] || 'Página inicial';
      button.append(label); return {button, marker};
    });
    const quick = document.createElement('section'); quick.id = 'mlg-mobile-quick'; quick.setAttribute('aria-label', 'Adicionar lançamento');
    quick.innerHTML = '<button type="button" data-add="entradas"><i class="fa-solid fa-plus" aria-hidden="true"></i> Entrada</button><button type="button" data-add="despesas"><i class="fa-solid fa-minus" aria-hidden="true"></i> Despesa</button>';
    $('indicators-grid').after(quick);
    const history = $('calculator-history').parentElement, historyMarker = document.createComment('Calculator history position'); history.before(historyMarker);
    const historyDetails = document.createElement('details'); historyDetails.className = 'mlg-mobile-calc-history'; historyDetails.innerHTML = '<summary>Histórico dos cálculos <span aria-hidden="true">⌄</span></summary>';
    let changing = false;
    function sync() {
      if (!media.matches) return;
      const current = body.classList.contains('mlg-year') ? 'year' : body.classList.contains('mlg-desk') ? workspace.dataset.panel || 'ledger' : 'overview';
      body.dataset.mobileScreen = current;
      nav.querySelectorAll('button').forEach(b => { const active = b.dataset.mobileScreen === current || b.dataset.mobileScreen === 'more' && (sheet.open || current === 'year'); b.setAttribute('aria-current', active ? 'page' : 'false'); });
      nav.querySelector('[data-mobile-screen=more]').setAttribute('aria-expanded', String(sheet.open));
    }
    function closeTools() { if (sheet.open) sheet.close(); sync(); }
    function show(screen) {
      closeTools();
      changing = true;
      const view = screen === 'overview' ? 'overview' : screen === 'year' ? 'year' : 'desk';
      document.querySelector('.mlg-view-switch [data-view=' + view + ']').click();
      if (view === 'desk') $('mlg-desk-tabs').querySelector('[data-desk-panel=' + screen + ']').click();
      changing = false; sync();
      if (screen === 'calculator') $('calculator-window').querySelector('.calc-button')?.focus({preventScroll:true});
    }
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-mobile-screen]'); if (!button) return;
      if (button.dataset.mobileScreen === 'more') { sheet.showModal(); sync(); }
      else show(button.dataset.mobileScreen);
    });
    sheet.querySelector('[data-close]').onclick = closeTools;
    sheet.addEventListener('close', sync);
    sheet.addEventListener('click', event => { if (event.target === sheet) closeTools(); });
    // Close the native sheet before an existing control opens its own modal.
    sheet.addEventListener('click', event => {
      const button = event.target.closest('.header-button'); if (!button) return;
      closeTools();
      if (button.id === 'calculator-button') { event.preventDefault(); event.stopPropagation(); show('calculator'); }
    }, true);
    sheet.querySelector('[data-annual]').onclick = () => show('year');
    sheet.querySelector('[data-boxes]').onclick = () => { closeTools(); $('mlg-box-manage').click(); };
    sheet.querySelector('[data-simulate]').onclick = () => { show('ledger'); $('simulation-mode-toggle-btn').click(); };
    quick.addEventListener('click', event => {
      const button = event.target.closest('[data-add]'); if (!button) return;
      show('ledger'); document.querySelector('[data-ledger=' + button.dataset.add + ']').click();
      document.querySelector('.action-button-add[data-type=' + button.dataset.add + ']')?.click();
    });
    window.addEventListener('mlg-view-change', () => { if (!changing) { if (media.matches && body.dataset.mobileScreen === 'year' && body.classList.contains('mlg-desk')) $('mlg-desk-tabs').querySelector('[data-desk-panel=ledger]').click(); sync(); } });
    window.addEventListener('mlg-show-transaction', sync);
    window.addEventListener('mlg-session-lock', closeTools);
    $('mlg-desk-tabs').addEventListener('click', sync);
    function fitKeyboard() {
      const viewport = window.visualViewport;
      if (!media.matches || !viewport || viewport.scale !== 1) { body.classList.remove('mlg-keyboard-open'); body.style.removeProperty('--mobile-height'); return; }
      body.style.setProperty('--mobile-height', viewport.height + 'px');
      body.style.setProperty('--mobile-keyboard-offset', Math.max(0, innerHeight - viewport.height - viewport.offsetTop) + 'px');
      body.classList.toggle('mlg-keyboard-open', viewport.height < innerHeight * .75 && !!document.activeElement?.matches('input,textarea,[contenteditable=true]'));
    }
    window.visualViewport?.addEventListener('resize', fitKeyboard);
    document.addEventListener('focusin', fitKeyboard); document.addEventListener('focusout', () => requestAnimationFrame(fitKeyboard));
    function adapt() {
      closeTools(); body.classList.toggle('mlg-mobile', media.matches);
      if (media.matches) {
        originals.forEach(({button}) => sheet.querySelector('.mlg-mobile-tool-grid').append(button));
        historyMarker.after(historyDetails); historyDetails.append(history); historyDetails.open = false;
        sync();
      } else {
        originals.forEach(({button, marker}) => marker.after(button));
        historyMarker.after(history); historyDetails.remove(); delete body.dataset.mobileScreen;
      }
      fitKeyboard();
    }
    media.addEventListener('change', adapt); adapt();
  }
  if (window.MLGFinance) init(); else window.addEventListener('mlg-finance-ready', init, {once:true});
})();
