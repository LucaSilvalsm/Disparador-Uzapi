import { Temporal } from "@js-temporal/polyfill";
import { db } from "../../prisma/db.js";

export class DisparoRepository {
  constructor(executor = db) {
    this.executor = executor;
  }

  async comInstanciaBloqueada(instanciaId, executar) {
    return this.executor.transaction(async (tx) => {
      // UPDATE atômico mantém o bloqueio da linha até commit/rollback.
      // Atribuição do próprio ID não altera os dados da instância.
      const [instancia] = await tx.orm.public.Instancia.where({ id: instanciaId })
        .updateAll({ id: instanciaId });
      return executar(new DisparoRepository(tx), instancia);
    });
  }

  buscarCampanha(id) {
    return this.executor.orm.public.Campanha.where({ id }).first();
  }

  buscarEmAndamento(instanciaId) {
    return this.executor.orm.public.Campanha.where({ instanciaId, status: "em_andamento" }).first();
  }

  async consumo24Horas(instanciaId, agora) {
    const campanhas = await this.executor.orm.public.Campanha.where({ instanciaId }).select("id").all();
    if (!campanhas.length) return 0;
    // Uma reserva conta um contato, inclusive falhas, independentemente das mensagens.
    const resultado = await this.executor.orm.public.CampanhaContato
      .where((c) => c.campanhaId.in(campanhas.map((campanha) => campanha.id)))
      .where((c) => c.iniciadoEm.gt(agora.subtract({ hours: 24 })))
      .aggregate((a) => ({ total: a.count() }));
    return resultado.total;
  }

  async contarPendentes(campanhaId) {
    const resultado = await this.executor.orm.public.CampanhaContato.where({ campanhaId, status: "pendente" })
      .aggregate((a) => ({ total: a.count() }));
    return resultado.total;
  }

  async contarMensagens(campanhaId) {
    const resultado = await this.executor.orm.public.Mensagem.where({ campanhaId })
      .aggregate((a) => ({ total: a.count() }));
    return resultado.total;
  }

  async iniciarCampanha(id) {
    // updateAll preserva status no WHERE do UPDATE emitido pelo Prisma.
    const [campanha] = await this.executor.orm.public.Campanha.where({ id, status: "rascunho" })
      .updateAll({ status: "em_andamento", iniciadaEm: Temporal.Now.instant() });
    return campanha;
  }

  proximoPendente(campanhaId) {
    return this.executor.orm.public.CampanhaContato.where({ campanhaId, status: "pendente" })
      .orderBy((c) => c.id.asc()).first();
  }

  async reservarContato(id, agora) {
    const [contato] = await this.executor.orm.public.CampanhaContato.where({ id, status: "pendente" })
      .updateAll({ status: "processando", iniciadoEm: agora });
    return contato;
  }
}

export default new DisparoRepository();
