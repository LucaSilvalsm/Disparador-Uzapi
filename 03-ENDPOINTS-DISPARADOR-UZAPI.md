# Endpoints do Disparador Uzapi

Documentação do backend existente, conferida em 22/09/2026 nos routers, controllers e services. Os exemplos usam dados fictícios e não devem ser enviados a destinatários reais sem autorização. Este documento descreve nossa aplicação, não a lista de endpoints da API externa da Uzapi.

## 1. Convenções e preparação

- Base local: `http://localhost:5000` (ou a porta configurada em `PORT`). Não existe prefixo `/api` atualmente.
- No Postman, crie `base_url` com esse endereço e use `{{base_url}}` nos exemplos.
- Para JSON: **Body → raw → JSON** e `Content-Type: application/json`. Limite do corpo: 256 KiB.
- Para arquivos: **Body → binary**, selecionando o arquivo. Não use JSON, base64 nem form-data em `/midias`.
- Nas operações indicadas como **sem body**, deixe o corpo vazio; não é necessário enviar `{}`.
- `:id` é o ID inteiro positivo do banco. `:uuid` e `:idPublico` são o UUID público da campanha, não seu ID numérico.
- As respostas JSON de sucesso normalmente usam `{ "data": ... }`, às vezes acompanhadas de `message`. Listagens retornam arrays em `data` e não têm paginação implementada.
- Datas do banco são apresentadas no fuso `API_TIMEZONE` (padrão `America/Sao_Paulo`), por exemplo `2026-09-22T 09:00:00-03:00`. O espaço após `T` é intencional; não assuma que todo parser ISO aceitará essa apresentação. `expiraEm` do comprovante de upload é diferente: número de milissegundos Unix.
- Para documentos, o banco deve estar atualizado com a migration `20260922T1517_documentos_com_nome`. Consulte `Backend/README.md` antes de testar.

### Credenciais: não confundir os três tipos

| Contexto | Onde informar | Qual credencial |
|---|---|---|
| Rotas administrativas | `Authorization: Bearer {{admin_token}}` | Valor de `ADMIN_API_TOKEN` do servidor |
| Upload `/midias/:tipo` | `Authorization: Bearer {{uzapi_token}}` | Token da instância na Uzapi |
| Formulário `/disparos` | `instancia.token` no JSON | Token da instância na Uzapi |
| Progresso/relatório `/acessos` | `Authorization: Bearer {{token_acesso}}` ou cookie de sessão nos GETs | Token exclusivo do link recebido por e-mail |

O token administrativo deve ter 32–128 caracteres alfanuméricos, `_` ou `-`. Sem configuração administrativa válida, as rotas protegidas retornam `503`; com credencial ausente/incorreta, `401`. Nunca coloque o token administrativo no frontend público.

O UUID sozinho **não autoriza** progresso, relatório ou exportação. A consulta resumida por UUID é uma exceção pública provisória descrita abaixo. Não publique tokens, comprovantes de upload ou links completos de acesso em logs e capturas de tela.

## 2. Inventário por módulo

| Módulo | Método | Endpoint | Acesso |
|---|---|---|---|
| Formulário/disparo | POST | `/disparos` | Público; credencial Uzapi no body |
| Mídia | POST | `/midias/:tipo` | Token Uzapi |
| Instância | POST | `/instancias` | Admin |
| Instância | GET | `/instancias` | Admin |
| Instância | GET | `/instancias/:id` | Admin |
| Instância | PATCH | `/instancias/:id` | Admin |
| Instância | PATCH | `/instancias/:id/ativar` | Admin |
| Instância | PATCH | `/instancias/:id/desativar` | Admin |
| Instância | DELETE | `/instancias/:id` | Admin |
| Contato | POST | `/contatos/validar-lista` | Admin |
| Contato | GET | `/contatos` | Admin; implementação incompleta |
| Campanha | POST | `/campanhas` | Admin |
| Campanha | GET | `/campanhas` | Admin |
| Campanha | GET | `/campanhas/uuid/:uuid` | Público, provisoriamente |
| Campanha | GET | `/campanhas/:id` | Admin |
| Campanha | POST | `/campanhas/:id/iniciar` | Admin |
| Campanha | GET | `/campanhas/:id/progresso` | Admin |
| Campanha | GET | `/campanhas/:id/relatorio` | Admin |
| Acesso seguro | POST | `/acessos/:idPublico/:tipo/sessao` | Token do link; tipo `progresso` ou `relatorio` |
| Acesso seguro | GET | `/acessos/:idPublico/progresso` | Token/cookie de progresso |
| Acesso seguro | GET | `/acessos/:idPublico/relatorio` | Token/cookie de relatório |
| Exportação | GET | `/acessos/:idPublico/relatorio/exportar` | Token/cookie de relatório |
| Página | GET | `/` | Público; redireciona |
| Página | GET | `/disparador` | Público; HTML |
| Página | GET | `/acompanhamento/:idPublico` | HTML público; dados protegidos via `/acessos` |
| Página | GET | `/relatorio/:idPublico` | HTML público; dados protegidos via `/acessos` |
| Arquivos estáticos | GET | `/assets/*` | Público; arquivos existentes em `public/assets` |

## 3. Formulário e disparo integrado

### POST `/disparos` — criar e iniciar campanha

Fluxo recomendado para o formulário público. Reúne instância, contatos e mensagens; não é necessário cadastrar cada módulo previamente. **Uma requisição válida já inicia os envios em segundo plano.**

URL: `{{base_url}}/disparos`

Headers:

```http
Content-Type: application/json
Idempotency-Key: teste-campanha-000001
```

Request body com três mensagens:

```json
{
  "nome": "Campanha de demonstração",
  "instancia": {
    "idNumeroTelefone": "123456789012345",
    "token": "SUBSTITUA_PELO_TOKEN_UZAPI",
    "email": "usuario@example.com"
  },
  "lista": "5511999990001,Ana\n5511999990002,Bruno",
  "mensagens": [
    { "tipo": "texto", "texto": "Olá {{nome}}, tudo bem?" },
    { "tipo": "imagem", "texto": "Veja nossa novidade", "urlMidia": "https://example.com/imagem.jpg" },
    { "tipo": "documento", "texto": "Confira os detalhes", "urlMidia": "https://example.com/proposta.pdf", "nomeArquivo": "proposta.pdf" }
  ]
}
```

Regras principais:

- Nome obrigatório, até 200 caracteres; e-mail válido obrigatório.
- Phone ID de 1–128 caracteres alfanuméricos, `_` ou `-`; mantenha-o como string para preservar zeros iniciais. Não envie `username` ou versão da Uzapi no body.
- Lista textual com uma linha por contato, `telefone,nome`. O nome é opcional. Números brasileiros são normalizados com `55`; formatos inválidos e duplicados são descartados. Devem sobrar pelo menos dois números válidos e distintos. Isso não verifica existência no WhatsApp.
- De uma a três mensagens, na ordem do array. Texto de mensagem até 20.000 caracteres nesta validação local; o provedor pode impor limites menores. `{{nome}}` é substituído por contato.
- Mídia por URL exige HTTP/HTTPS sem usuário/senha na URL, até 4.000 caracteres; use um link direto acessível ao provedor.
- Para arquivo enviado antes por `/midias`, use `midiaUpload` em vez de `urlMidia`. O endpoint público não aceita um `idMidia` arbitrário como substituto do comprovante.
- A chave de idempotência deve conter 16–128 caracteres alfanuméricos, `_` ou `-`. Ela vai no **header**, não no JSON. Repita a mesma chave apenas para repetir a mesma solicitação; para uma nova campanha, gere uma nova chave.
- Mesmo Phone ID pode ser reutilizado com saldo disponível e sem outra campanha em andamento. Instância desativada administrativamente bloqueia o disparo.
- Saldo é controlado em janela móvel de 24 horas, por instância; padrão de 250 contatos, configurável. Não é um bloqueio fixo de 24 horas a cada campanha.

Resposta inicial: `202 Accepted`.

```json
{
  "message": "Campanha iniciada. O link de acompanhamento será enviado por e-mail.",
  "data": {
    "campanhaId": "00000000-0000-4000-8000-000000000001",
    "status": "em_andamento",
    "notificacao": "pendente",
    "contatos": { "validos": 2, "invalidos": 0 },
    "saldoAntesDaCampanha": 250
  }
}
```

Repetição idêntica: `200 OK`, sem iniciar outra campanha.

```json
{
  "message": "Solicitação já recebida.",
  "data": {
    "campanhaId": "00000000-0000-4000-8000-000000000001",
    "status": "em_andamento",
    "repetida": true
  }
}
```

Erros importantes: `400` dados/chave inválidos; `409` chave usada com outros dados, instância desativada ou campanha concorrente; `410` comprovante de upload expirado; `429` saldo insuficiente ou limite de requisições. Receber `202` não confirma entrega de mensagens nem envio imediato do e-mail.

### Tipos de mensagem — exemplos para o array `mensagens`

Os objetos abaixo são alternativas individuais. Não envie todos juntos: o limite continua sendo três.

Texto:

```json
{ "tipo": "texto", "texto": "Olá {{nome}}!" }
```

Link com prévia (enviado à Uzapi como texto):

```json
{ "tipo": "link", "texto": "Conheça nosso site: https://example.com" }
```

Imagem, vídeo e áudio por URL:

```json
{ "tipo": "imagem", "texto": "Legenda opcional", "urlMidia": "https://example.com/foto.png" }
```

```json
{ "tipo": "video", "texto": "Legenda opcional", "urlMidia": "https://example.com/video.mp4" }
```

```json
{ "tipo": "audio", "urlMidia": "https://example.com/audio.mp3" }
```

Documento por URL (nome com extensão obrigatório):

```json
{ "tipo": "documento", "texto": "Sua planilha", "urlMidia": "https://example.com/planilha.xlsx", "nomeArquivo": "planilha.xlsx" }
```

Arquivo enviado por upload (mesmo formato para imagem, vídeo ou áudio, trocando `tipo` e o comprovante correspondente):

```json
{ "tipo": "documento", "texto": "Olá {{nome}}, segue o arquivo", "midiaUpload": "COLE_DATA_MIDIAUPLOAD_DO_UPLOAD" }
```

No documento por upload, o nome é extraído do comprovante assinado. Não misture `urlMidia` e `midiaUpload`. Áudio não utiliza legenda. Mensagens não possuem endpoint de cadastro isolado: são cadastradas junto da campanha.

## 4. Módulo Mídia

### POST `/midias/:tipo` — upload de um arquivo

Valores de `tipo`: `imagem`, `audio`, `video`, `documento`. O upload não cria campanha nem envia mensagens a contatos. O backend encaminha o arquivo à Uzapi e devolve um comprovante para o formulário.

Exemplo de imagem:

```http
POST {{base_url}}/midias/imagem
Authorization: Bearer {{uzapi_token}}
X-Phone-Id: 123456789012345
Content-Type: image/png
```

**Request body:** bytes do arquivo `imagem.png`. No Postman, selecione **Body → binary → Select File**. Não preencha manualmente `Content-Length`.

Exemplo de documento:

```http
POST {{base_url}}/midias/documento
Authorization: Bearer {{uzapi_token}}
X-Phone-Id: 123456789012345
X-File-Name: Proposta%20ver%C3%A3o.pdf
Content-Type: application/pdf
```

**Request body:** bytes do PDF. `X-File-Name` é obrigatório para documentos, codificado como `encodeURIComponent(nome)`. Nome de até 150 caracteres, sem separadores de caminho ou caracteres de controle, com extensão permitida. Envie sem compressão HTTP; isso não impede o upload de um arquivo ZIP.

| Tipo | Extensões aceitas no formulário | MIME principal | Limite local |
|---|---|---|---|
| imagem | jpg, jpeg, png | `image/jpeg`, `image/png` | 5 MiB |
| audio | mp3, ogg, opus, m4a, aac | `audio/mpeg`, `audio/ogg`, `audio/mp4`, `audio/aac` | 16 MiB |
| video | mp4 | `video/mp4` | 16 MiB |
| documento | pdf, zip, rar, 7z, xls, xlsx, doc, docx, ppt, pptx, txt, csv, css, json, jpg, jpeg, png, mp3, mp4 | Conforme tabela abaixo | 16 MiB |

MIMEs de documentos:

| Extensão | Content-Type |
|---|---|
| pdf | `application/pdf` |
| zip | `application/zip` |
| rar | `application/vnd.rar` |
| 7z | `application/x-7z-compressed` |
| xls | `application/vnd.ms-excel` |
| xlsx | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| doc | `application/msword` |
| docx | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| ppt | `application/vnd.ms-powerpoint` |
| pptx | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| txt | `text/plain` |
| csv | `text/csv` |
| css | `text/css` |
| json | `application/json` |
| jpg/jpeg, png, mp3, mp4 | Mesmo MIME da mídia correspondente |

Arquivos textuais devem estar em UTF-8. O backend valida tamanho, MIME, extensão para documentos e assinatura básica do conteúdo. Não há antivírus, extração de compactados ou conversão de codecs. A aceitação final depende do provedor. Em `/midias/documento`, até um arquivo JSON é enviado como bytes, não como objeto de configuração da campanha.

Resposta `201 Created` — exemplo ilustrativo; comprovante, hash e prazo variam:

```json
{
  "data": {
    "midiaUpload": "COMPROVANTE_ASSINADO_RETORNADO_PELO_SERVIDOR",
    "expiraEm": 1790164800000,
    "arquivo": {
      "sha256": "HASH_SHA256_DOS_BYTES",
      "tamanho": 1024,
      "mime": "application/pdf",
      "nome": "Proposta verão.pdf"
    }
  }
}
```

`arquivo.nome` aparece para documentos. `expiraEm` é um número Unix em milissegundos. O comprovante dura 24 horas e só pode ser usado com o mesmo Phone ID, token e tipo de mídia. Não confunda esse prazo com o prazo de acesso ao relatório.

Erros: `400` arquivo vazio, nome/Phone ID inválido ou upload interrompido; `401` sem credencial; `413` arquivo grande; `415` formato/conteúdo incompatível; `429` limite de upload; também podem ocorrer recusas da Uzapi e falhas de conexão.

Os bytes transitam em memória, sem URL pública local e sem arquivo salvo em `public/`. A limpeza da campanha remove referências locais, não garante exclusão na Uzapi. Formulários abandonados podem deixar mídias no provedor. No máximo dois uploads simultâneos por processo.

## 5. Módulo Instância — administrativo

Todas as rotas desta seção exigem:

```http
Authorization: Bearer {{admin_token}}
```

O cadastro administrativo é diferente do formulário público: `POST /instancias` rejeita Phone ID já cadastrado, enquanto `/disparos` reutiliza a instância conforme as regras de saldo e concorrência.

### POST `/instancias` — cadastrar

URL: `{{base_url}}/instancias`. Adicione `Content-Type: application/json`.

```json
{
  "nome": "Instância de demonstração",
  "email": "usuario@example.com",
  "idNumeroTelefone": "123456789012345",
  "token": "SUBSTITUA_PELO_TOKEN_UZAPI",
  "limiteDiarioContatos": 250
}
```

Nome, e-mail, Phone ID e token são obrigatórios. `limiteDiarioContatos` é opcional; usa `DAILY_CONTACT_LIMIT` (padrão 250). Se informado, deve ser inteiro positivo, até 2147483647. Não há chamada de validação remota da instância nesta etapa.

Retorna `201`, `message` e `data` com `id`, `nome`, `email`, `idNumeroTelefone`, `ativo` e `limiteDiarioContatos`. O token não é retornado. Phone ID duplicado: `409`.

### GET `/instancias` — listar

Exemplo: `{{base_url}}/instancias`. **Sem body.**

Retorna `200`, com array em `data`, ordenado por nome, incluindo instâncias ativas e inativas. Mesmos campos públicos do cadastro; não retorna tokens.

### GET `/instancias/:id` — consultar

Exemplo: `{{base_url}}/instancias/8`. **Sem body.**

Retorna `200` e o objeto em `data`; `400` para ID inválido; `404` se não encontrado.

### PATCH `/instancias/:id` — atualizar parcialmente

Exemplo: `{{base_url}}/instancias/8`. Adicione `Content-Type: application/json`.

```json
{
  "nome": "Instância atualizada",
  "email": "relatorios@example.com",
  "limiteDiarioContatos": 500,
  "ativo": true
}
```

Campos aceitos: `nome`, `email`, `idNumeroTelefone`, `token`, `limiteDiarioContatos`, `ativo`. Envie apenas os que deseja alterar. Exemplo de rotação de credencial:

```json
{ "token": "NOVO_TOKEN_UZAPI" }
```

Retorna `200`, mensagem de atualização e objeto público em `data`. Phone ID pertencente a outra instância: `409`.

### PATCH `/instancias/:id/ativar` — ativar

Exemplo: `{{base_url}}/instancias/8/ativar`. **Sem body.**

Define `ativo: true`. Retorna `200`, `message` e instância em `data`.

### PATCH `/instancias/:id/desativar` — desativar

Exemplo: `{{base_url}}/instancias/8/desativar`. **Sem body.**

Define `ativo: false`. Retorna `200`, `message` e instância em `data`. Não exclui campanhas, não libera o Phone ID para novo cadastro administrativo e não é um endpoint específico de cancelamento de campanha.

### DELETE `/instancias/:id` — excluir

Exemplo: `{{base_url}}/instancias/8`. **Sem body.**

Executa exclusão da instância. Retorna `200` com `message`, sem `data`, quando possível. **Não faz exclusão em cascata das campanhas.** Referências existentes podem impedir a operação por restrição do banco; não há tratamento dedicado desse conflito no service atual, portanto não conte com uma resposta `409` específica. Não use esta rota para limpar uma campanha em andamento.

## 6. Módulo Contato — administrativo

Use `Authorization: Bearer {{admin_token}}` em ambas as rotas.

### POST `/contatos/validar-lista` — validar sem disparar

URL: `{{base_url}}/contatos/validar-lista`. `Content-Type: application/json`.

```json
{ "lista": "5511999990001,Ana\n5511999990002,Bruno\n5511999990001,Duplicado\nabc,Inválido" }
```

Retorna `200`:

```json
{
  "message": "Lista processada com sucesso.",
  "data": {
    "quantidadeTotal": 4,
    "quantidadeValidos": 2,
    "quantidadeInvalidos": 2,
    "validos": [
      { "telefone": "5511999990001", "nome": "Ana" },
      { "telefone": "5511999990002", "nome": "Bruno" }
    ],
    "invalidos": [
      { "linha": 3, "conteudo": "5511999990001,Duplicado", "erro": "Telefone duplicado na lista." },
      { "linha": 4, "conteudo": "abc,Inválido", "erro": "Telefone inválido." }
    ]
  }
}
```

Não persiste contatos nem confirma existência no WhatsApp. Lista ausente ou menos de dois contatos válidos distintos: `400`.

### GET `/contatos` — rota registrada, ainda incompleta

URL: `{{base_url}}/contatos`. **Sem body.**

**Pendência identificada no código:** o controller chama `contatoService.listar()`, mas esse método não está implementado no service atual. Com autenticação válida, a rota tende a retornar `500`. Não trate esta listagem como funcional até essa implementação ser corrigida. Este documento apenas registra a situação; não altera código de execução.

## 7. Módulo Campanha — fluxo administrativo/legado

Exceto a consulta por UUID, todas as rotas abaixo usam `Authorization: Bearer {{admin_token}}`. Nesse fluxo, cadastro e início são separados. Para campanhas temporárias com links seguros e limpeza automática, prefira `POST /disparos`.

### POST `/campanhas` — cadastrar sem iniciar

URL: `{{base_url}}/campanhas`. `Content-Type: application/json`.

```json
{
  "instanciaId": 8,
  "nome": "Campanha administrativa",
  "emailRelatorio": "usuario@example.com",
  "lista": "5511999990001,Ana\n5511999990002,Bruno",
  "mensagens": [
    { "tipo": "texto", "texto": "Olá {{nome}}!" },
    { "tipo": "documento", "texto": "Segue a proposta", "urlMidia": "https://example.com/proposta.pdf", "nomeArquivo": "proposta.pdf" }
  ]
}
```

A instância precisa existir e estar ativa. `emailRelatorio` omitido, nulo ou vazio utiliza o e-mail da instância; o resultado precisa ser válido. Pelo menos dois contatos e uma a três mensagens. A posição é definida pela ordem do array, não por um campo `posicao` recebido.

Neste fluxo administrativo, mídias podem usar `urlMidia` ou `idMidia` conhecido da Uzapi. O campo `midiaUpload` pertence ao fluxo público `/disparos`; não é convertido por este cadastro. Para documento, informe `nomeArquivo` também ao usar ID:

```json
{ "tipo": "documento", "idMidia": "ID_REAL_DA_MIDIA", "nomeArquivo": "proposta.pdf", "texto": "Legenda opcional" }
```

Resposta `201`, com `message` e `data` contendo `id` numérico, `nome`, `instanciaId`, `status`, `emailRelatorio`, contagem de contatos e `quantidadeMensagens`. A criação usa transação e não inicia o envio.

### GET `/campanhas` — listar

URL: `{{base_url}}/campanhas`. **Sem body.**

Retorna `200` e array em `data`, ordenado por ID decrescente, com `id`, `instanciaId`, `nome`, `emailRelatorio`, `status`, `iniciadaEm` e `finalizadaEm`.

### GET `/campanhas/uuid/:uuid` — localizar ID interno pelo UUID

Exemplo: `{{base_url}}/campanhas/uuid/00000000-0000-4000-8000-000000000001`.

**Público provisoriamente; sem Authorization e sem body.** Retorna `200` com `data` contendo `id` numérico, `idPublico`, `status`, `criadaEm`, `iniciadaEm`, `finalizadaEm` e `expiraEm`. Não inclui contatos, conteúdo das mensagens ou credenciais. UUID malformado: `400`; inexistente: `404`.

OBS: restringir esta rota quando houver autenticação/autorização nativa integrada à Uzapi. O UUID não deve ser considerado senha.

### GET `/campanhas/:id` — detalhes

Exemplo: `{{base_url}}/campanhas/28`. **Sem body.**

Retorna `200` e `data` com `id`, `instanciaId`, `nome`, `emailRelatorio`, `status`, datas, `quantidadeContatos` e array `mensagens`. Os registros de mensagem incluem o tipo, posição e campos armazenados, como texto, URL, ID de mídia e nome do arquivo quando presentes.

### POST `/campanhas/:id/iniciar` — iniciar campanha cadastrada

Exemplo: `{{base_url}}/campanhas/28/iniciar`. **Sem body.**

```json
{
  "message": "Campanha iniciada. O processamento continuará em segundo plano.",
  "data": { "campanhaId": 28, "status": "em_andamento" }
}
```

Resposta `202`. O serviço verifica estado, instância, mensagens, contatos pendentes, concorrência e saldo. Não envie `Idempotency-Key` esperando o comportamento de `/disparos`: esse mecanismo pertence ao formulário integrado.

### GET `/campanhas/:id/progresso` — progresso administrativo

Exemplo: `{{base_url}}/campanhas/28/progresso`. **Sem body.** Resposta `200`:

```json
{
  "data": {
    "campanhaId": 28,
    "nome": "Campanha administrativa",
    "status": "em_andamento",
    "contatos": { "total": 2, "pendentes": 1, "processando": 0, "concluidos": 1, "parciais": 0, "falhos": 0, "processados": 1, "restantes": 1 },
    "mensagens": { "pendentes": 2, "sucesso": 2, "falhou": 0, "total": 4 },
    "progresso": 50,
    "iniciadaEm": "2026-09-22T 09:00:00-03:00",
    "finalizadaEm": null
  }
}
```

`progresso` é a porcentagem arredondada de contatos processados, não a porcentagem de mensagens entregues.

### GET `/campanhas/:id/relatorio` — relatório administrativo

Exemplo: `{{base_url}}/campanhas/28/relatorio`. **Sem body.**

Retorna `200`, com `data` contendo `campanhaId` numérico, `nome`, `status`, `iniciadaEm`, `finalizadaEm`, `totalContatos`, `quantidadeMensagens` e `contatos`. Cada contato contém `id`, `nome`, `telefone`, `status`, `iniciadoEm`, `finalizadoEm` e `mensagens`.

Exemplo de um item do array `contatos[].mensagens` (não é um body para enviar):

```json
{
  "mensagemId": 42,
  "posicao": 1,
  "tipo": "documento",
  "status": "sucesso",
  "idFila": "ID_RETORNADO_DA_FILA",
  "idMensagem": "ID_RETORNADO_DA_MENSAGEM",
  "erro": null,
  "enviadaEm": "2026-09-22T 09:01:00-03:00"
}
```

As consultas administrativas não usam os tokens temporários dos links de e-mail. O relatório pode refletir uma campanha ainda incompleta; para o público, a disponibilidade é controlada por `/acessos`.

## 8. Acesso seguro, progresso e relatório público

Estas rotas atendem campanhas temporárias. Use o UUID retornado por `/disparos` e **o token correspondente ao tipo de link recebido por e-mail**. O token de progresso é diferente do token de relatório.

### POST `/acessos/:idPublico/:tipo/sessao` — trocar token por cookie

Exemplos:

```http
POST {{base_url}}/acessos/00000000-0000-4000-8000-000000000001/progresso/sessao
Authorization: Bearer {{token_progresso}}
```

```http
POST {{base_url}}/acessos/00000000-0000-4000-8000-000000000001/relatorio/sessao
Authorization: Bearer {{token_relatorio}}
```

**Sem body.** Retorna `204 No Content`, sem JSON, com `Set-Cookie: acesso_campanha=...`. Cookie `HttpOnly`, `SameSite=Strict`, restrito ao caminho da campanha/tipo; `Secure` quando `PUBLIC_BASE_URL` usa HTTPS. A sessão exige Bearer; não aceita somente cookie nesse POST.

O navegador faz essa troca automaticamente ao abrir o link do e-mail. Nos GETs seguintes, pode usar o cookie; no Postman também é possível passar o Bearer diretamente sem criar sessão.

### GET `/acessos/:idPublico/progresso` — consultar acompanhamento

```http
GET {{base_url}}/acessos/00000000-0000-4000-8000-000000000001/progresso
Authorization: Bearer {{token_progresso}}
```

**Sem body.** Retorna `200`, com a estrutura de progresso da seção anterior, mas `data.campanhaId` é o **UUID**. A página consulta aproximadamente a cada cinco segundos. Só funciona enquanto a campanha temporária está `em_andamento`.

### GET `/acessos/:idPublico/relatorio` — consultar relatório final

```http
GET {{base_url}}/acessos/00000000-0000-4000-8000-000000000001/relatorio
Authorization: Bearer {{token_relatorio}}
```

**Sem body.** Retorna `200`, com a estrutura do relatório administrativo, substituindo `campanhaId` pelo UUID e acrescentando `expiraEm`. Requer estado final e prazo válido; disponível por 24 horas após a finalização, conforme o ciclo das campanhas temporárias.

Erros das rotas de acesso: `404` para acesso inexistente/inválido, token ausente/incorreto ou campanha não temporária; `410` quando o acompanhamento terminou ou o relatório expirou/está indisponível. Após a limpeza do registro, o retorno pode passar a `404`.

### GET `/acessos/:idPublico/relatorio/exportar` — baixar CSV ou Excel

```http
GET {{base_url}}/acessos/00000000-0000-4000-8000-000000000001/relatorio/exportar?formato=csv
Authorization: Bearer {{token_relatorio}}
```

```http
GET {{base_url}}/acessos/00000000-0000-4000-8000-000000000001/relatorio/exportar?formato=xlsx
Authorization: Bearer {{token_relatorio}}
```

**Sem body.** `formato` é opcional e assume `csv`. Somente `csv` e `xlsx` são aceitos; `xls` retorna `400`. Resposta `200` é um **arquivo**, não `{data: ...}`, com `Content-Disposition: attachment`. No Postman, salve a resposta como arquivo. Aplicam-se as mesmas credenciais e expiração do relatório.

## 9. Páginas HTML e arquivos estáticos

Todas as requisições abaixo são GET, sem body:

| Endpoint | Resultado |
|---|---|
| `/` | `302`, redireciona para `/disparador` |
| `/disparador` | `200`, formulário HTML |
| `/acompanhamento/:idPublico` | `200`, página HTML de acompanhamento |
| `/relatorio/:idPublico` | `200`, página HTML de relatório |
| `/assets/*` | Arquivo estático existente, por exemplo `/assets/formulario.js`; recurso ausente retorna `404` |

Formato dos links de e-mail:

```text
http://localhost:5000/acompanhamento/00000000-0000-4000-8000-000000000001#token=TOKEN_DE_PROGRESSO
http://localhost:5000/relatorio/00000000-0000-4000-8000-000000000001#token=TOKEN_DE_RELATORIO
```

O fragmento `#token=...` é lido pelo JavaScript e não é enviado ao servidor na requisição da página. A página cria sessão via `/acessos/.../sessao` e remove o token da barra de endereço. Abrir o HTML sem token/sessão não libera os dados da campanha. Não troque o fragmento por `?token=...` nas chamadas da API: autenticação por query string não foi implementada.

## 10. Erros, limites e estados

Formato comum do middleware de erros:

```json
{
  "message": "Descrição segura do erro.",
  "errorId": "00000000-0000-4000-8000-000000000002"
}
```

Use `errorId` para correlacionar com os logs. Erros `5xx` tratados pelo middleware têm mensagem genérica. Rota não registrada retorna `404` com `{ "message": "Rota não encontrada." }`, sem `errorId`.

| Status HTTP | Uso principal |
|---|---|
| 200 | Consulta, alteração ou repetição idempotente |
| 201 | Instância, campanha administrativa ou upload criado |
| 202 | Campanha aceita para execução em segundo plano |
| 204 | Sessão criada, sem corpo |
| 400 | Dados, parâmetros ou formato de exportação inválidos |
| 401/403 | Credencial ausente/recusada ou recusa do provedor, conforme endpoint |
| 404 | Registro/acesso inexistente ou rota não encontrada |
| 409 | Duplicidade, chave conflitante ou concorrência/estado incompatível |
| 410 | Comprovante/acesso expirado ou acompanhamento encerrado |
| 413 | Corpo ou arquivo acima do limite |
| 415 | Tipo de arquivo, assinatura ou codificação HTTP não permitidos |
| 429 | Limite de requisições, uploads simultâneos ou saldo insuficiente |
| 500/502/503 | Falha interna, comunicação externa ou configuração indisponível |

Limites de requisições por IP, em memória e por processo:

| Grupo | Limite por minuto |
|---|---|
| `POST /disparos` | 10 |
| `POST /midias/:tipo` | 12 (compartilhado entre tipos) |
| `GET /campanhas/uuid/:uuid` | 60 |
| `/acessos/*` | 180 (compartilhado) |
| Exportação | 10 adicionais, além do limite de `/acessos` |

Respeite `Retry-After` quando presente. Esses limites não substituem proteção no proxy em produção.

Estados:

- Campanha: o contrato admite `rascunho`, `em_andamento`, `pausada`, `concluida`, `cancelada`, `falhou`. Isso não significa que existam endpoints para todas essas transições.
- Contato: `pendente`, `processando`, `concluido`, `parcial`, `falhou`.
- Resultado de mensagem: `pendente`, `sucesso`, `falhou`.
- `sucesso` significa aceitação do envio pela Uzapi, **não comprovação de entrega ou leitura**. `concluido` indica que todas as mensagens do contato foram aceitas.

## 11. Fluxo recomendado de teste

1. Configure banco, migrations, `CAMPAIGN_ENCRYPTION_KEY`, Uzapi, `PUBLIC_BASE_URL` e SMTP conforme o README. Use dados de teste e destinatários autorizados.
2. Para arquivos locais, faça `POST /midias/:tipo` uma vez por arquivo e guarde `data.midiaUpload`.
3. Faça `POST /disparos` com os dados completos, comprovantes ou URLs e uma nova `Idempotency-Key`. Esse passo inicia o disparo real.
4. Guarde `data.campanhaId` (UUID). Para descobrir o ID interno, use `GET /campanhas/uuid/:uuid`.
5. Abra o link de acompanhamento enviado por e-mail ou use o token do link em `GET /acessos/:idPublico/progresso`.
6. Após finalizar, utilize o novo link/token do relatório e, se desejar, exporte CSV/XLSX. O token antigo de progresso não serve para o relatório.
7. Em falha de rede no início, repita a mesma solicitação com a mesma chave. Para campanha diferente, gere uma nova chave.

## 12. O que não existe como endpoint atualmente

- Login, cadastro de usuário e diferenciação de papéis por usuário; existe apenas a credencial administrativa configurada no servidor.
- Webhook para receber eventos `delivered`/`read`.
- Cancelar, encerrar, pausar, retomar ou excluir campanha por HTTP.
- Cadastro isolado de mensagem, consulta isolada de resultado de mensagem, consulta pública de saldo ou disparo avulso por contato.
- Endpoint próprio de saúde (`/health`), envio manual de relatório ou reenvio de notificações.
- Download público dos arquivos enviados por upload.

Os módulos de execução de disparos, resultados, notificações e limpeza trabalham internamente. Não invente URLs para esses serviços. A lista acima reflete os routers atuais; futuras implementações devem atualizar este documento.

## 13. Fontes locais conferidas

- `Backend/src/app.js` e `Backend/src/router.js`: montagem das rotas e páginas.
- `Backend/src/Modules/Instancia/InstanciaRouter.js`, controller, service e repository.
- `Backend/src/Modules/Contato/ContatoRouter.js`, controller e service.
- `Backend/src/Modules/Campanha/CampanhaRouter.js`, controller e service.
- `Backend/src/Modules/Campanha/FormularioCampanhaRouter.js` e service.
- `Backend/src/Modules/Campanha/AcessoCampanhaRouter.js` e ciclo da campanha.
- `Backend/src/Modules/Midia/MidiaRouter.js`, service e `Backend/public/assets/midia-formatos.js`.
- `Backend/src/shared/middleware/acesso.js`, configuração e serialização de datas.

Esta revisão é documental: não executa disparos, não envia arquivos à Uzapi, não altera o banco e não corrige as pendências sinalizadas.
