import { initLibrary, refreshLibrary } from './library.js';
import { initViewer, openViewer } from './viewer.js';
import { prefs } from './util.js';

const library = document.getElementById('library');

async function openScore(id) {
  if (await openViewer(id)) library.hidden = true;
}

function backToLibrary() {
  library.hidden = false;
  refreshLibrary();
}

initLibrary(openScore);
initViewer(backToLibrary);
refreshLibrary();

// 홈 화면에 설치하지 않은 iPad/iPhone 사파리에는 설치 안내를 보여준다.
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !standalone && !prefs.get('hideInstallHint', false)) {
  const hint = document.getElementById('install-hint');
  hint.hidden = false;
  document.getElementById('install-hint-close').addEventListener('click', () => {
    hint.hidden = true;
    prefs.set('hideInstallHint', true);
  });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker', err));
}
