import { Router, raw } from "express";
import { MIDIAS } from "../../../public/assets/midia-formatos.js";
import { limitarRequisicoes } from "../../shared/middleware/acesso.js";
import { erroHttp } from "../../shared/utils/erros.js";
import uzapi from "../../shared/Integration/Uzapi.js";
import { enviarArquivo } from "./MidiaService.js";

// Buffer transitório em memória, nunca em public/ nem em disco. Limite por processo.
export function criarMidiaRouter(enviar = enviarArquivo) {
  const router = Router();
  let ativos = 0;
  router.post("/:tipo", limitarRequisicoes(12), (req, res, next) => {
    let tipo, mime, phoneId, token;
    try {
      tipo = req.params.tipo;
      mime = (req.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      if (!MIDIAS[tipo]?.mimes.includes(mime))
        throw erroHttp(415, "Formato de mídia não permitido.");
      if ((req.get("Content-Encoding") || "identity") !== "identity")
        throw erroHttp(415, "Envie o arquivo sem compressão HTTP.");
      phoneId = (req.get("X-Phone-Id") || "").trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(phoneId))
        throw erroHttp(400, "Phone ID inválido.");
      const authorization = req.get("Authorization") || "";
      if (!/^Bearer\s+\S+$/i.test(authorization))
        throw erroHttp(
          401,
          "Informe a credencial da Uzapi para enviar o arquivo.",
        );
      token = uzapi.normalizarToken(authorization);
      if (Number(req.get("Content-Length")) > MIDIAS[tipo].limite)
        throw erroHttp(413, `Arquivo muito grande. ${MIDIAS[tipo].ajuda}.`);
      if (ativos >= 2) {
        res.set("Retry-After", "5");
        throw erroHttp(
          429,
          "Há uploads em andamento. Tente novamente em instantes.",
        );
      }
    } catch (error) {
      return next(error);
    }
    ativos++;
    const controller = new AbortController();
    const abortar = () => controller.abort();
    const aoFechar = () => {
      if (!res.writableEnded) abortar();
    };
    req.once("aborted", abortar);
    res.once("close", aoFechar);
    const timeout = setTimeout(() => {
      controller.abort();
      req.destroy();
    }, 120000);
    raw({ type: () => true, limit: MIDIAS[tipo].limite, inflate: false })(
      req,
      res,
      async (error) => {
        try {
          if (error) {
            if (error.type === "entity.too.large")
              throw erroHttp(
                413,
                `Arquivo muito grande. ${MIDIAS[tipo].ajuda}.`,
              );
            throw erroHttp(400, "Não foi possível receber o arquivo completo.");
          }
          if (controller.signal.aborted)
            throw erroHttp(400, "Upload interrompido.");
          let nomeArquivo;
          try {
            nomeArquivo = decodeURIComponent(req.get("X-File-Name") || "");
          } catch {
            throw erroHttp(400, "Nome de arquivo inválido.");
          }
          const data = await enviar({
            buffer: req.body,
            tipo,
            mime,
            phoneId,
            token,
            nomeArquivo,
            signal: controller.signal,
          });
          if (!res.destroyed) res.status(201).json({ data });
        } catch (erro) {
          if (!res.destroyed) next(erro);
        } finally {
          req.body = undefined;
          token = undefined;
          ativos--;
          clearTimeout(timeout);
          req.off("aborted", abortar);
          res.off("close", aoFechar);
        }
      },
    );
  });
  return router;
}
export default criarMidiaRouter();
