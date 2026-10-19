function limparTexto(texto) {
  return texto.replace(/\s+/g, ' ').trim().slice(0, 60);
}

const PALAVRAS_MINUSCULAS = ['da', 'de', 'do', 'das', 'dos', 'e'];
function capitalizarNome(texto) {
  return limparTexto(texto)
    .toLowerCase()
    .split(' ')
    .map((palavra, i) =>
      i > 0 && PALAVRAS_MINUSCULAS.includes(palavra)
        ? palavra
        : palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

function interpretarNome(texto) {
  const nome = capitalizarNome(texto);
  if (nome.length < 2 || !/[a-zà-ú]/i.test(nome)) return null;
  return nome;
}

function interpretarCelular(texto) {
  let digitos = texto.replace(/\D/g, '');
  digitos = digitos.replace(/^0+/, '');

  if (digitos.length === 10 || digitos.length === 11) {
    digitos = '55' + digitos;
  }

  if (!/^55\d{10,11}$/.test(digitos)) return null;
  return digitos;
}

function variantesDoNumero(numero) {
  if (/^55\d{2}9\d{8}$/.test(numero)) {
    return [numero, numero.slice(0, 4) + numero.slice(5)];
  }
  if (/^55\d{2}\d{8}$/.test(numero)) {
    return [numero, numero.slice(0, 4) + '9' + numero.slice(4)];
  }
  return [numero];
}

function mesmoNumero(a, b) {
  return variantesDoNumero(a).includes(b);
}

function formatarCelular(numero) {
  const ddd = numero.slice(2, 4);
  const resto = numero.slice(4);
  return `(${ddd}) ${resto.slice(0, -4)}-${resto.slice(-4)}`;
}

function escolheuOpcao(texto, numero) {
  const limpo = texto.trim().toLowerCase().replace(/^op[cç][aã]o\s*/, '');
  return new RegExp(`^${numero}(\\uFE0F?\\u20E3)?(\\s+\\D*)?$`).test(limpo);
}

function interpretarModelo(texto) {
  const modelo = limparTexto(texto).toUpperCase();
  return modelo.length >= 2 ? modelo : null;
}

function interpretarAno(texto, anoAtual) {
  const encontrado = texto.match(/\b(19[5-9]\d|20\d\d)\b/);
  if (!encontrado) return null;
  const ano = Number(encontrado[1]);
  return ano <= anoAtual + 1 ? ano : null;
}

module.exports = {
  limparTexto,
  interpretarNome,
  interpretarCelular,
  variantesDoNumero,
  mesmoNumero,
  formatarCelular,
  escolheuOpcao,
  interpretarModelo,
  interpretarAno,
};
