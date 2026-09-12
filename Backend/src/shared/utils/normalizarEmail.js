import { domainToASCII } from "node:url";
import { erroHttp } from "./erros.js";

export function normalizarEmail(email) {
  const invalido = () => erroHttp(400, "Informe um e-mail válido para receber o relatório.");
  if (typeof email !== "string") throw invalido();
  const valor = email.trim();
  const partes = valor.split("@");
  if (partes.length !== 2 || valor.length > 254) throw invalido();
  const [local, dominioOriginal] = partes;
  // Aceita um endereço simples, sem listas de destinatários ou cabeçalhos.
  if (!local || local.length > 64 || !/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)
      || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    throw invalido();
  }
  if (!dominioOriginal || /[\s\/:?#@\\]/.test(dominioOriginal)) throw invalido();
  const dominio = domainToASCII(dominioOriginal).toLowerCase();
  const rotulos = dominio.split(".");
  if (rotulos.length < 2 || rotulos.some((rotulo) =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(rotulo))) {
    throw invalido();
  }
  const normalizado = `${local}@${dominio}`;
  if (normalizado.length > 254) throw invalido();
  return normalizado;
}
