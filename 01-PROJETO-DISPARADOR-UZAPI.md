# Projeto Disparador Uzapi

## 1. Visão Geral

O **Projeto Disparador Uzapi** tem como objetivo criar uma aplicação web
para permitir que clientes da Uzapi realizem campanhas de envio de
mensagens para listas de contatos de forma simples, controlada e segura.

O sistema será integrado à API da Uzapi e permitirá conectar uma
instância do WhatsApp, informar ou importar contatos, configurar uma
sequência de até três mensagens e iniciar o disparo respeitando limites
e intervalos definidos pela aplicação.

A primeira versão será desenvolvida como um **MVP**, priorizando
tecnologias já conhecidas e uma arquitetura simples de compreender e
evoluir.

## 2. Objetivo

O usuário deverá conseguir executar o seguinte fluxo:

1.  Acessar o disparador.
2.  Conectar sua instância da Uzapi.
3.  Informar ou importar a lista de contatos.
4.  Criar a mensagem do disparo.
5.  Opcionalmente adicionar novas mensagens à sequência.
6.  Utilizar até 3 mensagens por campanha.
7.  Utilizar mensagens de texto e, conforme evolução do MVP, mídias
    suportadas pela Uzapi.
8.  Iniciar o disparo.
9.  Acompanhar o andamento da campanha.
10. Consultar o resultado dos envios.

Fluxo resumido:

``` text
Usuário
   ↓
Conecta instância Uzapi
   ↓
Informa/importa contatos
   ↓
Cria campanha
   ↓
Configura 1 a 3 mensagens
   ↓
Inicia disparo
   ↓
Backend controla campanha e intervalos
   ↓
Uzapi recebe as mensagens
   ↓
WhatsApp
```

## 3. Stack inicial

### Frontend

-   Vue.js
-   JavaScript
-   HTML
-   CSS
-   Bootstrap ou Tailwind CSS

A escolha entre Bootstrap e Tailwind poderá ser feita durante a
construção da interface.

### Backend

-   Node.js
-   Express
-   JavaScript
-   Axios para comunicação HTTP com a Uzapi

### Banco de dados

-   PostgreSQL
-   Prisma ORM para acesso ao PostgreSQL

O acesso ao banco será feito por repositories utilizando Prisma ORM,
conforme o documento de arquitetura. Operações com múltiplas gravações
dependentes utilizarão transactions.

## 4. Tecnologias que não serão obrigatórias no MVP

Inicialmente o projeto não dependerá de:

-   Redis
-   BullMQ
-   n8n
-   Worker separado
-   microsserviços

Essas tecnologias poderão ser estudadas e adicionadas posteriormente se
a evolução e a escala da aplicação justificarem.

## 5. Integração com a Uzapi

Cada instância da Uzapi possui os seguintes dados principais:

-   `email` do usuário, para acompanhamento e relatório
-   `token`
-   `phone_number_id`
-   `version`

A versão será definida globalmente por `UZAPI_VERSION` no `.env`, com
`v1` como padrão. Não será um campo da instância no banco de dados.

Formato base informado para envio:

``` text
https://api.uzapi.com.br/{version}/{phone_number_id}/messages
```

Exemplo de corpo para mensagem de texto:

``` json
{
  "to": "5543996254177",
  "delayMessage": 0,
  "delayTyping": 0,
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Ola Mundo!"
  }
}
```

O token deverá ser tratado como credencial e nunca deverá ser enviado
desnecessariamente ao frontend, registrado em logs ou exposto em
respostas públicas da API.

## 6. Conceito de campanha

Uma campanha representa uma execução de disparo.

Ela deverá relacionar:

-   uma instância Uzapi;
-   uma lista de contatos;
-   uma sequência de mensagens;
-   estado da execução;
-   progresso;
-   resultados dos contatos;
-   data de início e conclusão.

Estados possíveis poderão incluir:

``` text
draft
running
paused
completed
cancelled
failed
```

Nem todos precisam ser implementados na primeira etapa.

## 7. Contatos

Cada campanha deverá possuir uma lista de destinatários.

O sistema deverá validar pelo menos:

-   existência do telefone;
-   formato esperado;
-   contatos duplicados na mesma lista;
-   quantidade de contatos;
-   contatos disponíveis diante do limite das últimas 24 horas.

A aplicação deve trabalhar com o conceito de **contatos processados**,
independentemente da quantidade de mensagens da sequência.

Exemplo:

``` text
100 contatos
3 mensagens para cada contato

Consumo do limite: 100 contatos
Quantidade potencial de mensagens: 300
```

## 8. Sequência de mensagens

Cada campanha poderá possuir entre 1 e 3 mensagens.

Exemplo:

``` text
Contato
  ↓
Mensagem 1 - áudio
  ↓
espera entre 5 e 10 segundos
  ↓
Mensagem 2 - imagem
  ↓
espera entre 5 e 10 segundos
  ↓
Mensagem 3 - texto
```

A ordem configurada pelo usuário deverá ser preservada.

## 9. Intervalo entre contatos

Depois de terminar a sequência de um contato, o sistema deverá aguardar
um intervalo aleatório antes de iniciar o próximo.

``` text
Contato A
  ↓
sequência concluída
  ↓
espera entre 30 e 60 segundos
  ↓
Contato B
```

Os valores deverão ser gerados dinamicamente dentro das faixas
configuradas.

## 10. Limite em 24 horas

O sistema deverá impedir que uma instância ultrapasse o limite
configurado de contatos dentro de uma janela móvel de 24 horas.

Como o requisito discutido considera uma faixa de **250 a 350
contatos**, o limite não deverá ser espalhado como número fixo pelo
código. Ele deverá ser configurável.

Exemplo:

``` text
daily_contact_limit = 250
```

Isso permite futuramente trabalhar com limites diferentes por cliente ou
instância.

Na implementação, `DAILY_CONTACT_LIMIT` define o padrão para novas
instâncias. O campo `limiteDiarioContatos` pode ser alterado pelo endpoint
de instâncias e é consultado antes de cada contato. A janela contabiliza
contatos iniciados/reservados, inclusive falhas, em todas as campanhas da
mesma instância.

A regra definitiva de produto sobre qual será o limite padrão --- 250,
350 ou outro valor dentro da faixa aprovada --- deverá ser confirmada
antes da publicação.

## 11. Acompanhamento

Como melhoria do MVP, a interface poderá apresentar:

-   total de contatos;
-   contatos processados;
-   contatos restantes;
-   sucessos;
-   falhas;
-   percentual concluído;
-   status atual da campanha.

Exemplo:

``` text
Campanha: 195 / 250

Progresso: 78%

Sucesso: 188
Falhas: 7
Restantes: 55
```

## 12. Relatório

Cada contato deverá possuir um resultado de processamento que permita
construir um relatório.

Exemplo:

  Contato         Status      Sequência
  --------------- ----------- -----------
  5543999999999   Concluído   3/3
  5543888888888   Falhou      0/3
  5543777777777   Parcial     2/3

Quando disponíveis, identificadores retornados pela Uzapi poderão ser
armazenados para rastreamento.

## 13. Responsabilidade da aplicação e da Uzapi

O sistema será responsável por:

-   campanhas;
-   contatos;
-   sequência;
-   limites;
-   intervalos;
-   progresso;
-   estado;
-   registro de resultados;
-   decisão de quando enviar a próxima mensagem.

A Uzapi continuará responsável pelo processamento interno das mensagens
recebidas pela API e pela comunicação com a infraestrutura do WhatsApp.

Portanto, a existência de uma fila interna da Uzapi não substitui o
controle de campanha da aplicação.

## 14. Estratégia de desenvolvimento

O projeto será desenvolvido incrementalmente.

Ordem sugerida:

1.  Configuração do backend Express.
2.  Configuração do PostgreSQL.
3.  Integração básica com a Uzapi.
4.  Módulo de instâncias.
5.  Módulo de contatos.
6.  Módulo de campanhas.
7.  Módulo de mensagens.
8.  Motor básico de disparo.
9.  Intervalos dinâmicos.
10. Limite móvel de 24 horas.
11. Persistência de progresso.
12. Tratamento de falhas.
13. Interface de acompanhamento.
14. Relatório.
15. Recuperação de campanhas interrompidas.
16. Avaliação da necessidade de Redis/BullMQ/worker dedicado.

## 15. Princípio do MVP

O objetivo da primeira versão não é criar imediatamente uma
infraestrutura distribuída ou excessivamente complexa.

O objetivo é criar uma aplicação:

-   compreensível;
-   modular;
-   persistente;
-   segura;
-   testável;
-   fácil de manter;
-   preparada para evoluir.

A complexidade deverá ser adicionada somente quando existir uma
necessidade concreta.


## 16. Requisitos adicionais do MVP

### 16.1. Sequência de até 3 mensagens

A sequência de mensagens faz parte do núcleo do backend e deverá ser considerada desde a modelagem inicial.

Cada campanha poderá possuir:

- no mínimo 1 mensagem;
- no máximo 3 mensagens;
- ordem definida pelo usuário;
- mensagens de tipos diferentes conforme suporte da Uzapi.

Exemplo:

```text
Contato
  ↓
Mensagem 1 - áudio
  ↓
espera entre 5 e 10 segundos
  ↓
Mensagem 2 - imagem
  ↓
espera entre 5 e 10 segundos
  ↓
Mensagem 3 - texto
```

A ordem deverá ser persistida no banco, permitindo identificar claramente a posição de cada mensagem da sequência.

O backend deverá considerar o intervalo dinâmico entre mensagens e registrar o resultado de cada item da sequência.

### 16.2. Barra de progresso

A barra de progresso será implementada depois que o motor básico de disparo estiver funcional, mas a persistência necessária deverá existir desde o início.

O progresso poderá apresentar:

```text
Total de contatos
Contatos processados
Contatos concluídos com sucesso
Contatos com falha
Contatos restantes
Percentual concluído
```

Exemplo:

```text
Campanha: 105 / 250

Progresso: 42%

Sucesso: 100
Falhas: 5
Restantes: 145
```

O progresso deverá ser calculado a partir de dados persistidos no PostgreSQL, e não somente de variáveis mantidas em memória.

Na primeira versão, o frontend poderá consultar periodicamente um endpoint do backend.

Exemplo conceitual:

```text
GET /campaigns/:id/progress
```

O uso de WebSocket ou SSE poderá ser avaliado posteriormente.

### 16.3. Mini relatório de contatos

O sistema deverá permitir exibir um relatório resumido dos contatos processados.

Exemplo:

| Contato | Status | Sequência |
|---|---|---|
| 5543999999999 | Concluído | 3/3 |
| 5543888888888 | Falhou | 0/3 |
| 5543777777777 | Parcial | 2/3 |

Estados previstos:

```text
pending
processing
completed
partial
failed
```

O resultado deverá ser persistido por contato e, preferencialmente, também por mensagem da sequência.

Exemplo:

```text
Contato A
├── mensagem 1 → sucesso
├── mensagem 2 → sucesso
└── mensagem 3 → falha
```

Nesse caso, o contato poderá ser identificado como:

```text
Parcial
2 / 3 mensagens processadas com sucesso
```

Essa estrutura permitirá:

- apresentar o mini relatório em tela;
- identificar contatos com falha;
- apoiar a higienização das listas;
- futuramente exportar relatórios;
- enviar um resumo por e-mail, caso essa funcionalidade seja adicionada.


## 17. Fluxo temporário sem login tradicional (revisado em 13/09/2026)

O cliente preenche um único formulário com Phone ID, token Uzapi, e-mail,
lista de contatos e de uma a três mensagens. O backend recebe tudo em
`POST /disparos`, cria a campanha em transaction e responde `202`.
Não existe cadastro de usuário, senha, associação e-mail + Phone ID como
autenticação, nem acesso público ao histórico de uma instância.

### 17.1. Reutilização do Phone ID e limite móvel

A instância é reutilizada internamente pelo Phone ID. O mesmo e-mail pode
enviar campanhas em vários Phone IDs, e novas campanhas de um Phone ID
podem informar outro e-mail. O e-mail pertence à campanha, não concede
acesso a campanhas anteriores e não altera o destinatário delas.

Toda submissão exige novamente o token Uzapi: conhecer o Phone ID nunca
permite usar credenciais armazenadas de outra campanha. Os campos são
validados localmente; não se presume um endpoint externo de validação da
instância. A autorização na Uzapi é conferida no envio.

O padrão é 250 contatos em uma janela móvel de 24 horas, configurável.
Uma campanha com 20 contatos deixa 230 disponíveis para a próxima,
inclusive no mesmo dia. Não se desativa automaticamente a instância nem
se impõe espera fixa de 24 horas. Existe apenas uma campanha em andamento
por Phone ID. Instâncias bloqueadas pelo administrador continuam bloqueadas.

Cada contato reservado conta uma unidade, inclusive falhas e contatos
repetidos em campanhas diferentes; até três mensagens do mesmo contato
consomem uma unidade. As verificações e reservas são serializadas por
bloqueio da instância no PostgreSQL.

### 17.2. Acesso por links exclusivos

No início, o backend gera um token aleatório de 256 bits e agenda um
e-mail com o link de progresso. O estado vem do PostgreSQL e a página
consulta a API a cada cinco segundos.

Ao terminar (inclusive por falha), o link de progresso é revogado.
Outro token independente permite consultar o relatório, enviado por
outro e-mail. O ID público sozinho não autoriza nenhuma consulta.

O segredo fica no fragmento do link (`#token=...`), que não é enviado em
requisições HTTP de navegação. A página troca esse segredo por um cookie
HttpOnly, SameSite=Strict, restrito à campanha/finalidade; em produção,
também Secure. Depois remove o fragmento da barra de endereço.
A API também aceita o token no cabeçalho Authorization Bearer.
Atualizar a página mantém o acesso pelo cookie; outro dispositivo usa o
link original do e-mail. Não se usa localStorage para guardar segredos.

Tokens de consulta são verificados por hash. O token Uzapi e as URLs
aguardando envio por e-mail são cifrados com AES-256-GCM e contexto por
campanha. O token de envio é apagado na finalização; URLs cifradas saem
da outbox após o envio ou a revogação.

Quem possuir o link pode consultar os dados daquela campanha. E-mail
não comprova identidade nem propriedade da instância; links devem ser
tratados como confidenciais. Não há recuperação de histórico por e-mail.

### 17.3. Relatório e retenção

O relatório mostra resultados por contato e mensagem e permite baixar
CSV ou Excel (`.xlsx`, não o formato antigo `.xls`). Acesso e downloads
expiram exatamente 24 horas após a finalização, mesmo se o banco ainda
não tiver sido limpo. Sucesso significa aceitação pela Uzapi, não prova
de entrega no WhatsApp.

A manutenção verifica a limpeza a cada 30 segundos enquanto o backend
está em execução. Exclui campanha temporária, destinatários próprios,
mensagens, resultados e notificações. Exclui a instância temporária
somente quando nenhuma outra campanha a utiliza e nunca apaga reservas
ainda necessárias ao limite móvel. Se o servidor estiver parado, a
limpeza física ocorrerá depois de sua volta; o prazo de acesso não muda.

Novos destinatários são guardados em CampanhaContato, sem compartilhar
nome ou telefone via catálogo global. Registros legados e instâncias
administrativas não são apagados retroativamente. Backups, e-mails já
recebidos e arquivos exportados não podem ser apagados por essa rotina.

### 17.4. Confiabilidade e administração

`Idempotency-Key` é obrigatório: repetir a mesma chave e os mesmos dados
não inicia outra campanha. Outra campanha usa outra chave. A proteção
dura enquanto o registro temporário existir; após a exclusão, não há
histórico permanente da chave.

O motor continua no Node.js, fora da requisição HTTP, com estado
persistido. Cada nova campanha em execução registra sinal de atividade
a cada 15 segundos. Depois de 180 segundos sem sinal, a manutenção a
encerra como falha e agenda o relatório; não retoma nem reenvia mensagens
automaticamente. Pendências podem representar envios não realizados ou
resultados não confirmados. Campanhas antigas não são retomadas nem
finalizadas automaticamente por essa rotina.

E-mails usam uma outbox persistida com retentativas e reserva de trabalho.
Falhas de SMTP não desfazem a campanha e não provocam reenvio ao WhatsApp.
Uma falha de confirmação após aceitação pelo SMTP pode gerar e-mail
duplicado; não se promete entrega exatamente uma vez. Se o progresso já
terminou antes de o e-mail conseguir sair, envia-se apenas o relatório
ainda válido. O prazo do relatório não reinicia por atraso de e-mail.

Rotas antigas de instâncias, contatos e campanhas são administrativas:
exigem `ADMIN_API_TOKEN` em Authorization Bearer. Essa chave é separada
dos tokens Uzapi e de consulta, nunca vai para o frontend. O cliente
comum utiliza apenas a submissão e os links da sua campanha.

### 17.5. Configuração e limites desta etapa

Configure `PUBLIC_BASE_URL` com o domínio HTTPS, SMTP, uma chave
`CAMPAIGN_ENCRYPTION_KEY` de 32 bytes em hexadecimal e um
`ADMIN_API_TOKEN` forte. Guarde essas chaves fora do Git. Alterar a chave
de criptografia durante campanhas existentes invalida credenciais,
URLs pendentes e a verificação de repetição de requisições.

As páginas mínimas de consulta já são servidas pelo Express. O formulário
Vue completo, login administrativo com usuários/perfis, fila dedicada,
pausa/retomada e confirmação de entrega por webhook não fazem parte
desta etapa. Consulte o README do backend para endpoints e testes.
