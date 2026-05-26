# Cardbattle

A playable dark-fantasy card battler prototype inspired by deckbuilding roguelikes. The run loop combines a freely traversable network map, turn-based card combat, rewards, events, campfires, shops, treasure, and a global threat level that grows whenever the player moves.

## Features

- React + Vite + TypeScript frontend.
- Network-style map with adjacent-node movement.
- Global threat scaling for enemy health, damage, and armor.
- Turn-based card combat with energy, block, draw/discard/exhaust piles, statuses, enemy intents, and rewards.
- Local browser save via `localStorage`.
- Small vertical slice: starter character, card pool, normal enemies, elites, events, shop, campfire, treasure, and boss.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run test
npm run build
```
