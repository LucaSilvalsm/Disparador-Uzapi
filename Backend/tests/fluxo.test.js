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
