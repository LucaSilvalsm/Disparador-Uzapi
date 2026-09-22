import { validarArquivo } from "./midia-formatos.js";

export async function descreverArquivo(file, tipo) {
  const mime = validarArquivo(file, tipo);
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return { sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join(""), tamanho: file.size, mime, ...(tipo === "documento" ? { nome: file.name.trim() } : {}) };
}

// Recibos e arquivos ficam apenas em memória; nunca em localStorage/sessionStorage.
export class Uploads {
  constructor() { this.cache = new WeakMap(); }
  async enviar(file, tipo, instancia, arquivo) {
    const contexto = JSON.stringify([tipo, instancia.idNumeroTelefone, instancia.token]);
    const anterior = this.cache.get(file);
    if (anterior?.contexto === contexto && anterior.expiraEm > Date.now() + 60000) return anterior.midiaUpload;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`/midias/${tipo}`, {
        method: "POST", headers: { "Content-Type": arquivo.mime, "X-Phone-Id": instancia.idNumeroTelefone,
          ...(tipo === "documento" ? { "X-File-Name": encodeURIComponent(arquivo.nome) } : {}),
          Authorization: `Bearer ${instancia.token.replace(/^Bearer\s+/i, "").trim()}` },
        body: file, signal: controller.signal, credentials: "same-origin",
      });
      const retorno = await response.json();
      if (!response.ok) throw new Error(retorno.message || "Não foi possível enviar o arquivo.");
      if (typeof retorno.data?.midiaUpload !== "string") throw new Error("O upload não retornou um comprovante válido.");
      this.cache.set(file, { contexto, ...retorno.data });
      return retorno.data.midiaUpload;
    } finally { clearTimeout(timeout); }
  }
  limpar() { this.cache = new WeakMap(); }
}
