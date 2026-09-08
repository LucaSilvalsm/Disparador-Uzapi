# Backend do Disparador Uzapi

Backend em desenvolvimento, organizado por módulos, com Node.js, Express e Prisma/PostgreSQL.

## Executar

Instale as dependências com `npm install`, configure `.env` a partir de `.env.example` e execute `npm run dev` ou `npm start`. No PowerShell com scripts bloqueados, use `npm.cmd`.

As tabelas e o contrato Prisma existentes continuam sendo utilizados; estes ajustes não exigem migration. O banco precisa estar configurado conforme `prisma-next.md`.

```env
PORT=5000
UZAPI_BASE_URL=https://api.uzapi.com.br
UZAPI_VERSION=v1
API_TIMEZONE=America/Sao_Paulo
DAILY_CONTACT_LIMIT=250
```

Mantenha `DATABASE_URL` com a conexão do seu PostgreSQL. A versão da Uzapi é global e lida do ambiente na inicialização: para alterar, edite `UZAPI_VERSION` e reinicie o backend. Isso muda a URL utilizada, sem alterar o banco; eventuais diferenças de payload entre versões ainda precisam ser avaliadas.

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
- No início, a campanha inteira precisa caber no saldo disponível; caso contrário, a API responde `429`, preservando o rascunho.
- Se o limite for reduzido durante a execução, o próximo contato aguarda disponibilidade. A consulta é repetida a cada 30 segundos e considera novos aumentos do limite. A campanha permanece `em_andamento` e os contatos aguardando permanecem `pendente`.

## Início e concorrência

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

A resposta não contém mais o resultado final dos envios. O endpoint existente `GET /campanhas/:id` permite consultar o status; progresso detalhado e relatório serão implementados em uma etapa posterior.

O motor funciona no mesmo processo Node.js, independente da duração da requisição HTTP. Entre mensagens do mesmo contato espera de 5 a 10 segundos; entre contatos, de 30 a 60 segundos. Cada intervalo é sorteado novamente, sem espera após o último item.

Uma instância executa uma campanha por vez. Instâncias diferentes podem executar campanhas simultaneamente. Um segundo início para a mesma campanha, ou para outra campanha de uma instância ocupada, retorna `409`.

Transactions curtas bloqueiam a linha da instância no PostgreSQL e realizam a verificação/reserva de forma serializada. O bloqueio é obtido por um UPDATE do próprio ID, sem alteração dos dados. As chamadas à Uzapi e as esperas acontecem **fora** da transaction. As atualizações condicionais de estado preservam a condição no UPDATE emitido pelo Prisma.

A execução em segundo plano ainda não é uma fila durável: reiniciar o Node.js interrompe os trabalhos. Campanhas que estavam em andamento não são retomadas automaticamente e podem permanecer com esse status. A recuperação/reconciliação fica para o módulo futuro; não altere o status manualmente para rascunho para reenviar, pois isso pode repetir mensagens já aceitas.

## Cadastro atômico

A criação de campanha, a criação/reutilização dos contatos, os vínculos e as mensagens ocorrem na mesma transaction Prisma. Uma falha desfaz todas essas gravações. Contatos existentes são reutilizados por telefone sem alterar o nome já cadastrado.

## Uzapi e diagnóstico

A documentação Swagger consultada em 08/09/2026 especifica `Authorization: Bearer <token>`. O cliente normaliza espaços externos e um prefixo Bearer informado no cadastro, evitando duplicá-lo. Tokens vazios ou com espaços internos são rejeitados localmente.

O erro remoto `401 / Access Token não informado` é originado na Uzapi. A resposta antiga `Campanha processada` era montada pelo disparador. O Swagger também lista `GET /{username}/{version}/{phone_number_id}/instance`; a integração dessa consulta como validação prévia ainda não foi adicionada. Por enquanto, o cadastro valida os campos e a autorização remota é verificada no envio.

Um `401` ou `403` durante o envio encerra a campanha como `falhou`, registra a falha atual e mantém os próximos contatos pendentes. Outras falhas de envio são registradas e o processamento continua. Não há retry automático. Sucesso significa que a requisição foi aceita pela Uzapi, não confirmação de entrega ao WhatsApp.

Logs guardam evento, identificador de erro e IDs internos, além de status HTTP/diagnóstico seguro quando disponível. Não guardam telefone, texto da mensagem, token, headers, conexão do banco ou corpo bruto da resposta remota. Erros internos retornam uma mensagem genérica e `errorId` para correlação.

Se a Uzapi aceitar uma mensagem e a gravação do sucesso falhar, o motor não registra falsamente uma recusa da Uzapi. A campanha falha e o resultado pendente fica disponível para futura reconciliação, sem reenvio automático.

Referência: https://api.uzapi.com.br/swagger

## Próximas etapas acordadas

- Definir a credencial segura de acesso por campanha. O campo `hashTokenAcesso` ainda não é utilizado; as rotas atuais ainda não verificam autorização por campanha.
- Implementar endpoint de progresso e mini relatório depois da estabilização do motor.
- Implementar frontend Vue e a suíte automatizada ao final dos módulos do backend.
- Projetar recuperação após reinicialização e ações de pausa/continuação/cancelamento.

As verificações pontuais destes ajustes usaram simulações locais e transactions PostgreSQL com rollback, sem envios reais à Uzapi.
