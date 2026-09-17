import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";

// Execução opt-in exclusivamente no PostgreSQL local. SMTP e motor sempre substituídos.
test("formulário, saldo compartilhado, notificações, relatório e limpeza transacional", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "Use somente um banco local de desenvolvimento.");
  process.env.CAMPAIGN_ENCRYPTION_KEY = "ab".repeat(32);
  const { db } = await import("../src/prisma/db.js");
  const { FormularioCampanhaService } = await import("../src/Modules/Campanha/FormularioCampanhaService.js");
  const { CicloCampanhaService } = await import("../src/Modules/Campanha/CicloCampanhaService.js");
  const { NotificacaoCampanhaService } = await import("../src/Modules/Campanha/NotificacaoCampanhaService.js");
  const { CampanhaService } = await import("../src/Modules/Campanha/CampanhaService.js");
  const { CampanhaRepository } = await import("../src/Modules/Campanha/CampanhaRepository.js");
  const { DisparoRepository } = await import("../src/Modules/Disparo/DisparoRepository.js");
  const { decifrar } = await import("../src/shared/utils/segredos.js");
  const { validarAcesso } = await import("../src/Modules/Campanha/AcessoCampanhaRouter.js");
  const phone = `teste-${randomUUID()}`;
  const rollback = new Error("rollback intencional dos testes");
  try {
    await assert.rejects(db.transaction(async (tx) => {
      const executor = { orm: tx.orm, transaction: (fn) => fn(tx) };
      const agendamentos = [], emails = [];
      const formulario = new FormularioCampanhaService(executor, { agendar: (...args) => agendamentos.push(args) });
      const ciclo = new CicloCampanhaService(executor);
      const notificacoes = new NotificacaoCampanhaService(executor, { enviar: async (email) => emails.push(email) });
      const consulta = new CampanhaService(new CampanhaRepository(executor));
      const repo = new DisparoRepository(executor);
      const entrada = { nome: "<Teste seguro>", instancia: { idNumeroTelefone: phone, email: "primeiro@example.invalid", token: "credencial-primeira" },
        lista: Array.from({ length: 20 }, (_, i) => `55219${String(10000000 + i)},Nome ${i}`).join("\n"), mensagens: [{ tipo: "texto", texto: "Oi {{nome}}" }] };
      const chave = randomUUID();
      const resposta = await formulario.iniciar(entrada, chave);
      assert.equal(resposta.saldoAntesDaCampanha, 250);
      const primeira = await tx.orm.public.Campanha.where({ idPublico: resposta.campanhaId }).first();
      const instancia = await tx.orm.public.Instancia.where({ id: primeira.instanciaId }).first();
      assert.equal(instancia.token, "");
      assert.equal(instancia.email, null);
      assert.equal(decifrar(primeira.tokenEnvioCifrado, `uzapi:${primeira.idPublico}`), "credencial-primeira");
      assert.equal((await formulario.iniciar(entrada, chave)).repetida, true);
      assert.equal(agendamentos.length, 1);
      await assert.rejects(formulario.iniciar({ ...entrada, nome: "Outros dados" }, chave), { statusCode: 409 });
      await assert.rejects(formulario.iniciar(entrada, randomUUID()), { statusCode: 409 });
      const progresso = await consulta.progresso(primeira.id);
      assert.equal(progresso.mensagens.total, 20);
      assert.equal(progresso.mensagens.pendentes, 20);
      await notificacoes.processarPendentes(primeira.id);
      assert.equal(emails.length, 1);
      assert.ok(emails[0].html.includes("&lt;Teste seguro&gt;"));
      assert.ok(!emails[0].html.includes("credencial-primeira"));
      const agora = Temporal.Now.instant();
      await tx.orm.public.CampanhaContato.where({ campanhaId: primeira.id }).updateAll({ iniciadoEm: agora, status: "concluido" });
      assert.equal(await repo.consumo24Horas(instancia.id, agora), 20);
      const finalizada = await ciclo.finalizar(primeira.id, "concluida");
      assert.equal(finalizada.tokenEnvioCifrado, null);
      assert.equal(finalizada.expiraEm.epochMilliseconds - finalizada.finalizadaEm.epochMilliseconds, 86400000);
      const tokenProgresso = /#token=([A-Za-z0-9_-]+)/.exec(emails[0].html)[1];
      assert.throws(() => validarAcesso(finalizada, "progresso", tokenProgresso), { statusCode: 410 });
      await ciclo.finalizar(primeira.id, "falhou");
      await notificacoes.processarPendentes(primeira.id);
      assert.equal(emails.length, 2);
      const tokenRelatorio = /#token=([A-Za-z0-9_-]+)/.exec(emails[1].html)[1];
      assert.notEqual(tokenRelatorio, tokenProgresso);
      validarAcesso(finalizada, "relatorio", tokenRelatorio);
      const relatorio = await consulta.relatorio(primeira.id);
      assert.equal(relatorio.totalContatos, 20);
      assert.equal(relatorio.contatos[0].nome, "Nome 0");
      const segundaEntrada = { ...entrada, instancia: { ...entrada.instancia, email: "segundo@example.invalid", token: "credencial-segunda" }, lista: "5521999999991,Outro nome\n5521999999992,Outro nome 2" };
      await tx.orm.public.Instancia.where({ id: instancia.id }).updateAll({ limiteDiarioContatos: 21 });
      await assert.rejects(formulario.iniciar(segundaEntrada, randomUUID()), { statusCode: 429 });
      await tx.orm.public.Instancia.where({ id: instancia.id }).updateAll({ limiteDiarioContatos: 250 });
      const segundaResposta = await formulario.iniciar(segundaEntrada, randomUUID());
      assert.equal(segundaResposta.saldoAntesDaCampanha, 230);
      const segunda = await tx.orm.public.Campanha.where({ idPublico: segundaResposta.campanhaId }).first();
      assert.equal(segunda.instanciaId, instancia.id);
      assert.equal(segunda.emailRelatorio, "segundo@example.invalid");
      assert.equal((await tx.orm.public.Campanha.where({ id: primeira.id }).first()).emailRelatorio, "primeiro@example.invalid");
      assert.equal(decifrar(segunda.tokenEnvioCifrado, `uzapi:${segunda.idPublico}`), "credencial-segunda");
      assert.throws(() => validarAcesso(segunda, "progresso", tokenProgresso), { statusCode: 404 });
      assert.equal(await repo.consumo24Horas(instancia.id, agora.add({ hours: 24 })), 0);
      const depois = finalizada.expiraEm.add({ seconds: 1 });
      assert.equal(await ciclo.limparExpiradas(depois, primeira.id), 1);
      assert.ok(await tx.orm.public.Instancia.where({ id: instancia.id }).first());
      assert.equal(await tx.orm.public.Campanha.where({ id: primeira.id }).first(), null);
      assert.equal((await tx.orm.public.Mensagem.where({ campanhaId: primeira.id }).all()).length, 0);
      const fimSegunda = await ciclo.finalizar(segunda.id, "falhou");
      assert.equal(await ciclo.limparExpiradas(fimSegunda.expiraEm.add({ seconds: 1 }), segunda.id), 1);
      assert.equal(await tx.orm.public.Instancia.where({ id: instancia.id }).first(), null);
      throw rollback;
    }), (error) => error === rollback);
    assert.equal(await db.orm.public.Instancia.where({ idNumeroTelefone: phone }).first(), null);

    // Concorrência real entre conexões. A outbox sintética é removida ANTES de cada commit,
    // impedindo inclusive outro servidor local de enviar e-mails dos testes.
    const links = new Map();
    const isolado = { orm: db.orm, transaction: (fn) => db.transaction(async (tx) => {
      const resultado = await fn(tx);
      const instancia = await tx.orm.public.Instancia.where({ idNumeroTelefone: phone }).first();
      if (instancia) {
        for (const campanha of await tx.orm.public.Campanha.where({ instanciaId: instancia.id }).all()) {
          for (const item of await tx.orm.public.NotificacaoCampanha.where({ campanhaId: campanha.id }).all()) {
            if (item.conteudoCifrado) links.set(`${campanha.idPublico}:${item.tipo}`, decifrar(item.conteudoCifrado, `link:${campanha.idPublico}:${item.tipo}`));
            await tx.orm.public.NotificacaoCampanha.where({ id: item.id }).delete();
          }
        }
      }
      return resultado;
    }) };
    const formulario = new FormularioCampanhaService(isolado, { agendar() {} });
    const ciclo = new CicloCampanhaService(isolado);
    const entrada = { nome: "Teste concorrencia", instancia: { idNumeroTelefone: phone, email: "teste@example.invalid", token: "token-sintetico" }, lista: "5521999999991,A\n5521999999992,B", mensagens: [{ tipo: "texto", texto: "Teste sem envio" }] };
    let servidor;
    try {
      const chave = randomUUID();
      const respostas = await Promise.all([formulario.iniciar(entrada, chave), formulario.iniciar(entrada, chave)]);
      assert.equal(respostas[0].campanhaId, respostas[1].campanhaId);
      assert.equal(respostas.filter((r) => r.repetida).length, 1);
      const primeira = await db.orm.public.Campanha.where({ idPublico: respostas[0].campanhaId }).first();
      const progressoToken = new URLSearchParams(new URL(links.get(`${primeira.idPublico}:progresso`)).hash.slice(1)).get("token");
      const { default: app } = await import("../src/app.js");
      servidor = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => servidor.once("listening", resolve));
      const base = `http://127.0.0.1:${servidor.address().port}/acessos/${primeira.idPublico}`;
      assert.equal((await fetch(base + "/progresso")).status, 404);
      assert.equal((await fetch(base + "/progresso?token=" + progressoToken)).status, 404);
      const auth = { Authorization: `Bearer ${progressoToken}` };
      const progresso = await fetch(base + "/progresso", { headers: auth });
      assert.equal(progresso.status, 200);
      assert.equal((await progresso.json()).data.mensagens.pendentes, 2);
      const sessao = await fetch(base + "/progresso/sessao", { method: "POST", headers: auth });
      assert.equal(sessao.status, 204);
      assert.ok(sessao.headers.get("set-cookie").includes("HttpOnly"));
      const cookie = sessao.headers.get("set-cookie").split(";")[0];
      assert.equal((await fetch(base + "/progresso", { headers: { Cookie: cookie } })).status, 200);
      await ciclo.finalizar(primeira.id, "falhou");
      assert.equal((await fetch(base + "/progresso", { headers: { Cookie: cookie } })).status, 410);
      const relatorioToken = new URLSearchParams(new URL(links.get(`${primeira.idPublico}:relatorio`)).hash.slice(1)).get("token");
      const relatorioAuth = { Authorization: `Bearer ${relatorioToken}` };
      assert.equal((await fetch(base + "/relatorio", { headers: auth })).status, 404);
      assert.equal((await fetch(base + "/relatorio", { headers: relatorioAuth })).status, 200);
      for (const formato of ["csv", "xlsx"]) {
        const arquivo = await fetch(base + `/relatorio/exportar?formato=${formato}`, { headers: relatorioAuth });
        assert.equal(arquivo.status, 200);
        assert.ok(arquivo.headers.get("content-disposition").includes(`.${formato}`));
        assert.ok((await arquivo.arrayBuffer()).byteLength > 10);
      }
      const disputa = await Promise.allSettled([formulario.iniciar(entrada, randomUUID()), formulario.iniciar(entrada, randomUUID())]);
      assert.equal(disputa.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(disputa.find((r) => r.status === "rejected").reason.statusCode, 409);
    } finally {
      if (servidor) await new Promise((resolve) => servidor.close(resolve));
      // Exclusivamente os registros com o Phone ID aleatório criado neste teste.
      const instancia = await db.orm.public.Instancia.where({ idNumeroTelefone: phone }).first();
      if (instancia) {
        for (const campanha of await db.orm.public.Campanha.where({ instanciaId: instancia.id }).all()) {
          await ciclo.finalizar(campanha.id, "falhou");
          const atual = await db.orm.public.Campanha.where({ id: campanha.id }).first();
          await ciclo.limparExpiradas(atual.expiraEm.add({ seconds: 1 }), campanha.id);
        }
        if (await db.orm.public.Instancia.where({ id: instancia.id }).first()) {
          await db.orm.public.Instancia.where({ id: instancia.id }).delete();
        }
      }
    }
  } finally { await db.close(); }
});
