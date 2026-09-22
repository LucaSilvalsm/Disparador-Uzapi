import { Router } from "express";
import instanciaRoutes from "./Modules/Instancia/InstanciaRouter.js";
import contatoRoutes from "./Modules/Contato/ContatoRouter.js";
import campanhaRoutes from "./Modules/Campanha/CampanhaRouter.js";
import campanhaController from "./Modules/Campanha/CampanhaController.js";
import formularioRoutes from "./Modules/Campanha/FormularioCampanhaRouter.js";
import acessoRoutes from "./Modules/Campanha/AcessoCampanhaRouter.js";
import { exigirAdmin, limitarRequisicoes } from "./shared/middleware/acesso.js";

const router = Router();

router.use("/disparos", formularioRoutes);
router.use("/acessos", acessoRoutes);
router.use("/instancias", exigirAdmin, instanciaRoutes);
router.use("/contatos", exigirAdmin, contatoRoutes);
// Exceção provisória, documentada nos .md: não libera as demais rotas da campanha.
router.get("/campanhas/uuid/:uuid", limitarRequisicoes(60), campanhaController.buscarPorUuid);
router.use("/campanhas", exigirAdmin, campanhaRoutes);

export default router;
