import { db } from "../../prisma/db.js";

class ContatoRepository {

  async cadastrar(data) {
    return db.orm.public.Contato.create(data);
  }

  async buscarPorTelefone(telefone) {
    return db.orm.public.Contato
      .where({
        telefone,
      })
      .first();
  }

  async buscarPorId(id) {
    return db.orm.public.Contato
      .where({
        id,
      })
      .first();
  }

  async listar() {
    return db.orm.public.Contato
      .select(
        "id",
        "nome",
        "telefone"
      )
      .orderBy((contato) => contato.nome.asc())
      .all();
  }

  async atualizar(id, data) {
    return db.orm.public.Contato
      .where({
        id,
      })
      .update(data);
  }
}

export default new ContatoRepository();