import contatoRepository from "./ContatoRepository.js";

class ContatoService {

  normalizarTelefone(telefone) {
    if (!telefone) {
      return null;
    }

    let numero = String(telefone)
      .trim()
      .replace(/\D/g, "");

    if (!numero) {
      return null;
    }

    // MVP: números brasileiros
    if (!numero.startsWith("55")) {
      numero = `55${numero}`;
    }

    return numero;
  }

  validarTelefone(telefone) {
    if (!telefone) {
      return false;
    }

    /*
      Brasil:
      55 + DDD + número

      Normalmente:
      12 ou 13 dígitos no total
    */
    return /^\d{12,13}$/.test(telefone);
  }

  parsearLista(lista) {
    if (!lista || typeof lista !== "string") {
      const error = new Error(
        "A lista de contatos é obrigatória."
      );

      error.statusCode = 400;
      throw error;
    }

    const linhas = lista
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter(Boolean);

    if (linhas.length < 2) {
      const error = new Error(
        "O disparo deve conter uma lista com pelo menos 2 contatos."
      );

      error.statusCode = 400;
      throw error;
    }

    const validos = [];
    const invalidos = [];

    const telefonesEncontrados = new Set();

    linhas.forEach((linha, index) => {

      const partes = linha.split(",");

      const telefoneOriginal = partes[0]?.trim();
      const nome = partes[1]?.trim() || null;

      const telefone =
        this.normalizarTelefone(telefoneOriginal);

      if (!telefone || !this.validarTelefone(telefone)) {
        invalidos.push({
          linha: index + 1,
          conteudo: linha,
          erro: "Telefone inválido.",
        });

        return;
      }

      /*
        Evita duplicidade dentro da própria lista.
      */
      if (telefonesEncontrados.has(telefone)) {
        invalidos.push({
          linha: index + 1,
          conteudo: linha,
          erro: "Telefone duplicado na lista.",
        });

        return;
      }

      telefonesEncontrados.add(telefone);

      validos.push({
        telefone,
        nome,
      });
    });

    if (validos.length < 2) {
      const error = new Error(
        "A lista deve possuir pelo menos 2 contatos válidos."
      );

      error.statusCode = 400;
      throw error;
    }

    return {
      quantidadeTotal: linhas.length,
      quantidadeValidos: validos.length,
      quantidadeInvalidos: invalidos.length,
      validos,
      invalidos,
    };
  }

  async validarLista(lista) {
    return this.parsearLista(lista);
  }

  async obterOuCriarContato(data) {
    const contatoExistente =
      await contatoRepository.buscarPorTelefone(
        data.telefone
      );

    if (contatoExistente) {
      return contatoExistente;
    }

    return contatoRepository.cadastrar({
      telefone: data.telefone,
      nome: data.nome,
    });
  }

  async prepararContatos(lista) {
    const resultado = this.parsearLista(lista);

    const contatos = [];

    for (const contato of resultado.validos) {
      const contatoBanco =
        await this.obterOuCriarContato(contato);

      contatos.push(contatoBanco);
    }

    return {
      ...resultado,
      contatos,
    };
  }
}

export default new ContatoService();