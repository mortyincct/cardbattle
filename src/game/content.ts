import { upgradeContentPack, validateGameEffect } from "./effects";
import type { CardDefinition, ContentPack, EnemyDefinition, GameEvent, RelicDefinition } from "./types";

const baseCards: Record<string, Omit<CardDefinition, "effects" | "upgradedEffects"> & { effects: unknown[]; upgradedEffects: unknown[] }> = {
  strike: { id: "strike", name: "Strike", type: "attack", rarity: "basic", cost: 1, description: "Deal 6 damage.", upgradedDescription: "Deal 9 damage.", effects: [{ type: "damage", amount: 6 }], upgradedEffects: [{ type: "damage", amount: 9 }] },
  guard: { id: "guard", name: "Guard", type: "skill", rarity: "basic", cost: 1, description: "Gain 5 block.", upgradedDescription: "Gain 8 block.", effects: [{ type: "block", amount: 5 }], upgradedEffects: [{ type: "block", amount: 8 }] },
  quick_cut: { id: "quick_cut", name: "Quick Cut", type: "attack", rarity: "common", cost: 0, description: "Deal 3 damage. Draw 1.", upgradedDescription: "Deal 5 damage. Draw 1.", effects: [{ type: "damage", amount: 3 }, { type: "draw", amount: 1 }], upgradedEffects: [{ type: "damage", amount: 5 }, { type: "draw", amount: 1 }] },
  iron_veil: { id: "iron_veil", name: "Iron Veil", type: "skill", rarity: "common", cost: 1, description: "Gain 7 block.", upgradedDescription: "Gain 10 block.", effects: [{ type: "block", amount: 7 }], upgradedEffects: [{ type: "block", amount: 10 }] },
  ember_lash: { id: "ember_lash", name: "Ember Lash", type: "attack", rarity: "common", cost: 1, description: "Deal 5 damage twice.", upgradedDescription: "Deal 7 damage twice.", effects: [{ type: "damage", amount: 5 }, { type: "damage", amount: 5 }], upgradedEffects: [{ type: "damage", amount: 7 }, { type: "damage", amount: 7 }] },
  omen: { id: "omen", name: "Omen", type: "skill", rarity: "common", cost: 1, description: "Apply 2 Weak. Draw 1.", upgradedDescription: "Apply 3 Weak. Draw 1.", effects: [{ type: "applyWeak", amount: 2 }, { type: "draw", amount: 1 }], upgradedEffects: [{ type: "applyWeak", amount: 3 }, { type: "draw", amount: 1 }] },
  expose: { id: "expose", name: "Expose", type: "skill", rarity: "common", cost: 1, description: "Apply 2 Vulnerable.", upgradedDescription: "Apply 3 Vulnerable.", effects: [{ type: "applyVulnerable", amount: 2 }], upgradedEffects: [{ type: "applyVulnerable", amount: 3 }] },
  venom_pin: { id: "venom_pin", name: "Venom Pin", type: "attack", rarity: "common", cost: 1, description: "Deal 4 damage. Apply 3 poison.", upgradedDescription: "Deal 5 damage. Apply 5 poison.", effects: [{ type: "damage", amount: 4 }, { type: "applyPoison", amount: 3 }], upgradedEffects: [{ type: "damage", amount: 5 }, { type: "applyPoison", amount: 5 }] },
  dark_pact: { id: "dark_pact", name: "Dark Pact", type: "skill", rarity: "uncommon", cost: 0, description: "Gain 1 energy. Lose 3 HP.", upgradedDescription: "Gain 1 energy. Lose 1 HP.", effects: [{ type: "gainEnergy", amount: 1 }, { type: "heal", amount: -3 }], upgradedEffects: [{ type: "gainEnergy", amount: 1 }, { type: "heal", amount: -1 }] },
  bone_wall: { id: "bone_wall", name: "Bone Wall", type: "skill", rarity: "uncommon", cost: 2, description: "Gain 14 block.", upgradedDescription: "Gain 19 block.", effects: [{ type: "block", amount: 14 }], upgradedEffects: [{ type: "block", amount: 19 }] },
  harvest: { id: "harvest", name: "Harvest", type: "attack", rarity: "uncommon", cost: 2, description: "Deal 14 damage. Gain 8 gold if fatal.", upgradedDescription: "Deal 18 damage. Gain 12 gold if fatal.", effects: [{ type: "damage", amount: 14 }], upgradedEffects: [{ type: "damage", amount: 18 }] },
  pulse: { id: "pulse", name: "Pulse", type: "skill", rarity: "uncommon", cost: 1, description: "Draw 2.", upgradedDescription: "Draw 3.", effects: [{ type: "draw", amount: 2 }], upgradedEffects: [{ type: "draw", amount: 3 }] },
  war_drum: { id: "war_drum", name: "War Drum", type: "power", rarity: "uncommon", cost: 1, description: "Gain 2 strength.", upgradedDescription: "Gain 3 strength.", effects: [{ type: "strength", amount: 2 }], upgradedEffects: [{ type: "strength", amount: 3 }] },
  thorn_rite: { id: "thorn_rite", name: "Thorn Rite", type: "power", rarity: "uncommon", cost: 1, description: "Gain 3 thorns.", upgradedDescription: "Gain 5 thorns.", effects: [{ type: "thorns", amount: 3 }], upgradedEffects: [{ type: "thorns", amount: 5 }] },
  eclipse: { id: "eclipse", name: "Eclipse", type: "attack", rarity: "rare", cost: 3, description: "Deal 28 damage.", upgradedDescription: "Deal 36 damage.", effects: [{ type: "damage", amount: 28 }], upgradedEffects: [{ type: "damage", amount: 36 }] },
  blood_bloom: { id: "blood_bloom", name: "Blood Bloom", type: "skill", rarity: "rare", cost: 2, description: "Heal 8. Draw 2. Exhaust.", upgradedDescription: "Heal 12. Draw 2. Exhaust.", effects: [{ type: "heal", amount: 8 }, { type: "draw", amount: 2 }], upgradedEffects: [{ type: "heal", amount: 12 }, { type: "draw", amount: 2 }], exhaust: true },
  glass_knife: { id: "glass_knife", name: "Glass Knife", type: "attack", rarity: "rare", cost: 1, description: "Deal 18 damage. Exhaust.", upgradedDescription: "Deal 24 damage. Exhaust.", effects: [{ type: "damage", amount: 18 }], upgradedEffects: [{ type: "damage", amount: 24 }], exhaust: true },
  phantom_step: { id: "phantom_step", name: "Phantom Step", type: "skill", rarity: "rare", cost: 1, description: "Gain 9 block. Draw 2.", upgradedDescription: "Gain 12 block. Draw 2.", effects: [{ type: "block", amount: 9 }, { type: "draw", amount: 2 }], upgradedEffects: [{ type: "block", amount: 12 }, { type: "draw", amount: 2 }] },
  wound: { id: "wound", name: "Wound", type: "status", rarity: "basic", cost: 1, description: "Unplayable weight in the deck.", upgradedDescription: "Unplayable weight in the deck.", effects: [], upgradedEffects: [] },
  curse: { id: "curse", name: "Night Mark", type: "curse", rarity: "basic", cost: 1, description: "A dead card born from risky bargains.", upgradedDescription: "A dead card born from risky bargains.", effects: [], upgradedEffects: [] }
};

const baseEnemies: Array<Omit<EnemyDefinition, "moves"> & { moves: Array<Omit<EnemyDefinition["moves"][number], "effects"> & { effects?: unknown[] }> }> = [
  { id: "hollow", name: "Hollow Acolyte", tier: "normal", maxHp: 34, armor: 0, moves: [{ id: "chant", intent: "debuff", label: "Weak hex", effects: [{ type: "applyWeak", amount: 1 }] }, { id: "knife", intent: "attack", label: "Knife", damage: 7 }] },
  { id: "mawling", name: "Mawling", tier: "normal", maxHp: 42, armor: 0, moves: [{ id: "gnash", intent: "attack", label: "Gnash", damage: 6, hits: 2 }, { id: "hide", intent: "defend", label: "Hide", block: 9 }] },
  { id: "cinder", name: "Cinder Husk", tier: "normal", maxHp: 38, armor: 2, moves: [{ id: "burn", intent: "mixed", label: "Burning shove", damage: 8, effects: [{ type: "applyVulnerable", amount: 1 }] }, { id: "flare", intent: "attack", label: "Flare", damage: 11 }] },
  { id: "widow", name: "Net Widow", tier: "normal", maxHp: 36, armor: 0, moves: [{ id: "venom", intent: "debuff", label: "Venom", effects: [{ type: "applyPoison", amount: 4 }] }, { id: "bite", intent: "attack", label: "Bite", damage: 9 }] },
  { id: "warden", name: "Grave Warden", tier: "elite", maxHp: 78, armor: 4, moves: [{ id: "cleave", intent: "attack", label: "Cleave", damage: 14 }, { id: "brace", intent: "mixed", label: "Brace", damage: 8, block: 14 }, { id: "command", intent: "buff", label: "Command", effects: [{ type: "strength", amount: 2 }] }] },
  { id: "mirror", name: "Black Mirror", tier: "elite", maxHp: 70, armor: 0, moves: [{ id: "fracture", intent: "attack", label: "Fracture", damage: 6, hits: 3 }, { id: "curse", intent: "debuff", label: "Mark", effects: [{ type: "applyVulnerable", amount: 2 }] }] },
  { id: "oracle", name: "Ash Oracle", tier: "elite", maxHp: 64, armor: 0, moves: [{ id: "doom", intent: "debuff", label: "Doom", effects: [{ type: "applyWeak", amount: 2 }, { type: "applyPoison", amount: 3 }] }, { id: "smite", intent: "attack", label: "Smite", damage: 18 }] },
  { id: "knight", name: "Dusk Knight", tier: "normal", maxHp: 50, armor: 3, moves: [{ id: "lunge", intent: "attack", label: "Lunge", damage: 12 }, { id: "guard", intent: "defend", label: "Guard", block: 12 }] },
  { id: "lamprey", name: "Gloom Lamprey", tier: "normal", maxHp: 30, armor: 0, moves: [{ id: "drain", intent: "mixed", label: "Drain", damage: 5, effects: [{ type: "applyWeak", amount: 1 }] }, { id: "swarm", intent: "attack", label: "Swarm", damage: 4, hits: 3 }] },
  { id: "heart", name: "The Rootless Heart", tier: "boss", maxHp: 180, armor: 6, moves: [{ id: "pulse", intent: "attack", label: "Ruin pulse", damage: 12, hits: 2 }, { id: "veil", intent: "mixed", label: "Veil", block: 18, effects: [{ type: "strength", amount: 2 }] }, { id: "sentence", intent: "debuff", label: "Sentence", effects: [{ type: "applyVulnerable", amount: 2 }, { type: "applyWeak", amount: 2 }] }] }
];

export const events: GameEvent[] = [
  { id: "altar", title: "Altar of Quiet Teeth", body: "Coins glimmer in the mouth of a stone saint. It asks for warmth.", choices: [{ id: "take", label: "Take the coins", description: "Gain 45 gold. Lose 8 HP.", effect: "gainGoldLoseHp" }, { id: "pray", label: "Offer a card", description: "Upgrade a random card.", effect: "upgradeRandom" }, { id: "leave", label: "Leave", description: "Move on.", effect: "skip" }] },
  { id: "pool", title: "Moonless Pool", body: "Black water reflects a healthier version of you, smiling too widely.", choices: [{ id: "drink", label: "Drink", description: "Heal 18. Add a curse.", effect: "healGainCurse" }, { id: "study", label: "Study the reflection", description: "Upgrade a random card.", effect: "upgradeRandom" }, { id: "leave", label: "Leave", description: "Move on.", effect: "skip" }] },
  { id: "caravan", title: "Lost Caravan", body: "The wagons are abandoned, but the locks have fresh scratches.", choices: [{ id: "loot", label: "Loot fast", description: "Gain 45 gold. Lose 8 HP.", effect: "gainGoldLoseHp" }, { id: "repair", label: "Repair your gear", description: "Upgrade a random card.", effect: "upgradeRandom" }, { id: "leave", label: "Leave", description: "Move on.", effect: "skip" }] }
];

const baseRelics: Record<string, Omit<RelicDefinition, "effects"> & { effects: unknown[] }> = {
  cracked_core: { id: "cracked_core", name: "Cracked Core", rarity: "basic", description: "At the start of combat, gain 1 Strength.", trigger: "combatStart", effects: [{ type: "gainStrength", amount: 1 }] },
  pocket_lantern: { id: "pocket_lantern", name: "Pocket Lantern", rarity: "common", description: "At the start of combat, gain 1 energy.", trigger: "combatStart", effects: [{ type: "gainEnergy", amount: 1 }] },
  ash_charm: { id: "ash_charm", name: "Ash Charm", rarity: "common", description: "At the start of each turn, gain 2 block.", trigger: "turnStart", effects: [{ type: "gainBlock", amount: 2 }] },
  red_ledger: { id: "red_ledger", name: "Red Ledger", rarity: "common", description: "After combat, gain 8 gold.", trigger: "combatWon", effects: [{ type: "gainGold", amount: 8 }] },
  glass_feather: { id: "glass_feather", name: "Glass Feather", rarity: "uncommon", description: "After you play a card, gain 1 block.", trigger: "cardPlayed", effects: [{ type: "gainBlock", amount: 1 }] },
  marrow_cup: { id: "marrow_cup", name: "Marrow Cup", rarity: "uncommon", description: "After combat, heal 3 HP.", trigger: "combatWon", effects: [{ type: "heal", amount: 3 }] },
  iron_thread: { id: "iron_thread", name: "Iron Thread", rarity: "uncommon", description: "When damaged, reduce the damage by 1.", trigger: "playerDamaged", effects: [{ type: "reduceDamage", amount: 1 }] },
  quiet_bell: { id: "quiet_bell", name: "Quiet Bell", rarity: "rare", description: "At the start of each turn, draw 1 card.", trigger: "turnStart", effects: [{ type: "draw", amount: 1 }] },
  thorn_signet: { id: "thorn_signet", name: "Thorn Signet", rarity: "rare", description: "At the start of a run, gain 2 Thorns.", trigger: "runStart", effects: [{ type: "applyStatus", amount: 2, status: "thorns" }] },
  war_mask: { id: "war_mask", name: "War Mask", rarity: "rare", description: "At the start of combat, gain 2 Strength.", trigger: "combatStart", effects: [{ type: "gainStrength", amount: 2 }] }
};

export const defaultContentPack: ContentPack = upgradeContentPack({ cards: baseCards as Record<string, CardDefinition>, enemies: baseEnemies as EnemyDefinition[], relics: baseRelics as Record<string, RelicDefinition> });
export const cards: Record<string, CardDefinition> = defaultContentPack.cards;
export const enemies: EnemyDefinition[] = defaultContentPack.enemies;
export const relics: Record<string, RelicDefinition> = defaultContentPack.relics;
export const rewardCardPool = Object.values(cards).filter((card) => !["basic", "status", "curse"].includes(card.rarity));

export const CONTENT_DRAFT_KEY = "netspire-content-draft";

export function loadContentPack(): ContentPack {
  if (typeof localStorage === "undefined") return defaultContentPack;
  const raw = localStorage.getItem(CONTENT_DRAFT_KEY);
  if (!raw) return defaultContentPack;
  try {
    const parsed = upgradeContentPack(JSON.parse(raw) as ContentPack);
    return validateContentPack(parsed).valid ? parsed : defaultContentPack;
  } catch {
    return defaultContentPack;
  }
}

export function saveContentDraft(pack: ContentPack) {
  localStorage.setItem(CONTENT_DRAFT_KEY, JSON.stringify(upgradeContentPack(pack)));
}

export function clearContentDraft() {
  localStorage.removeItem(CONTENT_DRAFT_KEY);
}

const idPattern = /^[a-z0-9_-]+$/;
const cardTypes = ["attack", "skill", "power", "status", "curse"];
const rarities = ["basic", "common", "uncommon", "rare"];
const intents = ["attack", "defend", "buff", "debuff", "mixed"];
const tiers = ["normal", "elite", "boss"];
const relicTriggers = ["runStart", "combatStart", "turnStart", "cardPlayed", "playerDamaged", "combatWon"];

export function validateContentPack(pack: ContentPack): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!pack || typeof pack !== "object") return { valid: false, errors: ["Content pack must be an object."] };
  if (!pack.cards || Object.keys(pack.cards).length === 0) errors.push("At least one card is required.");
  if (!Array.isArray(pack.enemies) || pack.enemies.length === 0) errors.push("At least one enemy is required.");
  if (!pack.relics || typeof pack.relics !== "object") errors.push("Relics must be an object.");

  Object.entries(pack.cards ?? {}).forEach(([key, card]) => {
    validateId(card?.id, `Card ${key}`, errors);
    if (key !== card?.id) errors.push(`Card ${key} key must match id.`);
    if (!card.name) errors.push(`Card ${key} needs a name.`);
    if (!cardTypes.includes(card.type)) errors.push(`Card ${key} has invalid type.`);
    if (!rarities.includes(card.rarity)) errors.push(`Card ${key} has invalid rarity.`);
    validateInteger(card.cost, `Card ${key} cost`, errors, 0);
    validateEffects(card.effects, `Card ${key} effects`, errors);
    validateEffects(card.upgradedEffects, `Card ${key} upgraded effects`, errors);
  });

  const enemyIds = new Set<string>();
  (pack.enemies ?? []).forEach((enemy) => {
    validateId(enemy?.id, "Enemy", errors);
    if (enemyIds.has(enemy.id)) errors.push(`Enemy ${enemy.id} id is duplicated.`);
    enemyIds.add(enemy.id);
    if (!enemy.name) errors.push(`Enemy ${enemy.id} needs a name.`);
    if (!tiers.includes(enemy.tier)) errors.push(`Enemy ${enemy.id} has invalid tier.`);
    validateInteger(enemy.maxHp, `Enemy ${enemy.id} max HP`, errors, 1);
    validateInteger(enemy.armor, `Enemy ${enemy.id} armor`, errors, 0);
    if (!Array.isArray(enemy.moves) || enemy.moves.length === 0) errors.push(`Enemy ${enemy.id} needs at least one move.`);
    enemy.moves?.forEach((move) => {
      validateId(move.id, `Enemy ${enemy.id} move`, errors);
      if (!intents.includes(move.intent)) errors.push(`Enemy ${enemy.id} move ${move.id} has invalid intent.`);
      if (!move.label) errors.push(`Enemy ${enemy.id} move ${move.id} needs a label.`);
      if (move.damage !== undefined) validateInteger(move.damage, `Enemy ${enemy.id} move ${move.id} damage`, errors, 0);
      if (move.hits !== undefined) validateInteger(move.hits, `Enemy ${enemy.id} move ${move.id} hits`, errors, 1);
      if (move.block !== undefined) validateInteger(move.block, `Enemy ${enemy.id} move ${move.id} block`, errors, 0);
      if (move.effects) validateEffects(move.effects, `Enemy ${enemy.id} move ${move.id} effects`, errors);
    });
  });

  Object.entries(pack.relics ?? {}).forEach(([key, relic]) => {
    validateId(relic?.id, `Relic ${key}`, errors);
    if (key !== relic?.id) errors.push(`Relic ${key} key must match id.`);
    if (!relic.name) errors.push(`Relic ${key} needs a name.`);
    if (!rarities.includes(relic.rarity)) errors.push(`Relic ${key} has invalid rarity.`);
    if (!relicTriggers.includes(relic.trigger)) errors.push(`Relic ${key} has invalid trigger.`);
    if (!Array.isArray(relic.effects) || relic.effects.length === 0) errors.push(`Relic ${key} needs at least one effect.`);
    relic.effects?.forEach((effect, index) => errors.push(...validateGameEffect(effect, `Relic ${key} effect ${index + 1}`)));
  });

  return { valid: errors.length === 0, errors };
}

function validateId(id: string | undefined, label: string, errors: string[]) {
  if (!id) errors.push(`${label} needs an id.`);
  else if (!idPattern.test(id)) errors.push(`${label} id must use lowercase letters, numbers, hyphens, or underscores.`);
}

function validateInteger(value: number, label: string, errors: string[], min?: number) {
  if (!Number.isInteger(value)) errors.push(`${label} must be an integer.`);
  else if (min !== undefined && value < min) errors.push(`${label} must be at least ${min}.`);
}

function validateEffects(effects: unknown, label: string, errors: string[]) {
  if (!Array.isArray(effects)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  effects.forEach((effect, index) => {
    errors.push(...validateGameEffect(effect, `${label} ${index + 1}`));
  });
}
