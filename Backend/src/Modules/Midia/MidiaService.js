import { createHash } from "node:crypto";
import { MIDIAS, DOCUMENTOS, validarNomeArquivo } from "../../../public/assets/midia-formatos.js";
import { assinatura, hashToken, iguais } from "../../shared/utils/segredos.js";
import { erroHttp } from "../../shared/utils/erros.js";
import uzapi from "../../shared/Integration/Uzapi.js";

export function validarConteudo(buffer, tipo, mime) {
  const regra = MIDIAS[tipo];
  if (!regra || !regra.mimes.includes(mime)) throw erroHttp(415, "Formato de mídia não permitido para esse tipo de mensagem.");
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw erroHttp(400, "Envie um arquivo de mídia não vazio.");
  if (buffer.length > regra.limite) throw erroHttp(413, `Arquivo muito grande. ${regra.ajuda}.`);
  const mp4 = buffer.length >= 16 && buffer.toString("ascii", 4, 8) === "ftyp" && buffer.readUInt32BE(0) >= 16 && buffer.readUInt32BE(0) <= buffer.length;
  const zip = () => ["504b0304", "504b0506", "504b0708"].includes(buffer.subarray(0, 4).toString("hex"));
  const office = () => buffer.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
  const texto = () => { try { new TextDecoder("utf-8", { fatal: true }).decode(buffer); return !buffer.includes(0); } catch { return false; } };
  const valido = {
    "application/pdf": () => buffer.toString("ascii", 0, 5) === "%PDF-",
    "application/zip": zip,
    "application/vnd.rar": () => buffer.subarray(0, 7).toString("hex") === "526172211a0700" || buffer.subarray(0, 8).toString("hex") === "526172211a070100",
    "application/x-7z-compressed": () => buffer.subarray(0, 6).toString("hex") === "377abcaf271c",
    "application/vnd.ms-excel": office,
    "application/msword": office,
    "application/vnd.ms-powerpoint": office,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": zip,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": zip,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": zip,
    "text/plain": texto, "text/csv": texto, "text/css": texto,
    "application/json": () => { try { JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); return true; } catch { return false; } },
    "image/png": () => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    "image/jpeg": () => buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255,
    "audio/mpeg": () => buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 255 && (buffer[1] & 0xe0) === 0xe0 && (buffer[1] & 6) !== 0),
    "audio/ogg": () => buffer.toString("ascii", 0, 4) === "OggS",
    "audio/aac": () => buffer[0] === 255 && (buffer[1] & 0xf6) === 0xf0,
    "audio/mp4": () => mp4,
    "video/mp4": () => mp4,
  }[mime]();
  if (!valido) throw erroHttp(415, "O conteúdo do arquivo não corresponde ao formato informado.");
  return { sha256: createHash("sha256").update(buffer).digest("hex"), tamanho: buffer.length, mime };
}

export function criarComprovante({ idMidia, tipo, phoneId, token, arquivo }, agora = Date.now()) {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(String(idMidia || ""))) throw erroHttp(502, "A Uzapi não retornou um ID de mídia válido.");
  const expiraEm = agora + 24 * 60 * 60 * 1000;
  const dados = Buffer.from(JSON.stringify({ idMidia: String(idMidia), tipo, phoneId, credencial: hashToken(token), arquivo, expiraEm })).toString("base64url");
  return { midiaUpload: `${dados}.${assinatura(`midia:${dados}`)}`, expiraEm };
}

export function validarComprovante(valor, { tipo, phoneId, token }, agora = Date.now()) {
  if (typeof valor !== "string" || valor.length > 4096) throw erroHttp(400, "Comprovante de upload inválido.");
  const partes = valor.split(".");
  if (partes.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(partes[0]) || !/^[a-f0-9]{64}$/.test(partes[1]) || !iguais(partes[1], assinatura(`midia:${partes[0]}`))) throw erroHttp(400, "Comprovante de upload inválido.");
  let dados;
  try { dados = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8")); } catch { throw erroHttp(400, "Comprovante de upload inválido."); }
  if (dados.tipo !== tipo || dados.phoneId !== phoneId || !iguais(dados.credencial, hashToken(token))) throw erroHttp(400, "Faça o upload novamente usando a instância e o token desta campanha.");
  if (!Number.isFinite(dados.expiraEm) || dados.expiraEm <= agora) throw erroHttp(410, "O upload expirou. Selecione e envie o arquivo novamente.");
  return { idMidia: dados.idMidia, arquivo: dados.arquivo };
}

export async function enviarArquivo({ buffer, tipo, mime, phoneId, token, nomeArquivo, signal }) {
  const arquivo = validarConteudo(buffer, tipo, mime);
  if (tipo === "documento") {
    try { arquivo.nome = validarNomeArquivo(nomeArquivo); } catch { throw erroHttp(400, "Nome de arquivo inválido ou extensão não permitida."); }
    if (DOCUMENTOS[arquivo.nome.split(".").pop().toLowerCase()] !== mime) throw erroHttp(415, "Extensão e formato do arquivo não correspondem.");
  }
  assinatura("validar-configuracao-upload"); // Falhar antes do envio remoto se faltar a chave do servidor.
  const idMidia = await uzapi.enviarMidia({ phoneId, token, buffer, mime, nomeArquivo: arquivo.nome, signal });
  return { ...criarComprovante({ idMidia, tipo, phoneId, token, arquivo }), arquivo };
}
