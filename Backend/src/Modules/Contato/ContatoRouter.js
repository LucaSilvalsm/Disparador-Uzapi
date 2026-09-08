import { Router } from "express";
import contatoController from "./ContatoController.js";

const router = Router();

router.post(
  "/validar-lista",
  contatoController.validarLista
);

router.get(
  "/",
  contatoController.listar
);

export default router;