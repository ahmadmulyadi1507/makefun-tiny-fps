# DUSTLINE — Yard 7

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ahmadmulyadi1507/makefun-tiny-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ahmadmulyadi1507/makefun-tiny-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS for make.fun's [threejs-fps-02](https://make.fun/bounty/threejs-fps-02) bounty ($1,000 in USDC), built on three.js 0.187.0
(vendored under `game/vendor/three/`). Single-player against bots, fully offline,
no build step: serve `game/` with any static file server and open `index.html`.

## The game

Two teams fight over a dusk industrial yard: the Vipers (you + 2 bot teammates)
attack Site A; the Jackals (4 bots) defend it. First to 5 rounds takes the yard.

- **Objective**: plant the charge at Site A (hold `E` in the amber zone) or
  eliminate the other team. A planted charge detonates after 40 s unless a
  Jackal defuses it (5 s channel).
- **Money & buy menu**: earn money for kills, plants and round wins; press `B`
  during the 15 s buy phase to buy the VK-7 Carbine, Hornet SMG, Longbow DMR,
  frag grenades and Kevlar.
- **Gunplay**: hitscan weapons with headshot multipliers, recoil and spread
  that punish firing on the move, aim-down-sights, crouching, sprinting and
  jumping, AABB collision with the map.
- **Bots**: waypoint navigation across three lanes, line-of-sight spotting,
  burst fire, strafing, hearing gunfire, holding positions, planting and
  defusing.
- **HUD**: health, armour, ammo, money, round timer and score, killfeed,
  hitmarkers, a live minimap and a plant progress bar.

## Controls

WASD move · Mouse aim · Click fire · Right mouse aim · R reload · 1–4 weapons ·
G grenade · E plant/defuse · B buy menu · Ctrl crouch · Shift sprint · Space jump

## Run it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Screenshots are staged deterministically with `?shot=start|play|buy|end&seed=N`.

## License

MIT — see LICENSE.
