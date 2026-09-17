import { Router } from "express";
import instanciaRoutes from "./Modules/Instancia/InstanciaRouter.js";
import contatoRoutes from "./Modules/Contato/ContatoRouter.js";
import campanhaRoutes from "./Modules/Campanha/CampanhaRouter.js";
import formularioRoutes from "./Modules/Campanha/FormularioCampanhaRouter.js";
import acessoRoutes from "./Modules/Campanha/AcessoCampanhaRouter.js";
import { exigirAdmin } from "./shared/middleware/acesso.js";

const router = Router();

router.use("/disparos", formularioRoutes);
router.use("/acessos", acessoRoutes);
router.use("/instancias", exigirAdmin, instanciaRoutes);
router.use("/contatos", exigirAdmin, contatoRoutes);
router.use("/campanhas", exigirAdmin, campanhaRoutes);

export default router;
