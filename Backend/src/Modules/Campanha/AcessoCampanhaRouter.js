import { Router } from "express";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "../../prisma/db.js";
import { config } from "../../shared/config.js";
import { erroHttp } from "../../shared/utils/erros.js";
import { tokenBearer, hashToken, iguais } from "../../shared/utils/segredos.js";
import { limitarRequisicoes } from "../../shared/middleware/acesso.js";
import { venceu, estadosFinais } from "./CicloCampanhaService.js";
import campanhaService from "./CampanhaService.js";
import { exportarCsv, exportarExcel } from "./ExportacaoCampanhaService.js";

export function validarAcesso(
  campanha,
  tipo,
  token,
  agora = Temporal.Now.instant(),
) {
  const hash =
    tipo === "progresso"
      ? campanha?.hashTokenAcesso
      : campanha?.hashTokenRelatorio;
  if (
    !campanha?.temporaria ||
    !token ||
    !hash ||
    !iguais(hashToken(token), hash)
  )
    throw erroHttp(404, "Acesso não encontrado ou inválido.");
  if (tipo === "progresso" && campanha.status !== "em_andamento")
    throw erroHttp(
      410,
      "O acompanhamento foi encerrado. Consulte o link do relatório enviado por e-mail.",
    );
  if (
    tipo === "relatorio" &&
    (!estadosFinais.includes(campanha.status) ||
      !campanha.expiraEm ||
      venceu(campanha.expiraEm, agora))
  ) {
    throw erroHttp(410, "O acesso ao relatório expirou ou está indisponível.");
  }
}

function cookieToken(req) {
  const item = (req.get("Cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("acesso_campanha="));
  const valor = item?.slice("acesso_campanha=".length) || "";
  return /^[A-Za-z0-9_-]{43}$/.test(valor) ? valor : "";
}

const router = Router();
router.use(limitarRequisicoes(180));
router.use("/:idPublico/:tipo", async (req, res, next) => {
  try {
    const { idPublico, tipo } = req.params;
    if (
      !/^[a-f0-9-]{36}$/.test(idPublico) ||
      !["progresso", "relatorio"].includes(tipo)
    )
      throw erroHttp(404, "Acesso não encontrado ou inválido.");
    const campanha = await db.orm.public.Campanha.where({ idPublico }).first();
    const token =
      tokenBearer(req) || (req.method === "GET" ? cookieToken(req) : "");
    validarAcesso(campanha, tipo, token);
    req.acessoCampanha = { campanha, tipo, token };
    next();
  } catch (error) {
    next(error);
  }
});

router.post("/:idPublico/:tipo/sessao", (req, res) => {
  const { campanha, tipo, token } = req.acessoCampanha;
  const maxAge =
    tipo === "relatorio"
      ? Math.max(
          0,
          Math.floor(
            (Number(campanha.expiraEm.epochMilliseconds) - Date.now()) / 1000,
          ),
        )
      : 86400;
  const secure =
    new URL(config.publicBaseUrl).protocol === "https:" ? "; Secure" : "";
  res.set(
    "Set-Cookie",
    `acesso_campanha=${token}; Path=/acessos/${campanha.idPublico}/${tipo}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  );
  res.status(204).end();
});

router.get("/:idPublico/progresso", async (req, res, next) => {
  try {
    const { campanha } = req.acessoCampanha;
    const data = await campanhaService.progresso(campanha.id);
    // Revalida após a leitura para não prolongar o acesso durante a finalização.
    validarAcesso(
      await db.orm.public.Campanha.where({ id: campanha.id }).first(),
      "progresso",
      req.acessoCampanha.token,
    );
    res.json({ data: { ...data, campanhaId: campanha.idPublico } });
  } catch (error) {
    next(error);
  }
});

router.get("/:idPublico/relatorio", async (req, res, next) => {
  try {
    const { campanha } = req.acessoCampanha;
    const data = await campanhaService.relatorio(campanha.id);
    validarAcesso(campanha, "relatorio", req.acessoCampanha.token);
    res.json({
      data: {
        ...data,
        campanhaId: campanha.idPublico,
        expiraEm: campanha.expiraEm,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:idPublico/relatorio/exportar",
  limitarRequisicoes(10),
  async (req, res, next) => {
    try {
      const { campanha } = req.acessoCampanha;
      const formato = req.query.formato || "csv";
      if (!["csv", "xlsx"].includes(formato))
        throw erroHttp(400, "Formato permitido: csv ou xlsx.");
      const relatorio = await campanhaService.relatorio(campanha.id);
      const conteudo =
        formato === "csv"
          ? exportarCsv(relatorio)
          : await exportarExcel(relatorio);
      validarAcesso(campanha, "relatorio", req.acessoCampanha.token);
      res.set(
        "Content-Disposition",
        `attachment; filename="relatorio-${campanha.idPublico}.${formato}"`,
      );
      res
        .type(
          formato === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .send(conteudo);
    } catch (error) {
      next(error);
    }
  },
);
export default router;
