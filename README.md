# MLG

**my life graphs** — organização pessoal com dados no navegador.

MLG abre no cadastro local com nome, foto e senha. O módulo Financeiro oferece
entradas, despesas, recorrências, parcelas, calendário, calculadora, cofre,
caixinhas, anotações, gráficos, importação/exportação e uma área de simulação.

O Financeiro usa uma tela fixa, sem rolagem da página. Listas, notas, histórico
e janelas extensas rolam apenas dentro dos próprios painéis, sem barras visíveis.
A **Mesa de trabalho** reúne contas, notas e calculadora no computador. A coluna
de contas alterna entre Entradas e Despesas, usando toda a altura disponível.
Em telas estreitas, abas alternam os mesmos painéis sem duplicar nem perder seus
dados. A visão anual exibe os 12 meses sem rolagem: matriz no computador e
cartões com seletor de indicador em telas menores. Selecione um mês para abrir
seus lançamentos. O card de simulação mantém todas as ações sem rolagem própria.
A IA permanece em uma cápsula flutuante: respostas se expandem acima dela,
sem reservar um rodapé. Confirmações ficam abertas até confirmar ou cancelar.
Os temas claro/escuro e a preferência por movimento reduzido são respeitados.

## Executar

Requer Node.js 22 ou superior. O servidor de produção não precisa de pacotes npm.

```sh
npm start
```

Abra http://127.0.0.1:3000. Para desenvolvimento e testes:

```sh
npm ci
npm run check
npm test
```

O site deve ser servido por HTTP local ou HTTPS. Não abra o HTML por `file://`.
Algumas bibliotecas de interface, fontes e geração de relatórios usam CDNs;
os dados financeiros continuam no navegador. O leitor SheetJS está incluído
localmente em `assets/vendor`, com sua licença Apache 2.0. A exportação usa
ExcelJS 4.4.0, incluído no mesmo diretório com licença MIT.

## Organização

- `index.html`: tela inicial MLG.
- `financeiro/index.html`: módulo Financeiro. O endereço antigo redireciona para ele.
- `assets/js/account.js`: cadastro e bloqueio local por senha.
- `assets/js/domain.js`: estados da planilha, validação e cálculo de parcelas.
- `assets/js/finance.js`: interface e fluxos financeiros existentes.
- `assets/js/assistant.js`: comandos por texto/voz e revisão do lançamento.
- `assets/css/`: estilos separados, tema e movimento reduzido.
- `server/index.cjs`: arquivos públicos e proxy autenticado para Gemini.
- `tests/`: regressões financeiras, planilha XLSX real e segurança do servidor.

## Perfil, dados locais e simulação

As finanças e anotações são salvas em `localStorage`, usando a chave existente
`financialControlState`. O perfil usa `mlg.account.v1`. Não existe sincronização
entre dispositivos. Limpar os dados do site apaga o armazenamento local.

O perfil oferece foto com arrastar e soltar, recorte, zoom, status e troca de
nome/senha sem apagar finanças. O bloqueio por inatividade é configurável de
1 a 60 minutos. O menu do perfil permite baixar um backup JSON completo ou
apagar os dados locais após confirmação. O bloqueio é local, não criptografa
os dados financeiros armazenados no navegador.

O sandbox parte de uma cópia do cenário real. Alterações feitas nele ficam
somente em memória; encerrar ou recarregar a página descarta os testes. O
histórico de desfazer é independente durante a simulação. Ctrl+Z desfaz ações
financeiras; dentro de campos de texto, mantém o comportamento de edição nativo.

Em **Configurações → Apagar todos os dados financeiros**, a confirmação digitada
`APAGAR FINANCEIRO` limpa todos os meses, caixinhas, recorrências, anotações
financeiras e lixeira. Essa limpeza não é desfeita por Ctrl+Z; perfil e notas da
página inicial são preservados. O diálogo oferece backup antes da confirmação.

Depósitos e resgates de caixinhas são transferências internas, sem inventar
receitas. As projeções de rendimento são estimativas e não alteram o saldo.
O depósito considera o saldo livre após despesas previstas.
Cada caixinha tem saldo inicial e movimentos mensais. O fechamento passa ao
mês seguinte; mudar um movimento passado recalcula os saldos posteriores.
Resgates retroativos respeitam os recursos já usados nos meses seguintes.

## Planilhas

O importador aceita `.xlsx`, `.xls` e `.csv`, além do layout Andrade existente.
Linhas totalmente vazias e totais não viram lançamentos. Linhas preenchidas sem
status ficam `On hold`. O status nunca é inferido pelo ano da planilha.

| Planilha | MLG |
|---|---|
| vazio / On hold | em espera |
| Simulação | cenário temporário, carregado ao iniciar o sandbox |
| Não pago | pendente |
| Pago | quitado |
| Ainda não | ampulheta |

A exportação reproduz cores, proporções, mesclagens e fórmulas do modelo
Andrade de referência, com três colunas por mês e áreas de notas. Se houver
mais lançamentos que o modelo comporta, as linhas crescem sem cortar dados.
As abas técnicas ocultas preservam IDs, datas, parcelas e anotações por
categoria. A reimportação lê os valores e status das abas visíveis e atualiza
registros conhecidos, sem duplicá-los. Alterações estruturais na planilha
podem mudar a identificação da origem; revise a prévia antes de importar.
Linhas nomeadas sem valor são informadas na prévia, sem inventar quantias.

As abas de lançamentos não são um backup completo de perfil, fotos, cofre e
regras de recorrência. Para preservar toda a sessão, copie o armazenamento
local com a opção **Baixar backup** do perfil antes de limpar o navegador.

## Gemini e voz

Comandos sem mês usam o mês aberto no Financeiro. A IA aceita expressões como
“gastei 30 no mercado”, “recebi 100” e “entrou 50 a mais”; datas explícitas têm
prioridade. A interpretação é exibida para revisão antes de criar lançamentos.

Defina `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_PUBLIC_ENABLED` e `PUBLIC_ORIGIN`
no ambiente do servidor. Veja [implantação no alwaysdata](docs/alwaysdata.md).
Para carregar um arquivo `.env` local explicitamente com Node:

```sh
node --env-file=.env server/index.cjs
```

`AI_PUBLIC_ENABLED=true` permite usar a IA sem código de acesso. A sessão
anônima é criada automaticamente no backend. A chave Gemini nunca é entregue
ao navegador. O proprietário deve manter o teto de gastos no provedor.

No modo privado (padrão), `AI_ACCESS_TOKEN` pode ser usado por integrações
autorizadas; o chat não pede nem incorpora essa credencial.
A sessão usa cookie HttpOnly e SameSite=Strict, com Secure em HTTPS. O servidor
limita tentativas, valida origem e comandos, impõe timeout e não expõe `.env`,
fontes do backend ou a chave da API. A chave é enviada ao Google somente pelo
backend, em cabeçalho; não aparece no JavaScript entregue ao navegador.

Exemplo: “Adicione uma saída de 600 reais em dezembro para equipamento,
dividida em 3 parcelas”. O total é dividido sem perder centavos. Quando o valor
for por parcela, diga explicitamente “3 parcelas de 200 reais”. Revise a
interpretação e confirme. Ctrl+Z desfaz todas as parcelas dessa operação.

O microfone grava uma frase de até 30 segundos (500 KB), com permissão do
navegador e HTTPS. Use a seta para enviar, a pausa para interromper/continuar e a lixeira
para descartar. Ao chegar a 30 segundos a gravação pausa, aguardando envio. O áudio fica na memória e é enviado ao Google Gemini
pelo backend para transcrição e interpretação, usando a mesma chave e cota
dos comandos escritos. O restante das finanças não é enviado ao modelo.

Na opção **Mesa de trabalho**, as contas do mês, as notas e a calculadora
ficam lado a lado em telas grandes; no celular, os painéis ficam empilhados.
A escolha da visualização é salva no navegador. Para usar o teclado da
calculadora, clique nela; escrever nas notas não aciona os cálculos.

## Segurança e limites

A senha local tem derivação PBKDF2-SHA256 com sal aleatório. Ela protege o fluxo
da interface, mas não cifra as finanças: quem controla o navegador ou seus
arquivos pode acessar ou modificar os dados. Não se deve chamar isso de conta
remota ou autenticação segura de múltiplos usuários. A chave Gemini, por outro
lado, permanece exclusivamente no backend.

O projeto conserva módulos demonstrativos do portal original. Recursos sociais
e demais aplicativos ainda não têm um serviço remoto implementado.

Licença MIT para o projeto; bibliotecas de terceiros conservam suas licenças.

## Chat, imagens e visão anual

O chat fica fixo no Financeiro e reserva espaço para não cobrir os formulários.
Pesquisa, navegação, notas e abertura das ferramentas podem ser executadas
localmente: por exemplo, “buscar internet”, “anote: conferir fatura”,
“abrir dezembro”, “resumo” e “caixinhas”. O Gemini interpreta os demais pedidos
e devolve uma proposta; operações financeiras e notas exigem confirmação.

Arraste uma imagem ou use o botão de anexo. Somente JPG, PNG e WebP são aceitos
(até 8 MB antes da conversão). O navegador reduz a imagem, remove metadados e
a envia como JPEG de até 500 KB. Uma cópia de até 512 pixels fica no lançamento local depois da
confirmação, para poupar espaço no navegador. O servidor valida tipo, assinatura e tamanho; não armazena mídia.

A visão “Ano completo” mostra os doze meses em uma tabela e cartões compactos,
com opção de mostrar lançamentos. Clique em um mês para voltar à mesa.

## Proteção da cota pública

No acesso público, o servidor reserva cada chamada antes de contatar o provedor.
O máximo padrão é 30 chamadas/dia e 200/mês para o site inteiro, persistido em
`data/ai-usage.json` e protegido contra reservas concorrentes. As variáveis
`AI_DAILY_REQUEST_LIMIT` e `AI_MONTHLY_REQUEST_LIMIT` permitem reduzir esses
tetos. Falhas também consomem a reserva. Reiniciar o servidor não zera a cota;
falha no arquivo de controle bloqueia novas chamadas. Há também validação de origem e sessão e limites de tamanho e frequência.

Esses são limites de quantidade, não uma cobrança em reais. O limite financeiro
do projeto Google deve continuar configurado: outras aplicações podem consumir
a mesma cota. O acesso público não é autenticação de identidade e pode sofrer
uso abusivo até atingir os tetos. Não envie credenciais no chat.

Não existe recuperação da senha local por e-mail. O cadastro informa isso e
exige ciência. “Esqueci minha senha” explica a exclusão irreversível de perfil,
finanças e notas e exige digitar `EXCLUIR PERFIL`; cancelar preserva os dados.

Ícone de calculadora: [Font Awesome Free 6.5.2](https://fontawesome.com/),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
