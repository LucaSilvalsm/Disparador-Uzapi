const elemento = (id) => document.getElementById(id);
const [, pagina, id] = location.pathname.split("/");
const tipo = pagina === "acompanhamento" ? "progresso" : "relatorio";
const caminho = `/acessos/${encodeURIComponent(id)}/${tipo}`;
let encerrado = false;
const rotulos = { em_andamento: "Em andamento", concluida: "Concluída", concluido: "Concluído", falhou: "Falhou", parcial: "Parcial", pendente: "Pendente", processando: "Processando", sucesso: "Aceita pela Uzapi", cancelada: "Cancelada" };
const rotulo = (valor) => rotulos[valor] || valor;

async function resposta(response) {
  const body = await response.json();
  if (!response.ok) {
    if ([401, 403, 404, 410].includes(response.status)) encerrado = true;
    throw new Error(body.message || "Não foi possível consultar a campanha.");
  }
  return body.data;
}
async function atualizar() {
  try {
    const data = await resposta(await fetch(caminho, { credentials: "same-origin", cache: "no-store" }));
    elemento("titulo").textContent = data.nome;
    elemento("status").textContent = `Status: ${rotulo(data.status)}`;
    elemento("aviso").textContent = tipo === "progresso" ? "Atualização automática a cada 5 segundos." : "Relatório final. Sucesso indica aceitação pela Uzapi, não confirmação de entrega.";
    elemento("dados").hidden = false;
    if (tipo === "progresso") {
      elemento("barra").value = data.progresso;
      elemento("resumo").textContent = `${data.contatos.processados} de ${data.contatos.total} contatos processados (${data.progresso}%). Concluídos: ${data.contatos.concluidos}. Parciais: ${data.contatos.parciais}. Falhos: ${data.contatos.falhos}. Restantes: ${data.contatos.restantes}.`;
    } else {
      elemento("barra").hidden = true;
      elemento("resumo").textContent = `${data.totalContatos} contatos · ${data.quantidadeMensagens} mensagens por contato`;
      elemento("prazo").textContent = `Disponível até: ${data.expiraEm}`;
      elemento("csv").href = `${caminho}/exportar?formato=csv`;
      elemento("xlsx").href = `${caminho}/exportar?formato=xlsx`;
      elemento("exportacoes").hidden = false;
      elemento("tabela").hidden = false;
      elemento("contatos").replaceChildren();
      for (const contato of data.contatos) {
        const row = document.createElement("tr");
        const mensagens = contato.mensagens.map((m) => `${m.posicao}. ${rotulo(m.status)}${m.erro ? " — " + m.erro : ""}`).join(" | ");
        for (const valor of [contato.nome || "—", contato.telefone, rotulo(contato.status), mensagens]) {
          const cell = document.createElement("td"); cell.textContent = valor; row.append(cell);
        }
        elemento("contatos").append(row);
      }
      // Mesmo sem polling do relatório, remove dados e downloads da tela no vencimento.
      const tempo = Date.parse(data.expiraEm.replace("T ", "T")) - Date.now();
      if (Number.isFinite(tempo)) setTimeout(() => {
        elemento("dados").hidden = true;
        elemento("contatos").replaceChildren();
        elemento("aviso").textContent = "O acesso ao relatório expirou.";
      }, Math.max(0, tempo));
    }
  } catch (error) {
    elemento("aviso").textContent = error.message;
    elemento("dados").hidden = true;
    elemento("contatos").replaceChildren();
  } finally {
    if (tipo === "progresso" && !encerrado) setTimeout(atualizar, 5000);
  }
}

async function iniciar() {
  let token = new URLSearchParams(location.hash.slice(1)).get("token");
  // O segredo não permanece na barra de endereço nem em localStorage.
  history.replaceState(null, "", location.pathname);
  if (token) {
    const response = await fetch(`${caminho}/sessao`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, credentials: "same-origin" });
    token = null;
    if (!response.ok) { await resposta(response); return; }
  }
  await atualizar();
}
iniciar().catch((error) => { elemento("aviso").textContent = error.message || "Acesso indisponível."; });
