import test from "node:test";
import assert from "node:assert/strict";
import { Temporal } from "@js-temporal/polyfill";
import ExcelJS from "exceljs";

// Chaves sintéticas: nenhum envio ou conexão ao banco neste arquivo.
process.env.CAMPAIGN_ENCRYPTION_KEY = "ab".repeat(32);
process.env.ADMIN_API_TOKEN = "a".repeat(43);
const { gerarToken, hashToken, cifrar, decifrar } = await import("../src/shared/utils/segredos.js");
const { validarAcesso } = await import("../src/Modules/Campanha/AcessoCampanhaRouter.js");
const { exportarCsv, exportarExcel } = await import("../src/Modules/Campanha/ExportacaoCampanhaService.js");
const { FormularioCampanhaService } = await import("../src/Modules/Campanha/FormularioCampanhaService.js");
const { default: app } = await import("../src/app.js");
const { default: campanhaRepository } = await import("../src/Modules/Campanha/CampanhaRepository.js");
const { analisarContatos, montarMensagem, IdentidadeSolicitacao } = await import("../public/assets/formulario-utils.js");

test("formulário monta múltiplas mensagens e contabiliza a lista sem persistir contatos", () => {
  const lista = "(11) 99999-0001,Ana\n5511999990001,Duplicada\n5511999990002,Bruno\nabc,Inválido";
  assert.deepEqual(analisarContatos(lista), { validos: 2, duplicados: 1, invalidos: 1 });
  const mensagens = [
    montarMensagem({ tipo: "texto", texto: " Olá {{nome}} " }),
    montarMensagem({ tipo: "imagem", texto: "Legenda", urlMidia: "https://example.com/imagem.png" }),
    montarMensagem({ tipo: "audio", texto: "Não enviar legenda", urlMidia: "https://example.com/audio.mp3" }),
  ];
  assert.equal(mensagens[0].texto, "Olá {{nome}}");
  assert.equal(mensagens[2].texto, undefined);
  const entrada = new FormularioCampanhaService().validar({ nome: "Teste", instancia: { idNumeroTelefone: "123456", token: "token-sintetico", email: "teste@example.com" }, lista, mensagens }, "chave-formulario-0001");
  assert.equal(entrada.mensagens.length, 3);
  assert.equal(entrada.contatos.quantidadeValidos, 2);
  assert.throws(() => montarMensagem({ tipo: "texto", texto: " " }));
  assert.throws(() => montarMensagem({ tipo: "imagem", urlMidia: "javascript:alert(1)" }));
  assert.throws(() => montarMensagem({ tipo: "video", urlMidia: "https://usuario:senha@example.com/video" }));
});

test("formulário reutiliza idempotência na repetição e guarda apenas hash e chave", async () => {
  const valores = new Map();
  const storage = { getItem: (k) => valores.get(k), setItem: (k, v) => valores.set(k, v), removeItem: (k) => valores.delete(k) };
  const identidade = new IdentidadeSolicitacao(storage);
  const body = JSON.stringify({ token: "segredo-nao-persistir", email: "privado@example.com", lista: "contatos privados" });
  const chave = await identidade.obter(body);
  assert.match(chave, /^[a-f0-9-]{36}$/);
  assert.equal(await identidade.obter(body), chave);
  assert.equal(await new IdentidadeSolicitacao(storage).obter(body), chave);
  const salvo = JSON.parse(valores.get("uzapi.solicitacao"));
  assert.deepEqual(Object.keys(salvo).sort(), ["assinatura", "chave"]);
  assert.match(salvo.assinatura, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(salvo).includes("segredo-nao-persistir"));
  assert.notEqual(await identidade.obter(body + " "), chave);
  identidade.limpar();
  assert.equal(valores.size, 0);
  assert.notEqual(await identidade.obter(body), chave);
  const semStorage = new IdentidadeSolicitacao({ getItem() { throw new Error(); }, setItem() { throw new Error(); } });
  assert.equal(await semStorage.obter(body), await semStorage.obter(body));
});

test("credenciais aleatórias e criptografia vinculada à campanha", () => {
  const token = gerarToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, gerarToken());
  const protegido = cifrar(token, "campanha-a");
  assert.equal(decifrar(protegido, "campanha-a"), token);
  assert.notEqual(protegido, cifrar(token, "campanha-a"));
  assert.throws(() => decifrar(protegido, "campanha-b"));
  assert.ok(!protegido.includes(token));
});

test("progresso e relatório possuem credenciais distintas e expiração exata", () => {
  const progresso = gerarToken();
  const relatorio = gerarToken();
  const agora = Temporal.Instant.from("2026-09-13T12:00:00Z");
  const campanha = { temporaria: true, status: "em_andamento", hashTokenAcesso: hashToken(progresso), hashTokenRelatorio: hashToken(relatorio) };
  validarAcesso(campanha, "progresso", progresso, agora);
  assert.throws(() => validarAcesso(campanha, "progresso", relatorio, agora), { statusCode: 404 });
  assert.throws(() => validarAcesso({ ...campanha, temporaria: false }, "progresso", progresso, agora), { statusCode: 404 });
  campanha.status = "concluida";
  campanha.expiraEm = agora.add({ hours: 24 });
  assert.throws(() => validarAcesso(campanha, "progresso", progresso, agora), { statusCode: 410 });
  validarAcesso(campanha, "relatorio", relatorio, agora);
  assert.throws(() => validarAcesso(campanha, "relatorio", progresso, agora), { statusCode: 404 });
  assert.throws(() => validarAcesso(campanha, "relatorio", relatorio, campanha.expiraEm), { statusCode: 410 });
});

test("exportação CSV neutraliza fórmulas e XLSX preserva texto", async () => {
  const relatorio = { contatos: [{ nome: '=HYPERLINK("https://example.invalid")', telefone: "5521999999999", status: "concluido", mensagens: [{ posicao: 1, tipo: "texto", status: "sucesso", erro: "\t=1+1" }] }] };
  const csv = exportarCsv(relatorio);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK('));
  assert.ok(csv.includes('"\'\t=1+1"'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportarExcel(relatorio));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell("A2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("B2").value, "5521999999999");
  assert.equal(sheet.getCell("A2").formula, undefined);
});

test("formulário rejeita dados incompletos antes de acessar o banco", () => {
  const servico = new FormularioCampanhaService();
  assert.throws(() => servico.validar(null, "a".repeat(32)), { statusCode: 400 });
  assert.throws(() => servico.validar({}, "curta"), { statusCode: 400 });
  assert.throws(() => servico.validar({ nome: "Teste", instancia: { idNumeroTelefone: "../outra" } }, "a".repeat(32)), { statusCode: 400 });
});

test("consulta por UUID é pública, normaliza o UUID e não expõe dados privados", async (t) => {
  const uuid = "4f03d28c-25ec-4630-bdc7-1489872754b3";
  const resumo = { id: 30, idPublico: uuid, status: "concluida", criadaEm: null, iniciadaEm: null, finalizadaEm: null, expiraEm: null };
  const consultas = [];
  t.mock.method(campanhaRepository, "buscarResumoPorUuid", async (valor) => {
    consultas.push(valor);
    return valor === uuid ? { ...resumo, emailRelatorio: "privado@example.invalid", nome: "Privado", tokenEnvioCifrado: "segredo", hashTokenAcesso: "hash", chaveIdempotencia: "chave", contatos: ["privado"] } : null;
  });
  const servidor = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  for (const valor of [uuid, uuid.toUpperCase()]) {
    const resposta = await fetch(`${base}/campanhas/uuid/${valor}`);
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    assert.deepEqual(await resposta.json(), { data: resumo });
  }
  assert.deepEqual(consultas, [uuid, uuid]);
  for (const valor of ["30", "invalido", "4f03d28c-25ec-4630-bdc7-1489872754bz"]) {
    assert.equal((await fetch(`${base}/campanhas/uuid/${valor}`)).status, 400);
  }
  assert.equal(consultas.length, 2, "UUID inválido não deve consultar o banco");
  const inexistente = await fetch(`${base}/campanhas/uuid/00000000-0000-4000-8000-000000000000`);
  assert.equal(inexistente.status, 404);
  assert.equal((await inexistente.json()).message, "Campanha não encontrada.");
  // A exceção de consulta não permite listagem nem acesso numérico sem admin.
  assert.equal((await fetch(`${base}/campanhas`)).status, 401);
  assert.equal((await fetch(`${base}/campanhas/30`)).status, 401);
});

test("tema usa Tailwind via CDN apenas nas páginas e preserva CSP restrita na API", async (t) => {
  const servidor = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const inicio = await fetch(base + "/", { redirect: "manual" });
  assert.equal(inicio.headers.get("location"), "/disparador");
  for (const rota of ["/disparador", "/acompanhamento/00000000-0000-0000-0000-000000000000", "/relatorio/00000000-0000-0000-0000-000000000000"]) {
    const resposta = await fetch(base + rota);
    assert.equal(resposta.status, 200);
    const csp = resposta.headers.get("content-security-policy");
    assert.ok(csp.includes("script-src 'self' https://cdn.jsdelivr.net/npm/@tailwindcss/"));
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"));
    assert.ok(csp.includes("style-src-attr 'none'"));
    assert.ok(!csp.includes("unsafe-eval"));
    const html = await resposta.text();
    assert.ok(html.includes('src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"'));
    assert.ok(html.includes('href="https://wa.me/5521996713197"'));
    assert.ok(html.includes('href="https://www.linkedin.com/company/uzapi/home/"'));
    for (const atributo of ["src", "href"]) {
      for (const [, caminho] of html.matchAll(new RegExp(`${atributo}="(/assets/[^\"]+)"`, "g"))) {
        assert.equal((await fetch(base + caminho)).status, 200, caminho);
      }
    }
  }
  const api = await fetch(base + "/instancias");
  assert.equal(api.status, 401);
  const cspApi = api.headers.get("content-security-policy");
  assert.ok(!cspApi.includes("cdn.jsdelivr.net"));
  assert.ok(!cspApi.includes("unsafe-inline"));
});

test("rotas antigas exigem admin; páginas não expõem dados e não permitem cache", async (t) => {
  const servidor = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => servidor.once("listening", resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  for (const rota of ["/instancias", "/contatos", "/campanhas"]) {
    assert.equal((await fetch(base + rota)).status, 401);
  }
  assert.equal((await fetch(base + "/acessos/invalido/progresso")).status, 404);
  const pagina = await fetch(base + "/relatorio/00000000-0000-0000-0000-000000000000");
  assert.equal(pagina.status, 200);
  assert.equal(pagina.headers.get("cache-control"), "no-store");
  assert.equal(pagina.headers.get("referrer-policy"), "no-referrer");
  assert.ok(pagina.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
  assert.ok(!(await pagina.text()).includes(process.env.ADMIN_API_TOKEN));
});
