import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.CAMPAIGN_ENCRYPTION_KEY = "ab".repeat(32);
const { validarConteudo, criarComprovante, validarComprovante, enviarArquivo } = await import("../src/Modules/Midia/MidiaService.js");
const { criarMidiaRouter } = await import("../src/Modules/Midia/MidiaRouter.js");
const { FormularioCampanhaService, calcularHashSolicitacao } = await import("../src/Modules/Campanha/FormularioCampanhaService.js");
const { default: uzapi } = await import("../src/shared/Integration/Uzapi.js");
const { descreverArquivo, Uploads } = await import("../public/assets/formulario-upload.js");
const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const contexto = { tipo: "imagem", phoneId: "123456", token: "token-sintetico" };
const arquivo = validarConteudo(png, "imagem", "image/png");

test("documentos validam formatos, nome e limite sem executar ou extrair conteúdo", async () => {
  const { validarNomeArquivo } = await import("../public/assets/midia-formatos.js");
  assert.equal(validarNomeArquivo("Proposta verão.xlsx"), "Proposta verão.xlsx");
  for (const nome of ["../a.pdf", "a.exe", "a.pdf\r\nHeader: valor", "", "a.xlsx.exe"]) assert.throws(() => validarNomeArquivo(nome));
  for (const [mime, bytes] of [["application/pdf", Buffer.from("%PDF-1.7")], ["application/zip", Buffer.from("504b0304", "hex")], ["text/css", Buffer.from("body { color: green; }")], ["application/json", Buffer.from('{"teste":true}')]]) {
    assert.equal(validarConteudo(bytes, "documento", mime).mime, mime);
  }
  assert.throws(() => validarConteudo(Buffer.from("falso pdf"), "documento", "application/pdf"), { statusCode: 415 });
  assert.throws(() => validarConteudo(Buffer.alloc(16 * 1024 * 1024 + 1), "documento", "application/zip"), { statusCode: 413 });
  const descriptor = await descreverArquivo(new File(["%PDF-1.7"], "Proposta verão.pdf"), "documento");
  assert.equal(descriptor.nome, "Proposta verão.pdf");
});

test("documento preserva nome assinado, aceita URL e distingue renomeação na idempotência", async () => {
  const { montarMensagem } = await import("../public/assets/formulario-utils.js");
  const documento = { ...validarConteudo(Buffer.from("%PDF-1.7"), "documento", "application/pdf"), nome: "proposta.pdf" };
  const service = new FormularioCampanhaService();
  const base = { nome: "Teste", instancia: { idNumeroTelefone: contexto.phoneId, token: contexto.token, email: "teste@example.com" }, lista: "5511999990001,A\n5511999990002,B" };
  const validar = nome => service.validar({ ...base, mensagens: [{ tipo: "documento", midiaUpload: criarComprovante({ ...contexto, tipo: "documento", arquivo: { ...documento, nome }, idMidia: "id-doc" }).midiaUpload }] }, "teste-documento-0001");
  assert.equal(validar("proposta.pdf").mensagens[0].nomeArquivo, "proposta.pdf");
  assert.notEqual(calcularHashSolicitacao(validar("proposta.pdf")), calcularHashSolicitacao(validar("outro.pdf")));
  const mensagem = montarMensagem({ tipo: "documento", nomeArquivo: "planilha.xlsx", urlMidia: "https://example.com/download", texto: "Olá {{nome}}" });
  assert.equal(service.validar({ ...base, mensagens: [mensagem] }, "teste-documento-0001").mensagens[0].nomeArquivo, "planilha.xlsx");
});

test("Uzapi recebe documento com filename, caption e ID ou link", async () => {
  const original = uzapi.criarClient;
  const chamadas = [];
  uzapi.criarClient = () => ({ post: async (...args) => { chamadas.push(args); return { data: { id: "doc-123" } }; } });
  try {
    const resultado = await enviarArquivo({ ...contexto, tipo: "documento", buffer: Buffer.from("%PDF-1.7"), mime: "application/pdf", nomeArquivo: "proposta.pdf" });
    assert.equal(chamadas[0][1].get("file").name, "proposta.pdf");
    assert.equal(validarComprovante(resultado.midiaUpload, { ...contexto, tipo: "documento" }).arquivo.nome, "proposta.pdf");
    for (const origem of [{ idMidia: "doc-123" }, { urlMidia: "https://example.com/proposta.pdf" }]) {
      await uzapi.enviarMensagem({ instancia: {}, telefone: "5511999990001", mensagem: { tipo: "documento", nomeArquivo: "proposta.pdf", texto: "Legenda", ...origem } });
      const payload = chamadas.at(-1)[1];
      assert.equal(payload.type, "document");
      assert.deepEqual(payload.document, { ...(origem.idMidia ? { id: origem.idMidia } : { link: origem.urlMidia }), filename: "proposta.pdf", caption: "Legenda" });
    }
  } finally { uzapi.criarClient = original; }
});

test("upload JSON na aplicação mantém os bytes e o nome do arquivo", async () => {
  const { default: app } = await import("../src/app.js");
  const original = uzapi.enviarMidia;
  uzapi.enviarMidia = async args => { assert.ok(Buffer.isBuffer(args.buffer)); assert.equal(args.nomeArquivo, "dados.json"); return "id-json"; };
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/midias/documento`, { method: "POST", headers: { "Content-Type": "application/json", "X-File-Name": "dados.json", "X-Phone-Id": contexto.phoneId, Authorization: `Bearer ${contexto.token}` }, body: '{"teste":true}' });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.arquivo.nome, "dados.json");
  } finally { uzapi.enviarMidia = original; await new Promise(resolve => server.close(resolve)); }
});

test("mídias verificam tamanho, formato e assinatura inicial", () => {
  assert.equal(arquivo.sha256.length, 64);
  assert.throws(() => validarConteudo(Buffer.from("<html>"), "imagem", "image/png"), { statusCode: 415 });
  assert.throws(() => validarConteudo(png, "audio", "image/png"), { statusCode: 415 });
  assert.throws(() => validarConteudo(Buffer.alloc(0), "imagem", "image/png"), { statusCode: 400 });
  assert.throws(() => validarConteudo(Buffer.alloc(5 * 1024 * 1024 + 1), "imagem", "image/png"), { statusCode: 413 });
  for (const [mime, bytes] of [["audio/mpeg", "49443300"], ["audio/ogg", "4f676753"], ["audio/aac", "fff10000"], ["audio/mp4", "00000010667479704d34412000000000"]]) {
    assert.equal(validarConteudo(Buffer.from(bytes, "hex"), "audio", mime).mime, mime);
  }
  assert.equal(validarConteudo(Buffer.from("000000106674797069736f6d00000000", "hex"), "video", "video/mp4").mime, "video/mp4");
});

test("comprovante vincula instância, credencial, tipo e expiração", () => {
  const { midiaUpload } = criarComprovante({ ...contexto, arquivo, idMidia: "midia-1" }, 1000);
  assert.equal(validarComprovante(midiaUpload, contexto, 1001).idMidia, "midia-1");
  for (const alteracao of [{ phoneId: "outra" }, { token: "outro" }, { tipo: "video" }]) assert.throws(() => validarComprovante(midiaUpload, { ...contexto, ...alteracao }, 1001), { statusCode: 400 });
  assert.throws(() => validarComprovante(`${midiaUpload}0`, contexto, 1001), { statusCode: 400 });
  assert.throws(() => validarComprovante(midiaUpload, contexto, 1000 + 86400000), { statusCode: 410 });
});

test("novo ID do mesmo arquivo não altera idempotência; conteúdo diferente altera", () => {
  const service = new FormularioCampanhaService();
  const entrada = (idMidia, metadata = arquivo) => service.validar({ nome: "Teste", instancia: { idNumeroTelefone: contexto.phoneId, token: contexto.token, email: "teste@example.com" }, lista: "5511999990001,A\n5511999990002,B", mensagens: [{ tipo: "imagem", midiaUpload: criarComprovante({ ...contexto, arquivo: metadata, idMidia }).midiaUpload }] }, "teste-upload-chave-001");
  const primeiro = entrada("id-1");
  assert.equal(primeiro.mensagens[0].idMidia, "id-1");
  assert.equal(calcularHashSolicitacao(primeiro), calcularHashSolicitacao(entrada("id-2")));
  assert.notEqual(calcularHashSolicitacao(primeiro), calcularHashSolicitacao(entrada("id-3", { ...arquivo, sha256: "a".repeat(64) })));
});

test("integração encaminha multipart e envia imagem, áudio e vídeo pelo ID", async () => {
  const original = uzapi.criarClient;
  const chamadas = [];
  uzapi.criarClient = instancia => {
    assert.equal(instancia.idNumeroTelefone, contexto.phoneId);
    return { post: async (...args) => { chamadas.push(args); return { data: { id: "midia-retornada" } }; } };
  };
  try {
    const result = await enviarArquivo({ ...contexto, buffer: png, mime: "image/png" });
    assert.equal(validarComprovante(result.midiaUpload, contexto).idMidia, "midia-retornada");
    assert.equal(chamadas[0][0], "/media");
    assert.equal(chamadas[0][1].get("messaging_product"), "whatsapp");
    assert.deepEqual(Buffer.from(await chamadas[0][1].get("file").arrayBuffer()), png);
    for (const [tipo, campo] of [["imagem", "image"], ["audio", "audio"], ["video", "video"]]) {
      await uzapi.enviarMensagem({ instancia: { idNumeroTelefone: contexto.phoneId }, telefone: "5511999990001", mensagem: { tipo, idMidia: "midia-retornada", texto: "Legenda" } });
      assert.equal(chamadas.at(-1)[1][campo].id, "midia-retornada");
      assert.equal(chamadas.at(-1)[1][campo].link, undefined);
    }
  } finally { uzapi.criarClient = original; }
});

test("endpoint recebe bytes e rejeita cabeçalhos inválidos sem chamar provedor", async () => {
  const app = express();
  let chamadas = 0;
  app.use("/midias", criarMidiaRouter(async args => {
    chamadas++;
    assert.deepEqual(args.buffer, png);
    assert.equal(args.phoneId, contexto.phoneId);
    return { midiaUpload: "comprovante-teste" };
  }));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/midias/imagem`;
    const headers = { "Content-Type": "image/png", "X-Phone-Id": contexto.phoneId, Authorization: `Bearer ${contexto.token}` };
    assert.equal((await fetch(url, { method: "POST", headers, body: png })).status, 201);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, Authorization: "" }, body: png })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "text/html" }, body: png })).status, 415);
    assert.equal(chamadas, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("navegador calcula hash dos bytes e reutiliza upload apenas no mesmo contexto", async () => {
  const file = new File([png], "teste.png", { type: "image/png" });
  const descriptor = await descreverArquivo(file, "imagem");
  assert.deepEqual(descriptor, arquivo);
  await assert.rejects(descreverArquivo(new File([png], "teste.exe"), "imagem"));
  const original = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async (url, options) => {
    chamadas++;
    assert.equal(url, "/midias/imagem");
    assert.equal(options.body, file);
    return Response.json({ data: { midiaUpload: `recibo-${chamadas}`, expiraEm: Date.now() + 86400000 } }, { status: 201 });
  };
  try {
    const uploads = new Uploads();
    const instancia = { idNumeroTelefone: contexto.phoneId, token: contexto.token };
    assert.equal(await uploads.enviar(file, "imagem", instancia, descriptor), "recibo-1");
    assert.equal(await uploads.enviar(file, "imagem", instancia, descriptor), "recibo-1");
    assert.equal(await uploads.enviar(file, "imagem", { ...instancia, token: "outra" }, descriptor), "recibo-2");
  } finally { globalThis.fetch = original; }
});
