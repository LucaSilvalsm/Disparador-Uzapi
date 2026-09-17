import cicloCampanha from "../Modules/Campanha/CicloCampanhaService.js";
import notificacoes from "../Modules/Campanha/NotificacaoCampanhaService.js";
import { registrarErro } from "./utils/erros.js";

export function iniciarManutencao() {
  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try {
      await cicloCampanha.recuperarAbandonadas();
      await cicloCampanha.limparExpiradas();
      await notificacoes.processarPendentes();
    } catch (error) { registrarErro("falha_manutencao", error); }
    finally { executando = false; }
  };
  void executar();
  const timer = setInterval(() => void executar(), 30000);
  timer.unref();
  return () => clearInterval(timer);
}
