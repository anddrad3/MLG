# MLG

**my life graphs** — organização pessoal com dados no navegador.

MLG abre no cadastro local com nome, foto e senha. O módulo Financeiro oferece
entradas, despesas, recorrências, parcelas, calendário, calculadora, cofre,
caixinhas, anotações, gráficos, importação/exportação e uma área de simulação.

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

Defina `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_ACCESS_TOKEN` e `PUBLIC_ORIGIN`
no ambiente do servidor. Veja [implantação no alwaysdata](docs/alwaysdata.md).
Para carregar um arquivo `.env` local explicitamente com Node:

```sh
node --env-file=.env server/index.cjs
```

`AI_ACCESS_TOKEN` deve ter pelo menos 24 caracteres aleatórios. É o código de
acesso dos usuários autorizados à IA; não é a chave Gemini nem a senha local.
A sessão usa cookie HttpOnly e SameSite=Strict, com Secure em HTTPS. O servidor
limita tentativas, valida origem e comandos, impõe timeout e não expõe `.env`,
fontes do backend ou a chave da API. A chave é enviada ao Google somente pelo
backend, em cabeçalho; não aparece no JavaScript entregue ao navegador.

Exemplo: “Adicione uma saída de 600 reais em dezembro para equipamento,
dividida em 3 parcelas”. O total é dividido sem perder centavos. Quando o valor
for por parcela, diga explicitamente “3 parcelas de 200 reais”. Revise a
interpretação e confirme. Ctrl+Z desfaz todas as parcelas dessa operação.

O reconhecimento de voz depende de suporte e permissão do navegador e pode
usar o serviço de reconhecimento dele. A transcrição enviada é processada
pelo Google Gemini. O restante das suas finanças não é enviado ao modelo.

## Segurança e limites

A senha local tem derivação PBKDF2-SHA256 com sal aleatório. Ela protege o fluxo
da interface, mas não cifra as finanças: quem controla o navegador ou seus
arquivos pode acessar ou modificar os dados. Não se deve chamar isso de conta
remota ou autenticação segura de múltiplos usuários. A chave Gemini, por outro
lado, permanece exclusivamente no backend.

O projeto conserva módulos demonstrativos do portal original. Recursos sociais
e demais aplicativos ainda não têm um serviço remoto implementado.

Licença MIT para o projeto; bibliotecas de terceiros conservam suas licenças.
