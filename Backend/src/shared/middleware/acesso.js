import { iguais, tokenBearer } from "../utils/segredos.js";
import { erroHttp } from "../utils/erros.js";

export function exigirAdmin(req, res, next) {
  const configurado = process.env.ADMIN_API_TOKEN || "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(configurado)) return next(erroHttp(503, "Acesso administrativo indisponível."));
  const recebido = tokenBearer(req);
  if (!recebido || !iguais(recebido, configurado)) return next(erroHttp(401, "Credencial administrativa necessária."));
  next();
}

// Proteção básica do processo. Em múltiplos servidores, aplicar também no proxy.
export function limitarRequisicoes(maximo, janelaMs = 60000) {
  const acessos = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    if (acessos.size > 10000) {
      for (const [key, item] of acessos) if (item.ate <= agora) acessos.delete(key);
      if (acessos.size > 10000) return next(erroHttp(429, "Muitas solicitações. Tente novamente em instantes."));
    }
    const key = req.ip;
    const atual = acessos.get(key);
    const item = atual && atual.ate > agora ? atual : { ate: agora + janelaMs, total: 0 };
    item.total++;
    acessos.set(key, item);
    if (item.total > maximo) {
      res.set("Retry-After", String(Math.ceil((item.ate - agora) / 1000)));
      return next(erroHttp(429, "Muitas solicitações. Tente novamente em instantes."));
    }
    next();
  };
}
