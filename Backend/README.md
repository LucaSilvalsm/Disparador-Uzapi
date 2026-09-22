# Backend do Disparador Uzapi

Backend em desenvolvimento, organizado por módulos, com Node.js, Express e Prisma/PostgreSQL.

## Estrutura do disparador: do formulário ao relatório

O fluxo principal é um **formulário único, sem login**, enviado para `POST /disparos`. O usuário não precisa cadastrar a instância, os contatos e as mensagens em requisições separadas. O backend recebe tudo e coordena os módulos internamente.

O formulário já está disponível em HTML/JavaScript com Tailwind via CDN, sem Vue ou EJS. Com o backend iniciado, abra `http://localhost:5000/disparador` (ou `/`, que redireciona para o formulário). Também é possível testar pelo Postman. As páginas de acompanhamento e relatório usam a mesma identidade visual.

### Visão geral

```text
Formulário (Phone ID + token + e-mail + contatos + mensagens)
  -> POST /disparos
  -> Campanha / FormularioCampanhaService (coordena a solicitação)
       -> Instância: identifica ou reutiliza o Phone ID e verifica saldo/ocupação
       -> Contato: normaliza e valida a lista de destinatários
       -> Mensagens: valida o conteúdo e a ordem, dentro do módulo Campanha
       -> Gravação atômica: campanha + destinatários + mensagens + aviso de progresso
  -> Resposta HTTP 202 com UUID (envios continuam em segundo plano)
  -> Disparo -> Integração Uzapi -> ResultadoMensagem
       -> Progresso: link por e-mail e consultas periódicas durante a execução
  -> Finalização da campanha
       -> Encerra o acesso ao progresso
       -> Relatório: novo link por e-mail + exportação CSV/XLSX
  -> Após 24 horas da finalização: expiração e limpeza dos registros temporários
```

Esse desenho representa as responsabilidades, não uma cadeia de chamadas HTTP entre módulos. No código, as mensagens e os contatos são validados antes da transaction; a instância e as condições de início são verificadas dentro dela. Não existe uma pasta `Modules/Mensagem`: o modelo `Mensagem` é gerenciado pelo módulo `Campanha`.

### 1. Formulário: reúne todos os dados

O usuário informa o nome da campanha, o Phone ID, o token da Uzapi, o e-mail para receber os links, a lista de contatos e de uma a três mensagens. Exemplo com dados ilustrativos:

```http
POST /disparos
Content-Type: application/json
Idempotency-Key: campanha-exemplo-0001
```

```json
{
  "nome": "Minha campanha",
  "instancia": {
    "idNumeroTelefone": "123456789",
    "token": "TOKEN_DA_UZAPI",
    "email": "usuario@example.com"
  },
  "lista": "5511999990001,Ana\n5511999990002,Bruno",
  "mensagens": [
    { "tipo": "texto", "texto": "Olá {{nome}}, tudo bem?" },
    { "tipo": "link", "texto": "Conheça nosso site: https://example.com" }
  ]
}
```

O header `Idempotency-Key` deve ter de 16 a 128 caracteres: letras, números, `_` ou `-`. Use uma chave nova para cada nova campanha. Ao repetir a mesma solicitação com a mesma chave, enquanto seu registro existir, a API retorna a campanha já criada com HTTP `200`, sem agendar outro envio. Reutilizar a chave com outros dados retorna `409`.

Entrada no código: [FormularioCampanhaRouter.js](src/Modules/Campanha/FormularioCampanhaRouter.js) e [FormularioCampanhaService.js](src/Modules/Campanha/FormularioCampanhaService.js).

### 2. Instância: identifica o remetente e controla o uso

O `FormularioCampanhaService` cria ou reutiliza o registro de `Instancia` pelo `idNumeroTelefone` (Phone ID). Por isso, preencher novamente o formulário com um Phone ID já cadastrado não causa, por si só, erro de duplicidade.

Antes de iniciar, verifica se a instância está ativa, se já possui uma campanha em andamento e se o saldo das últimas 24 horas comporta todos os contatos válidos. Uma instância executa somente uma campanha por vez; instâncias diferentes podem executar simultaneamente.

Neste fluxo, o e-mail fica na campanha (`emailRelatorio`) e o token de envio fica cifrado na campanha (`tokenEnvioCifrado`). A submissão não substitui o e-mail ou as credenciais de outras campanhas. O cadastro local não comprova conexão/autorização na Uzapi: a credencial remota é verificada quando ocorre o envio.

### 3. Contato: prepara os destinatários

O [ContatoService.js](src/Modules/Contato/ContatoService.js), por meio de `parsearLista`, interpreta uma linha por contato no formato `telefone,nome`.

- Remove caracteres não numéricos do telefone e acrescenta `55` quando necessário, conforme a regra atual para números brasileiros.
- Valida o formato com 12 ou 13 dígitos; isso não verifica se o número possui WhatsApp.
- Exclui da lista de envio os telefones inválidos e os duplicados na mesma submissão.
- Exige pelo menos dois contatos válidos e informa as quantidades de válidos e inválidos.

No fluxo do formulário, nome e telefone são gravados em `CampanhaContato`, pertencendo àquela campanha. Não é necessário criar previamente registros no cadastro global `Contato`, utilizado pelo fluxo administrativo antigo.

### 4. Mensagens: define o conteúdo e a sequência

O [CampanhaService.js](src/Modules/Campanha/CampanhaService.js) valida de uma a três mensagens dos tipos `texto`, `link`, `imagem`, `video` ou `audio`. Texto e link precisam de conteúdo; no formulário, as mídias precisam de `urlMidia` HTTP ou HTTPS.

Cada item é salvo no modelo `Mensagem`, com uma `posicao` correspondente à ordem do array. Todos os contatos recebem essa mesma sequência. O marcador `{{nome}}` é substituído pelo nome do destinatário no momento do envio, sem alterar o texto original da campanha.

Exemplo: com três mensagens e dez contatos, serão até 30 requisições de envio, mas o consumo do limite será de dez contatos, não 30.

### 5. Campanha: une os dados e inicia o trabalho

Depois das validações, o `FormularioCampanhaService` grava na mesma transaction a instância, quando nova, a campanha, seus destinatários, suas mensagens e a notificação de progresso. Se alguma dessas operações falhar, as gravações dessa transaction são desfeitas.

A campanha recebe um ID numérico interno e um UUID público (`idPublico`), é criada como `em_andamento` e recebe uma credencial exclusiva para o acompanhamento. O UUID identifica a campanha; o token separado autoriza a consulta dos dados protegidos.

Somente depois do commit o serviço chama `DisparadorService.agendar`. A API responde `202 Accepted` com o UUID em `campanhaId`, o estado inicial, as contagens de contatos e o saldo anterior à campanha. Essa resposta significa que o processamento foi iniciado, não que todas as mensagens já foram enviadas ou que o e-mail já chegou.

### 6. Disparo: executa a sequência e chama a Uzapi

O [DisparadorService.js](src/Modules/Disparo/DisparadorService.js) é o motor de envio; o [DisparoRepository.js](src/Modules/Disparo/DisparoRepository.js) realiza as consultas e reservas necessárias no banco.

Para cada contato, o motor revalida a campanha e o saldo, reserva o destinatário como `processando` e registra `iniciadoEm`. Depois envia suas mensagens em ordem, usando o cliente [Uzapi.js](src/shared/Integration/Uzapi.js):

```text
Contato 1: mensagem 1 -> espera -> mensagem 2 -> espera -> mensagem 3
  -> espera entre contatos
Contato 2: mensagem 1 -> espera -> mensagem 2 -> espera -> mensagem 3
```

Os intervalos são sorteados: de 5 a 10 segundos entre mensagens e de 30 a 60 segundos entre contatos. As chamadas externas e as esperas não mantêm uma transaction aberta.

O cliente monta a requisição para `UZAPI_BASE_URL/UZAPI_VERSION/phone_id/messages`, com o token daquela campanha. O trabalho roda no mesmo processo Node.js, fora da requisição HTTP original; ainda não há uma fila durável de execução.

### 7. ResultadoMensagem: registra o resultado de cada tentativa

O [ResultadoMensagemRepository.js](src/Modules/ResultadoMensagem/ResultadoMensagemRepository.js) grava um resultado para cada par destinatário/mensagem processado. O registro começa como `pendente` e passa para `sucesso` ou `falhou`, guardando os identificadores retornados pela Uzapi ou uma descrição segura do erro.

O motor também atualiza o estado agregado do contato:

| Status do contato | Significado atual |
| --- | --- |
| `pendente` | Ainda não iniciou o envio para esse contato. |
| `processando` | Está executando a sequência de mensagens. |
| `concluido` | Todas as mensagens foram aceitas pela Uzapi. |
| `parcial` | Parte das mensagens foi aceita e parte falhou. |
| `falhou` | Nenhuma mensagem teve sucesso no envio. |

**Aceitação não é entrega.** Ainda não há integração de webhook para atualizar `delivered` ou `read`. Um número sem WhatsApp pode ter uma requisição aceita; os resultados atuais não comprovam que o destinatário recebeu ou leu a mensagem.

### 8. Progresso: acompanha o processamento enquanto ele acontece

Em paralelo aos envios, o [NotificacaoCampanhaService.js](src/Modules/Campanha/NotificacaoCampanhaService.js) processa a notificação persistida em `NotificacaoCampanha` e usa o serviço de e-mail/SMTP para enviar o link de acompanhamento. Falhas de e-mail ficam registradas para novas tentativas, sem manter a requisição inicial aberta.

O link aponta para `/acompanhamento/:uuid` com um token no fragmento `#token=...`. A página troca esse token por um cookie `HttpOnly`, remove o segredo da barra de endereço e consulta `GET /acessos/:uuid/progresso`. O código do navegador agenda uma nova consulta cinco segundos após a anterior terminar: é polling, não webhook.

O [AcessoCampanhaRouter.js](src/Modules/Campanha/AcessoCampanhaRouter.js) verifica a credencial e o estado da campanha; o `CampanhaService` monta as contagens e o percentual a partir dos registros existentes. Conhecer apenas o UUID não libera esse progresso. Quem possuir o link completo poderá acessá-lo, portanto ele é confidencial.

### 9. Finalização: encerra o progresso e disponibiliza o relatório

O [CicloCampanhaService.js](src/Modules/Campanha/CicloCampanhaService.js) persiste o estado final e o horário de encerramento, remove a credencial cifrada usada nos envios e gera outra credencial exclusiva para o relatório.

O acesso ao progresso deixa de funcionar após a finalização (`410`). Uma nova notificação envia o link `/relatorio/:uuid#token=...`, que permite consultar os resultados e exportar CSV ou Excel (`.xlsx`). Os dados vêm de `GET /acessos/:uuid/relatorio`; a exportação usa a mesma proteção de acesso.

O relatório fica disponível por **24 horas após a finalização**, não após a entrega do e-mail. Se o aviso de progresso ainda não tiver sido enviado quando a campanha terminar, ele é descartado e permanece o aviso do relatório.

O estado global `concluida` não significa necessariamente sucesso de todos os contatos: no processamento normal, basta haver alguma mensagem aceita para a campanha terminar assim. Consulte os resultados individuais para identificar falhas e resultados parciais; erros de autenticação ou interrupções técnicas podem encerrar a campanha como `falhou`.

### 10. Manutenção: permite novas campanhas e limpa os dados temporários

Finalizar uma campanha não desativa automaticamente a instância nem impõe uma espera fixa de 24 horas para reutilizá-la. O usuário pode preencher outro formulário, com outra `Idempotency-Key`, se não houver campanha em andamento e ainda existir saldo. Por exemplo, 20 contatos iniciados deixam 230 disponíveis de um limite de 250, se não houver outros consumos na janela móvel.

A rotina [manutencao.js](src/shared/manutencao.js), iniciada pelo servidor, roda na inicialização e a cada 30 segundos. Ela processa notificações pendentes, encerra como `falhou` campanhas temporárias sem sinal de atividade há mais de 180 segundos e limpa campanhas expiradas. Não retoma automaticamente os envios interrompidos.

Na limpeza, são removidos os resultados, os destinatários próprios da campanha, as mensagens, as notificações e a campanha temporária. A instância temporária só é apagada quando não houver outra campanha vinculada. Cadastros administrativos antigos são preservados, e reservas que ainda contem para o limite de 24 horas não são removidas.

A expiração do acesso é verificada nas consultas, independentemente do ciclo de limpeza. A exclusão física ocorre quando a manutenção executar; se o backend estiver desligado, aguarda sua próxima execução.

### Configuração necessária para esse fluxo

Além do banco e das variáveis da Uzapi, configure `CAMPAIGN_ENCRYPTION_KEY` para proteger as credenciais, `PUBLIC_BASE_URL` para montar os links e as variáveis `SMTP_*` para enviar os e-mails, conforme [.env.example](.env.example). Fora de localhost, a URL pública deve usar HTTPS. Um link com `localhost` só funciona no computador em que o servidor está rodando.

As rotas separadas `/instancias`, `/contatos` e `/campanhas` são o fluxo administrativo/legado e exigem `ADMIN_API_TOKEN`; elas não são etapas HTTP obrigatórias do formulário. A consulta resumida por UUID descrita abaixo é uma exceção provisória. As próximas seções detalham configurações e também esse fluxo administrativo.

## Visual das páginas de progresso e relatório

Progresso e relatório usam `public/consulta.html`; o formulário usa `public/formulario.html`. Todas compartilham tema escuro, logos locais e Tailwind CSS v4 carregado por link (Play CDN/jsDelivr). Não há instalação de Tailwind nem etapa de build. `public/assets/consulta.css` contém os complementos compartilhados; `consulta.js` cuida das consultas e `formulario.js` da preparação e submissão da campanha.

O formulário permite adicionar, remover e reordenar de uma a três mensagens (texto, link, imagem, vídeo ou áudio). Para mídia, escolha **Arquivo do dispositivo** ou **URL pública**. O resumo contabiliza formatos válidos, inválidos e duplicados, mas não confirma se o destinatário tem WhatsApp. Saldo e concorrência são validados pelo backend no início.

### Upload de mídia

#### Documentos e arquivos

Selecione **Documento / arquivo** para enviar PDF, ZIP, RAR, 7Z, XLS/XLSX, DOC/DOCX, PPT/PPTX, TXT, CSV, CSS, JSON ou mídias JPG/PNG/MP3/MP4 como anexo, até **16 MiB** (limite local). A aceitação final depende da Uzapi/WhatsApp. Arquivos textuais devem estar em UTF-8. Não extraímos compactados, executamos conteúdo ou fazemos varredura antivírus; a checagem de assinatura é básica, não certifica a segurança ou integridade completa do arquivo.

No upload, o nome original é preservado. Para URL pública, preencha também o nome com extensão. A legenda é opcional e aceita `{{nome}}`. A sequência continua limitada a três mensagens, combinando texto, link, mídias e documentos.

Integração: `POST /midias/documento` recebe bytes, `Content-Type`, `X-Phone-Id`, `Authorization` e `X-File-Name` (nome codificado com `encodeURIComponent`). Use `midiaUpload` retornado na mensagem com `tipo: "documento"`. Alternativamente envie `tipo`, `urlMidia`, `nomeArquivo` e `texto` opcional no formulário JSON. O backend converte para `type: "document"` com `document.id` ou `document.link`, `filename` e `caption`.

**Atualização do banco necessária para documentos:** a migration `documentos_com_nome` adiciona `Mensagem.nomeArquivo` nullable e registra o tipo `documento`. O contrato já foi emitido; antes de iniciar a versão atual, faça backup e execute, dentro de `Backend`, `npx prisma db migrate --advance-ref db`. A migration foi gerada sem alterar o banco automaticamente.

O navegador valida e envia cada arquivo antes de criar a campanha: formulário → `POST /midias/:tipo` → upload multipart na Uzapi (`/{version}/{phone_number_id}/media`) → comprovante assinado → `POST /disparos` → mensagem com `idMidia`. Não é necessário publicar uma URL do arquivo nem criar um túnel para usar essa funcionalidade em localhost.

Limites locais: imagem JPG/PNG até 5 MiB; áudio MP3, OGG/Opus, M4A ou AAC até 16 MiB; vídeo MP4 até 16 MiB. A compatibilidade dos codecs também depende da Uzapi/WhatsApp. O backend verifica tamanho, MIME permitido e assinatura inicial do arquivo; essa verificação não é antivírus nem validação completa de codecs. Não há conversão automática de formatos.

Para integrar diretamente: envie os bytes do arquivo no corpo de `POST /midias/imagem`, `/midias/audio` ou `/midias/video`, com `Content-Type` correspondente, `Authorization: Bearer <token Uzapi>` e `X-Phone-Id`. O retorno contém `data.midiaUpload`: use esse valor na mensagem do `POST /disparos` em vez de `urlMidia`. O comprovante vale por 24 horas e está vinculado ao tipo, Phone ID e credencial utilizados; não é autorização geral de acesso à campanha. Nunca registre credenciais ou comprovantes em logs.

Os arquivos transitam em memória (máximo de dois uploads simultâneos por processo e 12 solicitações/minuto por IP), sem gravação em disco ou exposição em `public/`. Em produção, mantenha HTTPS e limite de corpo no proxy compatível com 16 MiB. O conteúdo é armazenado pelo provedor: a limpeza local da campanha apaga as referências do banco, **não garante exclusão do arquivo na Uzapi**. Uploads de formulários abandonados também ficam sujeitos à retenção do provedor.

Repetições do mesmo formulário reutilizam a chave de idempotência; para arquivos, a identidade inclui o hash dos bytes, tamanho e MIME (e nome para documentos), não o ID variável do upload. A página mantém os comprovantes apenas em memória durante tentativas de reenvio. Nenhuma nova dependência é necessária. O campo `Mensagem.idMidia` já existia; documentos exigem a migration de `nomeArquivo` descrita acima.

Ao clicar em **Iniciar campanha**, a página envia `POST /disparos`, bloqueia cliques duplicados durante a requisição e gera `Idempotency-Key` automaticamente. Repetir o mesmo payload reutiliza a chave; outra submissão com dados diferentes recebe outra chave. A sessão guarda somente a chave e o hash da solicitação, nunca token, contatos ou conteúdo. Em falha de rede, repetir sem alterar os dados permite recuperar a campanha eventualmente iniciada. Após sucesso, **Preparar outra campanha** limpa o formulário e inicia uma nova identidade de solicitação.

O token é oculto por padrão e apagado do campo após sucesso. O formulário requer HTTPS ou localhost para gerar a identidade criptográfica. A confirmação exibe UUID e estado recebido, sem inventar um link de acesso: os links seguros continuam sendo enviados por e-mail. O envio só ocorre após ação explícita do usuário, não ao carregar a página.

O navegador precisa alcançar o CDN para montar o layout completo. Conforme a [documentação do Tailwind](https://tailwindcss.com/docs/installation/play-cdn), o Play CDN destina-se ao desenvolvimento, não à produção. Antes do deploy, substituir o script por CSS compilado e servido localmente.

A CSP libera o script em `https://cdn.jsdelivr.net/npm/@tailwindcss/` e as folhas de estilo geradas em linha **somente nas páginas** `/disparador`, `/acompanhamento/:idPublico` e `/relatorio/:idPublico`. Scripts em linha, `eval` e atributos `style` continuam bloqueados; as APIs mantêm a política restrita. Ao adotar CSS compilado, remover essa exceção. O script externo executa no contexto da página, portanto essa dependência deve ser revisada antes do uso com dados reais em produção.

O rodapé inclui o site oficial, o LinkedIn da Autotic, WhatsApp `+55 21 99671-3197` e atendimento de segunda a sexta, das 09:00 às 17:00. O e-mail oficial ainda aguarda confirmação; não há endereço fictício nem link `mailto` provisório.

## Consultar o ID numérico a partir do UUID

Rota provisoriamente pública, sem Authorization e sem Body:

```http
GET /campanhas/uuid/4f03d28c-25ec-4630-bdc7-1489872754b3
```

Retorna `{ "data": { "id": 30, "idPublico": "4f03d28c-25ec-4630-bdc7-1489872754b3", "status": "concluida", "criadaEm": "...", "iniciadaEm": "...", "finalizadaEm": "...", "expiraEm": "..." } }`.
O ID 30 é apenas um exemplo. Datas podem ser nulas e seguem o formato de apresentação da API.
UUID inválido retorna 400; campanha inexistente ou já excluída retorna 404.
Não retorna nome, e-mail, contatos, mensagens, credenciais ou tokens de acesso.
O UUID é identificador, não autenticação: quem o possuir poderá consultar esse resumo enquanto o registro existir.
Limite básico de 60 consultas por minuto/IP por processo. As outras rotas `/campanhas` continuam exigindo `ADMIN_API_TOKEN`.

**OBS — integração nativa com a Uzapi:** quando houver uma identidade autenticada integrada,
criar o serviço de identidade e os middlewares de autenticação/autorização descritos nos documentos
01 e 02. Substituir esta exceção pública por validação de acesso à campanha/instância e permissões
administrativas. Não confiar em UUID, Phone ID ou e-mail como prova de identidade.

## Executar

Instale as dependências com `npm install`, configure `.env` a partir de `.env.example` e execute `npm run dev` ou `npm start`. No PowerShell com scripts bloqueados, use `npm.cmd`.

O banco precisa estar configurado conforme `prisma-next.md`. A atualização da instância exige a migration `20260912T1954_instancia_sem_username_com_email`, que remove `usuarioUzapi` e adiciona `email`. Com as dependências de desenvolvimento instaladas, execute em `Backend`: `npm run contract:emit` e `npx prisma db migrate --advance-ref db`. Faça backup antes de migrar outro ambiente. O histórico inclui uma migration intermediária que registra a evolução anterior do contrato.

```env
PORT=5000
UZAPI_BASE_URL=https://api.uzapi.com.br
UZAPI_VERSION=v1
API_TIMEZONE=America/Sao_Paulo
DAILY_CONTACT_LIMIT=250
```

Mantenha `DATABASE_URL` com a conexão do seu PostgreSQL. A versão da Uzapi é global e lida do ambiente na inicialização: para alterar, edite `UZAPI_VERSION` e reinicie o backend. Isso muda a URL utilizada, sem alterar o banco; eventuais diferenças de payload entre versões ainda precisam ser avaliadas.

## Instância e destinatário do relatório no fluxo administrativo

Esta seção descreve o cadastro separado, protegido por `ADMIN_API_TOKEN`, não a submissão única de `POST /disparos`. O cadastro não utiliza mais `usuarioUzapi`. Exemplo de `POST /instancias`:

```json
{
  "nome": "Minha instância",
  "email": "usuario@example.com",
  "idNumeroTelefone": "123456789",
  "token": "TOKEN_DA_UZAPI"
}
```

O e-mail é obrigatório e validado nos novos cadastros administrativos; não é uma credencial da Uzapi nem é enviado a ela. Instâncias diferentes podem utilizar o mesmo e-mail. As respostas dessas rotas incluem `email`, mas não incluem o token.

Instâncias antigas são preservadas com `email: null`. Para preenchê-lo, use `PATCH /instancias/:id` com `{"email":"usuario@example.com"}`. A migration não inventa endereços nem altera os estados das campanhas. Antes da remoção local de `usuarioUzapi`, os valores antigos foram salvos em `.local-backups/` (ignorado pelo Git), sem tokens.

Ao criar uma campanha, o e-mail da instância é copiado para `emailRelatorio`. Um `emailRelatorio` válido informado no cadastro da campanha tem prioridade; omitido, nulo ou vazio usa o e-mail da instância. Se ambos estiverem ausentes ou o endereço escolhido for inválido, a API responde `400`. Alterar o e-mail da instância não modifica campanhas já criadas. Campanhas antigas com `emailRelatorio: null` continuam sem envio de relatório por e-mail.

O `CampanhaRelatorioService` utiliza esse destinatário para enviar o relatório das campanhas administrativas; o envio depende da configuração SMTP. Para campanhas temporárias de `POST /disparos`, o envio dos links seguros de progresso e relatório é feito pelo `NotificacaoCampanhaService`, conforme o fluxo acima.

## Datas nas respostas da API

As datas retornadas em JSON são apresentadas no fuso `API_TIMEZONE`, cujo
padrão é `America/Sao_Paulo`. Por exemplo, `2026-09-08T12:19:02.478942Z`
é retornado como `2026-09-08T 09:19:02.478942-03:00`.
O espaço depois do `T` é um formato de exibição; para interpretar a string
com um parser ISO 8601, remova esse espaço antes da conversão.

A conversão também se aplica às datas de mensagens dentro das campanhas,
preservando a precisão e os campos nulos. Textos das mensagens não são
convertidos. O banco e os cálculos do motor continuam usando instantes UTC.
A configuração é lida ao iniciar o backend e não exige migration.

## Limite móvel de contatos

`DAILY_CONTACT_LIMIT` define o padrão de cadastro de **novas instâncias**. Instâncias existentes mantêm seu próprio `limiteDiarioContatos`, que pode ser alterado pelo endpoint já disponível:

```http
PATCH /instancias/1
Content-Type: application/json

{"limiteDiarioContatos":350}
```

O limite aceita inteiro positivo; 250/350 não são tetos fixos espalhados pelo motor. A configuração atual é consultada antes de cada contato, inclusive durante campanhas em execução.

- O consumo soma contatos iniciados por aquela instância nas últimas 24 horas, em todas as suas campanhas.
- Um contato com três mensagens consome uma unidade. Falhas também consomem uma unidade.
- O horário `CampanhaContato.iniciadoEm` registra a reserva, antes da chamada à Uzapi. Não é zerado à meia-noite.
- O mesmo telefone processado em outra campanha representa outro processamento e consome novamente.
- No início, a campanha inteira precisa caber no saldo disponível; caso contrário, a API responde `429`. No formulário, a transaction é desfeita e nenhuma nova campanha é criada; no início administrativo, o rascunho existente é preservado.
- Se o limite for reduzido durante a execução, o próximo contato aguarda disponibilidade. A consulta é repetida a cada 30 segundos e considera novos aumentos do limite. A campanha permanece `em_andamento` e os contatos aguardando permanecem `pendente`.

## Início e concorrência

No fluxo principal, `POST /disparos` cadastra e inicia a campanha em uma única solicitação. Para uma campanha em rascunho criada pelo fluxo administrativo, use a rota abaixo com a autorização administrativa:

```http
POST /campanhas/1/iniciar
```

Retorna `202 Accepted` após validar e persistir o início:

```json
{
  "message": "Campanha iniciada. O processamento continuará em segundo plano.",
  "data": {"campanhaId": 1, "status": "em_andamento"}
}
```

A resposta não contém mais o resultado final dos envios. Consulte `GET /campanhas/:id` para o status, `GET /campanhas/:id/progresso` para contagens e percentual, e `GET /campanhas/:id/relatorio` para o detalhamento dos resultados.

O motor funciona no mesmo processo Node.js, independente da duração da requisição HTTP. Entre mensagens do mesmo contato espera de 5 a 10 segundos; entre contatos, de 30 a 60 segundos. Cada intervalo é sorteado novamente, sem espera após o último item.

Uma instância executa uma campanha por vez. Instâncias diferentes podem executar campanhas simultaneamente. Um segundo início para a mesma campanha, ou para outra campanha de uma instância ocupada, retorna `409`.

Transactions curtas bloqueiam a linha da instância no PostgreSQL e realizam a verificação/reserva de forma serializada. O bloqueio é obtido por um UPDATE do próprio ID, sem alteração dos dados. As chamadas à Uzapi e as esperas acontecem **fora** da transaction. As atualizações condicionais de estado preservam a condição no UPDATE emitido pelo Prisma.

A execução em segundo plano ainda não é uma fila durável: reiniciar o Node.js interrompe os trabalhos. Campanhas temporárias sem sinal de atividade há mais de 180 segundos são encerradas como `falhou` pela manutenção. Campanhas antigas/administrativas não entram nessa recuperação e podem permanecer em andamento. Não há retomada automática nem endpoint de pausa/cancelamento; não altere o status manualmente para rascunho para reenviar, pois isso pode repetir mensagens já aceitas.

## Cadastro atômico

No fluxo administrativo, a criação de campanha, a criação/reutilização dos contatos globais, os vínculos e as mensagens ocorrem na mesma transaction Prisma. Uma falha desfaz todas essas gravações. Contatos existentes são reutilizados por telefone sem alterar o nome já cadastrado.

No formulário `POST /disparos`, a transaction também abrange a criação/reutilização da instância e a notificação de progresso. Os destinatários são próprios da campanha, sem reutilização do cadastro global de contatos.

## Uzapi e diagnóstico

A documentação Swagger consultada em 12/09/2026 especifica `Authorization: Bearer <token>` e a rota `POST /{version}/{phone_number_id}/messages`, sem username. O cliente normaliza espaços externos e um prefixo Bearer informado no cadastro, evitando duplicá-lo. Tokens vazios ou com espaços internos são rejeitados localmente.

O erro remoto `401 / Access Token não informado` é originado na Uzapi. A resposta antiga `Campanha processada` era montada pelo disparador. O Swagger também lista `GET /{version}/{phone_number_id}/instance`; a integração dessa consulta como validação prévia ainda não foi adicionada. Por enquanto, o cadastro valida os campos e a autorização remota é verificada no envio.

Um `401` ou `403` durante o envio encerra a campanha como `falhou`, registra a falha atual e mantém os próximos contatos pendentes. Outras falhas de envio são registradas e o processamento continua. Não há retry automático. Sucesso significa que a requisição foi aceita pela Uzapi, não confirmação de entrega ao WhatsApp.

Logs guardam evento, identificador de erro e IDs internos, além de status HTTP/diagnóstico seguro quando disponível. Não guardam telefone, texto da mensagem, token, headers, conexão do banco ou corpo bruto da resposta remota. Erros internos retornam uma mensagem genérica e `errorId` para correlação.

Se a Uzapi aceitar uma mensagem e a gravação do sucesso falhar, o motor não registra falsamente uma recusa da Uzapi. A campanha falha e o resultado pendente fica disponível para futura reconciliação, sem reenvio automático.

Referência: https://api.uzapi.com.br/swagger

## Próximas etapas acordadas

- Integrar identidade e autorização nativas com a Uzapi, incluindo a proteção definitiva da consulta resumida por UUID. Os links temporários já usam credenciais próprias de acesso.
- Definir e implementar a integração de eventos para confirmar entrega/leitura; aceitação da requisição ainda não comprova entrega.
- Evoluir a experiência do formulário HTML/JavaScript e das páginas de progresso/relatório já existentes; Vue não é necessário para o fluxo atual.
- Ampliar a cobertura automatizada. Já existem testes em `tests/fluxo.test.js` e `tests/integration.test.js`.
- Projetar retomada/reconciliação segura após interrupções e ações de pausa/continuação/cancelamento. A manutenção atual encerra campanhas temporárias abandonadas, mas não reenvia mensagens.

As verificações pontuais destes ajustes usaram simulações locais e transactions PostgreSQL com rollback, sem envios reais à Uzapi.
