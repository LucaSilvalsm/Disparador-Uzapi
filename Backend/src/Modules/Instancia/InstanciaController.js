import instanciaService from "./InstanciaService.js";

class InstanciaController {

  async cadastrar(req, res, next) {
    try {
      const instancia = await instanciaService.cadastrar(req.body);

      return res.status(201).json({
        message: "Instância cadastrada com sucesso.",
        data: instancia,
      });
    } catch (error) {
      next(error);
    }
  }

  async listar(req, res, next) {
    try {
      const instancias = await instanciaService.listar();

      return res.status(200).json({
        data: instancias,
      });
    } catch (error) {
      next(error);
    }
  }

  async buscarPorId(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da instância inválido.");
        error.statusCode = 400;

        throw error;
      }

      const instancia = await instanciaService.buscarPorId(id);

      return res.status(200).json({
        data: instancia,
      });
    } catch (error) {
      next(error);
    }
  }

  async atualizar(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da instância inválido.");
        error.statusCode = 400;

        throw error;
      }

      const instancia = await instanciaService.atualizar(
        id,
        req.body
      );

      return res.status(200).json({
        message: "Instância atualizada com sucesso.",
        data: instancia,
      });
    } catch (error) {
      next(error);
    }
  }

  async ativar(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da instância inválido.");
        error.statusCode = 400;

        throw error;
      }

      const instancia = await instanciaService.atualizar(id, {
        ativo: true,
      });

      return res.status(200).json({
        message: "Instância ativada com sucesso.",
        data: instancia,
      });
    } catch (error) {
      next(error);
    }
  }

  async desativar(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da instância inválido.");
        error.statusCode = 400;

        throw error;
      }

      const instancia = await instanciaService.atualizar(id, {
        ativo: false,
      });

      return res.status(200).json({
        message: "Instância desativada com sucesso.",
        data: instancia,
      });
    } catch (error) {
      next(error);
    }
  }
  async excluir(req, res, next) {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("ID da instância inválido.");
        error.statusCode = 400;

        throw error;
      }

      await instanciaService.excluir(id);

      return res.status(200).json({
        message: "Instância excluida com sucesso.",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new InstanciaController();