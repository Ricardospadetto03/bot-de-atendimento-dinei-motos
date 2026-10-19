const noSitePublicado = location.hostname === 'dinei-motos-bot.web.app';

export const firebaseConfig = {
  apiKey: 'AIzaSyCU8PA2HG4xmoZaoHCIXHGAqVTdWLNUwYI',
  authDomain: noSitePublicado ? 'dinei-motos-bot.web.app' : 'dinei-motos-bot.firebaseapp.com',
  projectId: 'dinei-motos-bot',
  storageBucket: 'dinei-motos-bot.firebasestorage.app',
  messagingSenderId: '759929647101',
  appId: '1:759929647101:web:47d5087175dc2710f47394',
};
