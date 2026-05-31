import type { CardDefinition, CardFilter, CardZone, CharacterDefinition, ContentPack, Effect, EffectOperation, EffectParam, EffectTarget, EnemyDefinition, GameEvent, Rarity, RelicDefinition, RelicTrigger, StatusEffect } from "./types";

const player = "player" as const;
const selectedEnemy = "selectedEnemy" as const;
const self = "self" as const;

const damage = (amount: number, target: EffectTarget = selectedEnemy): Effect => ({ target, param: "hp", op: "subtract", amount });
const block = (amount: number, target: EffectTarget = player): Effect => ({ target, param: "block", op: "add", amount });
const heal = (amount: number, target: EffectTarget = player): Effect => ({ target, param: "hp", op: amount >= 0 ? "add" : "subtract", amount: Math.abs(amount) });
const energy = (amount: number): Effect => ({ target: player, param: "energy", op: "add", amount });
const gold = (amount: number): Effect => ({ target: player, param: "gold", op: "add", amount });
const draw = (amount: number): Effect => ({ target: player, param: "cards", op: "move", amount, fromZone: "drawPile", toZone: "hand" });
const status = (statusId: StatusEffect["id"], amount: number, target: EffectTarget = selectedEnemy): Effect => ({ target, param: "statusAmount", status: statusId, op: "add", amount });

export const cards: Record<string, CardDefinition> = {
  strike: { id: "strike", name: "Strike", type: "attack", rarity: "basic", cost: 1, description: "Deal 6 damage.", upgradedDescription: "Deal 9 damage.", effects: [damage(6)], upgradedEffects: [damage(9)] },
  guard: { id: "guard", name: "Guard", type: "skill", rarity: "basic", cost: 1, description: "Gain 5 block.", upgradedDescription: "Gain 8 block.", effects: [block(5)], upgradedEffects: [block(8)] },
  quick_cut: { id: "quick_cut", name: "Quick Cut", type: "attack", rarity: "common", cost: 0, description: "Deal 3 damage. Draw 1.", upgradedDescription: "Deal 5 damage. Draw 1.", effects: [damage(3), draw(1)], upgradedEffects: [damage(5), draw(1)] },
  iron_veil: { id: "iron_veil", name: "Iron Veil", type: "skill", rarity: "common", cost: 1, description: "Gain 7 block.", upgradedDescription: "Gain 10 block.", effects: [block(7)], upgradedEffects: [block(10)] },
  ember_lash: { id: "ember_lash", name: "Ember Lash", type: "attack", rarity: "common", cost: 1, description: "Deal 5 damage twice.", upgradedDescription: "Deal 7 damage twice.", effects: [{ ...damage(5), times: 2 }], upgradedEffects: [{ ...damage(7), times: 2 }] },
  omen: { id: "omen", name: "Omen", type: "skill", rarity: "common", cost: 1, description: "Apply 2 Weak. Draw 1.", upgradedDescription: "Apply 3 Weak. Draw 1.", effects: [status("weak", 2), draw(1)], upgradedEffects: [status("weak", 3), draw(1)] },
  expose: { id: "expose", name: "Expose", type: "skill", rarity: "common", cost: 1, description: "Apply 2 Vulnerable.", upgradedDescription: "Apply 3 Vulnerable.", effects: [status("vulnerable", 2)], upgradedEffects: [status("vulnerable", 3)] },
  venom_pin: { id: "venom_pin", name: "Venom Pin", type: "attack", rarity: "common", cost: 1, description: "Deal 4 damage. Apply 3 poison.", upgradedDescription: "Deal 5 damage. Apply 5 poison.", effects: [damage(4), status("poison", 3)], upgradedEffects: [damage(5), status("poison", 5)] },
  dark_pact: { id: "dark_pact", name: "Dark Pact", type: "skill", rarity: "uncommon", cost: 0, description: "Gain 1 energy. Lose 3 HP.", upgradedDescription: "Gain 1 energy. Lose 1 HP.", effects: [energy(1), heal(-3)], upgradedEffects: [energy(1), heal(-1)] },
  bone_wall: { id: "bone_wall", name: "Bone Wall", type: "skill", rarity: "uncommon", cost: 2, description: "Gain 14 block.", upgradedDescription: "Gain 19 block.", effects: [block(14)], upgradedEffects: [block(19)] },
  harvest: { id: "harvest", name: "Harvest", type: "attack", rarity: "uncommon", cost: 2, description: "Deal 14 damage. Gain 8 gold if fatal.", upgradedDescription: "Deal 18 damage. Gain 12 gold if fatal.", effects: [damage(14)], upgradedEffects: [damage(18)] },
  pulse: { id: "pulse", name: "Pulse", type: "skill", rarity: "uncommon", cost: 1, description: "Draw 2.", upgradedDescription: "Draw 3.", effects: [draw(2)], upgradedEffects: [draw(3)] },
  war_drum: { id: "war_drum", name: "War Drum", type: "power", rarity: "uncommon", cost: 1, description: "Gain 2 strength.", upgradedDescription: "Gain 3 strength.", effects: [status("strength", 2, player)], upgradedEffects: [status("strength", 3, player)] },
  thorn_rite: { id: "thorn_rite", name: "Thorn Rite", type: "power", rarity: "uncommon", cost: 1, description: "Gain 3 thorns.", upgradedDescription: "Gain 5 thorns.", effects: [status("thorns", 3, player)], upgradedEffects: [status("thorns", 5, player)] },
  eclipse: { id: "eclipse", name: "Eclipse", type: "attack", rarity: "rare", cost: 3, description: "Deal 28 damage.", upgradedDescription: "Deal 36 damage.", effects: [damage(28)], upgradedEffects: [damage(36)] },
  blood_bloom: { id: "blood_bloom", name: "Blood Bloom", type: "skill", rarity: "rare", cost: 2, description: "Heal 8. Draw 2. Exhaust.", upgradedDescription: "Heal 12. Draw 2. Exhaust.", effects: [heal(8), draw(2)], upgradedEffects: [heal(12), draw(2)], exhaust: true },
  glass_knife: { id: "glass_knife", name: "Glass Knife", type: "attack", rarity: "rare", cost: 1, description: "Deal 18 damage. Exhaust.", upgradedDescription: "Deal 24 damage. Exhaust.", effects: [damage(18)], upgradedEffects: [damage(24)], exhaust: true },
  phantom_step: { id: "phantom_step", name: "Phantom Step", type: "skill", rarity: "rare", cost: 1, description: "Gain 9 block. Draw 2.", upgradedDescription: "Gain 12 block. Draw 2.", effects: [block(9), draw(2)], upgradedEffects: [block(12), draw(2)] },
  wound: { id: "wound", name: "Wound", type: "status", rarity: "basic", cost: 1, description: "Unplayable weight in the deck.", upgradedDescription: "Unplayable weight in the deck.", effects: [], upgradedEffects: [] },
  curse: { id: "curse", name: "Night Mark", type: "curse", rarity: "basic", cost: 1, description: "A dead card born from risky bargains.", upgradedDescription: "A dead card born from risky bargains.", effects: [], upgradedEffects: [] }
};

export const rewardCardPool = Object.values(cards).filter((card) => !["basic", "status", "curse"].includes(card.rarity));

export const enemies: EnemyDefinition[] = [
  { id: "hollow", name: "Hollow Acolyte", tier: "normal", maxHp: 34, armor: 0, moves: [{ id: "chant", intent: "debuff", label: "Weak hex", effects: [status("weak", 1, player)] }, { id: "knife", intent: "attack", label: "Knife", effects: [damage(7, player)] }] },
  { id: "mawling", name: "Mawling", tier: "normal", maxHp: 42, armor: 0, moves: [{ id: "gnash", intent: "attack", label: "Gnash", effects: [{ ...damage(6, player), times: 2 }] }, { id: "hide", intent: "defend", label: "Hide", effects: [block(9, self)] }] },
  { id: "cinder", name: "Cinder Husk", tier: "normal", maxHp: 38, armor: 2, moves: [{ id: "burn", intent: "mixed", label: "Burning shove", effects: [damage(8, player), status("vulnerable", 1, player)] }, { id: "flare", intent: "attack", label: "Flare", effects: [damage(11, player)] }] },
  { id: "widow", name: "Net Widow", tier: "normal", maxHp: 36, armor: 0, moves: [{ id: "venom", intent: "debuff", label: "Venom", effects: [status("poison", 4, player)] }, { id: "bite", intent: "attack", label: "Bite", effects: [damage(9, player)] }] },
  { id: "warden", name: "Grave Warden", tier: "elite", maxHp: 78, armor: 4, moves: [{ id: "cleave", intent: "attack", label: "Cleave", effects: [damage(14, player)] }, { id: "brace", intent: "mixed", label: "Brace", effects: [damage(8, player), block(14, self)] }, { id: "command", intent: "buff", label: "Command", effects: [status("strength", 2, self)] }] },
  { id: "mirror", name: "Black Mirror", tier: "elite", maxHp: 70, armor: 0, moves: [{ id: "fracture", intent: "attack", label: "Fracture", effects: [{ ...damage(6, player), times: 3 }] }, { id: "curse", intent: "debuff", label: "Mark", effects: [status("vulnerable", 2, player)] }] },
  { id: "oracle", name: "Ash Oracle", tier: "elite", maxHp: 64, armor: 0, moves: [{ id: "doom", intent: "debuff", label: "Doom", effects: [status("weak", 2, player), status("poison", 3, player)] }, { id: "smite", intent: "attack", label: "Smite", effects: [damage(18, player)] }] },
  { id: "knight", name: "Dusk Knight", tier: "normal", maxHp: 50, armor: 3, moves: [{ id: "lunge", intent: "attack", label: "Lunge", effects: [damage(12, player)] }, { id: "guard", intent: "defend", label: "Guard", effects: [block(12, self)] }] },
  { id: "lamprey", name: "Gloom Lamprey", tier: "normal", maxHp: 30, armor: 0, moves: [{ id: "drain", intent: "mixed", label: "Drain", effects: [damage(5, player), status("weak", 1, player)] }, { id: "swarm", intent: "attack", label: "Swarm", effects: [{ ...damage(4, player), times: 3 }] }] },
  { id: "heart", name: "The Rootless Heart", tier: "boss", maxHp: 180, armor: 6, moves: [{ id: "pulse", intent: "attack", label: "Ruin pulse", effects: [{ ...damage(12, player), times: 2 }] }, { id: "veil", intent: "mixed", label: "Veil", effects: [block(18, self), status("strength", 2, self)] }, { id: "sentence", intent: "debuff", label: "Sentence", effects: [status("vulnerable", 2, player), status("weak", 2, player)] }] },
  { id: "crown", name: "The Cinder Crown", tier: "boss", maxHp: 168, armor: 4, moves: [{ id: "coronate", intent: "buff", label: "Coronate", effects: [status("strength", 3, self)] }, { id: "scepter", intent: "attack", label: "Scepter fall", effects: [damage(18, player)] }, { id: "ashen_tax", intent: "mixed", label: "Ashen tax", effects: [damage(10, player), block(16, self), status("weak", 1, player)] }] },
  { id: "loom", name: "The Pale Loom", tier: "boss", maxHp: 156, armor: 8, moves: [{ id: "thread", intent: "debuff", label: "Thread the vein", effects: [status("poison", 6, player)] }, { id: "shuttle", intent: "attack", label: "Bone shuttle", effects: [{ ...damage(7, player), times: 3 }] }, { id: "weave", intent: "mixed", label: "Weave shut", effects: [block(22, self), status("vulnerable", 1, player)] }] }
];

export const events: GameEvent[] = [
  { id: "altar", title: "Altar of Quiet Teeth", body: "Coins glimmer in the mouth of a stone saint. It asks for warmth.", choices: [{ id: "take", label: "Take the coins", description: "Gain 45 gold. Lose 8 HP.", effect: "gainGoldLoseHp" }, { id: "pray", label: "Offer a card", description: "Upgrade a random card.", effect: "upgradeRandom" }, { id: "leave", label: "Leave", description: "Move on.", effect: "skip" }] },
  { id: "pool", title: "Moonless Pool", body: "Black water reflects a healthier version of you, smiling too widely.", choices: [{ id: "drink", label: "Drink", description: "Heal 18. Add a curse.", effect: "healGainCurse" }, { id: "study", label: "Study the reflection", description: "Upgrade a random card.", effect: "upgradeRandom" }, { id: "leave", label: "Leave", description: "Move on.", effect: "skip" }] },
  { id: "caravan", title: "Lost Caravan", body: "The wagons are abandoned, but the locks have fresh scratches.", choices: [{ id: "loot", label: "Loot fast", description: "Gain 45 gold. Lose 8 HP.", effect: "gainGoldLoseHp" }, { id: "repair", label: "Repair your gear", description: "Upgrade a random card.", effect: "upgradeRandom" }, { id: "leave", label: "Leave", description: "Move on.", effect: "skip" }] }
];

export const relics: Record<string, RelicDefinition> = {
  cracked_core: { id: "cracked_core", name: "Cracked Core", rarity: "basic", description: "At the start of combat, gain 1 Strength.", trigger: "combatStart", effects: [status("strength", 1, player)] },
  pocket_lantern: { id: "pocket_lantern", name: "Pocket Lantern", rarity: "common", description: "At the start of combat, gain 1 energy.", trigger: "combatStart", effects: [energy(1)] },
  ash_charm: { id: "ash_charm", name: "Ash Charm", rarity: "common", description: "At the start of each turn, gain 2 block.", trigger: "turnStart", effects: [block(2)] },
  red_ledger: { id: "red_ledger", name: "Red Ledger", rarity: "common", description: "After combat, gain 8 gold.", trigger: "combatWon", effects: [gold(8)] },
  glass_feather: { id: "glass_feather", name: "Glass Feather", rarity: "uncommon", description: "After you play a card, gain 1 block.", trigger: "cardPlayed", effects: [block(1)] },
  marrow_cup: { id: "marrow_cup", name: "Marrow Cup", rarity: "uncommon", description: "After combat, heal 3 HP.", trigger: "combatWon", effects: [heal(3)] },
  iron_thread: { id: "iron_thread", name: "Iron Thread", rarity: "uncommon", description: "When damaged, reduce the damage by 1.", trigger: "beforeDamageTaken", effects: [block(1)] },
  quiet_bell: { id: "quiet_bell", name: "Quiet Bell", rarity: "rare", description: "At the start of each turn, draw 1 card.", trigger: "turnStart", effects: [draw(1)] },
  thorn_signet: { id: "thorn_signet", name: "Thorn Signet", rarity: "rare", description: "At the start of a run, gain 2 Thorns.", trigger: "runStart", effects: [status("thorns", 2, player)] },
  war_mask: { id: "war_mask", name: "War Mask", rarity: "rare", description: "At the start of combat, gain 2 Strength.", trigger: "combatStart", effects: [status("strength", 2, player)] }
};

export const characters: Record<string, CharacterDefinition> = {
  wanderer: {
    id: "wanderer",
    name: "Wanderer",
    maxHp: 72,
    maxEnergy: 3,
    gold: 60,
    starterDeck: ["strike", "strike", "strike", "strike", "strike", "guard", "guard", "guard", "guard", "omen"],
    starterRelics: ["cracked_core"],
    passives: []
  }
};

export const defaultCharacterId = "wanderer";
export const defaultContentPack: ContentPack = { cards, enemies, relics, characters, defaultCharacterId };

export const CONTENT_DRAFT_KEY = "netspire-content-draft";

export const cardTypes = ["attack", "skill", "power", "status", "curse"] as const;
export const rarities = ["basic", "common", "uncommon", "rare"] as const;
export const effectTargets = ["self", "selectedEnemy", "player", "sourceOwner", "allEnemies", "randomEnemy", "allCombatants"] as const;
export const effectParams = ["hp", "maxHp", "block", "energy", "maxEnergy", "gold", "statusAmount", "upgraded", "cost", "cards", "turn", "threat", "movesTaken"] as const;
export const effectOps = ["add", "subtract", "set", "multiply", "move", "create", "remove", "clear"] as const;
export const intents = ["attack", "defend", "buff", "debuff", "mixed"] as const;
export const tiers = ["normal", "elite", "boss"] as const;
export const relicTriggers = ["runStart", "combatStart", "turnStart", "turnEnd", "cardPlayed", "beforeDamageTaken", "playerDamaged", "enemyKilled", "combatWon", "cardDrawn", "statusApplied"] as const;
export const statuses = ["weak", "vulnerable", "frail", "poison", "burn", "bleed", "strength", "dexterity", "thorns", "regen", "platedArmor", "artifact", "intangible"] as const;
export const cardZones = ["drawPile", "hand", "discardPile", "exhaustPile", "deck"] as const;
export const cardFilters = ["any", ...cardTypes, ...rarities, "upgraded", "notUpgraded"] as const;
const idPattern = /^[a-z0-9_-]+$/;

export function loadContentPack(): ContentPack {
  if (typeof localStorage === "undefined") return defaultContentPack;
  const raw = localStorage.getItem(CONTENT_DRAFT_KEY);
  if (!raw) return defaultContentPack;
  try {
    const parsed = JSON.parse(raw) as Partial<ContentPack>;
    const normalized = normalizeContentPack(parsed);
    return validateContentPack(normalized).valid ? normalized : defaultContentPack;
  } catch {
    return defaultContentPack;
  }
}

export function saveContentDraft(pack: ContentPack) {
  localStorage.setItem(CONTENT_DRAFT_KEY, JSON.stringify(normalizeContentPack(pack)));
}

export function clearContentDraft() {
  localStorage.removeItem(CONTENT_DRAFT_KEY);
}

export function normalizeContentPack(pack: Partial<ContentPack>): ContentPack {
  const normalizedCards = Object.fromEntries(Object.entries(pack.cards ?? cards).map(([key, card]) => [key, { ...card, effects: normalizeEffects(card.effects, "card"), upgradedEffects: normalizeEffects(card.upgradedEffects, "card") }])) as Record<string, CardDefinition>;
  const normalizedEnemies = (pack.enemies ?? enemies).map((enemy) => ({
    ...enemy,
    moves: enemy.moves.map((move) => ({
      ...move,
      effects: normalizeMoveEffects(move)
    }))
  }));
  const normalizedRelics = Object.fromEntries(Object.entries(pack.relics ?? relics).map(([key, relic]) => [key, { ...relic, trigger: migrateRelicTrigger(relic.trigger), effects: normalizeEffects(relic.effects, "relic") }])) as Record<string, RelicDefinition>;
  const normalizedCharacters = pack.characters ?? characters;
  const normalizedDefaultCharacterId = pack.defaultCharacterId && normalizedCharacters[pack.defaultCharacterId] ? pack.defaultCharacterId : defaultCharacterId;
  return { cards: normalizedCards, enemies: normalizedEnemies, relics: normalizedRelics, characters: normalizedCharacters, defaultCharacterId: normalizedDefaultCharacterId };
}

export function validateContentPack(pack: ContentPack): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!pack || typeof pack !== "object") return { valid: false, errors: ["Content pack must be an object."] };
  if (!pack.cards || Object.keys(pack.cards).length === 0) errors.push("At least one card is required.");
  if (!Array.isArray(pack.enemies) || pack.enemies.length === 0) errors.push("At least one enemy is required.");
  if (!pack.relics || typeof pack.relics !== "object") errors.push("Relics must be an object.");
  if (!pack.characters || typeof pack.characters !== "object") errors.push("Characters must be an object.");
  if (!pack.defaultCharacterId || !pack.characters?.[pack.defaultCharacterId]) errors.push("Default character must reference a valid character.");

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
      validateEffects(move.effects ?? [], `Enemy ${enemy.id} move ${move.id} effects`, errors);
    });
  });

  Object.entries(pack.relics ?? {}).forEach(([key, relic]) => {
    validateId(relic?.id, `Relic ${key}`, errors);
    if (key !== relic?.id) errors.push(`Relic ${key} key must match id.`);
    if (!relic.name) errors.push(`Relic ${key} needs a name.`);
    if (!rarities.includes(relic.rarity)) errors.push(`Relic ${key} has invalid rarity.`);
    if (!relicTriggers.includes(relic.trigger)) errors.push(`Relic ${key} has invalid trigger.`);
    if (!Array.isArray(relic.effects) || relic.effects.length === 0) errors.push(`Relic ${key} needs at least one effect.`);
    validateEffects(relic.effects ?? [], `Relic ${key} effects`, errors);
  });

  Object.entries(pack.characters ?? {}).forEach(([key, character]) => {
    validateId(character?.id, `Character ${key}`, errors);
    if (key !== character?.id) errors.push(`Character ${key} key must match id.`);
    if (!character.name) errors.push(`Character ${key} needs a name.`);
    validateInteger(character.maxHp, `Character ${key} max HP`, errors, 1);
    validateInteger(character.maxEnergy, `Character ${key} max energy`, errors, 1);
    validateInteger(character.gold, `Character ${key} gold`, errors, 0);
    if (!Array.isArray(character.starterDeck) || character.starterDeck.length === 0) errors.push(`Character ${key} needs a starter deck.`);
    character.starterDeck?.forEach((cardId) => {
      if (!pack.cards[cardId]) errors.push(`Character ${key} starter deck references missing card ${cardId}.`);
    });
    character.starterRelics?.forEach((relicId) => {
      if (!pack.relics[relicId]) errors.push(`Character ${key} starter relics reference missing relic ${relicId}.`);
    });
    character.passives?.forEach((passive, index) => {
      if (!relicTriggers.includes(passive.trigger)) errors.push(`Character ${key} passive ${index + 1} has invalid trigger.`);
      validateEffects(passive.effects, `Character ${key} passive ${index + 1} effects`, errors);
    });
  });

  return { valid: errors.length === 0, errors };
}

function validateId(id: string | undefined, label: string, errors: string[]) {
  if (!id) errors.push(`${label} needs an id.`);
  else if (!idPattern.test(id)) errors.push(`${label} id must use lowercase letters, numbers, hyphens, or underscores.`);
}

function validateInteger(value: number | undefined, label: string, errors: string[], min?: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) errors.push(`${label} must be an integer.`);
  else if (min !== undefined && value < min) errors.push(`${label} must be at least ${min}.`);
}

function validateEffects(effects: unknown, label: string, errors: string[]) {
  if (!Array.isArray(effects)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  effects.forEach((effect, index) => {
    const item = effect as Partial<Effect> & { type?: string };
    const effectLabel = `${label} ${index + 1}`;
    if (item.type) errors.push(`${effectLabel} uses legacy type.`);
    if (!effectTargets.includes(item.target as EffectTarget)) errors.push(`${effectLabel} has invalid target.`);
    if (!effectParams.includes(item.param as EffectParam)) errors.push(`${effectLabel} has invalid param.`);
    if (!effectOps.includes(item.op as EffectOperation)) errors.push(`${effectLabel} has invalid op.`);
    if (item.amount !== undefined) validateInteger(item.amount, `${effectLabel} amount`, errors);
    if (item.times !== undefined) validateInteger(item.times, `${effectLabel} times`, errors, 1);
    if (item.param === "statusAmount" && !statuses.includes(item.status as StatusEffect["id"])) errors.push(`${effectLabel} needs a valid status.`);
    if (item.param === "cards" && item.op === "move") {
      if (!cardZones.includes(item.fromZone as CardZone)) errors.push(`${effectLabel} needs a valid fromZone.`);
      if (!cardZones.includes(item.toZone as CardZone)) errors.push(`${effectLabel} needs a valid toZone.`);
    }
    if (item.param === "cards" && ["move", "create", "remove"].includes(item.op ?? "") && item.amount === undefined) errors.push(`${effectLabel} needs an amount.`);
    if (["hp", "maxHp", "block", "energy", "maxEnergy", "gold", "statusAmount", "turn", "threat", "movesTaken", "cost"].includes(item.param ?? "") && item.op !== "clear" && item.amount === undefined) errors.push(`${effectLabel} needs an amount.`);
    if (item.cardFilter && !cardFilters.includes(item.cardFilter as CardFilter)) errors.push(`${effectLabel} has invalid card filter.`);
  });
}

type LegacyEffect = Partial<Effect> & { type?: string; amount?: number; status?: StatusEffect["id"] };
type EffectContext = "card" | "enemy" | "relic";

function normalizeEffects(effects: unknown, context: EffectContext): Effect[] {
  if (!Array.isArray(effects)) return [];
  return effects.flatMap((effect) => normalizeEffect(effect as LegacyEffect, context));
}

function normalizeMoveEffects(move: { damage?: number; hits?: number; block?: number; effects?: unknown }): Effect[] {
  return [
    ...(move.damage ? [{ ...damage(move.damage, player), times: move.hits ?? 1 }] : []),
    ...(move.block ? [block(move.block, self)] : []),
    ...normalizeEffects(move.effects ?? [], "enemy")
  ];
}

function normalizeEffect(effect: LegacyEffect, context: EffectContext): Effect[] {
  if (effect.target && effect.param && effect.op) return [effect as Effect];
  const amount = effect.amount ?? 0;
  if (effect.type === "damage") return [damage(amount, context === "enemy" ? player : selectedEnemy)];
  if (effect.type === "block" || effect.type === "gainBlock") return [block(amount, context === "enemy" ? self : player)];
  if (effect.type === "draw") return [draw(amount)];
  if (effect.type === "gainEnergy") return [energy(amount)];
  if (effect.type === "heal") return [heal(amount)];
  if (effect.type === "gainGold") return [gold(amount)];
  if (effect.type === "applyWeak") return [status("weak", amount, context === "enemy" ? player : selectedEnemy)];
  if (effect.type === "applyVulnerable") return [status("vulnerable", amount, context === "enemy" ? player : selectedEnemy)];
  if (effect.type === "applyPoison") return [status("poison", amount, context === "enemy" ? player : selectedEnemy)];
  if (effect.type === "strength" || effect.type === "gainStrength") return [status("strength", amount, context === "enemy" ? self : player)];
  if (effect.type === "thorns") return [status("thorns", amount, player)];
  if (effect.type === "applyStatus" && effect.status) return [status(effect.status, amount, player)];
  if (effect.type === "reduceDamage") return [block(amount, player)];
  return [];
}

function migrateRelicTrigger(trigger: RelicTrigger): RelicTrigger {
  return trigger === "playerDamaged" ? "beforeDamageTaken" : trigger;
}
