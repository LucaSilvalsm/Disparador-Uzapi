import { randomUUID } from "node:crypto";

export function erroHttp(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

// Não serializa Error/AxiosError: podem conter headers, SQL e credenciais.
export function registrarErro(evento, error, contexto = {}) {
  const errorId = randomUUID();
  const dados = { evento, errorId, horario: new Date().toISOString() };
  for (const chave of ["campanhaId", "campanhaContatoId", "mensagemId"]) {
    if (Number.isInteger(contexto[chave])) dados[chave] = contexto[chave];
  }
  if (Number.isInteger(error?.statusCode)) dados.statusCode = error.statusCode;
  if (error?.origem === "uzapi") {
    dados.origem = "uzapi";
    // A mensagem segura é criada pelo adaptador, nunca pelo corpo remoto.
    dados.mensagem = error.mensagemSegura;
  }
  console.error(JSON.stringify(dados));
  return errorId;
}
