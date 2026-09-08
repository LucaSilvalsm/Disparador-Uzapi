import { Router } from "express";
import instanciaRoutes from "./Modules/Instancia/InstanciaRouter.js";
import contatoRoutes from "./Modules/Contato/ContatoRouter.js";
import campanhaRoutes from "./Modules/Campanha/CampanhaRouter.js";

const router = Router();

router.use("/instancias", instanciaRoutes);
router.use("/contatos", contatoRoutes);
router.use("/campanhas", campanhaRoutes);

export default router;