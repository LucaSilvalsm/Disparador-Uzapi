import express from "express";
import router from "./router.js";
import midiaRoutes from "./Modules/Midia/MidiaRouter.js";
import { registrarErro } from "./shared/utils/erros.js";
import { serializarDatas } from "./shared/utils/serializarDatas.js";
import { fileURLToPath } from "node:url";

const app = express();
app.set("json replacer", serializarDatas);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
});
// Arquivos JSON também são bytes de upload; não passar pelo parser de formulários.
app.use("/midias", midiaRoutes);
app.use(express.json({ limit: "256kb" }));
app.use(
  "/assets",
  express.static(fileURLToPath(new URL("../public/assets", import.meta.url))),
);
function paginaPublica(arquivo) {
  return (req, res) => {
    // Exceção limitada às páginas: o Play CDN gera folhas de estilo no navegador.
    // APIs continuam com a CSP restrita acima. Remover esta exceção ao compilar Tailwind em produção.
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self' https://cdn.jsdelivr.net/npm/@tailwindcss/; style-src 'self' 'unsafe-inline'; style-src-attr 'none'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.sendFile(
      fileURLToPath(new URL(`../public/${arquivo}`, import.meta.url)),
    );
  };
}
app.get("/", (req, res) => res.redirect("/disparador"));
app.get("/disparador", paginaPublica("formulario.html"));
for (const pagina of ["acompanhamento", "relatorio"]) {
  app.get(`/${pagina}/:idPublico`, paginaPublica("consulta.html"));
}

app.use(router);

app.use((req, res) => {
  return res.status(404).json({
    message: "Rota não encontrada.",
  });
});

app.use((error, req, res, next) => {
  const errorId = registrarErro("erro_http", error);
  const codigo = error.statusCode || error.status;
  const status =
    Number.isInteger(codigo) && codigo >= 400 && codigo <= 599 ? codigo : 500;
  let message = "Erro interno do servidor.";
  if (status < 500) {
    message =
      error.type === "entity.parse.failed"
        ? "Corpo JSON inválido."
        : error.type === "entity.too.large"
          ? "Corpo da requisição excede o limite permitido."
          : String(error.message || "Requisição inválida.")
              .replace(/[\r\n]/g, " ")
              .slice(0, 400);
  }
  return res.status(status).json({ message, errorId });
});

export default app;
