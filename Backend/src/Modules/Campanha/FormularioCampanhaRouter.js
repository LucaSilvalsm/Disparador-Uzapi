import { Router } from "express";
import formulario from "./FormularioCampanhaService.js";
import { limitarRequisicoes } from "../../shared/middleware/acesso.js";

const router = Router();
router.post("/", limitarRequisicoes(10), async (req, res, next) => {
  try {
    const data = await formulario.iniciar(req.body, req.get("Idempotency-Key"));
    res.status(data.repetida ? 200 : 202).json({ message: data.repetida ? "Solicitação já recebida." : "Campanha iniciada. O link de acompanhamento será enviado por e-mail.", data });
  } catch (error) { next(error); }
});
export default router;
