import { db } from "../../prisma/db.js";
import { Temporal } from "@js-temporal/polyfill";

class ResultadoMensagemRepository {
  async criar(data) {
    return db.orm.public.ResultadoMensagem.create(data);
  }

  async buscarPorMensagemEContato(mensagemId, campanhaContatoId) {
    return db.orm.public.ResultadoMensagem.where({
      mensagemId,
      campanhaContatoId,
    }).first();
  }

  async atualizar(id, data) {
    return db.orm.public.ResultadoMensagem.where({
      id,
    }).update(data);
  }

  async marcarSucesso(id, { idFila = null, idMensagem = null } = {}) {
    return db.orm.public.ResultadoMensagem.where({
      id,
    }).update({
      status: "sucesso",
      idFila,
      idMensagem,
      erro: null,
      enviadaEm: Temporal.Now.instant(),
    });
  }

  async marcarFalha(id, erro) {
    return db.orm.public.ResultadoMensagem.where({
      id,
    }).update({
      status: "falhou",
      erro,
    });
  }

  async listarPorCampanhaContato(campanhaContatoId) {
    return db.orm.public.ResultadoMensagem.where({
      campanhaContatoId,
    }).all();
  }

  async listarPorMensagem(mensagemId) {
    return db.orm.public.ResultadoMensagem.where({
      mensagemId,
    }).all();
  }
}

export default new ResultadoMensagemRepository();
