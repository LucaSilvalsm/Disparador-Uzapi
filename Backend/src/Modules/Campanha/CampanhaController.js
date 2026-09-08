import campanhaService from "./CampanhaService.js";

class CampanhaController {
  async cadastrar(req, res, next) {
    try {
      const campanha = await campanhaService.cadastrar(req.body);

      return res.status(201).json({
        message: "Campanha criada com sucesso.",

        data: campanha,
      });
    } catch (error) {
      next(error);
    }
  }

  async listar(req, res, next) {
    try {
      const campanhas = await campanhaService.listar();

      return res.status(200).json({
        data: campanhas,
      });
    } catch (error) {
      next(error);
    }
  }

  async buscarPorId(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da campanha inválido.");

        error.statusCode = 400;

        throw error;
      }

      const campanha = await campanhaService.buscarPorId(id);

      return res.status(200).json({
        data: campanha,
      });
    } catch (error) {
      next(error);
    }
  }
  async iniciar(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da campanha inválido.");

        error.statusCode = 400;

        throw error;
      }

      const resultado = await campanhaService.iniciar(id);

      return res.status(202).json({
        message: "Campanha iniciada. O processamento continuará em segundo plano.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CampanhaController();
