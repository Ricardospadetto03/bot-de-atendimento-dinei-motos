export const FUSO = 'America/Sao_Paulo';

export const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const INICIAIS_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const DIAS_DE_REVISAO = [2, 3, 4, 5];

export const HORARIO_CHEGADA = '07:00';
export const PREVISAO_TERMINO = '12:00';

const doisDigitos = (n) => String(n).padStart(2, '0');

export function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

export function horaEmBrasilia(agora = new Date()) {
  return Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, hour: '2-digit', hourCycle: 'h23',
  }).format(agora));
}

export function montarData(ano, mes, dia) {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

export function somarDias(data, quantidade) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

export function diaDaSemana(data) {
  return new Date(data + 'T00:00:00Z').getUTCDay();
}

export function ehDiaDeRevisao(data) {
  return DIAS_DE_REVISAO.includes(diaDaSemana(data));
}

export function diasNoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function diasEntre(de, ate) {
  return Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400000);
}

export function dataPorExtenso(data) {
  const [, mes, dia] = data.split('-').map(Number);
  return `${NOMES_DIAS[diaDaSemana(data)]}, ${dia} de ${NOMES_MESES[mes - 1]}`;
}

export function dataCurta(data) {
  const [, mes, dia] = data.split('-');
  return `${NOMES_DIAS[diaDaSemana(data)].slice(0, 3)}, ${dia}/${mes}`;
}

export function quandoRelativo(data, hoje) {
  const d = diasEntre(hoje, data);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`;
}

export function saudacao(agora = new Date()) {
  const hora = horaEmBrasilia(agora);
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function formatarCelular(numero) {
  if (!numero || numero.length < 12) return numero || '';
  const ddd = numero.slice(2, 4);
  const resto = numero.slice(4);
  return `(${ddd}) ${resto.slice(0, -4)}-${resto.slice(-4)}`;
}
