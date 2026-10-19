const { diaDaSemana, somarDias } = require('./agenda');

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const DIAS_SEM_ACENTO = NOMES_DIAS.map(semAcento);
const MESES_SEM_ACENTO = NOMES_MESES.map(semAcento);

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizar(texto) {
  return semAcento(texto.toLowerCase());
}

function doisDigitos(numero) {
  return String(numero).padStart(2, '0');
}

function montarData(ano, mes, dia) {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

function dataExiste(data) {
  const convertida = new Date(data + 'T00:00:00Z');
  return !isNaN(convertida) && convertida.toISOString().slice(0, 10) === data;
}

function diaMesNoFuturo(dia, mes, hoje) {
  const anoAtual = Number(hoje.slice(0, 4));
  const desteAno = montarData(anoAtual, mes, dia);
  if (dataExiste(desteAno) && desteAno >= hoje) return desteAno;
  const doProximo = montarData(anoAtual + 1, mes, dia);
  return dataExiste(doProximo) ? doProximo : null;
}

function interpretarData(texto, hoje) {
  const encontrado = texto.match(/(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?/);
  if (!encontrado) {
    return null;
  }

  const dia = Number(encontrado[1]);
  const mes = Number(encontrado[2]);

  if (!encontrado[3]) {
    return diaMesNoFuturo(dia, mes, hoje);
  }

  let ano = Number(encontrado[3]);
  if (ano < 100) ano += 2000;
  const data = montarData(ano, mes, dia);
  return dataExiste(data) ? data : null;
}

function interpretarPedido(mensagem, hoje) {
  const texto = normalizar(mensagem);
  const amanha = somarDias(hoje, 1);
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));
  const meses = MESES_SEM_ACENTO.join('|');

  if (/\d{1,2}\s*[\/.\-]\s*\d{1,2}/.test(texto)) {
    const data = interpretarData(texto, hoje);
    return data ? { tipo: 'DATA', data } : null;
  }

  let m = texto.match(/(\d{1,2})\s+(?:do|de)\s+(\d{1,2})\b/);
  if (m) {
    const data = diaMesNoFuturo(Number(m[1]), Number(m[2]), hoje);
    return data ? { tipo: 'DATA', data } : null;
  }

  m = texto.match(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${meses})\\b`));
  if (m) {
    const mes = MESES_SEM_ACENTO.indexOf(m[2]) + 1;
    const data = diaMesNoFuturo(Number(m[1]), mes, hoje);
    return data ? { tipo: 'DATA', data } : null;
  }

  m = texto.match(/\bdia\s+(\d{1,2})\b/);
  if (m) {
    const dia = Number(m[1]);
    let data = montarData(anoAtual, mesAtual, dia);
    if (!dataExiste(data) || data < amanha) {
      const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
      const anoDoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
      data = montarData(anoDoProximo, proximoMes, dia);
    }
    return dataExiste(data) ? { tipo: 'DATA', data } : null;
  }

  if (/depois de amanha/.test(texto)) {
    return { tipo: 'DATA', data: somarDias(hoje, 2) };
  }
  if (/\bamanha\b/.test(texto)) {
    return { tipo: 'DATA', data: amanha };
  }

  for (let numeroDoDia = 0; numeroDoDia < 7; numeroDoDia++) {
    if (new RegExp(`\\b${DIAS_SEM_ACENTO[numeroDoDia]}\\b`).test(texto)) {
      for (let i = 1; i <= 7; i++) {
        const data = somarDias(hoje, i);
        if (diaDaSemana(data) === numeroDoDia) return { tipo: 'DATA', data };
      }
    }
  }

  if (/\bmes que vem\b|\bproximo mes\b/.test(texto)) {
    return mesAtual === 12
      ? { tipo: 'MES', ano: anoAtual + 1, mes: 1 }
      : { tipo: 'MES', ano: anoAtual, mes: mesAtual + 1 };
  }
  m = texto.match(new RegExp(`\\b(${meses})\\b`));
  if (m) {
    const mes = MESES_SEM_ACENTO.indexOf(m[1]) + 1;
    return { tipo: 'MES', ano: mes < mesAtual ? anoAtual + 1 : anoAtual, mes };
  }

  if (/proxim|primeira|mais cedo|quando (tem|da|pode)|qual dia|que dia|vaga|disponiv|livre/.test(texto)) {
    return { tipo: 'PROXIMA' };
  }

  return null;
}

function formatarData(data) {
  const [, mes, dia] = data.split('-');
  return `${NOMES_DIAS[diaDaSemana(data)]}, ${dia}/${mes}`;
}

function nomeDoMes(mes) {
  return NOMES_MESES[mes - 1];
}

module.exports = { interpretarData, interpretarPedido, formatarData, nomeDoMes };
