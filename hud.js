// HUD: health, armour, ammo, money, timer, score, killfeed, banners, the
// buy menu, the plant/defuse progress bar and a top-down minimap drawn on a
// 2D canvas. All DOM writes go through here so the sim never touches the DOM.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';
import { SITE_A } from './world.js';

function el(id) { return document.getElementById(id); }

export function createHud(callbacks) {
  const refs = {
    hpBar: el('hp-fill'), hpText: el('hp-value'), armorText: el('armor-value'),
    ammoMag: el('ammo-mag'), ammoReserve: el('ammo-reserve'), weaponName: el('weapon-name'),
    ammoBox: el('ammo'),
    money: el('money-value'), timer: el('timer-value'), round: el('round-value'),
    scoreV: el('score-vipers'), scoreJ: el('score-jackals'),
    crosshair: el('crosshair'), hitmarker: el('hitmarker'),
    killfeed: el('killfeed'), banner: el('banner'), bannerTitle: el('banner-title'),
    bannerSub: el('banner-sub'), overlay: el('overlay'), overlayTitle: el('overlay-title'),
    overlayCopy: el('overlay-copy'), playBtn: el('play'),
    buy: el('buy-menu'), buyList: el('buy-list'), buyMoney: el('buy-money'),
    plantBar: el('plant-bar'), plantFill: el('plant-fill'), plantLabel: el('plant-label'),
    damage: el('damage-flash'), minimap: el('minimap'), nades: el('nades-value'),
    objective: el('objective-text'),
  };
  const mapCtx = refs.minimap.getContext('2d');
  let hitTimer = null;

  refs.playBtn.addEventListener('click', () => callbacks.onPlay());
  refs.buyList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-buy]');
    if (btn) callbacks.onBuy(btn.dataset.buy);
  });

  function setHealth(hp, armor) {
    refs.hpBar.style.width = `${Math.max(0, hp)}%`;
    refs.hpBar.style.background = hp <= 30 ? '#d64541' : hp <= 60 ? '#f0a830' : '#7ec850';
    refs.hpText.textContent = String(Math.max(0, Math.ceil(hp)));
    refs.armorText.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
  }

  function setAmmo(mag, reserve, weaponId, nades) {
    refs.ammoMag.textContent = String(mag);
    refs.ammoReserve.textContent = `/ ${reserve}`;
    refs.weaponName.textContent = WEAPONS[weaponId].name;
    refs.nades.textContent = `◉ ${nades}`;
    refs.ammoBox.classList.toggle('empty', mag === 0);
  }

  function setMoney(money) {
    refs.money.textContent = `$${money.toLocaleString('en-US')}`;
    refs.buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
  }

  function setTimer(seconds, phase) {
    const s = Math.max(0, Math.ceil(seconds));
    refs.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    refs.timer.classList.toggle('urgent', s <= 10 && phase === 'live');
  }

  function setScore(v, j, round) {
    refs.scoreV.textContent = String(v);
    refs.scoreJ.textContent = String(j);
    refs.round.textContent = `ROUND ${round}`;
  }

  function hitMarker(kill) {
    refs.hitmarker.classList.add('on');
    refs.hitmarker.classList.toggle('kill', kill);
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => refs.hitmarker.classList.remove('on', 'kill'), 110);
  }

  function setCrosshairGap(px) {
    refs.crosshair.style.setProperty('--gap', `${px}px`);
  }

  function killfeed(text, team) {
    const div = document.createElement('div');
    div.className = `feed-item ${team}`;
    div.textContent = text;
    refs.killfeed.prepend(div);
    while (refs.killfeed.children.length > 5) refs.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 6000);
  }

  function showBanner(title, sub, team) {
    refs.bannerTitle.textContent = title;
    refs.bannerSub.textContent = sub || '';
    refs.banner.className = `show ${team === 'vipers' ? 'good' : 'bad'}`;
  }

  function hideBanner() { refs.banner.className = ''; }

  function showOverlay(kind, scoreText) {
    refs.overlay.hidden = false;
    if (kind === 'start') {
      refs.overlayTitle.textContent = 'DUSTLINE — Yard 7';
      refs.overlayCopy.textContent = 'Plant the charge at Site A or eliminate the Jackals. First to 5 rounds takes the yard. Click to play.';
      refs.playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      refs.overlayTitle.textContent = 'Paused';
      refs.overlayCopy.textContent = 'Click to resume the round.';
      refs.playBtn.textContent = 'Resume';
    } else if (kind === 'end') {
      refs.overlayTitle.textContent = 'Match over';
      refs.overlayCopy.textContent = scoreText || '';
      refs.playBtn.textContent = 'Play again';
    }
  }

  function hideOverlay() { refs.overlay.hidden = true; }

  function showBuy(money, owned) {
    const items = [
      { id: 'rifle', name: 'VK-7 Carbine', desc: 'Auto rifle · 30 rounds · high damage', price: WEAPONS.rifle.price },
      { id: 'smg', name: 'Hornet SMG', desc: 'Fast fire · 32 rounds · close range', price: WEAPONS.smg.price },
      { id: 'sniper', name: 'Longbow DMR', desc: '95 damage · scope · 5 rounds', price: WEAPONS.sniper.price },
      { id: 'grenade', name: 'Frag Grenade', desc: '95 damage in a 5.5 m blast', price: GRENADE.price },
      { id: 'armor', name: 'Kevlar Vest', desc: '+50 armour for the round', price: ARMOR.price },
    ];
    refs.buyList.innerHTML = '';
    for (const item of items) {
      const has = owned.weapons.has(item.id) || (item.id === 'grenade' && owned.nades > 0) || (item.id === 'armor' && owned.armor > 0);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buy-item';
      btn.dataset.buy = item.id;
      btn.disabled = money < item.price || has;
      btn.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${has ? 'OWNED' : '$' + item.price.toLocaleString('en-US')}</span>`;
      refs.buyList.appendChild(btn);
    }
    refs.buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
    refs.buy.hidden = false;
  }

  function hideBuy() { refs.buy.hidden = true; }

  function setPlant(label, progress) {
    if (!label) { refs.plantBar.hidden = true; return; }
    refs.plantBar.hidden = false;
    refs.plantLabel.textContent = label;
    refs.plantFill.style.width = `${Math.round(progress * 100)}%`;
  }

  function damageFlash() {
    refs.damage.classList.remove('flash');
    void refs.damage.offsetWidth;
    refs.damage.classList.add('flash');
  }

  function setObjective(text) { refs.objective.textContent = text; }

  // Minimap: yard outline, site, crates (grey), player (blue), allies (light
  // blue), enemies seen recently (orange dots fade — here shown when alive and
  // within the player's spotting: simplified to all alive enemies).
  function drawMinimap(player, bots, plantState) {
    const c = mapCtx;
    const W = 150;
    const H = 102;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(20,22,26,0.72)';
    c.fillRect(0, 0, W, H);
    const sx = (x) => ((x + 22) / 44) * W;
    const sz = (z) => ((z + 15) / 30) * H;
    // Site A.
    c.fillStyle = plantState === 'planted' ? 'rgba(214,69,65,0.85)' : 'rgba(240,168,48,0.55)';
    c.fillRect(sx(SITE_A.x0), sz(SITE_A.z0), sx(SITE_A.x1) - sx(SITE_A.x0), sz(SITE_A.z1) - sz(SITE_A.z0));
    // Crates / containers (approximate positions from the map).
    c.fillStyle = 'rgba(152,160,168,0.5)';
    const blocks = [[-3, -1, 6, 2.4], [3, 4, 6, 2.4], [10, -4, 2.4, 6], [-14, 5], [-10, 2], [6, 8], [12, 4], [16, -3], [-2, -5], [6, -6]];
    for (const b of blocks) {
      const w = b.length === 4 ? b[2] : 1.4;
      const d = b.length === 4 ? b[3] : 1.4;
      c.fillRect(sx(b[0] - w / 2), sz(b[1] - d / 2), (w / 44) * W, (d / 30) * H);
    }
    // Bots.
    for (const bot of bots) {
      if (!bot.alive) continue;
      c.fillStyle = bot.team === 'vipers' ? '#4fc3f7' : '#ff7043';
      c.beginPath();
      c.arc(sx(bot.pos.x), sz(bot.pos.z), 3, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow.
    if (player.alive) {
      c.fillStyle = '#e9e6df';
      c.beginPath();
      const px = sx(player.position.x);
      const pz = sz(player.position.z);
      const a = player.yaw;
      c.moveTo(px - Math.sin(a) * 6, pz - Math.cos(a) * 6);
      c.lineTo(px - Math.sin(a + 2.6) * 5, pz - Math.cos(a + 2.6) * 5);
      c.lineTo(px - Math.sin(a - 2.6) * 5, pz - Math.cos(a - 2.6) * 5);
      c.closePath();
      c.fill();
    }
  }

  return {
    setHealth, setAmmo, setMoney, setTimer, setScore, hitMarker, setCrosshairGap,
    killfeed, showBanner, hideBanner, showOverlay, hideOverlay, showBuy, hideBuy,
    setPlant, damageFlash, setObjective, drawMinimap,
  };
}
