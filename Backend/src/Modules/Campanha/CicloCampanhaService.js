import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "../../prisma/db.js";
import { config } from "../../shared/config.js";
import { gerarToken, hashToken, cifrar } from "../../shared/utils/segredos.js";
import { registrarErro } from "../../shared/utils/erros.js";

export const executorId = randomUUID();
export const estadosFinais = ["concluida", "falhou", "cancelada"];
export const venceu = (data, agora = Temporal.Now.instant()) =>
  data && Temporal.Instant.compare(data, agora) <= 0;

export function criarAcesso(idPublico, tipo) {
  const token = gerarToken();
  const pagina = tipo === "progresso" ? "acompanhamento" : "relatorio";
  const base = new URL(config.publicBaseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !["http:", "https:"].includes(base.protocol) ||
    (base.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  ) {
    throw new Error(
      "PUBLIC_BASE_URL deve ser HTTPS, ou HTTP somente em localhost.",
    );
  }
  const url = `${config.publicBaseUrl}/${pagina}/${idPublico}#token=${token}`;
  return {
    hash: hashToken(token),
    conteudoCifrado: cifrar(url, `link:${idPublico}:${tipo}`),
  };
}

export class CicloCampanhaService {
  constructor(executor = db) {
    this.db = executor;
  }
  async finalizar(campanhaId, status, { abandonadaAntesDe } = {}) {
    const referencia = await this.db.orm.public.Campanha.where({
      id: campanhaId,
    })
      .select("instanciaId")
      .first();
    if (!referencia) return;
    return this.db.transaction(async (tx) => {
      await tx.orm.public.Instancia.where({
        id: referencia.instanciaId,
      }).updateAll({ id: referencia.instanciaId });
      const campanha = await tx.orm.public.Campanha.where({
        id: campanhaId,
      }).first();
      if (!campanha || campanha.status !== "em_andamento") return;
      if (
        abandonadaAntesDe &&
        (!campanha.ultimoSinalEm ||
          Temporal.Instant.compare(campanha.ultimoSinalEm, abandonadaAntesDe) >
            0)
      )
        return;
      const agora = Temporal.Now.instant();
      const dados = {
        status,
        finalizadaEm: agora,
        executorId: null,
        ultimoSinalEm: null,
        tokenEnvioCifrado: null,
      };
      if (campanha.temporaria) {
        const acesso = criarAcesso(campanha.idPublico, "relatorio");
        dados.expiraEm = agora.add({ hours: config.retencaoHoras });
        dados.hashTokenRelatorio = acesso.hash;
        // A revogação do progresso é também verificada pelo status em TODA consulta.
        await tx.orm.public.NotificacaoCampanha.where({
          campanhaId,
          tipo: "progresso",
        }).updateAll({ conteudoCifrado: null });
        await tx.orm.public.NotificacaoCampanha.create({
          campanhaId,
          tipo: "relatorio",
          conteudoCifrado: acesso.conteudoCifrado,
        });
      }
      const [finalizada] = await tx.orm.public.Campanha.where({
        id: campanhaId,
        status: "em_andamento",
      }).updateAll(dados);
      return finalizada;
    });
  }

  async sinalizar(campanhaId) {
    return this.db.orm.public.Campanha.where({
      id: campanhaId,
      status: "em_andamento",
      executorId,
    }).updateAll({ ultimoSinalEm: Temporal.Now.instant() });
  }

  async recuperarAbandonadas() {
    const antes = Temporal.Now.instant().subtract({
      seconds: config.abandonoSegundos,
    });
    const campanhas = await this.db.orm.public.Campanha.where({
      temporaria: true,
      status: "em_andamento",
    })
      .where((c) => c.ultimoSinalEm.lte(antes))
      .select("id")
      .limit(50)
      .all();
    for (const c of campanhas) {
      await this.finalizar(c.id, "falhou", { abandonadaAntesDe: antes });
    }
  }

  async limparExpiradas(agora = Temporal.Now.instant(), campanhaId) {
    let consulta = this.db.orm.public.Campanha.where({ temporaria: true });
    if (campanhaId !== undefined) consulta = consulta.where({ id: campanhaId });
    const candidatas = await consulta
      .where((c) => c.expiraEm.lte(agora))
      .select("id", "instanciaId")
      .limit(100)
      .all();
    let removidas = 0;
    for (const candidata of candidatas) {
      removidas += await this.db.transaction(async (tx) => {
        // Mesma ordem de bloqueio usada pelo cadastro e pelo motor.
        await tx.orm.public.Instancia.where({
          id: candidata.instanciaId,
        }).updateAll({ id: candidata.instanciaId });
        const campanha = await tx.orm.public.Campanha.where({
          id: candidata.id,
        }).first();
        if (
          !campanha ||
          !estadosFinais.includes(campanha.status) ||
          !venceu(campanha.expiraEm, agora)
        )
          return 0;
        // Proteção adicional: nunca remover reservas que ainda contam para a janela móvel.
        const recente = await tx.orm.public.CampanhaContato.where({
          campanhaId: campanha.id,
        })
          .where((c) => c.iniciadoEm.gt(agora.subtract({ hours: 24 })))
          .select("id")
          .first();
        if (recente) return 0;
        const contatos = await tx.orm.public.CampanhaContato.where({
          campanhaId: campanha.id,
        })
          .select("id", "contatoId")
          .all();
        for (const contato of contatos) {
          const resultados = await tx.orm.public.ResultadoMensagem.where({
            campanhaContatoId: contato.id,
          })
            .select("id")
            .all();
          for (const resultado of resultados)
            await tx.orm.public.ResultadoMensagem.where({
              id: resultado.id,
            }).delete();
          await tx.orm.public.CampanhaContato.where({
            id: contato.id,
          }).delete();
        }
        const mensagens = await tx.orm.public.Mensagem.where({
          campanhaId: campanha.id,
        })
          .select("id")
          .all();
        for (const mensagem of mensagens)
          await tx.orm.public.Mensagem.where({ id: mensagem.id }).delete();
        const notificacoes = await tx.orm.public.NotificacaoCampanha.where({
          campanhaId: campanha.id,
        })
          .select("id")
          .all();
        for (const notificacao of notificacoes)
          await tx.orm.public.NotificacaoCampanha.where({
            id: notificacao.id,
          }).delete();
        await tx.orm.public.Campanha.where({ id: campanha.id }).delete();
        const outra = await tx.orm.public.Campanha.where({
          instanciaId: campanha.instanciaId,
        })
          .select("id")
          .first();
        // Cadastros antigos/administrativos não são excluídos automaticamente.
        const instancia = await tx.orm.public.Instancia.where({
          id: campanha.instanciaId,
        }).first();
        if (!outra && instancia?.temporaria)
          await tx.orm.public.Instancia.where({ id: instancia.id }).delete();
        return 1;
      });
    }
    if (removidas)
      console.info(
        JSON.stringify({
          evento: "limpeza_campanhas",
          removidas,
          horario: new Date().toISOString(),
        }),
      );
    return removidas;
  }
}
export default new CicloCampanhaService();
