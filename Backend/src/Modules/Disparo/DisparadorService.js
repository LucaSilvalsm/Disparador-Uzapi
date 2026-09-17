import { randomInt } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import campanhaRepository from "../Campanha/CampanhaRepository.js";
import resultadoMensagemRepository from "../ResultadoMensagem/ResultadoMensagemRepository.js";
import disparoRepository from "./DisparoRepository.js";
import uzapiClient from "../../shared/Integration/Uzapi.js";
import { config, validarLimiteContatos } from "../../shared/config.js";
import { erroHttp, registrarErro } from "../../shared/utils/erros.js";
import campanhaRelatorioService from "../Campanha/CampanhaRelatorioService.js";
import cicloCampanha, { executorId } from "../Campanha/CicloCampanhaService.js";
import { decifrar } from "../../shared/utils/segredos.js";
import notificacoes from "../Campanha/NotificacaoCampanhaService.js";

class DisparadorService {
  personalizarTexto(texto, contato) {
    return texto?.replace(/\{\{nome\}\}/g, () => contato.nome || "") || texto;
  }

  agora() {
    return Temporal.Now.instant();
  }

  aguardar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  intervalo({ minimo, maximo }) {
    return randomInt(minimo, maximo + 1);
  }

  validarInstancia(instancia) {
    if (!instancia)
      throw erroHttp(404, "Instância da campanha não encontrada.");
    if (!instancia.ativo) throw erroHttp(409, "A instância está desativada.");
    validarLimiteContatos(instancia.limiteDiarioContatos);
    uzapiClient.validarCredenciais(instancia);
  }

  async iniciar(campanhaId) {
    const campanha = await disparoRepository.buscarCampanha(campanhaId);
    if (!campanha) throw erroHttp(404, "Campanha não encontrada.");

    await disparoRepository.comInstanciaBloqueada(
      campanha.instanciaId,
      async (repo, instancia) => {
        this.validarInstancia(instancia);
        const atual = await repo.buscarCampanha(campanhaId);
        if (atual?.status !== "rascunho") {
          throw erroHttp(
            409,
            "Somente campanhas em rascunho podem ser iniciadas.",
          );
        }
        if (await repo.buscarEmAndamento(campanha.instanciaId)) {
          throw erroHttp(
            409,
            "Esta instância já possui uma campanha em andamento.",
          );
        }
        const total = await repo.contarPendentes(campanhaId);
        const mensagens = await repo.contarMensagens(campanhaId);
        if (!total)
          throw erroHttp(400, "A campanha não possui contatos pendentes.");
        if (mensagens < 1 || mensagens > 3)
          throw erroHttp(400, "A campanha deve possuir entre 1 e 3 mensagens.");

        const utilizados = await repo.consumo24Horas(
          instancia.id,
          this.agora(),
        );
        const disponiveis = Math.max(
          0,
          instancia.limiteDiarioContatos - utilizados,
        );
        if (total > disponiveis) {
          throw erroHttp(
            429,
            `Limite das últimas 24 horas: ${utilizados} utilizados, ${disponiveis} disponíveis. A campanha possui ${total} contatos.`,
          );
        }
        if (!(await repo.iniciarCampanha(campanhaId))) {
          throw erroHttp(
            409,
            "A campanha já foi iniciada por outra requisição.",
          );
        }
      },
    );

    this.agendar(campanhaId, campanha.instanciaId);
    return { campanhaId, status: "em_andamento" };
  }

  agendar(campanhaId, instanciaId) {
    // O agendamento ocorre somente DEPOIS do commit, sem segurar a resposta HTTP.
    setImmediate(() => {
      void notificacoes.processarPendentes(campanhaId)
        .catch((error) => registrarErro("falha_notificacao_campanha", error, { campanhaId }));
      let sinalizando = false;
      const heartbeat = setInterval(async () => {
        if (sinalizando) return;
        sinalizando = true;
        try { await cicloCampanha.sinalizar(campanhaId); }
        catch (error) { registrarErro("falha_heartbeat", error, { campanhaId }); }
        finally { sinalizando = false; }
      }, 15000);
      heartbeat.unref();
      console.info(JSON.stringify({ evento: "campanha_iniciada", campanhaId, horario: new Date().toISOString() }));
      void this.processar(campanhaId, instanciaId).catch(
        async (error) => {
          registrarErro("campanha_interrompida", error, { campanhaId });
          try {
            await this.finalizar(campanhaId, "falhou");
          } catch (persistenciaError) {
            registrarErro(
              "falha_ao_persistir_estado_campanha",
              persistenciaError,
              { campanhaId },
            );
          }
        },
      ).finally(() => clearInterval(heartbeat));
    });
  }

  async finalizar(campanhaId, status) {
    const campanha = await cicloCampanha.finalizar(campanhaId, status);
    if (!campanha) return;
    console.info(JSON.stringify({ evento: "campanha_finalizada", campanhaId, status, horario: new Date().toISOString() }));
    if (!campanha.temporaria) {
      try { await campanhaRelatorioService.enviar(campanhaId); }
      catch (error) { registrarErro("falha_envio_relatorio_email", error, { campanhaId }); }
    }
  }

  async podeContinuar(campanhaId) {
    const campanha = await disparoRepository.buscarCampanha(campanhaId);
    return campanha?.status === "em_andamento" && (!campanha.temporaria || campanha.executorId === executorId);
  }

  async reservarProximo(campanhaId, instanciaId) {
    return disparoRepository.comInstanciaBloqueada(
      instanciaId,
      async (repo, instancia) => {
        const campanha = await repo.buscarCampanha(campanhaId);
        if (campanha?.status !== "em_andamento") return { encerrada: true };
        if (campanha.temporaria && campanha.executorId !== executorId) return { encerrada: true };
        const credencial = campanha.temporaria ? {
          ...instancia, token: decifrar(campanha.tokenEnvioCifrado, `uzapi:${campanha.idPublico}`),
        } : instancia;
        this.validarInstancia(credencial);
        const pendente = await repo.proximoPendente(campanhaId);
        if (!pendente) return { concluida: true };
        const agora = this.agora();
        const utilizados = await repo.consumo24Horas(instanciaId, agora);
        if (utilizados >= instancia.limiteDiarioContatos)
          return { aguardarLimite: true };
        const contato = await repo.reservarContato(pendente.id, agora);
        if (!contato)
          throw erroHttp(409, "Contato já reservado por outro processamento.");
        return { contato, instancia: credencial };
      },
    );
  }

  async processar(campanhaId, instanciaId) {
    const mensagens = await campanhaRepository.buscarMensagens(campanhaId);
    let algumSucesso = false;
    let contatoAnterior = false;
    while (true) {
      // Só espera se realmente há um próximo contato.
      if (
        contatoAnterior &&
        (await disparoRepository.proximoPendente(campanhaId))
      ) {
        await this.aguardar(this.intervalo(config.intervaloContatos));
      }
      let reserva = await this.reservarProximo(campanhaId, instanciaId);
      while (reserva.aguardarLimite) {
        // Reconsulta o banco, inclusive alterações de limite, sem manter transaction aberta.
        await this.aguardar(30000);
        reserva = await this.reservarProximo(campanhaId, instanciaId);
      }
      if (reserva.encerrada) return;
      if (reserva.concluida) break;
      const resultado = await this.processarContato(
        campanhaId,
        reserva,
        mensagens,
      );
      if (resultado.encerrada) return;
      algumSucesso ||= resultado.sucessos > 0;
      if (resultado.erroAutenticacao) {
        // Credencial recusada afeta a instância inteira. Evita repetir o mesmo 401/403.
        await this.finalizar(campanhaId, "falhou");
        return;
      }
      contatoAnterior = true;
    }
    await this.finalizar(campanhaId, algumSucesso ? "concluida" : "falhou");
  }

  async processarContato(
    campanhaId,
    { contato: campanhaContato, instancia },
    mensagens,
  ) {
    const contato = await campanhaRepository.buscarDestinatario(campanhaContato);
    let sucessos = 0;
    let erroAutenticacao = false;
    if (contato) {
      for (let index = 0; index < mensagens.length; index++) {
        if (index > 0)
          await this.aguardar(this.intervalo(config.intervaloMensagens));
        if (!(await this.podeContinuar(campanhaId))) return { encerrada: true };
        const original = mensagens[index];
        const mensagem = {
          ...original,
          texto: this.personalizarTexto(original.texto, contato),
        };
        const resultado = await resultadoMensagemRepository.criar({
          mensagemId: mensagem.id,
          campanhaContatoId: campanhaContato.id,
        });
        let resposta;
        try {
          resposta = await uzapiClient.enviarMensagem({
            instancia,
            telefone: contato.telefone,
            mensagem,
          });
        } catch (error) {
          if (!(await this.podeContinuar(campanhaId))) return { encerrada: true };
          registrarErro("falha_envio_uzapi", error, {
            campanhaId,
            campanhaContatoId: campanhaContato.id,
            mensagemId: mensagem.id,
          });
          await resultadoMensagemRepository.marcarFalha(
            resultado.id,
            error.mensagemSegura || "Falha no envio da mensagem.",
          );
          erroAutenticacao =
            error.origem === "uzapi" && [401, 403].includes(error.statusCode);
          if (erroAutenticacao) break;
          continue;
        }
        // Se o envio foi aceito e esta escrita falhar, não o classifica como envio recusado.
        // O registro pendente fica disponível para futura reconciliação, sem reenvio automático.
        if (!(await this.podeContinuar(campanhaId))) return { encerrada: true };
        const identificador = (valor) =>
          ["string", "number"].includes(typeof valor) ? String(valor) : null;
        await resultadoMensagemRepository.marcarSucesso(resultado.id, {
          idFila: identificador(resposta?.queueId ?? resposta?.idFila),
          idMensagem: identificador(
            resposta?.messageId ?? resposta?.idMensagem ?? resposta?.id,
          ),
        });
        sucessos++;
      }
    }
    const status =
      sucessos === mensagens.length
        ? "concluido"
        : sucessos > 0
          ? "parcial"
          : "falhou";
    await campanhaRepository.atualizarStatusContato(
      campanhaContato.id,
      status,
      { finalizadoEm: this.agora() },
    );
    return { sucessos, erroAutenticacao };
  }
}

export default new DisparadorService();
