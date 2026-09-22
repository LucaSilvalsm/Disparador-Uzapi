import { Temporal } from "@js-temporal/polyfill";
import { db } from "../../prisma/db.js";
import emailService from "../../shared/Email/EmailService.js";
import { decifrar } from "../../shared/utils/segredos.js";
import { registrarErro } from "../../shared/utils/erros.js";
import { venceu, estadosFinais } from "./CicloCampanhaService.js";

const escapar = (valor) =>
  String(valor).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export class NotificacaoCampanhaService {
  constructor(executor = db, email = emailService) {
    this.db = executor;
    this.email = email;
  }
  async processarPendentes(campanhaId) {
    const agora = Temporal.Now.instant();
    let consulta = this.db.orm.public.NotificacaoCampanha.where({
      enviadaEm: null,
    });
    if (campanhaId !== undefined) consulta = consulta.where({ campanhaId });
    const pendentes = await consulta
      .where((n) => n.conteudoCifrado.isNotNull())
      .where((n) => n.disponivelEm.lte(agora))
      .orderBy((n) => n.id.asc())
      .limit(20)
      .all();
    for (const pendente of pendentes) {
      const [item] = await this.db.orm.public.NotificacaoCampanha.where({
        id: pendente.id,
        enviadaEm: null,
      })
        .where((n) => n.conteudoCifrado.isNotNull())
        .where((n) => n.disponivelEm.lte(agora))
        .updateAll({
          disponivelEm: agora.add({ seconds: 120 }),
          tentativas: pendente.tentativas + 1,
        });
      if (!item) continue;
      try {
        const campanha = await this.db.orm.public.Campanha.where({
          id: item.campanhaId,
        }).first();
        const permitido =
          campanha &&
          (item.tipo === "progresso"
            ? campanha.status === "em_andamento"
            : estadosFinais.includes(campanha.status) &&
              campanha.expiraEm &&
              !venceu(campanha.expiraEm));
        if (!permitido) {
          await this.db.orm.public.NotificacaoCampanha.where({
            id: item.id,
          }).updateAll({ conteudoCifrado: null });
          continue;
        }
        const url = decifrar(
          item.conteudoCifrado,
          `link:${campanha.idPublico}:${item.tipo}`,
        );
        const titulo =
          item.tipo === "progresso"
            ? "Acompanhe sua campanha"
            : "Relatório da sua campanha";
        await this.email.enviar({
          para: campanha.emailRelatorio,
          assunto: titulo,
          messageId: `<${campanha.idPublico}.${item.tipo}@disparador.local>`,
          html:
            `<h2>${titulo}</h2><p>${escapar(campanha.nome)}</p><p><a href="${escapar(url)}">Abrir ${item.tipo}</a></p>` +
            (item.tipo === "relatorio"
              ? "<p>Disponível por 24 horas após a finalização, inclusive para exportação CSV ou Excel.</p>"
              : "<p>Ao finalizar, enviaremos outro link com o relatório.</p>") +
            "<p>Este link é confidencial. Quem o receber poderá consultar esta campanha.</p>",
        });
        await this.db.orm.public.NotificacaoCampanha.where({
          id: item.id,
        }).updateAll({
          enviadaEm: Temporal.Now.instant(),
          conteudoCifrado: null,
        });
      } catch (error) {
        registrarErro("falha_notificacao_campanha", error, {
          campanhaId: item.campanhaId,
        });
        await this.db.orm.public.NotificacaoCampanha.where({
          id: item.id,
        }).updateAll({
          disponivelEm: Temporal.Now.instant().add({
            seconds: Math.min(900, 30 * 2 ** Math.min(item.tentativas, 5)),
          }),
        });
      }
    }
  }
}
export default new NotificacaoCampanhaService();
