import { Temporal } from "@js-temporal/polyfill";
import { config } from "../config.js";

// O JSON chama toJSON() antes do replacer. Recupera o objeto original
// pelo contexto para distinguir uma data de um texto contendo uma data.
export function serializarDatas(chave, valor) {
  const original = this[chave];
  let instante;
  if (original instanceof Temporal.Instant) {
    instante = original;
  } else if (original instanceof Date && Number.isFinite(original.getTime())) {
    instante = Temporal.Instant.fromEpochMilliseconds(original.getTime());
  } else {
    return valor;
  }

  const dataLocal = instante.toZonedDateTimeISO(config.fusoHorarioApi).toString({
    timeZoneName: "never",
    calendarName: "never",
  });
  // Formato de exibição solicitado para a API: espaço depois do separador T.
  return dataLocal.replace("T", "T ");
}
