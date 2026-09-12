import axios from "axios";
import { config } from "../config.js";
import { erroHttp } from "../utils/erros.js";

class UzapiClient {
  constructor() {
    this.baseUrl = config.uzapiBaseUrl;
  }

  normalizarToken(token) {
    if (typeof token !== "string") throw erroHttp(400, "O token da Uzapi é obrigatório.");
    const valor = token.trim().replace(/^Bearer\s+/i, "").trim();
    if (!valor || /^Bearer$/i.test(valor) || /\s/.test(valor)) {
      throw erroHttp(400, "O token da Uzapi está vazio ou possui formato inválido.");
    }
    return valor;
  }

  validarCredenciais(instancia) {
    if (typeof instancia.idNumeroTelefone !== "string" || !instancia.idNumeroTelefone.trim()) {
      throw erroHttp(400, "O Phone ID é obrigatório.");
    }
    this.normalizarToken(instancia.token);
  }

  criarClient(instancia) {
    this.validarCredenciais(instancia);
    const { idNumeroTelefone, token } = instancia;

    const version = config.uzapiVersion;

    return axios.create({
      baseURL: `${this.baseUrl}/${version}/${encodeURIComponent(idNumeroTelefone.trim())}`,

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.normalizarToken(token)}`,
      },

      timeout: 30000,
      maxRedirects: 0,
    });
  }

  async enviarMensagem({ instancia, telefone, mensagem }) {
    switch (mensagem.tipo) {
      case "texto":
        return this.enviarTexto({
          instancia,
          telefone,
          mensagem,
        });

      case "link":
        return this.enviarLink({
          instancia,
          telefone,
          mensagem,
        });

      case "imagem":
        return this.enviarImagem({
          instancia,
          telefone,
          mensagem,
        });

      case "video":
        return this.enviarVideo({
          instancia,
          telefone,
          mensagem,
        });

      case "audio":
        return this.enviarAudio({
          instancia,
          telefone,
          mensagem,
        });

      default:
        throw new Error(`Tipo de mensagem não suportado: ${mensagem.tipo}`);
    }
  }

  async enviarTexto({ instancia, telefone, mensagem }) {
    const client = this.criarClient(instancia);

    const payload = {
      to: telefone,
      type: "text",
      delayMessage: 0,

      text: {
        preview_url: true,
        body: mensagem.texto,
      },
    };

    return this.executarEnvio(client, payload);
  }

  async enviarLink({ instancia, telefone, mensagem }) {
    const client = this.criarClient(instancia);

    const payload = {
      to: telefone,
      type: "text",
      delayMessage: 0,

      text: {
        preview_url: true,
        body: mensagem.texto,
      },
    };

    return this.executarEnvio(client, payload);
  }

  async enviarImagem({ instancia, telefone, mensagem }) {
    const client = this.criarClient(instancia);

    const payload = {
      to: telefone,
      type: "image",
      delayMessage: 0,

      image: {
        link: mensagem.urlMidia,
      },
    };

    if (mensagem.texto) {
      payload.image.caption = mensagem.texto;
    }

    return this.executarEnvio(client, payload);
  }

  async enviarVideo({ instancia, telefone, mensagem }) {
    const client = this.criarClient(instancia);

    const payload = {
      to: telefone,
      type: "video",
      delayMessage: 0,

      video: {
        link: mensagem.urlMidia,
      },
    };

    if (mensagem.texto) {
      payload.video.caption = mensagem.texto;
    }

    return this.executarEnvio(client, payload);
  }

  async enviarAudio({ instancia, telefone, mensagem }) {
    const client = this.criarClient(instancia);

    const payload = {
      to: telefone,
      type: "audio",
      delayMessage: 0,

      audio: {
        link: mensagem.urlMidia,
      },
    };

    return this.executarEnvio(client, payload);
  }

  async executarEnvio(client, payload) {
    try {
      const response = await client.post("/messages", payload);

      return response.data;
    } catch (error) {
      const status = Number.isInteger(error.response?.status) ? error.response.status : 502;
      let detalhe = error.response?.data;
      for (let nivel = 0; nivel < 5 && detalhe && typeof detalhe === "object"; nivel++) {
        detalhe = detalhe.message ?? detalhe.error;
      }
      // O corpo remoto pode repetir credenciais ou dados pessoais. Converte em diagnóstico conhecido.
      let mensagemSegura = `A Uzapi recusou o envio (HTTP ${status}).`;
      if (!error.response) mensagemSegura = "Não foi possível confirmar o envio à Uzapi: falha de conexão ou timeout.";
      if (status === 401) {
        mensagemSegura = typeof detalhe === "string" && /access token não informado/i.test(detalhe)
          ? "Uzapi: Access Token não informado (HTTP 401). Confira a credencial e o cabeçalho Authorization."
          : "Uzapi: credencial não autorizada (HTTP 401). Confira o token e o Phone ID.";
      }
      if (status === 403) mensagemSegura = "Uzapi: acesso negado à instância (HTTP 403).";
      if (status === 429) mensagemSegura = "Uzapi: limite de requisições atingido (HTTP 429).";
      throw Object.assign(new Error(mensagemSegura), { statusCode: status, origem: "uzapi", mensagemSegura });
    }
  }
}

export default new UzapiClient();
