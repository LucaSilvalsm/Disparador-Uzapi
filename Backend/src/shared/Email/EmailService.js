import nodemailer from "nodemailer";

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 25),
      secure: process.env.SMTP_SECURE === "true",

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async enviar({ para, assunto, html }) {
    if (!para) {
      return;
    }

    return this.transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: para,
      subject: assunto,
      html,
    });
  }

  async verificarConexao() {
    return this.transporter.verify();
  }
}

export default new EmailService();