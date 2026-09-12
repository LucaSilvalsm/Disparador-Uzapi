import "dotenv/config";
import emailService from "./shared/Email/EmailService.js";

try {
  await emailService.verificarConexao();

  console.log("SMTP conectado com sucesso.");

  const resultado = await emailService.enviar({
    para: "lukas.silvalsm@gmail.com",
    assunto: "Teste SMTP - Disparador UZAPI",
    html: `
      <h2>Teste de envio</h2>
      <p>O SMTP da aplicação está funcionando.</p>
    `,
  });

  console.log("E-mail enviado:", resultado.messageId);

} catch (error) {
  console.error("Erro no SMTP:", error);
}