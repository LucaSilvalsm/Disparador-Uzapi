import { validarNomeArquivo } from "./midia-formatos.js";
// Regras de apresentação; o backend continua sendo a autoridade de validação.
export function analisarContatos(lista) {
  const encontrados = new Set();
  let invalidos = 0;
  let duplicados = 0;
  for (const linha of lista.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    let telefone = linha.split(",")[0].trim().replace(/\D/g, "");
    if (telefone && !telefone.startsWith("55")) telefone = `55${telefone}`;
    if (!/^\d{12,13}$/.test(telefone)) invalidos++;
    else if (encontrados.has(telefone)) duplicados++;
    else encontrados.add(telefone);
  }
  return { validos: encontrados.size, invalidos, duplicados };
}

export function montarMensagem({ tipo, texto, urlMidia, nomeArquivo }) {
  if (!["texto", "link", "imagem", "video", "audio", "documento"].includes(tipo)) throw new Error("Tipo de mensagem inválido.");
  const mensagem = { tipo };
  if (tipo === "documento") mensagem.nomeArquivo = validarNomeArquivo(nomeArquivo);
  if (tipo !== "audio" && texto?.trim()) mensagem.texto = texto.trim();
  if (["imagem", "video", "audio", "documento"].includes(tipo)) {
    let url;
    try { url = new URL(urlMidia.trim()); } catch { throw new Error("Informe uma URL HTTP ou HTTPS válida para a mídia."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 4000) throw new Error("Use uma URL HTTP/HTTPS sem usuário ou senha para a mídia.");
    mensagem.urlMidia = urlMidia.trim();
  } else if (!mensagem.texto) throw new Error("Preencha o texto de todas as mensagens.");
  return mensagem;
}

// Apenas UUID e hash ficam na sessão. Nunca persistir token, e-mail, lista ou conteúdo.
export class IdentidadeSolicitacao {
  constructor(storage, crypto = globalThis.crypto) { this.storage = storage; this.crypto = crypto; this.anterior = null; }
  async obter(body) {
    const bytes = new TextEncoder().encode(body);
    const digest = await this.crypto.subtle.digest("SHA-256", bytes);
    const assinatura = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    if (!this.anterior) {
      try { this.anterior = JSON.parse(this.storage?.getItem("uzapi.solicitacao") || "null"); } catch { /* sessão indisponível */ }
    }
    if (this.anterior?.assinatura === assinatura && /^[a-f0-9-]{36}$/.test(this.anterior.chave || "")) return this.anterior.chave;
    this.anterior = { assinatura, chave: this.crypto.randomUUID() };
    try { this.storage?.setItem("uzapi.solicitacao", JSON.stringify(this.anterior)); } catch { /* repetição protegida em memória */ }
    return this.anterior.chave;
  }
  limpar() {
    this.anterior = null;
    try { this.storage?.removeItem("uzapi.solicitacao"); } catch { /* sessão indisponível */ }
  }
}
