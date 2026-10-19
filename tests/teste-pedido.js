const { verificarData, listarDatasLivresNoMes, proximaDataLivre, somarDias } = require('../src/agenda');
const { interpretarPedido, formatarData, nomeDoMes } = require('../src/texto-data');

const HOJE = '2026-10-15';

function conferir(descricao, obtido, esperado) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  const passou = o === e;
  console.log(`${passou ? 'OK    ' : 'FALHOU'} ${descricao} → ${o}${passou ? '' : ` (esperado: ${e})`}`);
}

async function responder(mensagem) {
  const pedido = interpretarPedido(mensagem, HOJE);

  if (!pedido) {
    return 'Não entendi a data. Pode me mandar assim: 20/10?';
  }

  if (pedido.tipo === 'PROXIMA') {
    const data = await proximaDataLivre(somarDias(HOJE, 1));
    return `A próxima vaga é ${formatarData(data)}. Pode ser?`;
  }

  if (pedido.tipo === 'MES') {
    const livres = await listarDatasLivresNoMes(pedido.ano, pedido.mes, HOJE);
    if (livres.length === 0) return `Em ${nomeDoMes(pedido.mes)} não tenho mais vaga.`;
    return `Em ${nomeDoMes(pedido.mes)} tenho: ${livres.map(formatarData).join(', ')}. Qual prefere?`;
  }

  const r = await verificarData(pedido.data, HOJE);
  if (r.situacao === 'LIVRE') return `${formatarData(pedido.data)} está livre! Vamos agendar?`;
  const motivo = {
    OCUPADA: 'já está ocupada',
    DIA_INVALIDO: 'não é dia de revisão (só terça a sexta)',
    DATA_PASSADA: 'já passou',
  }[r.situacao];
  return `${formatarData(pedido.data)} ${motivo}. A mais próxima que tenho é ${formatarData(r.sugestoes[0])}` +
    `, e tenho também ${r.sugestoes.slice(1).map(formatarData).join(' e ')}.`;
}

async function testar() {
  const p = (texto) => interpretarPedido(texto, HOJE);
  conferir('"dia 2 do 2"', p('dia 2 do 2'), { tipo: 'DATA', data: '2027-02-02' });
  conferir('"qual dia em março tem"', p('qual dia em março tem'), { tipo: 'MES', ano: 2027, mes: 3 });
  conferir('"qual próxima vaga tem"', p('qual próxima vaga tem'), { tipo: 'PROXIMA' });
  conferir('"10 de março"', p('pode ser 10 de março?'), { tipo: 'DATA', data: '2027-03-10' });
  conferir('"dia 20"', p('dia 20 da pra mim'), { tipo: 'DATA', data: '2026-10-20' });
  conferir('"dia 10" (já passou → novembro)', p('dia 10'), { tipo: 'DATA', data: '2026-11-10' });
  conferir('"amanhã"', p('amanhã tem?'), { tipo: 'DATA', data: '2026-10-16' });
  conferir('"depois de amanhã"', p('depois de amanhã'), { tipo: 'DATA', data: '2026-10-17' });
  conferir('"terça que vem"', p('terça que vem'), { tipo: 'DATA', data: '2026-10-20' });
  conferir('"próxima quarta"', p('próxima quarta'), { tipo: 'DATA', data: '2026-10-21' });
  conferir('"mês que vem"', p('tem mês que vem?'), { tipo: 'MES', ano: 2026, mes: 11 });
  conferir('"20/10" continua funcionando', p('20/10'), { tipo: 'DATA', data: '2026-10-20' });
  conferir('"dia 31/02" não existe', p('dia 31/02'), null);
  conferir('"bom dia" não é data', p('bom dia'), null);

  console.log('\n--- conversas ---');
  for (const frase of [
    'qual próxima vaga tem',
    'qual dia em março tem',
    'dia 2 do 2',
    'em dezembro tem?',
    'sábado dia 5 de dezembro',
    'bom dia',
  ]) {
    console.log(`Cliente: ${frase}\nBot:     ${await responder(frase)}\n`);
  }
}

testar();
