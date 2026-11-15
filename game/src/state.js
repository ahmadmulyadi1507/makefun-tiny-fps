// Match state: rounds, money, the buy phase, the plant objective and win
// conditions. One plain object, mutated only through these helpers, so the
// HUD, the bots and the main loop always read the same truth.
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const FUSE_TIME = 40;
export const WIN_ROUNDS = 5;

export function createMatch() {
  return {
    phase: 'buy', // 'buy' | 'live' | 'roundEnd' | 'matchEnd'
    round: 1,
    wins: { vipers: 0, jackals: 0 },
    money: 800,
    timer: BUY_TIME,
    plant: { state: 'none', fuse: 0, planter: null, progress: 0, defuseProgress: 0 },
    kills: { vipers: 0, jackals: 0 },
    banner: null, // { title, sub, team }
    bannerUntil: 0,
    reason: '',
  };
}

export function startRound(match) {
  match.phase = 'buy';
  match.timer = BUY_TIME;
  match.plant = { state: 'none', fuse: 0, planter: null, progress: 0, defuseProgress: 0 };
  match.banner = null;
}

export function beginLive(match) {
  match.phase = 'live';
  match.timer = ROUND_TIME;
}

export function awardMoney(match, amount) {
  match.money = Math.min(9000, match.money + amount);
}

export function endRound(match, winner, reason) {
  match.phase = 'roundEnd';
  match.wins[winner] += 1;
  match.reason = reason;
  match.timer = 4;
  match.banner = {
    title: winner === 'vipers' ? 'ROUND WON' : 'ROUND LOST',
    sub: reason,
    team: winner,
  };
  match.bannerUntil = 4;
  if (winner === 'vipers') awardMoney(match, 325);
  else awardMoney(match, 200);
  if (match.wins[winner] >= WIN_ROUNDS) {
    match.phase = 'matchEnd';
    match.banner = {
      title: winner === 'vipers' ? 'VICTORY — YARD 7 IS YOURS' : 'DEFEAT — THE JACKALS TAKE YARD 7',
      sub: `${match.wins.vipers} — ${match.wins.jackals} after ${match.round} rounds`,
      team: winner,
    };
  }
}

export function nextRound(match) {
  match.round += 1;
  startRound(match);
}
