# Arquitetura, Regras e Requisitos --- Disparador Uzapi

## 1. Direção arquitetural

O backend será organizado utilizando uma arquitetura **modular por
domínio/feature**.

Em vez de distribuir todos os controllers em uma pasta, services em
outra e repositories em outra, cada módulo deverá concentrar suas
próprias responsabilidades.

Exemplo:

``` text
campanha/
├── campanha.routes.js
├── campanha.controller.js
├── campanha.service.js
└── campanha.repository.js
```

Isso facilita manutenção, localização de código e evolução isolada dos
módulos.

## 2. Estrutura inicial

``` text
backend/
├── src/
│   ├── modules/
│   │   ├── instancia/
│   │   │   ├── instancia.routes.js
│   │   │   ├── instancia.controller.js
│   │   │   ├── instancia.service.js
│   │   │   └── instancia.repository.js
│   │   │
│   │   ├── contato/
│   │   │   ├── contato.routes.js
│   │   │   ├── contato.controller.js
│   │   │   ├── contato.service.js
│   │   │   └── contato.repository.js
│   │   │
│   │   ├── campanha/
│   │   │   ├── campanha.routes.js
│   │   │   ├── campanha.controller.js
│   │   │   ├── campanha.service.js
│   │   │   └── campanha.repository.js
│   │   │
│   │   ├── mensagem/
│   │   │   ├── mensagem.routes.js
│   │   │   ├── mensagem.controller.js
│   │   │   ├── mensagem.service.js
│   │   │   └── mensagem.repository.js
│   │   │
│   │   └── disparo/
│   │       ├── disparo.routes.js
│   │       ├── disparo.controller.js
│   │       ├── disparo.service.js
│   │       └── disparo.repository.js
│   │
│   ├── shared/
│   │   ├── database/
│   │   │   └── connection.js
│   │   ├── http/
│   │   │   └── uzapiClient.js
│   │   ├── middlewares/
│   │   └── utils/
│   │
│   ├── routes.js
│   ├── app.js
│   └── server.js
│
├── .env
├── .env.example
├── package.json
└── README.md
```

A estrutura poderá evoluir conforme necessidades reais surgirem.

## 3. Responsabilidades internas

Dentro de cada módulo:

### Routes

Responsável por declarar endpoints e conectar a rota ao controller.

``` text
HTTP
 ↓
Route
```

Não deverá conter regras de negócio.

### Controller

Responsável pela camada HTTP:

-   receber `req`;
-   extrair parâmetros;
-   chamar o service;
-   devolver `res`;
-   selecionar status HTTP apropriado.

``` text
Route
 ↓
Controller
```

Não deverá executar SQL diretamente.

### Service

Responsável pelas regras de negócio.

Exemplos:

-   verificar limite diário;
-   validar se campanha pode começar;
-   determinar sequência;
-   processar contato;
-   decidir próximo estado;
-   validar regras da instância.

``` text
Controller
 ↓
Service
```

É a principal camada de comportamento do módulo.

### Repository

Responsável exclusivamente pela persistência.

Exemplos:

``` text
INSERT
SELECT
UPDATE
DELETE
```

Utilizará **Prisma ORM** para comunicação com PostgreSQL.

``` text
Service
 ↓
Repository
 ↓
Prisma ORM
 ↓
PostgreSQL
```

## 4. Shared

`shared` deverá conter apenas recursos realmente compartilhados entre
módulos.

Exemplos:

``` text
shared/database
shared/http
shared/middlewares
shared/utils
```

Não deverá virar uma pasta para regras de negócio sem domínio definido.

## 5. Módulo Instância

Responsável pela integração/configuração de uma conta Uzapi.

Dados principais:

``` text
email
token
phone_number_id
version
daily_contact_limit
```

`version` terá inicialmente `v1` como padrão e será configurada globalmente
por `UZAPI_VERSION` no `.env`, sem persistência por instância. A mudança
de configuração exige reiniciar o backend.

Responsabilidades:

-   cadastrar/conectar instância;
-   validar campos obrigatórios;
-   atualizar credenciais;
-   fornecer credenciais internamente para envio;
-   definir limite diário;
-   proteger dados sensíveis.

### Segurança

O token:

-   não deve aparecer em logs;
-   não deve ser retornado integralmente ao frontend;
-   não deve ficar hardcoded;
-   deve receber tratamento como segredo.

Em produção deverá ser considerada criptografia em repouso para
credenciais armazenadas.

## 6. Módulo Contato

Responsável pelos destinatários.

Responsabilidades:

-   cadastrar;
-   importar;
-   normalizar telefone;
-   validar telefone;
-   detectar duplicados;
-   relacionar contatos às campanhas.

Uma campanha poderá possuir muitos contatos.

## 7. Módulo Campanha

Representa o agrupamento principal do disparo.

Responsabilidades:

-   criar campanha;
-   editar enquanto permitido;
-   relacionar instância;
-   relacionar contatos;
-   relacionar mensagens;
-   controlar estado;
-   armazenar progresso;
-   finalizar/cancelar quando aplicável.

Possíveis estados:

``` text
draft
running
paused
completed
cancelled
failed
```

O MVP poderá iniciar com um subconjunto.

## 8. Módulo Mensagem

Responsável pelas mensagens que compõem uma campanha.

Regras:

-   mínimo de 1 mensagem;
-   máximo de 3 mensagens;
-   cada mensagem possui posição na sequência;
-   a ordem deve ser preservada;
-   tipos suportados serão adicionados conforme integração com a Uzapi.

Exemplo:

``` text
posição 1 → áudio
posição 2 → imagem
posição 3 → texto
```

## 9. Módulo Disparo

É o módulo responsável pela orquestração.

Ele deverá decidir **quando** uma mensagem pode ser enviada para a
Uzapi.

Responsabilidades:

-   iniciar processamento;
-   selecionar próximo contato pendente;
-   verificar limite de 24 horas;
-   executar sequência;
-   gerar intervalos;
-   chamar cliente Uzapi;
-   registrar sucesso/falha;
-   atualizar progresso;
-   finalizar campanha.

O módulo não substitui a fila interna da Uzapi.

## 10. Fluxo do disparo

``` text
Iniciar campanha
      ↓
Validar campanha
      ↓
Validar instância
      ↓
Verificar limite das últimas 24h
      ↓
Buscar próximo contato pendente
      ↓
Enviar mensagem 1
      ↓
Se houver próxima mensagem:
aguardar 5-10 segundos
      ↓
Enviar próxima mensagem
      ↓
Finalizar sequência do contato
      ↓
Registrar resultado
      ↓
Atualizar progresso
      ↓
Se houver próximo contato:
aguardar 30-60 segundos
      ↓
Repetir
      ↓
Finalizar campanha
```

## 11. Regra de intervalo entre mensagens

Para mensagens pertencentes à mesma sequência:

``` text
mínimo = 5 segundos
máximo = 10 segundos
```

O intervalo deverá ser escolhido dinamicamente.

Exemplo:

``` text
Mensagem 1
 ↓
7 segundos
 ↓
Mensagem 2
 ↓
9 segundos
 ↓
Mensagem 3
```

O valor não deverá ser sempre o mesmo.

## 12. Regra de intervalo entre contatos

Após finalizar a sequência de um contato:

``` text
mínimo = 30 segundos
máximo = 60 segundos
```

Exemplo:

``` text
Contato A concluído
 ↓
43 segundos
 ↓
Contato B
```

A espera ocorre entre contatos, e não entre cada requisição da
sequência.

## 13. Limite móvel de 24 horas

O limite é contado por **contato processado**, não pela quantidade de
mensagens.

Exemplo:

``` text
1 contato
3 mensagens

Consumo = 1 contato
```

O limite deverá ser configurável por instância.

Na implementação, `limiteDiarioContatos` pode ser alterado pelo endpoint
de instâncias. `DAILY_CONTACT_LIMIT` no `.env` define apenas o padrão de
cadastro de novas instâncias. O consumo é registrado em `iniciadoEm`
quando o contato é reservado para processamento, inclusive se o envio falhar.

``` text
daily_contact_limit
```

O requisito atual considera até **250 a 350 contatos em 24 horas**. O
valor padrão definitivo deverá ser confirmado como regra de produto.

A aplicação deverá consultar os contatos contabilizados dentro das
últimas 24 horas antes de iniciar/processar novos destinatários.

A janela deverá ser móvel:

``` text
agora - 24 horas
        até
agora
```

e não simplesmente "zerar à meia-noite".

## 14. Persistência de estado

Como uma campanha pode durar horas, o banco deverá guardar o progresso.

Não será suficiente manter informações apenas em memória.

Para cada contato deverão existir dados suficientes para saber se ele
está:

``` text
pending
processing
completed
partial
failed
```

Isso prepara o sistema para:

-   relatórios;
-   recuperação após falhas;
-   prevenção de duplicidade;
-   acompanhamento de progresso.

## 15. Requisição HTTP não deve representar toda a campanha

O endpoint de início não deverá permanecer aberto durante horas
aguardando a conclusão.

Conceitualmente:

``` text
POST /campanhas/:id/iniciar
       ↓
valida
       ↓
marca campanha como iniciada
       ↓
inicia processamento
       ↓
responde ao frontend
```

O processamento prolongado deverá ser isolado da lógica da resposta
HTTP.

No MVP essa separação poderá existir dentro do mesmo processo Node.js.
Posteriormente poderá evoluir para worker dedicado e fila de jobs.

A implementação responde `202 Accepted` após persistir o início e processa
no mesmo Node.js. Uma instância executa uma campanha por vez; instâncias
diferentes podem executar simultaneamente. Transactions curtas bloqueiam
a instância para verificar/reservar contatos sem corrida entre requisições.
Recuperação após reinicialização permanece uma etapa futura.

## 16. Fila da Uzapi x controle do disparador

Existem responsabilidades diferentes.

### Disparador

Controla:

``` text
campanha
contatos
sequência
limites
intervalos
progresso
estado
retentativas futuras
```

### Uzapi

Recebe as requisições de mensagens e realiza seu processamento interno
até a infraestrutura do WhatsApp.

Portanto:

``` text
Motor do Disparador
        ↓
Uzapi
        ↓
Fila/processamento da Uzapi
        ↓
WhatsApp
```

O projeto não precisa reproduzir a infraestrutura interna da Uzapi, mas
precisa manter seu próprio estado de campanha.

## 17. Comunicação com a Uzapi

A comunicação deverá ficar centralizada:

``` text
shared/http/uzapiClient.js
```

Isso evita chamadas Axios espalhadas pelos controllers.

Exemplo conceitual:

``` text
disparo.service
      ↓
uzapiClient
      ↓
Uzapi
```

A URL será construída com:

``` text
version
phone_number_id
```

Formato atual: `baseurl/version/phone_number_id`, sem username.

e a autenticação utilizará o token conforme especificação da API.

## 18. Tratamento de falhas

Um erro em um contato não deverá necessariamente interromper toda a
campanha.

Exemplo:

``` text
Contato A → sucesso
Contato B → falha
Contato C → sucesso
```

A falha de B deverá ser registrada e o comportamento de continuidade
definido pelo service.

Se uma sequência possuir três mensagens:

``` text
Mensagem 1 → sucesso
Mensagem 2 → sucesso
Mensagem 3 → falha
```

o resultado poderá ser classificado como parcial.

Políticas de retry deverão ser adicionadas cuidadosamente para evitar
duplicidade.

## 19. Idempotência e duplicidade

Antes de evoluir o sistema para retries automáticos, será necessário
garantir que uma recuperação ou nova tentativa não envie novamente
mensagens já confirmadas como processadas.

Por isso o estado deverá ser persistido por contato e, idealmente, por
mensagem da sequência.

## 20. Progresso

O progresso deverá ser calculado a partir de dados persistidos.

Exemplo:

``` text
total = 250
processados = 100

progresso = 100 / 250 * 100
progresso = 40%
```

A primeira versão poderá consultar o backend periodicamente.

Posteriormente poderá ser utilizado SSE ou WebSocket caso progresso em
tempo real seja necessário.

## 21. Requisitos funcionais

### Obrigatórios

-   Conectar/configurar uma instância Uzapi.
-   Trabalhar com token, phone_number_id e versão.
-   Cadastrar o e-mail do usuário na instância como destinatário padrão dos relatórios.
-   Cadastrar/importar lista de contatos.
-   Criar campanha.
-   Criar mensagem.
-   Processar disparo.
-   Controlar limite de contatos em janela de 24 horas.
-   Gerar intervalo de 5 a 10 segundos entre mensagens da sequência.
-   Gerar intervalo de 30 a 60 segundos entre contatos.
-   Registrar estado do processamento.

### Planejados/opcionais

-   Até 3 mensagens por sequência.
-   Texto, imagem e áudio.
-   Barra de progresso.
-   Relatório por contato.
-   Identificação de falhas.
-   Higienização da lista com base nos resultados.
-   Pausar campanha.
-   Continuar campanha.
-   Cancelar campanha.
-   Recuperar campanha após reinicialização.

## 22. Requisitos não funcionais

### Segurança

-   proteger token da Uzapi;
-   validar entradas;
-   evitar exposição de credenciais;
-   utilizar variáveis de ambiente;
-   preparar autenticação/autorização para acesso às instâncias e
    campanhas.

### Manutenibilidade

-   arquitetura modular;
-   responsabilidade bem definida;
-   regras de negócio fora dos controllers;
-   SQL isolado em repositories;
-   integração Uzapi centralizada.

### Confiabilidade

-   persistir progresso;
-   registrar falhas;
-   evitar duplicidades;
-   não depender exclusivamente da memória do Node.js.

### Evolução

A arquitetura deverá permitir futuramente:

``` text
Express
   ↓
Fila de jobs
   ↓
Worker(s)
   ↓
Uzapi
```

sem exigir reescrita completa dos módulos de domínio.

## 23. Regra de dependência entre módulos

Um módulo não deverá manipular diretamente detalhes internos de outro
módulo sem uma interface clara.

Deve-se evitar, por exemplo, espalhar consultas SQL de campanha dentro
de controllers de disparo.

O objetivo é manter:

``` text
alta coesão dentro do módulo
baixo acoplamento entre módulos
```

## 24. Decisões do MVP

Para a primeira versão:

``` text
Vue.js
Node.js
Express
PostgreSQL
Prisma ORM
Axios
```

Não serão requisitos iniciais:

``` text
Redis
BullMQ
n8n
microsserviços
worker dedicado
```

A ausência dessas ferramentas no MVP é intencional: primeiro será
construída uma base funcional, persistente e compreensível. A
infraestrutura será sofisticada somente quando houver necessidade real.


## 25. Prisma ORM

O projeto utilizará **Prisma ORM** como camada de acesso ao PostgreSQL.

A arquitetura continuará preservando os repositories de cada módulo:

```text
Route
 ↓
Controller
 ↓
Service
 ↓
Repository
 ↓
Prisma ORM
 ↓
PostgreSQL
```

O Prisma não substituirá as responsabilidades do repository ou do service.

Será utilizado principalmente para:

- definição do schema de dados;
- migrations;
- relacionamentos;
- consultas;
- inserções e atualizações;
- transactions quando necessárias;
- acesso tipado/estruturado ao PostgreSQL.

As regras de negócio não deverão ser colocadas no schema do Prisma nem espalhadas diretamente pelos controllers.

## 26. Sessão segura de campanha sem login tradicional

O MVP utilizará uma estratégia de acesso por campanha em vez de exigir inicialmente cadastro e login completos.

Ao criar uma campanha, o backend deverá gerar uma identificação e uma credencial de acesso segura.

Fluxo:

```text
Instância Uzapi
      ↓
Criar campanha
      ↓
Backend gera acesso seguro
      ↓
Iniciar disparo
      ↓
PostgreSQL persiste o estado
      ↓
Frontend acompanha
```

### Link de acompanhamento

Exemplo conceitual:

```text
https://disparador.uzapi.com.br/campaign/7ae231...
```

O ID público não deverá ser tratado como autorização suficiente.

A aplicação deverá validar uma credencial segura associada à campanha antes de disponibilizar informações privadas, progresso ou relatório.

O segredo de acesso deverá ser gerado com mecanismo criptograficamente seguro. Sempre que adequado, o banco deverá armazenar apenas sua representação protegida/hash em vez do segredo original.

### Recuperação após atualização da página

O frontend poderá manter a referência necessária para reencontrar a campanha.

Depois de um `F5`:

```text
Vue
 ↓
recupera referência da campanha
 ↓
Express
 ↓
valida acesso
 ↓
Prisma
 ↓
PostgreSQL
 ↓
retorna progresso atual
```

O progresso nunca dependerá exclusivamente do estado do Vue ou do `localStorage`.

### Acesso em outro dispositivo

O link seguro poderá permitir que o cliente acompanhe a campanha em outro computador ou celular.

Como evolução, o link também poderá ser enviado ao e-mail informado na criação da campanha.

### E-mail

O e-mail será obrigatório no cadastro de novas instâncias e será copiado para
`emailRelatorio` ao criar uma campanha. Um destinatário específico válido
informado na campanha terá prioridade. Alterações posteriores na instância
não modificarão campanhas já criadas. Instâncias antigas poderão manter
`email` nulo até a atualização; novas campanhas precisarão de um endereço
válido na instância ou em `emailRelatorio`.

O endereço poderá ser utilizado para:

- envio do relatório final;
- envio futuro do link de acompanhamento;
- comunicação relacionada especificamente à campanha.

### Separação das credenciais

As credenciais:

```text
token
phone_number_id
version
```

pertencem à integração com a Uzapi.

Elas não serão utilizadas diretamente como sessão/login do disparador.

A aplicação deverá separar:

```text
Credencial Uzapi
      ↓
Backend → Uzapi

Credencial da campanha
      ↓
Cliente → Backend
```

### Evolução para autenticação completa

Um sistema tradicional de usuários poderá ser introduzido futuramente se surgirem requisitos como:

- histórico permanente de campanhas;
- múltiplas instâncias por usuário;
- painel administrativo;
- listas de contatos persistentes;
- gerenciamento de conta;
- permissões;
- equipes.

Também poderá ser avaliado SSO ou integração com a autenticação oficial da Uzapi, caso a plataforma disponibilize mecanismo apropriado.
