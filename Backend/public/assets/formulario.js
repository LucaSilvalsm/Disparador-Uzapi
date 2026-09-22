import { analisarContatos, montarMensagem, IdentidadeSolicitacao } from "./formulario-utils.js";
import { MIDIAS, validarArquivo } from "./midia-formatos.js";
import { descreverArquivo, Uploads } from "./formulario-upload.js";
const uploads = new Uploads();

const el = (id) => document.getElementById(id);
const form = el("form-disparo");
const mensagens = el("mensagens");
const cards = () => [...mensagens.children];
let storage;
try { storage = window.sessionStorage; } catch { /* Navegação restrita: usar memória. */ }
const identidade = new IdentidadeSolicitacao(storage);
let enviando = false;
const campo = (card, nome) => card.querySelector(`[data-campo="${nome}"]`);

function resumo() {
  const lista = analisarContatos(el("lista").value);
  el("lista-resumo").textContent = `${lista.validos} válidos · ${lista.invalidos} inválidos · ${lista.duplicados} duplicados`;
  el("revisao-contatos").textContent = lista.validos;
  el("revisao-mensagens").textContent = cards().length;
  el("revisao-envios").textContent = lista.validos * cards().length;
}

function ordenar() {
  const todos = cards();
  todos.forEach((card, index) => {
    card.querySelector(".mensagem-titulo").textContent = `Mensagem ${index + 1}`;
    for (const acao of ["subir", "descer", "remover"]) {
      const botao = card.querySelector(`[data-acao="${acao}"]`);
      botao.disabled = acao === "subir" ? index === 0 : acao === "descer" ? index === todos.length - 1 : todos.length === 1;
      botao.setAttribute("aria-label", acao === "remover" ? `Remover mensagem ${index + 1}` : `Mover mensagem ${index + 1} para ${acao === "subir" ? "cima" : "baixo"}`);
    }
  });
  el("adicionar-mensagem").disabled = todos.length >= 3;
  el("quantidade-mensagens").textContent = `${todos.length} de 3 mensagens`;
  resumo();
}

function configurarTipo(card) {
  const tipo = campo(card, "tipo").value;
  const midia = ["imagem", "video", "audio", "documento"].includes(tipo);
  card.querySelector('[data-grupo="midia"]').hidden = !midia;
  card.querySelector('[data-grupo="nomeArquivo"]').hidden = tipo !== "documento" || campo(card, "origemMidia").value !== "url";
  campo(card, "nomeArquivo").disabled = tipo !== "documento" || campo(card, "origemMidia").value !== "url";
  campo(card, "nomeArquivo").required = !campo(card, "nomeArquivo").disabled;
  const arquivo = midia && campo(card, "origemMidia").value === "arquivo";
  campo(card, "origemMidia").disabled = !midia;
  card.querySelector('[data-grupo="arquivo"]').hidden = !arquivo;
  card.querySelector('[data-grupo="url"]').hidden = !midia || arquivo;
  campo(card, "arquivo").disabled = !arquivo;
  campo(card, "arquivo").required = arquivo;
  campo(card, "arquivo").accept = MIDIAS[tipo]?.accept || "";
  campo(card, "arquivo").setCustomValidity("");
  card.querySelector('[data-ajuda="arquivo"]').textContent = MIDIAS[tipo]?.ajuda || "";
  campo(card, "urlMidia").disabled = !midia || arquivo;
  campo(card, "urlMidia").required = midia && !arquivo;
  campo(card, "urlMidia").setCustomValidity("");
  card.querySelector('[data-grupo="texto"]').hidden = tipo === "audio";
  campo(card, "texto").disabled = tipo === "audio";
  campo(card, "texto").required = !midia;
  card.querySelector('[data-rotulo="texto"]').textContent = midia ? "Legenda (opcional)" : tipo === "link" ? "Texto com o link" : "Texto da mensagem";
}

function adicionar(focar = true) {
  if (cards().length >= 3) return;
  const card = el("mensagem-template").content.firstElementChild.cloneNode(true);
  mensagens.append(card);
  configurarTipo(card);
  ordenar();
  if (focar) campo(card, "tipo").focus();
}

el("adicionar-mensagem").addEventListener("click", () => adicionar());
mensagens.addEventListener("change", (event) => {
  if (event.target.matches('[data-campo="tipo"], [data-campo="origemMidia"]')) configurarTipo(event.target.closest(".mensagem-card"));
});
mensagens.addEventListener("click", (event) => {
  const botao = event.target.closest("button[data-acao]");
  if (!botao || botao.disabled) return;
  const card = botao.closest(".mensagem-card");
  const acao = botao.dataset.acao;
  if (acao === "remover" && cards().length > 1) {
    card.remove();
    el("adicionar-mensagem").focus();
  } else if (acao === "subir" && card.previousElementSibling) mensagens.insertBefore(card, card.previousElementSibling);
  else if (acao === "descer" && card.nextElementSibling) mensagens.insertBefore(card.nextElementSibling, card);
  ordenar();
});
form.addEventListener("input", (event) => {
  event.target.setCustomValidity?.("");
  resumo();
});
el("mostrar-token").addEventListener("click", () => {
  const mostrar = el("token").type === "password";
  el("token").type = mostrar ? "text" : "password";
  el("mostrar-token").textContent = mostrar ? "Ocultar" : "Mostrar";
  el("mostrar-token").setAttribute("aria-pressed", String(mostrar));
});

function aviso(texto) { el("form-aviso").textContent = texto; }

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (enviando) return;
  aviso("");
  for (const id of ["nome", "phone-id", "email", "token"]) {
    el(id).value = el(id).value.trim();
    el(id).setCustomValidity(el(id).value ? "" : "Preencha este campo.");
  }
  const contatos = analisarContatos(el("lista").value);
  el("lista").setCustomValidity(contatos.validos < 2 ? "Informe pelo menos 2 contatos válidos e diferentes." : "");
  if (!form.reportValidity()) return;
  let body, dados;
  const arquivos = [];
  try {
    dados = {
      nome: el("nome").value,
      instancia: { idNumeroTelefone: el("phone-id").value, token: el("token").value, email: el("email").value },
      lista: el("lista").value,
      mensagens: cards().map((card, index) => {
        const tipo = campo(card, "tipo").value;
        if (MIDIAS[tipo] && campo(card, "origemMidia").value === "arquivo") {
          const file = campo(card, "arquivo").files[0];
          validarArquivo(file, tipo);
          arquivos.push({ file, tipo, index });
          return { tipo, ...(tipo !== "audio" && campo(card, "texto").value.trim() ? { texto: campo(card, "texto").value.trim() } : {}) };
        }
        return montarMensagem({ tipo, texto: campo(card, "texto").value, urlMidia: campo(card, "urlMidia").value, nomeArquivo: campo(card, "nomeArquivo").value });
      }),
    };
    body = JSON.stringify(dados);
    if (new TextEncoder().encode(body).length > 256 * 1024) throw new Error("O formulário excede 256 KB. Reduza a lista ou o conteúdo das mensagens.");
    if (!window.crypto?.subtle || !window.crypto?.randomUUID) throw new Error("Abra o formulário por HTTPS ou localhost para iniciar uma campanha com segurança.");
  } catch (error) { aviso(error.message); el("form-aviso").focus(); return; }
  enviando = true;
  el("campos").disabled = true;
  el("confirmacao").disabled = true;
  el("enviar").disabled = true;
  el("enviar").textContent = "Iniciando campanha…";
  form.setAttribute("aria-busy", "true");
  const controller = new AbortController();
  let timeout;
  try {
    for (const item of arquivos) {
      item.arquivo = await descreverArquivo(item.file, item.tipo);
      dados.mensagens[item.index].arquivo = item.arquivo;
    }
    body = JSON.stringify(dados);
    const chave = await identidade.obter(body);
    for (const [index, item] of arquivos.entries()) {
      el("enviar").textContent = `Enviando arquivo ${index + 1} de ${arquivos.length}…`;
      const comprovante = await uploads.enviar(item.file, item.tipo, dados.instancia, item.arquivo);
      delete dados.mensagens[item.index].arquivo;
      dados.mensagens[item.index].midiaUpload = comprovante;
    }
    body = JSON.stringify(dados);
    el("enviar").textContent = "Iniciando campanha…";
    timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch("/disparos", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": chave },
      body, signal: controller.signal, credentials: "same-origin",
    });
    let retorno;
    try { retorno = await response.json(); } catch { throw new Error("Resposta não reconhecida. O início pode ter sido recebido. Repita sem alterar os dados para reutilizar a mesma chave."); }
    if (!response.ok) {
      const mensagem = typeof retorno.message === "string" ? retorno.message : "Não foi possível iniciar a campanha.";
      const referencia = typeof retorno.errorId === "string" ? ` Referência: ${retorno.errorId}` : "";
      throw new Error(mensagem + referencia);
    }
    if (![200, 202].includes(response.status) || typeof retorno.data?.campanhaId !== "string") throw new Error("Não foi possível confirmar o início. Repita sem alterar os dados para reutilizar a mesma chave.");
    const data = retorno.data;
    el("resultado-titulo").textContent = data.repetida ? "Esta solicitação já foi recebida." : "Sua campanha foi iniciada.";
    el("resultado-descricao").textContent = data.repetida
      ? "Recuperamos a campanha desta solicitação, sem iniciar outro envio. Consulte os links enviados por e-mail."
      : `O processamento continuará em segundo plano. O link de acompanhamento será enviado para ${el("email").value}. Confira também a caixa de spam.`;
    el("resultado-uuid").textContent = data.campanhaId;
    el("resultado-status").textContent = data.status || "Recebida";
    el("resultado-contatos").textContent = data.contatos ? `${data.contatos.validos} contatos válidos · ${data.contatos.invalidos} descartados · Saldo antes da campanha: ${data.saldoAntesDaCampanha}` : "";
    el("token").value = "";
    cards().forEach(card => { campo(card, "arquivo").value = ""; });
    uploads.limpar();
    el("token").type = "password";
    form.hidden = true;
    el("resultado").hidden = false;
    el("resultado").focus();
  } catch (error) {
    aviso(error.name === "AbortError" || error instanceof TypeError
      ? "Não foi possível confirmar a resposta. A campanha pode ter iniciado. Tente novamente sem alterar os dados: a mesma chave evita duplicação."
      : error.message);
    el("form-aviso").focus();
  } finally {
    clearTimeout(timeout);
    body = null;
    enviando = false;
    el("campos").disabled = false;
    el("confirmacao").disabled = false;
    el("enviar").disabled = false;
    el("enviar").textContent = "Iniciar campanha ↗";
    form.setAttribute("aria-busy", "false");
  }
});

el("nova-campanha").addEventListener("click", () => {
  identidade.limpar();
  uploads.limpar();
  form.reset();
  el("token").type = "password";
  el("mostrar-token").textContent = "Mostrar";
  el("mostrar-token").setAttribute("aria-pressed", "false");
  mensagens.replaceChildren();
  adicionar(false);
  aviso("");
  el("resultado").hidden = true;
  form.hidden = false;
  el("nome").focus();
});

adicionar(false);
el("enviar").disabled = false;
