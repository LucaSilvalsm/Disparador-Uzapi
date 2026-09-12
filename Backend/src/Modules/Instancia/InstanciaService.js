import instanciaRepository from "./InstanciaRepository.js";
import { config, validarLimiteContatos } from "../../shared/config.js";
import uzapiClient from "../../shared/Integration/Uzapi.js";
import { erroHttp } from "../../shared/utils/erros.js";
import { normalizarEmail } from "../../shared/utils/normalizarEmail.js";

class InstanciaService {
  async cadastrar(data) {
    const {
      nome,
      email,
      idNumeroTelefone,
      token,
      limiteDiarioContatos,
    } = data;

    if ([nome, idNumeroTelefone, token].some((campo) => typeof campo !== "string" || !campo.trim())) {
      const error = new Error(
        "Nome, Phone ID e token são obrigatórios."
      );

      error.statusCode = 400;
      throw error;
    }

    const emailNormalizado = normalizarEmail(email);
    const instanciaExistente =
      await instanciaRepository.buscarPorNumeroTelefone(
        idNumeroTelefone.trim()
      );

    if (instanciaExistente) {
      const error = new Error(
        "Esta instância já está cadastrada."
      );

      error.statusCode = 409;
      throw error;
    }

    validarLimiteContatos(limiteDiarioContatos === undefined ? config.limitePadrao : limiteDiarioContatos);
    uzapiClient.validarCredenciais({ idNumeroTelefone, token });

    return instanciaRepository.cadastrar({
      nome: nome.trim(),
      email: emailNormalizado,
      idNumeroTelefone: idNumeroTelefone.trim(),
      token: uzapiClient.normalizarToken(token),
      limiteDiarioContatos: limiteDiarioContatos === undefined ? config.limitePadrao : limiteDiarioContatos,
    });
  }

  async listar() {
    return instanciaRepository.listar();
  }

  async buscarPorId(id) {
    const instancia =
      await instanciaRepository.buscarPorId(id);

    if (!instancia) {
      const error = new Error(
        "Instância não encontrada."
      );

      error.statusCode = 404;
      throw error;
    }

    return instancia;
  }

  async atualizar(id, data) {
    await this.buscarPorId(id);

    const alteracoes = {};
    for (const campo of ["nome", "idNumeroTelefone", "token"]) {
      if (data[campo] !== undefined) {
        if (typeof data[campo] !== "string" || !data[campo].trim()) {
          throw erroHttp(400, `O campo ${campo} deve ser um texto não vazio.`);
        }
        alteracoes[campo] = data[campo].trim();
      }
    }
    if (data.token !== undefined) alteracoes.token = uzapiClient.normalizarToken(data.token);
    if (data.email !== undefined) alteracoes.email = normalizarEmail(data.email);
    if (data.ativo !== undefined) {
      if (typeof data.ativo !== "boolean") throw erroHttp(400, "O campo ativo deve ser booleano.");
      alteracoes.ativo = data.ativo;
    }
    if (data.limiteDiarioContatos !== undefined) {
      alteracoes.limiteDiarioContatos = validarLimiteContatos(data.limiteDiarioContatos);
    }

    if (data.idNumeroTelefone) {
      const existente =
        await instanciaRepository.buscarPorNumeroTelefone(
          alteracoes.idNumeroTelefone
        );

      if (existente && existente.id !== id) {
        const error = new Error(
          "Este Phone ID já está cadastrado."
        );

        error.statusCode = 409;
        throw error;
      }
    }

    return instanciaRepository.atualizar(
      id,
      alteracoes
    );
  }

  async excluir(id) {
    await this.buscarPorId(id);

    return instanciaRepository.excluir(id);
  }
}

export default new InstanciaService();
