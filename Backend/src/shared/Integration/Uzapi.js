import axios from "axios";
import { config } from "../config.js";
import { erroHttp } from "../utils/erros.js";

class UzapiClient {
  constructor() {
    this.baseUrl = config.uzapiBaseUrl;
  }

  normalizarToken(token) {
    if (typeof token !== "string")
      throw erroHttp(400, "O token da Uzapi é obrigatório.");
    const valor = token
      .trim()
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!valor || /^Bearer$/i.test(valor) || /\s/.test(valor)) {
      throw erroHttp(
        400,
        "O token da Uzapi está vazio ou possui formato inválido.",
      );
    }
    return valor;
  }

  validarCredenciais(instancia) {
    if (
      typeof instancia.idNumeroTelefone !== "string" ||
      !instancia.idNumeroTelefone.trim()
    ) {
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
    if (mensagem.tipo === "documento") {
      return this.executarEnvio(this.criarClient(instancia), {
        to: telefone, delayMessage: 0, type: "document",
        document: { ...(mensagem.idMidia ? { id: mensagem.idMidia } : { link: mensagem.urlMidia }),
          filename: mensagem.nomeArquivo, ...(mensagem.texto ? { caption: mensagem.texto } : {}) },
      });
    }
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
      case "document":
        return this.enviarDocumento({
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
    async enviarDocumento({ instancia, telefone, mensagem }) {
    const client = this.criarClient(instancia);

    const payload = {
      to: telefone,
      type: "document",
      delayMessage: 0,

      document: {
        id: "",
        caption: "Documento de teste",
        filneme: mensagem.texto
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
        ...(mensagem.idMidia
          ? { id: mensagem.idMidia }
          : { link: mensagem.urlMidia }),
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
        ...(mensagem.idMidia
          ? { id: mensagem.idMidia }
          : { link: mensagem.urlMidia }),
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
        ...(mensagem.idMidia
          ? { id: mensagem.idMidia }
          : { link: mensagem.urlMidia }),
      },
    };

    return this.executarEnvio(client, payload);
  }

  async enviarMidia({ buffer, mime, phoneId, token, nomeArquivo, signal }) {
    const extensoes = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/aac": "aac",
      "video/mp4": "mp4",
    };
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append(
      "file",
      new Blob([buffer], { type: mime }),
      nomeArquivo || `midia.${extensoes[mime]}`,
    );
    const resposta = await this.executarEnvio(
      this.criarClient({ idNumeroTelefone: phoneId, token }),
      form,
      "/media",
      {
        headers: { "Content-Type": undefined },
        timeout: 60000,
        maxBodyLength: 18 * 1024 * 1024,
        maxContentLength: 256 * 1024,
        signal,
      },
    );
    const id = resposta?.id ?? resposta?.data?.id;
    if (id == null || !/^[A-Za-z0-9_-]{1,512}$/.test(String(id)))
      throw erroHttp(502, "A Uzapi não retornou um ID de mídia válido.");
    return String(id);
  }

  async executarEnvio(client, payload, rota = "/messages", opcoes = undefined) {
    try {
      const response = await client.post(rota, payload, opcoes);

      return response.data;
    } catch (error) {
      const status = Number.isInteger(error.response?.status)
        ? error.response.status
        : 502;
      let detalhe = error.response?.data;
      for (
        let nivel = 0;
        nivel < 5 && detalhe && typeof detalhe === "object";
        nivel++
      ) {
        detalhe = detalhe.message ?? detalhe.error;
      }
      // O corpo remoto pode repetir credenciais ou dados pessoais. Converte em diagnóstico conhecido.
      let mensagemSegura = `A Uzapi recusou o envio (HTTP ${status}).`;
      if (!error.response)
        mensagemSegura =
          "Não foi possível confirmar o envio à Uzapi: falha de conexão ou timeout.";
      if (status === 401) {
        mensagemSegura =
          typeof detalhe === "string" &&
          /access token não informado/i.test(detalhe)
            ? "Uzapi: Access Token não informado (HTTP 401). Confira a credencial e o cabeçalho Authorization."
            : "Uzapi: credencial não autorizada (HTTP 401). Confira o token e o Phone ID.";
      }
      if (status === 403)
        mensagemSegura = "Uzapi: acesso negado à instância (HTTP 403).";
      if (status === 429)
        mensagemSegura = "Uzapi: limite de requisições atingido (HTTP 429).";
      throw Object.assign(new Error(mensagemSegura), {
        statusCode: status,
        origem: "uzapi",
        mensagemSegura,
      });
    }
  }
}

export default new UzapiClient();
