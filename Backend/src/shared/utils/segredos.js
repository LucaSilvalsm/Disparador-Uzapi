import { createHash, createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { erroHttp } from "./erros.js";

export const gerarToken = () => randomBytes(32).toString("base64url");
export const hashToken = (valor) => createHash("sha256").update(String(valor)).digest("hex");
export function iguais(a, b) {
  return timingSafeEqual(Buffer.from(hashToken(a)), Buffer.from(hashToken(b)));
}
function chave() {
  const valor = process.env.CAMPAIGN_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(valor)) throw erroHttp(503, "O serviço de campanhas ainda não foi configurado.");
  return Buffer.from(valor, "hex");
}
export function cifrar(valor, contexto) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  cipher.setAAD(Buffer.from(contexto));
  const data = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((item) => item.toString("base64url")).join(".");
}
export function decifrar(valor, contexto) {
  const [iv, tag, data] = valor.split(".").map((item) => Buffer.from(item, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", chave(), iv);
  cipher.setAAD(Buffer.from(contexto));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export const assinatura = (valor) => createHmac("sha256", chave()).update(valor).digest("hex");

export function tokenBearer(req) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.get("Authorization") || "");
  return match?.[1] || "";
}
