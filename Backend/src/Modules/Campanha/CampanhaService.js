import campanhaRepository from "./CampanhaRepository.js";
import instanciaRepository from "../Instancia/InstanciaRepository.js";
import contatoService from "../Contato/ContatoService.js";
import disparadorService from "../Disparo/DisparadorService.js";
import resultadoMensagemRepository from "../ResultadoMensagem/ResultadoMensagemRepository.js";
import { normalizarEmail } from "../../shared/utils/normalizarEmail.js";

class CampanhaService {
  tiposPermitidos = ["texto", "link", "imagem", "video", "audio"];

  validarMensagens(mensagens) {
    if (!Array.isArray(mensagens)) {
      const error = new Error("As mensagens da campanha são obrigatórias.");

      error.statusCode = 400;
      throw error;
    }

    if (mensagens.length < 1 || mensagens.length > 3) {
      const error = new Error("A campanha deve possuir entre 1 e 3 mensagens.");

      error.statusCode = 400;
      throw error;
    }

    mensagens.forEach((mensagem, index) => {
      if (
        !mensagem ||
        typeof mensagem.tipo !== "string" ||
        !mensagem.tipo.trim()
      ) {
        const error = new Error(
          `O tipo da mensagem ${index + 1} é obrigatório.`,
        );

        error.statusCode = 400;
        throw error;
      }

      const tipo = mensagem.tipo.toLowerCase();

      if (!this.tiposPermitidos.includes(tipo)) {
        const error = new Error(
          `Tipo de mensagem não suportado: ${mensagem.tipo}.`,
        );

        error.statusCode = 400;
        throw error;
      }

      /*
       * TEXTO
       */
      if (
        tipo === "texto" &&
        (typeof mensagem.texto !== "string" || !mensagem.texto.trim())
      ) {
        const error = new Error(
          `A mensagem ${index + 1} precisa possuir texto.`,
        );

        error.statusCode = 400;
        throw error;
      }

      /*
       * LINK
       *
       * Na UZAPI será enviado como type "text"
       * com preview_url = true.
       */
      if (
        tipo === "link" &&
        (typeof mensagem.texto !== "string" || !mensagem.texto.trim())
      ) {
        const error = new Error(
          `A mensagem ${index + 1} precisa possuir o link/texto.`,
        );

        error.statusCode = 400;
        throw error;
      }

      /*
       * MÍDIA
       */
      if (
        ["imagem", "video", "audio"].includes(tipo) &&
        !mensagem.urlMidia &&
        !mensagem.idMidia
      ) {
        const error = new Error(
          `A mensagem ${index + 1} precisa possuir uma mídia.`,
        );

        error.statusCode = 400;
        throw error;
      }
    });
  }
  async iniciar(id) {
    return disparadorService.iniciar(id);
  }

  async cadastrar(data) {
    const { instanciaId, nome, emailRelatorio, lista, mensagens } = data;

    /*
     * Dados básicos
     */
    if (!Number.isInteger(Number(instanciaId)) || Number(instanciaId) <= 0) {
      const error = new Error("A instância é obrigatória.");

      error.statusCode = 400;
      throw error;
    }

    if (typeof nome !== "string" || !nome.trim()) {
      const error = new Error("O nome da campanha é obrigatório.");

      error.statusCode = 400;
      throw error;
    }

    /*
     * Verifica instância
     */
    const instancia = await instanciaRepository.buscarPorId(
      Number(instanciaId),
    );

    if (!instancia) {
      const error = new Error("Instância não encontrada.");

      error.statusCode = 404;
      throw error;
    }

    if (!instancia.ativo) {
      const error = new Error("A instância selecionada está desativada.");

      error.statusCode = 400;
      throw error;
    }

    /*
     * Valida mensagens
     */
    this.validarMensagens(mensagens);

    // Mantém um destinatário próprio na campanha, mesmo se a instância mudar depois.
    const usarEmailInstancia = emailRelatorio == null ||
      (typeof emailRelatorio === "string" && !emailRelatorio.trim());
    const destinatarioRelatorio = normalizarEmail(
      usarEmailInstancia ? instancia.email : emailRelatorio,
    );

    const resultadoContatos = contatoService.parsearLista(lista);
    const campanha = await campanhaRepository.cadastrarCompleta(
      {
        instanciaId: Number(instanciaId),
        nome: nome.trim(),
        emailRelatorio: destinatarioRelatorio,
      },
      resultadoContatos.validos,
      mensagens.map((mensagem, index) => ({
        posicao: index + 1,
        tipo: mensagem.tipo.toLowerCase(),
        texto:
          typeof mensagem.texto === "string"
            ? mensagem.texto.trim() || null
            : null,
        urlMidia: mensagem.urlMidia || null,
        idMidia: mensagem.idMidia || null,
      })),
    );

    return {
      id: campanha.id,
      nome: campanha.nome,
      instanciaId: campanha.instanciaId,
      status: campanha.status,
      emailRelatorio: campanha.emailRelatorio,

      contatos: {
        total: resultadoContatos.quantidadeTotal,

        validos: resultadoContatos.quantidadeValidos,

        invalidos: resultadoContatos.quantidadeInvalidos,
      },

      quantidadeMensagens: mensagens.length,
    };
  }

  async listar() {
    return campanhaRepository.listar();
  }

  async buscarPorId(id) {
    const campanha = await campanhaRepository.buscarPorId(id);

    if (!campanha) {
      const error = new Error("Campanha não encontrada.");

      error.statusCode = 404;
      throw error;
    }

    const contatos = await campanhaRepository.buscarContatos(id);

    const mensagens = await campanhaRepository.buscarMensagens(id);

    return {
      id: campanha.id,
      instanciaId: campanha.instanciaId,
      nome: campanha.nome,
      emailRelatorio: campanha.emailRelatorio,
      status: campanha.status,
      iniciadaEm: campanha.iniciadaEm,
      finalizadaEm: campanha.finalizadaEm,

      quantidadeContatos: contatos.length,

      mensagens,
    };
  }
  async progresso(id) {
    const campanha = await campanhaRepository.buscarPorId(id);

    if (!campanha) {
      const error = new Error("Campanha não encontrada.");

      error.statusCode = 404;
      throw error;
    }

    const [
      pendentes,
      processando,
      concluidos,
      parciais,
      falhos,
      mensagensPendentes,
      mensagensSucesso,
      mensagensFalha,
    ] = await Promise.all([
      campanhaRepository.contarContatosPorStatus(id, "pendente"),

      campanhaRepository.contarContatosPorStatus(id, "processando"),

      campanhaRepository.contarContatosPorStatus(id, "concluido"),

      campanhaRepository.contarContatosPorStatus(id, "parcial"),

      campanhaRepository.contarContatosPorStatus(id, "falhou"),

      campanhaRepository.contarMensagensPorStatusCampanha(id, "pendente"),

      campanhaRepository.contarMensagensPorStatusCampanha(id, "sucesso"),

      campanhaRepository.contarMensagensPorStatusCampanha(id, "falhou"),
    ]);

    const totalContatos =
      pendentes + processando + concluidos + parciais + falhos;

    const processados = concluidos + parciais + falhos;

    const percentual =
      totalContatos > 0 ? Math.round((processados / totalContatos) * 100) : 0;

    return {
      campanhaId: campanha.id,
      nome: campanha.nome,
      status: campanha.status,

      contatos: {
        total: totalContatos,
        pendentes,
        processando,
        concluidos,
        parciais,
        falhos,
        processados,
      },

      mensagens: {
        pendentes: mensagensPendentes,
        sucesso: mensagensSucesso,
        falhou: mensagensFalha,

        total: mensagensPendentes + mensagensSucesso + mensagensFalha,
      },

      progresso: percentual,

      iniciadaEm: campanha.iniciadaEm,
      finalizadaEm: campanha.finalizadaEm,
    };
  }
  async relatorio(id) {
    const campanha = await campanhaRepository.buscarPorId(id);

    if (!campanha) {
      const error = new Error("Campanha não encontrada.");

      error.statusCode = 404;
      throw error;
    }

    const campanhaContatos = await campanhaRepository.buscarContatos(id);

    const mensagens = await campanhaRepository.buscarMensagens(id);

    const contatosRelatorio = [];

    for (const campanhaContato of campanhaContatos) {
      const contato = await campanhaRepository.buscarContatoPorId(
        campanhaContato.contatoId,
      );

      if (!contato) {
        continue;
      }

      const mensagensRelatorio = [];

      for (const mensagem of mensagens) {
        const resultado = await resultadoMensagemRepository.buscarResultado(
          mensagem.id,
          campanhaContato.id,
        );

        mensagensRelatorio.push({
          mensagemId: mensagem.id,
          posicao: mensagem.posicao,
          tipo: mensagem.tipo,

          status: resultado?.status || "pendente",

          idFila: resultado?.idFila || null,

          idMensagem: resultado?.idMensagem || null,

          erro: resultado?.erro || null,

          enviadaEm: resultado?.enviadaEm || null,
        });
      }

      contatosRelatorio.push({
        id: contato.id,
        nome: contato.nome,
        telefone: contato.telefone,

        status: campanhaContato.status,

        iniciadoEm: campanhaContato.iniciadoEm,

        finalizadoEm: campanhaContato.finalizadoEm,

        mensagens: mensagensRelatorio,
      });
    }

    return {
      campanhaId: campanha.id,
      nome: campanha.nome,
      status: campanha.status,

      iniciadaEm: campanha.iniciadaEm,

      finalizadaEm: campanha.finalizadaEm,

      totalContatos: contatosRelatorio.length,

      quantidadeMensagens: mensagens.length,

      contatos: contatosRelatorio,
    };
  }
}

export default new CampanhaService();
