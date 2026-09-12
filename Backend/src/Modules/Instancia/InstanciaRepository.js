import { db } from "../../prisma/db.js";
import { Temporal } from "@js-temporal/polyfill";

const camposPublicos = [
  "id",
  "nome",
  "email",
  "idNumeroTelefone",
  "ativo",
  "limiteDiarioContatos",
];

class InstanciaRepository {
  async cadastrar(data) {
    return db.orm.public.Instancia.select(...camposPublicos).create(data);
  }

  async listar() {
    return db.orm.public.Instancia.select(...camposPublicos)
      .orderBy((instancia) => instancia.nome.asc())
      .all();
  }

  async buscarPorId(id) {
    return db.orm.public.Instancia.where({ id })
      .select(...camposPublicos)
      .first();
  }

  async buscarPorNumeroTelefone(idNumeroTelefone) {
    return db.orm.public.Instancia.where({ idNumeroTelefone })
      .select(...camposPublicos)
      .first();
  }

  async atualizar(id, data) {
    return db.orm.public.Instancia.where({ id })
      .select(...camposPublicos)
      .update({
        ...data,
        atualizadoEm: Temporal.Now.instant(),
      });
  }

  async excluir(id) {
    return db.orm.public.Instancia.where({ id }).delete();
  }
  async buscarCredenciaisPorId(id) {
    return db.orm.public.Instancia.where({
      id,
    }).first();
  }
}

export default new InstanciaRepository();
