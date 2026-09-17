import "dotenv/config";

export function validarLimiteContatos(valor) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 2147483647) {
    const error = new Error("O limite de contatos deve ser um número inteiro positivo.");
    error.statusCode = 400;
    throw error;
  }
  return valor;
}

const limitePadrao = Number(process.env.DAILY_CONTACT_LIMIT || 250);
validarLimiteContatos(limitePadrao);
const versao = process.env.UZAPI_VERSION?.trim() || "v1";
if (!/^v[1-9]\d*$/.test(versao)) {
  throw new Error("UZAPI_VERSION deve ter o formato v1, v2, etc.");
}
const fusoHorarioApi = process.env.API_TIMEZONE?.trim() || "America/Sao_Paulo";
// Valida a configuração na inicialização, antes de atender requisições.
new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorarioApi });

export const config = Object.freeze({
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, ""),
  retencaoHoras: 24,
  abandonoSegundos: 180,
  fusoHorarioApi,
  limitePadrao,
  uzapiVersion: versao,
  uzapiBaseUrl: (process.env.UZAPI_BASE_URL || "https://api.uzapi.com.br").replace(/\/+$/, ""),
  intervaloMensagens: { minimo: 5000, maximo: 10000 },
  intervaloContatos: { minimo: 30000, maximo: 60000 },
});
