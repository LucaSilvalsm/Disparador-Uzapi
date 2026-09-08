import { Router } from "express";
import instanciaController from "./InstanciaController.js";

const router = Router();

router.post("/", instanciaController.cadastrar);
router.get("/", instanciaController.listar);
router.get("/:id", instanciaController.buscarPorId);
router.patch("/:id", instanciaController.atualizar);

router.patch("/:id/ativar", instanciaController.ativar);
router.patch("/:id/desativar", instanciaController.desativar);

router.delete("/:id", instanciaController.excluir);

export default router;