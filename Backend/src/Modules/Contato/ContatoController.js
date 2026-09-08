import contatoService from "./ContatoService.js";

class ContatoController {
  async validarLista(req, res, next) {
    try {
      const { lista } = req.body;

      const resultado = await contatoService.validarLista(lista);

      return res.status(200).json({
        message: "Lista processada com sucesso.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  async listar(req, res, next) {
    try {
      const contatos = await contatoService.listar();

      return res.status(200).json({
        data: contatos,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ContatoController();
