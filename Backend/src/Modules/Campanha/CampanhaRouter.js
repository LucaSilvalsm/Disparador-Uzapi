import { Router } from "express";

import campanhaController from "./CampanhaController.js";

const router = Router();

router.post("/", campanhaController.cadastrar);

router.get("/", campanhaController.listar);

router.get("/:id", campanhaController.buscarPorId);
router.post("/:id/iniciar", campanhaController.iniciar);

router.get("/:id/progresso", campanhaController.progresso);
router.get("/:id/relatorio", campanhaController.relatorio);

export default router;
