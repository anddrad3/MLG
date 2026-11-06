/* Pure financial rules shared by the browser, server and regression tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MLGDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  function importStatus(value) {
    const text = normalize(value);
    if (!text || ['on hold', 'onhold', 'em espera'].includes(text)) return 'on_hold';
    if (['simulacao', 'simulation', 'sandbox'].includes(text)) return 'simulation';
    if (['ainda nao', 'ampulheta', 'scheduled'].includes(text)) return 'scheduled';
    if (['sim', 's', 'true', 'pago', 'quitado', 'recebido', 'ok', '1', 'yes', 'paid'].includes(text)) return 'paid';
    return 'pending';
  }
  function exportStatus(item) {
    if (item.pago) return 'Pago';
    return ({on_hold:'On hold', simulation:'Simulação', scheduled:'Ainda não', paid:'Pago'})[item.paymentState] || 'Não pago';
  }
  function cents(value) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Valor inválido.');
    return Math.round(value * 100);
  }
  function validateCommand(raw) {
    if (!raw || !['entradas', 'despesas'].includes(raw.type)) throw new Error('Informe se é entrada ou saída.');
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 180) throw new Error('Informe a descrição.');
    if (typeof raw.amount !== 'number' || raw.amount <= 0 || raw.amount > 1e9) throw new Error('Informe um valor válido.');
    if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error('Informe a data.');
    const date = new Date(raw.date + 'T12:00:00Z');
    if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== raw.date) throw new Error('Data inválida.');
    if (!Number.isInteger(raw.installments) || raw.installments < 1 || raw.installments > 360) throw new Error('Use de 1 a 360 parcelas.');
    if (!['total', 'per_installment'].includes(raw.amountMode)) throw new Error('Especifique se o valor é total ou por parcela.');
    if (raw.amountMode === 'total' && cents(raw.amount) < raw.installments) throw new Error('Cada parcela deve ter pelo menos um centavo.');
    return {type:raw.type, name:raw.name.trim(), amount:cents(raw.amount)/100, date:raw.date, installments:raw.installments, amountMode:raw.amountMode};
  }
  function installments(raw) {
    const command = validateCommand(raw);
    const [year, month, day] = command.date.split('-').map(Number);
    const total = cents(command.amount);
    return Array.from({length:command.installments}, (_, index) => {
      const target = new Date(Date.UTC(year, month - 1 + index, 1));
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth()+1, 0)).getUTCDate();
      target.setUTCDate(Math.min(day,last));
      const amount = command.amountMode === 'per_installment' ? total : Math.floor(total / command.installments) + (index < total % command.installments ? 1 : 0);
      return {type:command.type, nome:command.name, valor:amount/100, data:target.toISOString().slice(0,10), monthKey:`${target.getUTCFullYear()}-${target.getUTCMonth()}`, occurrenceIndex:index+1, occurrenceTotal:command.installments};
    });
  }
  return {normalize, importStatus, exportStatus, cents, validateCommand, installments};
});
