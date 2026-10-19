let enviarParaDinei = null;
let enviarParaCliente = null;

function registrarEnvioParaDinei(funcao) {
  enviarParaDinei = funcao;
}

function registrarEnvioParaCliente(funcao) {
  enviarParaCliente = funcao;
}

function disparar(envio, seFalhar) {
  try {
    const promessa = envio();
    if (promessa && typeof promessa.catch === 'function') promessa.catch(seFalhar);
  } catch (erro) {
    seFalhar(erro);
  }
}

function avisarDinei(texto) {
  if (!enviarParaDinei) {
    console.log(`\n[aviso ao Dinei — sem WhatsApp conectado]\n${texto}\n`);
    return;
  }
  disparar(() => enviarParaDinei(texto), (erro) => console.error('Aviso ao Dinei falhou:', erro.message));
}

function avisarCliente(numero, texto, { etapa = 'AGENDADO', nome = 'o cliente' } = {}) {
  if (!enviarParaCliente) {
    console.log(`\n[aviso ao cliente ${numero} — sem WhatsApp conectado]\n${texto}\n`);
    return;
  }
  disparar(() => enviarParaCliente(numero, texto, etapa), (erro) => {
    console.error(`Aviso ao cliente ${numero} falhou:`, erro.message);
    avisarDinei(`⚠️ Não consegui mandar a mensagem para *${nome}* (${numero}).\n` +
      `Motivo: ${erro.message}.\n📲 Avise o cliente por outro meio (ligação, por exemplo).`);
  });
}

module.exports = { registrarEnvioParaDinei, registrarEnvioParaCliente, avisarDinei, avisarCliente };
