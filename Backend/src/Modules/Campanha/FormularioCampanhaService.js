import { validarNomeArquivo } from "../../../public/assets/midia-formatos.js";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "../../prisma/db.js";
import { config } from "../../shared/config.js";
import { erroHttp } from "../../shared/utils/erros.js";
import { normalizarEmail } from "../../shared/utils/normalizarEmail.js";
import {
  cifrar,
  assinatura,
  iguais,
  hashToken,
} from "../../shared/utils/segredos.js";
import uzapi from "../../shared/Integration/Uzapi.js";
import contatoService from "../Contato/ContatoService.js";
import campanhaService from "./CampanhaService.js";
import disparador from "../Disparo/DisparadorService.js";
import { DisparoRepository } from "../Disparo/DisparoRepository.js";
import { criarAcesso, executorId } from "./CicloCampanhaService.js";
import { validarComprovante } from "../Midia/MidiaService.js";

export function calcularHashSolicitacao(entrada) {
  const mensagens = entrada.mensagens.map((m) =>
    m.arquivo ? { tipo: m.tipo, texto: m.texto, arquivo: m.arquivo } : m,
  );
  return assinatura(
    JSON.stringify({ ...entrada, mensagens, chave: undefined }),
  );
}

export class FormularioCampanhaService {
  constructor(executor = db, motor = disparador) {
    this.db = executor;
    this.motor = motor;
  }

  validar(data, chave) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw erroHttp(400, "Informe os dados do formulário.");
    if (typeof chave !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(chave)) {
      throw erroHttp(
        400,
        "Informe Idempotency-Key com 16 a 128 caracteres. Reutilize a chave somente ao repetir a mesma solicitação.",
      );
    }
    if (
      typeof data.nome !== "string" ||
      !data.nome.trim() ||
      data.nome.length > 200
    )
      throw erroHttp(400, "Informe o nome da campanha (até 200 caracteres).");
    const instancia = data.instancia;
    if (!instancia || typeof instancia !== "object")
      throw erroHttp(400, "Informe os dados da instância.");
    const phoneId =
      typeof instancia.idNumeroTelefone === "string"
        ? instancia.idNumeroTelefone.trim()
        : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(phoneId))
      throw erroHttp(400, "Phone ID inválido.");
    const token = uzapi.normalizarToken(instancia.token);
    const email = normalizarEmail(instancia.email);
    const mensagens = Array.isArray(data.mensagens)
      ? data.mensagens.map((m) => {
          if (!m) return m;
          const mensagem = {
            tipo:
              typeof m.tipo === "string" ? m.tipo.trim().toLowerCase() : m.tipo,
            texto: typeof m.texto === "string" ? m.texto.trim() : m.texto,
            urlMidia: m.urlMidia,
            ...(typeof m.tipo === "string" &&
            m.tipo.trim().toLowerCase() === "documento"
              ? { nomeArquivo: m.nomeArquivo }
              : {}),
          };
          if (m.midiaUpload != null) {
            if (
              m.urlMidia ||
              !["imagem", "video", "audio", "documento"].includes(mensagem.tipo)
            )
              throw erroHttp(
                400,
                "Escolha somente arquivo ou URL para cada mídia.",
              );
            Object.assign(
              mensagem,
              validarComprovante(m.midiaUpload, {
                tipo: mensagem.tipo,
                phoneId,
                token,
              }),
            );
            if (mensagem.tipo === "documento")
              mensagem.nomeArquivo = mensagem.arquivo.nome;
          }
          return mensagem;
        })
      : data.mensagens;
    for (const m of Array.isArray(mensagens) ? mensagens : []) {
      if (m?.tipo === "documento") {
        try {
          m.nomeArquivo = validarNomeArquivo(m.nomeArquivo);
        } catch {
          throw erroHttp(
            400,
            "Informe um nome de arquivo válido com extensão permitida.",
          );
        }
      }
    }
    campanhaService.validarMensagens(mensagens);
    for (const mensagem of mensagens) {
      if (
        mensagem.texto != null &&
        (typeof mensagem.texto !== "string" || mensagem.texto.length > 20000)
      )
        throw erroHttp(400, "Texto de mensagem inválido ou muito longo.");
      if (
        ["imagem", "video", "audio", "documento"].includes(mensagem.tipo) &&
        !mensagem.idMidia
      ) {
        let url;
        try {
          url = new URL(mensagem.urlMidia);
        } catch {
          throw erroHttp(400, "Informe uma URL HTTP ou HTTPS para a mídia.");
        }
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.href.length > 4000
        )
          throw erroHttp(400, "URL de mídia inválida.");
      }
    }
    const contatos = contatoService.parsearLista(data.lista);
    // Não permite que a submissão altere limites, estado, credenciais ou destinatários de outras campanhas.
    return {
      nome: data.nome.trim(),
      phoneId,
      token,
      email,
      mensagens,
      contatos,
      chave: hashToken(chave),
    };
  }

  async iniciar(data, chave) {
    const entrada = this.validar(data, chave);
    const hashSolicitacao = calcularHashSolicitacao(entrada);
    const anterior = await this.db.orm.public.Campanha.where({
      chaveIdempotencia: entrada.chave,
    }).first();
    if (anterior) return this.repeticao(anterior, hashSolicitacao);
    const idPublico = randomUUID();
    const acesso = criarAcesso(idPublico, "progresso");
    const tokenEnvioCifrado = cifrar(entrada.token, `uzapi:${idPublico}`);
    let resultado;
    try {
      resultado = await this.db.transaction(async (tx) => {
        // ON CONFLICT serializa também o primeiro cadastro concorrente do mesmo Phone ID.
        const instancia = await tx.orm.public.Instancia.upsert({
          create: {
            nome: "Instância temporária",
            email: null,
            token: "",
            idNumeroTelefone: entrada.phoneId,
            limiteDiarioContatos: config.limitePadrao,
            temporaria: true,
          },
          update: {},
          conflictOn: { idNumeroTelefone: entrada.phoneId },
        });
        const [atual] = await tx.orm.public.Instancia.where({
          id: instancia.id,
        }).updateAll({ id: instancia.id });
        const repetida = await tx.orm.public.Campanha.where({
          chaveIdempotencia: entrada.chave,
        }).first();
        if (repetida)
          return { repetida: this.repeticao(repetida, hashSolicitacao) };
        if (!atual.ativo)
          throw erroHttp(
            409,
            "Esta instância foi desativada pela administração.",
          );
        const repo = new DisparoRepository(tx);
        if (await repo.buscarEmAndamento(instancia.id))
          throw erroHttp(
            409,
            "Esta instância já possui uma campanha em andamento. Aguarde sua finalização.",
          );
        const utilizados = await repo.consumo24Horas(
          instancia.id,
          Temporal.Now.instant(),
        );
        const saldo = Math.max(0, atual.limiteDiarioContatos - utilizados);
        if (entrada.contatos.validos.length > saldo)
          throw erroHttp(
            429,
            `Saldo insuficiente: ${saldo} contatos disponíveis nas últimas 24 horas.`,
          );
        const agora = Temporal.Now.instant();
        const campanha = await tx.orm.public.Campanha.create({
          instanciaId: instancia.id,
          nome: entrada.nome,
          emailRelatorio: entrada.email,
          temporaria: true,
          idPublico,
          tokenEnvioCifrado,
          hashTokenAcesso: acesso.hash,
          chaveIdempotencia: entrada.chave,
          hashSolicitacao,
          status: "em_andamento",
          iniciadaEm: agora,
          ultimoSinalEm: agora,
          executorId,
        });
        for (const contato of entrada.contatos.validos) {
          await tx.orm.public.CampanhaContato.create({
            campanhaId: campanha.id,
            nome: contato.nome,
            telefone: contato.telefone,
          });
        }
        for (const [index, mensagem] of entrada.mensagens.entries()) {
          await tx.orm.public.Mensagem.create({
            campanhaId: campanha.id,
            posicao: index + 1,
            tipo: mensagem.tipo,
            texto: mensagem.texto || null,
            urlMidia: mensagem.urlMidia || null,
            idMidia: mensagem.idMidia || null,
            nomeArquivo: mensagem.nomeArquivo || null,
          });
        }
        await tx.orm.public.NotificacaoCampanha.create({
          campanhaId: campanha.id,
          tipo: "progresso",
          conteudoCifrado: acesso.conteudoCifrado,
        });
        return { campanha, saldo };
      });
    } catch (error) {
      // Uma chave usada simultaneamente com outro Phone ID também não pode criar dois disparos.
      const existente = await this.db.orm.public.Campanha.where({
        chaveIdempotencia: entrada.chave,
      }).first();
      if (existente) return this.repeticao(existente, hashSolicitacao);
      throw error;
    }
    if (resultado.repetida) return resultado.repetida;
    this.motor.agendar(resultado.campanha.id, resultado.campanha.instanciaId);
    return {
      campanhaId: idPublico,
      status: "em_andamento",
      notificacao: "pendente",
      contatos: {
        validos: entrada.contatos.quantidadeValidos,
        invalidos: entrada.contatos.quantidadeInvalidos,
      },
      saldoAntesDaCampanha: resultado.saldo,
    };
  }

  repeticao(campanha, hashSolicitacao) {
    if (!iguais(campanha.hashSolicitacao, hashSolicitacao))
      throw erroHttp(409, "Idempotency-Key já utilizada com outros dados.");
    return {
      campanhaId: campanha.idPublico,
      status: campanha.status,
      repetida: true,
    };
  }
}
export default new FormularioCampanhaService();
