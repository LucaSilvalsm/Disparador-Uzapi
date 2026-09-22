import ExcelJS from "exceljs";

export function linhasRelatorio(relatorio) {
  return relatorio.contatos.flatMap((contato) =>
    contato.mensagens.map((mensagem) => [
      contato.nome || "",
      contato.telefone,
      contato.status,
      mensagem.posicao,
      mensagem.tipo,
      mensagem.status,
      mensagem.idFila || "",
      mensagem.idMensagem || "",
      mensagem.erro || "",
      mensagem.enviadaEm ? String(mensagem.enviadaEm) : "",
    ]),
  );
}
export const cabecalho = [
  "Nome",
  "Telefone",
  "Status do contato",
  "Posição",
  "Tipo",
  "Status da mensagem",
  "ID da fila",
  "ID da mensagem",
  "Erro",
  "Enviada em (UTC)",
];
export function celulaCsv(valor) {
  let texto = String(valor ?? "").replace(/\u0000/g, "");
  // Neutraliza fórmulas, inclusive depois de espaços e caracteres de controle.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(texto) || /^[\t\r\n]/.test(texto))
    texto = "'" + texto;
  return '"' + texto.replace(/"/g, '""') + '"';
}
export function exportarCsv(relatorio) {
  return (
    "\uFEFF" +
    [cabecalho, ...linhasRelatorio(relatorio)]
      .map((linha) => linha.map(celulaCsv).join(";"))
      .join("\r\n")
  );
}
export async function exportarExcel(relatorio) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Relatório");
  sheet.addRow(cabecalho);
  for (const linha of linhasRelatorio(relatorio))
    sheet.addRow(linha.map((valor) => String(valor ?? "").slice(0, 32767)));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((coluna, index) => {
    coluna.width = index === 8 ? 55 : 24;
    coluna.numFmt = "@";
  });
  sheet.autoFilter = { from: "A1", to: "J1" };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
