// Limites locais do disparador, aplicados também pelo backend.
export const DOCUMENTOS = Object.freeze({ pdf: "application/pdf", zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain", csv: "text/csv", css: "text/css", json: "application/json", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp3: "audio/mpeg", mp4: "video/mp4" });
export function validarNomeArquivo(nome) {
  if (typeof nome !== "string" || !nome.trim() || nome.length > 150 || /[\\/\x00-\x1f\x7f]/.test(nome) || !Object.hasOwn(DOCUMENTOS, nome.split(".").pop().toLowerCase())) throw new Error("Nome de arquivo inválido ou extensão não permitida.");
  return nome.trim();
}
export const MIDIAS = Object.freeze({
  documento: { limite: 16 * 1024 * 1024, mimes: Object.values(DOCUMENTOS), accept: Object.keys(DOCUMENTOS).map(ext => `.${ext}`).join(","), ajuda: "PDF, ZIP, RAR, 7Z, XLS/XLSX, DOC/DOCX, PPT/PPTX, TXT, CSV, CSS, JSON e mídias JPG/PNG/MP3/MP4 · até 16 MB" },
  imagem: { limite: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png"], accept: ".jpg,.jpeg,.png", ajuda: "JPG ou PNG · até 5 MB" },
  audio: { limite: 16 * 1024 * 1024, mimes: ["audio/mpeg", "audio/ogg", "audio/mp4", "audio/aac"], accept: ".mp3,.ogg,.opus,.m4a,.aac", ajuda: "MP3, OGG/Opus, M4A ou AAC · até 16 MB" },
  video: { limite: 16 * 1024 * 1024, mimes: ["video/mp4"], accept: ".mp4", ajuda: "MP4 · até 16 MB" },
});
export function mimeArquivo(arquivo) {
  const extensao = arquivo.name.split(".").pop().toLowerCase();
  return ({ ...DOCUMENTOS, ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac" })[extensao] || "";
}
export function validarArquivo(arquivo, tipo) {
  const regra = MIDIAS[tipo];
  if (!regra || !arquivo || !arquivo.size) throw new Error("Selecione um arquivo de mídia não vazio.");
  const mime = mimeArquivo(arquivo);
  if (tipo === "documento") validarNomeArquivo(arquivo.name);
  if (!regra.mimes.includes(mime)) throw new Error(`Formato não permitido. ${regra.ajuda}.`);
  if (arquivo.size > regra.limite) throw new Error(`Arquivo muito grande. ${regra.ajuda}.`);
  return mime;
}
