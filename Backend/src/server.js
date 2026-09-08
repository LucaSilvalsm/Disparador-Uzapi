import { Temporal } from "@js-temporal/polyfill";

globalThis.Temporal = Temporal;

import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});