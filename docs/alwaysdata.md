# Publicar no alwaysdata

Destino GitHub autorizado: **anddrad3/MLG**. Não usar outra conta.

1. Crie sua conta em https://www.alwaysdata.com/ e selecione o plano gratuito,
   conferindo os limites e termos exibidos. O titular deve concluir o cadastro.
2. No acesso SSH/SFTP da conta, envie o projeto ou clone o repositório público:
   `git clone https://github.com/anddrad3/MLG.git ~/mlg`.
3. Em **Web > Sites**, adicione um site do tipo Node.js. Diretório de trabalho:
   `/home/SEU_USUARIO/mlg`. Comando: `node server/index.cjs`.
4. Selecione Node.js 22 ou superior. Use o IP e a porta indicados no painel,
   em `IP` e `PORT`. O servidor lê essas variáveis; não fixe a porta 3000 em produção.
5. Configure as variáveis de ambiente do site:

   - `PUBLIC_ORIGIN=https://SEU_USUARIO.alwaysdata.net` (sem barra final).
   - `GEMINI_API_KEY`: chave da sua conta Google AI Studio.
   - `GEMINI_MODEL`: um modelo Gemini disponível para sua chave, por exemplo
     `gemini-3.8-flash` quando habilitado na conta.
   - `AI_PUBLIC_ENABLED=true`: acesso sem código, com sessão anônima.
   - `AI_DAILY_REQUEST_LIMIT=30` e `AI_MONTHLY_REQUEST_LIMIT=200`: tetos de chamadas
     do MLG. Mantenha também o limite financeiro no projeto Google.
   - `AI_ACCESS_TOKEN` é opcional no modo público e não é enviado ao frontend.

6. Ative HTTPS e reinicie o site. Acesse `/api/config`: deve informar
   `aiConfigured: true`, sem revelar nenhuma credencial.
7. Crie o perfil local, abra Financeiro e envie um comando. O chat cria a
   sessão anônima automaticamente, sem pedir código. Confira descrição, valor,
   mês, parcelas e foto antes de confirmar.
8. Exporte uma planilha, recarregue a página, confira as notas e teste o sandbox.
   Verifique que `/.env` e `/server/index.cjs` retornam 404.

Não envie chaves em issues, commits, capturas de tela ou conversas públicas.
A conta gratuita da hospedagem não implica gratuidade das chamadas Gemini:
verifique a cota e a configuração da sua conta antes de habilitar a IA.

Documentação oficial consultada:
- https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/
- https://help.alwaysdata.com/en/docs/web-hosting/sites/http-servers/user-program/
- https://ai.google.dev/gemini-api/docs/structured-output

O diretório `data/` precisa permitir escrita pelo processo Node. Não exclua
`data/ai-usage.json` nas atualizações: ele preserva as cotas entre reinícios.
Os contadores não contêm texto, áudio, imagens nem finanças dos usuários.
