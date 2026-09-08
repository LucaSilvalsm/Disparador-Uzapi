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

-   `username`
-   `token`
-   `phone_number_id`
-   `version`

A versão será definida globalmente por `UZAPI_VERSION` no `.env`, com
`v1` como padrão. Não será um campo da instância no banco de dados.

Formato base informado para envio:

``` text
https://api.uzapi.com.br/{username}/{version}/{phone_number_id}/messages
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


## 17. Acesso à campanha sem login tradicional

O MVP não exigirá inicialmente um sistema completo de cadastro e login com usuário e senha.

Para permitir que o cliente acompanhe uma campanha mesmo após atualizar a página, fechar o navegador ou trocar de dispositivo, cada campanha deverá possuir uma forma segura e exclusiva de acesso.

Fluxo conceitual:

```text
Usuário informa:
username
token
phone_number_id
e-mail opcional
        ↓
Backend valida a instância Uzapi
        ↓
Cria campanha
        ↓
Gera identificação e credencial segura da campanha
        ↓
Usuário inicia o disparo
        ↓
PostgreSQL mantém:
campanha
contatos
mensagens
progresso
resultados
        ↓
Frontend consulta o progresso
        ↓
Campanha finaliza
        ↓
Relatório em tela
+
e-mail opcional
```

### 17.1. Link seguro para acompanhamento

O sistema deverá permitir que o usuário recupere o acompanhamento através de um link exclusivo.

Exemplo conceitual:

```text
https://disparador.uzapi.com.br/campaign/7ae231...
```

O identificador visível da campanha não deverá, sozinho, conceder acesso aos dados. A solução deverá utilizar uma credencial segura associada à campanha, token de acesso ou estratégia equivalente.

Esse mecanismo permitirá:

- atualizar a página sem perder a referência da campanha;
- fechar e reabrir o navegador;
- acompanhar posteriormente;
- abrir o acompanhamento em outro dispositivo;
- acessar o relatório final sem possuir uma conta tradicional no MVP.

Tokens sensíveis deverão ser gerados com aleatoriedade criptograficamente segura e armazenados de maneira adequada, preferencialmente mantendo no banco apenas uma representação protegida quando tecnicamente aplicável.

### 17.2. Referência local

O navegador poderá manter uma referência da campanha para melhorar a experiência após um `F5` ou retorno ao site.

Essa referência não será a fonte do progresso.

```text
Navegador
    ↓
identifica campanha
    ↓
Backend
    ↓
PostgreSQL
    ↓
estado atual
```

Campanha, progresso e resultados continuarão persistidos no backend.

### 17.3. E-mail opcional

O usuário poderá informar um e-mail associado à campanha.

Inicialmente ele poderá ser utilizado para envio do relatório ao término do disparo.

Como evolução, o e-mail também poderá receber um link seguro para retornar à página de acompanhamento.

### 17.4. Credenciais da Uzapi não serão credenciais do disparador

`username`, `token` e `phone_number_id` identificam/configuram a instância Uzapi e não deverão funcionar como login permanente do usuário no disparador.

O token da Uzapi será tratado como credencial sensível e utilizado pelo backend somente para comunicação autorizada com a API.

O frontend deverá trabalhar com a identificação/credencial própria da campanha depois que a instância estiver configurada.

### 17.5. Evolução futura

Caso o disparador evolua para uma plataforma com histórico de campanhas, múltiplas instâncias, gerenciamento de contatos e configurações permanentes, poderá ser adicionado um sistema completo de autenticação.

Também poderá ser avaliada futuramente uma integração com a autenticação oficial da própria plataforma Uzapi, caso exista uma interface apropriada para isso.
