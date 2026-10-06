import { createJourney } from './assets/journey-3d.js';
const root = document.documentElement;
root.classList.add('js');
const journey = document.querySelector('#cosmic-journey');
const header = document.querySelector('#site-header');
const menu = document.querySelector('#main-nav');
const menuToggle = document.querySelector('.menu-toggle');
function closeMenu(returnFocus = false) {
  menu.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  if (returnFocus) menuToggle.focus();
}
menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('open')) closeMenu(true); });
document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
function updateHeader() { header.classList.toggle('on-light', journey.getBoundingClientRect().bottom < 82); }
addEventListener('scroll', updateHeader, { passive: true });
addEventListener('resize', () => { if (innerWidth > 768) closeMenu(); updateHeader(); });
updateHeader();
const reveals = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in-view'); reveals.unobserve(entry.target); }
}, { threshold: .1 });
document.querySelectorAll('.reveal').forEach(element => reveals.observe(element));

const play = document.querySelector('#film-play');
const seek = document.querySelector('#film-seek');
const status = document.querySelector('#film-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
let film;
function filmChanged(state) {
  play.textContent = state.playing ? 'Pause' : state.seconds >= state.duration ? 'Play again' : 'Play';
  play.setAttribute('aria-label', state.playing ? 'Pause the 3D journey' : 'Play the 3D journey');
  seek.value = String(state.seconds);
  seek.setAttribute('aria-valuetext', `${state.landmark}, ${Math.floor(state.seconds)} seconds`);
  document.querySelector('#film-time').textContent = `${clock(state.seconds)} / ${clock(state.duration)}`;
  document.querySelector('#film-landmark').textContent = state.landmark;
  const chapters = { galaxy: '01 / THE UNIVERSE', earth: '02 / OUR LIVING PLANET', korea: '03 / KOREAN ORIGINAL SOUL', landscape: '04 / ACROSS KOREA', farms: '05 / BACK TO THE SOURCE' };
  document.querySelector('#film-chapter').textContent = chapters[state.phase];
  const opacity = Math.max(0, Math.min(1, (9 - state.seconds) / 3));
  const intro = document.querySelector('.copy-galaxy');
  intro.style.opacity = String(opacity);
  intro.inert = opacity < .1;
  document.querySelector('.film-caption').style.opacity = String(Math.max(0, Math.min(1, (state.seconds - 9) / 1.2)));
  document.querySelectorAll('[data-time]').forEach(button => button.classList.toggle('active', Math.abs(Number(button.dataset.time) - state.seconds) < 3));
}
createJourney(document.querySelector('#journey-canvas'), filmChanged).then(player => {
  film = player;
  globalThis.__KOS_JOURNEY = player;
  root.classList.add('film-ready');
  document.querySelector('.film-controls').hidden = false;
  status.hidden = true;
  if (!reducedMotion.matches) player.play();
  else { status.textContent = 'Motion is paused. Select Play to start the 3D journey.'; status.hidden = false; }
  const visibility = new IntersectionObserver(entries => player.setVisible(entries[0].isIntersecting && !document.hidden), { threshold: .05 });
  visibility.observe(journey);
  document.addEventListener('visibilitychange', () => player.setVisible(!document.hidden && journey.getBoundingClientRect().bottom > 0 && journey.getBoundingClientRect().top < innerHeight));
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) player.pause(); });
}).catch(error => {
  status.textContent = 'The 3D journey needs a browser with WebGL support. You can explore the ingredients below.';
  console.error('3D journey could not start:', error);
});
play.addEventListener('click', () => { status.hidden = true; film?.getState().playing ? film.pause() : film?.play(); });
document.querySelector('#film-replay').addEventListener('click', () => { status.hidden = true; film?.seek(0); film?.play(); });
seek.addEventListener('input', () => film?.seek(seek.value));
document.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => { film?.seek(Number(button.dataset.time)); }));

// An RFQ is prepared locally. No invented endpoint, submission, or stored contact data.
const form = document.querySelector('#inquiry-form');
let inquiryEmail = null;
Promise.resolve(globalThis.__KOS_SITE_CONFIG || fetch('site-config.json').then(response => response.ok ? response.json() : {})).then(config => {
  if (typeof config.inquiryEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.inquiryEmail)) {
    inquiryEmail = config.inquiryEmail;
    document.querySelector('#inquiry-submit').innerHTML = 'Open email draft <span aria-hidden="true">↗</span>';
    document.querySelector('#form-explanation').textContent = 'Creates a draft in your email app. Review it and send it there; this page does not send or store your information.';
  }
}).catch(() => {});
document.querySelectorAll('[data-ingredient]').forEach(link => link.addEventListener('click', () => {
  form.elements.ingredient.value = link.dataset.ingredient;
}));
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const labels = { name: 'Name', company: 'Company', email: 'Business email', destination: 'Destination country', ingredient: 'Ingredient & format', quantity: 'Estimated quantity', application: 'Application & requirements' };
  const brief = ["KO'S — SOURCING BRIEF", '', ...Object.entries(labels).map(([key, label]) => `${label}: ${String(data.get(key) || '').trim() || 'Not specified'}`), '', 'Availability, lot origin, documentation and commercial terms require a separately confirmed offer.'].join('\n');
  const status = document.querySelector('#form-status');
  if (inquiryEmail) {
    const subject = `KO'S sourcing inquiry — ${String(data.get('ingredient')).slice(0, 100)}`;
    const mailto = `mailto:${inquiryEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(brief)}`;
    const link = document.createElement('a'); link.href = mailto; link.click();
    status.textContent = 'Your email draft is prepared. Review and send it in your email app.';
  } else {
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'kos-sourcing-brief.txt';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Your sourcing brief is ready to download. No information has been sent.';
  }
});
document.querySelector('#current-year').textContent = new Date().getFullYear();
