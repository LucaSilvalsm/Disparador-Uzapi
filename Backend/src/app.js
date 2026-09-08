import express from "express";
import router from "./router.js";
import { registrarErro } from "./shared/utils/erros.js";
import { serializarDatas } from "./shared/utils/serializarDatas.js";

const app = express();
app.set("json replacer", serializarDatas);

app.use(express.json());

app.use(router);

app.use((req, res) => {
  return res.status(404).json({
    message: "Rota não encontrada.",
  });
});

app.use((error, req, res, next) => {
  const errorId = registrarErro("erro_http", error);
  const codigo = error.statusCode || error.status;
  const status = Number.isInteger(codigo) && codigo >= 400 && codigo <= 599 ? codigo : 500;
  let message = "Erro interno do servidor.";
  if (status < 500) {
    message = error.type === "entity.parse.failed" ? "Corpo JSON inválido."
      : error.type === "entity.too.large" ? "Corpo da requisição excede o limite permitido."
      : String(error.message || "Requisição inválida.").replace(/[\r\n]/g, " ").slice(0, 400);
  }
  return res.status(status).json({ message, errorId });
});

export default app;
