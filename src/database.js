const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const chaveDeServico = require('../firebase-key.json');

initializeApp({ credential: cert(chaveDeServico) });

const db = getFirestore();

module.exports = db;
