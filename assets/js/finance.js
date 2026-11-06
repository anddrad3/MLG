document.addEventListener('DOMContentLoaded', async () => {
            await MLGAccount.ready;
            if (!await MLGAccount.unlock()) { location.href = '/'; return; }
            let isLoading = true, historyBaseline = null, historySignature = '', pendingPaymentSnapshot = null;
            let realUndoStack = [];
            let savingErrorShown = false;
            // --- ESTADO GLOBAL ---
            let isDataLocked = false, isEditLocked = false;
            let editLockRanges = [];
            let pinModalPurpose = ''; // 'unlockVisibility' ou 'unlockEditing'
            let currentDate = new Date();
            currentDate.setDate(1); // Garante que começa no dia 1 do mês atual
            currentDate.setHours(0, 0, 0, 0);
            const actualCurrentDate = new Date(); // Mantém a data real para referência
            actualCurrentDate.setHours(0, 0, 0, 0);
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            let tempSelectedMonth, tempSelectedYear;
            let caixinhaParaRetirar = null; // Guarda a caixinha selecionada para retirada
            let caixinhaParaExcluir = null;
            let totalCaixinhaParaDistribuir = 0;
            let cropperInstance = null;
            let tempCroppedImage = null;
            let lastCheckedExpenseCheckbox = null; // Armazena o último checkbox de despesa marcado
            let itemRecorrenteParaEditar = null; // Armazena dados do item recorrente durante a edição
            let itemEditorValidationAttempted = false;
            let trash = []; // Lixeira
            let selectedUserToShare = null;
            let modalStack = []; // Gerenciador de modais abertos
            let actionAfterPin = null;
            let itemParaExcluir = null;
            let undoStack = [];
            let pendingSpreadsheetImport = null;
            let pendingEditLockScope = null;
            let pendingEditUnlockScope = null;
            let pendingExpenseStatusSelection = null;
            let pendingInsufficientFundsAction = null;
            let pendingCaixinhaSelectTarget = null;
            let scrollMorphLastY = 0;
            let scrollMorphDirection = 1;
            let simulationState = {
                active: false,
                snapshot: null,
                startedAt: null,
                triggerExpenseId: null,
                triggerMonthKey: null
            };

            // --- DADOS (INICIADO VAZIO) ---
            let caixinhas = [];

            let financialData = {};
            let analyticsYear = currentDate.getFullYear();
            let analyticsMonthFilter = 'all';
            let analyticsYearChart = null;
            let analyticsCurrentChart = null;
            let highlightedSearchResult = null;
            let highlightedSearchTimeout = null;
            let calculatorTransferValue = null;
            let scrollMorphFrame = null;
            const collapsedColumnState = {};
            const columnPagerState = {};
            const timelinePagerState = {};
            const DEFAULT_VISIBLE_ITEMS = 4;
            const mockUsers = [
                { id: 1, name: 'Alice', avatar: 'https://placehold.co/40x40/A78BFA/FFFFFF?text=A' },
                { id: 2, name: 'Bruno', avatar: 'https://placehold.co/40x40/F472B6/FFFFFF?text=B' },
                { id: 3, name: 'Carla', avatar: 'https://placehold.co/40x40/60A5FA/FFFFFF?text=C' },
                { id: 4, name: 'Daniel', avatar: 'https://placehold.co/40x40/34D399/FFFFFF?text=D' }
            ];

            function getCofreTotal() {
                return caixinhas.reduce((acc, caixinha) => acc + caixinha.valor, 0);
            }

            function normalizeCaixinhaEntry(entry = {}) {
                return {
                    id: entry.id || generateItemId(),
                    nome: entry.nome || 'Caixinha',
                    valor: roundToTwo(Number(entry.valor) || 0),
                    inicio: entry.inicio || null,
                    termino: entry.termino || null,
                    foto: entry.foto || null,
                    taxaJuros: Math.max(0, Number(entry.taxaJuros) || 0),
                    jurosTipo: entry.jurosTipo === 'monthly' || entry.jurosTipo === 'yearly' ? entry.jurosTipo : 'none'
                };
            }

            function getCaixinhaMonthlyRate(caixinha) {
                const taxa = Math.max(0, Number(caixinha?.taxaJuros) || 0) / 100;
                if (!taxa) return 0;
                if (caixinha?.jurosTipo === 'yearly') {
                    return Math.pow(1 + taxa, 1 / 12) - 1;
                }
                return caixinha?.jurosTipo === 'monthly' ? taxa : 0;
            }

            function projectCaixinhaValue(caixinha, months = 0) {
                const valorBase = roundToTwo(Number(caixinha?.valor) || 0);
                const totalMonths = Math.max(0, Number(months) || 0);
                const monthlyRate = getCaixinhaMonthlyRate(caixinha);
                if (!monthlyRate || totalMonths === 0) return valorBase;
                return roundToTwo(valorBase * Math.pow(1 + monthlyRate, totalMonths));
            }

            function buildSimulationSnapshot() {
                return {
                    app: buildUndoSnapshot('simulação'),
                    collapsedColumnState: cloneSerializable(collapsedColumnState)
                };
            }

            function restoreSimulationSnapshot(snapshot) {
                if (!snapshot?.app) return;
                restoreUndoSnapshot(snapshot.app);
                undoStack = realUndoStack; realUndoStack = [];
                resetHistoryBaseline();
                Object.keys(collapsedColumnState).forEach(key => delete collapsedColumnState[key]);
                if (snapshot.collapsedColumnState && typeof snapshot.collapsedColumnState === 'object') {
                    Object.assign(collapsedColumnState, snapshot.collapsedColumnState);
                }
                updateUndoButtonState();
            }

            function resetSimulationState(save = false) {
                simulationState = {
                    active: false,
                    snapshot: null,
                    startedAt: null,
                    triggerExpenseId: null,
                    triggerMonthKey: null
                };
                if (save) saveState();
            }

            // --- TEXTOS E DEFINIÇÕES DOS INDICADORES ---
            const indicatorInfo = {
                cofre: { title: 'Saldo no Cofre', description: 'É o valor total que você guardou em todas as suas "caixinhas" (objetivos). Esse dinheiro não está disponível para as despesas do dia a dia, a menos que você faça um resgate.', formula: 'Soma dos valores de todas as caixinhas.', example: 'Se você tem R$ 500 na caixinha de "Emergência" e R$ 300 na de "Viagem", o saldo no cofre é R$ 800.' },
                alocado: { title: 'Alocado para Próx. Mês', description: 'É o dinheiro que sobrou do mês anterior e que você decidiu adiantar para ajudar a cobrir as despesas do próximo mês.', formula: 'Valor definido no fluxo de "Sobras".', example: 'No final de setembro, sobraram R$ 200. Você decidiu alocar esse valor para outubro. Em outubro, este indicador mostrará R$ 200.' },
                entradas: { title: 'Entradas Previstas (EP)', description: 'É a soma de todo o dinheiro que você espera receber no mês, como salários, bônus, resgates do cofre, etc.', formula: 'Soma de todos os itens na coluna "Entradas".', example: 'Salário (R$ 5.000) + Freela (R$ 450) = R$ 5.450.' },
                despesas: { title: 'Despesas Previstas (DP)', description: 'É a soma de todos os seus gastos e contas do mês, mesmo os que você ainda não pagou.', formula: 'Soma de todos os itens na coluna "Despesas".', example: 'Aluguel (R$ 1.800) + Luz (R$ 150) = R$ 1.950.' },
                pago: { title: 'Pago no Mês (PM)', description: 'Mostra o valor total das despesas que você já marcou como pagas neste mês.', formula: 'Soma de todas as despesas com a caixa de seleção marcada.', example: 'Se você pagou o aluguel de R$ 1.800 e a internet de R$ 100, o valor "Pago no Mês" será R$ 1.900.' },
                falta: { title: 'Quanto falta pagar', description: 'É o valor que ainda falta para quitar todas as despesas previstas para o mês.', formula: 'max(Despesas Previstas - Pago no Mês, 0)', example: 'Se suas despesas são R$ 3.000 e você já pagou R$ 1.000, ainda faltam R$ 2.000 para pagar.' },
                'falta-pagar': { title: 'Falta para Pagar', description: 'Este alerta aparece quando suas despesas são maiores que suas entradas. Ele mostra quanto dinheiro está faltando para cobrir todas as contas.', formula: 'max(Despesas Previstas - Entradas Previstas, 0)', example: 'Se suas entradas são R$ 4.000 e suas despesas são R$ 4.500, este indicador mostrará que faltam R$ 500.' },
                sobras: { title: 'Sobras', description: 'Calcula em tempo real o que sobraria se todas as suas entradas e despesas previstas se confirmassem.', formula: 'max(Entradas Previstas - Despesas Previstas, 0)', example: 'Se suas entradas são R$ 5.000 e suas despesas R$ 4.200, as sobras são de R$ 800. Se adicionar uma nova despesa de R$ 100, as sobras caem para R$ 700.' }
            };

            // --- Seletores de Elementos ---
            const indicatorsGrid = document.getElementById('indicators-grid');
            const entradasListContainer = document.getElementById('entradas-list-container');
            const despesasListContainer = document.getElementById('despesas-list-container');
            const selectAllExpensesBtn = document.getElementById('select-all-expenses-btn');
            const deselectAllExpensesBtn = document.getElementById('deselect-all-expenses-btn');
            const simulationModeToggleBtn = document.getElementById('simulation-mode-toggle-btn');
            const simulationBanner = document.getElementById('simulation-banner');
            const simulationBannerCopy = document.getElementById('simulation-banner-copy');
            const simulationOpenCofreBtn = document.getElementById('simulation-open-cofre-btn');
            const simulationNewCaixinhaBtn = document.getElementById('simulation-new-caixinha-btn');
            const simulationPayAllBtn = document.getElementById('simulation-pay-all-btn');
            const simulationEndBtn = document.getElementById('simulation-end-btn');
            const entradasAnotacao = document.getElementById('entradas-anotacao');
            const despesasAnotacao = document.getElementById('despesas-anotacao');
            const geralAnotacao = document.getElementById('geral-anotacao');
            const undoActionButton = document.getElementById('undo-action-button');

            // --- LÓGICA DA TELA DE PIN (INICIAL) ---
            const pinWrapper = document.getElementById('pin-wrapper');
            const mainAppContainer = document.getElementById('main-app-container');
            const srAnnouncer = document.getElementById('sr-announcer');
            const pinDots = document.getElementById('pin-dots').children;
            const errorMessage = document.getElementById('error-message');
            const keypad = document.getElementById('keypad');
            let currentPin = '';
            // Password verification belongs to MLGAccount.

            function updatePinDisplay() { for (let i = 0; i < pinDots.length; i++) {if (i < currentPin.length) {pinDots[i].classList.add('bg-green-700', 'border-green-600');pinDots[i].classList.remove('border-gray-700');} else {pinDots[i].classList.remove('bg-green-700', 'border-green-600');pinDots[i].classList.add('border-gray-700');}}if (currentPin.length > 0) srAnnouncer.textContent = `Dígito ${currentPin.length} de 4 inserido.`; else srAnnouncer.textContent = 'PIN limpo.';}
            function handleDigitInput(digit) { if (currentPin.length < 4) {errorMessage.classList.add('opacity-0');currentPin += digit;updatePinDisplay();if (currentPin.length === 4) validatePin();}}
            function handleBackspace() { if (currentPin.length > 0) {errorMessage.classList.add('opacity-0');currentPin = currentPin.slice(0, -1);updatePinDisplay();}}
            function handleClear() { if (currentPin.length > 0) {errorMessage.classList.add('opacity-0');currentPin = '';updatePinDisplay();}}
            async function validatePin() { if (await MLGAccount.unlock()) showMainApp(); }
            keypad.addEventListener('click', (event) => { const button = event.target.closest('.keypad-button'); if (!button || !button.dataset.key) return; const key = button.dataset.key; if (/\d/.test(key)) handleDigitInput(key); else if (key === 'backspace') handleClear(); });

            // --- LÓGICA DA TELA PRINCIPAL E PRIVACIDADE ---
            function showMainApp() { document.body.classList.remove('flex', 'items-center', 'justify-center'); mainAppContainer.style.display = 'block'; loadState(); isLoading = false; resetHistoryBaseline(); setTimeout(() => mainAppContainer.style.opacity = 1, 10); updateAllUI(); }
            function applySensitiveBlurState() {
                document.querySelectorAll('.sensitive-data').forEach(el => {
                    el.classList.toggle('blur-md', isDataLocked);
                });
            }
            function lockData() { isDataLocked = true; visibilityLock.classList.remove('opacity-0','pointer-events-none'); updateVisibilityButton(); applySensitiveBlurState(); srAnnouncer.textContent = 'Dados financeiros ocultados.'; saveState(); }
            function unlockData() { isDataLocked = false; visibilityLock.classList.add('opacity-0','pointer-events-none'); updateVisibilityButton(); applySensitiveBlurState(); srAnnouncer.textContent = 'Dados financeiros revelados.'; saveState(); }

            // --- LÓGICA DE RENDERIZAÇÃO E ATUALIZAÇÃO DA UI ---
            function roundToTwo(num) { return +(Math.round(num + "e+2")  + "e-2"); }
            function formatCurrency(value) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
            function parseNumberInputValue(value) {
                if (typeof value === 'number') {
                    return Number.isFinite(value) ? value : 0;
                }
                const normalized = String(value ?? '')
                    .trim()
                    .replace(/\s/g, '')
                    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
                    .replace(',', '.');
                const numericValue = Number.parseFloat(normalized);
                return Number.isFinite(numericValue) ? numericValue : 0;
            }
            function normalizeSearchText(value = '') {
                return String(value)
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase();
            }
            function formatPercent(value) {
                return `${Number(value || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}%`;
            }

            function getExpensePaymentState(item = {}) {
                if (item.pago) return 'paid';
                if (item.paymentState === 'paid') return 'paid';
                if (item.paymentState === 'scheduled') return 'scheduled';
                if (item.paymentState === 'on_hold') return 'on_hold';
                if (item.paymentState === 'simulation') return 'simulation';
                if (item.paymentState === 'unpayable' || item.status === 'unpayable') return 'unpayable';
                return 'pending';
            }

            function setExpensePaymentState(item, paymentState, options = {}) {
                if (!item) return;
                const normalizedState = ['paid', 'scheduled', 'simulation', 'unpayable', 'pending', 'on_hold'].includes(paymentState)
                    ? paymentState
                    : 'pending';
                item.pago = normalizedState === 'paid';
                if (item.pago) {
                    item.paidAt = options.paidAt || new Date().toISOString();
                    item.paymentState = 'paid';
                } else {
                    delete item.paidAt;
                    item.paymentState = normalizedState;
                }
                delete item.status;
            }

            function getExpenseStatusPresentation(item) {
                switch (getExpensePaymentState(item)) {
                    case 'on_hold': return {text:'On hold', bg:'bg-gray-100 dark:bg-zinc-800', textColor:'text-gray-500', tooltip:'Linha sem status na planilha.'};
                    case 'paid':
                        return {
                            text: 'Pago',
                            bg: 'bg-green-200 dark:bg-green-800',
                            textColor: 'text-green-800 dark:text-green-200',
                            tooltip: 'Despesa realmente quitada neste mês.'
                        };
                    case 'scheduled':
                        return {
                            text: 'Ainda não',
                            bg: 'bg-yellow-200 dark:bg-yellow-800',
                            textColor: 'text-yellow-800 dark:text-yellow-200',
                            tooltip: 'Você já separou o dinheiro, mas ainda não chegou o dia de pagar.'
                        };
                    case 'simulation':
                        return {
                            text: 'Sandbox',
                            bg: 'bg-blue-200 dark:bg-blue-900/60',
                            textColor: 'text-blue-800 dark:text-blue-200',
                            tooltip: 'Esta despesa está em modo sandbox e não altera o fechamento real enquanto a sandbox estiver ativa.'
                        };
                    case 'unpayable':
                        return {
                            text: 'Sem saldo',
                            bg: 'bg-red-200 dark:bg-red-800',
                            textColor: 'text-red-800 dark:text-red-200',
                            tooltip: 'Não havia saldo suficiente para marcar esta despesa como paga.'
                        };
                    default:
                        return {
                            text: 'Pendente',
                            bg: 'bg-gray-200 dark:bg-zinc-800',
                            textColor: 'text-gray-700 dark:text-zinc-200',
                            tooltip: 'Despesa prevista e ainda pendente de pagamento.'
                        };
                }
            }

            function getExpenseStatusText(item, transform = 'normal') {
                const text = MLGDomain.exportStatus(item);
                return transform === 'upper' ? text.toUpperCase() : text;
            }

            function getCategoryChipClasses(type, item = {}) {
                if (item.isUnforeseen) {
                    return type === 'entradas'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/60'
                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800/60';
                }
                return type === 'entradas'
                    ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800/60'
                    : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800/60';
            }

            function syncAllocatedEntryForMonth(monthKey) {
                financialData[monthKey] = normalizeMonthDataEntry(financialData[monthKey]);
                const monthData = financialData[monthKey];
                const allocationId = getAllocationEntryId(monthKey);
                monthData.entradas = monthData.entradas.filter(item =>
                    item && !item.systemAllocation && Number(item.id) !== allocationId
                );

                const amount = roundToTwo(Number(monthData.alocadoProximoMes) || 0);
                if (amount > 0) {
                    const allocationEntry = buildAllocationEntryForMonth(monthKey, amount);
                    if (allocationEntry) {
                        monthData.entradas.unshift(allocationEntry);
                    }
                }
                return monthData;
            }

            function addAllocationToNextMonth(amount) {
                const normalizedAmount = roundToTwo(Number(amount) || 0);
                if (normalizedAmount <= 0) return null;
                const nextMonth = new Date(currentDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                const nextKey = getMonthKey(nextMonth);
                const nextMonthData = ensureMonthData(nextKey);
                nextMonthData.alocadoProximoMes = roundToTwo((Number(nextMonthData.alocadoProximoMes) || 0) + normalizedAmount);
                const sourceMonth = ensureMonthData(getMonthKey(currentDate));
                sourceMonth.allocationOut = roundToTwo((sourceMonth.allocationOut || 0) + normalizedAmount);
                syncAllocatedEntryForMonth(nextKey);
                return nextKey;
            }

            function resetPaidExpensesForSandbox(monthKey) {
                const monthData = ensureMonthData(monthKey);
                let resetCount = 0;
                monthData.despesas.forEach(item => {
                    if (getExpensePaymentState(item) === 'paid') {
                        setExpensePaymentState(item, 'pending');
                        resetCount += 1;
                    }
                });
                monthData.sobrasDistributed = false;
                clearUnpayableStatuses(monthKey);
                return resetCount;
            }

            function clearUnpayableStatuses(monthKey) {
                const monthData = ensureMonthData(monthKey);
                monthData.despesas.forEach(item => {
                    if (getExpensePaymentState(item) === 'unpayable') {
                        setExpensePaymentState(item, 'pending');
                    }
                });
            }

            function calculateAvailableForPayments(monthKey, excludedIds = []) {
                const monthData = ensureMonthData(monthKey);
                const ignoredIds = new Set(excludedIds.map(Number));
                const entradasTotal = monthData.entradas.reduce((acc, entry) => acc + entry.valor, 0);
                const despesasPagasTotal = monthData.despesas
                    .filter(entry => entry.pago && !ignoredIds.has(Number(entry.id)))
                    .reduce((acc, entry) => acc + entry.valor, 0);
                return roundToTwo(entradasTotal - despesasPagasTotal);
            }

            function createImplicitFundsEntry(amount, description = 'Entradas não especificadas para cobrir pagamentos') {
                const normalizedAmount = roundToTwo(Number(amount) || 0);
                if (normalizedAmount <= 0) return null;
                const key = getMonthKey(currentDate);
                const monthData = ensureMonthData(key);
                const implicitEntry = {
                    id: generateItemId(),
                    nome: description,
                    valor: normalizedAmount,
                    data: getDefaultItemDate(),
                    foto: null,
                    isUnforeseen: true,
                    implicitCoverage: true
                };
                monthData.entradas.push(implicitEntry);
                return implicitEntry;
            }

            function openInsufficientFundsPrompt({ shortfall = 0, description = 'O saldo disponível não é suficiente para esta despesa.', onConfirm = null, opener = document.activeElement } = {}) {
                pendingInsufficientFundsAction = typeof onConfirm === 'function' ? onConfirm : null;
                if (insufficientFundsDescription) insufficientFundsDescription.textContent = description;
                if (insufficientFundsShortfall) {
                    insufficientFundsShortfall.textContent = shortfall > 0
                        ? `Faltam ${formatCurrency(roundToTwo(shortfall))} para completar esse pagamento.`
                        : '';
                }
                openModal(insufficientFundsModal, opener);
            }

            function openExpenseStatusChooser(item, opener = document.activeElement) {
                if (!item) return;
                pendingExpenseStatusSelection = {
                    monthKey: getMonthKey(currentDate),
                    itemId: Number(item.id)
                };
                if (expenseStatusModalItemName) {
                    expenseStatusModalItemName.textContent = `${item.nome} • ${formatCurrency(roundToTwo(item.valor))}`;
                }
                openModal(expenseStatusModal, opener);
            }

            function renderSimulationBanner() {
                if (!simulationBanner) return;
                simulationBanner.classList.toggle('hidden', !simulationState.active);
                document.body.classList.toggle('simulation-active', simulationState.active);
                if (simulationModeToggleBtn) {
                    simulationModeToggleBtn.classList.toggle('is-active', simulationState.active);
                    simulationModeToggleBtn.setAttribute('aria-pressed', String(simulationState.active));
                    simulationModeToggleBtn.innerHTML = simulationState.active
                        ? '<i class="fa-solid fa-rotate-left"></i><span>Encerrar sandbox</span>'
                        : '<i class="fa-solid fa-flask"></i><span>Modo sandbox</span>';
                }
                if (!simulationBannerCopy) return;
                if (!simulationState.active) {
                    simulationBannerCopy.textContent = 'Teste pagamentos, cofre, caixinhas e alocação para o próximo mês sem gravar de verdade. Ao encerrar, tudo volta exatamente ao estado anterior.';
                    return;
                }
                const monthLabel = getMonthLabelFromKey(simulationState.triggerMonthKey || getMonthKey(currentDate)) || `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
                simulationBannerCopy.textContent = `Sandbox ativa em ${monthLabel}. Você pode testar pagamentos, criar caixinhas, usar o cofre e fechar o mês inteiro. Ao clicar em "Encerrar sandbox", todo esse cenário é descartado na hora.`;
            }

            function startSimulationMode(item = null) {
                if (!simulationState.active) {
                    const monthKey = getMonthKey(currentDate);
                    simulationState = {
                        active: true,
                        snapshot: buildSimulationSnapshot(),
                        startedAt: new Date().toISOString(),
                        triggerExpenseId: item?.id || null,
                        triggerMonthKey: monthKey
                    };
                    realUndoStack = undoStack; undoStack = []; resetHistoryBaseline();
                    Object.values(financialData).forEach(data => {
                        (data.simulationTemplates || []).forEach(template => {
                            const {type, ...item} = cloneSerializable(template);
                            data[type].push(item);
                        });
                    });
                    const resetCount = 0;
                    renderSimulationBanner();
                    updateAllUI();
                    showToast(resetCount > 0
                        ? 'Sandbox iniciada. As despesas pagas voltaram a ficar pendentes para você testar do zero.'
                        : 'Sandbox iniciada. Tudo o que você testar aqui pode ser descartado depois.');
                    return;
                } else if (item?.id) {
                    simulationState.triggerExpenseId = item.id;
                    simulationState.triggerMonthKey = getMonthKey(currentDate);
                }
                renderSimulationBanner();
                updateAllUI();
                showToast('Sandbox iniciada. Tudo o que você testar aqui pode ser descartado depois.');
            }

            function endSimulationMode({ silent = false } = {}) {
                if (!simulationState.active || !simulationState.snapshot) {
                    resetSimulationState();
                    renderSimulationBanner();
                    updateAllUI();
                    return;
                }
                const snapshot = simulationState.snapshot;
                resetSimulationState();
                restoreSimulationSnapshot(snapshot);
                updateAllUI();
                if (!silent) showToast('Sandbox encerrada. O cenário real foi restaurado.');
            }

            function markExpenseCollectionPaid(items, monthKey, options = {}) {
                const targetItems = (Array.isArray(items) ? items : []).filter(Boolean);
                if (!targetItems.length) return false;
                pendingPaymentSnapshot = buildUndoSnapshot('pagamento');
                pushUndoSnapshot('pagamento');
                targetItems.forEach(item => setExpensePaymentState(item, 'paid', options));
                clearUnpayableStatuses(monthKey);
                return true;
            }

            function applyExpenseStatusSelection(choice) {
                if (!pendingExpenseStatusSelection) return;
                const { monthKey, itemId } = pendingExpenseStatusSelection;
                const monthData = ensureMonthData(monthKey);
                const item = monthData.despesas.find(entry => Number(entry.id) === Number(itemId));
                pendingExpenseStatusSelection = null;
                if (!item) {
                    closeTopModal();
                    return;
                }

                if (choice === 'paid') {
                    const didPay = markExpenseCollectionPaid([item], monthKey, { opener: document.activeElement });
                    if (didPay) {
                        closeTopModal();
                        updateAllUI();
                        checkForSobrasFlow();
                    }
                    return;
                }

                if (choice === 'scheduled') {
                    setExpensePaymentState(item, 'scheduled');
                } else if (choice === 'simulation') {
                    closeTopModal();
                    startSimulationMode(item);
                    return;
                } else {
                    setExpensePaymentState(item, 'pending');
                }

                clearUnpayableStatuses(monthKey);
                closeTopModal();
                updateAllUI();
            }

            function payAllOpenExpenses({ allowImplicitFunds = false, opener = document.activeElement } = {}) {
                const monthKey = getMonthKey(currentDate);
                const monthData = ensureMonthData(monthKey);
                const targetItems = monthData.despesas.filter(item => !item.pago);
                if (targetItems.length === 0) {
                    const canOpenSobrasFlow = monthData.despesas.length > 0 && monthData.despesas.every(item => item.pago) && !monthData.sobrasDistributed;
                    if (canOpenSobrasFlow) {
                        checkForSobrasFlow();
                        if (!sobrasModal.classList.contains('hidden')) return;
                    }
                    showToast('Não há despesas pendentes para pagar.');
                    return;
                }
                const didPay = markExpenseCollectionPaid(targetItems, monthKey, { allowImplicitFunds, opener });
                if (!didPay) return;
                updateAllUI();
                checkForSobrasFlow();
            }

            function updateAllUI() {
                ensureRecurringDataForVisibleMonth();
                syncCurrentEditLockState();
                updateDateDisplay();
                updateIndicators();
                renderLists();
                if (cofreModal && !cofreModal.classList.contains('hidden')) {
                    renderCaixinhas();
                }
                if (typeof renderSearchResults === 'function' && searchModal && !searchModal.classList.contains('hidden')) {
                    renderSearchResults();
                }
                if (typeof renderTimelineModal === 'function' && timelineModal && !timelineModal.classList.contains('hidden')) {
                    renderTimelineModal();
                }
                if (typeof updateAnalyticsModal === 'function' && analyticsModal && !analyticsModal.classList.contains('hidden')) {
                    updateAnalyticsModal();
                }
                applySensitiveBlurState();
                saveState();
            }

            function updateScrollMorphEffects() {}
            function requestScrollMorphUpdate() {}

            function updateIndicators() {
                const key = getMonthKey(currentDate);
                const data = ensureMonthData(key);

                const entradasPrevistas = data.entradas.reduce((acc, item) => acc + item.valor, 0);
                const despesasPrevistas = data.despesas.reduce((acc, item) => acc + item.valor, 0);
                const pagoNoMes = data.despesas.filter(d => d.pago).reduce((acc, item) => acc + item.valor, 0);

                const quantoFaltaPagar = Math.max(0, despesasPrevistas - pagoNoMes);
                const faltaParaPagar = Math.max(0, despesasPrevistas - entradasPrevistas);
                const sobras = Math.max(0, entradasPrevistas - despesasPrevistas - netVaultTransfers(data) - data.allocationOut);

                document.getElementById('indicator-cofre').textContent = formatCurrency(roundToTwo(getCofreTotal()));
                document.getElementById('indicator-alocado').textContent = formatCurrency(roundToTwo(data.alocadoProximoMes));
                document.getElementById('indicator-entradas').textContent = formatCurrency(roundToTwo(entradasPrevistas));
                document.getElementById('indicator-despesas').textContent = formatCurrency(roundToTwo(despesasPrevistas));
                document.getElementById('indicator-pago').textContent = formatCurrency(roundToTwo(pagoNoMes));
                document.getElementById('indicator-falta').textContent = formatCurrency(roundToTwo(quantoFaltaPagar));
                document.getElementById('indicator-sobras').textContent = formatCurrency(roundToTwo(sobras));

                const faltaPagarContainer = document.getElementById('indicator-falta-pagar-container');
                const faltaPagarValueEl = document.getElementById('indicator-falta-pagar');
                const faltaPagarTitleEl = faltaPagarContainer.querySelector('h3');
                const faltaPagarButton = faltaPagarContainer.querySelector('.help-button');

                faltaPagarValueEl.textContent = formatCurrency(roundToTwo(faltaParaPagar));

                if (faltaParaPagar > 0) {
                    faltaPagarContainer.className = "indicator-card order-5 md:order-none bg-red-100 dark:bg-red-900/40 dark:border dark:border-red-500/30 p-3 rounded-lg";
                    faltaPagarTitleEl.className = "text-sm font-medium text-red-800 dark:text-red-200";
                    faltaPagarValueEl.className = "sensitive-data text-2xl font-bold text-red-700 dark:text-red-300 mt-1";
                    faltaPagarButton.className = "help-button p-1 rounded-full text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50";
                    faltaPagarButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
                } else {
                    faltaPagarContainer.className = "indicator-card order-5 md:order-none bg-gray-100 dark:bg-zinc-950 dark:border dark:border-zinc-800 p-3 rounded-lg";
                    faltaPagarTitleEl.className = "text-sm font-medium text-gray-500 dark:text-zinc-400";
                    faltaPagarValueEl.className = "sensitive-data text-2xl font-bold text-gray-700 dark:text-zinc-200 mt-1";
                    faltaPagarButton.className = "help-button p-1 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700";
                    faltaPagarButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.546-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
                }
            }

            function renderLists() {
                const key = getMonthKey(currentDate);
                const data = ensureMonthData(key);
                renderColumn('entradas', data.entradas, entradasListContainer);
                entradasAnotacao.value = data.entradasAnotacao || '';
                renderColumn('despesas', data.despesas, despesasListContainer);
                renderSimulationBanner();
                despesasAnotacao.value = data.despesasAnotacao || '';
                geralAnotacao.value = data.geralAnotacao || '';
                renderEditLockState();
                requestScrollMorphUpdate();
            }

            function getCollapsedColumnStateKey(type) {
                return `${getMonthKey(currentDate)}::${type}`;
            }

            function isColumnCollapsed(type, itemCount) {
                if (itemCount <= getColumnPageSize()) return false;
                const key = getCollapsedColumnStateKey(type);
                if (Object.prototype.hasOwnProperty.call(collapsedColumnState, key)) {
                    return Boolean(collapsedColumnState[key]);
                }
                return true;
            }

            function setColumnCollapsed(type, isCollapsed) {
                collapsedColumnState[getCollapsedColumnStateKey(type)] = Boolean(isCollapsed);
            }

            function getColumnPagerKey(type) {
                return `${getMonthKey(currentDate)}::${type}`;
            }

            function getColumnPagerState(type) {
                const key = getColumnPagerKey(type);
                if (!columnPagerState[key]) {
                    columnPagerState[key] = { start: 0 };
                }
                return columnPagerState[key];
            }

            function getColumnPageSize() {
                return window.innerWidth < 768 ? 3 : DEFAULT_VISIBLE_ITEMS;
            }

            function clampColumnPageStart(start, itemCount) {
                const pageSize = getColumnPageSize();
                const normalized = Math.floor(Math.max(0, Number(start) || 0) / pageSize) * pageSize;
                if (itemCount <= pageSize) return 0;
                const lastStart = Math.floor((itemCount - 1) / pageSize) * pageSize;
                return Math.min(normalized, lastStart);
            }

            function getHighlightedColumnItemId(type) {
                if (!highlightedSearchResult || highlightedSearchResult.monthKey !== getMonthKey(currentDate) || highlightedSearchResult.type !== type) {
                    return null;
                }
                return Number(highlightedSearchResult.id);
            }

            function sortColumnItems(type, items) {
                const withDate = [...items].filter(i => i.data);
                const withoutDate = [...items].filter(i => !i.data);
                const sorter = (a, b) => {
                    const dateA = new Date(a.data);
                    const dateB = new Date(b.data);
                    if (dateA < dateB) return -1;
                    if (dateA > dateB) return 1;
                    return a.nome.localeCompare(b.nome);
                };

                withDate.sort(sorter);
                withoutDate.sort((a, b) => a.nome.localeCompare(b.nome));

                if (type === 'despesas') {
                    const unpaidWithDate = withDate.filter(i => !i.pago);
                    const paidWithDate = withDate.filter(i => i.pago);
                    const unpaidWithoutDate = withoutDate.filter(i => !i.pago);
                    const paidWithoutDate = withoutDate.filter(i => i.pago);
                    return [...unpaidWithDate, ...unpaidWithoutDate, ...paidWithDate, ...paidWithoutDate];
                }

                return [...withDate, ...withoutDate];
            }

            function createColumnEmptyState(type) {
                const emptyState = document.createElement('div');
                emptyState.className = 'flex flex-col items-center justify-center h-full p-4 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-lg min-h-[120px]';
                emptyState.innerHTML = `<p class="text-gray-500 dark:text-zinc-400 mb-4">Nenhuma ${type === 'entradas' ? 'entrada registrada' : 'despesa registrada'}.</p><button data-type="${type}" class="action-button-add action-button w-12 h-12 flex items-center justify-center rounded-full bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-2xl font-semibold text-gray-600 dark:text-zinc-300">+</button>`;
                return emptyState;
            }

            function createColumnAddButton(type) {
                const addButton = document.createElement('button');
                addButton.dataset.type = type;
                addButton.className = 'action-button-add action-button w-full mt-1 px-4 py-2.5 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-sm font-semibold text-gray-700 dark:text-zinc-300 transition-colors';
                addButton.textContent = `Adicionar ${type === 'entradas' ? 'Entrada' : 'Despesa'}`;
                return addButton;
            }

            function createColumnToggleButton(type, isCollapsed) {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.action = 'toggle-column-view';
                button.dataset.type = type;
                button.dataset.collapsed = String(isCollapsed);
                button.dataset.tone = type === 'despesas' ? 'despesas' : 'entradas';
                button.className = 'column-toggle-button';
                button.innerHTML = isCollapsed
                    ? `<i class="fa-solid fa-angles-down"></i><span>Abrir tudo para baixo</span>`
                    : `<i class="fa-solid fa-angles-up"></i><span>Voltar ao modo scroll</span>`;
                return button;
            }

            function buildColumnPageLayer(items, type) {
                const layer = document.createElement('div');
                layer.className = 'column-page-layer list-scroll-shell';
                items.forEach(item => layer.appendChild(createItemCard(item, type)));
                return layer;
            }

            function renderColumnPageLayer(viewport, items, type, direction = 0, instant = true) {
                const newLayer = buildColumnPageLayer(items, type);
                const oldLayer = viewport.querySelector('.column-page-layer:not(.removing)');

                if (instant || !oldLayer || !direction) {
                    viewport.innerHTML = '';
                    newLayer.classList.add('state-center');
                    viewport.appendChild(newLayer);
                    return;
                }

                const enterClass = direction === 1 ? 'state-enter-next' : 'state-enter-prev';
                const exitClass = direction === 1 ? 'state-exit-next' : 'state-exit-prev';

                newLayer.classList.add(enterClass);
                viewport.appendChild(newLayer);
                void newLayer.offsetWidth;

                oldLayer.classList.add('removing');
                oldLayer.classList.remove('state-center');
                oldLayer.classList.add(exitClass);
                newLayer.classList.remove(enterClass);
                newLayer.classList.add('state-center');

                setTimeout(() => {
                    if (oldLayer.parentNode === viewport) {
                        viewport.removeChild(oldLayer);
                    }
                }, 500);
            }

            function renderCurrentColumn(type, options = {}) {
                const key = getMonthKey(currentDate);
                const data = ensureMonthData(key);
                const container = type === 'entradas' ? entradasListContainer : despesasListContainer;
                renderColumn(type, data[type], container, options);
                requestScrollMorphUpdate();
            }

            function requestColumnPage(type, step) {
                const key = getMonthKey(currentDate);
                const data = ensureMonthData(key);
                const sortedItems = sortColumnItems(type, data[type]);
                const pageSize = getColumnPageSize();
                const pagerState = getColumnPagerState(type);
                const nextStart = clampColumnPageStart(pagerState.start + (pageSize * step), sortedItems.length);
                if (nextStart === pagerState.start) return false;
                pagerState.start = nextStart;
                renderCurrentColumn(type, { direction: step > 0 ? 1 : -1, instant: false });
                return true;
            }

            function bindColumnPagerViewport(viewport, type) {
                if (viewport.dataset.bound === 'true') return;
                viewport.dataset.bound = 'true';

                let wheelLocked = false;
                let touchStartY = null;

                viewport.addEventListener('wheel', (e) => {
                    const totalItems = Number(viewport.dataset.totalItems || 0);
                    const pageSize = Number(viewport.dataset.pageSize || getColumnPageSize());
                    const pagerState = getColumnPagerState(type);
                    const direction = e.deltaY > 0 ? 1 : -1;
                    const canMove = direction === 1
                        ? pagerState.start + pageSize < totalItems
                        : pagerState.start > 0;

                    if (!canMove) return;

                    e.preventDefault();
                    if (wheelLocked) return;
                    wheelLocked = true;
                    requestColumnPage(type, direction);
                    setTimeout(() => {
                        wheelLocked = false;
                    }, 360);
                }, { passive: false });

                viewport.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                        e.preventDefault();
                        requestColumnPage(type, 1);
                    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                        e.preventDefault();
                        requestColumnPage(type, -1);
                    }
                });

                viewport.addEventListener('touchstart', (e) => {
                    touchStartY = e.changedTouches[0]?.screenY ?? null;
                }, { passive: true });

                viewport.addEventListener('touchend', (e) => {
                    if (touchStartY === null) return;
                    const endY = e.changedTouches[0]?.screenY ?? touchStartY;
                    const diff = touchStartY - endY;
                    touchStartY = null;
                    if (Math.abs(diff) < 48) return;
                    requestColumnPage(type, diff > 0 ? 1 : -1);
                }, { passive: true });
            }

            function renderColumn(type, items, container) {
                const sorted = sortColumnItems(type, items);
                container.replaceChildren();
                const list = document.createElement('div');
                list.className = 'column-expanded-list';
                if (!sorted.length) list.append(createColumnEmptyState(type));
                sorted.forEach(item => list.append(createItemCard(item, type)));
                container.append(list, createColumnAddButton(type));
            }

            function createItemCard(item, type) {
                const card = document.createElement('div');
                const isHighlighted = highlightedSearchResult &&
                    highlightedSearchResult.monthKey === getMonthKey(currentDate) &&
                    highlightedSearchResult.type === type &&
                    highlightedSearchResult.id === item.id;
                const expenseState = type === 'despesas' ? getExpensePaymentState(item) : null;
                const stateClass = expenseState === 'scheduled'
                    ? 'is-scheduled'
                    : expenseState === 'paid'
                        ? 'is-paid'
                        : expenseState === 'simulation'
                            ? 'is-sandbox'
                            : expenseState === 'unpayable'
                                ? 'is-unpayable'
                                : expenseState === 'pending'
                                    ? 'is-pending'
                                    : '';
                card.className = `item-entry-card flex items-start p-3 pl-4 rounded-2xl group relative space-x-3 ${stateClass} ${isHighlighted ? 'is-search-highlight bg-emerald-50 dark:bg-emerald-950/20' : ''}`;
                card.dataset.id = item.id;
                card.dataset.type = type;

                const formattedDate = item.data ? new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data';
                const colorClass = type === 'entradas' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                const safeName = escapeHtml(item.nome);
                const recurrenceText = item.periodicidade || 'Recorrente';
                const safeRecurrenceText = escapeHtml(recurrenceText);
                const installmentIndex = Number(item.occurrenceIndex || item.parcelaAtual || 0);
                const installmentTotal = Number(item.occurrenceTotal || item.parcelaTotal || 0);
                const isSystemAllocation = Boolean(item.systemAllocation);

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const itemDate = item.data ? new Date(item.data + 'T00:00:00') : null;
                let todayMarkerHTML = '';
                if (itemDate && itemDate.getTime() === today.getTime()) {
                    if (type === 'entradas') {
                        todayMarkerHTML = `<span tabindex="0" class="hover-tooltip inline-flex flex-shrink-0 mt-0.5" data-tooltip="Esta entrada está marcada para hoje."><svg class="w-4 h-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg></span>`;
                    } else if (type === 'despesas' && !item.pago) {
                        todayMarkerHTML = `<span tabindex="0" class="hover-tooltip inline-flex flex-shrink-0 mt-0.5" data-tooltip="Esta despesa vence hoje e ainda não foi marcada como paga."><svg class="w-4 h-4 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></span>`;
                    }
                }

                let checkboxHTML = '', scheduleButtonHTML = '', statusHTML = '', strikethroughClass = '';
                const categoryChip = `<span tabindex="0" class="hover-tooltip item-entry-meta-chip ${getCategoryChipClasses(type, item)}" data-tooltip="${item.isUnforeseen ? 'Lançamento fora do planejamento original do mês.' : 'Lançamento previsto no seu planejamento do mês.'}">${item.isUnforeseen ? 'Imprevista' : 'Prevista'}</span>`;
                const recurrenceChip = item.recurrenceId
                    ? `<span tabindex="0" class="hover-tooltip item-entry-meta-chip truncate" style="max-width: 180px;" data-tooltip="Regra automática: ${safeRecurrenceText}.">${safeRecurrenceText}</span>`
                    : '';
                const installmentChip = installmentTotal > 1
                    ? `<span tabindex="0" class="hover-tooltip item-entry-meta-chip bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60" data-tooltip="Parcela ${installmentIndex} de ${installmentTotal}.">${installmentIndex}/${installmentTotal}</span>`
                    : '';
                const allocationChip = isSystemAllocation
                    ? `<span tabindex="0" class="hover-tooltip item-entry-meta-chip bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800/60" data-tooltip="Valor alocado automaticamente pelo fechamento do mês anterior.">Próx. mês</span>`
                    : '';

                if (type === 'despesas') {
                    const status = getExpenseStatusPresentation(item);
                    const isScheduled = expenseState === 'scheduled';
                    checkboxHTML = `<input type="checkbox" data-id="${item.id}" class="item-checkbox h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0 mt-3 cursor-pointer" ${item.pago ? 'checked' : ''} ${isEditLocked ? 'disabled' : ''} aria-label="${item.pago ? 'Marcar despesa como pendente' : 'Marcar despesa como paga'}">`;
                    scheduleButtonHTML = `<button type="button" data-action="schedule" class="hover-tooltip item-status-icon ${isScheduled ? 'is-active' : ''}" data-tooltip="${isScheduled ? 'Remover o status Ainda não.' : 'Marcar como Ainda não.'}" aria-label="${isScheduled ? 'Remover status Ainda não' : 'Marcar como Ainda não'}"><i class="fa-solid fa-hourglass-half"></i></button>`;
                    statusHTML = `<span tabindex="0" class="hover-tooltip item-entry-meta-chip ${status.bg} ${status.textColor} border-transparent" data-tooltip="${status.tooltip}">${status.text}</span>`;
                }

                const actionsHTML = isSystemAllocation
                    ? ''
                    : `
                            <div class="item-entry-actions opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                <button data-action="edit" class="action-button p-1.5 rounded-full text-gray-500 dark:text-zinc-400 hover:bg-gray-300 dark:hover:bg-zinc-700"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" /></svg></button>
                                <button data-action="delete" class="action-button p-1.5 rounded-full text-red-500 hover:bg-red-200 dark:hover:bg-red-900/50"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                    `;

                card.innerHTML = `
                    ${checkboxHTML}
                    ${scheduleButtonHTML}
                    <button data-action="view-image" class="action-button w-11 h-11 bg-white/80 dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 flex items-center justify-center font-bold text-gray-500 dark:text-zinc-400 text-xl flex-shrink-0 mt-1">
                        ${item.foto ? `<img src="${item.foto}" class="w-full h-full object-cover rounded-md">` : '?'}
                    </button>
                    <div class="item-entry-main">
                        <div class="flex-grow min-w-0">
                            <div class="flex items-start gap-2">
                                ${todayMarkerHTML}
                                <p class="item-entry-title sensitive-data text-gray-800 dark:text-zinc-100 ${strikethroughClass}" title="${safeName}">${safeName}</p>
                            </div>
                            <div class="item-entry-meta">
                                <span class="item-entry-meta-chip sensitive-data">${type === 'entradas' ? 'Recebimento' : 'Vencimento'}: ${formattedDate}</span>
                                ${statusHTML}
                                ${recurrenceChip}
                                ${installmentChip}
                                ${allocationChip}
                                ${categoryChip}
                            </div>
                        </div>
                        <div class="text-right flex-shrink-0 min-w-[8.5rem]">
                            <p class="item-entry-value font-bold sensitive-data ${colorClass} ${strikethroughClass}">${formatCurrency(item.valor)}</p>
                            ${actionsHTML}
                        </div>
                    </div>
                `;
                return card;
            }

            // --- LÓGICA DE NAVEGAÇÃO DE DATA ---
            const dateDisplay = document.getElementById('date-display');
            const prevMonthButton = document.getElementById('prev-month-button');
            const nextMonthButton = document.getElementById('next-month-button');
            const goToCurrentMonthButton = document.getElementById('go-to-current-month-button');
            function updateDateDisplay() { dateDisplay.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`; }
            prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); saveState(); updateAllUI(); });
            nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); saveState(); updateAllUI(); });
            goToCurrentMonthButton.addEventListener('click', (e) => {
                const isCurrentMonth = currentDate.getFullYear() === actualCurrentDate.getFullYear() && currentDate.getMonth() === actualCurrentDate.getMonth();
                if (isCurrentMonth) {
                    openModal(document.getElementById('current-month-alert-modal'), e.currentTarget);
                } else {
                    currentDate = new Date();
                    currentDate.setDate(1);
                    currentDate.setHours(0,0,0,0);
                    saveState();
                    updateAllUI();
                }
            });

            // --- GESTÃO DE MODAIS E ACESSIBILIDADE ---
            function openModal(modalElement, openerElement = document.activeElement) {
                if (modalStack.some(m => m.element === modalElement)) return;
                if (modalElement === secondaryPinWrapper) {
                    validateSecondaryPin();
                    return;
                }
                modalStack.push({ element: modalElement, opener: openerElement });
                modalElement.classList.remove('hidden');
                document.body.classList.add('modal-open');
                document.body.classList.toggle('calculator-only', modalStack.every(m => m.element.id === 'calculator-window'));

                const firstFocusable = modalElement.querySelector(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                if (firstFocusable) firstFocusable.focus();
            }

            function closeTopModal() {
                if (modalStack.length === 0) return;
                const topModal = modalStack.pop();
                if (topModal.element.id === 'sobras-modal' && pendingPaymentSnapshot) {
                    restoreUndoSnapshot(pendingPaymentSnapshot);
                    pendingPaymentSnapshot = null;
                    resetHistoryBaseline();
                    updateAllUI();
                }
                if (topModal.element.id === 'edit-recurrence-modal') {
                    if (topModal.element.dataset.choiceConfirmed === 'true') {
                        topModal.element.dataset.choiceConfirmed = 'false';
                    } else {
                        itemRecorrenteParaEditar = null;
                    }
                } else if (topModal.element.id === 'delete-item-modal') {
                    itemParaExcluir = null;
                } else if (topModal.element === secondaryPinWrapper) {
                    resetSecondaryPinState();
                    if (pinModalPurpose === 'unlockEditing') {
                        pendingEditUnlockScope = null;
                    } else if (pinModalPurpose === 'unlockAndAct') {
                        actionAfterPin = null;
                    }
                    pinModalPurpose = '';
                } else if (topModal.element.id === 'import-modal') {
                    resetImportState();
                } else if (topModal.element.id === 'confirm-lock-modal') {
                    pendingEditLockScope = null;
                } else if (topModal.element.id === 'analytics-modal') {
                    if (analyticsYearChart) {
                        analyticsYearChart.destroy();
                        analyticsYearChart = null;
                    }
                    if (analyticsCurrentChart) {
                        analyticsCurrentChart.destroy();
                        analyticsCurrentChart = null;
                    }
                } else if (topModal.element.id === 'insufficient-funds-modal') {
                    pendingInsufficientFundsAction = null;
                } else if (topModal.element.id === 'expense-status-modal') {
                    pendingExpenseStatusSelection = null;
                } else if (topModal.element.id === 'caixinha-editor-modal') {
                    pendingCaixinhaSelectTarget = null;
                }
                topModal.element.classList.add('hidden');
                document.body.classList.toggle('calculator-only', modalStack.length > 0 && modalStack.every(m => m.element.id === 'calculator-window'));
                if (topModal.opener && typeof topModal.opener.focus === 'function') {
                    topModal.opener.focus();
                }
                if (modalStack.length === 0) {
                    document.body.classList.remove('modal-open');
                }
            }

            // --- EVENTOS DE INTERAÇÃO ---
            despesasListContainer.addEventListener('click', (e) => {
                const checkbox = e.target.closest('.item-checkbox');
                if (checkbox) {
                    e.preventDefault();
                    if (isEditLocked) { showToast('Edição trancada.'); return; }
                    const itemId = parseInt(checkbox.dataset.id, 10);
                    const key = getMonthKey(currentDate);
                    const monthData = ensureMonthData(key);
                    const item = monthData.despesas.find(entry => Number(entry.id) === itemId);
                    if (!item) return;
                    if (item.pago) {
                        setExpensePaymentState(item, 'pending');
                        clearUnpayableStatuses(key);
                        updateAllUI();
                        return;
                    }
                    const didPay = markExpenseCollectionPaid([item], key, { opener: checkbox });
                    if (!didPay) return;
                    updateAllUI();
                    checkForSobrasFlow();
                }
            });

            selectAllExpensesBtn.addEventListener('click', () => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                payAllOpenExpenses({ opener: selectAllExpensesBtn });
            });

            deselectAllExpensesBtn.addEventListener('click', () => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                const monthKey = getMonthKey(currentDate);
                const monthData = ensureMonthData(monthKey);
                let changedCount = 0;
                monthData.despesas.forEach(item => {
                    if (item.pago) {
                        setExpensePaymentState(item, 'pending');
                        changedCount += 1;
                    }
                });
                clearUnpayableStatuses(monthKey);
                updateAllUI();
                showToast(changedCount > 0 ? 'Despesas pagas reabertas.' : 'Nenhuma despesa estava marcada como paga.');
            });

            // --- LÓGICA DOS MODAIS DE INFORMAÇÃO E ALERTA ---
            const alertModal = document.getElementById('alert-modal');
            const infoModal = document.getElementById('info-modal');

            indicatorsGrid.addEventListener('click', (e) => {
                const button = e.target.closest('.help-button');
                if (button) {
                    const indicator = button.dataset.indicator;
                    if (indicator === 'falta-pagar') {
                        openModal(alertModal, button);
                    } else {
                        const info = indicatorInfo[indicator];
                        if (!info) return;
                        document.getElementById('info-modal-title').textContent = info.title;
                        document.getElementById('info-modal-desc').textContent = info.description;
                        document.getElementById('info-modal-formula').textContent = info.formula;
                        document.getElementById('info-modal-example').textContent = info.example;
                        openModal(infoModal, button);
                    }
                } else if (e.target.closest('.indicator-card')?.querySelector('[data-indicator="cofre"]')) {
                     if (isEditLocked) { showToast('Edição trancada.'); return; }
                     renderCaixinhas();
                     openModal(document.getElementById('cofre-modal'), e.currentTarget);
                }
            });

            // --- LOGICA DO SELETOR DE DATA ---
            const datePickerModal = document.getElementById('date-picker-modal');
            const monthsPicker = document.getElementById('months-picker');
            const yearsPicker = document.getElementById('years-picker');
            const openCalendarGridBtn = document.getElementById('open-calendar-grid-btn');
            const calendarGridModal = document.getElementById('calendar-grid-modal');
            const calendarGridMonths = document.getElementById('calendar-grid-months');
            const calendarGridYears = document.getElementById('calendar-grid-years');
            const calendarGridYearLabel = document.getElementById('calendar-grid-year-label');
            const calendarGridYearTrigger = document.getElementById('calendar-grid-year-trigger');
            const calendarGridPrevYear = document.getElementById('calendar-grid-prev-year');
            const calendarGridNextYear = document.getElementById('calendar-grid-next-year');

            const PICKER_ITEM_HEIGHT = 42;
            const PICKER_SPACER_HEIGHT = 75;
            const YEAR_CHUNK_SIZE = 24;
            const YEAR_BUFFER_THRESHOLD = PICKER_ITEM_HEIGHT * 6;
            const CALENDAR_YEAR_PAGE_SIZE = 12;
            const pickerScrollTimeouts = { month: null, year: null };
            let yearsRangeStart = currentDate.getFullYear() - YEAR_CHUNK_SIZE;
            let yearsRangeEnd = currentDate.getFullYear() + YEAR_CHUNK_SIZE;
            let calendarGridYear = currentDate.getFullYear();
            let calendarYearPageStart = currentDate.getFullYear() - Math.floor(CALENDAR_YEAR_PAGE_SIZE / 2);
            let isCalendarYearPickerOpen = false;

            function createPickerSpacer() {
                const spacer = document.createElement('div');
                spacer.style.height = `${PICKER_SPACER_HEIGHT}px`;
                spacer.style.flexShrink = '0';
                return spacer;
            }

            function createPickerItem(label, dataKey, value, isSelected = false) {
                const item = document.createElement('div');
                item.textContent = label;
                item.dataset[dataKey] = value;
                item.className = 'picker-item p-2 text-center cursor-pointer rounded-md text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors';
                if (isSelected) item.classList.add('selected');
                item.addEventListener('click', () => {
                    item.scrollIntoView({ block: 'center', behavior: 'smooth' });
                });
                return item;
            }

            function updatePickerSelection(pickerElement, nextSelectedItem) {
                if (!nextSelectedItem) return;

                pickerElement.querySelector('.selected')?.classList.remove('selected');
                nextSelectedItem.classList.add('selected');

                if (pickerElement === monthsPicker) {
                    tempSelectedMonth = parseInt(nextSelectedItem.dataset.month, 10);
                } else {
                    tempSelectedYear = parseInt(nextSelectedItem.dataset.year, 10);
                }
            }

            function handlePickerScroll(pickerElement, type) {
                clearTimeout(pickerScrollTimeouts[type]);
                pickerScrollTimeouts[type] = setTimeout(() => {
                    const pickerBounds = pickerElement.getBoundingClientRect();
                    const pickerCenter = pickerBounds.top + (pickerBounds.height / 2);
                    let closestItem = null;
                    let minDistance = Infinity;

                    pickerElement.querySelectorAll('.picker-item').forEach((item) => {
                        const itemBounds = item.getBoundingClientRect();
                        const itemCenter = itemBounds.top + (itemBounds.height / 2);
                        const distance = Math.abs(pickerCenter - itemCenter);

                        if (distance < minDistance) {
                            minDistance = distance;
                            closestItem = item;
                        }
                    });

                    updatePickerSelection(pickerElement, closestItem);
                }, 80);
            }

            function insertYearRange(startYear, endYear, position = 'append') {
                const fragment = document.createDocumentFragment();
                for (let year = startYear; year <= endYear; year++) {
                    fragment.appendChild(createPickerItem(year, 'year', year, year === tempSelectedYear));
                }

                if (position === 'prepend') {
                    const firstYearItem = yearsPicker.querySelector('.picker-item');
                    yearsPicker.insertBefore(fragment, firstYearItem || yearsPicker.lastElementChild);
                } else {
                    yearsPicker.insertBefore(fragment, yearsPicker.lastElementChild);
                }
            }

            function extendYearsIfNeeded() {
                if (!yearsPicker.childElementCount) return;

                if (yearsPicker.scrollTop < YEAR_BUFFER_THRESHOLD) {
                    const previousScrollHeight = yearsPicker.scrollHeight;
                    const newStart = yearsRangeStart - YEAR_CHUNK_SIZE;
                    insertYearRange(newStart, yearsRangeStart - 1, 'prepend');
                    yearsRangeStart = newStart;
                    yearsPicker.scrollTop += yearsPicker.scrollHeight - previousScrollHeight;
                }

                const distanceToBottom = yearsPicker.scrollHeight - yearsPicker.clientHeight - yearsPicker.scrollTop;
                if (distanceToBottom < YEAR_BUFFER_THRESHOLD) {
                    const newEnd = yearsRangeEnd + YEAR_CHUNK_SIZE;
                    insertYearRange(yearsRangeEnd + 1, newEnd, 'append');
                    yearsRangeEnd = newEnd;
                }
            }

            function populateDatePicker() {
                tempSelectedMonth = currentDate.getMonth();
                tempSelectedYear = currentDate.getFullYear();

                monthsPicker.innerHTML = '';
                yearsPicker.innerHTML = '';

                monthsPicker.appendChild(createPickerSpacer());
                monthNames.forEach((month, index) => {
                    monthsPicker.appendChild(createPickerItem(month, 'month', index, index === tempSelectedMonth));
                });
                monthsPicker.appendChild(createPickerSpacer());

                yearsRangeStart = tempSelectedYear - YEAR_CHUNK_SIZE;
                yearsRangeEnd = tempSelectedYear + YEAR_CHUNK_SIZE;
                yearsPicker.appendChild(createPickerSpacer());
                yearsPicker.appendChild(createPickerSpacer());
                insertYearRange(yearsRangeStart, yearsRangeEnd);

                requestAnimationFrame(() => {
                    monthsPicker.querySelector(`[data-month="${tempSelectedMonth}"]`)?.scrollIntoView({ block: 'center' });
                    yearsPicker.querySelector(`[data-year="${tempSelectedYear}"]`)?.scrollIntoView({ block: 'center' });
                });
            }

            function applySelectedDate(year, month) {
                currentDate = new Date(year, month, 1);
                currentDate.setHours(0, 0, 0, 0);
                saveState();
                updateAllUI();
            }

            function syncCalendarGridView() {
                calendarGridYearLabel.textContent = calendarGridYear;
                calendarGridYearTrigger.setAttribute('aria-expanded', String(isCalendarYearPickerOpen));
                calendarGridMonths.classList.toggle('is-hidden', isCalendarYearPickerOpen);
                calendarGridYears.classList.toggle('is-hidden', !isCalendarYearPickerOpen);
            }

            function renderCalendarYears() {
                calendarGridYears.innerHTML = '';

                for (let year = calendarYearPageStart; year < calendarYearPageStart + CALENDAR_YEAR_PAGE_SIZE; year++) {
                    const yearButton = document.createElement('button');
                    yearButton.type = 'button';
                    yearButton.className = 'calendar-year-button';
                    yearButton.textContent = year;

                    if (year === actualCurrentDate.getFullYear()) {
                        yearButton.classList.add('is-current');
                    }
                    if (year === calendarGridYear) {
                        yearButton.classList.add('active');
                    }

                    yearButton.addEventListener('click', () => {
                        calendarGridYear = year;
                        renderCalendarGrid();
                        closeCalendarYearPicker();
                    });

                    calendarGridYears.appendChild(yearButton);
                }
            }

            function openCalendarYearPicker() {
                isCalendarYearPickerOpen = true;
                calendarYearPageStart = calendarGridYear - Math.floor(CALENDAR_YEAR_PAGE_SIZE / 2);
                renderCalendarYears();
                syncCalendarGridView();
            }

            function closeCalendarYearPicker() {
                isCalendarYearPickerOpen = false;
                syncCalendarGridView();
            }

            function renderCalendarGrid() {
                calendarGridMonths.innerHTML = '';

                monthNames.forEach((month, index) => {
                    const monthButton = document.createElement('button');
                    monthButton.type = 'button';
                    monthButton.className = 'calendar-month-button';
                    monthButton.textContent = month;

                    if (calendarGridYear === currentDate.getFullYear() && index === currentDate.getMonth()) {
                        monthButton.classList.add('active');
                    }

                    monthButton.addEventListener('click', () => {
                        applySelectedDate(calendarGridYear, index);
                        closeTopModal();
                    });

                    calendarGridMonths.appendChild(monthButton);
                });

                syncCalendarGridView();
            }

            dateDisplay.addEventListener('click', (e) => {
                if (isEditLocked) { showToast('Edicao trancada.'); return; }
                populateDatePicker();
                openModal(datePickerModal, e.currentTarget);
            });

            openCalendarGridBtn.addEventListener('click', (e) => {
                if (isEditLocked) { showToast('Edicao trancada.'); return; }
                calendarGridYear = currentDate.getFullYear();
                calendarYearPageStart = calendarGridYear - Math.floor(CALENDAR_YEAR_PAGE_SIZE / 2);
                isCalendarYearPickerOpen = false;
                renderCalendarGrid();
                openModal(calendarGridModal, e.currentTarget);
            });

            calendarGridYearTrigger.addEventListener('click', () => {
                if (isCalendarYearPickerOpen) {
                    closeCalendarYearPicker();
                } else {
                    openCalendarYearPicker();
                }
            });

            monthsPicker.addEventListener('scroll', () => {
                handlePickerScroll(monthsPicker, 'month');
            });

            yearsPicker.addEventListener('scroll', () => {
                extendYearsIfNeeded();
                handlePickerScroll(yearsPicker, 'year');
            });

            calendarGridPrevYear.addEventListener('click', () => {
                if (isCalendarYearPickerOpen) {
                    calendarYearPageStart -= CALENDAR_YEAR_PAGE_SIZE;
                    renderCalendarYears();
                } else {
                    calendarGridYear -= 1;
                    renderCalendarGrid();
                }
            });

            calendarGridNextYear.addEventListener('click', () => {
                if (isCalendarYearPickerOpen) {
                    calendarYearPageStart += CALENDAR_YEAR_PAGE_SIZE;
                    renderCalendarYears();
                } else {
                    calendarGridYear += 1;
                    renderCalendarGrid();
                }
            });

            document.getElementById('confirm-date-picker').addEventListener('click', () => {
                applySelectedDate(tempSelectedYear, tempSelectedMonth);
                closeTopModal();
            });

            // --- LÓGICA DO FLUXO DE SOBRAS ---
            const sobrasModal = document.getElementById('sobras-modal');
            let totalSobrasParaDistribuir = 0;
            const sobrasTotalAmountEl = document.getElementById('sobras-total-amount');
            const sobrasCofreInput = document.getElementById('sobras-cofre-input');
            const sobrasCaixinhaSelect = document.getElementById('sobras-caixinha-select');
            const sobrasAlocarInput = document.getElementById('sobras-alocar-input');
            const sobrasGastarInput = document.getElementById('sobras-gastar-input');
            const sobrasRestanteEl = document.getElementById('sobras-restante');
            const sobrasConfirmarBtn = document.getElementById('sobras-confirmar-btn');
            const sobrasCaixinhaError = document.getElementById('sobras-caixinha-error');

            function checkForSobrasFlow() {
                const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                const data = financialData[key];
                if (!data || data.sobrasDistributed) return;

                const allPaid = data.despesas.every(d => d.pago);
                if (!allPaid || data.despesas.length === 0) return;

                const entradas = data.entradas.reduce((acc, item) => acc + item.valor, 0);
                const despesas = data.despesas.reduce((acc, item) => acc + item.valor, 0);
                const sobras = Math.max(0, roundToTwo(entradas - despesas - netVaultTransfers(data) - data.allocationOut));

                if (sobras > 0) {
                    totalSobrasParaDistribuir = sobras;
                    document.getElementById('sobras-modal-title').textContent = simulationState.active
                        ? 'O que fazer com a sobra da sandbox?'
                        : 'O que fazer com o valor que sobrou?';
                    sobrasTotalAmountEl.textContent = formatCurrency(sobras);
                    sobrasRestanteEl.textContent = formatCurrency(sobras);
                    [sobrasCofreInput, sobrasAlocarInput, sobrasGastarInput].forEach(input => input.value = '');
                    sobrasCaixinhaError.textContent = '';
                    populateCaixinhasSelect();
                    validateSobrasDistribution();
                    openModal(sobrasModal);
                } else {
                    if (data) data.sobrasDistributed = true;
                    lastCheckedExpenseCheckbox = null;
                }
            }

            function populateCaixinhasSelect() {
                caixinhas = caixinhas.map(normalizeCaixinhaEntry);
                sobrasCaixinhaSelect.innerHTML = '<option value="">Selecione a caixinha</option>';
                caixinhas.forEach(caixinha => {
                    const option = document.createElement('option');
                    option.value = caixinha.id;
                    option.textContent = caixinha.nome;
                    sobrasCaixinhaSelect.appendChild(option);
                });
            }

            function validateSobrasDistribution() {
                const cofre = parseNumberInputValue(sobrasCofreInput.value);
                const alocar = parseNumberInputValue(sobrasAlocarInput.value);
                const gastar = parseNumberInputValue(sobrasGastarInput.value);
                const totalDistribuido = roundToTwo(cofre + alocar + gastar);
                const restante = roundToTwo(totalSobrasParaDistribuir - totalDistribuido);
                const isCaixinhaRequired = cofre > 0 && sobrasCaixinhaSelect.value === '';

                sobrasCaixinhaError.textContent = isCaixinhaRequired ? 'Selecione uma caixinha para guardar.' : '';
                sobrasRestanteEl.textContent = formatCurrency(restante);

                if ([cofre,alocar,gastar].every(v => Number.isFinite(v) && v >= 0) && Math.abs(restante) < 0.01 && !isCaixinhaRequired) {
                    sobrasConfirmarBtn.disabled = false;
                    sobrasRestanteEl.classList.remove('text-red-500');
                } else {
                    sobrasConfirmarBtn.disabled = true;
                    if (restante < 0) sobrasRestanteEl.classList.add('text-red-500');
                    else sobrasRestanteEl.classList.remove('text-red-500');
                }
            }

            [sobrasCofreInput, sobrasAlocarInput, sobrasGastarInput, sobrasCaixinhaSelect].forEach(el => {
                el.addEventListener('input', validateSobrasDistribution);
            });

            sobrasConfirmarBtn.addEventListener('click', () => {
                validateSobrasDistribution();
                if (isEditLocked || sobrasConfirmarBtn.disabled) return;
                const cofre = parseNumberInputValue(sobrasCofreInput.value);
                const alocar = parseNumberInputValue(sobrasAlocarInput.value);
                const gastar = parseNumberInputValue(sobrasGastarInput.value);
                if ([cofre, alocar, gastar].some(v => !Number.isFinite(v) || v < 0)) return;
                const data = ensureMonthData(getMonthKey(currentDate));
                const box = caixinhas.find(c => String(c.id) === sobrasCaixinhaSelect.value);
                if (cofre && !box) return;
                pushUndoSnapshot('distribuição de sobras');
                if (cofre) {box.valor = roundToTwo(box.valor + cofre); recordVaultTransfer(data, cofre, box.id);}
                if (alocar) addAllocationToNextMonth(alocar);
                if (gastar) data.despesas.push({id:generateItemId(), nome:'Gastos diversos', valor:gastar, pago:true, paymentState:'paid', data:formatDateOnly(currentDate)});
                data.sobrasDistributed = true;
                pendingPaymentSnapshot = null;
                closeTopModal(); updateAllUI(); showToast('Distribuição salva.');
            });

            document.getElementById('sobras-cancelar-btn').addEventListener('click', () => {
                closeTopModal();
                showToast('Distribuição cancelada. Nenhum valor foi movimentado.');
            });

             // Atalhos
            function resetSobrasInputs() { [sobrasCofreInput, sobrasAlocarInput, sobrasGastarInput].forEach(i => i.value = ''); }
            document.getElementById('sobras-guardar-tudo').addEventListener('click', () => { resetSobrasInputs(); sobrasCofreInput.value = totalSobrasParaDistribuir.toFixed(2); validateSobrasDistribution(); });
            document.getElementById('sobras-alocar-tudo').addEventListener('click', () => { resetSobrasInputs(); sobrasAlocarInput.value = totalSobrasParaDistribuir.toFixed(2); validateSobrasDistribution(); });
            document.getElementById('sobras-gastar-tudo').addEventListener('click', () => { resetSobrasInputs(); sobrasGastarInput.value = totalSobrasParaDistribuir.toFixed(2); validateSobrasDistribution(); });

            // --- LÓGICA DO COFRE E CAIXINHAS ---
            const cofreModal = document.getElementById('cofre-modal');
            const openCaixinhaEditorBtn = document.getElementById('open-caixinha-editor-btn');
            const showOnlyDatelessCheckbox = document.getElementById('show-only-dateless-checkbox');
            const caixinhasTotalAmountEl = document.getElementById('caixinhas-total-amount');
            const caixinhasProjected6mEl = document.getElementById('caixinhas-projected-6m');
            const caixinhasProjectedGainEl = document.getElementById('caixinhas-projected-gain');
            const caixinhaEditorModal = document.getElementById('caixinha-editor-modal');
            const caixinhaEditorTitle = document.getElementById('caixinha-editor-title');
            const caixinhaEditorId = document.getElementById('caixinha-editor-id');
            const caixinhaFotoPreview = document.getElementById('caixinha-foto-preview');
            const caixinhaFotoInput = document.getElementById('caixinha-foto-input');
            const caixinhaNomeInput = document.getElementById('caixinha-nome-input');
            const caixinhaInicioInput = document.getElementById('caixinha-inicio-input');
            const caixinhaTerminoInput = document.getElementById('caixinha-termino-input');
            const caixinhaJurosInput = document.getElementById('caixinha-juros-input');
            const caixinhaJurosTipoSelect = document.getElementById('caixinha-juros-tipo-select');
            const retirarCofreModal = document.getElementById('retirar-cofre-modal');
            const retirarCofreTitle = document.getElementById('retirar-cofre-title');
            const retirarValorInput = document.getElementById('retirar-valor-input');
            const retirarMaxInfo = document.getElementById('retirar-max-info');
            const retirarErrorMessage = document.getElementById('retirar-error-message');
            const retirarConfirmarBtn = document.getElementById('retirar-confirmar-btn');
            const caixinhaEditorSalvarBtn = document.getElementById('caixinha-editor-salvar-btn');

            const deleteCaixinhaModal = document.getElementById('delete-caixinha-modal');
            const deleteCaixinhaTotalAmountEl = document.getElementById('delete-caixinha-total-amount');
            const deleteCaixinhaTransferirInput = document.getElementById('delete-caixinha-transferir-input');
            const deleteCaixinhaTransferirSelect = document.getElementById('delete-caixinha-transferir-select');
            const deleteCaixinhaTransferirError = document.getElementById('delete-caixinha-transferir-error');
            const deleteCaixinhaAlocarInput = document.getElementById('delete-caixinha-alocar-input');
            const deleteCaixinhaGastarInput = document.getElementById('delete-caixinha-gastar-input');
            const deleteCaixinhaRestanteEl = document.getElementById('delete-caixinha-restante');
            const deleteCaixinhaConfirmarBtn = document.getElementById('delete-caixinha-confirmar-btn');

            showOnlyDatelessCheckbox.addEventListener('change', renderCaixinhas);

            function renderCaixinhasSummary() {
                caixinhas = caixinhas.map(normalizeCaixinhaEntry);
                const totalAtual = roundToTwo(caixinhas.reduce((acc, caixinha) => acc + caixinha.valor, 0));
                const total6Meses = roundToTwo(caixinhas.reduce((acc, caixinha) => acc + projectCaixinhaValue(caixinha, 6), 0));
                const ganho12Meses = roundToTwo(caixinhas.reduce((acc, caixinha) => acc + (projectCaixinhaValue(caixinha, 12) - caixinha.valor), 0));
                caixinhasTotalAmountEl.textContent = formatCurrency(totalAtual);
                caixinhasProjected6mEl.textContent = formatCurrency(total6Meses);
                caixinhasProjectedGainEl.textContent = formatCurrency(ganho12Meses);
            }

            function renderCaixinhas() {
                renderCaixinhasSummary();
                const caixinhasListContainer = document.getElementById('caixinhas-list-container');
                caixinhasListContainer.innerHTML = '';
                const showDateless = showOnlyDatelessCheckbox.checked;
                caixinhas = caixinhas.map(normalizeCaixinhaEntry);
                const filteredCaixinhas = showDateless
                    ? caixinhas.filter(c => !c.inicio && !c.termino)
                    : caixinhas;

                if (filteredCaixinhas.length === 0) {
                    caixinhasListContainer.innerHTML = `<div class="text-center text-gray-500 dark:text-zinc-400 py-10"><p>Nenhuma caixinha encontrada.</p><p class="text-sm">${showDateless ? 'Desmarque o filtro para ver todas.' : 'Crie uma nova para começar!'}</p></div>`;
                    return;
                }
                filteredCaixinhas.forEach(caixinha => {
                    const div = document.createElement('div');
                    div.className = "bg-white dark:bg-zinc-900 p-4 rounded-lg flex items-center space-x-4";
                    div.dataset.id = caixinha.id;
                    const dataInicio = caixinha.inicio ? new Date(caixinha.inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '';
                    const dataTermino = caixinha.termino ? new Date(caixinha.termino + 'T00:00:00').toLocaleDateString('pt-BR') : '';
                    const temJuros = caixinha.taxaJuros > 0 && caixinha.jurosTipo !== 'none';
                    const jurosLabel = temJuros
                        ? `${formatPercent(caixinha.taxaJuros)} ${caixinha.jurosTipo === 'monthly' ? 'a.m.' : 'a.a.'}`
                        : 'Sem juros configurados';
                    const projections = [
                        { label: '3m', value: projectCaixinhaValue(caixinha, 3) },
                        { label: '6m', value: projectCaixinhaValue(caixinha, 6) },
                        { label: '12m', value: projectCaixinhaValue(caixinha, 12) }
                    ];

                    div.innerHTML = `
                        <img src="${caixinha.foto || 'https://placehold.co/64x64/e2e8f0/64748b?text=Foto'}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-zinc-700">
                        <div class="flex-grow">
                            <h4 class="font-bold text-lg text-gray-800 dark:text-zinc-100">${escapeHtml(caixinha.nome)}</h4>
                            <p class="text-sm text-gray-500 dark:text-zinc-400">${dataInicio ? `De: ${dataInicio}` : ''} ${dataTermino ? `Até: ${dataTermino}` : ''}</p>
                            <p class="text-xl font-semibold text-indigo-600 dark:text-indigo-400 mt-2">${formatCurrency(caixinha.valor)}</p>
                            <div class="item-entry-meta mt-3">
                                <span class="item-entry-meta-chip ${temJuros ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60' : ''}">Rendimento: ${jurosLabel}</span>
                                <span class="item-entry-meta-chip">Ganho 12m: ${formatCurrency(roundToTwo(projections[2].value - caixinha.valor))}</span>
                            </div>
                            <div class="caixinha-projection-grid">
                                ${projections.map(projection => `
                                    <div class="caixinha-projection-pill">
                                        <p class="text-[0.68rem] uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">${projection.label}</p>
                                        <p class="text-sm font-semibold text-gray-900 dark:text-zinc-100 mt-1 sensitive-data">${formatCurrency(projection.value)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="flex flex-col space-y-2">
                            <button data-action="edit" class="px-3 py-1 text-xs rounded-md bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 font-semibold transition">Editar</button>
                            <button data-action="deposit" class="px-3 py-1 text-xs rounded-md bg-emerald-600 text-white">Adicionar dinheiro</button>
                            <button data-action="withdraw" class="px-3 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition">Retirar</button>
                            <button data-action="delete" class="px-3 py-1 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition">Excluir</button>
                        </div>`;
                    div.addEventListener('click', (e) => {
                        const action = e.target.closest('button')?.dataset.action;
                        if (!action || isEditLocked) return;
                        const clickedCaixinha = caixinhas.find(c => c.id == div.dataset.id);
                        if (!clickedCaixinha) return;

                        if (action === 'deposit') {
                            openDepositDialog(clickedCaixinha);
                        } else if (action === 'edit') {
                            openModal(caixinhaEditorModal, e.currentTarget);
                            if (clickedCaixinha) { // Edit mode
                                caixinhaEditorTitle.textContent = 'Editar Caixinha';
                                caixinhaEditorId.value = clickedCaixinha.id;
                                caixinhaNomeInput.value = clickedCaixinha.nome;
                                caixinhaFotoPreview.src = clickedCaixinha.foto || 'https://placehold.co/128x128/e2e8f0/64748b?text=Foto';
                                caixinhaInicioInput.value = clickedCaixinha.inicio || '';
                                caixinhaTerminoInput.value = clickedCaixinha.termino || '';
                                caixinhaJurosInput.value = clickedCaixinha.taxaJuros > 0 ? String(clickedCaixinha.taxaJuros) : '';
                                caixinhaJurosTipoSelect.value = clickedCaixinha.jurosTipo || 'none';
                            }
                        } else if (action === 'withdraw') {
                            caixinhaParaRetirar = clickedCaixinha;
                            retirarCofreTitle.textContent = `Retirar de "${clickedCaixinha.nome}"`;
                            retirarMaxInfo.textContent = `Disponível: ${formatCurrency(clickedCaixinha.valor)}`;
                            retirarValorInput.value = '';
                            retirarValorInput.max = clickedCaixinha.valor;
                            retirarErrorMessage.textContent = '';
                            openModal(retirarCofreModal, e.currentTarget);
                        } else if (action === 'delete') {
                            caixinhaParaExcluir = clickedCaixinha;
                            totalCaixinhaParaDistribuir = clickedCaixinha.valor;
                            deleteCaixinhaTotalAmountEl.textContent = formatCurrency(caixinhaParaExcluir.valor);
                            deleteCaixinhaRestanteEl.textContent = formatCurrency(caixinhaParaExcluir.valor);
                            deleteCaixinhaAlocarInput.value = '';
                            deleteCaixinhaGastarInput.value = '';
                            deleteCaixinhaTransferirInput.value = '';
                            populateDeleteCaixinhaTransferSelect();
                            validateDeleteCaixinhaDistribution();
                            openModal(deleteCaixinhaModal, e.currentTarget);
                        }
                    });
                    caixinhasListContainer.appendChild(div);
                });
            }

            function openNewCaixinhaEditor(e, options = {}) {
                pendingCaixinhaSelectTarget = options.selectTarget || null;
                tempCroppedImage = null;
                caixinhaEditorTitle.textContent = 'Criar Nova Caixinha';
                caixinhaEditorId.value = '';
                caixinhaNomeInput.value = '';
                caixinhaFotoPreview.src = 'https://placehold.co/128x128/e2e8f0/64748b?text=Foto';
                caixinhaInicioInput.value = '';
                caixinhaTerminoInput.value = '';
                caixinhaJurosInput.value = '';
                caixinhaJurosTipoSelect.value = 'none';
                caixinhaFotoInput.value = '';
                openModal(caixinhaEditorModal, e.currentTarget);
            }

            openCaixinhaEditorBtn.addEventListener('click', (e) => openNewCaixinhaEditor(e));
            document.getElementById('sobras-nova-caixinha-btn').addEventListener('click', (e) => openNewCaixinhaEditor(e, { selectTarget: 'sobras' }));
            document.getElementById('delete-caixinha-nova-caixinha-btn').addEventListener('click', (e) => openNewCaixinhaEditor(e, { selectTarget: 'delete' }));
            simulationNewCaixinhaBtn.addEventListener('click', (e) => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                openNewCaixinhaEditor(e);
            });

            caixinhaEditorSalvarBtn.addEventListener('click', () => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                const id = caixinhaEditorId.value ? parseInt(caixinhaEditorId.value) : null;
                const nome = caixinhaNomeInput.value.trim();
                const inicio = caixinhaInicioInput.value;
                const termino = caixinhaTerminoInput.value;
                const taxaJuros = Math.max(0, Number(String(caixinhaJurosInput.value || '').replace(',', '.')) || 0);
                const jurosTipo = taxaJuros > 0 ? caixinhaJurosTipoSelect.value : 'none';

                if (!nome) {
                    showToast('O nome da caixinha é obrigatório.');
                    caixinhaNomeInput.focus();
                    return;
                }

                let selectedCaixinhaId = id;
                if (id) { // Editing
                    const index = caixinhas.findIndex(c => c.id === id);
                    if (index > -1) {
                        caixinhas[index] = {
                            ...normalizeCaixinhaEntry(caixinhas[index]),
                            nome,
                            inicio: inicio || null,
                            termino: termino || null,
                            foto: tempCroppedImage || caixinhas[index].foto,
                            taxaJuros,
                            jurosTipo
                        };
                        showToast('Caixinha atualizada.');
                    }
                } else { // Creating
                    const novaCaixinha = normalizeCaixinhaEntry({
                        id: Date.now(),
                        nome,
                        valor: 0,
                        inicio: inicio || null,
                        termino: termino || null,
                        foto: tempCroppedImage || null,
                        taxaJuros,
                        jurosTipo
                    });
                    caixinhas.push(novaCaixinha);
                    selectedCaixinhaId = novaCaixinha.id;
                    showToast('Caixinha criada!');
                }

                caixinhas = caixinhas.map(normalizeCaixinhaEntry);
                tempCroppedImage = null;
                if (pendingCaixinhaSelectTarget === 'sobras') {
                    populateCaixinhasSelect();
                    sobrasCaixinhaSelect.value = String(selectedCaixinhaId || '');
                    validateSobrasDistribution();
                } else if (pendingCaixinhaSelectTarget === 'delete') {
                    populateDeleteCaixinhaTransferSelect();
                    deleteCaixinhaTransferirSelect.value = String(selectedCaixinhaId || '');
                    validateDeleteCaixinhaDistribution();
                }
                pendingCaixinhaSelectTarget = null;
                closeTopModal();
                renderCaixinhas();
                updateAllUI();
            });

            retirarConfirmarBtn.addEventListener('click', () => {
                if (isEditLocked || !caixinhaParaRetirar) return;
                const valorRetirar = parseNumberInputValue(retirarValorInput.value);
                retirarErrorMessage.textContent = '';
                if (isNaN(valorRetirar) || valorRetirar <= 0) {
                    retirarErrorMessage.textContent = 'Por favor, insira um valor válido.';
                    return;
                }
                if (valorRetirar > caixinhaParaRetirar.valor) {
                    retirarErrorMessage.textContent = 'Valor maior que o saldo disponível.';
                    return;
                }
                const index = caixinhas.findIndex(c => c.id === caixinhaParaRetirar.id);
                if (index !== -1) {
                    caixinhas[index].valor = roundToTwo(caixinhas[index].valor - valorRetirar);
                }
                const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                if (!financialData[key]) {
                    financialData[key] = { entradas: [], despesas: [], alocadoProximoMes: 0, sobrasDistributed: false };
                }
                recordVaultTransfer(ensureMonthData(key), -valorRetirar, caixinhaParaRetirar.id);
                caixinhaParaRetirar = null;
                closeTopModal();
                renderCaixinhas();
                updateAllUI();
            });

            function populateDeleteCaixinhaTransferSelect() {
                deleteCaixinhaTransferirSelect.innerHTML = '<option value="">Selecione...</option>';
                if (!caixinhaParaExcluir) return;

                caixinhas = caixinhas.map(normalizeCaixinhaEntry);
                const otherCaixinhas = caixinhas.filter(c => c.id !== caixinhaParaExcluir.id);
                otherCaixinhas.forEach(caixinha => {
                    const option = document.createElement('option');
                    option.value = caixinha.id;
                    option.textContent = caixinha.nome;
                    deleteCaixinhaTransferirSelect.appendChild(option);
                });
            }

            function validateDeleteCaixinhaDistribution() {
                if (!caixinhaParaExcluir) return;
                totalCaixinhaParaDistribuir = caixinhaParaExcluir.valor;

                const transferirRaw = deleteCaixinhaTransferirInput.value.replace(',', '.') || '0';
                const alocarRaw = deleteCaixinhaAlocarInput.value.replace(',', '.') || '0';
                const gastarRaw = deleteCaixinhaGastarInput.value.replace(',', '.') || '0';

                const transferir = parseNumberInputValue(deleteCaixinhaTransferirInput.value);
                const alocar = parseNumberInputValue(deleteCaixinhaAlocarInput.value);
                const gastar = parseNumberInputValue(deleteCaixinhaGastarInput.value);
                const totalDistribuido = roundToTwo(transferir + alocar + gastar);
                const restante = roundToTwo(totalCaixinhaParaDistribuir - totalDistribuido);

                const isTransferCaixinhaRequired = transferir > 0 && deleteCaixinhaTransferirSelect.value === '';
                deleteCaixinhaTransferirError.textContent = isTransferCaixinhaRequired ? 'Selecione uma caixinha de destino.' : '';

                deleteCaixinhaRestanteEl.textContent = formatCurrency(restante);

                if ([transferir,alocar,gastar].every(v => Number.isFinite(v) && v >= 0) && Math.abs(restante) < 0.01 && !isTransferCaixinhaRequired) {
                    deleteCaixinhaConfirmarBtn.disabled = false;
                    deleteCaixinhaRestanteEl.classList.remove('text-red-500');
                } else {
                    deleteCaixinhaConfirmarBtn.disabled = true;
                    if (restante < 0) deleteCaixinhaRestanteEl.classList.add('text-red-500');
                    else deleteCaixinhaRestanteEl.classList.remove('text-red-500');
                }
            }

            [deleteCaixinhaAlocarInput, deleteCaixinhaGastarInput, deleteCaixinhaTransferirInput, deleteCaixinhaTransferirSelect].forEach(el => {
                el.addEventListener('input', validateDeleteCaixinhaDistribution);
            });

            document.getElementById('delete-caixinha-transferir-tudo').addEventListener('click', () => {
                deleteCaixinhaAlocarInput.value = '';
                deleteCaixinhaGastarInput.value = '';
                deleteCaixinhaTransferirInput.value = totalCaixinhaParaDistribuir > 0 ? totalCaixinhaParaDistribuir.toFixed(2).replace('.', ',') : '';
                validateDeleteCaixinhaDistribution();
            });
            document.getElementById('delete-caixinha-alocar-tudo').addEventListener('click', () => {
                deleteCaixinhaGastarInput.value = '';
                deleteCaixinhaTransferirInput.value = '';
                deleteCaixinhaAlocarInput.value = totalCaixinhaParaDistribuir > 0 ? totalCaixinhaParaDistribuir.toFixed(2).replace('.', ',') : '';
                validateDeleteCaixinhaDistribution();
            });
            document.getElementById('delete-caixinha-gastar-tudo').addEventListener('click', () => {
                deleteCaixinhaAlocarInput.value = '';
                deleteCaixinhaTransferirInput.value = '';
                deleteCaixinhaGastarInput.value = totalCaixinhaParaDistribuir > 0 ? totalCaixinhaParaDistribuir.toFixed(2).replace('.', ',') : '';
                validateDeleteCaixinhaDistribution();
            });

            deleteCaixinhaConfirmarBtn.addEventListener('click', () => {
                validateDeleteCaixinhaDistribution();
                if (isEditLocked || !caixinhaParaExcluir || deleteCaixinhaConfirmarBtn.disabled) return;

                const transferirValRaw = deleteCaixinhaTransferirInput.value.replace(',', '.') || '0';
                const alocarValRaw = deleteCaixinhaAlocarInput.value.replace(',', '.') || '0';
                const gastarValRaw = deleteCaixinhaGastarInput.value.replace(',', '.') || '0';
                const transferirVal = parseNumberInputValue(deleteCaixinhaTransferirInput.value);
                const alocarVal = parseNumberInputValue(deleteCaixinhaAlocarInput.value);
                const gastarVal = parseNumberInputValue(deleteCaixinhaGastarInput.value);
                if ([transferirVal,alocarVal,gastarVal].some(v => !Number.isFinite(v) || v < 0)) return;
                pushUndoSnapshot('redistribuição de caixinha');

                // Transfer to another caixinha
                if (transferirVal > 0) {
                    const destinationId = parseInt(deleteCaixinhaTransferirSelect.value);
                    const destinationCaixinha = caixinhas.find(c => c.id === destinationId);
                    if (destinationCaixinha) {
                        destinationCaixinha.valor = roundToTwo(destinationCaixinha.valor + transferirVal);
                    }
                }

                // Allocate to next month
                if (alocarVal > 0) {
                    addAllocationToNextMonth(alocarVal);
                }

                // Spend on various things
                const currentKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                const currentMonthData = ensureMonthData(currentKey);
                if (gastarVal + alocarVal > 0) recordVaultTransfer(currentMonthData, -(gastarVal + alocarVal), caixinhaParaExcluir.id);

                if (gastarVal > 0) {
                    financialData[currentKey].despesas.push({
                        id: Date.now() + 1,
                        nome: `Gastos diversos da caixinha "${caixinhaParaExcluir.nome}"`,
                        valor: gastarVal,
                        pago: true,
                        data: null,
                        foto: null,
                        isUnforeseen: true
                    });
                }

                // Delete the caixinha
                caixinhas = caixinhas.filter(c => c.id !== caixinhaParaExcluir.id);

                showToast(`Caixinha "${caixinhaParaExcluir.nome}" excluída.`);

                caixinhaParaExcluir = null;
                closeTopModal(); // close delete modal
                renderCaixinhas(); // re-render the cofre modal list
                updateAllUI();
            });

            // --- DEMAIS LÓGICAS (CALCULADORA, PIN SECUNDÁRIO, ETC.) ---
            const calculatorWindow = document.getElementById('calculator-window');
            const calculatorHeader = document.getElementById('calculator-header');
            const calculatorButton = document.getElementById('calculator-button');
            const closeCalculatorButton = document.getElementById('close-calculator-button');
            const calculatorExpression = document.getElementById('calculator-expression');
            const calculatorDisplay = document.getElementById('calculator-display');
            const calculatorButtons = calculatorWindow.querySelector('.grid.grid-cols-4');
            const calculatorMobileControls = document.getElementById('calculator-mobile-controls');
            const calculatorHistory = document.getElementById('calculator-history');
            const clearCalculatorHistoryButton = document.getElementById('clear-calculator-history-button');
            const calculatorUseResultButton = document.getElementById('calculator-use-result-button');
            const calculatorResultModal = document.getElementById('calculator-result-modal');
            const calculatorResultModalValue = document.getElementById('calculator-result-modal-value');
            const calculatorOperatorLabels = { '+': '+', '-': '-', '*': '×', '/': '÷' };
            const calculatorHistoryLimit = 12;
            let isDragging = false;
            let dragPointerId = null;
            let pendingCalculatorFrame = null;
            let pendingCalculatorPosition = null;
            let offsetX = 0;
            let offsetY = 0;
            let displayValue = '0';
            let expressionValue = '';
            let firstOperand = null;
            let operator = null;
            let waitingForSecondOperand = false;
            let justEvaluated = false;
            let calculatorHistoryEntries = [];
            function formatCalculatorText(value) {
                if (value === null || value === undefined || value === '') return '';
                return `${value}`.replace('.', ',');
            }
            function normalizeCalculatorResult(value) {
                const numericValue = Number(value);
                if (!Number.isFinite(numericValue)) return 'Erro';
                return `${parseFloat(numericValue.toPrecision(15))}`;
            }
            function updateCalculatorTransferState() {
                const numericValue = Number(displayValue);
                const hasTransferValue = justEvaluated && displayValue !== 'Erro' && Number.isFinite(numericValue);
                calculatorTransferValue = hasTransferValue ? roundToTwo(numericValue) : null;
                calculatorUseResultButton.disabled = !hasTransferValue;
                calculatorUseResultButton.textContent = hasTransferValue
                    ? `Usar ${formatCurrency(calculatorTransferValue)} como lançamento`
                    : 'Usar resultado como lançamento';
            }
            function updateDisplay() {
                calculatorDisplay.classList.remove('text-4xl', 'text-3xl', 'text-2xl');
                const displayLength = `${displayValue}`.length;
                if (displayLength > 15) calculatorDisplay.classList.add('text-2xl');
                else if (displayLength > 9) calculatorDisplay.classList.add('text-3xl');
                else calculatorDisplay.classList.add('text-4xl');

                calculatorDisplay.textContent = formatCalculatorText(displayValue) || '0';
                calculatorExpression.textContent = expressionValue || 'Digite uma operação';
                updateCalculatorTransferState();
            }
            function renderCalculatorHistory() {
                calculatorHistory.innerHTML = '';
                if (!calculatorHistoryEntries.length) {
                    const emptyState = document.createElement('p');
                    emptyState.className = 'text-sm text-gray-500 dark:text-zinc-400';
                    emptyState.textContent = 'Nenhum cálculo ainda.';
                    calculatorHistory.appendChild(emptyState);
                    return;
                }

                calculatorHistoryEntries.forEach(entry => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'w-full text-left rounded-xl border border-white/25 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/70 px-3 py-2 hover:bg-white/70 dark:hover:bg-zinc-800 transition-colors';
                    button.innerHTML = `
                        <span class="block text-xs text-gray-500 dark:text-zinc-400 truncate">${entry.expression}</span>
                        <strong class="block text-base text-gray-900 dark:text-zinc-100 mt-1">${formatCalculatorText(entry.result)}</strong>
                    `;
                    button.addEventListener('click', () => {
                        displayValue = entry.result;
                        expressionValue = `${entry.expression} =`;
                        firstOperand = null;
                        operator = null;
                        waitingForSecondOperand = false;
                        justEvaluated = true;
                        updateDisplay();
                        saveState();
                    });
                    calculatorHistory.appendChild(button);
                });
            }
            function addCalculatorHistory(expression, result) {
                calculatorHistoryEntries.unshift({
                    id: Date.now() + Math.random(),
                    expression,
                    result
                });
                calculatorHistoryEntries = calculatorHistoryEntries.slice(0, calculatorHistoryLimit);
                renderCalculatorHistory();
            }
            function resetCalculator(clearHistory = false) {
                displayValue = '0';
                expressionValue = '';
                firstOperand = null;
                operator = null;
                waitingForSecondOperand = false;
                justEvaluated = false;
                if (clearHistory) calculatorHistoryEntries = [];
                updateDisplay();
                renderCalculatorHistory();
            }
            function calculate(first, second, op) {
                if (op === '/' && second === 0) return 'Erro';

                let result = second;
                if (op === '+') result = first + second;
                else if (op === '-') result = first - second;
                else if (op === '*') result = first * second;
                else if (op === '/') result = first / second;

                return normalizeCalculatorResult(result);
            }
            function handleCalculatorDigit(key) {
                if (displayValue === 'Erro' || (justEvaluated && !operator)) {
                    displayValue = key;
                    expressionValue = '';
                    firstOperand = null;
                    operator = null;
                    waitingForSecondOperand = false;
                    justEvaluated = false;
                    return;
                }

                if (waitingForSecondOperand) {
                    displayValue = key;
                    waitingForSecondOperand = false;
                } else {
                    displayValue = displayValue === '0' ? key : `${displayValue}${key}`;
                }

                if (operator && firstOperand !== null) expressionValue = `${formatCalculatorText(firstOperand)} ${calculatorOperatorLabels[operator]} ${formatCalculatorText(displayValue)}`;
                else expressionValue = formatCalculatorText(displayValue);
            }
            function handleCalculatorDecimal() {
                if (displayValue === 'Erro' || (justEvaluated && !operator)) {
                    displayValue = '0.';
                    expressionValue = '';
                    firstOperand = null;
                    operator = null;
                    waitingForSecondOperand = false;
                    justEvaluated = false;
                    return;
                }

                if (waitingForSecondOperand) {
                    displayValue = '0.';
                    waitingForSecondOperand = false;
                } else if (!displayValue.includes('.')) {
                    displayValue += '.';
                }

                if (operator && firstOperand !== null) expressionValue = `${formatCalculatorText(firstOperand)} ${calculatorOperatorLabels[operator]} ${formatCalculatorText(displayValue)}`;
                else expressionValue = formatCalculatorText(displayValue);
            }
            function handleCalculatorOperator(nextOperator) {
                if (displayValue === 'Erro') return;

                const inputValue = Number(displayValue);
                if (firstOperand !== null && operator && !waitingForSecondOperand) {
                    const result = calculate(firstOperand, inputValue, operator);
                    if (result === 'Erro') {
                        expressionValue = `${formatCalculatorText(firstOperand)} ${calculatorOperatorLabels[operator]} ${formatCalculatorText(inputValue)} =`;
                        displayValue = 'Erro';
                        firstOperand = null;
                        operator = null;
                        waitingForSecondOperand = false;
                        justEvaluated = true;
                        return;
                    }
                    displayValue = result;
                    firstOperand = Number(result);
                } else {
                    firstOperand = inputValue;
                }

                operator = nextOperator;
                waitingForSecondOperand = true;
                justEvaluated = false;
                expressionValue = `${formatCalculatorText(firstOperand)} ${calculatorOperatorLabels[nextOperator]}`;
            }
            function handleCalculatorEquals() {
                if (!operator || waitingForSecondOperand || firstOperand === null || displayValue === 'Erro') return;

                const secondOperand = Number(displayValue);
                const finalExpression = `${formatCalculatorText(firstOperand)} ${calculatorOperatorLabels[operator]} ${formatCalculatorText(secondOperand)}`;
                const result = calculate(firstOperand, secondOperand, operator);
                expressionValue = `${finalExpression} =`;

                if (result === 'Erro') {
                    displayValue = 'Erro';
                    firstOperand = null;
                    operator = null;
                    waitingForSecondOperand = false;
                    justEvaluated = true;
                    return;
                }

                displayValue = result;
                firstOperand = null;
                operator = null;
                waitingForSecondOperand = false;
                justEvaluated = true;
                addCalculatorHistory(finalExpression, result);
            }
            function handleCalculatorBackspace() {
                if (displayValue === 'Erro') {
                    resetCalculator(false);
                    return;
                }

                if (waitingForSecondOperand && operator) {
                    waitingForSecondOperand = false;
                    operator = null;
                    expressionValue = formatCalculatorText(displayValue);
                    return;
                }

                if (justEvaluated) {
                    displayValue = '0';
                    expressionValue = '';
                    justEvaluated = false;
                    return;
                }

                displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : '0';
                if (operator && firstOperand !== null) expressionValue = `${formatCalculatorText(firstOperand)} ${calculatorOperatorLabels[operator]} ${formatCalculatorText(displayValue)}`;
                else expressionValue = displayValue === '0' ? '' : formatCalculatorText(displayValue);
            }
            calculatorButton.addEventListener('click', (e) => {
                openModal(calculatorWindow, e.currentTarget);
                updateDisplay();
                renderCalculatorHistory();
                saveState();
            });
            closeCalculatorButton.addEventListener('click', () => {
                closeTopModal();
                saveState();
            });
            calculatorButtons.addEventListener('click', e => {
                const button = e.target.closest('button');
                if (!button) return;
                const { key } = button.dataset;

                if (/\d/.test(key)) handleCalculatorDigit(key);
                else if (key === '.') handleCalculatorDecimal();
                else if (['+', '-', '*', '/'].includes(key)) handleCalculatorOperator(key);
                else if (key === '=') handleCalculatorEquals();
                else if (key === 'clear') resetCalculator(false);
                else if (key === 'backspace') handleCalculatorBackspace();

                updateDisplay();
                saveState();
            });
            clearCalculatorHistoryButton.addEventListener('click', () => {
                calculatorHistoryEntries = [];
                renderCalculatorHistory();
                saveState();
            });
            calculatorUseResultButton.addEventListener('click', () => {
                if (calculatorTransferValue === null) return;
                calculatorResultModalValue.textContent = formatCurrency(calculatorTransferValue);
                openModal(calculatorResultModal, calculatorUseResultButton);
            });
            calculatorResultModal.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-result-type]');
                if (!button || calculatorTransferValue === null) return;
                if (isEditLocked) { showToast('Edição trancada.'); return; }

                const openPrefilledEditor = () => openItemEditor(button.dataset.resultType, null, calculatorUseResultButton, {
                    prefill: {
                        nome: 'Resultado da calculadora',
                        valor: calculatorTransferValue,
                        data: getDefaultItemDate()
                    }
                });

                closeTopModal();
                if (isDataLocked) {
                    pinModalPurpose = 'unlockAndAct';
                    actionAfterPin = openPrefilledEditor;
                    openModal(secondaryPinWrapper, calculatorUseResultButton);
                    secondaryPinTitle.textContent = 'Revelar Dados para Criar';
                    return;
                }

                openPrefilledEditor();
            });
            function clampCalculatorPosition(x, y) {
                const margin = 12;
                const width = calculatorWindow.offsetWidth || 320;
                const height = calculatorWindow.offsetHeight || 520;
                return {
                    x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
                    y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin))
                };
            }
            function applyCalculatorPosition(x, y) {
                const nextPosition = clampCalculatorPosition(x, y);
                calculatorWindow.style.left = `${nextPosition.x}px`;
                calculatorWindow.style.top = `${nextPosition.y}px`;
                calculatorWindow.style.right = 'auto';
                calculatorWindow.style.bottom = 'auto';
                calculatorWindow.style.transform = 'none';
            }
            function queueCalculatorPosition(x, y) {
                pendingCalculatorPosition = clampCalculatorPosition(x, y);
                if (pendingCalculatorFrame) return;
                pendingCalculatorFrame = requestAnimationFrame(() => {
                    pendingCalculatorFrame = null;
                    if (!pendingCalculatorPosition) return;
                    applyCalculatorPosition(pendingCalculatorPosition.x, pendingCalculatorPosition.y);
                    pendingCalculatorPosition = null;
                });
            }
            const dragStart = (e) => {
                if (e.target.closest('#close-calculator-button')) return;
                if (window.innerWidth < 768) return;
                calculatorWindow.style.transition = 'none';
                document.body.classList.add('dragging-active');
                isDragging = true;
                calculatorWindow.classList.add('dragging');

                // Correção: Pega a posição visual e muda para posicionamento absoluto em pixels para evitar o "salto"
                const rect = calculatorWindow.getBoundingClientRect();
                applyCalculatorPosition(rect.left, rect.top);

                offsetX = (e.touches ? e.touches[0] : e).clientX - rect.left;
                offsetY = (e.touches ? e.touches[0] : e).clientY - rect.top;

                calculatorHeader.style.cursor = 'grabbing';
            };
            const drag = (e) => { if (!isDragging || window.innerWidth < 768) return; e.preventDefault(); const event = e.touches ? e.touches[0] : e; queueCalculatorPosition(event.clientX - offsetX, event.clientY - offsetY); };
            const dragEnd = () => { if(window.innerWidth < 768) return; document.body.classList.remove('dragging-active'); isDragging = false; calculatorWindow.classList.remove('dragging'); calculatorHeader.style.cursor = 'grab'; if (pendingCalculatorFrame) { cancelAnimationFrame(pendingCalculatorFrame); pendingCalculatorFrame = null; } if (pendingCalculatorPosition) { applyCalculatorPosition(pendingCalculatorPosition.x, pendingCalculatorPosition.y); pendingCalculatorPosition = null; } calculatorWindow.style.transition = ''; saveState(); };
            calculatorHeader.addEventListener('mousedown', dragStart); document.addEventListener('mousemove', drag); document.addEventListener('mouseup', dragEnd); calculatorHeader.addEventListener('touchstart', dragStart); document.addEventListener('touchmove', drag, { passive: false }); document.addEventListener('touchend', dragEnd);

            calculatorMobileControls.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if(!button) return;
                const corner = button.dataset.corner;
                calculatorWindow.style.transition = 'top 0.25s ease, left 0.25s ease, right 0.25s ease, bottom 0.25s ease';
                calculatorWindow.style.transform = 'none';
                switch(corner){
                    case 'top-left': calculatorWindow.style.top = '16px'; calculatorWindow.style.left = '16px'; calculatorWindow.style.right = 'auto'; calculatorWindow.style.bottom = 'auto'; break;
                    case 'top-right': calculatorWindow.style.top = '16px'; calculatorWindow.style.left = 'auto'; calculatorWindow.style.right = '16px'; calculatorWindow.style.bottom = 'auto'; break;
                    case 'bottom-left': calculatorWindow.style.top = 'auto'; calculatorWindow.style.left = '16px'; calculatorWindow.style.right = 'auto'; calculatorWindow.style.bottom = '16px'; break;
                    case 'bottom-right': calculatorWindow.style.top = 'auto'; calculatorWindow.style.left = 'auto'; calculatorWindow.style.right = '16px'; calculatorWindow.style.bottom = '16px'; break;
                }
                setTimeout(() => { calculatorWindow.style.transition = ''; }, 250);
                saveState();
            });

             // --- LÓGICA DO MODAL DE PIN SECUNDÁRIO ---
            window.addEventListener('resize', () => {
                calculatorHeader.style.cursor = window.innerWidth >= 768 ? 'grab' : 'default';
                const currentLeft = parseFloat(calculatorWindow.style.left);
                const currentTop = parseFloat(calculatorWindow.style.top);
                if (Number.isFinite(currentLeft) && Number.isFinite(currentTop) && calculatorWindow.style.transform === 'none') {
                    applyCalculatorPosition(currentLeft, currentTop);
                }
            });
            calculatorHeader.style.cursor = window.innerWidth >= 768 ? 'grab' : 'default';
            updateDisplay();
            renderCalculatorHistory();

            const secondaryPinWrapper = document.getElementById('secondary-pin-wrapper'); const secondaryPinTitle = document.getElementById('secondary-pin-title'); const secondaryPinDots = document.getElementById('secondary-pin-dots').children; const secondaryErrorMessage = document.getElementById('secondary-error-message'); const secondaryKeypad = document.getElementById('secondary-keypad'); let currentSecondaryPin = '';

            function resetSecondaryPinState() {
                currentSecondaryPin = '';
                secondaryErrorMessage.classList.add('opacity-0');
                updateSecondaryPinDisplay();
            }
            function updateSecondaryPinDisplay() { for (let i = 0; i < secondaryPinDots.length; i++) { if (i < currentSecondaryPin.length) { secondaryPinDots[i].classList.add('bg-green-700', 'border-green-600'); } else { secondaryPinDots[i].classList.remove('bg-green-700', 'border-green-600'); } } }
            function handleSecondaryDigitInput(digit) { if (currentSecondaryPin.length < 4) { secondaryErrorMessage.classList.add('opacity-0'); currentSecondaryPin += digit; updateSecondaryPinDisplay(); if (currentSecondaryPin.length === 4) validateSecondaryPin(); } }
            function handleSecondaryClear() { if (currentSecondaryPin.length > 0) { secondaryErrorMessage.classList.add('opacity-0'); currentSecondaryPin = ''; updateSecondaryPinDisplay(); } }
            async function validateSecondaryPin() {
                if (await MLGAccount.unlock('Confirme sua senha', true)) {
                    if (pinModalPurpose === 'unlockVisibility') {
                        unlockData();
                    } else if (pinModalPurpose === 'unlockEditing') {
                        const scope = pendingEditUnlockScope || 'current';
                        applyEditUnlockScope(scope);
                        pendingEditUnlockScope = null;
                        updateEditLockState();
                        srAnnouncer.textContent = `Desbloqueio aplicado: ${editLockScopeLabels[scope] || 'escopo selecionado'}.`;
                        showToast(`Desbloqueio aplicado: ${editLockScopeLabels[scope] || 'escopo selecionado'}.`);
                    } else if (pinModalPurpose === 'unlockAndAct' && typeof actionAfterPin === 'function') {
                        unlockData();
                        actionAfterPin();
                        actionAfterPin = null;
                    }
                    pinModalPurpose = '';
                } else {
                    srAnnouncer.textContent = secondaryErrorMessage.textContent;
                    secondaryErrorMessage.classList.remove('opacity-0');
                    const pinContainer = document.getElementById('secondary-pin-container');
                    pinContainer.classList.add('animate-shake');
                    setTimeout(() => {
                        resetSecondaryPinState();
                        pinContainer.classList.remove('animate-shake');
                    }, 800);
                }
            }
            secondaryKeypad.addEventListener('click', (event) => { const button = event.target.closest('.keypad-button'); if (!button || !button.dataset.key) return; const key = button.dataset.key; if (/\d/.test(key)) handleSecondaryDigitInput(key); else if (key === 'backspace') handleSecondaryClear(); });

             // --- LISTENERS GLOBAIS ---
            document.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                    if (event.target.closest('input,textarea,[contenteditable="true"]')) return;
                    event.preventDefault(); if (!isEditLocked) {pendingPaymentSnapshot = null; undoLastAction();} return;
                }
                if (event.key === 'Escape') {
                    if (modalStack.length > 0) closeTopModal();
                } else if (modalStack.some(m => m.element === secondaryPinWrapper)) {
                    if (event.key >= '0' && event.key <= '9') handleSecondaryDigitInput(event.key);
                    else if (event.key === 'Backspace') { if(currentSecondaryPin.length > 0) currentSecondaryPin = currentSecondaryPin.slice(0,-1); updateSecondaryPinDisplay(); }
                    else if (event.key === 'Enter' && currentSecondaryPin.length === 4) validateSecondaryPin();
                } else if (!pinWrapper.classList.contains('pointer-events-none')) {
                    if (event.key >= '0' && event.key <= '9') handleDigitInput(event.key);
                    else if (event.key === 'Backspace') handleBackspace();
                    else if (event.key === 'Enter' && currentPin.length === 4) validatePin();
                }
            });
            mainAppContainer.addEventListener('click', (event) => { if(isDataLocked && !event.target.closest('.indicator-card, #toggle-visibility-button, #date-display, .header-button, .calendar-launch-button')) { pinModalPurpose = 'unlockVisibility'; openModal(secondaryPinWrapper); secondaryPinTitle.textContent = 'Revelar Dados'; }});
             // --- ESTILOS DINÂMICOS ---
            const style = document.createElement('style'); style.textContent = `.keypad-button{height:64px;width:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:500;color:#d1d5db;background-color:#1f2937;border-radius:9999px;transition:background-color .2s}.keypad-button:hover,.keypad-button:focus{background-color:#374151} .calc-button{height:60px;width:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:600;color:#1f2937;background-color:rgba(255,255,255,0.7);border-radius:1rem;transition:background-color .2s} .dark .calc-button{color:#f9fafb;background-color:rgba(39,39,42,0.8)}.calc-button:hover{background-color:rgba(255,255,255,0.9)} .dark .calc-button:hover{background-color:rgba(63,63,70,0.9)} @keyframes shake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-5px)}20%,40%,60%,80%{transform:translateX(5px)}}.animate-shake{animation:shake .5s ease-in-out}`; document.head.appendChild(style);

            // Lógica de trava de edição, tema, etc.
            const editLockScopeLabels = {
                current: 'somente a planilha atual',
                'current-past': 'a atual e as pregressas',
                past: 'somente as pregressas',
                'current-future': 'a atual e as futuras',
                future: 'somente as futuras'
            };

            function getMonthSerialFromDate(date) {
                return (date.getFullYear() * 12) + date.getMonth();
            }

            function normalizeEditLockRange(range = {}) {
                const start = Number.isFinite(range.start) ? range.start : null;
                const end = Number.isFinite(range.end) ? range.end : null;
                if (start !== null && end !== null && start > end) return null;
                return { start, end };
            }

            function getEditLockBounds(range = {}) {
                return {
                    start: Number.isFinite(range.start) ? range.start : -Infinity,
                    end: Number.isFinite(range.end) ? range.end : Infinity
                };
            }

            function createEditLockRange(start, end) {
                return normalizeEditLockRange({
                    start: Number.isFinite(start) ? start : null,
                    end: Number.isFinite(end) ? end : null
                });
            }

            function mergeEditLockRanges(ranges = []) {
                const normalizedRanges = ranges
                    .map(normalizeEditLockRange)
                    .filter(Boolean)
                    .sort((a, b) => getEditLockBounds(a).start - getEditLockBounds(b).start);

                if (normalizedRanges.length === 0) return [];

                const merged = [];
                normalizedRanges.forEach(range => {
                    const bounds = getEditLockBounds(range);
                    if (merged.length === 0) {
                        merged.push({ ...bounds });
                        return;
                    }

                    const last = merged[merged.length - 1];
                    if (bounds.start <= last.end + 1) {
                        last.end = Math.max(last.end, bounds.end);
                    } else {
                        merged.push({ ...bounds });
                    }
                });

                return merged
                    .map(range => createEditLockRange(range.start, range.end))
                    .filter(Boolean);
            }

            function getEditLockRangeFromScope(scope, referenceDate = currentDate) {
                const currentSerial = getMonthSerialFromDate(referenceDate);
                switch (scope) {
                    case 'current':
                        return createEditLockRange(currentSerial, currentSerial);
                    case 'current-past':
                        return createEditLockRange(null, currentSerial);
                    case 'past':
                        return createEditLockRange(null, currentSerial - 1);
                    case 'current-future':
                        return createEditLockRange(currentSerial, null);
                    case 'future':
                        return createEditLockRange(currentSerial + 1, null);
                    default:
                        return null;
                }
            }

            function applyEditLockScope(scope) {
                const range = getEditLockRangeFromScope(scope);
                if (!range) return;
                editLockRanges = mergeEditLockRanges([...editLockRanges, range]);
            }

            function subtractEditLockRange(existingRange, rangeToRemove) {
                const existing = getEditLockBounds(existingRange);
                const removal = getEditLockBounds(rangeToRemove);

                if (removal.end < existing.start || removal.start > existing.end) {
                    return [normalizeEditLockRange(existingRange)].filter(Boolean);
                }

                const pieces = [];
                if (removal.start > existing.start) {
                    const leftPiece = createEditLockRange(existing.start, removal.start - 1);
                    if (leftPiece) pieces.push(leftPiece);
                }
                if (removal.end < existing.end) {
                    const rightPiece = createEditLockRange(removal.end + 1, existing.end);
                    if (rightPiece) pieces.push(rightPiece);
                }

                return pieces;
            }

            function applyEditUnlockScope(scope) {
                const rangeToRemove = getEditLockRangeFromScope(scope);
                if (!rangeToRemove) return;
                editLockRanges = mergeEditLockRanges(
                    editLockRanges.flatMap(existingRange => subtractEditLockRange(existingRange, rangeToRemove))
                );
            }

            function isDateEditLocked(date = currentDate) {
                const serial = getMonthSerialFromDate(date);
                return editLockRanges.some(range => {
                    const bounds = getEditLockBounds(range);
                    return serial >= bounds.start && serial <= bounds.end;
                });
            }

            function syncCurrentEditLockState() {
                isEditLocked = isDateEditLocked(currentDate);
                return isEditLocked;
            }

            function renderEditLockState() {
                const actionButtons = document.querySelectorAll('.action-button');
                const hasAnyEditLock = editLockRanges.length > 0;

                if (isEditLocked) {
                    iconPadlockOpen.classList.add('hidden');
                    iconPadlockLocked.classList.remove('hidden');
                    toggleEditLockButton.setAttribute('aria-label', 'Desbloquear edição');
                } else if (hasAnyEditLock) {
                    iconPadlockOpen.classList.remove('hidden');
                    iconPadlockLocked.classList.add('hidden');
                    toggleEditLockButton.setAttribute('aria-label', 'Gerenciar bloqueios de edição');
                } else {
                    iconPadlockOpen.classList.remove('hidden');
                    iconPadlockLocked.classList.add('hidden');
                    toggleEditLockButton.setAttribute('aria-label', 'Bloquear edição');
                }

                actionButtons.forEach(btn => {
                    const shouldStayEnabled = btn.dataset.action === 'view-image';
                    btn.disabled = isEditLocked && !shouldStayEnabled;
                    if (isEditLocked && !shouldStayEnabled) {
                        btn.setAttribute('title', 'Edição trancada.');
                    } else {
                        btn.removeAttribute('title');
                    }
                });
            }

            function updateEditLockState({ rerenderLists = true, save = true } = {}) {
                syncCurrentEditLockState();
                if (rerenderLists) {
                    renderLists();
                } else {
                    renderEditLockState();
                }
                if (save) saveState();
            }

            const themeToggleButton = document.getElementById('theme-toggle-button'); const themeIconSun = document.getElementById('theme-icon-sun'); const themeIconMoon = document.getElementById('theme-icon-moon');
            function updateThemeIcons(isDark) { if(isDark) { themeIconSun.classList.add('hidden'); themeIconMoon.classList.remove('hidden'); } else { themeIconSun.classList.remove('hidden'); themeIconMoon.classList.add('hidden'); } }
            themeToggleButton.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark');
                saveState();
                const isDark = document.documentElement.classList.contains('dark');
                updateThemeIcons(isDark);
                if (analyticsModal && !analyticsModal.classList.contains('hidden')) updateAnalyticsModal();
                if (searchModal && !searchModal.classList.contains('hidden')) renderSearchResults();
            });
            const visibilityLock = document.getElementById('visibility-lock'); const toggleVisibilityButton = document.getElementById('toggle-visibility-button'); const iconEyeOpen = document.getElementById('icon-eye-open'); const iconEyeSlashed = document.getElementById('icon-eye-slashed');
            function updateVisibilityButton() { if (isDataLocked) { iconEyeOpen.classList.remove('hidden'); iconEyeSlashed.classList.add('hidden'); toggleVisibilityButton.setAttribute('aria-label', 'Revelar dados financeiros'); } else { iconEyeOpen.classList.add('hidden'); iconEyeSlashed.classList.remove('hidden'); toggleVisibilityButton.setAttribute('aria-label', 'Ocultar dados financeiros'); } }
            toggleVisibilityButton.addEventListener('click', () => { if (isDataLocked) { pinModalPurpose = 'unlockVisibility'; openModal(secondaryPinWrapper); secondaryPinTitle.textContent = 'Revelar Dados'; } else { lockData(); } });
            const toggleEditLockButton = document.getElementById('toggle-edit-lock-button'); const iconPadlockOpen = document.getElementById('icon-padlock-open'); const iconPadlockLocked = document.getElementById('icon-padlock-locked');
            toggleEditLockButton.addEventListener('click', (e) => {
                if (isEditLocked) {
                     openModal(document.getElementById('unlock-options-modal'), e.currentTarget);
                } else if (editLockRanges.length > 0) {
                    openModal(document.getElementById('lock-management-modal'), e.currentTarget);
                } else {
                    openModal(document.getElementById('lock-options-modal'), e.currentTarget);
                }
            });
            document.getElementById('confirm-lock-button').addEventListener('click', () => {
                const scope = pendingEditLockScope || 'current';
                applyEditLockScope(scope);
                pendingEditLockScope = null;
                updateEditLockState();
                closeTopModal();
                srAnnouncer.textContent = `Edição bloqueada: ${editLockScopeLabels[scope] || 'escopo selecionado'}.`;
                showToast(`Bloqueio aplicado: ${editLockScopeLabels[scope] || 'escopo selecionado'}.`);
            });

            document.getElementById('lock-options-modal').addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;

                if (button.dataset.lockType) {
                    pendingEditLockScope = button.dataset.lockType;
                    closeTopModal();
                    openModal(document.getElementById('confirm-lock-modal'), toggleEditLockButton);
                } else if (button.id === 'lock-options-cancel-btn') {
                    pendingEditLockScope = null;
                    closeTopModal();
                }
            });

            document.getElementById('unlock-options-modal').addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;

                if (button.dataset.unlockType) {
                    pendingEditUnlockScope = button.dataset.unlockType;
                    closeTopModal();
                    pinModalPurpose = 'unlockEditing';
                    openModal(secondaryPinWrapper, toggleEditLockButton);
                    secondaryPinTitle.textContent = 'Desbloquear Edição';
                } else if (button.id === 'unlock-options-cancel-btn') {
                    pendingEditUnlockScope = null;
                    closeTopModal();
                }
            });

            document.getElementById('lock-management-modal').addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;

                if (button.dataset.lockManagerAction === 'lock') {
                    closeTopModal();
                    openModal(document.getElementById('lock-options-modal'), toggleEditLockButton);
                } else if (button.dataset.lockManagerAction === 'unlock') {
                    closeTopModal();
                    openModal(document.getElementById('unlock-options-modal'), toggleEditLockButton);
                } else if (button.id === 'lock-management-cancel-btn') {
                    closeTopModal();
                }
            });


            // --- LÓGICA DE ANOTAÇÕES ---
            document.getElementById('salvar-anotacao-entradas').addEventListener('click', () => saveAnnotation('entradas'));
            document.getElementById('salvar-anotacao-despesas').addEventListener('click', () => saveAnnotation('despesas'));
            document.getElementById('salvar-anotacao-geral').addEventListener('click', () => saveAnnotation('geral'));
            [entradasAnotacao, despesasAnotacao, geralAnotacao].forEach((field, index) => {
                field.addEventListener('input', () => {
                    if (isEditLocked) return;
                    const data = ensureMonthData(getMonthKey(currentDate));
                    data[['entradasAnotacao','despesasAnotacao','geralAnotacao'][index]] = field.value;
                    saveState();
                });
            });
            function saveAnnotation(type) {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                const monthData = ensureMonthData(key);

                if(type === 'entradas') {
                    monthData.entradasAnotacao = entradasAnotacao.value;
                } else if (type === 'despesas') {
                    monthData.despesasAnotacao = despesasAnotacao.value;
                } else {
                    monthData.geralAnotacao = geralAnotacao.value;
                }
                showToast('Anotação salva.');
                saveState();
            }

            // --- LÓGICA DO EDITOR DE ITEM E IMAGEM ---
            const itemEditorModal = document.getElementById('item-editor-modal');
            const itemEditorCard = document.getElementById('item-editor-card');
            const itemEditorTitle = document.getElementById('item-editor-title');
            const itemEditorSubtitle = document.getElementById('item-editor-subtitle');
            const itemEditorKindBadgeText = document.getElementById('item-editor-kind-badge-text');
            const itemEditorKindIcon = document.getElementById('item-editor-kind-icon');
            const itemEditorId = document.getElementById('item-editor-id');
            const itemEditorType = document.getElementById('item-editor-type');
            const itemNomeInput = document.getElementById('item-nome-input');
            const itemValorInput = document.getElementById('item-valor-input');
            const itemDataInput = document.getElementById('item-data-input');
            const itemDataLabel = document.getElementById('item-data-label');
            const itemNomeLabel = document.getElementById('item-nome-label');
            const itemValorLabel = document.getElementById('item-valor-label');
            const itemDateShell = document.getElementById('item-date-shell');
            const itemDateTrigger = document.getElementById('item-date-trigger');
            const itemDateDisplay = document.getElementById('item-date-display');
            const itemDateHelper = document.getElementById('item-date-helper');
            const itemSemDataCheckbox = document.getElementById('item-sem-data-checkbox');
            const itemParcelasInput = document.getElementById('item-parcelas-input');
            const itemParcelasWrapper = document.getElementById('item-parcelas-wrapper');
            const itemParcelasLabel = document.getElementById('item-parcelas-label');
            const itemPeriodicidadeSelect = document.getElementById('item-periodicidade-select');
            const itemPeriodicidadeIntervalInput = document.getElementById('item-periodicidade-interval-input');
            const itemPeriodicidadeIntervalLabel = document.getElementById('item-periodicidade-interval-label');
            const itemPeriodicidadeIntervalNote = document.getElementById('item-periodicidade-interval-note');
            const itemMonthlyPositionWrapper = document.getElementById('item-monthly-position-wrapper');
            const itemMonthlyPositionSelect = document.getElementById('item-monthly-position-select');
            const itemFixedDayWrapper = document.getElementById('item-fixed-day-wrapper');
            const itemFixedDayInput = document.getElementById('item-fixed-day-input');
            const itemBusinessDayWrapper = document.getElementById('item-business-day-wrapper');
            const itemBusinessDayInput = document.getElementById('item-business-day-input');
            const itemBusinessDayPreview = document.getElementById('item-business-day-preview');
            const itemRecurrenceModeSelect = document.getElementById('item-recurrence-mode-select');
            const itemRecurrenceWarning = document.getElementById('item-recurrence-warning');
            const itemRecurrenceConfig = document.getElementById('item-recurrence-config');
            const itemRecurrenceSummary = document.getElementById('item-recurrence-summary');
            const itemInstallmentsSection = document.getElementById('item-installments-section');
            const itemPeriodicityPresets = document.getElementById('item-periodicity-presets');
            const itemFotoPreview = document.getElementById('item-foto-preview');
            const itemFotoInput = document.getElementById('item-foto-input');
            const itemFotoTrigger = document.getElementById('item-foto-trigger');
            const itemEditorSalvarBtn = document.getElementById('item-editor-salvar-btn');

            const imageCropperModal = document.getElementById('image-cropper-modal');
            const cropperImage = document.getElementById('cropper-image');
            const zoomSlider = document.getElementById('zoom-slider');
            const itemDatePickerModal = document.getElementById('item-date-picker-modal');
            const itemDatePickerTitle = document.getElementById('item-date-picker-title');
            const itemDatePickerGrid = document.getElementById('item-date-picker-grid');
            const itemDatePickerPrevBtn = document.getElementById('item-date-picker-prev-btn');
            const itemDatePickerNextBtn = document.getElementById('item-date-picker-next-btn');

            const imageViewerModal = document.getElementById('image-viewer-modal');
            const viewerImage = document.getElementById('viewer-image');
            const insufficientFundsModal = document.getElementById('insufficient-funds-modal');
            const insufficientFundsDescription = document.getElementById('insufficient-funds-description');
            const insufficientFundsShortfall = document.getElementById('insufficient-funds-shortfall');
            const useImplicitFundsBtn = document.getElementById('use-implicit-funds-btn');
            const expenseStatusModal = document.getElementById('expense-status-modal');
            const expenseStatusModalItemName = document.getElementById('expense-status-modal-item-name');
            const editRecurrenceModal = document.getElementById('edit-recurrence-modal');
            const deleteItemModal = document.getElementById('delete-item-modal');
            const deleteItemModalTitle = document.getElementById('delete-item-modal-title');
            const deleteItemModalDescription = document.getElementById('delete-item-modal-description');
            const deleteItemModalRecurringActions = document.getElementById('delete-item-modal-recurring-actions');
            const deleteItemModalSingleActions = document.getElementById('delete-item-modal-single-actions');
            const confirmDiscardModal = document.getElementById('confirm-discard-modal');
            const requiredFieldsModal = document.getElementById('required-fields-modal');
            const sobrasHelpModal = document.getElementById('sobras-help-modal');

            const RECURRENCE_MONTHLY_ALIASES = {
                1: 'mensal',
                2: 'bimestral',
                3: 'trimestral',
                4: 'quadrimestral',
                5: 'quinquimestral',
                6: 'semestral',
                12: 'anual'
            };
            const UNDO_STACK_LIMIT = 20;
            const LAST_BUSINESS_DAY_VALUE = -1;
            const RECURRENCE_MONTH_BUFFER = 12;
            const RECURRENCE_DAY_BUFFER = 120;
            let nextGeneratedId = Date.now();
            let recurringSeries = [];
            let itemDatePickerCursor = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

            function generateItemId() {
                nextGeneratedId += 1;
                return nextGeneratedId;
            }

            function getMonthKey(date) {
                return `${date.getFullYear()}-${date.getMonth()}`;
            }

            function getMonthLabelFromKey(monthKey) {
                const [year, month] = String(monthKey).split('-').map(Number);
                return Number.isFinite(year) && Number.isFinite(month) ? `${monthNames[month]} ${year}` : '';
            }

            function getMonthKeyParts(monthKey) {
                const [year, month] = String(monthKey).split('-').map(Number);
                return { year, month };
            }

            function getAllocationEntryId(monthKey) {
                const { year, month } = getMonthKeyParts(monthKey);
                if (!Number.isFinite(year) || !Number.isFinite(month)) return generateItemId();
                return Number(`${year}${String(month + 1).padStart(2, '0')}9901`);
            }

            function buildAllocationEntryForMonth(monthKey, amount) {
                const { year, month } = getMonthKeyParts(monthKey);
                if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
                return {
                    id: getAllocationEntryId(monthKey),
                    nome: 'Alocação recebida do mês anterior',
                    valor: roundToTwo(amount),
                    data: `${year}-${String(month + 1).padStart(2, '0')}-01`,
                    foto: null,
                    isUnforeseen: false,
                    systemAllocation: true
                };
            }

            function cloneSerializable(value) {
                return JSON.parse(JSON.stringify(value));
            }

            function buildUndoSnapshot(label) {
                return {
                    label,
                    currentDate: currentDate.getTime(),
                    financialData: cloneSerializable(financialData),
                    caixinhas: cloneSerializable(caixinhas),
                    trash: cloneSerializable(trash),
                    recurringSeries: cloneSerializable(recurringSeries),
                    nextGeneratedId,
                    editLockRanges: cloneSerializable(editLockRanges)
                };
            }

            function restoreUndoSnapshot(snapshot) {
                snapshot = cloneSerializable(snapshot);
                editLockRanges = snapshot.editLockRanges || [];
                currentDate = snapshot.currentDate ? new Date(snapshot.currentDate) : new Date();
                currentDate.setDate(1);
                currentDate.setHours(0, 0, 0, 0);
                financialData = typeof snapshot.financialData === 'object' && snapshot.financialData ? snapshot.financialData : {};
                Object.keys(financialData).forEach(key => {
                    financialData[key] = normalizeMonthDataEntry(financialData[key]);
                });
                caixinhas = Array.isArray(snapshot.caixinhas) ? snapshot.caixinhas.map(normalizeCaixinhaEntry) : [];
                trash = Array.isArray(snapshot.trash) ? snapshot.trash : [];
                recurringSeries = Array.isArray(snapshot.recurringSeries) ? snapshot.recurringSeries.map(normalizeRecurringSeriesEntry) : [];
                nextGeneratedId = Math.max(Date.now(), Number(snapshot.nextGeneratedId) || 0);
            }

            function pushUndoSnapshot(label) {
                undoStack.push(buildUndoSnapshot(label));
                if (undoStack.length > UNDO_STACK_LIMIT) {
                    undoStack.shift();
                }
                updateUndoButtonState();
            }

            function updateUndoButtonState() {
                const latestAction = undoStack[undoStack.length - 1] || null;
                undoActionButton.disabled = !latestAction;
                undoActionButton.title = latestAction ? `Desfazer: ${latestAction.label}` : 'Nada para desfazer';
                undoActionButton.setAttribute('aria-label', latestAction ? `Desfazer ${latestAction.label}` : 'Nada para desfazer');
            }

            function undoLastAction() {
                const snapshot = undoStack.pop();
                if (!snapshot) return;
                restoreUndoSnapshot(snapshot);
                resetHistoryBaseline();
                ensureRecurringDataForVisibleMonth();
                updateAllUI();
                saveState();
                updateUndoButtonState();
                showToast(`Desfeito: ${snapshot.label}.`);
            }

            function escapeHtml(value = '') {
                return String(value).replace(/[&<>"']/g, (char) => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                })[char]);
            }

            function normalizeMonthDataEntry(entry = {}) {
                return {
                    entradas: Array.isArray(entry.entradas) ? entry.entradas : [],
                    despesas: Array.isArray(entry.despesas) ? entry.despesas : [],
                    entradasAnotacao: entry.entradasAnotacao || '',
                    despesasAnotacao: entry.despesasAnotacao || '',
                    geralAnotacao: entry.geralAnotacao || '',
                    alocadoProximoMes: roundToTwo(Number(entry.alocadoProximoMes) || 0),
                    sobrasDistributed: Boolean(entry.sobrasDistributed),
                    vaultTransfers: Array.isArray(entry.vaultTransfers) ? entry.vaultTransfers : [],
                    allocationOut: roundToTwo(Number(entry.allocationOut) || 0),
                    simulationTemplates: Array.isArray(entry.simulationTemplates) ? entry.simulationTemplates : []
                };
            }

            function ensureMonthData(key) {
                financialData[key] = normalizeMonthDataEntry(financialData[key]);
                return syncAllocatedEntryForMonth(key);
            }

            function parseDateOnly(value) {
                if (!value) return null;
                const [year, month, day] = value.split('-').map(Number);
                return new Date(year, month - 1, day);
            }

            function formatDateOnly(date) {
                if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }

            function formatDatePt(dateOrString) {
                const date = typeof dateOrString === 'string' ? parseDateOnly(dateOrString) : dateOrString;
                return date ? date.toLocaleDateString('pt-BR') : 'Sem data';
            }

            function formatMonthYearLabel(dateOrString) {
                const date = typeof dateOrString === 'string' ? parseDateOnly(dateOrString) : dateOrString;
                return date ? `${monthNames[date.getMonth()]} ${date.getFullYear()}` : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
            }

            function sameDate(left, right) {
                return Boolean(left && right) &&
                    left.getFullYear() === right.getFullYear() &&
                    left.getMonth() === right.getMonth() &&
                    left.getDate() === right.getDate();
            }

            function setItemDateValue(value, source = 'manual') {
                itemDataInput.value = value || '';
                itemDataInput.dataset.source = source;

                if (value) {
                    itemDateDisplay.textContent = formatDatePt(value);
                    itemDateDisplay.classList.remove('is-placeholder');
                } else {
                    itemDateDisplay.textContent = 'Selecione uma data';
                    itemDateDisplay.classList.add('is-placeholder');
                }
            }

            function renderItemDatePicker() {
                itemDatePickerTitle.textContent = `${monthNames[itemDatePickerCursor.getMonth()]} ${itemDatePickerCursor.getFullYear()}`;
                itemDatePickerGrid.innerHTML = '';

                const firstDayOfMonth = new Date(itemDatePickerCursor.getFullYear(), itemDatePickerCursor.getMonth(), 1);
                const startOffset = firstDayOfMonth.getDay();
                const daysInMonth = new Date(itemDatePickerCursor.getFullYear(), itemDatePickerCursor.getMonth() + 1, 0).getDate();
                const selectedDate = parseDateOnly(itemDataInput.value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                for (let i = 0; i < startOffset; i++) {
                    const spacer = document.createElement('span');
                    spacer.className = 'item-date-picker-day is-muted';
                    spacer.setAttribute('aria-hidden', 'true');
                    itemDatePickerGrid.appendChild(spacer);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'item-date-picker-day';
                    button.textContent = day;
                    const candidateDate = new Date(itemDatePickerCursor.getFullYear(), itemDatePickerCursor.getMonth(), day);

                    if (sameDate(candidateDate, today)) {
                        button.classList.add('is-today');
                    }
                    if (sameDate(candidateDate, selectedDate)) {
                        button.classList.add('is-selected');
                    }

                    button.addEventListener('click', () => {
                        setItemDateValue(formatDateOnly(candidateDate), 'manual');
                        closeTopModal();
                        syncRecurrenceUI();
                        validateItemForm();
                    });
                    itemDatePickerGrid.appendChild(button);
                }
            }

            function openItemDatePicker(opener = itemDateTrigger) {
                const baseDate = parseDateOnly(itemDataInput.value) || new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                itemDatePickerCursor = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
                renderItemDatePicker();
                openModal(itemDatePickerModal, opener);
            }

            function addDaysToDate(date, days) {
                const nextDate = new Date(date);
                nextDate.setDate(nextDate.getDate() + days);
                return nextDate;
            }

            function addMonthsKeepingAnchor(date, monthsToAdd) {
                const anchorDay = date.getDate();
                const targetDate = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
                const lastDayOfTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
                targetDate.setDate(Math.min(anchorDay, lastDayOfTargetMonth));
                return targetDate;
            }

            function getDateWithFixedDayOfMonth(year, monthIndex, dayOfMonth) {
                const safeDay = Math.min(31, Math.max(1, Number(dayOfMonth) || 1));
                const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
                return new Date(year, monthIndex, Math.min(safeDay, lastDayOfMonth));
            }

            function getBusinessDayDisplayText(value) {
                return Number(value) === LAST_BUSINESS_DAY_VALUE ? 'último dia útil' : `${ordinalNumber(value)} dia útil`;
            }

            function populateBusinessDaySelect() {
                itemBusinessDayInput.innerHTML = '';
                for (let day = 1; day <= 23; day++) {
                    const option = document.createElement('option');
                    option.value = String(day);
                    option.textContent = `${ordinalNumber(day)} dia útil`;
                    itemBusinessDayInput.appendChild(option);
                }
                const lastOption = document.createElement('option');
                lastOption.value = String(LAST_BUSINESS_DAY_VALUE);
                lastOption.textContent = 'Último dia útil';
                itemBusinessDayInput.appendChild(lastOption);
            }

            function getNthBusinessDayOfMonth(year, monthIndex, nth) {
                const cursor = new Date(year, monthIndex, 1);
                let businessDayCount = 0;
                let lastBusinessDay = null;

                while (cursor.getMonth() === monthIndex) {
                    const dayOfWeek = cursor.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        businessDayCount++;
                        lastBusinessDay = new Date(cursor);
                        if (Number(nth) !== LAST_BUSINESS_DAY_VALUE && businessDayCount === Number(nth)) {
                            return new Date(cursor);
                        }
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }

                return lastBusinessDay || new Date(year, monthIndex, 1);
            }

            function ordinalNumber(value) {
                return `${value}º`;
            }

            function formatFixedDayLabel(day) {
                return String(day).padStart(2, '0');
            }

            function getMonthlyIntervalDescription(interval) {
                if (interval === 1) return 'todo mês';
                if (interval === 12) return 'todo ano';
                const alias = RECURRENCE_MONTHLY_ALIASES[interval];
                return alias ? `a cada ${interval} meses (${alias})` : `a cada ${interval} meses`;
            }

            function getDayIntervalDescription(interval) {
                if (interval === 1) return 'todos os dias';
                if (interval === 7) return 'toda semana';
                if (interval === 15) return 'a cada 15 dias';
                return `a cada ${interval} dias`;
            }

            function normalizeRecurrenceConfig(rawConfig = {}) {
                const mode = ['single', 'continuous', 'limited'].includes(rawConfig.mode) ? rawConfig.mode : 'single';
                const kind = ['monthly', 'days', 'business_day'].includes(rawConfig.kind) ? rawConfig.kind : 'monthly';
                const intervalMax = kind === 'days' ? 30 : 12;
                const interval = Math.min(intervalMax, Math.max(1, Number(rawConfig.interval) || 1));
                const referenceDate = parseDateOnly(rawConfig.startDate || rawConfig.anchorDate || rawConfig.referenceDate || '');
                const wantsLastBusinessDay = rawConfig.businessDay === 'last' || Number(rawConfig.businessDay) === LAST_BUSINESS_DAY_VALUE;
                const businessDay = wantsLastBusinessDay
                    ? LAST_BUSINESS_DAY_VALUE
                    : Math.min(23, Math.max(1, Number(rawConfig.businessDay) || 5));
                const totalOccurrences = Math.max(2, Number(rawConfig.totalOccurrences) || 12);
                const monthlyPosition = kind === 'monthly' && ['anchor_date', 'fixed_day', 'month_only'].includes(rawConfig.monthlyPosition)
                    ? rawConfig.monthlyPosition
                    : 'anchor_date';
                const fixedDay = Math.min(31, Math.max(1, Number(rawConfig.fixedDay) || referenceDate?.getDate() || 7));
                return { mode, kind, interval, businessDay, totalOccurrences, monthlyPosition, fixedDay };
            }

            function cloneSchedule(schedule = {}) {
                return normalizeRecurrenceConfig({
                    mode: 'continuous',
                    kind: schedule.kind,
                    interval: schedule.interval,
                    businessDay: schedule.businessDay,
                    monthlyPosition: schedule.monthlyPosition,
                    fixedDay: schedule.fixedDay
                });
            }

            function getRecurrenceConfigFromForm() {
                return normalizeRecurrenceConfig({
                    mode: itemRecurrenceModeSelect.value,
                    kind: itemPeriodicidadeSelect.value,
                    interval: itemPeriodicidadeIntervalInput.value,
                    businessDay: itemBusinessDayInput.value,
                    totalOccurrences: itemParcelasInput.value,
                    monthlyPosition: itemMonthlyPositionSelect.value,
                    fixedDay: itemFixedDayInput.value,
                    referenceDate: itemDataInput.value
                });
            }

            function getDefaultRecurrenceAnchorDate() {
                return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            }

            function getFirstOccurrenceDate(anchorDate, config) {
                const baseDate = anchorDate || (config.mode !== 'single' && config.kind !== 'days' ? getDefaultRecurrenceAnchorDate() : null);
                if (!baseDate) return null;

                if (config.kind === 'business_day') {
                    return getNthBusinessDayOfMonth(baseDate.getFullYear(), baseDate.getMonth(), config.businessDay);
                }
                if (config.kind === 'monthly' && config.monthlyPosition === 'fixed_day') {
                    return getDateWithFixedDayOfMonth(baseDate.getFullYear(), baseDate.getMonth(), config.fixedDay);
                }
                if (config.kind === 'monthly' && config.monthlyPosition === 'month_only') {
                    return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
                }
                return new Date(baseDate);
            }

            function resolveEditorAnchorDate(config) {
                const currentValueDate = parseDateOnly(itemDataInput.value);
                if (config.mode === 'single') return currentValueDate;
                if (config.kind === 'days') return currentValueDate;
                if (config.kind === 'monthly' && config.monthlyPosition === 'anchor_date') return currentValueDate;
                return getFirstOccurrenceDate(currentValueDate, config);
            }

            function buildRecurrenceLabel(config, anchorDate = null) {
                if (config.kind === 'days') {
                    return getDayIntervalDescription(config.interval);
                }
                if (config.kind === 'business_day') {
                    const businessDayText = getBusinessDayDisplayText(config.businessDay);
                    return config.interval === 1
                        ? `todo ${businessDayText} do mês`
                        : `${businessDayText}, ${getMonthlyIntervalDescription(config.interval)}`;
                }
                if (config.monthlyPosition === 'month_only') {
                    return config.interval === 1
                        ? 'todo mês sem data fixa'
                        : `${getMonthlyIntervalDescription(config.interval)} sem data fixa`;
                }

                const firstOccurrenceDate = getFirstOccurrenceDate(anchorDate, config);
                const dayOfMonth = config.monthlyPosition === 'fixed_day'
                    ? config.fixedDay
                    : firstOccurrenceDate?.getDate();

                if (dayOfMonth) {
                    return config.interval === 1
                        ? `todo dia ${formatFixedDayLabel(dayOfMonth)}`
                        : `dia ${formatFixedDayLabel(dayOfMonth)}, ${getMonthlyIntervalDescription(config.interval)}`;
                }
                return getMonthlyIntervalDescription(config.interval);
            }

            function getRecurrenceSummaryText(config, anchorDate) {
                if (config.mode === 'single') {
                    return 'Lançamento único. Nenhum mês futuro será criado automaticamente.';
                }

                const explicitDate = parseDateOnly(itemDataInput.value);
                const firstOccurrenceDate = getFirstOccurrenceDate(anchorDate, config);
                const startsInVisibleMonth = !explicitDate && (
                    config.kind === 'business_day' ||
                    (config.kind === 'monthly' && config.monthlyPosition !== 'anchor_date')
                );
                let firstDateText = 'Defina uma data base para calcular as datas exatas.';

                if (config.kind === 'monthly' && config.monthlyPosition === 'month_only') {
                    firstDateText = `Primeiro período: ${formatMonthYearLabel(firstOccurrenceDate)}. Os lançamentos serão criados sem data.`;
                } else if (firstOccurrenceDate) {
                    firstDateText = `Primeira data calculada: ${formatDatePt(firstOccurrenceDate)}.`;
                }

                if (startsInVisibleMonth) {
                    firstDateText += ` Sem data base escolhida: começa em ${formatMonthYearLabel(getDefaultRecurrenceAnchorDate())}.`;
                }

                const durationText = config.mode === 'continuous'
                    ? 'Os próximos meses serão preenchidos automaticamente conforme você navegar pelo calendário.'
                    : `Serão criadas ${config.totalOccurrences} parcelas/ocorrências, incluindo a atual.`;

                return `${buildRecurrenceLabel(config, anchorDate)}. ${firstDateText} ${durationText}`.trim();
            }

            function updatePresetSelection(config) {
                itemPeriodicityPresets.querySelectorAll('[data-kind]').forEach(button => {
                    const sameKind = button.dataset.kind === config.kind;
                    const sameInterval = Number(button.dataset.interval || 1) === config.interval;
                    const sameBusinessDay = button.dataset.businessDay
                        ? Number(button.dataset.businessDay) === config.businessDay
                        : true;
                    button.classList.toggle('is-active', sameKind && sameInterval && sameBusinessDay);
                });
            }

            function syncRecurrenceUI() {
                const config = getRecurrenceConfigFromForm();
                const explicitDate = parseDateOnly(itemDataInput.value);
                const isSingle = config.mode === 'single';
                const isDays = config.kind === 'days';
                const isBusinessDay = config.kind === 'business_day';
                const isMonthly = config.kind === 'monthly';
                const isFixedDay = !isSingle && isMonthly && config.monthlyPosition === 'fixed_day';
                const isMonthOnly = !isSingle && isMonthly && config.monthlyPosition === 'month_only';
                const anchorDate = resolveEditorAnchorDate(config);
                const firstBusinessDayDate = !isSingle && isBusinessDay ? getFirstOccurrenceDate(explicitDate || anchorDate, config) : null;

                if (!isSingle) {
                    itemSemDataCheckbox.checked = false;
                }
                itemSemDataCheckbox.disabled = !isSingle;

                itemParcelasWrapper.classList.toggle('hidden', config.mode !== 'limited');
                itemRecurrenceConfig.classList.toggle('hidden', isSingle);
                itemMonthlyPositionWrapper.classList.toggle('hidden', isSingle || !isMonthly);
                itemFixedDayWrapper.classList.toggle('hidden', isSingle || !isMonthly || config.monthlyPosition !== 'fixed_day');
                itemBusinessDayWrapper.classList.toggle('hidden', isSingle || !isBusinessDay);
                itemPeriodicidadeIntervalInput.min = '1';
                itemPeriodicidadeIntervalInput.max = isDays ? '30' : '12';
                itemPeriodicidadeIntervalLabel.textContent = isDays ? 'A cada quantos dias?' : 'A cada quantos meses?';
                itemPeriodicidadeIntervalNote.textContent = isDays
                    ? 'Use de 1 a 30 dias. Exemplos prontos: semanal = 7, quinzenal = 15.'
                    : 'Use de 1 a 12 meses. Isso cobre mensal, bimestral, trimestral, quadrimestral, quinquimestral e anual.';
                itemParcelasLabel.textContent = 'Qtd. de parcelas/ocorrências';

                itemBusinessDayPreview.textContent = firstBusinessDayDate
                    ? `${getBusinessDayDisplayText(config.businessDay)} de ${monthNames[firstBusinessDayDate.getMonth()]}: ${formatDatePt(firstBusinessDayDate)}`
                    : 'Escolha um mês inicial para visualizar a data útil calculada.';

                itemDateTrigger.disabled = itemSemDataCheckbox.checked;
                itemDateTrigger.classList.toggle('is-locked', itemDateTrigger.disabled);
                itemDateTrigger.setAttribute('aria-disabled', String(itemDateTrigger.disabled));

                if (itemSemDataCheckbox.checked) {
                    itemDateHelper.textContent = 'Este lançamento ficará sem data definida.';
                } else if (!isSingle && isDays) {
                    itemDateHelper.textContent = 'Escolha a primeira data exata. As próximas seguirão o intervalo em dias.';
                } else if (isMonthOnly) {
                    itemDateHelper.textContent = `Os lançamentos ficarão sem data. Se você não escolher um mês inicial, a regra começa em ${formatMonthYearLabel(getDefaultRecurrenceAnchorDate())}.`;
                } else if (isFixedDay) {
                    itemDateHelper.textContent = `Escolha o mês inicial se quiser começar em outro mês. Sem seleção, a regra começa em ${formatMonthYearLabel(getDefaultRecurrenceAnchorDate())} no dia ${formatFixedDayLabel(config.fixedDay)}.`;
                } else if (!isSingle && isBusinessDay) {
                    itemDateHelper.textContent = `Escolha o mês inicial. Sem seleção, a regra começa em ${formatMonthYearLabel(getDefaultRecurrenceAnchorDate())} no ${getBusinessDayDisplayText(config.businessDay)}.`;
                } else if (!isSingle) {
                    itemDateHelper.textContent = 'Escolha a primeira data da regra. As próximas serão calculadas automaticamente.';
                } else {
                    itemDateHelper.textContent = 'Escolha a data base para este lançamento.';
                }

                if (!isSingle && isDays && !explicitDate) {
                    itemRecurrenceWarning.textContent = 'Informe a primeira data para regras baseadas em dias.';
                } else if (!isSingle && !explicitDate && (isBusinessDay || isFixedDay || isMonthOnly)) {
                    itemRecurrenceWarning.textContent = `Sem data base escolhida: a regra começará no mês aberto (${formatMonthYearLabel(getDefaultRecurrenceAnchorDate())}).`;
                } else {
                    itemRecurrenceWarning.textContent = '';
                }

                itemRecurrenceSummary.textContent = getRecurrenceSummaryText(config, explicitDate || anchorDate);
                updatePresetSelection(config);
            }

            function applyRecurrenceConfigToForm(rawConfig = {}) {
                const config = normalizeRecurrenceConfig(rawConfig);
                itemRecurrenceModeSelect.value = config.mode;
                itemPeriodicidadeSelect.value = config.kind;
                itemPeriodicidadeIntervalInput.value = config.interval;
                itemBusinessDayInput.value = String(config.businessDay);
                itemMonthlyPositionSelect.value = config.monthlyPosition;
                itemFixedDayInput.value = config.fixedDay;
                itemParcelasInput.value = config.totalOccurrences;
                syncRecurrenceUI();
            }

            function buildScheduleFromConfig(config) {
                return {
                    kind: config.kind,
                    interval: config.interval,
                    businessDay: config.businessDay,
                    monthlyPosition: config.monthlyPosition,
                    fixedDay: config.fixedDay
                };
            }

            populateBusinessDaySelect();
            updateUndoButtonState();

            function getRecurrenceGenerationTarget(series, visibleDate) {
                const endOfVisibleMonth = new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 1, 0);
                if (series.schedule.kind === 'days') {
                    return addDaysToDate(endOfVisibleMonth, RECURRENCE_DAY_BUFFER);
                }
                return new Date(visibleDate.getFullYear(), visibleDate.getMonth() + RECURRENCE_MONTH_BUFFER + 1, 0);
            }

            function calculateOccurrenceDateForSeries(series, occurrenceIndex) {
                const startDate = parseDateOnly(series.startDate);
                if (!startDate) return null;

                if (occurrenceIndex <= 1) {
                    return new Date(startDate);
                }

                if (series.schedule.kind === 'days') {
                    return addDaysToDate(startDate, (occurrenceIndex - 1) * series.schedule.interval);
                }

                const monthOffset = (occurrenceIndex - 1) * series.schedule.interval;
                const targetMonth = new Date(startDate.getFullYear(), startDate.getMonth() + monthOffset, 1);
                if (series.schedule.kind === 'business_day') {
                    return getNthBusinessDayOfMonth(targetMonth.getFullYear(), targetMonth.getMonth(), series.schedule.businessDay);
                }
                if (series.schedule.kind === 'monthly' && series.schedule.monthlyPosition === 'fixed_day') {
                    return getDateWithFixedDayOfMonth(targetMonth.getFullYear(), targetMonth.getMonth(), series.schedule.fixedDay);
                }
                if (series.schedule.kind === 'monthly' && series.schedule.monthlyPosition === 'month_only') {
                    return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
                }

                return addMonthsKeepingAnchor(startDate, monthOffset);
            }

            function normalizeRecurringSeriesEntry(rawSeries = {}) {
                const scheduleConfig = rawSeries.schedule ? cloneSchedule(rawSeries.schedule) : normalizeRecurrenceConfig({
                    kind: rawSeries.kind,
                    interval: rawSeries.interval,
                    businessDay: rawSeries.businessDay,
                    monthlyPosition: rawSeries.monthlyPosition,
                    fixedDay: rawSeries.fixedDay,
                    startDate: rawSeries.startDate
                });
                return {
                    id: rawSeries.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type: rawSeries.type === 'entradas' ? 'entradas' : 'despesas',
                    nome: rawSeries.nome || '',
                    valor: Number(rawSeries.valor) || 0,
                    foto: rawSeries.foto || null,
                    startDate: rawSeries.startDate || '',
                    schedule: buildScheduleFromConfig(scheduleConfig),
                    endMode: rawSeries.endMode === 'limited' ? 'limited' : 'continuous',
                    totalOccurrences: rawSeries.endMode === 'limited'
                        ? Math.max(2, Number(rawSeries.totalOccurrences) || 2)
                        : null,
                    generatedCount: Math.max(0, Number(rawSeries.generatedCount) || 0),
                    generatedUntil: rawSeries.generatedUntil || null
                };
            }

            function parseLegacyPeriodicity(periodicidade) {
                switch (periodicidade) {
                    case 'bimestral':
                        return { kind: 'monthly', interval: 2, businessDay: 5 };
                    case 'trimestral':
                        return { kind: 'monthly', interval: 3, businessDay: 5 };
                    case 'quadrimestral':
                        return { kind: 'monthly', interval: 4, businessDay: 5 };
                    case 'quinquimestral':
                        return { kind: 'monthly', interval: 5, businessDay: 5 };
                    case 'semestral':
                        return { kind: 'monthly', interval: 6, businessDay: 5 };
                    case 'anual':
                        return { kind: 'monthly', interval: 12, businessDay: 5 };
                    case 'dia_util_5':
                        return { kind: 'business_day', interval: 1, businessDay: 5 };
                    default:
                        return { kind: 'monthly', interval: 1, businessDay: 5 };
                }
            }

            function migrateLegacyRecurringItemsToSeries() {
                recurringSeries = Array.isArray(recurringSeries) ? recurringSeries.map(normalizeRecurringSeriesEntry) : [];
                const existingSeriesIds = new Set(recurringSeries.map(series => series.id));
                const groupedItems = new Map();

                Object.keys(financialData).forEach(monthKey => {
                    const monthData = ensureMonthData(monthKey);

                    ['entradas', 'despesas'].forEach(type => {
                        monthData[type].forEach(item => {
                            if (item.recurrenceId) {
                                item.occurrenceIndex = Number(item.occurrenceIndex || item.parcelaAtual || 1);
                                item.occurrenceTotal = Number(item.occurrenceTotal || item.parcelaTotal || 0) || null;
                                item.periodicidadeConfig = item.periodicidadeConfig || buildScheduleFromConfig(parseLegacyPeriodicity(item.periodicidade));

                                if (!existingSeriesIds.has(item.recurrenceId)) {
                                    const bucket = groupedItems.get(item.recurrenceId) || [];
                                    bucket.push({ item, type });
                                    groupedItems.set(item.recurrenceId, bucket);
                                }
                            }

                            if (typeof item.id === 'number' && item.id > nextGeneratedId) {
                                nextGeneratedId = item.id;
                            }
                        });
                    });
                });

                groupedItems.forEach((entries, recurrenceId) => {
                    entries.sort((a, b) => {
                        const indexDiff = Number(a.item.occurrenceIndex || 0) - Number(b.item.occurrenceIndex || 0);
                        if (indexDiff !== 0) return indexDiff;
                        return (a.item.data || '').localeCompare(b.item.data || '');
                    });

                    const firstEntry = entries[0];
                    const lastEntry = entries[entries.length - 1];
                    const totalOccurrences = Math.max(
                        ...entries.map(({ item }) => Number(item.occurrenceTotal || item.parcelaTotal || 0)),
                        entries.length
                    );

                    recurringSeries.push(normalizeRecurringSeriesEntry({
                        id: recurrenceId,
                        type: firstEntry.type,
                        nome: firstEntry.item.nome.replace(/\s\(\d+\/\d+\)$/, ''),
                        valor: firstEntry.item.valor,
                        foto: firstEntry.item.foto || null,
                        startDate: firstEntry.item.data || '',
                        schedule: firstEntry.item.periodicidadeConfig || buildScheduleFromConfig(parseLegacyPeriodicity(firstEntry.item.periodicidade)),
                        endMode: firstEntry.item.isContinuousRecurrence ? 'continuous' : 'limited',
                        totalOccurrences: firstEntry.item.isContinuousRecurrence ? null : totalOccurrences,
                        generatedCount: entries.length,
                        generatedUntil: lastEntry.item.data || null
                    }));
                    existingSeriesIds.add(recurrenceId);
                });
            }

            function findRecurringSeriesById(recurrenceId) {
                migrateLegacyRecurringItemsToSeries();
                return recurringSeries.find(series => series.id === recurrenceId) || null;
            }

            function buildRecurringItemName(series, occurrenceIndex) {
                if (series.endMode === 'limited' && series.totalOccurrences > 1) {
                    return `${series.nome} (${occurrenceIndex}/${series.totalOccurrences})`;
                }
                return series.nome;
            }

            function createRecurringOccurrenceItem(series, occurrenceIndex, occurrenceDate) {
                const shouldHideDate = series.schedule.kind === 'monthly' && series.schedule.monthlyPosition === 'month_only';
                return {
                    id: generateItemId(),
                    nome: buildRecurringItemName(series, occurrenceIndex),
                    valor: series.valor,
                    data: shouldHideDate ? null : formatDateOnly(occurrenceDate),
                    foto: series.foto,
                    pago: false,
                    paymentState: 'pending',
                    recurrenceId: series.id,
                    occurrenceIndex,
                    occurrenceTotal: series.endMode === 'limited' ? series.totalOccurrences : null,
                    parcelaAtual: occurrenceIndex,
                    parcelaTotal: series.endMode === 'limited' ? series.totalOccurrences : null,
                    periodicidade: buildRecurrenceLabel({
                        mode: series.endMode,
                        kind: series.schedule.kind,
                        interval: series.schedule.interval,
                        businessDay: series.schedule.businessDay,
                        monthlyPosition: series.schedule.monthlyPosition,
                        fixedDay: series.schedule.fixedDay,
                        totalOccurrences: series.totalOccurrences || 12
                    }, parseDateOnly(series.startDate)),
                    periodicidadeConfig: buildScheduleFromConfig(series.schedule),
                    isContinuousRecurrence: series.endMode === 'continuous',
                    isUnforeseen: false
                };
            }

            function generateSeriesOccurrences(series, options = {}) {
                const startIndex = Math.max(1, Number(options.startIndex) || (Number(series.generatedCount) || 0) + 1);
                const endIndex = Number.isFinite(options.endIndex) ? options.endIndex : null;
                const untilDate = options.untilDate instanceof Date ? options.untilDate : null;
                let lastGeneratedIndex = Number(series.generatedCount) || 0;
                let lastGeneratedDate = series.generatedUntil ? parseDateOnly(series.generatedUntil) : null;

                for (let occurrenceIndex = startIndex; ; occurrenceIndex++) {
                    if (series.endMode === 'limited' && occurrenceIndex > series.totalOccurrences) break;
                    if (endIndex !== null && occurrenceIndex > endIndex) break;

                    const occurrenceDate = calculateOccurrenceDateForSeries(series, occurrenceIndex);
                    if (!occurrenceDate) break;
                    if (untilDate && occurrenceDate > untilDate && endIndex === null) break;

                    const targetKey = getMonthKey(occurrenceDate);
                    const monthData = ensureMonthData(targetKey);
                    const alreadyExists = monthData[series.type].some(item =>
                        item.recurrenceId === series.id &&
                        Number(item.occurrenceIndex || item.parcelaAtual || 0) === occurrenceIndex
                    );

                    if (!alreadyExists) {
                        monthData[series.type].push(createRecurringOccurrenceItem(series, occurrenceIndex, occurrenceDate));
                    }

                    lastGeneratedIndex = occurrenceIndex;
                    lastGeneratedDate = occurrenceDate;
                }

                series.generatedCount = lastGeneratedIndex;
                if (lastGeneratedDate) {
                    series.generatedUntil = formatDateOnly(lastGeneratedDate);
                }
            }

            function ensureRecurringDataForVisibleMonth() {
                migrateLegacyRecurringItemsToSeries();

                recurringSeries.forEach(series => {
                    if (series.endMode !== 'continuous') return;
                    const targetDate = getRecurrenceGenerationTarget(series, currentDate);
                    const generatedUntil = series.generatedUntil ? parseDateOnly(series.generatedUntil) : null;
                    if (!generatedUntil || generatedUntil < targetDate) {
                        generateSeriesOccurrences(series, { startIndex: (Number(series.generatedCount) || 0) + 1, untilDate: targetDate });
                    }
                });
            }

            function createRecurringSeries(type, nome, valor, anchorDate, foto, config) {
                const firstOccurrenceDate = getFirstOccurrenceDate(anchorDate, config);
                return normalizeRecurringSeriesEntry({
                    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type,
                    nome,
                    valor,
                    foto,
                    startDate: formatDateOnly(firstOccurrenceDate),
                    schedule: buildScheduleFromConfig(config),
                    endMode: config.mode === 'limited' ? 'limited' : 'continuous',
                    totalOccurrences: config.mode === 'limited' ? config.totalOccurrences : null,
                    generatedCount: 0,
                    generatedUntil: null
                });
            }

            function addNewRecurringSeries(series) {
                recurringSeries.push(series);
                if (series.endMode === 'limited') {
                    generateSeriesOccurrences(series, { startIndex: 1, endIndex: series.totalOccurrences });
                } else {
                    generateSeriesOccurrences(series, { startIndex: 1, untilDate: getRecurrenceGenerationTarget(series, currentDate) });
                }
            }

            function stripRecurrenceFields(item) {
                delete item.recurrenceId;
                delete item.occurrenceIndex;
                delete item.occurrenceTotal;
                delete item.parcelaAtual;
                delete item.parcelaTotal;
                delete item.periodicidade;
                delete item.periodicidadeConfig;
                delete item.isContinuousRecurrence;
                return item;
            }

            function createStandaloneItem(type, payload, sourceItem = null) {
                const item = {
                    id: payload.preserveId || sourceItem?.id || generateItemId(),
                    nome: payload.nome,
                    valor: payload.valor,
                    data: payload.data,
                    foto: payload.foto || null,
                    isUnforeseen: sourceItem?.isUnforeseen || false
                };

                if (type === 'despesas') {
                    item.pago = Boolean(sourceItem?.pago);
                    item.paymentState = sourceItem?.pago ? 'paid' : (sourceItem?.paymentState || 'pending');
                }

                return stripRecurrenceFields(item);
            }

            function removeSeriesOccurrencesFrom(seriesId, type, startIndex) {
                Object.keys(financialData).forEach(monthKey => {
                    const monthData = ensureMonthData(monthKey);
                    monthData[type] = monthData[type].filter(item =>
                        !(item.recurrenceId === seriesId && Number(item.occurrenceIndex || item.parcelaAtual || 0) >= startIndex)
                    );
                });
            }

            function truncateSeriesAt(seriesId, keepThroughIndex) {
                const series = findRecurringSeriesById(seriesId);
                if (!series) return;

                removeSeriesOccurrencesFrom(seriesId, series.type, keepThroughIndex + 1);

                if (keepThroughIndex <= 0) {
                    recurringSeries = recurringSeries.filter(entry => entry.id !== seriesId);
                    return;
                }

                series.endMode = 'limited';
                series.totalOccurrences = keepThroughIndex;
                series.generatedCount = Math.min(Number(series.generatedCount) || keepThroughIndex, keepThroughIndex);
                series.generatedUntil = formatDateOnly(calculateOccurrenceDateForSeries(series, keepThroughIndex));
            }

            function buildTrashEntry(item, type, monthKey, deletedAt = new Date().toISOString()) {
                return {
                    ...cloneSerializable(item),
                    type,
                    deletedAt,
                    originalMonth: getMonthLabelFromKey(monthKey)
                };
            }

            function collectSeriesOccurrencesFrom(seriesId, type, startIndex) {
                const entries = [];
                Object.keys(financialData).forEach(monthKey => {
                    const monthData = ensureMonthData(monthKey);
                    monthData[type].forEach(item => {
                        const occurrenceIndex = Number(item.occurrenceIndex || item.parcelaAtual || 0);
                        if (item.recurrenceId === seriesId && occurrenceIndex >= startIndex) {
                            entries.push({ item, type, monthKey, occurrenceIndex });
                        }
                    });
                });
                return entries.sort((left, right) => left.occurrenceIndex - right.occurrenceIndex);
            }

            function sendItemsToTrash(entries) {
                const deletedAt = new Date().toISOString();
                entries.forEach(({ item, type, monthKey }) => {
                    trash.push(buildTrashEntry(item, type, monthKey, deletedAt));
                });
            }

            function openDeleteItemModal(type, item, opener) {
                itemParaExcluir = {
                    type,
                    itemId: item.id,
                    recurrenceId: item.recurrenceId || null
                };

                const isRecurring = Boolean(item.recurrenceId);
                deleteItemModalTitle.textContent = isRecurring ? 'Excluir lançamento recorrente' : 'Excluir lançamento';
                deleteItemModalDescription.textContent = isRecurring
                    ? 'Você pode excluir apenas esta ocorrência deste mês ou cortar esta ocorrência e todas as futuras.'
                    : 'Este lançamento será enviado para a lixeira.';
                deleteItemModalRecurringActions.classList.toggle('hidden', !isRecurring);
                deleteItemModalSingleActions.classList.toggle('hidden', isRecurring);

                openModal(deleteItemModal, opener);
            }

            function deleteSelectedItem(scope = 'single') {
                if (!itemParaExcluir) return;

                const { type, itemId, recurrenceId } = itemParaExcluir;
                const key = getMonthKey(currentDate);
                const monthData = ensureMonthData(key);
                const list = monthData[type];
                const item = list.find(entry => entry.id === itemId);
                if (!item) {
                    itemParaExcluir = null;
                    closeTopModal();
                    return;
                }

                const deleteLabel = scope === 'future'
                    ? `exclusão em série de ${type === 'entradas' ? 'entrada' : 'despesa'}`
                    : `exclusão de ${type === 'entradas' ? 'entrada' : 'despesa'}`;
                pushUndoSnapshot(deleteLabel);

                if (recurrenceId && scope === 'future') {
                    const currentOccurrenceIndex = Number(item.occurrenceIndex || item.parcelaAtual || 1);
                    const entriesToRemove = collectSeriesOccurrencesFrom(recurrenceId, type, currentOccurrenceIndex);
                    sendItemsToTrash(entriesToRemove);
                    truncateSeriesAt(recurrenceId, currentOccurrenceIndex - 1);
                } else {
                    sendItemsToTrash([{ item, type, monthKey: key }]);
                    const index = list.findIndex(entry => entry.id === itemId);
                    if (index > -1) {
                        list.splice(index, 1);
                    }
                }

                itemParaExcluir = null;
                closeTopModal();
                ensureRecurringDataForVisibleMonth();
                updateAllUI();
                showToast(scope === 'future' ? 'Lançamento e futuros excluídos.' : 'Lançamento excluído (enviado à Lixeira).');
            }

            function setItemEditorIdentity(type, isEditing) {
                const isEntrada = type === 'entradas';
                itemEditorCard.dataset.type = type;
                itemEditorKindBadgeText.textContent = isEntrada ? 'Entrada' : 'Despesa';
                itemEditorKindIcon.className = isEntrada ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-receipt';
                itemEditorTitle.textContent = `${isEditing ? 'Editar' : 'Nova'} ${isEntrada ? 'Entrada' : 'Despesa'}`;
                itemEditorSubtitle.textContent = isEntrada
                    ? 'Organize recebimentos únicos, parcelados ou recorrentes com dia fixo, dia útil ou períodos sem data.'
                    : 'Cadastre despesas únicas, parceladas ou recorrentes com regras flexíveis de data e periodicidade.';
                itemDataLabel.textContent = isEntrada ? 'Data de recebimento' : 'Data de vencimento';
            }

            function getRemainingOccurrencesForItem(series, item) {
                if (!series || series.endMode !== 'limited') return 12;
                const currentIndex = Number(item.occurrenceIndex || item.parcelaAtual || 1);
                return Math.max(2, (series.totalOccurrences || 1) - currentIndex + 1);
            }

            function getDefaultItemDate() {
                const viewingCurrentMonth = currentDate.getFullYear() === actualCurrentDate.getFullYear() &&
                    currentDate.getMonth() === actualCurrentDate.getMonth();
                const baseDate = viewingCurrentMonth
                    ? new Date(actualCurrentDate)
                    : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                baseDate.setHours(0, 0, 0, 0);
                return formatDateOnly(baseDate);
            }

            function openItemEditor(type, itemId = null, opener, options = {}) {
                const key = getMonthKey(currentDate);
                const data = ensureMonthData(key);

                itemEditorType.value = type;
                tempCroppedImage = null;
                itemRecorrenteParaEditar = null;
                setItemEditorIdentity(type, itemId !== null);
                itemInstallmentsSection.classList.remove('hidden');

                if (itemId !== null) {
                    const item = data[type].find(i => i.id === itemId);
                    if (!item) return;
                    itemEditorId.value = itemId;
                    itemNomeInput.value = item.nome.replace(/\s\(\d+\/\d+\)$/, '');
                    itemValorInput.value = item.valor.toFixed(2).replace('.', ',');
                    setItemDateValue(item.data || '', item.recurrenceId ? 'existing-recurrence' : 'manual');
                    itemSemDataCheckbox.checked = !item.data && !item.recurrenceId;
                    itemFotoPreview.src = item.foto || 'https://placehold.co/256x256/e2e8f0/64748b?text=?';

                    const series = item.recurrenceId ? findRecurringSeriesById(item.recurrenceId) : null;
                    if (series) {
                        applyRecurrenceConfigToForm({
                            mode: series.endMode,
                            kind: series.schedule.kind,
                            interval: series.schedule.interval,
                            businessDay: series.schedule.businessDay,
                            monthlyPosition: series.schedule.monthlyPosition,
                            fixedDay: series.schedule.fixedDay,
                            totalOccurrences: getRemainingOccurrencesForItem(series, item)
                        });
                    } else if (item.recurrenceId || item.periodicidade || item.periodicidadeConfig) {
                        const legacySchedule = item.periodicidadeConfig || buildScheduleFromConfig(parseLegacyPeriodicity(item.periodicidade));
                        applyRecurrenceConfigToForm({
                            mode: item.recurrenceId ? 'limited' : 'single',
                            kind: legacySchedule.kind,
                            interval: legacySchedule.interval,
                            businessDay: legacySchedule.businessDay,
                            monthlyPosition: legacySchedule.monthlyPosition,
                            fixedDay: legacySchedule.fixedDay,
                            totalOccurrences: Number(item.occurrenceTotal || item.parcelaTotal || 12)
                        });
                    } else {
                        applyRecurrenceConfigToForm({ mode: 'single', kind: 'monthly', interval: 1, businessDay: 5, monthlyPosition: 'anchor_date', fixedDay: 7, totalOccurrences: 12 });
                    }
                } else {
                    itemEditorId.value = '';
                    itemNomeInput.value = '';
                    itemValorInput.value = '';
                    setItemDateValue(getDefaultItemDate(), 'manual');
                    itemSemDataCheckbox.checked = false;
                    itemFotoPreview.src = 'https://placehold.co/256x256/e2e8f0/64748b?text=?';
                    applyRecurrenceConfigToForm({ mode: 'single', kind: 'monthly', interval: 1, businessDay: 5, monthlyPosition: 'anchor_date', fixedDay: 7, totalOccurrences: 12 });

                    if (options.prefill) {
                        const prefill = options.prefill;
                        itemNomeInput.value = prefill.nome || '';
                        itemValorInput.value = Number.isFinite(prefill.valor)
                            ? prefill.valor.toFixed(2).replace('.', ',')
                            : '';
                        itemSemDataCheckbox.checked = Boolean(prefill.semData);
                        setItemDateValue(prefill.semData ? '' : (prefill.data || getDefaultItemDate()), 'manual');
                        itemFotoPreview.src = prefill.foto || 'https://placehold.co/256x256/e2e8f0/64748b?text=?';
                    }
                }

                syncRecurrenceUI();
                itemEditorValidationAttempted = false;
                itemEditorModal.dataset.initialState = getFormState();
                validateItemForm();
                openModal(itemEditorModal, opener);
            }

            function getFormState() {
                return JSON.stringify({
                    nome: itemNomeInput.value,
                    valor: itemValorInput.value,
                    data: itemDataInput.value,
                    semData: itemSemDataCheckbox.checked,
                    recurrenceMode: itemRecurrenceModeSelect.value,
                    recurrenceKind: itemPeriodicidadeSelect.value,
                    recurrenceInterval: itemPeriodicidadeIntervalInput.value,
                    recurrenceBusinessDay: itemBusinessDayInput.value,
                    recurrenceMonthlyPosition: itemMonthlyPositionSelect.value,
                    recurrenceFixedDay: itemFixedDayInput.value,
                    parcelas: itemParcelasInput.value,
                    foto: itemFotoPreview.src
                });
            }

            function getItemFormValidationState() {
                const nome = itemNomeInput.value.trim();
                const valorRaw = itemValorInput.value.replace(',', '.');
                const valor = parseFloat(valorRaw);
                const semData = itemSemDataCheckbox.checked;
                const recurrenceConfig = getRecurrenceConfigFromForm();
                const explicitDate = parseDateOnly(itemDataInput.value);
                const resolvedAnchorDate = resolveEditorAnchorDate(recurrenceConfig);
                const requiresExplicitDate = recurrenceConfig.mode !== 'single' && (
                    recurrenceConfig.kind === 'days' ||
                    (recurrenceConfig.kind === 'monthly' && recurrenceConfig.monthlyPosition === 'anchor_date')
                );

                const isNomeValid = nome.length > 0;
                const isValorValid = !isNaN(valor) && valor > 0;
                const isDataValid = recurrenceConfig.mode === 'single'
                    ? semData || Boolean(explicitDate)
                    : (requiresExplicitDate ? Boolean(explicitDate) : Boolean(resolvedAnchorDate));
                const isRecurrenceValid = recurrenceConfig.mode === 'single'
                    ? true
                    : (requiresExplicitDate ? Boolean(explicitDate) : Boolean(resolvedAnchorDate));

                return {
                    isValid: isNomeValid && isValorValid && isDataValid && isRecurrenceValid,
                    fields: {
                        nome: !isNomeValid,
                        valor: !isValorValid,
                        data: !(isDataValid && isRecurrenceValid)
                    }
                };
            }

            function updateItemEditorRequiredHighlights(validationState = getItemFormValidationState(), forceVisible = itemEditorValidationAttempted) {
                const show = Boolean(forceVisible);
                const toggleMissing = (element, isMissing) => {
                    if (!element) return;
                    element.classList.toggle('is-missing', show && Boolean(isMissing));
                };
                const toggleInvalid = (element, isMissing) => {
                    if (!element) return;
                    element.classList.toggle('is-invalid', show && Boolean(isMissing));
                };

                toggleMissing(itemNomeLabel, validationState.fields.nome);
                toggleMissing(itemValorLabel, validationState.fields.valor);
                toggleMissing(itemDataLabel, validationState.fields.data);
                toggleInvalid(itemNomeInput, validationState.fields.nome);
                toggleInvalid(itemValorInput, validationState.fields.valor);
                toggleInvalid(itemDateShell, validationState.fields.data);
            }

            function validateItemForm() {
                const validationState = getItemFormValidationState();
                itemEditorSalvarBtn.disabled = false;
                itemEditorSalvarBtn.dataset.valid = String(validationState.isValid);
                itemEditorSalvarBtn.setAttribute('aria-disabled', String(!validationState.isValid));
                itemEditorSalvarBtn.classList.toggle('is-invalid', itemEditorValidationAttempted && !validationState.isValid);
                updateItemEditorRequiredHighlights(validationState);
                return validationState;
            }

            [itemNomeInput, itemValorInput].forEach(element => {
                element.addEventListener('input', () => {
                    syncRecurrenceUI();
                    validateItemForm();
                });
            });

            [itemRecurrenceModeSelect, itemPeriodicidadeSelect, itemPeriodicidadeIntervalInput, itemBusinessDayInput, itemMonthlyPositionSelect, itemFixedDayInput, itemParcelasInput].forEach(element => {
                element.addEventListener('input', () => {
                    syncRecurrenceUI();
                    validateItemForm();
                });
                element.addEventListener('change', () => {
                    syncRecurrenceUI();
                    validateItemForm();
                });
            });

            itemSemDataCheckbox.addEventListener('change', () => {
                if (itemSemDataCheckbox.checked) {
                    setItemDateValue('', 'manual');
                }
                syncRecurrenceUI();
                validateItemForm();
            });

            itemDateTrigger.addEventListener('click', () => {
                if (itemDateTrigger.disabled) return;
                openItemDatePicker(itemDateTrigger);
            });

            itemDatePickerPrevBtn.addEventListener('click', () => {
                itemDatePickerCursor = new Date(itemDatePickerCursor.getFullYear(), itemDatePickerCursor.getMonth() - 1, 1);
                renderItemDatePicker();
            });

            itemDatePickerNextBtn.addEventListener('click', () => {
                itemDatePickerCursor = new Date(itemDatePickerCursor.getFullYear(), itemDatePickerCursor.getMonth() + 1, 1);
                renderItemDatePicker();
            });

            document.getElementById('item-date-picker-today-btn').addEventListener('click', () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                itemDatePickerCursor = new Date(today.getFullYear(), today.getMonth(), 1);
                setItemDateValue(formatDateOnly(today), 'manual');
                closeTopModal();
                syncRecurrenceUI();
                validateItemForm();
            });

            document.getElementById('item-date-picker-clear-btn').addEventListener('click', () => {
                setItemDateValue('', 'manual');
                closeTopModal();
                syncRecurrenceUI();
                validateItemForm();
            });

            itemPeriodicityPresets.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-kind]');
                if (!button) return;

                if (itemRecurrenceModeSelect.value === 'single') {
                    itemRecurrenceModeSelect.value = 'continuous';
                }

                itemPeriodicidadeSelect.value = button.dataset.kind;
                itemPeriodicidadeIntervalInput.value = button.dataset.interval || '1';
                if (button.dataset.businessDay) {
                    itemBusinessDayInput.value = button.dataset.businessDay;
                }

                syncRecurrenceUI();
                validateItemForm();
            });

            itemFotoTrigger.addEventListener('click', (e) => itemFotoInput.click());

            itemFotoInput.addEventListener('change', (event) => {
                const files = event.target.files;
                if (files && files.length > 0) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        cropperImage.src = e.target.result;
                        if (cropperInstance) cropperInstance.destroy();
                        cropperInstance = new Cropper(cropperImage, { aspectRatio: 1, viewMode: 1, background: false, responsive: true, restore: true, });
                        zoomSlider.value = 0;
                        openModal(imageCropperModal, itemFotoTrigger);
                    };
                    reader.readAsDataURL(files[0]);
                }
                event.target.value = '';
            });

            zoomSlider.addEventListener('input', (e) => { if (cropperInstance) cropperInstance.zoomTo(e.target.value); });
            document.getElementById('cropper-salvar-btn').addEventListener('click', () => { if (cropperInstance) { tempCroppedImage = cropperInstance.getCroppedCanvas({ width: 256, height: 256 }).toDataURL('image/webp', 0.9); itemFotoPreview.src = tempCroppedImage; cropperInstance.destroy(); cropperInstance = null; closeTopModal(); } });

            function saveSeriesFromEditor(type, nome, valor, data, foto, recurrenceConfig, resolvedAnchorDate = null) {
                const anchorDate = resolvedAnchorDate || parseDateOnly(data);
                if (!anchorDate) return false;
                const series = createRecurringSeries(type, nome, valor, anchorDate, foto, recurrenceConfig);
                addNewRecurringSeries(series);
                return true;
            }

            function saveItem(applyToFuture = false) {
                const validationState = validateItemForm();
                if (!validationState.isValid) {
                    itemEditorValidationAttempted = true;
                    validateItemForm();
                    if (requiredFieldsModal && !modalStack.some(entry => entry.element === requiredFieldsModal)) {
                        openModal(requiredFieldsModal, itemEditorSalvarBtn);
                    }
                    return;
                }

                const id = itemEditorId.value ? Number(itemEditorId.value) : null;
                const type = itemEditorType.value;
                const nome = itemNomeInput.value.trim();
                const valor = parseFloat(itemValorInput.value.replace(',', '.'));
                const semData = itemSemDataCheckbox.checked;
                const recurrenceConfig = getRecurrenceConfigFromForm();
                const resolvedAnchorDate = resolveEditorAnchorDate(recurrenceConfig);
                const storesWithoutDate = semData || (recurrenceConfig.mode !== 'single' && recurrenceConfig.kind === 'monthly' && recurrenceConfig.monthlyPosition === 'month_only');
                const data = storesWithoutDate ? null : (resolvedAnchorDate ? formatDateOnly(resolvedAnchorDate) : itemDataInput.value);
                const key = getMonthKey(currentDate);
                const monthData = ensureMonthData(key);
                const list = monthData[type];
                const originalItem = id ? list.find(item => item.id === id) : null;
                const foto = tempCroppedImage || originalItem?.foto || null;
                let saveSucceeded = false;
                let undoRecorded = false;
                const mutationLabel = `${id ? 'alteração' : 'criação'} de ${type === 'entradas' ? 'entrada' : 'despesa'}`;
                const ensureUndoSnapshot = () => {
                    if (!undoRecorded) {
                        pushUndoSnapshot(mutationLabel);
                        undoRecorded = true;
                    }
                };

                if (!['entradas', 'despesas'].includes(type) || !Array.isArray(list)) {
                    showToast('Nao foi possivel salvar este item.');
                    return;
                }

                if (id && originalItem?.recurrenceId && !itemRecorrenteParaEditar) {
                    itemRecorrenteParaEditar = { id, type };
                    openModal(editRecurrenceModal, document.getElementById('item-editor-salvar-btn'));
                    return;
                }

                if (id) {
                    const index = list.findIndex(item => item.id === id);
                    if (index === -1) return;

                    if (originalItem?.recurrenceId && applyToFuture) {
                        ensureUndoSnapshot();
                        const currentOccurrenceIndex = Number(originalItem.occurrenceIndex || originalItem.parcelaAtual || 1);
                        truncateSeriesAt(originalItem.recurrenceId, currentOccurrenceIndex - 1);

                        if (recurrenceConfig.mode === 'single') {
                            list.push(createStandaloneItem(type, { nome, valor, data, foto }, originalItem));
                            saveSucceeded = true;
                        } else {
                            saveSucceeded = saveSeriesFromEditor(type, nome, valor, data, foto, recurrenceConfig, resolvedAnchorDate);
                        }
                    } else if (originalItem?.recurrenceId) {
                        ensureUndoSnapshot();
                        list[index] = createStandaloneItem(type, { nome, valor, data, foto, preserveId: originalItem.id }, originalItem);
                        saveSucceeded = true;
                    } else if (recurrenceConfig.mode === 'single') {
                        ensureUndoSnapshot();
                        list[index] = createStandaloneItem(type, { nome, valor, data, foto, preserveId: originalItem.id }, originalItem);
                        saveSucceeded = true;
                    } else {
                        ensureUndoSnapshot();
                        saveSucceeded = saveSeriesFromEditor(type, nome, valor, data, foto, recurrenceConfig, resolvedAnchorDate);
                        if (saveSucceeded) {
                            list.splice(index, 1);
                        }
                    }

                    if (!saveSucceeded) {
                        if (undoRecorded) {
                            undoStack.pop();
                            updateUndoButtonState();
                        }
                        showToast('Nao foi possivel salvar as alteracoes.');
                        return;
                    }
                    showToast('Alterações salvas.');
                } else {
                    if (recurrenceConfig.mode === 'single') {
                        ensureUndoSnapshot();
                        monthData[type].push(createStandaloneItem(type, { nome, valor, data, foto }));
                        saveSucceeded = true;
                    } else {
                        ensureUndoSnapshot();
                        saveSucceeded = saveSeriesFromEditor(type, nome, valor, data, foto, recurrenceConfig, resolvedAnchorDate);
                    }
                    if (!saveSucceeded) {
                        if (undoRecorded) {
                            undoStack.pop();
                            updateUndoButtonState();
                        }
                        showToast('Nao foi possivel criar este item.');
                        return;
                    }
                    showToast(`${type === 'entradas' ? 'Entrada' : 'Despesa'} criada.`);
                }

                closeTopModal();
                itemRecorrenteParaEditar = null;
                ensureRecurringDataForVisibleMonth();
                updateAllUI();
            }

            itemEditorSalvarBtn.addEventListener('click', () => saveItem(false));
            document.getElementById('edit-recurrence-this-only').addEventListener('click', () => {
                editRecurrenceModal.dataset.choiceConfirmed = 'true';
                closeTopModal();
                saveItem(false);
            });
            document.getElementById('edit-recurrence-this-and-future').addEventListener('click', () => {
                editRecurrenceModal.dataset.choiceConfirmed = 'true';
                closeTopModal();
                saveItem(true);
            });
            document.getElementById('edit-recurrence-cancel-btn').addEventListener('click', () => {
                itemRecorrenteParaEditar = null;
                editRecurrenceModal.dataset.choiceConfirmed = 'false';
            });
            document.getElementById('delete-item-this-only').addEventListener('click', () => deleteSelectedItem('single'));
            document.getElementById('delete-item-this-and-future').addEventListener('click', () => deleteSelectedItem('future'));
            document.getElementById('delete-item-confirm-btn').addEventListener('click', () => deleteSelectedItem('single'));
            document.getElementById('delete-item-cancel-btn').addEventListener('click', () => { itemParaExcluir = null; });

            syncRecurrenceUI();
            validateItemForm();

            // Delegação de eventos para as colunas
            [entradasListContainer, despesasListContainer].forEach(container => {
                container.addEventListener('click', e => {
                    const button = e.target.closest('button');
                    if (!button) return;
                    const action = button.dataset.action || '';

                    if (action === 'page-prev' || action === 'page-next') {
                        requestColumnPage(button.dataset.type, action === 'page-next' ? 1 : -1);
                        return;
                    }
                    if (action === 'toggle-column-view') {
                        const type = button.dataset.type;
                        const shouldCollapse = button.dataset.collapsed !== 'true';
                        setColumnCollapsed(type, shouldCollapse);
                        renderCurrentColumn(type, { instant: true });
                        return;
                    }

                    if (button.classList.contains('action-button-add')) {
                        if (isEditLocked) { showToast('Edição trancada.'); return; }
                        if (isDataLocked) {
                             pinModalPurpose = 'unlockAndAct';
                             actionAfterPin = () => openItemEditor(button.dataset.type, null, button);
                             openModal(secondaryPinWrapper, button);
                             secondaryPinTitle.textContent = 'Revelar Dados para Criar';
                             return;
                        }
                        openItemEditor(button.dataset.type, null, button);
                        return;
                    }

                    if (isEditLocked && action !== 'view-image') { showToast('Edição trancada.'); return;}

                    const card = e.target.closest('[data-id]');
                    if (!card) return;

                    const id = parseInt(card.dataset.id);
                    const type = card.dataset.type;
                    const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                    const list = financialData[key]?.[type] || [];
                    const item = list.find(i => i.id === id);
                    if (!item) return;

                    if(action === 'edit') { openItemEditor(type, id, button); }
                    else if (action === 'schedule') {
                        const nextState = getExpensePaymentState(item) === 'scheduled' ? 'pending' : 'scheduled';
                        setExpensePaymentState(item, nextState);
                        clearUnpayableStatuses(key);
                        updateAllUI();
                    }
                    else if (action === 'delete') {
                        openDeleteItemModal(type, item, button);
                    }
                    else if (action === 'view-image') {
                        viewerImage.src = item.foto;
                        openModal(imageViewerModal, button);
                    }
                });
            });

            // --- LÓGICA DE CONFIGURAÇÕES, LIXEIRA E COMPARTILHAMENTO ---
            const settingsModal = document.getElementById('settings-modal');
            const trashModal = document.getElementById('trash-modal');
            const shareModal = document.getElementById('share-modal');
            const importModal = document.getElementById('import-modal');
            const toast = document.getElementById('toast-notification');
            const toastMessage = document.getElementById('toast-message');
            const trashFilterType = document.getElementById('trash-filter-type');
            const trashFilterMonth = document.getElementById('trash-filter-month');
            const shareSearchInput = document.getElementById('share-search-input');
            const shareConfirmBtn = document.getElementById('share-confirm-btn');
            const importSpreadsheetInput = document.getElementById('import-spreadsheet-input');
            const importFileName = document.getElementById('import-file-name');
            const importSummaryCard = document.getElementById('import-summary-card');
            const importSummaryText = document.getElementById('import-summary-text');
            const importSummaryExtra = document.getElementById('import-summary-extra');
            const importWarningCard = document.getElementById('import-warning-card');
            const importWarningText = document.getElementById('import-warning-text');
            const importPreviewList = document.getElementById('import-preview-list');
            const importConfirmBtn = document.getElementById('import-confirm-btn');
            const searchButton = document.getElementById('search-button');
            const timelineButton = document.getElementById('timeline-button');
            const analyticsButton = document.getElementById('analytics-button');
            const searchModal = document.getElementById('search-modal');
            const globalSearchInput = document.getElementById('global-search-input');
            const globalSearchFilter = document.getElementById('global-search-filter');
            const globalSearchYearFilter = document.getElementById('global-search-year-filter');
            const globalSearchResults = document.getElementById('global-search-results');
            const timelineModal = document.getElementById('timeline-modal');
            const timelinePeriodFilter = document.getElementById('timeline-period-filter');
            const timelineTypeFilter = document.getElementById('timeline-type-filter');
            const timelineModeFilter = document.getElementById('timeline-mode-filter');
            const timelineSummary = document.getElementById('timeline-summary');
            const timelineResults = document.getElementById('timeline-results');
            const analyticsModal = document.getElementById('analytics-modal');
            const analyticsYearLabel = document.getElementById('analytics-year-label');
            const analyticsPeriodFilter = document.getElementById('analytics-period-filter');
            const analyticsSummaryGrid = document.getElementById('analytics-summary-grid');
            const analyticsYearGrid = document.getElementById('analytics-year-grid');
            const analyticsYearChartCanvas = document.getElementById('analytics-year-chart');
            const analyticsCurrentChartCanvas = document.getElementById('analytics-current-chart');
            const analyticsPrimaryKicker = document.getElementById('analytics-primary-kicker');
            const analyticsPrimaryTitle = document.getElementById('analytics-primary-title');
            const analyticsSecondaryKicker = document.getElementById('analytics-secondary-kicker');
            const analyticsSecondaryTitle = document.getElementById('analytics-secondary-title');
            const analyticsGridKicker = document.getElementById('analytics-grid-kicker');
            const analyticsGridTitle = document.getElementById('analytics-grid-title');
            const downloadAnalyticsReportBtn = document.getElementById('download-analytics-report-btn');
            const downloadManualPdfBtn = document.getElementById('download-manual-pdf-btn');

            mainAppContainer.addEventListener('scroll', requestScrollMorphUpdate, { passive: true });
            window.addEventListener('resize', requestScrollMorphUpdate);
            window.addEventListener('resize', () => {
                clearTimeout(window.columnPagerResizeTimer);
                window.columnPagerResizeTimer = setTimeout(() => {
                    renderLists();
                    if (timelineModal && !timelineModal.classList.contains('hidden')) {
                        renderTimelineModal({ instant: true });
                    }
                }, 180);
            });

            undoActionButton.addEventListener('click', undoLastAction);
            document.getElementById('settings-button').addEventListener('click', (e) => openModal(settingsModal, e.currentTarget));
            document.getElementById('open-import-modal-btn').addEventListener('click', () => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                closeTopModal();
                resetImportState();
                openModal(importModal, document.getElementById('settings-button'));
            });
            document.getElementById('open-trash-modal-btn').addEventListener('click', (e) => { renderTrash(); openModal(trashModal, e.currentTarget); });
            document.getElementById('open-share-modal-btn').addEventListener('click', (e) => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                renderShareUsers();
                openModal(shareModal, e.currentTarget);
            });
            document.getElementById('open-sobras-help-modal-btn').addEventListener('click', (e) => openModal(sobrasHelpModal, e.currentTarget));
            document.getElementById('select-import-file-btn').addEventListener('click', () => importSpreadsheetInput.click());
            document.getElementById('import-confirm-btn').addEventListener('click', applySpreadsheetImport);
            ['import-cancel-btn', 'close-import-modal-btn'].forEach(id => {
                document.getElementById(id).addEventListener('click', resetImportState);
            });
            importSpreadsheetInput.addEventListener('change', async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;

                importFileName.textContent = file.name;

                try {
                    const fileBuffer = await file.arrayBuffer();
                    const { importedRows, skippedRows, importedGeneralNotes = [] } = parseSpreadsheetFile(fileBuffer);
                    pendingSpreadsheetImport = {
                        fileName: file.name,
                        importedRows,
                        skippedRows,
                        importedGeneralNotes
                    };
                    renderImportPreview();
                } catch (error) {
                    pendingSpreadsheetImport = null;
                    renderImportPreview();
                    showToast('Não foi possível ler essa planilha.');
                    console.error('Erro ao importar planilha.', error);
                }
            });

            function showToast(message) {
                toastMessage.textContent = message;
                toast.classList.remove('opacity-0', 'translate-y-2');
                srAnnouncer.textContent = message;
                setTimeout(() => {
                    toast.classList.add('opacity-0', 'translate-y-2');
                }, 3000);
            }

            function normalizeImportHeader(value = '') {
                return String(value)
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '');
            }

            function getImportCell(rowMap, aliases) {
                for (const alias of aliases) {
                    const value = rowMap[normalizeImportHeader(alias)];
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                        return value;
                    }
                }
                return '';
            }

            function parseImportedCurrency(value) {
                if (typeof value === 'number') return value;
                if (value === null || value === undefined) return NaN;
                let normalized = String(value).trim();
                if (!normalized) return NaN;
                normalized = normalized
                    .replace(/\s/g, '')
                    .replace(/[R$\u00A0]/g, '')
                    .replace(/[−–—]/g, '-');

                const lastComma = normalized.lastIndexOf(',');
                const lastDot = normalized.lastIndexOf('.');

                if (lastComma !== -1 && lastDot !== -1) {
                    const decimalSeparator = lastComma > lastDot ? ',' : '.';
                    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
                    normalized = normalized.split(thousandSeparator).join('');
                    if (decimalSeparator === ',') {
                        normalized = normalized.replace(',', '.');
                    }
                } else if (lastComma !== -1) {
                    const decimalPlaces = normalized.length - lastComma - 1;
                    normalized = decimalPlaces === 2
                        ? normalized.replace(',', '.')
                        : normalized.split(',').join('');
                } else if (lastDot !== -1) {
                    const decimalPlaces = normalized.length - lastDot - 1;
                    normalized = decimalPlaces === 2
                        ? normalized
                        : normalized.split('.').join('');
                }
                normalized = normalized.replace(/[^0-9.-]/g, '');
                return parseFloat(normalized);
            }

            function monthStringToIndex(value) {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    const month = Math.max(1, Math.min(12, Math.round(value)));
                    return month - 1;
                }
                const normalized = normalizeImportHeader(value);
                const monthAliases = {
                    janeiro: 0, jan: 0,
                    fevereiro: 1, fev: 1,
                    marco: 2, mar: 2,
                    abril: 3, abr: 3,
                    maio: 4, mai: 4,
                    junho: 5, jun: 5,
                    julho: 6, jul: 6,
                    agosto: 7, ago: 7,
                    setembro: 8, set: 8,
                    outubro: 9, out: 9,
                    novembro: 10, nov: 10,
                    dezembro: 11, dez: 11
                };
                if (monthAliases[normalized] !== undefined) return monthAliases[normalized];
                const numeric = Number(normalized);
                if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return numeric - 1;
                return null;
            }

            function parseImportedDate(value) {
                if (!value && value !== 0) return null;
                if (value instanceof Date && !Number.isNaN(value.getTime())) {
                    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
                }
                if (typeof value === 'number' && Number.isFinite(value)) {
                    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
                    return new Date(excelEpoch.getUTCFullYear(), excelEpoch.getUTCMonth(), excelEpoch.getUTCDate());
                }

                const text = String(value).trim();
                if (!text) return null;

                if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                    return parseDateOnly(text);
                }

                const brMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
                if (brMatch) {
                    const day = Number(brMatch[1]);
                    const month = Number(brMatch[2]) - 1;
                    const year = Number(brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3]);
                    return new Date(year, month, day);
                }

                const parsed = new Date(text);
                if (!Number.isNaN(parsed.getTime())) {
                    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
                }

                return null;
            }

            function parseImportedMonthYearValue(value, fallbackYear = null) {
                const text = cleanImportedText(value);
                if (!text) return null;

                const normalized = normalizeImportHeader(text);
                const monthMatch = monthNames.findIndex(monthName => normalized.includes(normalizeImportHeader(monthName)));
                const numericMatch = text.match(/\b(0?[1-9]|1[0-2])[\/.-](\d{2,4})\b/);
                if (numericMatch) {
                    const monthIndex = Number(numericMatch[1]) - 1;
                    const yearNumber = Number(numericMatch[2].length === 2 ? `20${numericMatch[2]}` : numericMatch[2]);
                    if (monthIndex >= 0 && monthIndex <= 11 && Number.isFinite(yearNumber)) {
                        return { monthIndex, yearNumber };
                    }
                }

                const textualYearMatch = text.match(/(\d{4})/);
                const monthIndex = monthMatch !== -1 ? monthMatch : monthStringToIndex(text);
                const yearNumber = textualYearMatch ? Number(textualYearMatch[1]) : Number.isFinite(fallbackYear) ? Number(fallbackYear) : null;
                if (monthIndex !== null && monthIndex !== -1 && Number.isFinite(yearNumber)) {
                    return { monthIndex, yearNumber };
                }

                return null;
            }

            function parseImportedPaidValue(value) {
                const normalized = normalizeImportHeader(value);
                if (!normalized) return false;
                return ['sim', 's', 'true', 'pago', 'quitado', 'recebido', 'ok', '1', 'yes'].includes(normalized);
            }

            function detectImportedType(typeValue, sheetName, amountValue) {
                const normalizedType = normalizeImportHeader(typeValue);
                const normalizedSheet = normalizeImportHeader(sheetName);
                if (normalizedType.includes('entrada') || normalizedType.includes('receita') || normalizedType.includes('receb')) return 'entradas';
                if (normalizedType.includes('despesa') || normalizedType.includes('saida') || normalizedType.includes('gasto') || normalizedType.includes('conta')) return 'despesas';
                if (normalizedSheet.includes('entrada') || normalizedSheet.includes('receita')) return 'entradas';
                if (normalizedSheet.includes('despesa') || normalizedSheet.includes('saida') || normalizedSheet.includes('gasto')) return 'despesas';
                if (Number.isFinite(amountValue) && amountValue < 0) return 'despesas';
                return null;
            }

            function buildMonthKeyFromImportedRow(dateValue, monthValue, yearValue, sheetName = '', fallbackMonthKey = null) {
                const parsedDate = parseImportedDate(dateValue);
                if (parsedDate) {
                    return {
                        monthKey: getMonthKey(parsedDate),
                        data: formatDateOnly(parsedDate)
                    };
                }

                const sheetYearHint = extractFamilyAndradeSheetYear(sheetName);
                const directMonthYear = parseImportedMonthYearValue(monthValue, Number(String(yearValue || '').trim()) || sheetYearHint)
                    || parseImportedMonthYearValue(dateValue, Number(String(yearValue || '').trim()) || sheetYearHint)
                    || parseImportedMonthYearValue(yearValue, sheetYearHint);
                if (directMonthYear) {
                    return {
                        monthKey: `${directMonthYear.yearNumber}-${directMonthYear.monthIndex}`,
                        data: null
                    };
                }

                const monthIndex = monthStringToIndex(monthValue);
                const yearNumber = Number(String(yearValue || '').trim()) || sheetYearHint;
                if (monthIndex !== null && Number.isFinite(yearNumber)) {
                    return {
                        monthKey: `${yearNumber}-${monthIndex}`,
                        data: null
                    };
                }

                if (fallbackMonthKey) {
                    return {
                        monthKey: fallbackMonthKey,
                        data: null
                    };
                }

                return {
                    monthKey: getMonthKey(currentDate),
                    data: null
                };
            }

            const FAMILY_ANDRADE_CONTA_SHEET_PATTERN = /^PLANILHA\s+DE\s+CONTAS\s+\d{4}(?:\b|$)/i;
            const FAMILY_ANDRADE_SUMMARY_SHEET_PATTERN = /^PLANILHA\s+DE\s+RESUMOS\s+\d{4}(?:\b|$)/i;

            function cleanImportedText(value) {
                return String(value ?? '')
                    .replace(/\r\n?/g, '\n')
                    .replace(/\n+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            function cleanImportedMultilineText(value) {
                return String(value ?? '')
                    .replace(/\r\n?/g, '\n')
                    .split('\n')
                    .map(line => line.replace(/\s+/g, ' ').trim())
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            }

            function getImportedSheetCell(rows, rowIndex, colIndex) {
                return rows?.[rowIndex]?.[colIndex] ?? '';
            }

            function isFamilyAndradeContaSheetName(sheetName) {
                return FAMILY_ANDRADE_CONTA_SHEET_PATTERN.test(String(sheetName || '').trim());
            }

            function isFamilyAndradeSummarySheetName(sheetName) {
                return FAMILY_ANDRADE_SUMMARY_SHEET_PATTERN.test(String(sheetName || '').trim());
            }

            function extractFamilyAndradeSheetYear(sheetName) {
                const match = String(sheetName || '').match(/(\d{4})/);
                return match ? Number(match[1]) : null;
            }

            function isFamilyAndradeWorkbook(workbook) {
                return workbook.SheetNames.some(isFamilyAndradeContaSheetName);
            }

            function isFamilyAndradeSummaryLabel(value) {
                const normalized = normalizeImportHeader(cleanImportedText(value));
                if (!normalized) return false;
                if (['entradas', 'dividas', 'descricao', 'valor', 'status', 'onhold'].includes(normalized)) return true;
                return normalized.startsWith('total')
                    || normalized.startsWith('quantofalta')
                    || normalized.startsWith('quantosobra')
                    || normalized.startsWith('quantojafoipagonessemes')
                    || normalized.startsWith('quantofaltapagarnessemes');
            }

            function hasMeaningfulImportedNote(value) {
                const text = cleanImportedMultilineText(value);
                const normalized = normalizeImportHeader(text);
                if (!text || !normalized) return false;
                return !/^\d+$/.test(normalized);
            }

            function parseImportedInstallmentInfo(name) {
                const matches = [...cleanImportedText(name).matchAll(/(\d{1,3})\s*\/\s*(\d{1,3})/g)];
                if (matches.length === 0) return null;

                const lastMatch = matches[matches.length - 1];
                const occurrenceIndex = Number(lastMatch[1]);
                const occurrenceTotal = Number(lastMatch[2]);
                if (!Number.isFinite(occurrenceIndex) || !Number.isFinite(occurrenceTotal)) return null;
                if (occurrenceIndex < 1 || occurrenceTotal <= 1 || occurrenceIndex > occurrenceTotal) return null;

                return { occurrenceIndex, occurrenceTotal };
            }

            function sheetHasNearbyLabel(sheetRows, rowIndex, colIndex, expectedLabel, depth = 2) {
                for (let offset = 1; offset <= depth; offset++) {
                    const candidate = normalizeImportHeader(cleanImportedText(getImportedSheetCell(sheetRows, rowIndex + offset, colIndex)));
                    if (candidate === expectedLabel) return true;
                }
                return false;
            }

            function findFamilyAndradeMonthAnchors(sheetRows) {
                const anchors = [];

                sheetRows.forEach((row, rowIndex) => {
                    (row || []).forEach((cellValue, colIndex) => {
                        const monthIndex = monthStringToIndex(cleanImportedText(cellValue));
                        if (monthIndex === null) return;

                        if (!sheetHasNearbyLabel(sheetRows, rowIndex, colIndex, 'entradas', 3)) return;

                        anchors.push({ rowIndex, colIndex, monthIndex });
                    });
                });

                return anchors.sort((a, b) => (a.rowIndex - b.rowIndex) || (a.colIndex - b.colIndex));
            }

            function findFamilyAndradeSummaryAnchors(sheetRows) {
                const anchors = [];

                sheetRows.forEach((row, rowIndex) => {
                    (row || []).forEach((cellValue, colIndex) => {
                        const monthIndex = monthStringToIndex(cleanImportedText(cellValue));
                        if (monthIndex === null) return;

                        if (!sheetHasNearbyLabel(sheetRows, rowIndex, colIndex, 'resumo', 3)) return;

                        anchors.push({ rowIndex, colIndex, monthIndex });
                    });
                });

                return anchors.sort((a, b) => (a.rowIndex - b.rowIndex) || (a.colIndex - b.colIndex));
            }

            function mergeImportedAnnotationText(existingText, importedText) {
                const existing = cleanImportedMultilineText(existingText);
                const imported = cleanImportedMultilineText(importedText);
                if (!imported) return existing;
                if (!existing) return imported;
                if (existing.includes(imported)) return existing;
                return `${existing}\n\n${imported}`;
            }

            function buildFamilyAndradeImportedRow(sheetName, rowNumber, type, monthKey, nome, valor, pago = '') {
                const cleanedName = cleanImportedText(nome);
                const installmentInfo = parseImportedInstallmentInfo(cleanedName);

                return {
                    sheetName,
                    rowNumber,
                    type,
                    nome: cleanedName,
                    valor: Math.abs(valor),
                    data: null,
                    monthKey,
                    pago: type === 'despesas' ? MLGDomain.importStatus(pago) === 'paid' : false,
                    paymentState: MLGDomain.importStatus(pago),
                    occurrenceIndex: installmentInfo?.occurrenceIndex || null,
                    occurrenceTotal: installmentInfo?.occurrenceTotal || null
                };
            }

            function parseFamilyAndradeMonthBlock(sheetRows, sheetName, year, anchor, nextBlockRow) {
                const importedRows = [];
                const skippedRows = [];
                const monthKey = `${year}-${anchor.monthIndex}`;
                const entryStartRow = anchor.rowIndex + 2;

                let totalEntriesRow = -1;
                for (let rowIndex = entryStartRow; rowIndex < nextBlockRow; rowIndex++) {
                    const label = cleanImportedText(getImportedSheetCell(sheetRows, rowIndex, anchor.colIndex));
                    if (normalizeImportHeader(label).startsWith('total')) {
                        totalEntriesRow = rowIndex;
                        break;
                    }
                }

                if (totalEntriesRow === -1) {
                    skippedRows.push({
                        sheetName,
                        rowNumber: anchor.rowIndex + 1,
                        reason: `Não foi possível localizar o total de entradas de ${monthNames[anchor.monthIndex]}.`
                    });
                    return { importedRows, skippedRows };
                }

                for (let rowIndex = entryStartRow; rowIndex < totalEntriesRow; rowIndex++) {
                    const nome = cleanImportedText(getImportedSheetCell(sheetRows, rowIndex, anchor.colIndex));
                    const valor = parseImportedCurrency(getImportedSheetCell(sheetRows, rowIndex, anchor.colIndex + 1));
                    if (!nome || isFamilyAndradeSummaryLabel(nome) || !Number.isFinite(valor) || valor === 0) continue;

                    importedRows.push(
                        buildFamilyAndradeImportedRow(sheetName, rowIndex + 1, 'entradas', monthKey, nome, valor)
                    );
                }

                let expenseStartRow = totalEntriesRow + 1;
                const firstExpenseLabel = normalizeImportHeader(cleanImportedText(getImportedSheetCell(sheetRows, expenseStartRow, anchor.colIndex)));
                if (firstExpenseLabel === 'dividas') {
                    expenseStartRow += 1;
                }
                const secondExpenseLabel = normalizeImportHeader(cleanImportedText(getImportedSheetCell(sheetRows, expenseStartRow, anchor.colIndex)));
                if (secondExpenseLabel === 'descricao') {
                    expenseStartRow += 1;
                }

                for (let rowIndex = expenseStartRow; rowIndex < nextBlockRow; rowIndex++) {
                    const nome = cleanImportedText(getImportedSheetCell(sheetRows, rowIndex, anchor.colIndex));
                    if (isFamilyAndradeSummaryLabel(nome)) break;
                    if (!nome) continue;

                    const valor = parseImportedCurrency(getImportedSheetCell(sheetRows, rowIndex, anchor.colIndex + 1));
                    if (!Number.isFinite(valor) || valor === 0) continue;

                    const statusText = cleanImportedText(getImportedSheetCell(sheetRows, rowIndex, anchor.colIndex + 2));
                    const pago = statusText;

                    importedRows.push(
                        buildFamilyAndradeImportedRow(sheetName, rowIndex + 1, 'despesas', monthKey, nome, valor, pago)
                    );
                }

                return { importedRows, skippedRows };
            }

            function parseFamilyAndradeSummaryBlock(sheetRows, sheetName, year, anchor, anchors, anchorIndex) {
                const nextBlockAnchor = anchors.slice(anchorIndex + 1).find(entry => entry.rowIndex > anchor.rowIndex);
                const nextSameRowAnchor = anchors.slice(anchorIndex + 1).find(entry => entry.rowIndex === anchor.rowIndex && entry.colIndex > anchor.colIndex);
                const nextBlockRow = nextBlockAnchor ? nextBlockAnchor.rowIndex : sheetRows.length;
                const nextColumn = nextSameRowAnchor ? nextSameRowAnchor.colIndex : anchor.colIndex + 3;
                const collectedNotes = [];

                for (let rowIndex = anchor.rowIndex + 2; rowIndex < nextBlockRow; rowIndex++) {
                    for (let colIndex = anchor.colIndex; colIndex < nextColumn; colIndex++) {
                        const text = cleanImportedMultilineText(getImportedSheetCell(sheetRows, rowIndex, colIndex));
                        if (!hasMeaningfulImportedNote(text)) continue;
                        if (monthStringToIndex(text) !== null) continue;
                        if (normalizeImportHeader(text) === 'resumo') continue;
                        if (!collectedNotes.includes(text)) {
                            collectedNotes.push(text);
                        }
                    }
                }

                if (collectedNotes.length === 0) return null;

                return {
                    sheetName,
                    rowNumber: anchor.rowIndex + 3,
                    monthKey: `${year}-${anchor.monthIndex}`,
                    text: collectedNotes.join('\n\n')
                };
            }

            function parseFamilyAndradeSummaryWorkbook(workbook) {
                const importedGeneralNotes = [];
                const skippedRows = [];

                workbook.SheetNames
                    .filter(isFamilyAndradeSummarySheetName)
                    .forEach(sheetName => {
                        const year = extractFamilyAndradeSheetYear(sheetName);
                        if (!Number.isFinite(year)) return;

                        const worksheet = workbook.Sheets[sheetName];
                        const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
                        const anchors = findFamilyAndradeSummaryAnchors(sheetRows);
                        if (anchors.length === 0) return;

                        anchors.forEach((anchor, index) => {
                            const importedNote = parseFamilyAndradeSummaryBlock(sheetRows, sheetName, year, anchor, anchors, index);
                            if (importedNote) {
                                importedGeneralNotes.push(importedNote);
                            }
                        });
                    });

                return { importedGeneralNotes, skippedRows };
            }

            function parseFamilyAndradeWorkbook(workbook) {
                const importedRows = [];
                const skippedRows = [];

                workbook.SheetNames
                    .filter(isFamilyAndradeContaSheetName)
                    .forEach(sheetName => {
                        const year = extractFamilyAndradeSheetYear(sheetName);
                        if (!Number.isFinite(year)) return;

                        const worksheet = workbook.Sheets[sheetName];
                        const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
                        const anchors = findFamilyAndradeMonthAnchors(sheetRows);
                        if (anchors.length === 0) {
                            skippedRows.push({
                                sheetName,
                                rowNumber: 1,
                                reason: 'Não foi possível reconhecer os blocos de meses dessa aba.'
                            });
                            return;
                        }

                        anchors.forEach((anchor, index) => {
                            const nextBlockAnchor = anchors.slice(index + 1).find(entry => entry.rowIndex > anchor.rowIndex);
                            const nextBlockRow = nextBlockAnchor ? nextBlockAnchor.rowIndex : sheetRows.length;
                            const result = parseFamilyAndradeMonthBlock(sheetRows, sheetName, year, anchor, nextBlockRow);
                            importedRows.push(...result.importedRows);
                            skippedRows.push(...result.skippedRows);
                        });
                    });

                const summaryImport = parseFamilyAndradeSummaryWorkbook(workbook);
                skippedRows.push(...summaryImport.skippedRows);

                return {
                    importedRows,
                    skippedRows,
                    importedGeneralNotes: summaryImport.importedGeneralNotes
                };
            }

            function parseGenericSpreadsheetWorkbook(workbook) {
                const importedRows = [];
                const skippedRows = [];

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });
                    let lastResolvedMonthKey = null;
                    const sheetYearHint = extractFamilyAndradeSheetYear(sheetName);

                    rows.forEach((rawRow, index) => {
                        const rowMap = {};
                        Object.entries(rawRow || {}).forEach(([key, value]) => {
                            rowMap[normalizeImportHeader(key)] = value;
                        });

                        const nome = String(getImportCell(rowMap, ['descricao', 'descrição', 'nome', 'item', 'titulo', 'título', 'lancamento', 'lançamento', 'conta'])).trim();
                        const valorOriginal = getImportCell(rowMap, ['valor', 'amount', 'total', 'preco', 'preço', 'vlr', 'quantia']);
                        const valor = parseImportedCurrency(valorOriginal);
                        const tipo = detectImportedType(getImportCell(rowMap, ['tipo', 'type', 'natureza', 'categoria', 'movimento']), sheetName, valor);

                        if (!nome || isFamilyAndradeSummaryLabel(nome) || !Number.isFinite(valor) || valor === 0 || !tipo) {
                            skippedRows.push({
                                sheetName,
                                rowNumber: index + 2,
                                reason: !nome ? 'Sem descrição/nome detectável.' : !Number.isFinite(valor) || valor === 0 ? 'Sem valor válido.' : 'Não foi possível detectar se é entrada ou despesa.'
                            });
                            return;
                        }

                        const { monthKey, data } = buildMonthKeyFromImportedRow(
                            getImportCell(rowMap, ['data', 'date', 'vencimento', 'recebimento']),
                            getImportCell(rowMap, ['mes', 'mês', 'month', 'competencia', 'competência']),
                            getImportCell(rowMap, ['ano', 'year']) || sheetYearHint,
                            sheetName,
                            lastResolvedMonthKey
                        );
                        if (monthKey) {
                            lastResolvedMonthKey = monthKey;
                        }

                        importedRows.push({
                            sheetName,
                            rowNumber: index + 2,
                            type: tipo,
                            nome,
                            valor: Math.abs(valor),
                            data,
                            monthKey,
                            pago: tipo === 'despesas' ? MLGDomain.importStatus(getImportCell(rowMap, ['status', 'pago', 'quitado', 'paid'])) === 'paid' : false,
                            paymentState: MLGDomain.importStatus(getImportCell(rowMap, ['status', 'pago', 'quitado', 'paid'])),
                            occurrenceIndex: Number(getImportCell(rowMap, ['parcela'])) || null,
                            occurrenceTotal: Number(getImportCell(rowMap, ['parcelas'])) || null,
                            sourceId: String(getImportCell(rowMap, ['id']) || '')
                        });
                    });
                });

                return { importedRows, skippedRows, importedGeneralNotes: [] };
            }

            function parseSpreadsheetFile(file) {
                if (!window.XLSX) {
                    throw new Error('A biblioteca de leitura de Excel não foi carregada.');
                }

                const workbook = XLSX.read(file, { type: 'array', cellDates: true });
                if (workbook.Sheets['MLG Lancamentos']) {
                    const result = parseGenericSpreadsheetWorkbook({SheetNames:['MLG Lancamentos'], Sheets:workbook.Sheets});
                    if (workbook.Sheets['MLG Anotacoes']) {
                        result.importedGeneralNotes = XLSX.utils.sheet_to_json(workbook.Sheets['MLG Anotacoes'], {defval:''})
                            .filter(row => /^\d{4}-(?:[0-9]|1[01])$/.test(row.Mes) && ['entradas','despesas','geral'].includes(row.Tipo))
                            .map(row => ({monthKey:row.Mes,type:row.Tipo,text:String(row.Texto)}));
                    }
                    return result;
                }
                return isFamilyAndradeWorkbook(workbook)
                    ? parseFamilyAndradeWorkbook(workbook)
                    : parseGenericSpreadsheetWorkbook(workbook);
            }

            function renderImportPreview() {
                importPreviewList.innerHTML = '';
                const importedRowsCount = pendingSpreadsheetImport?.importedRows?.length || 0;
                const importedNotesCount = pendingSpreadsheetImport?.importedGeneralNotes?.length || 0;
                importConfirmBtn.disabled = !pendingSpreadsheetImport || (importedRowsCount === 0 && importedNotesCount === 0);

                if (!pendingSpreadsheetImport) {
                    importSummaryCard.classList.add('hidden');
                    importWarningCard.classList.add('hidden');
                    importPreviewList.innerHTML = '<p class="text-sm text-gray-500 dark:text-zinc-400">Escolha um arquivo para ver a prévia da importação.</p>';
                    return;
                }

                const { importedRows, skippedRows, importedGeneralNotes = [] } = pendingSpreadsheetImport;
                const entradas = importedRows.filter(item => item.type === 'entradas').length;
                const despesas = importedRows.filter(item => item.type === 'despesas').length;
                const months = new Set(importedRows.map(item => item.monthKey));
                const monthsWithNotes = new Set(importedGeneralNotes.map(item => item.monthKey));

                importSummaryCard.classList.remove('hidden');
                importSummaryText.textContent = importedRows.length > 0
                    ? `${importedRows.length} lançamentos detectados: ${entradas} entradas e ${despesas} despesas.`
                    : `${importedGeneralNotes.length} anotação(ões) gerais detectadas na planilha.`;
                importSummaryExtra.textContent = `${months.size} mês(es) com lançamentos • ${monthsWithNotes.size} mês(es) com anotação geral. Arquivo: ${pendingSpreadsheetImport.fileName}`;

                if (skippedRows.length > 0) {
                    importWarningCard.classList.remove('hidden');
                    importWarningText.textContent = `${skippedRows.length} linha(s) ou bloco(s) não puderam ser lidos automaticamente.`;
                } else {
                    importWarningCard.classList.add('hidden');
                    importWarningText.textContent = '';
                }

                if (importedRows.length === 0 && importedGeneralNotes.length === 0) {
                    importPreviewList.innerHTML = '<p class="text-sm text-gray-500 dark:text-zinc-400">Nenhum dado válido foi encontrado nessa planilha.</p>';
                    return;
                }

                importedRows.slice(0, 12).forEach(item => {
                    const installmentText = item.occurrenceTotal > 1 ? ` • ${item.occurrenceIndex}/${item.occurrenceTotal}` : '';
                    const row = document.createElement('div');
                    row.className = 'p-3 rounded-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700';
                    row.innerHTML = `
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <p class="font-semibold text-gray-900 dark:text-zinc-100 truncate">${escapeHtml(item.nome)}</p>
                                <p class="text-xs text-gray-500 dark:text-zinc-400">${item.type === 'entradas' ? 'Entrada' : 'Despesa'} • ${getMonthLabelFromKey(item.monthKey)}${item.data ? ` • ${formatDatePt(item.data)}` : ' • sem data'}${installmentText}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold ${item.type === 'entradas' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">${formatCurrency(item.valor)}</p>
                                ${item.type === 'despesas' ? `<p class="text-xs ${item.pago ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-zinc-400'}">${item.pago ? 'Pago' : 'Pendente'}</p>` : ''}
                            </div>
                        </div>
                    `;
                    importPreviewList.appendChild(row);
                });

                importedGeneralNotes.slice(0, importedRows.length > 0 ? 3 : 6).forEach(note => {
                    const noteCard = document.createElement('div');
                    const notePreview = escapeHtml(note.text.length > 320 ? `${note.text.slice(0, 320)}...` : note.text).replace(/\n/g, '<br>');
                    noteCard.className = 'p-3 rounded-xl bg-blue-50 dark:bg-sky-950/20 border border-blue-200 dark:border-sky-900/60';
                    noteCard.innerHTML = `
                        <p class="text-sm font-semibold text-blue-900 dark:text-sky-100">Anotação geral • ${getMonthLabelFromKey(note.monthKey)}</p>
                        <p class="text-xs text-blue-800 dark:text-sky-200 mt-2 leading-relaxed">${notePreview}</p>
                    `;
                    importPreviewList.appendChild(noteCard);
                });

                if (importedRows.length > 12) {
                    const extra = document.createElement('p');
                    extra.className = 'text-xs text-gray-500 dark:text-zinc-400 text-center pt-1';
                    extra.textContent = `Mostrando 12 de ${importedRows.length} lançamento(s).`;
                    importPreviewList.appendChild(extra);
                }
            }

            function resetImportState() {
                pendingSpreadsheetImport = null;
                importSpreadsheetInput.value = '';
                importFileName.textContent = 'Nenhum arquivo selecionado.';
                renderImportPreview();
            }

            function applySpreadsheetImport() {
                if (!pendingSpreadsheetImport || ((pendingSpreadsheetImport.importedRows?.length || 0) === 0 && (pendingSpreadsheetImport.importedGeneralNotes?.length || 0) === 0)) {
                    showToast('Nenhum dado válido para importar.');
                    return;
                }
                if (isEditLocked) {
                    showToast('Edição trancada.');
                    return;
                }

                pushUndoSnapshot('importação de planilha Excel');

                pendingSpreadsheetImport.importedRows.forEach(entry => {
                    const monthData = ensureMonthData(entry.monthKey);
                    const importKey = JSON.stringify([entry.sheetName, entry.rowNumber, entry.monthKey, entry.type, entry.nome, entry.valor]);
                    if (monthData[entry.type].some(existing => existing.importKey === importKey || (entry.sourceId && String(existing.id) === entry.sourceId)) || monthData.simulationTemplates.some(existing => existing.importKey === importKey)) return;
                    const item = createStandaloneItem(entry.type, {
                        nome: entry.nome,
                        valor: entry.valor,
                        data: entry.data,
                        foto: null
                    });
                    item.paymentState = entry.paymentState || 'on_hold';
                    if (entry.type === 'despesas') {
                        setExpensePaymentState(item, entry.paymentState || (entry.pago ? 'paid' : 'on_hold'));
                    }
                    if (entry.occurrenceTotal > 1 && entry.occurrenceIndex > 0) {
                        item.occurrenceIndex = entry.occurrenceIndex;
                        item.occurrenceTotal = entry.occurrenceTotal;
                        item.parcelaAtual = entry.occurrenceIndex;
                        item.parcelaTotal = entry.occurrenceTotal;
                    }
                    item.importKey = importKey;
                    if (entry.paymentState === 'simulation' && !simulationState.active) {
                        monthData.simulationTemplates.push({...item, type:entry.type});
                    } else monthData[entry.type].push(item);
                });

                (pendingSpreadsheetImport.importedGeneralNotes || []).forEach(note => {
                    const monthData = ensureMonthData(note.monthKey);
                    const field = ['entradas','despesas'].includes(note.type) ? `${note.type}Anotacao` : 'geralAnotacao';
                    monthData[field] = mergeImportedAnnotationText(monthData[field], note.text);
                });

                const importedCount = pendingSpreadsheetImport.importedRows.length;
                const importedNotesCount = (pendingSpreadsheetImport.importedGeneralNotes || []).length;
                closeTopModal();
                updateAllUI();
                showToast(`${importedCount} lançamento(s) e ${importedNotesCount} anotação(ões) gerais importados da planilha.`);
            }

            function populateTrashMonthFilter() {
                const months = [...new Set(trash.map(item => item.originalMonth))];
                trashFilterMonth.innerHTML = '<option value="all">Todos</option>';
                months.sort().forEach(month => {
                    const option = document.createElement('option');
                    option.value = month;
                    option.textContent = month;
                    trashFilterMonth.appendChild(option);
                });
            }

            function renderTrash() {
                populateTrashMonthFilter();
                const container = document.getElementById('trash-list-container');
                container.innerHTML = '';

                const typeFilter = trashFilterType.value;
                const monthFilter = trashFilterMonth.value;
                const filteredTrash = trash.filter(item => {
                    const typeMatch = typeFilter === 'all' || item.type === typeFilter;
                    const monthMatch = monthFilter === 'all' || item.originalMonth === monthFilter;
                    return typeMatch && monthMatch;
                });

                if(filteredTrash.length === 0){
                    container.innerHTML = '<p class="text-center text-gray-500 dark:text-zinc-400 py-10">Nenhum item encontrado com os filtros atuais.</p>';
                    return;
                }
                filteredTrash.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'p-3 bg-white dark:bg-zinc-900 rounded-lg text-sm';
                    div.innerHTML = `
                        <div class="flex justify-between items-center">
                            <div>
                                <span class="font-bold ${item.type === 'entradas' ? 'text-green-500' : 'text-red-500'}">${item.type === 'entradas' ? 'Entrada' : 'Despesa'}</span>
                                <p class="text-gray-800 dark:text-zinc-200">${item.nome} - ${formatCurrency(item.valor)}</p>
                            </div>
                            <div class="text-right text-xs text-gray-500 dark:text-zinc-400">
                                <p>Excluído em: ${new Date(item.deletedAt).toLocaleString('pt-BR')}</p>
                                <p>Mês de Origem: ${item.originalMonth}</p>
                            </div>
                        </div>
                    `;
                    container.appendChild(div);
                });
            }
            trashFilterType.addEventListener('change', renderTrash);
            trashFilterMonth.addEventListener('change', renderTrash);

            function renderShareUsers(filter = '') {
                const container = document.getElementById('share-users-list');
                container.innerHTML = '';
                const filteredUsers = mockUsers.filter(u => u.name.toLowerCase().includes(filter.toLowerCase()));

                function selectUser(e) {
                    const div = e.currentTarget;
                    const userId = parseInt(div.dataset.userId);
                    selectedUserToShare = mockUsers.find(u => u.id === userId);
                    container.querySelectorAll('.bg-emerald-100').forEach(el => el.classList.remove('bg-emerald-100', 'dark:bg-emerald-900'));
                    div.classList.add('bg-emerald-100', 'dark:bg-emerald-900');
                    shareConfirmBtn.disabled = false;
                }

                filteredUsers.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'flex items-center p-2 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-zinc-800';
                    div.dataset.userId = user.id;
                    div.setAttribute('tabindex', '0');
                    div.setAttribute('role', 'button');
                    div.innerHTML = `
                        <img src="${user.avatar}" class="w-10 h-10 rounded-full mr-3">
                        <span class="font-medium text-gray-800 dark:text-zinc-200">${user.name}</span>
                    `;
                    div.addEventListener('click', selectUser);
                    div.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectUser(e);
                        }
                    });
                    container.appendChild(div);
                });
            }

            shareSearchInput.addEventListener('input', (e) => renderShareUsers(e.target.value));
            shareConfirmBtn.addEventListener('click', () => {
                if(selectedUserToShare){
                    showToast(`Planilha compartilhada com ${selectedUserToShare.name}.`);
                    closeTopModal(); // share-modal
                    closeTopModal(); // settings-modal
                    selectedUserToShare = null;
                }
            });

            function getMonthDataSnapshot(key) {
                return normalizeMonthDataEntry(financialData[key]);
            }

            function getMonthMetrics(key) {
                const data = getMonthDataSnapshot(key);
                const entradas = roundToTwo(data.entradas.reduce((acc, item) => acc + item.valor, 0));
                const despesas = roundToTwo(data.despesas.reduce((acc, item) => acc + item.valor, 0));
                const pago = roundToTwo(data.despesas.filter(item => item.pago).reduce((acc, item) => acc + item.valor, 0));
                return {
                    entradas,
                    despesas,
                    pago,
                    pendente: roundToTwo(Math.max(0, despesas - pago)),
                    sobras: roundToTwo(Math.max(0, entradas - despesas)),
                    saldo: roundToTwo(entradas - despesas)
                };
            }

            function populateSearchYearFilterOptions() {
                const previousValue = globalSearchYearFilter.value || 'all';
                const years = getFamilyAndradeExportYears();
                globalSearchYearFilter.innerHTML = '<option value="all">Todos os anos</option>';
                years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = String(year);
                    option.textContent = String(year);
                    globalSearchYearFilter.appendChild(option);
                });
                globalSearchYearFilter.value = years.includes(Number(previousValue)) ? previousValue : 'all';
            }

            function buildSearchResults(query, filter = 'all', yearFilter = 'all') {
                const normalizedQuery = normalizeSearchText(query).trim();
                const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
                if (!tokens.length) return [];

                const results = [];
                const scoreResult = (title, extras = []) => {
                    const normalizedTitle = normalizeSearchText(title);
                    const normalizedExtras = extras.map(extra => normalizeSearchText(extra));
                    if (!tokens.every(token => [normalizedTitle, ...normalizedExtras].some(text => text.includes(token)))) {
                        return null;
                    }
                    let score = 0;
                    if (normalizedTitle.startsWith(normalizedQuery)) score += 5;
                    if (normalizedTitle.includes(normalizedQuery)) score += 3;
                    if (tokens.every(token => normalizedTitle.includes(token))) score += 2;
                    return score;
                };

                Object.keys(financialData).forEach(monthKey => {
                    const monthData = getMonthDataSnapshot(monthKey);
                    const monthLabel = getMonthLabelFromKey(monthKey);
                    const [yearValue, monthValue] = monthKey.split('-').map(Number);
                    if (yearFilter !== 'all' && String(yearValue) !== String(yearFilter)) {
                        return;
                    }

                    ['entradas', 'despesas'].forEach(type => {
                        if (filter !== 'all' && filter !== type) return;
                        monthData[type].forEach(item => {
                            const detail = `${type === 'entradas' ? 'Entrada' : 'Despesa'} • ${monthLabel}${item.data ? ` • ${formatDatePt(item.data)}` : ' • sem data'}`;
                            const score = scoreResult(item.nome, [
                                detail,
                                formatCurrency(item.valor),
                                String(item.valor),
                                item.periodicidade || '',
                                item.pago ? 'pago' : 'pendente'
                            ]);
                            if (score === null) return;
                            results.push({
                                kind: 'transaction',
                                type,
                                id: item.id,
                                monthKey,
                                title: item.nome,
                                subtitle: detail,
                                valueText: formatCurrency(roundToTwo(item.valor)),
                                score,
                                sortRank: (yearValue * 12) + monthValue,
                                tone: type === 'entradas' ? 'emerald' : 'red'
                            });
                        });
                    });
                });

                if (filter === 'all' || filter === 'caixinhas') {
                    caixinhas.forEach(caixinha => {
                        if (yearFilter !== 'all') {
                            const startYear = caixinha.inicio ? parseDateOnly(caixinha.inicio)?.getFullYear() : null;
                            const endYear = caixinha.termino ? parseDateOnly(caixinha.termino)?.getFullYear() : null;
                            const selectedYear = Number(yearFilter);
                            if (startYear !== selectedYear && endYear !== selectedYear) {
                                return;
                            }
                        }
                        const score = scoreResult(caixinha.nome, [
                            'caixinha',
                            formatCurrency(caixinha.valor),
                            caixinha.inicio || '',
                            caixinha.termino || ''
                        ]);
                        if (score === null) return;
                        results.push({
                            kind: 'caixinha',
                            id: caixinha.id,
                            title: caixinha.nome,
                            subtitle: `Caixinha • ${caixinha.inicio ? `Início ${formatDatePt(caixinha.inicio)}` : 'sem data inicial'}${caixinha.termino ? ` • término ${formatDatePt(caixinha.termino)}` : ''}`,
                            valueText: formatCurrency(roundToTwo(caixinha.valor)),
                            score,
                            sortRank: Number(caixinha.id) || 0,
                            tone: 'indigo'
                        });
                    });
                }

                return results
                    .sort((left, right) => (right.score - left.score) || (right.sortRank - left.sortRank) || left.title.localeCompare(right.title))
                    .slice(0, 50);
            }

            function renderSearchResults() {
                populateSearchYearFilterOptions();
                const query = globalSearchInput.value.trim();
                const filter = globalSearchFilter.value;
                const yearFilter = globalSearchYearFilter.value;
                globalSearchResults.innerHTML = '';

                if (!query) {
                    const currentMetrics = getMonthMetrics(getMonthKey(currentDate));
                    const filterScopeText = yearFilter === 'all' ? 'todos os anos' : `ano ${yearFilter}`;
                    globalSearchResults.innerHTML = `
                        <div class="search-result-card rounded-3xl bg-gray-100 dark:bg-zinc-950 dark:border dark:border-zinc-800 p-5">
                            <p class="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">Busca rápida</p>
                            <h3 class="text-xl font-bold text-gray-900 dark:text-zinc-100 mt-2">Comece digitando para buscar</h3>
                            <p class="text-sm text-gray-600 dark:text-zinc-400 mt-2">A busca varre ${filterScopeText} e também as caixinhas cadastradas.</p>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                                <div class="rounded-2xl bg-white dark:bg-zinc-900 p-4">
                                    <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Mês aberto</p>
                                    <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1">${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}</p>
                                </div>
                                <div class="rounded-2xl bg-white dark:bg-zinc-900 p-4">
                                    <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Entradas</p>
                                    <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">${formatCurrency(currentMetrics.entradas)}</p>
                                </div>
                                <div class="rounded-2xl bg-white dark:bg-zinc-900 p-4">
                                    <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Despesas</p>
                                    <p class="text-lg font-bold text-red-600 dark:text-red-400 mt-1">${formatCurrency(currentMetrics.despesas)}</p>
                                </div>
                            </div>
                        </div>
                    `;
                    return;
                }

                const results = buildSearchResults(query, filter, yearFilter);
                if (!results.length) {
                    globalSearchResults.innerHTML = '<div class="rounded-3xl bg-gray-100 dark:bg-zinc-950 dark:border dark:border-zinc-800 p-6 text-center text-gray-600 dark:text-zinc-400">Nenhum resultado encontrado para essa busca.</div>';
                    return;
                }

                const toneClasses = {
                    emerald: 'text-emerald-600 dark:text-emerald-400',
                    red: 'text-red-600 dark:text-red-400',
                    indigo: 'text-indigo-600 dark:text-indigo-400',
                    amber: 'text-amber-600 dark:text-amber-300'
                };

                results.forEach(result => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'search-result-card w-full rounded-3xl bg-gray-100 dark:bg-zinc-950 dark:border dark:border-zinc-800 p-4 text-left';
                    button.innerHTML = `
                        <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0">
                                <p class="text-lg font-semibold text-gray-900 dark:text-zinc-100 truncate">${escapeHtml(result.title)}</p>
                                <p class="text-sm text-gray-600 dark:text-zinc-400 mt-1">${escapeHtml(result.subtitle)}</p>
                            </div>
                            <p class="text-lg font-bold flex-shrink-0 sensitive-data ${toneClasses[result.tone] || 'text-emerald-600 dark:text-emerald-400'}">${result.valueText}</p>
                        </div>
                    `;
                    button.addEventListener('click', () => {
                        if (result.kind === 'transaction') {
                            const [yearValue, monthValue] = result.monthKey.split('-').map(Number);
                            currentDate = new Date(yearValue, monthValue, 1);
                            currentDate.setHours(0, 0, 0, 0);
                            highlightedSearchResult = {
                                monthKey: result.monthKey,
                                type: result.type,
                                id: result.id
                            };
                            closeTopModal();
                            updateAllUI();
                            setTimeout(() => {
                                const card = document.querySelector(`[data-id="${result.id}"][data-type="${result.type}"]`);
                                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 120);
                            if (highlightedSearchTimeout) clearTimeout(highlightedSearchTimeout);
                            highlightedSearchTimeout = setTimeout(() => {
                                highlightedSearchResult = null;
                                updateAllUI();
                            }, 2600);
                        } else if (result.kind === 'caixinha') {
                            closeTopModal();
                            renderCaixinhas();
                            openModal(cofreModal, searchButton);
                        }
                    });
                    globalSearchResults.appendChild(button);
                });
            }

            function buildTimelineEntries() {
                const entries = [];

                Object.keys(financialData).forEach(monthKey => {
                    const [yearValue, monthValue] = monthKey.split('-').map(Number);
                    const monthData = getMonthDataSnapshot(monthKey);
                    ['entradas', 'despesas'].forEach(type => {
                        monthData[type].forEach(item => {
                            const plannedDate = item.data ? parseDateOnly(item.data) : new Date(yearValue, monthValue, 1);
                            const paymentDate = item.paidAt ? new Date(item.paidAt) : null;
                            entries.push({
                                id: item.id,
                                type,
                                monthKey,
                                monthLabel: getMonthLabelFromKey(monthKey),
                                yearValue,
                                monthValue,
                                nome: item.nome,
                                valor: roundToTwo(Number(item.valor) || 0),
                                data: item.data || '',
                                plannedDate,
                                paymentDate,
                                activityDate: paymentDate || plannedDate,
                                pago: type === 'despesas' ? Boolean(item.pago) : false,
                                paymentState: type === 'despesas' ? (item.paymentState || (item.pago ? 'paid' : 'pending')) : 'pending',
                                recurrenceText: item.periodicidade || '',
                                foto: item.foto || ''
                            });
                        });
                    });
                });

                return entries;
            }

            function buildTimelineDataset() {
                const period = timelinePeriodFilter.value;
                const type = timelineTypeFilter.value;
                const mode = timelineModeFilter.value;
                const currentMonthKey = getMonthKey(currentDate);
                const currentYear = currentDate.getFullYear();

                return buildTimelineEntries()
                    .filter(entry => {
                        if (type !== 'all' && entry.type !== type) return false;
                        if (period === 'current-month') return entry.monthKey === currentMonthKey;
                        if (period === 'current-year') return entry.yearValue === currentYear;
                        return true;
                    })
                    .sort((left, right) => {
                        const leftHasDate = Boolean(left.data);
                        const rightHasDate = Boolean(right.data);
                        if (leftHasDate !== rightHasDate) {
                            return leftHasDate ? -1 : 1;
                        }

                        if (mode === 'history') {
                            const leftTime = left.activityDate?.getTime() || 0;
                            const rightTime = right.activityDate?.getTime() || 0;
                            if (leftTime !== rightTime) return rightTime - leftTime;
                            if (left.pago !== right.pago) return left.pago ? -1 : 1;
                        } else {
                            const leftTime = left.plannedDate?.getTime() || 0;
                            const rightTime = right.plannedDate?.getTime() || 0;
                            if (leftTime !== rightTime) return leftTime - rightTime;
                            if (left.type !== right.type) return left.type === 'despesas' ? -1 : 1;
                            if (left.pago !== right.pago) return left.pago ? 1 : -1;
                        }

                        return String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR');
                    });
            }

            function getTimelinePagerKey() {
                return [
                    getMonthKey(currentDate),
                    timelinePeriodFilter.value,
                    timelineTypeFilter.value,
                    timelineModeFilter.value
                ].join('::');
            }

            function getTimelinePagerState() {
                const key = getTimelinePagerKey();
                if (!timelinePagerState[key]) {
                    timelinePagerState[key] = { start: 0, collapsed: true };
                }
                return timelinePagerState[key];
            }

            function getTimelinePageSize() {
                return window.innerWidth < 768 ? 4 : 5;
            }

            function clampTimelinePageStart(start, itemCount) {
                const pageSize = getTimelinePageSize();
                const normalized = Math.floor(Math.max(0, Number(start) || 0) / pageSize) * pageSize;
                if (itemCount <= pageSize) return 0;
                const lastStart = Math.floor((itemCount - 1) / pageSize) * pageSize;
                return Math.min(normalized, lastStart);
            }

            function focusTimelineEntry(entry) {
                const [yearValue, monthValue] = entry.monthKey.split('-').map(Number);
                currentDate = new Date(yearValue, monthValue, 1);
                currentDate.setHours(0, 0, 0, 0);
                highlightedSearchResult = {
                    monthKey: entry.monthKey,
                    type: entry.type,
                    id: entry.id
                };
                closeTopModal();
                updateAllUI();
                setTimeout(() => {
                    const card = document.querySelector(`[data-id="${entry.id}"][data-type="${entry.type}"]`);
                    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 120);
                if (highlightedSearchTimeout) clearTimeout(highlightedSearchTimeout);
                highlightedSearchTimeout = setTimeout(() => {
                    highlightedSearchResult = null;
                    updateAllUI();
                }, 2600);
            }

            function createTimelineEntryButton(entry) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'timeline-card timeline-item w-full p-4 text-left';
                const plannedLabel = entry.data ? formatDatePt(entry.data) : 'Sem data definida';
                const activityLabel = entry.paymentDate ? entry.paymentDate.toLocaleString('pt-BR') : plannedLabel;
                const expenseStatus = entry.type === 'despesas' ? getExpenseStatusPresentation(entry) : null;
                button.innerHTML = `
                    <span class="timeline-item-dot" data-tone="${entry.type}"></span>
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="item-entry-meta-chip">${entry.type === 'entradas' ? 'Entrada' : 'Despesa'}</span>
                                <span class="item-entry-meta-chip">${entry.monthLabel}</span>
                                ${entry.type === 'despesas' ? `<span class="item-entry-meta-chip ${expenseStatus.bg} ${expenseStatus.textColor} border-transparent">${expenseStatus.text}</span>` : ''}
                            </div>
                            <p class="mt-3 text-lg font-bold text-gray-900 dark:text-zinc-100 sensitive-data break-words">${escapeHtml(entry.nome || 'Sem descrição')}</p>
                            <p class="mt-2 text-sm text-gray-600 dark:text-zinc-400">${timelineModeFilter.value === 'history' ? (entry.paymentDate ? `Movimentado em ${activityLabel}` : `Data base ${plannedLabel}`) : `${entry.type === 'entradas' ? 'Recebimento' : 'Vencimento'}: ${plannedLabel}`}</p>
                            ${entry.recurrenceText ? `<p class="mt-1 text-xs text-gray-500 dark:text-zinc-400">Regra: ${escapeHtml(entry.recurrenceText)}</p>` : ''}
                        </div>
                        <div class="text-right flex-shrink-0">
                            <p class="text-lg font-bold sensitive-data ${entry.type === 'entradas' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}">${formatCurrency(entry.valor)}</p>
                            <p class="mt-2 text-xs text-gray-500 dark:text-zinc-400">${entry.paymentDate ? `Pago em ${entry.paymentDate.toLocaleDateString('pt-BR')}` : entry.data ? plannedLabel : 'Sem data'}</p>
                        </div>
                    </div>
                `;
                button.addEventListener('click', () => focusTimelineEntry(entry));
                return button;
            }

            function buildTimelinePageLayer(entries) {
                const layer = document.createElement('div');
                layer.className = 'column-page-layer list-scroll-shell';
                entries.forEach(entry => layer.appendChild(createTimelineEntryButton(entry)));
                return layer;
            }

            function renderTimelinePageLayer(viewport, entries, direction = 0, instant = true) {
                const newLayer = buildTimelinePageLayer(entries);
                const oldLayer = viewport.querySelector('.column-page-layer:not(.removing)');

                if (instant || !oldLayer || !direction) {
                    viewport.innerHTML = '';
                    newLayer.classList.add('state-center');
                    viewport.appendChild(newLayer);
                    return;
                }

                const enterClass = direction === 1 ? 'state-enter-next' : 'state-enter-prev';
                const exitClass = direction === 1 ? 'state-exit-next' : 'state-exit-prev';

                newLayer.classList.add(enterClass);
                viewport.appendChild(newLayer);
                void newLayer.offsetWidth;

                oldLayer.classList.add('removing');
                oldLayer.classList.remove('state-center');
                oldLayer.classList.add(exitClass);
                newLayer.classList.remove(enterClass);
                newLayer.classList.add('state-center');

                setTimeout(() => {
                    if (oldLayer.parentNode === viewport) {
                        viewport.removeChild(oldLayer);
                    }
                }, 500);
            }

            function bindTimelinePagerViewport(viewport) {
                if (viewport.dataset.bound === 'true') return;
                viewport.dataset.bound = 'true';

                let wheelLocked = false;
                let touchStartY = null;

                viewport.addEventListener('wheel', (e) => {
                    const totalItems = Number(viewport.dataset.totalItems || 0);
                    const pageSize = Number(viewport.dataset.pageSize || getTimelinePageSize());
                    const pagerState = getTimelinePagerState();
                    const direction = e.deltaY > 0 ? 1 : -1;
                    const canMove = direction === 1
                        ? pagerState.start + pageSize < totalItems
                        : pagerState.start > 0;
                    if (!canMove) return;

                    e.preventDefault();
                    if (wheelLocked) return;
                    wheelLocked = true;
                    requestTimelinePage(direction);
                    setTimeout(() => {
                        wheelLocked = false;
                    }, 360);
                }, { passive: false });

                viewport.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                        e.preventDefault();
                        requestTimelinePage(1);
                    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                        e.preventDefault();
                        requestTimelinePage(-1);
                    }
                });

                viewport.addEventListener('touchstart', (e) => {
                    touchStartY = e.changedTouches[0]?.screenY ?? null;
                }, { passive: true });

                viewport.addEventListener('touchend', (e) => {
                    if (touchStartY === null) return;
                    const endY = e.changedTouches[0]?.screenY ?? touchStartY;
                    const diff = touchStartY - endY;
                    touchStartY = null;
                    if (Math.abs(diff) < 48) return;
                    requestTimelinePage(diff > 0 ? 1 : -1);
                }, { passive: true });
            }

            function requestTimelinePage(step) {
                const dataset = buildTimelineDataset();
                const pageSize = getTimelinePageSize();
                const pagerState = getTimelinePagerState();
                const nextStart = clampTimelinePageStart(pagerState.start + (pageSize * step), dataset.length);
                if (nextStart === pagerState.start) return false;
                pagerState.start = nextStart;
                renderTimelineModal({ direction: step > 0 ? 1 : -1, instant: false });
                return true;
            }

            function renderTimelineResults(dataset) {
                timelineResults.replaceChildren();
                if (!dataset.length) {
                    timelineResults.innerHTML = '<p class="timeline-empty">Nenhum lançamento encontrado com esses filtros.</p>';
                    return;
                }
                const list = document.createElement('div');
                list.className = 'column-expanded-list';
                dataset.forEach(entry => list.appendChild(createTimelineEntryButton(entry)));
                timelineResults.appendChild(list);
            }

            function renderTimelineModal(options = {}) {
                const dataset = buildTimelineDataset();
                const periodLabelMap = {
                    'current-month': `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`,
                    'current-year': `Ano ${currentDate.getFullYear()}`,
                    'all': 'Todos os meses'
                };
                const totalEntradas = dataset.filter(item => item.type === 'entradas').reduce((sum, item) => sum + item.valor, 0);
                const totalDespesas = dataset.filter(item => item.type === 'despesas').reduce((sum, item) => sum + item.valor, 0);
                const pendingExpenses = dataset.filter(item => item.type === 'despesas' && !item.pago).length;
                const modeLabel = timelineModeFilter.value === 'history' ? 'Histórico recente' : 'Agenda cronológica';

                timelineSummary.innerHTML = `
                    <div class="timeline-card p-4">
                        <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Recorte</p>
                        <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-2">${periodLabelMap[timelinePeriodFilter.value]}</p>
                        <p class="text-sm text-gray-600 dark:text-zinc-400 mt-1">${modeLabel}</p>
                    </div>
                    <div class="timeline-card p-4">
                        <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Entradas e despesas</p>
                        <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-2 sensitive-data">${formatCurrency(totalEntradas)} / ${formatCurrency(totalDespesas)}</p>
                        <p class="text-sm text-gray-600 dark:text-zinc-400 mt-1">${dataset.length} lançamento(s) nesta lista</p>
                    </div>
                    <div class="timeline-card p-4">
                        <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Pendências</p>
                        <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-2">${pendingExpenses}</p>
                        <p class="text-sm text-gray-600 dark:text-zinc-400 mt-1">despesa(s) ainda não marcadas como pagas</p>
                    </div>
                `;

                renderTimelineResults(dataset, options);
            }

            function getAnalyticsThemePalette() {
                return document.documentElement.classList.contains('dark')
                    ? {
                        text: '#e4e4e7',
                        grid: 'rgba(113, 113, 122, 0.24)',
                        emerald: '#34d399',
                        red: '#f87171',
                        blue: '#60a5fa',
                        amber: '#fbbf24',
                        zinc: '#a1a1aa'
                    }
                    : {
                        text: '#1f2937',
                        grid: 'rgba(148, 163, 184, 0.32)',
                        emerald: '#10b981',
                        red: '#ef4444',
                        blue: '#3b82f6',
                        amber: '#f59e0b',
                        zinc: '#64748b'
                    };
            }

            function getAnalyticsFocusRow(yearRows) {
                const selectedMonthIndex = analyticsMonthFilter === 'all' ? null : Number(analyticsMonthFilter);
                if (Number.isInteger(selectedMonthIndex)) {
                    return yearRows.find(row => row.monthIndex === selectedMonthIndex) || yearRows[0];
                }

                if (analyticsYear === currentDate.getFullYear()) {
                    return yearRows.find(row => row.monthIndex === currentDate.getMonth()) || yearRows[0];
                }

                return yearRows.find(row => [row.entradas, row.despesas, row.pago, row.sobras].some(value => value > 0)) || yearRows[0];
            }

            function renderAnalyticsCharts(yearRows, focusRow) {
                if (typeof Chart === 'undefined') return;
                const palette = getAnalyticsThemePalette();
                const isSpecificMonth = analyticsMonthFilter !== 'all' && focusRow;

                if (analyticsYearChart) analyticsYearChart.destroy();
                analyticsYearChart = new Chart(analyticsYearChartCanvas, {
                    type: 'bar',
                    data: {
                        labels: isSpecificMonth
                            ? ['Entradas', 'Despesas', 'Pago', 'Pendente', 'Sobras', 'Saldo']
                            : yearRows.map(row => monthNames[row.monthIndex].slice(0, 3)),
                        datasets: isSpecificMonth
                            ? [{
                                label: `${focusRow.monthLabel} ${analyticsYear}`,
                                data: [focusRow.entradas, focusRow.despesas, focusRow.pago, focusRow.pendente, focusRow.sobras, focusRow.saldo],
                                backgroundColor: [palette.emerald, palette.red, palette.amber, '#fb7185', palette.blue, focusRow.saldo >= 0 ? palette.blue : palette.red],
                                borderRadius: 12
                            }]
                            : [
                                {
                                    label: 'Entradas',
                                    data: yearRows.map(row => row.entradas),
                                    backgroundColor: palette.emerald,
                                    borderRadius: 10
                                },
                                {
                                    label: 'Despesas',
                                    data: yearRows.map(row => row.despesas),
                                    backgroundColor: palette.red,
                                    borderRadius: 10
                                },
                                {
                                    label: 'Sobras',
                                    data: yearRows.map(row => row.sobras),
                                    backgroundColor: palette.blue,
                                    borderRadius: 10
                                }
                            ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: isSpecificMonth ? 'y' : 'x',
                        plugins: {
                            legend: {
                                display: !isSpecificMonth,
                                labels: { color: palette.text }
                            }
                        },
                        scales: {
                            x: {
                                ticks: { color: palette.text },
                                grid: { display: !isSpecificMonth, color: palette.grid }
                            },
                            y: {
                                ticks: { color: palette.text },
                                grid: { color: palette.grid }
                            }
                        }
                    }
                });

                const currentMetrics = focusRow || getMonthMetrics(getMonthKey(currentDate));
                const currentDataset = [currentMetrics.pago, currentMetrics.pendente, currentMetrics.sobras];
                const hasCurrentData = currentDataset.some(value => value > 0);

                if (analyticsCurrentChart) analyticsCurrentChart.destroy();
                analyticsCurrentChart = new Chart(analyticsCurrentChartCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: hasCurrentData ? ['Pago', 'Pendente', 'Sobras'] : ['Sem movimentação'],
                        datasets: [{
                            data: hasCurrentData ? currentDataset : [1],
                            backgroundColor: hasCurrentData ? [palette.emerald, palette.red, palette.blue] : [palette.zinc],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '68%',
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: palette.text }
                            }
                        }
                    }
                });
            }

            function getAnalyticsYearRows(year = analyticsYear) {
                return monthNames.map((label, monthIndex) => {
                    const monthKey = `${year}-${monthIndex}`;
                    return {
                        monthIndex,
                        monthKey,
                        monthLabel: label,
                        ...getMonthMetrics(monthKey)
                    };
                });
            }

            function updateAnalyticsModal() {
                analyticsYearLabel.textContent = analyticsYear;
                analyticsPeriodFilter.value = analyticsMonthFilter;
                const yearRows = getAnalyticsYearRows(analyticsYear);

                const totals = yearRows.reduce((acc, row) => {
                    acc.entradas += row.entradas;
                    acc.despesas += row.despesas;
                    acc.saldo += row.saldo;
                    return acc;
                }, { entradas: 0, despesas: 0, saldo: 0 });
                const focusRow = getAnalyticsFocusRow(yearRows);
                const isSpecificMonth = analyticsMonthFilter !== 'all' && focusRow;
                const summaryMetrics = isSpecificMonth ? focusRow : totals;
                const summaryScope = isSpecificMonth ? `${focusRow.monthLabel} ${analyticsYear}` : `Ano ${analyticsYear}`;

                analyticsPrimaryKicker.textContent = isSpecificMonth ? 'Grafico mensal' : 'Grafico anual';
                analyticsPrimaryTitle.textContent = isSpecificMonth ? `Distribuicao detalhada de ${focusRow.monthLabel}` : 'Entradas, despesas e sobras';
                analyticsSecondaryKicker.textContent = isSpecificMonth ? `${focusRow.monthLabel} ${analyticsYear}` : 'Mes em foco';
                analyticsSecondaryTitle.textContent = isSpecificMonth ? 'Pago, pendente e sobras do mês' : `Pago, pendente e sobras de ${focusRow.monthLabel}`;
                analyticsGridKicker.textContent = isSpecificMonth ? 'Todos os meses do ano' : 'Todos os meses';
                analyticsGridTitle.textContent = isSpecificMonth ? `Comparativo do ano com destaque em ${focusRow.monthLabel}` : 'Panorama completo do ano';

                analyticsSummaryGrid.innerHTML = `
                    <div class="analytics-card p-5">
                        <p class="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">Entradas em ${summaryScope}</p>
                        <p class="analytics-summary-value text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 sensitive-data">${formatCurrency(roundToTwo(summaryMetrics.entradas))}</p>
                    </div>
                    <div class="analytics-card p-5">
                        <p class="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">Despesas em ${summaryScope}</p>
                        <p class="analytics-summary-value text-3xl font-bold text-red-600 dark:text-red-400 mt-2 sensitive-data">${formatCurrency(roundToTwo(summaryMetrics.despesas))}</p>
                    </div>
                    <div class="analytics-card p-5">
                        <p class="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">${isSpecificMonth ? 'Saldo do mês' : 'Saldo acumulado'}</p>
                        <p class="analytics-summary-value text-3xl font-bold ${summaryMetrics.saldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'} mt-2 sensitive-data">${formatCurrency(roundToTwo(summaryMetrics.saldo))}</p>
                    </div>
                `;

                analyticsYearGrid.innerHTML = '';
                yearRows.forEach(row => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    const isFocusMonth = focusRow && row.monthIndex === focusRow.monthIndex;
                    button.className = `year-overview-card text-left rounded-3xl bg-gray-100 dark:bg-zinc-950 dark:border dark:border-zinc-800 p-5 ${isFocusMonth ? 'is-focus' : ''} ${isSpecificMonth && !isFocusMonth ? 'is-muted' : ''}`;
                    button.innerHTML = `
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">${analyticsYear}</p>
                                <h4 class="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">${row.monthLabel}</h4>
                            </div>
                            <span class="px-3 py-1 rounded-full text-xs font-semibold ${row.saldo >= 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'}">${row.saldo >= 0 ? 'Saldo positivo' : 'Saldo negativo'}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-3 mt-5">
                            <div class="rounded-2xl bg-white dark:bg-zinc-900 p-3">
                                <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Entradas</p>
                                <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 sensitive-data">${formatCurrency(row.entradas)}</p>
                            </div>
                            <div class="rounded-2xl bg-white dark:bg-zinc-900 p-3">
                                <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Despesas</p>
                                <p class="text-lg font-bold text-red-600 dark:text-red-400 mt-1 sensitive-data">${formatCurrency(row.despesas)}</p>
                            </div>
                            <div class="rounded-2xl bg-white dark:bg-zinc-900 p-3">
                                <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Pago</p>
                                <p class="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1 sensitive-data">${formatCurrency(row.pago)}</p>
                            </div>
                            <div class="rounded-2xl bg-white dark:bg-zinc-900 p-3">
                                <p class="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-400">Sobras</p>
                                <p class="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1 sensitive-data">${formatCurrency(row.sobras)}</p>
                            </div>
                        </div>
                    `;
                    button.addEventListener('click', () => {
                        currentDate = new Date(analyticsYear, row.monthIndex, 1);
                        currentDate.setHours(0, 0, 0, 0);
                        closeTopModal();
                        updateAllUI();
                    });
                    analyticsYearGrid.appendChild(button);
                });

                renderAnalyticsCharts(yearRows, focusRow);
            }

            function requestDataUnlockAndRun(opener, title, action) {
                pinModalPurpose = 'unlockAndAct';
                actionAfterPin = action;
                openModal(secondaryPinWrapper, opener);
                secondaryPinTitle.textContent = title;
            }

            function openSearchPanel(opener) {
                renderSearchResults();
                openModal(searchModal, opener);
                setTimeout(() => globalSearchInput.focus(), 20);
            }

            function openTimelinePanel(opener) {
                renderTimelineModal();
                openModal(timelineModal, opener);
            }

            function openAnalyticsPanel(opener) {
                analyticsYear = currentDate.getFullYear();
                analyticsMonthFilter = 'all';
                openModal(analyticsModal, opener);
                setTimeout(updateAnalyticsModal, 20);
            }

            function syncVisibleAnnotationsToState() {
                const monthData = ensureMonthData(getMonthKey(currentDate));
                monthData.entradasAnotacao = entradasAnotacao.value || '';
                monthData.despesasAnotacao = despesasAnotacao.value || '';
                monthData.geralAnotacao = geralAnotacao.value || '';
            }

            function formatExportDate(value) {
                return value ? formatDatePt(value) : '';
            }

            function sortItemsForExport(type, items = []) {
                const withDate = items.filter(item => item.data);
                const withoutDate = items.filter(item => !item.data);
                const sorter = (left, right) => {
                    const leftDate = parseDateOnly(left.data);
                    const rightDate = parseDateOnly(right.data);
                    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
                        return leftDate - rightDate;
                    }
                    return String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR');
                };

                withDate.sort(sorter);
                withoutDate.sort((left, right) => String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR'));

                if (type === 'despesas') {
                    return [
                        ...withDate.filter(item => !item.pago),
                        ...withoutDate.filter(item => !item.pago),
                        ...withDate.filter(item => item.pago),
                        ...withoutDate.filter(item => item.pago)
                    ];
                }

                return [...withDate, ...withoutDate];
            }

            function buildFamilyAndradeSummaryText(monthData) {
                const sections = [
                    { title: 'GERAL', text: cleanImportedMultilineText(monthData.geralAnotacao) },
                    { title: 'ENTRADAS', text: cleanImportedMultilineText(monthData.entradasAnotacao) },
                    { title: 'DESPESAS', text: cleanImportedMultilineText(monthData.despesasAnotacao) }
                ].filter(section => section.text);

                return sections.map(section => `${section.title}:\n${section.text}`).join('\n\n');
            }

            function createSheetGrid(rowCount, colCount) {
                return Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ''));
            }

            function setSheetCell(grid, row, col, value) {
                if (!grid[row - 1]) return;
                grid[row - 1][col - 1] = value;
            }

            function getFamilyAndradeExportYears() {
                const years = new Set([currentDate.getFullYear()]);

                Object.keys(financialData).forEach(monthKey => {
                    const [yearValue, monthValue] = String(monthKey).split('-').map(Number);
                    if (!Number.isFinite(yearValue) || !Number.isFinite(monthValue) || monthValue < 0 || monthValue > 11) {
                        return;
                    }

                    const monthData = getMonthDataSnapshot(monthKey);
                    const hasContent = monthData.entradas.length > 0 ||
                        monthData.despesas.length > 0 ||
                        Boolean(cleanImportedMultilineText(monthData.entradasAnotacao)) ||
                        Boolean(cleanImportedMultilineText(monthData.despesasAnotacao)) ||
                        Boolean(cleanImportedMultilineText(monthData.geralAnotacao));

                    if (hasContent) {
                        years.add(yearValue);
                    }
                });

                const orderedYears = [...years].sort((left, right) => left - right);
                if (orderedYears.length === 0) {
                    return [currentDate.getFullYear()];
                }

                const firstYear = orderedYears[0];
                const lastYear = orderedYears[orderedYears.length - 1];
                const exportYears = [];
                for (let year = firstYear; year <= lastYear; year++) {
                    exportYears.push(year);
                }
                return exportYears;
            }

            function getFamilyAndradeStandardLayoutConfig(years = getFamilyAndradeExportYears()) {
                const monthIndexes = Array.from({ length: 12 }, (_, index) => index);
                const entryRows = years.reduce((maxRows, year) => {
                    return monthIndexes.reduce((monthMax, monthIndex) => {
                        const monthData = getMonthDataSnapshot(`${year}-${monthIndex}`);
                        return Math.max(monthMax, sortItemsForExport('entradas', monthData.entradas).length);
                    }, maxRows);
                }, 8);
                const expenseRows = years.reduce((maxRows, year) => {
                    return monthIndexes.reduce((monthMax, monthIndex) => {
                        const monthData = getMonthDataSnapshot(`${year}-${monthIndex}`);
                        return Math.max(monthMax, sortItemsForExport('despesas', monthData.despesas).length);
                    }, maxRows);
                }, 18);

                const firstHalfStartRow = 2;
                const blockHeight = entryRows + expenseRows + 10;
                const secondHalfStartRow = Math.max(44, firstHalfStartRow + blockHeight + 3);
                const totalRowCount = secondHalfStartRow + blockHeight + 2;

                return {
                    entryRows,
                    expenseRows,
                    blockHeight,
                    firstHalfStartRow,
                    secondHalfStartRow,
                    totalRowCount
                };
            }

            function buildFamilyAndradeContaSheet(year) {
                const blockStartColumn = 2;
                const blockWidth = 4;
                const firstHalfMonths = [0, 1, 2, 3, 4, 5];
                const secondHalfMonths = [6, 7, 8, 9, 10, 11];
                const layout = getFamilyAndradeStandardLayoutConfig();
                const grid = createSheetGrid(layout.totalRowCount, 25);
                const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 24 } }];

                setSheetCell(grid, 1, 1, `CONTAS ANO ${year}`);

                [[firstHalfMonths, layout.firstHalfStartRow], [secondHalfMonths, layout.secondHalfStartRow]].forEach(([months, startRow]) => {
                    months.forEach((monthIndex, slotIndex) => {
                        const startCol = blockStartColumn + (slotIndex * blockWidth);
                        const monthKey = `${year}-${monthIndex}`;
                        const monthData = getMonthDataSnapshot(monthKey);
                        const entries = sortItemsForExport('entradas', monthData.entradas);
                        const expenses = sortItemsForExport('despesas', monthData.despesas);
                        const entriesStartRow = startRow + 2;
                        const entriesEndRow = entriesStartRow + layout.entryRows - 1;
                        const totalEntriesRow = entriesEndRow + 1;
                        const debtTitleRow = totalEntriesRow + 1;
                        const expensesHeaderRow = debtTitleRow + 1;
                        const expensesStartRow = expensesHeaderRow + 1;
                        const expensesEndRow = expensesStartRow + layout.expenseRows - 1;
                        const summaryStartRow = expensesEndRow + 1;
                        const valueColumnLetter = getExcelColumnLetter(startCol + 1);
                        const statusColumnLetter = getExcelColumnLetter(startCol + 2);

                        setSheetCell(grid, startRow, startCol, monthNames[monthIndex].toUpperCase());
                        setSheetCell(grid, startRow + 1, startCol, 'ENTRADAS');
                        setSheetCell(grid, startRow + 1, startCol + 1, 'VALOR');
                        setSheetCell(grid, startRow + 1, startCol + 2, 'DATA');

                        entries.forEach((item, itemIndex) => {
                            const row = entriesStartRow + itemIndex;
                            setSheetCell(grid, row, startCol, item.nome || '');
                            setSheetCell(grid, row, startCol + 1, roundToTwo(Number(item.valor) || 0));
                            setSheetCell(grid, row, startCol + 2, formatExportDate(item.data));
                        });

                        setSheetCell(grid, totalEntriesRow, startCol, 'TOTAL DE ENTRADAS');
                        setSheetCell(grid, totalEntriesRow, startCol + 1, { f: `SUM(${valueColumnLetter}${entriesStartRow}:${valueColumnLetter}${entriesEndRow})` });
                        setSheetCell(grid, debtTitleRow, startCol, 'DÍVIDAS');
                        setSheetCell(grid, expensesHeaderRow, startCol, 'DESCRIÇÃO');
                        setSheetCell(grid, expensesHeaderRow, startCol + 1, 'VALOR');
                        setSheetCell(grid, expensesHeaderRow, startCol + 2, 'STATUS');
                        setSheetCell(grid, expensesHeaderRow, startCol + 3, 'DATA');

                        expenses.forEach((item, itemIndex) => {
                            const row = expensesStartRow + itemIndex;
                            setSheetCell(grid, row, startCol, item.nome || '');
                            setSheetCell(grid, row, startCol + 1, roundToTwo(Number(item.valor) || 0));
                            setSheetCell(grid, row, startCol + 2, getExpenseStatusText(item, 'upper'));
                            setSheetCell(grid, row, startCol + 3, formatExportDate(item.data));
                        });

                        setSheetCell(grid, summaryStartRow, startCol, 'TOTAL DE DÍVIDAS');
                        setSheetCell(grid, summaryStartRow, startCol + 1, { f: `SUM(${valueColumnLetter}${expensesStartRow}:${valueColumnLetter}${expensesEndRow})` });
                        setSheetCell(grid, summaryStartRow + 1, startCol, 'QUANTO JÁ FOI PAGO NESSE MÊS');
                        setSheetCell(grid, summaryStartRow + 1, startCol + 1, { f: `SUMIF(${statusColumnLetter}${expensesStartRow}:${statusColumnLetter}${expensesEndRow},"PAGO",${valueColumnLetter}${expensesStartRow}:${valueColumnLetter}${expensesEndRow})` });
                        setSheetCell(grid, summaryStartRow + 2, startCol, 'QUANTO FALTA PAGAR NESSE MÊS');
                        setSheetCell(grid, summaryStartRow + 2, startCol + 1, { f: `MAX(${valueColumnLetter}${summaryStartRow}-${valueColumnLetter}${summaryStartRow + 1},0)` });
                        setSheetCell(grid, summaryStartRow + 3, startCol, 'QUANTO SOBRA NESSE MÊS');
                        setSheetCell(grid, summaryStartRow + 3, startCol + 1, { f: `MAX(${valueColumnLetter}${totalEntriesRow}-${valueColumnLetter}${summaryStartRow},0)` });

                        merges.push({ s: { r: startRow - 1, c: startCol - 1 }, e: { r: startRow - 1, c: startCol + 2 } });
                    });
                });

                const worksheet = XLSX.utils.aoa_to_sheet(grid);
                worksheet['!merges'] = merges;
                worksheet['!cols'] = Array.from({ length: 6 }).flatMap(() => ([
                    { wch: 24 },
                    { wch: 13 },
                    { wch: 12 },
                    { wch: 12 }
                ])).concat([{ wch: 12 }]);
                return worksheet;
            }

            function buildFamilyAndradeResumoSheet(year) {
                const blockStartColumn = 2;
                const blockWidth = 3;
                const firstHalfStartRow = 2;
                const secondHalfStartRow = 31;
                const grid = createSheetGrid(36, 18);
                const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 17 } }];

                setSheetCell(grid, 1, 1, `O QUE FAZER? CONTAS ANO ${year}`);

                [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]].forEach((months, halfIndex) => {
                    const startRow = halfIndex === 0 ? firstHalfStartRow : secondHalfStartRow;
                    months.forEach((monthIndex, slotIndex) => {
                        const startCol = blockStartColumn + (slotIndex * blockWidth);
                        const summaryText = buildFamilyAndradeSummaryText(getMonthDataSnapshot(`${year}-${monthIndex}`));

                        setSheetCell(grid, startRow, startCol, monthNames[monthIndex].toUpperCase());
                        setSheetCell(grid, startRow + 1, startCol, 'RESUMO');
                        setSheetCell(grid, startRow + 2, startCol, summaryText);

                        merges.push({ s: { r: startRow - 1, c: startCol - 1 }, e: { r: startRow - 1, c: startCol + 1 } });
                        merges.push({ s: { r: startRow + 1, c: startCol - 1 }, e: { r: startRow + 1, c: startCol + 1 } });
                    });
                });

                const worksheet = XLSX.utils.aoa_to_sheet(grid);
                worksheet['!merges'] = merges;
                worksheet['!cols'] = Array.from({ length: 6 }).flatMap(() => ([
                    { wch: 20 },
                    { wch: 20 },
                    { wch: 20 }
                ]));
                return worksheet;
            }

            function buildFamilyAndradeCategoryNotesSheet(year, type) {
                const blockStartColumn = 2;
                const blockWidth = 3;
                const firstHalfStartRow = 2;
                const secondHalfStartRow = 31;
                const titleText = type === 'entradas' ? `ANOTAÇÕES DE ENTRADAS ${year}` : `ANOTAÇÕES DE DESPESAS ${year}`;
                const labelText = type === 'entradas' ? 'ENTRADAS' : 'DESPESAS';
                const grid = createSheetGrid(36, 18);
                const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 17 } }];

                setSheetCell(grid, 1, 1, titleText);

                [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]].forEach((months, halfIndex) => {
                    const startRow = halfIndex === 0 ? firstHalfStartRow : secondHalfStartRow;
                    months.forEach((monthIndex, slotIndex) => {
                        const startCol = blockStartColumn + (slotIndex * blockWidth);
                        const monthData = getMonthDataSnapshot(`${year}-${monthIndex}`);
                        const annotationText = cleanImportedMultilineText(type === 'entradas' ? monthData.entradasAnotacao : monthData.despesasAnotacao);

                        setSheetCell(grid, startRow, startCol, monthNames[monthIndex].toUpperCase());
                        setSheetCell(grid, startRow + 1, startCol, labelText);
                        setSheetCell(grid, startRow + 2, startCol, annotationText);

                        merges.push({ s: { r: startRow - 1, c: startCol - 1 }, e: { r: startRow - 1, c: startCol + 1 } });
                        merges.push({ s: { r: startRow + 1, c: startCol - 1 }, e: { r: startRow + 1, c: startCol + 1 } });
                    });
                });

                const worksheet = XLSX.utils.aoa_to_sheet(grid);
                worksheet['!merges'] = merges;
                worksheet['!cols'] = Array.from({ length: 6 }).flatMap(() => ([
                    { wch: 20 },
                    { wch: 20 },
                    { wch: 20 }
                ]));
                return worksheet;
            }

            const ANDRADE_EXCEL_THEME = Object.freeze({
                border: 'FFB8C7AF',
                borderStrong: 'FF6E7F5A',
                titleFill: 'FF385724',
                monthFill: 'FF548235',
                entriesHeaderFill: 'FFA9D18E',
                entriesFill: 'FFF4F8EE',
                entriesTotalFill: 'FFC5E0B4',
                debtTitleFill: 'FF806000',
                debtHeaderFill: 'FFFFD966',
                debtFill: 'FFFFF2CC',
                summaryFill: 'FFBDD7EE',
                summaryAccentFill: 'FF9DC3E6',
                text: 'FF1F2937',
                white: 'FFFFFFFF',
                paid: 'FF00B050',
                unpaid: 'FFC00000',
                muted: 'FF64748B',
                currencyFormat: '"R$" #,##0.00'
            });

            function getExcelColumnLetter(columnNumber) {
                let dividend = columnNumber;
                let columnName = '';
                while (dividend > 0) {
                    const modulo = (dividend - 1) % 26;
                    columnName = String.fromCharCode(65 + modulo) + columnName;
                    dividend = Math.floor((dividend - modulo) / 26);
                }
                return columnName;
            }

            function estimateExcelRowHeight(value, charsPerLine = 26, minHeight = 20) {
                const text = String(value || '').trim();
                if (!text) return minHeight;
                const lineCount = text.split('\n').reduce((count, line) => {
                    return count + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine));
                }, 0);
                return Math.min(118, Math.max(minHeight, lineCount * 14));
            }

            function applyAndradeCellStyle(cell, {
                fill,
                fontColor = ANDRADE_EXCEL_THEME.text,
                bold = false,
                italic = false,
                size = 11,
                horizontal = 'left',
                vertical = 'middle',
                wrapText = true,
                numFmt,
                borderColor = ANDRADE_EXCEL_THEME.border,
                borderStyle = 'thin'
            } = {}) {
                cell.font = {
                    name: 'Calibri',
                    size,
                    bold,
                    italic,
                    color: { argb: fontColor }
                };
                cell.alignment = {
                    horizontal,
                    vertical,
                    wrapText
                };
                cell.border = {
                    top: { style: borderStyle, color: { argb: borderColor } },
                    left: { style: borderStyle, color: { argb: borderColor } },
                    bottom: { style: borderStyle, color: { argb: borderColor } },
                    right: { style: borderStyle, color: { argb: borderColor } }
                };
                if (fill) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: fill }
                    };
                }
                if (numFmt) {
                    cell.numFmt = numFmt;
                }
            }

            function styleAndradeRange(worksheet, startRow, startCol, endRow, endCol, style = {}) {
                for (let row = startRow; row <= endRow; row++) {
                    for (let col = startCol; col <= endCol; col++) {
                        applyAndradeCellStyle(worksheet.getCell(row, col), style);
                    }
                }
            }

            function setAndradeCell(worksheet, row, col, value, style = {}) {
                const cell = worksheet.getCell(row, col);
                cell.value = value;
                applyAndradeCellStyle(cell, style);
                return cell;
            }

            function setAndradeMergedCell(worksheet, startRow, startCol, endRow, endCol, value, style = {}) {
                styleAndradeRange(worksheet, startRow, startCol, endRow, endCol, style);
                if (endRow > startRow || endCol > startCol) {
                    worksheet.mergeCells(startRow, startCol, endRow, endCol);
                }
                return setAndradeCell(worksheet, startRow, startCol, value, style);
            }

            async function downloadExcelJsWorkbook(workbook, filename) {
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([
                    buffer
                ], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 1500);
            }

            function buildFamilyAndradeContaSheetExcel(workbook, year) {
                const blockStartColumn = 2;
                const blockWidth = 4;
                const firstHalfMonths = [0, 1, 2, 3, 4, 5];
                const secondHalfMonths = [6, 7, 8, 9, 10, 11];
                const layout = getFamilyAndradeStandardLayoutConfig();

                const worksheet = workbook.addWorksheet(`PLANILHA DE CONTAS ${year}`, {
                    properties: { defaultRowHeight: 20 },
                    views: [{ showGridLines: false }]
                });
                worksheet.pageSetup = {
                    orientation: 'landscape',
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 0
                };
                [4].concat(Array.from({ length: 6 }).flatMap(() => ([26, 14, 14, 14]))).forEach((width, index) => {
                    worksheet.getColumn(index + 1).width = width;
                });

                setAndradeMergedCell(worksheet, 1, 1, 1, 25, `CONTAS ANO ${year}`, {
                    fill: ANDRADE_EXCEL_THEME.titleFill,
                    fontColor: ANDRADE_EXCEL_THEME.white,
                    bold: true,
                    size: 18,
                    horizontal: 'center',
                    borderColor: ANDRADE_EXCEL_THEME.borderStrong
                });
                worksheet.getRow(1).height = 28;

                [[firstHalfMonths, layout.firstHalfStartRow], [secondHalfMonths, layout.secondHalfStartRow]].forEach(([months, startRow]) => {
                    months.forEach((monthIndex, slotIndex) => {
                        const startCol = blockStartColumn + (slotIndex * blockWidth);
                        const monthKey = `${year}-${monthIndex}`;
                        const monthData = getMonthDataSnapshot(monthKey);
                        const entries = sortItemsForExport('entradas', monthData.entradas);
                        const expenses = sortItemsForExport('despesas', monthData.despesas);
                        const entriesStartRow = startRow + 2;
                        const entriesEndRow = entriesStartRow + layout.entryRows - 1;
                        const totalEntriesRow = entriesEndRow + 1;
                        const debtTitleRow = totalEntriesRow + 1;
                        const expensesHeaderRow = debtTitleRow + 1;
                        const expensesStartRow = expensesHeaderRow + 1;
                        const expensesEndRow = expensesStartRow + layout.expenseRows - 1;
                        const summaryStartRow = expensesEndRow + 1;
                        const entriesValueColumn = getExcelColumnLetter(startCol + 1);
                        const expensesValueColumn = getExcelColumnLetter(startCol + 1);
                        const expensesStatusColumn = getExcelColumnLetter(startCol + 2);
                        const totalExpensesCellAddress = `${entriesValueColumn}${summaryStartRow}`;
                        const paidExpensesCellAddress = `${entriesValueColumn}${summaryStartRow + 1}`;

                        styleAndradeRange(worksheet, startRow, startCol, startRow, startCol + 3, {
                            fill: ANDRADE_EXCEL_THEME.monthFill,
                            fontColor: ANDRADE_EXCEL_THEME.white,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeMergedCell(worksheet, startRow, startCol, startRow, startCol + 2, monthNames[monthIndex].toUpperCase(), {
                            fill: ANDRADE_EXCEL_THEME.monthFill,
                            fontColor: ANDRADE_EXCEL_THEME.white,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });

                        ['ENTRADAS', 'VALOR', 'DATA'].forEach((label, offset) => {
                            setAndradeCell(worksheet, startRow + 1, startCol + offset, label, {
                                fill: ANDRADE_EXCEL_THEME.entriesHeaderFill,
                                bold: true,
                                horizontal: 'center',
                                borderColor: ANDRADE_EXCEL_THEME.borderStrong
                            });
                        });
                        setAndradeCell(worksheet, startRow + 1, startCol + 3, '', {
                            fill: ANDRADE_EXCEL_THEME.entriesHeaderFill,
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });

                        const writeEntryRow = (rowNumber, item) => {
                            setAndradeCell(worksheet, rowNumber, startCol, item?.nome || '', {
                                fill: ANDRADE_EXCEL_THEME.entriesFill,
                                horizontal: 'left'
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 1, roundToTwo(Number(item?.valor) || 0), {
                                fill: ANDRADE_EXCEL_THEME.entriesFill,
                                horizontal: 'right',
                                numFmt: ANDRADE_EXCEL_THEME.currencyFormat
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 2, formatExportDate(item?.data), {
                                fill: ANDRADE_EXCEL_THEME.entriesFill,
                                horizontal: 'center'
                            });
                            worksheet.getRow(rowNumber).height = estimateExcelRowHeight(item?.nome || '', 26, 22);
                        };
                        entries.forEach((item, index) => writeEntryRow(entriesStartRow + index, item));
                        for (let index = entries.length; index < layout.entryRows; index++) {
                            writeEntryRow(entriesStartRow + index, null);
                        }

                        setAndradeCell(worksheet, totalEntriesRow, startCol, 'TOTAL DE ENTRADAS', {
                            fill: ANDRADE_EXCEL_THEME.entriesTotalFill,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeCell(worksheet, totalEntriesRow, startCol + 1, {
                            formula: `SUM(${entriesValueColumn}${entriesStartRow}:${entriesValueColumn}${entriesEndRow})`
                        }, {
                            fill: ANDRADE_EXCEL_THEME.entriesTotalFill,
                            bold: true,
                            horizontal: 'right',
                            numFmt: ANDRADE_EXCEL_THEME.currencyFormat,
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeCell(worksheet, totalEntriesRow, startCol + 2, '', {
                            fill: ANDRADE_EXCEL_THEME.entriesTotalFill,
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeCell(worksheet, totalEntriesRow, startCol + 3, '', {
                            fill: ANDRADE_EXCEL_THEME.entriesTotalFill,
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });

                        styleAndradeRange(worksheet, debtTitleRow, startCol, debtTitleRow, startCol + 3, {
                            fill: ANDRADE_EXCEL_THEME.debtTitleFill,
                            fontColor: ANDRADE_EXCEL_THEME.white,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeCell(worksheet, debtTitleRow, startCol, 'DÍVIDAS', {
                            fill: ANDRADE_EXCEL_THEME.debtTitleFill,
                            fontColor: ANDRADE_EXCEL_THEME.white,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });

                        ['DESCRIÇÃO', 'VALOR', 'STATUS', 'DATA'].forEach((label, offset) => {
                            setAndradeCell(worksheet, expensesHeaderRow, startCol + offset, label, {
                                fill: ANDRADE_EXCEL_THEME.debtHeaderFill,
                                bold: true,
                                horizontal: 'center',
                                borderColor: ANDRADE_EXCEL_THEME.borderStrong
                            });
                        });

                        const writeExpenseRow = (rowNumber, item) => {
                            setAndradeCell(worksheet, rowNumber, startCol, item?.nome || '', {
                                fill: ANDRADE_EXCEL_THEME.debtFill,
                                horizontal: 'left'
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 1, roundToTwo(Number(item?.valor) || 0), {
                                fill: ANDRADE_EXCEL_THEME.debtFill,
                                horizontal: 'right',
                                numFmt: ANDRADE_EXCEL_THEME.currencyFormat
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 2, item ? getExpenseStatusText(item, 'upper') : '', {
                                fill: item ? (item.pago ? 'FFC5E0B4' : 'FFFDE68A') : ANDRADE_EXCEL_THEME.debtFill,
                                horizontal: 'center',
                                bold: Boolean(item)
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 3, formatExportDate(item?.data), {
                                fill: ANDRADE_EXCEL_THEME.debtFill,
                                horizontal: 'center'
                            });
                            worksheet.getRow(rowNumber).height = estimateExcelRowHeight(item?.nome || '', 24, 22);
                        };
                        expenses.forEach((item, index) => writeExpenseRow(expensesStartRow + index, item));
                        for (let index = expenses.length; index < layout.expenseRows; index++) {
                            writeExpenseRow(expensesStartRow + index, null);
                        }

                        const summaryRows = [
                            {
                                label: 'TOTAL DE DÍVIDAS',
                                value: { formula: `SUM(${expensesValueColumn}${expensesStartRow}:${expensesValueColumn}${expensesEndRow})` }
                            },
                            {
                                label: 'QUANTO JÁ FOI PAGO NESSE MÊS',
                                value: { formula: `SUMIF(${expensesStatusColumn}${expensesStartRow}:${expensesStatusColumn}${expensesEndRow},"PAGO",${expensesValueColumn}${expensesStartRow}:${expensesValueColumn}${expensesEndRow})` }
                            },
                            {
                                label: 'QUANTO FALTA PAGAR NESSE MÊS',
                                value: { formula: `MAX(${totalExpensesCellAddress}-${paidExpensesCellAddress},0)` }
                            },
                            {
                                label: 'QUANTO SOBRA NESSE MÊS',
                                value: { formula: `MAX(${entriesValueColumn}${totalEntriesRow}-${totalExpensesCellAddress},0)` }
                            }
                        ];

                        summaryRows.forEach((summary, index) => {
                            const rowNumber = summaryStartRow + index;
                            setAndradeCell(worksheet, rowNumber, startCol, summary.label, {
                                fill: ANDRADE_EXCEL_THEME.summaryFill,
                                bold: true,
                                horizontal: 'left',
                                borderColor: ANDRADE_EXCEL_THEME.borderStrong
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 1, summary.value, {
                                fill: ANDRADE_EXCEL_THEME.summaryAccentFill,
                                bold: true,
                                horizontal: 'right',
                                numFmt: ANDRADE_EXCEL_THEME.currencyFormat,
                                borderColor: ANDRADE_EXCEL_THEME.borderStrong
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 2, '', {
                                fill: ANDRADE_EXCEL_THEME.summaryFill,
                                borderColor: ANDRADE_EXCEL_THEME.borderStrong
                            });
                            setAndradeCell(worksheet, rowNumber, startCol + 3, '', {
                                fill: ANDRADE_EXCEL_THEME.summaryFill,
                                borderColor: ANDRADE_EXCEL_THEME.borderStrong
                            });
                            worksheet.getRow(rowNumber).height = estimateExcelRowHeight(summary.label, 26, 22);
                        });
                    });
                });

                return worksheet;
            }

            function buildFamilyAndradeResumoSheetExcel(workbook, year) {
                const blockStartColumn = 2;
                const blockWidth = 3;
                const firstHalfStartRow = 2;
                const secondHalfStartRow = 31;
                const worksheet = workbook.addWorksheet(`PLANILHA DE RESUMOS ${year}`, {
                    properties: { defaultRowHeight: 20 },
                    views: [{ showGridLines: false }]
                });
                worksheet.pageSetup = {
                    orientation: 'landscape',
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 0
                };
                [4].concat(Array.from({ length: 6 }).flatMap(() => ([22, 22, 22]))).forEach((width, index) => {
                    worksheet.getColumn(index + 1).width = width;
                });

                setAndradeMergedCell(worksheet, 1, 1, 1, 19, `O QUE FAZER? CONTAS ANO ${year}`, {
                    fill: ANDRADE_EXCEL_THEME.titleFill,
                    fontColor: ANDRADE_EXCEL_THEME.white,
                    bold: true,
                    size: 18,
                    horizontal: 'center',
                    borderColor: ANDRADE_EXCEL_THEME.borderStrong
                });
                worksheet.getRow(1).height = 28;

                [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]].forEach((months, halfIndex) => {
                    const startRow = halfIndex === 0 ? firstHalfStartRow : secondHalfStartRow;
                    months.forEach((monthIndex, slotIndex) => {
                        const startCol = blockStartColumn + (slotIndex * blockWidth);
                        const summaryText = buildFamilyAndradeSummaryText(getMonthDataSnapshot(`${year}-${monthIndex}`));
                        const contentText = summaryText || 'Sem observações lançadas para este mês.';

                        setAndradeMergedCell(worksheet, startRow, startCol, startRow, startCol + 2, monthNames[monthIndex].toUpperCase(), {
                            fill: ANDRADE_EXCEL_THEME.monthFill,
                            fontColor: ANDRADE_EXCEL_THEME.white,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeMergedCell(worksheet, startRow + 1, startCol, startRow + 1, startCol + 2, 'RESUMO', {
                            fill: ANDRADE_EXCEL_THEME.summaryAccentFill,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeMergedCell(worksheet, startRow + 2, startCol, startRow + 2, startCol + 2, contentText, {
                            fill: ANDRADE_EXCEL_THEME.entriesFill,
                            horizontal: 'left',
                            vertical: 'top'
                        });
                        worksheet.getRow(startRow + 2).height = estimateExcelRowHeight(contentText, 34, 92);
                    });
                });

                return worksheet;
            }

            function buildFamilyAndradeCategoryNotesSheetExcel(workbook, year, type) {
                const blockStartColumn = 2;
                const blockWidth = 3;
                const firstHalfStartRow = 2;
                const secondHalfStartRow = 31;
                const sheetName = type === 'entradas' ? `ANOTACOES ENTRADAS ${year}` : `ANOTACOES DESPESAS ${year}`;
                const titleText = type === 'entradas' ? `ANOTAÇÕES DE ENTRADAS ${year}` : `ANOTAÇÕES DE DESPESAS ${year}`;
                const labelText = type === 'entradas' ? 'ENTRADAS' : 'DESPESAS';
                const worksheet = workbook.addWorksheet(sheetName, {
                    properties: { defaultRowHeight: 20 },
                    views: [{ showGridLines: false }]
                });
                worksheet.pageSetup = {
                    orientation: 'landscape',
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 0
                };
                [4].concat(Array.from({ length: 6 }).flatMap(() => ([22, 22, 22]))).forEach((width, index) => {
                    worksheet.getColumn(index + 1).width = width;
                });

                setAndradeMergedCell(worksheet, 1, 1, 1, 19, titleText, {
                    fill: ANDRADE_EXCEL_THEME.titleFill,
                    fontColor: ANDRADE_EXCEL_THEME.white,
                    bold: true,
                    size: 18,
                    horizontal: 'center',
                    borderColor: ANDRADE_EXCEL_THEME.borderStrong
                });
                worksheet.getRow(1).height = 28;

                [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]].forEach((months, halfIndex) => {
                    const startRow = halfIndex === 0 ? firstHalfStartRow : secondHalfStartRow;
                    months.forEach((monthIndex, slotIndex) => {
                        const startCol = blockStartColumn + (slotIndex * blockWidth);
                        const monthData = getMonthDataSnapshot(`${year}-${monthIndex}`);
                        const contentText = cleanImportedMultilineText(type === 'entradas' ? monthData.entradasAnotacao : monthData.despesasAnotacao) || 'Sem anotações lançadas para este mês.';

                        setAndradeMergedCell(worksheet, startRow, startCol, startRow, startCol + 2, monthNames[monthIndex].toUpperCase(), {
                            fill: ANDRADE_EXCEL_THEME.monthFill,
                            fontColor: ANDRADE_EXCEL_THEME.white,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeMergedCell(worksheet, startRow + 1, startCol, startRow + 1, startCol + 2, labelText, {
                            fill: ANDRADE_EXCEL_THEME.summaryAccentFill,
                            bold: true,
                            horizontal: 'center',
                            borderColor: ANDRADE_EXCEL_THEME.borderStrong
                        });
                        setAndradeMergedCell(worksheet, startRow + 2, startCol, startRow + 2, startCol + 2, contentText, {
                            fill: ANDRADE_EXCEL_THEME.entriesFill,
                            horizontal: 'left',
                            vertical: 'top'
                        });
                        worksheet.getRow(startRow + 2).height = estimateExcelRowHeight(contentText, 34, 92);
                    });
                });

                return worksheet;
            }

            async function exportFamilyAndradeWorkbook() {
                syncVisibleAnnotationsToState();
                saveState();

                const today = new Date();
                const filename = `PLANILHA_DE_PLANEJAMENTO_FINANCEIRO_FAMILIA_ANDRADE_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}.xlsx`;

                if (window.ExcelJS) {
                    try {
                        const workbook = new ExcelJS.Workbook();
                        workbook.creator = 'Controle Financeiro';
                        workbook.created = new Date();
                        workbook.calcProperties.fullCalcOnLoad = true;
                        getFamilyAndradeExportYears().forEach(year => {
                            buildFamilyAndradeContaSheetExcel(workbook, year);
                            buildFamilyAndradeResumoSheetExcel(workbook, year);
                            buildFamilyAndradeCategoryNotesSheetExcel(workbook, year, 'entradas');
                            buildFamilyAndradeCategoryNotesSheetExcel(workbook, year, 'despesas');
                        });
                        workbook.addWorksheet('MLG Lancamentos').addRows(buildPortableExportRows());
                        workbook.addWorksheet('MLG Anotacoes').addRows(buildPortableNoteRows());
                        await downloadExcelJsWorkbook(workbook, filename);
                        showToast('Planilha Excel exportada com layout Andrade, fórmulas e abas extras de anotações.');
                        return;
                    } catch (error) {
                        console.error('Falha ao exportar com ExcelJS, usando fallback básico.', error);
                    }
                }

                if (!window.XLSX) {
                    showToast('A biblioteca de Excel não está disponível para exportar.');
                    return;
                }

                const workbook = XLSX.utils.book_new();
                getFamilyAndradeExportYears().forEach(year => {
                    XLSX.utils.book_append_sheet(workbook, buildFamilyAndradeContaSheet(year), `PLANILHA DE CONTAS ${year}`);
                    XLSX.utils.book_append_sheet(workbook, buildFamilyAndradeResumoSheet(year), `PLANILHA DE RESUMOS ${year}`);
                    XLSX.utils.book_append_sheet(workbook, buildFamilyAndradeCategoryNotesSheet(year, 'entradas'), `ANOTACOES ENTRADAS ${year}`);
                    XLSX.utils.book_append_sheet(workbook, buildFamilyAndradeCategoryNotesSheet(year, 'despesas'), `ANOTACOES DESPESAS ${year}`);
                });

                XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildPortableExportRows()), 'MLG Lancamentos');
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildPortableNoteRows()), 'MLG Anotacoes');
                XLSX.writeFile(workbook, filename, { compression: true });
                showToast('Planilha Excel exportada em modo compatível, com abas extras de anotações.');
            }

            function closeSettingsModalIfOpen() {
                if (!settingsModal || settingsModal.classList.contains('hidden')) return;
                const maxClosures = modalStack.length + 1;
                for (let attempt = 0; attempt < maxClosures; attempt++) {
                    const topModal = modalStack[modalStack.length - 1];
                    if (!topModal) break;
                    closeTopModal();
                    if (topModal.element === settingsModal) {
                        break;
                    }
                }
            }

            searchButton.addEventListener('click', (event) => {
                if (isDataLocked) {
                    requestDataUnlockAndRun(event.currentTarget, 'Revelar Dados', () => openSearchPanel(event.currentTarget));
                    return;
                }

                openSearchPanel(event.currentTarget);
            });
            timelineButton.addEventListener('click', (event) => {
                if (isDataLocked) {
                    requestDataUnlockAndRun(event.currentTarget, 'Revelar Dados', () => openTimelinePanel(event.currentTarget));
                    return;
                }

                openTimelinePanel(event.currentTarget);
            });
            analyticsButton.addEventListener('click', (event) => {
                if (isDataLocked) {
                    requestDataUnlockAndRun(event.currentTarget, 'Revelar Dados', () => openAnalyticsPanel(event.currentTarget));
                    return;
                }

                openAnalyticsPanel(event.currentTarget);
            });
            document.getElementById('open-search-modal-btn').addEventListener('click', () => {
                closeTopModal();
                const opener = document.getElementById('settings-button');
                if (isDataLocked) {
                    requestDataUnlockAndRun(opener, 'Revelar Dados', () => openSearchPanel(opener));
                    return;
                }
                openSearchPanel(opener);
            });
            document.getElementById('open-timeline-modal-btn').addEventListener('click', () => {
                closeTopModal();
                const opener = document.getElementById('settings-button');
                if (isDataLocked) {
                    requestDataUnlockAndRun(opener, 'Revelar Dados', () => openTimelinePanel(opener));
                    return;
                }
                openTimelinePanel(opener);
            });
            document.getElementById('open-analytics-modal-btn').addEventListener('click', () => {
                closeTopModal();
                const opener = document.getElementById('settings-button');
                if (isDataLocked) {
                    requestDataUnlockAndRun(opener, 'Revelar Dados', () => openAnalyticsPanel(opener));
                    return;
                }
                openAnalyticsPanel(opener);
            });
            document.getElementById('export-family-andrade-btn').addEventListener('click', (event) => {
                const runExport = () => {
                    closeSettingsModalIfOpen();
                    exportFamilyAndradeWorkbook();
                };

                if (isDataLocked) {
                    requestDataUnlockAndRun(event.currentTarget, 'Revelar Dados', () => {
                        setTimeout(runExport, 0);
                    });
                    return;
                }

                runExport();
            });
            globalSearchInput.addEventListener('input', renderSearchResults);
            globalSearchFilter.addEventListener('change', renderSearchResults);
            globalSearchYearFilter.addEventListener('change', renderSearchResults);
            [timelinePeriodFilter, timelineTypeFilter, timelineModeFilter].forEach(control => {
                control.addEventListener('change', renderTimelineModal);
            });
            timelineResults.addEventListener('click', (event) => {
                const button = event.target.closest('button');
                if (!button) return;
                const action = button.dataset.action || '';
                if (action === 'timeline-page-prev') {
                    requestTimelinePage(-1);
                } else if (action === 'timeline-page-next') {
                    requestTimelinePage(1);
                } else if (action === 'toggle-timeline-view') {
                    const pagerState = getTimelinePagerState();
                    pagerState.collapsed = !pagerState.collapsed;
                    if (pagerState.collapsed) {
                        pagerState.start = clampTimelinePageStart(pagerState.start, buildTimelineDataset().length);
                    }
                    renderTimelineModal({ instant: true });
                }
            });
            analyticsPeriodFilter.addEventListener('change', () => {
                analyticsMonthFilter = analyticsPeriodFilter.value;
                updateAnalyticsModal();
            });
            document.getElementById('analytics-prev-year-btn').addEventListener('click', () => {
                analyticsYear -= 1;
                updateAnalyticsModal();
            });
            document.getElementById('analytics-next-year-btn').addEventListener('click', () => {
                analyticsYear += 1;
                updateAnalyticsModal();
            });

             // --- LÓGICA DE DOWNLOADS ---
            function downloadData(format, source) {
                let dataToExport, headers, filename;

                if(source === 'trash') {
                    const typeFilter = trashFilterType.value;
                    const monthFilter = trashFilterMonth.value;
                    const filteredTrash = trash.filter(item => (typeFilter === 'all' || item.type === typeFilter) && (monthFilter === 'all' || item.originalMonth === monthFilter));

                    if (filteredTrash.length === 0) {
                        showToast('Nenhum item para baixar com os filtros atuais.');
                        return;
                    }
                    headers = ["Data da exclusão", "Tipo", "Descrição", "Valor", "Mês de origem"];
                    dataToExport = filteredTrash.map(i => [new Date(i.deletedAt).toLocaleString('pt-BR'), i.type, i.nome, i.valor.toFixed(2), i.originalMonth]);
                    filename = 'lixeira_financeiro';
                }

                if (format === 'csv') {
                    let csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...dataToExport.map(e => e.join(","))].join("\n");
                    const link = document.createElement("a");
                    link.setAttribute("href", encodeURI(csvContent));
                    link.setAttribute("download", `${filename}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } else if (format === 'pdf') {
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF();
                    doc.text(`Relatório da Lixeira`, 14, 15);
                    doc.autoTable({ head: [headers], body: dataToExport, startY: 20 });
                    doc.save(`${filename}.pdf`);
                }
            }

            document.getElementById('download-trash-csv-btn').addEventListener('click', () => downloadData('csv', 'trash'));
            document.getElementById('download-trash-pdf-btn').addEventListener('click', () => downloadData('pdf', 'trash'));
            document.getElementById('download-pdf-btn').addEventListener('click', generateDetailedPDF);
            if (downloadAnalyticsReportBtn) downloadAnalyticsReportBtn.addEventListener('click', generateAnalyticsDetailedReport);
            if (downloadManualPdfBtn) downloadManualPdfBtn.addEventListener('click', generateManualPDF);

            function generateDetailedPDF() {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const key = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                const data = normalizeMonthDataEntry(financialData[key]);

                doc.setFontSize(22); doc.text("Relatório Financeiro", 105, 20, null, null, "center");
                doc.setFontSize(16); doc.text(`${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`, 105, 30, null, null, "center");
                doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 35, null, null, "center");

                doc.setFontSize(14); doc.text("Resumo dos Indicadores", 14, 50);
                doc.setFontSize(10);
                const indicatorsText = `Entradas Previstas: ${formatCurrency(data.entradas.reduce((a,b)=>a+b.valor,0))} (Soma de todas as entradas do mês)\nDespesas Previstas: ${formatCurrency(data.despesas.reduce((a,b)=>a+b.valor,0))} (Soma de todas as despesas)\nPago no Mês: ${formatCurrency(data.despesas.filter(d=>d.pago).reduce((a,b)=>a+b.valor,0))} (Soma das despesas pagas)\nQuanto Falta Pagar: ${formatCurrency(Math.max(0, data.despesas.reduce((a,b)=>a+b.valor,0) - data.despesas.filter(d=>d.pago).reduce((a,b)=>a+b.valor,0)))}\nSobras: ${formatCurrency(Math.max(0, data.entradas.reduce((a,b)=>a+b.valor,0) - data.despesas.reduce((a,b)=>a+b.valor,0)))}\nSaldo no Cofre: ${formatCurrency(getCofreTotal())}\nAlocado p/ Próx. Mês: ${formatCurrency(data.alocadoProximoMes)}`;
                doc.text(indicatorsText, 14, 60);

                const headStyle = { fillColor: [34, 197, 94] };
                doc.autoTable({ head: [['Entradas', 'Valor', 'Data']], body: data.entradas.map(i => [i.nome, formatCurrency(i.valor), i.data ? new Date(i.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A']), startY: 100, headStyles: headStyle });
                doc.autoTable({ head: [['Despesas', 'Valor', 'Data', 'Status']], body: data.despesas.map(i => [i.nome, formatCurrency(i.valor), i.data ? new Date(i.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A', getExpenseStatusText(i)]), startY: doc.autoTable.previous.finalY + 10, headStyles: headStyle });

                doc.addPage();
                doc.setFontSize(14); doc.text("Anotações", 14, 20);
                doc.setFontSize(10);
                let notesY = 30;
                const noteSections = [
                    { title: 'Entradas:', text: data.entradasAnotacao || 'Nenhuma anotação.' },
                    { title: 'Despesas:', text: data.despesasAnotacao || 'Nenhuma anotação.' },
                    { title: 'Geral:', text: data.geralAnotacao || 'Nenhuma anotação.' }
                ];
                noteSections.forEach(section => {
                    if (notesY > 250) {
                        doc.addPage();
                        doc.setFontSize(14); doc.text("Anotações", 14, 20);
                        doc.setFontSize(10);
                        notesY = 30;
                    }
                    doc.text(section.title, 14, notesY);
                    const lines = doc.splitTextToSize(section.text, 180);
                    doc.text(lines, 14, notesY + 5);
                    notesY += 12 + (lines.length * 5);
                });

                if(trash.length > 0) {
                     doc.addPage();
                     doc.setFontSize(14); doc.text("Itens na Lixeira", 14, 20);
                     doc.autoTable({ head: [['Item', 'Valor', 'Tipo', 'Mês Original', 'Data Exclusão']], body: trash.map(i => [i.nome, formatCurrency(i.valor), i.type, i.originalMonth, new Date(i.deletedAt).toLocaleDateString('pt-BR')]), startY: 30, headStyles: { fillColor: [107, 114, 128] } });
                }

                const fileName = `Financeiro_${currentDate.getFullYear()}-${(currentDate.getMonth()+1).toString().padStart(2, '0')}.pdf`;
                doc.save(fileName);
                showToast('PDF gerado com sucesso!');
            }

            function generateAnalyticsDetailedReport() {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ unit: 'mm', format: 'a4' });
                const yearRows = getAnalyticsYearRows(analyticsYear);
                const focusRow = getAnalyticsFocusRow(yearRows);
                const isSpecificMonth = analyticsMonthFilter !== 'all' && focusRow;
                const generatedAt = new Date().toLocaleString('pt-BR');
                const scopeLabel = isSpecificMonth ? `${focusRow.monthLabel} de ${analyticsYear}` : `Ano ${analyticsYear}`;
                const annualTotals = yearRows.reduce((acc, row) => {
                    acc.entradas += row.entradas;
                    acc.despesas += row.despesas;
                    acc.pago += row.pago;
                    acc.pendente += row.pendente;
                    acc.sobras += row.sobras;
                    acc.saldo += row.saldo;
                    return acc;
                }, { entradas: 0, despesas: 0, pago: 0, pendente: 0, sobras: 0, saldo: 0 });

                doc.setFontSize(22);
                doc.text('Relatório detalhado de gráficos', 105, 18, null, null, 'center');
                doc.setFontSize(12);
                doc.text(`Financeiro • ${scopeLabel}`, 105, 26, null, null, 'center');
                doc.setFontSize(10);
                doc.text(`Gerado em ${generatedAt}`, 105, 31, null, null, 'center');

                doc.autoTable({
                    head: [['Escopo', 'Entradas', 'Despesas', 'Pago', 'Pendente', 'Sobras', 'Saldo']],
                    body: [[
                        scopeLabel,
                        formatCurrency(isSpecificMonth ? focusRow.entradas : annualTotals.entradas),
                        formatCurrency(isSpecificMonth ? focusRow.despesas : annualTotals.despesas),
                        formatCurrency(isSpecificMonth ? focusRow.pago : annualTotals.pago),
                        formatCurrency(isSpecificMonth ? focusRow.pendente : annualTotals.pendente),
                        formatCurrency(isSpecificMonth ? focusRow.sobras : annualTotals.sobras),
                        formatCurrency(isSpecificMonth ? focusRow.saldo : annualTotals.saldo)
                    ]],
                    startY: 40,
                    headStyles: { fillColor: [37, 99, 235] }
                });

                let cursorY = doc.autoTable.previous.finalY + 8;
                if (analyticsYearChartCanvas?.toDataURL) {
                    doc.setFontSize(13);
                    doc.text('Gráfico principal', 14, cursorY);
                    cursorY += 4;
                    doc.addImage(analyticsYearChartCanvas.toDataURL('image/png', 1.0), 'PNG', 14, cursorY, 182, 70);
                    cursorY += 78;
                }

                if (cursorY > 230) {
                    doc.addPage();
                    cursorY = 20;
                }
                if (analyticsCurrentChartCanvas?.toDataURL) {
                    doc.setFontSize(13);
                    doc.text('Gráfico complementar', 14, cursorY);
                    cursorY += 4;
                    doc.addImage(analyticsCurrentChartCanvas.toDataURL('image/png', 1.0), 'PNG', 45, cursorY, 120, 70);
                }

                doc.addPage();
                doc.setFontSize(14);
                doc.text(`Resumo mensal de ${analyticsYear}`, 14, 18);
                doc.autoTable({
                    head: [['Mês', 'Entradas', 'Despesas', 'Pago', 'Pendente', 'Sobras', 'Saldo']],
                    body: yearRows.map(row => [
                        row.monthLabel,
                        formatCurrency(row.entradas),
                        formatCurrency(row.despesas),
                        formatCurrency(row.pago),
                        formatCurrency(row.pendente),
                        formatCurrency(row.sobras),
                        formatCurrency(row.saldo)
                    ]),
                    startY: 24,
                    headStyles: { fillColor: [15, 118, 110] }
                });

                if (focusRow) {
                    const monthData = getMonthDataSnapshot(focusRow.monthKey);
                    doc.addPage();
                    doc.setFontSize(14);
                    doc.text(`Detalhamento de ${focusRow.monthLabel} ${analyticsYear}`, 14, 18);
                    doc.autoTable({
                        head: [['Indicador', 'Valor']],
                        body: [
                            ['Entradas', formatCurrency(focusRow.entradas)],
                            ['Despesas', formatCurrency(focusRow.despesas)],
                            ['Pago', formatCurrency(focusRow.pago)],
                            ['Pendente', formatCurrency(focusRow.pendente)],
                            ['Sobras', formatCurrency(focusRow.sobras)],
                            ['Saldo', formatCurrency(focusRow.saldo)]
                        ],
                        startY: 24,
                        headStyles: { fillColor: [37, 99, 235] }
                    });

                    doc.autoTable({
                        head: [['Entradas do mês', 'Valor', 'Data']],
                        body: monthData.entradas.map(item => [
                            item.nome,
                            formatCurrency(item.valor),
                            item.data ? formatDatePt(item.data) : 'Sem data'
                        ]),
                        startY: doc.autoTable.previous.finalY + 10,
                        headStyles: { fillColor: [16, 185, 129] }
                    });

                    doc.autoTable({
                        head: [['Despesas do mês', 'Valor', 'Data', 'Status']],
                        body: monthData.despesas.map(item => [
                            item.nome,
                            formatCurrency(item.valor),
                            item.data ? formatDatePt(item.data) : 'Sem data',
                            getExpenseStatusText(item)
                        ]),
                        startY: doc.autoTable.previous.finalY + 10,
                        headStyles: { fillColor: [220, 38, 38] }
                    });
                }

                doc.save(`Graficos_${analyticsYear}${isSpecificMonth ? `_${focusRow.monthIndex + 1}` : ''}.pdf`);
                showToast('Relatório detalhado dos gráficos gerado.');
            }

            function generateManualPDF() {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ unit: 'mm', format: 'a4' });
                let cursorY = 20;
                const lineHeight = 5.4;
                const pageHeight = 282;

                const ensureSpace = (needed = 16) => {
                    if (cursorY + needed <= pageHeight) return;
                    doc.addPage();
                    cursorY = 18;
                };

                const addParagraph = (text, fontSize = 10, spacingAfter = 6) => {
                    doc.setFontSize(fontSize);
                    const lines = doc.splitTextToSize(text, 182);
                    ensureSpace((lines.length * (fontSize * 0.45)) + spacingAfter + 4);
                    doc.text(lines, 14, cursorY);
                    cursorY += (lines.length * lineHeight) + spacingAfter;
                };

                const addSection = (title, paragraphs = []) => {
                    ensureSpace(18);
                    doc.setFontSize(15);
                    doc.text(title, 14, cursorY);
                    cursorY += 7;
                    paragraphs.forEach(paragraph => addParagraph(paragraph));
                };

                doc.setFontSize(22);
                doc.text('Manual completo do Financeiro', 105, cursorY, null, null, 'center');
                cursorY += 8;
                doc.setFontSize(12);
                doc.text('Seu comando absoluto do dinheiro', 105, cursorY, null, null, 'center');
                cursorY += 8;
                addParagraph(`Este manual foi gerado em ${new Date().toLocaleString('pt-BR')} e explica, em profundidade, como operar a plataforma do começo ao fim: controle mensal, entradas, despesas, modos de status, simulação, cofre, caixinhas, importação, busca, cronologia, gráficos, exportações e cuidados operacionais.`, 10, 8);

                addSection('1. Visão geral da tela principal', [
                    'A parte superior central mostra o mês em foco. Você pode navegar pelos meses com as setas laterais, clicar no nome do mês para abrir o seletor e usar o botão de calendário para trocar rapidamente de competência.',
                    'No topo também ficam as ferramentas principais: configurações, alternância de tema claro/escuro, ocultação de dados sensíveis, busca global, lista cronológica, painel anual de gráficos, calculadora, desfazer ações, bloqueio de edição e retorno imediato para o mês atual.',
                    'Logo abaixo aparecem os indicadores financeiros mais importantes: entradas previstas, despesas previstas, pago no mês, quanto falta pagar, sobra projetada, saldo do cofre e valor alocado para o próximo mês.'
                ]);

                addSection('2. Como cadastrar entradas', [
                    'Use o botão de adicionar na coluna de entradas para abrir o editor. Preencha a descrição, informe o valor e escolha a data base. Essa data pode representar recebimento, competência ou um marco que servirá de âncora para recorrências futuras.',
                    'O editor aceita lançamento único, repetição automática e encerramento após uma quantidade definida de ocorrências. Também permite periodicidade por mês, por intervalo de dias e por dia útil do mês.',
                    'Se você precisar anexar uma imagem para reconhecer o lançamento com mais rapidez, use o botão de anexo. A miniatura ficará associada ao item e aparecerá nos cartões do mês.'
                ]);

                addSection('3. Como cadastrar despesas e entender os estados', [
                    'A coluna de despesas trabalha com três estados operacionais principais. Pendente é o estado natural. Ainda não é aplicado pela ampulheta amarela, quando você quer sinalizar que a conta existe, mas não é o momento de baixá-la. Pago é acionado pela checkbox.',
                    'Ao marcar uma checkbox de despesa, o sistema considera o pagamento como real. Isso afeta o total pago do mês, o saldo disponível e os relatórios. O item continua visível, apenas muda sua apresentação visual e seu status.',
                    'Se faltar saldo para pagar, o sistema abre um aviso vermelho. Você pode reconhecer que a conta foi coberta por entradas que preferiu não detalhar ou voltar atrás e ajustar o planejamento.'
                ]);

                addSection('4. Scroll interno e expansão total', [
                    'As colunas exibem todos os lançamentos em rolagem contínua, sem trocar páginas durante o scroll.',
                    'Todos os itens permanecem visíveis na lista. Use a busca para localizar um lançamento.'
                ]);

                addSection('5. Modo sandbox', [
                    'O botão Modo sandbox ativa uma sandbox completa. A partir desse momento, pagamentos, caixinhas, uso do cofre, alocações e outros testes podem ser feitos sem gravar o cenário real.',
                    'Enquanto a simulação está ativa, o fundo muda para azul e o banner identifica o ambiente temporário para deixar claro que você está num ambiente temporário. O banner azul informa que qualquer mudança será descartada ao encerrar.',
                    'Você pode pagar uma despesa dentro da sandbox, testar pagar todas, abrir o cofre e criar novas caixinhas temporárias. Quando clicar em Encerrar sandbox ou Cancelar sandbox, o sistema restaura exatamente o estado original salvo no início da sandbox.'
                ]);

                addSection('6. Cofre e caixinhas', [
                    'O cofre concentra as reservas fora do fluxo do dia a dia. Cada caixinha representa um objetivo, com nome, valor, datas opcionais e, se quiser, taxa de juros mensal ou anual.',
                    'Criar uma caixinha ajuda a separar dinheiro para emergência, viagem, equipamentos, impostos ou qualquer objetivo futuro. A plataforma projeta crescimento quando há taxa de juros configurada.',
                    'No modo sandbox, o comportamento do cofre também entra na sandbox. Isso permite testar resgates e novas distribuições sem comprometer o valor real guardado.'
                ]);

                addSection('7. Importação de planilhas Excel', [
                    'No menu de configurações existe a opção de importar planilhas. O sistema tenta reconhecer automaticamente descrição, valor, data, mês, ano, tipo do lançamento e status de pago.',
                    'A prévia de importação mostra quantos lançamentos foram detectados, quantos meses foram cobertos e quais linhas ou blocos não puderam ser lidos automaticamente. Isso permite validar o arquivo antes de confirmar.',
                    'Depois de importar, revise os meses antigos e os meses recentes. Se sua planilha usa o modelo Andrade, a leitura também tenta identificar os blocos mensais e as anotações gerais de cada competência.'
                ]);

                addSection('8. Busca global e lista cronológica', [
                    'A busca global localiza entradas, despesas e caixinhas por nome, valor, mês, texto relacionado e ano. Ao abrir um resultado de lançamento, a aplicação navega direto até o mês correto e destaca o cartão encontrado.',
                    'A lista cronológica organiza os lançamentos em forma de agenda ou histórico recente. Ela exibe uma lista contínua de todos os resultados dos filtros.'
                ]);

                addSection('9. Painel anual e gráficos', [
                    'O painel anual consolida todos os meses do ano selecionado. Você pode alternar entre visão anual e foco num mês específico usando o filtro de recorte.',
                    'Os gráficos mostram comparação de entradas, despesas, pago, pendente, sobras e saldo. Os cartões abaixo resumem mês a mês, com destaque visual para saldos positivos ou negativos.',
                    'Use o botão de baixar relatório detalhado dentro do painel para gerar um PDF com os gráficos atuais, resumo anual, tabela mensal completa e detalhamento do mês em foco.'
                ]);

                addSection('10. Exportações, lixeira e bloqueios', [
                    'A lixeira guarda lançamentos excluídos com data de remoção e mês de origem. É uma área útil para auditoria rápida antes de refazer cadastros.',
                    'Você pode exportar a planilha no modelo Andrade, baixar o PDF detalhado do mês atual e gerar este manual completo sempre que quiser documentar o uso do sistema.',
                    'O bloqueio de edição impede alterações acidentais. A ocultação de dados protege números sensíveis. Quando for necessário liberar acesso, o sistema usa PIN ou o fluxo de desbloqueio configurado.'
                ]);

                doc.addPage();
                doc.setFontSize(15);
                doc.text('Atalhos e referências rápidas', 14, 18);
                doc.autoTable({
                    head: [['Área', 'O que faz', 'Quando usar']],
                    body: [
                        ['Checkbox da despesa', 'Marca ou desmarca pago', 'Quando a conta foi efetivamente quitada'],
                        ['Ampulheta amarela', 'Define Ainda não', 'Quando a conta existe, mas não será baixada agora'],
                        ['Modo sandbox', 'Abre uma sandbox descartável', 'Quando quiser testar cenários sem gravar'],
                        ['Seta abrir tudo', 'Expande a lista inteira', 'Quando quiser revisão completa sem paginação'],
                        ['Busca global', 'Encontra itens e reservas', 'Quando não lembrar o mês de um lançamento'],
                        ['Lista cronológica', 'Ordena por agenda ou histórico', 'Quando precisar visualizar sequência temporal'],
                        ['Painel anual', 'Consolida o ano e gera relatório', 'Quando precisar analisar comportamento mensal']
                    ],
                    startY: 24,
                    headStyles: { fillColor: [22, 163, 74] }
                });

                doc.save('Manual_Financeiro.pdf');
                showToast('Manual completo em PDF gerado.');
            }

            // Adicionar listeners para todos os botões de fechar modais
            document.querySelectorAll('button[aria-label^="Fechar"]').forEach(btn => {
                btn.classList.add('modal-close-button');
            });

            function closeModalFromButton(button) {
                if (button?.classList.contains('modal-close-button') && button.querySelector('svg')) {
                    button.classList.add('is-spinning');
                    window.setTimeout(() => {
                        button.classList.remove('is-spinning');
                        closeTopModal();
                    }, 140);
                    return;
                }
                closeTopModal();
            }

            document.querySelectorAll('[id^="close-"],[id$="-cancel-btn"],[id$="-cancelar-btn"]').forEach(btn => {
                btn.addEventListener('click', () => closeModalFromButton(btn));
            });

            document.querySelectorAll('[data-expense-status]').forEach(btn => {
                btn.addEventListener('click', () => applyExpenseStatusSelection(btn.dataset.expenseStatus));
            });

            useImplicitFundsBtn.addEventListener('click', () => {
                const action = pendingInsufficientFundsAction;
                const expenseStatusModalWasOpen = modalStack.some(entry => entry.element === expenseStatusModal);
                pendingInsufficientFundsAction = null;
                if (modalStack[modalStack.length - 1]?.element === insufficientFundsModal) {
                    closeTopModal();
                }
                if (typeof action === 'function') {
                    action();
                }
                if (expenseStatusModalWasOpen && modalStack.some(entry => entry.element === expenseStatusModal)) {
                    closeTopModal();
                }
                updateAllUI();
                checkForSobrasFlow();
            });

            simulationOpenCofreBtn.addEventListener('click', () => {
                renderCaixinhas();
                openModal(cofreModal, simulationOpenCofreBtn);
            });

            simulationModeToggleBtn.addEventListener('click', () => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                if (simulationState.active) {
                    endSimulationMode();
                } else {
                    startSimulationMode();
                }
            });

            simulationPayAllBtn.addEventListener('click', () => {
                if (isEditLocked) { showToast('Edição trancada.'); return; }
                payAllOpenExpenses({ opener: simulationPayAllBtn });
            });

            simulationEndBtn.addEventListener('click', () => {
                endSimulationMode();
            });

            function buildPortableNoteRows() {
                const rows = [['Mes','Tipo','Texto']];
                Object.entries(financialData).forEach(([key,data]) => {
                    ['entradas','despesas','geral'].forEach(type => {if(data[`${type}Anotacao`])rows.push([key,type,data[`${type}Anotacao`]]);});
                });
                return rows;
            }
            function buildPortableExportRows() {
                const rows = [['ID','Tipo','Descrição','Valor','Data','Mês','Ano','Status','Parcela','Parcelas']];
                Object.entries(financialData).sort().forEach(([key, data]) => {
                    const [year,month] = key.split('-').map(Number);
                    ['entradas','despesas'].forEach(type => {
                        const templates = simulationState.active ? [] : (data.simulationTemplates || []).filter(i=>i.type===type);
                        [...data[type],...templates].forEach(item => {
                            rows.push([String(item.id),type,item.nome,item.valor,item.data || '',month+1,year,MLGDomain.exportStatus(item),item.occurrenceIndex || item.parcelaAtual || '',item.occurrenceTotal || item.parcelaTotal || '']);
                        });
                    });
                });
                return rows;
            }
            function netVaultTransfers(data) {
                return roundToTwo((data.vaultTransfers || []).reduce((sum, transfer) => sum + transfer.amount, 0));
            }
            function recordVaultTransfer(data, amount, boxId) {
                data.vaultTransfers ||= [];
                data.vaultTransfers.push({id:generateItemId(), amount:roundToTwo(amount), boxId, date:formatDateOnly(currentDate)});
            }
            function resetHistoryBaseline() {
                historyBaseline = buildUndoSnapshot('alteração');
                historySignature = JSON.stringify({...historyBaseline, currentDate:0, nextGeneratedId:0, label:''});
            }
            function checkpointHistory() {
                const next = buildUndoSnapshot('alteração');
                const signature = JSON.stringify({...next, currentDate:0, nextGeneratedId:0, label:''});
                if (historyBaseline && signature !== historySignature) {
                    const last = undoStack.at(-1);
                    const lastSignature = last && JSON.stringify({...last, currentDate:0, nextGeneratedId:0, label:''});
                    if (lastSignature !== historySignature) undoStack.push(historyBaseline);
                    if (undoStack.length > UNDO_STACK_LIMIT) undoStack.shift();
                    updateUndoButtonState();
                }
                historyBaseline = next; historySignature = signature;
            }
            function openDepositDialog(box) {
                const dialog = document.createElement('dialog'); dialog.className = 'mlg-dialog';
                dialog.innerHTML = '<form class="mlg-account-form"><h2>Adicionar dinheiro</h2><p class="deposit-info"></p><label>Valor em reais<input name="amount" inputmode="decimal" placeholder="0,00" required></label><p role="status"></p><div class="mlg-form-actions"><button type="button">Cancelar</button><button class="mlg-primary">Guardar</button></div></form>';
                const data = ensureMonthData(getMonthKey(currentDate));
                const available = Math.max(0, roundToTwo(data.entradas.reduce((sum,i)=>sum+i.valor,0) - data.despesas.reduce((sum,i)=>sum+i.valor,0) - netVaultTransfers(data) - data.allocationOut));
                dialog.querySelector('.deposit-info').textContent = `${box.nome} · Livre no mês após despesas previstas: ${formatCurrency(available)}. O valor será transferido do saldo para o cofre.`;
                const close = () => {dialog.close(); dialog.remove();};
                dialog.querySelector('[type=button]').onclick = close;
                dialog.oncancel = event => {event.preventDefault(); close();};
                dialog.querySelector('form').onsubmit = event => {
                    event.preventDefault();
                    const amount = parseNumberInputValue(event.currentTarget.elements.amount.value);
                    if (isEditLocked || !Number.isFinite(amount) || amount <= 0 || amount > available) {
                        dialog.querySelector('[role=status]').textContent = 'Use um valor positivo dentro do saldo livre do mês.'; return;
                    }
                    pushUndoSnapshot('depósito no cofre');
                    box.valor = roundToTwo(box.valor + amount);
                    recordVaultTransfer(data, amount, box.id);
                    close(); updateAllUI(); showToast('Dinheiro guardado na caixinha.');
                };
                document.body.append(dialog); dialog.showModal();
            }

            // --- PERSISTÊNCIA DE SESSÃO ---
            function saveState() {
                if (isLoading) return;
                checkpointHistory();
                if (simulationState.active) return;
                const state = {
                    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                    currentDate: currentDate.getTime(),
                    financialData,
                    caixinhas,
                    trash,
                    recurringSeries,
                    nextGeneratedId,
                    calculator: {
                        isOpen: !calculatorWindow.classList.contains('hidden'),
                        position: {
                            top: calculatorWindow.style.top,
                            left: calculatorWindow.style.left,
                            right: calculatorWindow.style.right,
                            bottom: calculatorWindow.style.bottom,
                            transform: calculatorWindow.style.transform,
                        },
                        memory: {
                            displayValue,
                            expressionValue,
                            firstOperand,
                            operator,
                            waitingForSecondOperand,
                            justEvaluated,
                            history: calculatorHistoryEntries
                        }
                    },
                    isDataLocked: isDataLocked,
                    isEditLocked: isEditLocked,
                    editLockRanges: editLockRanges.map(normalizeEditLockRange).filter(Boolean),
                    simulationState
                };
                try {
                    localStorage.setItem('financialControlState', JSON.stringify(state));
                } catch (error) {
                    console.error('Não foi possível salvar o estado.');
                    if (!savingErrorShown) { showToast('Armazenamento cheio ou indisponível. Exporte uma cópia antes de fechar.'); savingErrorShown = true; }
                }
            }

            function loadState() {
                const savedState = localStorage.getItem('financialControlState');
                if (savedState) {
                    let state = null;
                    try {
                        state = JSON.parse(savedState);
                    } catch (error) {
                        console.error('Nao foi possivel restaurar o estado salvo.', error);
                        state = null;
                    }
                    if (state?.simulationState?.active && state.simulationState.snapshot?.app) {
                        state = {...state, ...state.simulationState.snapshot.app, simulationState:{active:false}};
                    }
                    if (!state) {
                        lockData();
                        editLockRanges = [];
                        updateEditLockState({ save: false });
                        return;
                    }

                    if(state.theme === 'dark') document.documentElement.classList.add('dark');
                    else document.documentElement.classList.remove('dark');
                    updateThemeIcons(state.theme === 'dark');

                    currentDate = state.currentDate ? new Date(state.currentDate) : new Date();
                    currentDate.setDate(1);
                    currentDate.setHours(0, 0, 0, 0);
                    financialData = typeof state.financialData === 'object' && state.financialData ? state.financialData : {};
                    Object.keys(financialData).forEach(key => {
                        financialData[key] = normalizeMonthDataEntry(financialData[key]);
                    });
                    caixinhas = Array.isArray(state.caixinhas) ? state.caixinhas.map(normalizeCaixinhaEntry) : [];
                    trash = Array.isArray(state.trash) ? state.trash : [];
                    recurringSeries = Array.isArray(state.recurringSeries) ? state.recurringSeries.map(normalizeRecurringSeriesEntry) : [];
                    nextGeneratedId = Math.max(Date.now(), Number(state.nextGeneratedId) || 0);
                    migrateLegacyRecurringItemsToSeries();

                    const calculatorState = state.calculator || {};
                    const calculatorMemory = calculatorState.memory || {};
                    displayValue = calculatorMemory.displayValue || '0';
                    expressionValue = calculatorMemory.expressionValue || '';
                    firstOperand = calculatorMemory.firstOperand ?? null;
                    operator = calculatorMemory.operator ?? null;
                    waitingForSecondOperand = Boolean(calculatorMemory.waitingForSecondOperand);
                    justEvaluated = Boolean(calculatorMemory.justEvaluated);
                    calculatorHistoryEntries = Array.isArray(calculatorMemory.history) ? calculatorMemory.history : [];
                    updateDisplay();
                    renderCalculatorHistory();

                    if(calculatorState.isOpen) {
                        openModal(calculatorWindow);
                        if (calculatorState.position) Object.assign(calculatorWindow.style, calculatorState.position);
                    }

                    isDataLocked = state.isDataLocked;
                    if(isDataLocked) lockData(); else unlockData();

                    const loadedSimulationState = state.simulationState || {};
                    simulationState = {
                        active: Boolean(loadedSimulationState.active),
                        snapshot: loadedSimulationState.snapshot || null,
                        startedAt: loadedSimulationState.startedAt || null,
                        triggerExpenseId: loadedSimulationState.triggerExpenseId || null,
                        triggerMonthKey: loadedSimulationState.triggerMonthKey || null
                    };

                    editLockRanges = Array.isArray(state.editLockRanges)
                        ? mergeEditLockRanges(state.editLockRanges.map(normalizeEditLockRange).filter(Boolean))
                        : (state.isEditLocked ? [createEditLockRange(null, null)] : []);
                    updateEditLockState({ save: false });
                    updateUndoButtonState();
                } else {
                    unlockData(); // A conta local já foi desbloqueada.
                    editLockRanges = [];
                    updateEditLockState({ save: false });
                    updateUndoButtonState();
                }
            }


            // --- INICIALIZAÇÃO E FORMATAÇÃO DE CAMPOS ---
            function formatNumberField(e) {
                e.target.value = e.target.value.replace(/[^0-9,.-]/g, '');
            }

            function formatNumberFieldOnBlur(e) {
                const value = parseNumberInputValue(e.target.value);
                if (!isNaN(value)) {
                    e.target.value = value.toFixed(2).replace('.', ',');
                } else {
                    e.target.value = '';
                }
            }

            const numberInputs = ['item-valor-input', 'sobras-cofre-input', 'sobras-alocar-input', 'sobras-gastar-input', 'retirar-valor-input', 'delete-caixinha-alocar-input', 'delete-caixinha-gastar-input', 'delete-caixinha-transferir-input'];
            numberInputs.forEach(id => {
                const input = document.getElementById(id);
                input.type = 'text';
                input.inputMode = 'decimal';
                input.addEventListener('input', formatNumberField);
                input.addEventListener('blur', formatNumberFieldOnBlur);
            });


            pinWrapper.style.display = 'none';
            pinWrapper.classList.add('pointer-events-none', 'hidden');
            showMainApp();
            MLGAccount.renderBadge(document.getElementById('mlg-profile'));
            document.querySelector('[aria-label="Voltar"]').addEventListener('click', () => location.href = '/');
            window.MLGFinance = {
                getDate: () => formatDateOnly(currentDate),
                exportRows: () => buildPortableExportRows(),
                exportNotes: () => buildPortableNoteRows(),
                addCommand(raw) {
                    if (isEditLocked) throw new Error('Edição trancada.');
                    const rows = MLGDomain.installments(raw);
                    if (rows.some(row => isDateEditLocked(parseDateOnly(row.data)))) throw new Error('Uma das parcelas está em um mês trancado.');
                    pushUndoSnapshot('lançamento por IA');
                    rows.forEach(row => {
                        const item = createStandaloneItem(row.type, row);
                        Object.assign(item, {occurrenceIndex:row.occurrenceIndex, occurrenceTotal:row.occurrenceTotal});
                        ensureMonthData(row.monthKey)[row.type].push(item);
                    });
                    currentDate = parseDateOnly(rows[0].data); currentDate.setDate(1);
                    updateAllUI(); showToast(`${rows.length} lançamento(s) adicionado(s). Ctrl+Z para desfazer.`);
                }
            };
            window.dispatchEvent(new Event('mlg-finance-ready'));
        });
