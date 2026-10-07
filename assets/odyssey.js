// The visitor is the explorer. Discoveries belong to this visit only; no
// personal information, account or analytics are needed to follow the route.
export const FARM_STOPS = [
  { id: 'tea', time: 63.4, region: 'Boseong · Jeolla', label: 'The leaf', ingredient: 'Green tea & matcha',
    title: 'Before the powder,<br>a leaf.',
    story: 'Fly above olive-green rows, then come close to the living leaf where green tea and matcha begin.',
    insight: 'A leaf comes first. Cultivation, picking and careful processing shape the tea it becomes.',
    action: 'Discover the leaf' },
  { id: 'yuzu', time: 72.2, region: 'Goheung · South coast', label: 'The fruit', ingredient: 'Yuzu / Yuja',
    title: 'Before the aroma,<br>a fruit.',
    story: 'Follow the southern coast to an orchard. Find golden yuja still on the branch, among fresh green leaves.',
    insight: 'Character begins on the branch. Fragrant peel and tart juice offer different expressions of the same fruit.',
    action: 'Discover the fruit' },
  { id: 'ginseng', time: 82.4, region: 'Geumsan · Chungcheong', label: 'The root', ingredient: 'Ginseng',
    title: 'Before the extract,<br>a root.',
    story: 'Come down to the soil. Meet ginseng as its branching root rises from the earth, carrying the beginning of its story.',
    insight: 'Begin with the living root. Steaming and drying later transform harvested ginseng into red ginseng.',
    action: 'Discover the root' },
];

export function createOdyssey({ reducedMotion }) {
  const panel = document.querySelector('#odyssey-panel');
  const atlas = document.querySelector('#odyssey-atlas');
  const mapToggle = document.querySelector('#odyssey-map-toggle');
  const primary = document.querySelector('#odyssey-primary');
  const next = document.querySelector('#odyssey-next');
  const visited = new Set();
  const handled = new Set();
  const choices = [];
  let player;
  let mode = 'intro';
  let activeStop = null;
  let arrivalStarted = false;
  let previousSeconds = 0;
  let transition = 0;
  let lastPlayerState;
  const arrivalTime = 24;
  const stopById = id => FARM_STOPS.find(stop => stop.id === id);
  const firstMissing = () => FARM_STOPS.find(stop => !visited.has(stop.id));
  const announce = message => { document.querySelector('#odyssey-announcement').textContent = message; };

  function closeAtlas(returnFocus = false) {
    atlas.hidden = true; mapToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) mapToggle.focus();
  }
  function render() {
    const count = visited.size;
    const farm = stopById(activeStop);
    const showPanel = ['arrival', 'stop', 'complete', 'overview'].includes(mode);
    panel.hidden = !showPanel;
    document.querySelector('#journey-stage').dataset.odysseyMode = mode;
    document.querySelector('#odyssey-passport').hidden = !arrivalStarted;
    mapToggle.hidden = !arrivalStarted;
    document.querySelector('#odyssey-count').textContent = `${count} / 3`;
    document.querySelector('#odyssey-map-count').textContent = `${count} of 3 discovered`;
    for (const stamp of document.querySelectorAll('[data-stamp]')) {
      const found = visited.has(stamp.dataset.stamp);
      stamp.classList.toggle('found', found);
      stamp.setAttribute('aria-label', `${stopById(stamp.dataset.stamp).label}: ${found ? 'discovered' : 'yet to discover'}`);
    }
    for (const button of document.querySelectorAll('[data-destination]')) {
      const id = button.dataset.destination;
      button.classList.toggle('visited', visited.has(id));
      button.classList.toggle('selected', activeStop === id);
      if (activeStop === id) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
    }
    if (!showPanel) return;
    const kicker = document.querySelector('#odyssey-kicker');
    const title = document.querySelector('#odyssey-title');
    const story = document.querySelector('#odyssey-description');
    const insight = document.querySelector('#odyssey-insight');
    const actions = document.querySelector('#odyssey-finish-actions');
    insight.hidden = true; actions.hidden = true; story.hidden = false; primary.hidden = false; next.hidden = true;
    if (mode === 'arrival') {
      kicker.textContent = 'YOUR KOREAN ODYSSEY';
      title.innerHTML = 'The journey<br>becomes <em>yours.</em>';
      story.textContent = 'Follow mountains, coastlines and cultivated fields. Discover Korea through a leaf, a fruit and a living root.';
      primary.textContent = 'Begin my journey';
    } else if (mode === 'stop' && farm) {
      kicker.textContent = `${farm.region} / ${farm.label}`;
      title.innerHTML = farm.title;
      story.textContent = farm.story;
      primary.textContent = farm.action;
      if (visited.has(farm.id)) {
        primary.hidden = true; insight.hidden = false; story.hidden = true;
        insight.textContent = farm.insight;
        next.hidden = false;
        const missing = firstMissing();
        next.textContent = missing ? `Continue to ${missing.id === 'tea' ? 'the tea fields' : missing.id === 'yuzu' ? 'the orchard' : 'the roots'}` : "Discover KO'S";
      }
    } else if (mode === 'complete') {
      kicker.textContent = 'LEAF / FRUIT / ROOT';
      title.innerHTML = 'Three discoveries.<br><em>One beginning.</em>';
      story.textContent = "KO'S begins with the ingredient. Its origin, its character, and the care that carries it from the growing landscape to what you create next.";
      primary.hidden = true; actions.hidden = false;
    } else if (mode === 'overview') {
      kicker.textContent = 'FOLLOW THE LAND. FIND THE ESSENTIAL.';
      title.innerHTML = 'There is more<br>to <em>discover.</em>';
      story.textContent = 'Choose a growing landscape on your atlas and come closer to the leaf, the fruit or the root.';
      primary.textContent = 'Continue exploring';
    }
  }
  function reachArrival() {
    arrivalStarted = true; mode = 'arrival'; activeStop = null;
    previousSeconds = arrivalTime;
    player.setExploration(false); player.pause(); player.seek(arrivalTime);
    render(); announce('You have arrived in Korea. Begin your journey or choose a farm on the atlas.');
  }
  function reachStop(stop) {
    handled.add(stop.id); activeStop = stop.id; mode = 'stop'; arrivalStarted = true;
    player.pause(); player.setExploration(!reducedMotion.matches);
    player.setDiscovery(visited.has(stop.id) ? stop.id : null);
    render(); announce(`${stop.region}. ${stop.ingredient}. ${visited.has(stop.id) ? 'Your discovery is recorded.' : stop.action + '.'}`);
  }
  function update(state) {
    lastPlayerState = state;
    const previous = previousSeconds; previousSeconds = state.seconds;
    if (!player || mode === 'flying') return;
    if (!arrivalStarted && ['intro', 'voyaging'].includes(mode) && state.seconds >= arrivalTime && !state.travelling) { reachArrival(); return; }
    if (mode === 'voyaging' && !state.travelling) {
      const stop = FARM_STOPS.find(item => previous < item.time && state.seconds >= item.time && !handled.has(item.id));
      if (stop) {
        // Change state before pause/seek emit callbacks, so a stop fires once.
        mode = 'stop'; activeStop = stop.id; handled.add(stop.id);
        player.pause(); player.seek(stop.time); reachStop(stop); return;
      }
      if (state.seconds >= state.duration) { mode = visited.size === 3 ? 'complete' : 'overview'; player.setExploration(!reducedMotion.matches); render(); }
    }
  }
  function begin() {
    if (!player) return;
    closeAtlas(); arrivalStarted = true; mode = 'voyaging'; activeStop = null;
    player.setExploration(false); render(); player.play();
  }
  async function visit(id) {
    if (!player) return;
    const stop = stopById(id); if (!stop) return;
    const serial = ++transition;
    choices.push(id); arrivalStarted = true; mode = 'flying'; activeStop = null;
    player.setExploration(false); player.setDiscovery(null); closeAtlas(); render();
    announce(`Travelling to ${stop.region}. ${stop.ingredient}.`);
    const distance = Math.abs(player.getState().seconds - stop.time);
    const reached = await player.flyTo(stop.time, reducedMotion.matches ? 0 : Math.min(12, Math.max(2.2, distance * .30)));
    if (!reached || serial !== transition) return;
    reachStop(stop);
  }
  async function discover() {
    const stop = stopById(activeStop); if (!stop || !player) return;
    if (Math.abs(player.getState().seconds - stop.time) > .65) { await visit(stop.id); if (activeStop !== stop.id) return; }
    visited.add(stop.id);
    player.setDiscovery(stop.id); render();
    announce(`${stop.label} discovered. ${visited.size} of 3 discoveries recorded. ${stop.insight}`);
  }
  function finish() {
    if (visited.size !== 3) return;
    mode = 'complete'; activeStop = null; player.pause(); render(); closeAtlas();
    announce("Three discoveries. One beginning. KO'S begins with the ingredient.");
  }
  function continueJourney() {
    if (mode === 'arrival') return begin();
    if (visited.size === 3) return finish();
    const missing = firstMissing(); if (missing) visit(missing.id);
  }
  function restart() {
    ++transition; visited.clear(); handled.clear(); choices.length = 0;
    arrivalStarted = false; activeStop = null; mode = 'resetting'; previousSeconds = 0;
    closeAtlas(); player.setExploration(false); player.pause(); player.setDiscovery(null); player.seek(0);
    mode = 'intro'; render(); announce('Your Korean Odyssey starts again.');
    if (!reducedMotion.matches) player.play();
  }
  async function skipToArrival() {
    if (!player) return;
    const serial = ++transition; mode = 'flying'; render();
    const reached = await player.flyTo(arrivalTime, reducedMotion.matches ? 0 : 7);
    if (reached && serial === transition) reachArrival();
  }
  function scrub(value) {
    if (!player) return;
    ++transition; player.setExploration(false); mode = 'browsing'; player.pause(); player.seek(value);
    const seconds = player.getState().seconds;
    arrivalStarted = seconds >= arrivalTime || arrivalStarted;
    const stop = [...FARM_STOPS].reverse().find(item => seconds >= item.time - 7);
    if (stop) reachStop(stop);
    else if (seconds >= 22 && seconds < 29) { mode = 'arrival'; activeStop = null; render(); }
    else { mode = 'browsing'; activeStop = null; render(); }
  }
  function togglePlayback() {
    if (!player) return;
    if (player.getState().playing || player.getState().travelling) {
      ++transition; mode = 'browsing'; player.setExploration(false); player.pause(); render();
    } else if (mode === 'arrival') begin();
    else { mode = 'voyaging'; activeStop = null; player.setExploration(false); render(); player.play(); }
  }
  primary.addEventListener('click', () => mode === 'arrival' ? begin() : mode === 'overview' ? continueJourney() : discover());
  next.addEventListener('click', continueJourney);
  document.querySelector('#odyssey-restart').addEventListener('click', restart);
  document.querySelector('#odyssey-intro-start').addEventListener('click', event => { if (player) { event.preventDefault(); skipToArrival(); } });
  for (const button of document.querySelectorAll('[data-destination]')) button.addEventListener('click', event => {
    if (!player) return;
    event.preventDefault();
    document.querySelector('#cosmic-journey').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    visit(button.dataset.destination);
  });
  mapToggle.addEventListener('click', () => {
    atlas.hidden = !atlas.hidden; mapToggle.setAttribute('aria-expanded', String(!atlas.hidden));
    if (!atlas.hidden) document.querySelector('#odyssey-map-close').focus();
  });
  document.querySelector('#odyssey-map-close').addEventListener('click', () => closeAtlas(true));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !atlas.hidden) closeAtlas(true); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { ++transition; player?.setExploration(false); player?.pause(); if (mode === 'flying') { mode = 'overview'; render(); } } });
  render();
  return { attach(value) { player = value; },
    setUnavailable() { ++transition; player = null; mode = 'intro'; activeStop = null; arrivalStarted = false; closeAtlas(); render(); },
    update, begin, visit, discover, finish, restart, scrub, togglePlayback, skipToArrival,
    getState() { return { mode, arrivalStarted, activeStop, visited: [...visited], choices: [...choices], completed: mode === 'complete', playerSeconds: lastPlayerState?.seconds ?? 0 }; } };
}
