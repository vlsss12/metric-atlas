const mascotStage = document.querySelector('.mascot-stage');
const mascotNodes = [...document.querySelectorAll('[data-mascot-stat]')];
const mascotStat = document.getElementById('mascotStat');
const mascotStatLabel = document.getElementById('mascotStatLabel');
const mascotStatValue = document.getElementById('mascotStatValue');
const mascotStatFreshness = document.getElementById('mascotStatFreshness');
const mascotOrder = ['pools', 'tvl', 'volume'];
const mascotLabels = { pools: 'LISTED POOLS', tvl: 'REPORTED TVL', volume: '24H VOLUME' };
let mascotData = null;
let mascotKey = 'pools';
let mascotIndex = -1;
let mascotManualUntil = 0;
let mascotDataError = false;
let mascotTapTimer;
let mascotFinishTimer;

function mascotMoney(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + value.toFixed(0);
}
function updateMascotStat() {
  mascotStatLabel.textContent = mascotLabels[mascotKey];
  mascotStatValue.textContent = !mascotData ? 'Loading…' : mascotKey === 'pools' ? new Intl.NumberFormat('en-US').format(mascotData.pools) : mascotMoney(mascotData[mascotKey]);
  mascotStatFreshness.textContent = mascotDataError ? 'LIVE DATA UNAVAILABLE · RETRYING' : mascotData?.updatedAt ? 'LIVE · UPDATED ' + new Date(mascotData.updatedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'CONNECTING TO LIVE DATA';
}
function activateMascotNode(key, manual = false) {
  mascotKey = key;
  mascotIndex = mascotOrder.indexOf(key);
  if (manual) mascotManualUntil = Date.now() + 18000;
  clearTimeout(mascotTapTimer);
  clearTimeout(mascotFinishTimer);
  mascotStage.classList.remove('is-tapping');
  mascotStat.classList.remove('is-visible');
  mascotStage.dataset.active = key;
  mascotNodes.forEach(node => {
    const selected = node.dataset.mascotStat === key;
    node.classList.remove('is-active');
    node.setAttribute('aria-pressed', String(selected));
  });
  void mascotStage.offsetWidth;
  mascotStage.classList.add('is-tapping');
  updateMascotStat();
  const tapDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
  mascotTapTimer = setTimeout(() => {
    mascotNodes.find(node => node.dataset.mascotStat === key)?.classList.add('is-active');
    mascotStat.classList.add('is-visible');
  }, tapDelay);
  mascotFinishTimer = setTimeout(() => mascotStage.classList.remove('is-tapping'), tapDelay + 550);
}
mascotNodes.forEach(node => node.addEventListener('click', () => activateMascotNode(node.dataset.mascotStat, true)));
window.addEventListener('metric:stats', event => {
  mascotData = event.detail;
  mascotDataError = false;
  updateMascotStat();
});
window.addEventListener('metric:stats-error', () => {
  mascotDataError = true;
  updateMascotStat();
});
setTimeout(() => activateMascotNode('pools'), 1200);
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setInterval(() => {
    if (document.hidden || Date.now() < mascotManualUntil || !document.getElementById('guidePanel').hidden) return;
    activateMascotNode(mascotOrder[(mascotIndex + 1) % mascotOrder.length]);
  }, 6500);
}
