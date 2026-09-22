import campanhaRepository from "./CampanhaRepository.js";
import instanciaRepository from "../Instancia/InstanciaRepository.js";
import contatoService from "../Contato/ContatoService.js";
import disparadorService from "../Disparo/DisparadorService.js";
import { normalizarEmail } from "../../shared/utils/normalizarEmail.js";
import { erroHttp } from "../../shared/utils/erros.js";
import { validarNomeArquivo } from "../../../public/assets/midia-formatos.js";

export class CampanhaService {
  constructor(repository = campanhaRepository) {
    this.repository = repository;
  }
  tiposPermitidos = ["texto", "link", "imagem", "video", "audio", "documento"];

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
        typeof mensagem !== "object" ||
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
      if (tipo === "documento") {
        try {
          validarNomeArquivo(mensagem.nomeArquivo);
        } catch {
          throw erroHttp(
            400,
            "Nome de arquivo inválido ou extensão não permitida.",
          );
        }
      }

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
        ["imagem", "video", "audio", "documento"].includes(tipo) &&
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
    const usarEmailInstancia =
      emailRelatorio == null ||
      (typeof emailRelatorio === "string" && !emailRelatorio.trim());
    const destinatarioRelatorio = normalizarEmail(
      usarEmailInstancia ? instancia.email : emailRelatorio,
    );

    const resultadoContatos = contatoService.parsearLista(lista);
    const campanha = await this.repository.cadastrarCompleta(
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
        nomeArquivo: mensagem.nomeArquivo || null,
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
    return this.repository.listar();
  }

  async buscarPorUuid(uuid) {
    if (
      typeof uuid !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      )
    ) {
      throw erroHttp(400, "UUID da campanha inválido.");
    }
    const campanha = await this.repository.buscarResumoPorUuid(
      uuid.toLowerCase(),
    );
    if (!campanha) throw erroHttp(404, "Campanha não encontrada.");

    // Consulta pública provisória: nunca retornar o registro completo da campanha.
    return {
      id: campanha.id,
      idPublico: campanha.idPublico,
      status: campanha.status,
      criadaEm: campanha.criadaEm,
      iniciadaEm: campanha.iniciadaEm,
      finalizadaEm: campanha.finalizadaEm,
      expiraEm: campanha.expiraEm,
    };
  }

  async buscarPorId(id) {
    const campanha = await this.repository.buscarPorId(id);

    if (!campanha) {
      const error = new Error("Campanha não encontrada.");

      error.statusCode = 404;
      throw error;
    }

    const contatos = await this.repository.buscarContatos(id);

    const mensagens = await this.repository.buscarMensagens(id);

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
    const campanha = await this.repository.buscarPorId(id);

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
      mensagensSucesso,
      mensagensFalha,
    ] = await Promise.all([
      this.repository.contarContatosPorStatus(id, "pendente"),

      this.repository.contarContatosPorStatus(id, "processando"),

      this.repository.contarContatosPorStatus(id, "concluido"),

      this.repository.contarContatosPorStatus(id, "parcial"),

      this.repository.contarContatosPorStatus(id, "falhou"),

      this.repository.contarMensagensPorStatusCampanha(id, "sucesso"),

      this.repository.contarMensagensPorStatusCampanha(id, "falhou"),
    ]);

    const quantidadeMensagens = (await this.repository.buscarMensagens(id))
      .length;
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
        restantes: pendentes + processando,
      },

      mensagens: {
        pendentes: Math.max(
          0,
          totalContatos * quantidadeMensagens -
            mensagensSucesso -
            mensagensFalha,
        ),
        sucesso: mensagensSucesso,
        falhou: mensagensFalha,

        total: totalContatos * quantidadeMensagens,
      },

      progresso: percentual,

      iniciadaEm: campanha.iniciadaEm,
      finalizadaEm: campanha.finalizadaEm,
    };
  }
  async relatorio(id) {
    const campanha = await this.repository.buscarPorId(id);

    if (!campanha) {
      const error = new Error("Campanha não encontrada.");

      error.statusCode = 404;
      throw error;
    }

    const campanhaContatos = await this.repository.buscarContatos(id);

    const mensagens = await this.repository.buscarMensagens(id);

    const contatosRelatorio = [];
    const resultados = await this.repository.buscarResultados(campanhaContatos);
    const porMensagem = new Map(
      resultados.map((r) => [`${r.campanhaContatoId}:${r.mensagemId}`, r]),
    );

    for (const campanhaContato of campanhaContatos) {
      const contato = await this.repository.buscarDestinatario(campanhaContato);

      if (!contato) {
        continue;
      }

      const mensagensRelatorio = [];

      for (const mensagem of mensagens) {
        const resultado = porMensagem.get(
          `${campanhaContato.id}:${mensagem.id}`,
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
