import campanhaService from "./CampanhaService.js";
import emailService from "../../shared/Email/EmailService.js";

class CampanhaRelatorioService {
  montarHtml(relatorio) {
    const contatosHtml = relatorio.contatos
      .map((contato) => {
        const mensagens = contato.mensagens
          .map(
            (mensagem) => `
                <li>
                  Mensagem ${mensagem.posicao}
                  (${mensagem.tipo}):
                  <strong>${mensagem.status}</strong>
                  ${mensagem.erro ? ` - ${mensagem.erro}` : ""}
                </li>
              `,
          )
          .join("");

        return `
            <tr>
              <td>${contato.nome || "-"}</td>
              <td>${contato.telefone}</td>
              <td>${contato.status}</td>
              <td>
                <ul>
                  ${mensagens}
                </ul>
              </td>
            </tr>
          `;
      })
      .join("");

    return `
      <h2>Relatório da campanha</h2>

      <p>
        <strong>Campanha:</strong>
        ${relatorio.nome}
      </p>

      <p>
        <strong>Status:</strong>
        ${relatorio.status}
      </p>

      <p>
        <strong>Total de contatos:</strong>
        ${relatorio.totalContatos}
      </p>

      <p>
        <strong>Quantidade de mensagens:</strong>
        ${relatorio.quantidadeMensagens}
      </p>

      <table
        border="1"
        cellpadding="8"
        cellspacing="0"
      >
        <thead>
          <tr>
            <th>Nome</th>
            <th>Telefone</th>
            <th>Status</th>
            <th>Mensagens</th>
          </tr>
        </thead>

        <tbody>
          ${contatosHtml}
        </tbody>
      </table>
    `;
  }

  async enviar(campanhaId) {
    const campanha = await campanhaService.buscarPorId(campanhaId);

    if (!campanha.emailRelatorio) {
      return;
    }

    const relatorio = await campanhaService.relatorio(campanhaId);

    const html = this.montarHtml(relatorio);

    await emailService.enviar({
      para: campanha.emailRelatorio,

      assunto: `Relatório da campanha - ${campanha.nome}`,

      html,
    });
  }
}

export default new CampanhaRelatorioService();
