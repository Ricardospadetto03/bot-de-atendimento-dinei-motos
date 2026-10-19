function ehConversaPrivada(jid) {
  return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}

function numeroDoJid(jid) {
  return jid.split('@')[0].split(':')[0];
}

const TIPOS_DE_MIDIA = [
  'imageMessage', 'audioMessage', 'videoMessage', 'documentMessage',
  'stickerMessage', 'locationMessage', 'contactMessage', 'contactsArrayMessage',
  'ptvMessage', 'documentWithCaptionMessage',
];

function desembrulhar(mensagem) {
  let atual = mensagem;
  for (let i = 0; i < 3 && atual; i++) {
    const embrulho = atual.ephemeralMessage || atual.viewOnceMessage || atual.viewOnceMessageV2;
    if (!embrulho) break;
    atual = embrulho.message;
  }
  return atual;
}

function classificarMensagem(mensagemBruta) {
  const mensagem = desembrulhar(mensagemBruta);
  if (!mensagem) return { tipo: 'ignorar' };

  const texto = mensagem.conversation || (mensagem.extendedTextMessage && mensagem.extendedTextMessage.text);
  if (typeof texto === 'string' && texto.trim()) {
    return { tipo: 'texto', texto };
  }
  if (TIPOS_DE_MIDIA.some((tipo) => mensagem[tipo])) {
    return { tipo: 'midia' };
  }
  return { tipo: 'ignorar' };
}

function idadeEmSegundos(timestamp, agora = new Date()) {
  const segundos = timestamp && typeof timestamp === 'object' && typeof timestamp.toNumber === 'function'
    ? timestamp.toNumber()
    : Number(timestamp);
  if (!Number.isFinite(segundos)) return 0;
  return Math.floor(agora.getTime() / 1000) - segundos;
}

function numeroPermitido(numero, listaTexto) {
  if (!listaTexto || !listaTexto.trim()) return true;
  const { mesmoNumero } = require('./validacao');
  const permitidos = listaTexto.split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean);
  return permitidos.some((permitido) => mesmoNumero(permitido, numero));
}

function tempoDigitando(texto, sorteio = Math.random()) {
  const base = 1200 + texto.length * 25;
  return Math.min(base, 6000) + Math.floor(sorteio * 800);
}

class LimitePorConversa {
  constructor(maximo = 20, janelaMinutos = 60) {
    this.maximo = maximo;
    this.janelaMs = janelaMinutos * 60 * 1000;
    this.registros = new Map();
  }

  permitir(chave, agora = Date.now()) {
    const recentes = (this.registros.get(chave) || []).filter((t) => agora - t < this.janelaMs);
    if (recentes.length >= this.maximo) {
      this.registros.set(chave, recentes);
      return false;
    }
    recentes.push(agora);
    this.registros.set(chave, recentes);
    this.faxina(agora);
    return true;
  }

  faxina(agora) {
    if (this.registros.size < 500) return;
    for (const [chave, horarios] of this.registros) {
      if (horarios.every((t) => agora - t >= this.janelaMs)) this.registros.delete(chave);
    }
  }
}

class MemoriaLimitada {
  constructor(tamanho = 2000) {
    this.tamanho = tamanho;
    this.itens = new Set();
  }

  has(item) {
    return this.itens.has(item);
  }

  add(item) {
    this.itens.add(item);
    if (this.itens.size > this.tamanho) {
      const maisAntigo = this.itens.values().next().value;
      this.itens.delete(maisAntigo);
    }
  }

  delete(item) {
    this.itens.delete(item);
  }

  get size() {
    return this.itens.size;
  }
}

module.exports = {
  ehConversaPrivada,
  numeroDoJid,
  classificarMensagem,
  idadeEmSegundos,
  numeroPermitido,
  tempoDigitando,
  LimitePorConversa,
  MemoriaLimitada,
};
