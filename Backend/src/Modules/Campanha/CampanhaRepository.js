import { db } from "../../prisma/db.js";

class CampanhaRepository {
  async cadastrarCompleta(data, contatos, mensagens) {
    return db.transaction(async (tx) => {
      const campanha = await tx.orm.public.Campanha.create(data);
      // Ordenação consistente evita bloqueios cruzados ao reutilizar contatos.
      const contatosPorTelefone = new Map();
      for (const contato of [...contatos].sort((a, b) =>
        a.telefone.localeCompare(b.telefone),
      )) {
        const salvo = await tx.orm.public.Contato.upsert({
          create: contato,
          update: {},
          conflictOn: { telefone: contato.telefone },
        });
        contatosPorTelefone.set(contato.telefone, salvo.id);
      }
      for (const contato of contatos) {
        await tx.orm.public.CampanhaContato.create({
          campanhaId: campanha.id,
          contatoId: contatosPorTelefone.get(contato.telefone),
        });
      }
      for (const mensagem of mensagens) {
        await tx.orm.public.Mensagem.create({
          ...mensagem,
          campanhaId: campanha.id,
        });
      }
      return campanha;
    });
  }

  async cadastrar(data) {
    return db.orm.public.Campanha.create(data);
  }

  async listar() {
    return db.orm.public.Campanha.select(
      "id",
      "instanciaId",
      "nome",
      "emailRelatorio",
      "status",
      "iniciadaEm",
      "finalizadaEm",
    )
      .orderBy((campanha) => campanha.id.desc())
      .all();
  }

  async buscarPorId(id) {
    return db.orm.public.Campanha.where({
      id,
    }).first();
  }

  async criarCampanhaContato(campanhaId, contatoId) {
    return db.orm.public.CampanhaContato.create({
      campanhaId,
      contatoId,
    });
  }

  async criarMensagem(data) {
    return db.orm.public.Mensagem.create(data);
  }

  async buscarContatos(campanhaId) {
    return db.orm.public.CampanhaContato.where({
      campanhaId,
    }).all();
  }

  async buscarContatoPorId(contatoId) {
    return db.orm.public.Contato.where({
      id: contatoId,
    }).first();
  }

  async buscarMensagens(campanhaId) {
    return db.orm.public.Mensagem.where({
      campanhaId,
    })
      .orderBy((mensagem) => mensagem.posicao.asc())
      .all();
  }

  async atualizar(id, data) {
    return db.orm.public.Campanha.where({
      id,
    }).update(data);
  }

  async atualizarStatus(id, status, dadosExtras = {}) {
    return db.orm.public.Campanha.where({
      id,
    }).update({
      status,
      ...dadosExtras,
    });
  }

  async atualizarStatusContato(id, status, dadosExtras = {}) {
    return db.orm.public.CampanhaContato.where({
      id,
    }).update({
      status,
      ...dadosExtras,
    });
  }
  async contarContatosPorStatus(campanhaId, status) {
    const resultado = await db.orm.public.CampanhaContato.where({
      campanhaId,
      status,
    }).aggregate((a) => ({
      total: a.count(),
    }));

    return resultado.total;
  }

  async contarMensagensPorStatusCampanha(campanhaId, status) {
    const contatos = await db.orm.public.CampanhaContato.where({
      campanhaId,
    })
      .select("id")
      .all();

    if (!contatos.length) {
      return 0;
    }

    const idsCampanhaContato = contatos.map((contato) => contato.id);

    const resultado = await db.orm.public.ResultadoMensagem.where((resultado) =>
      resultado.campanhaContatoId.in(idsCampanhaContato),
    )
      .where({
        status,
      })
      .aggregate((a) => ({
        total: a.count(),
      }));

    return resultado.total;
  }
}

export default new CampanhaRepository();
