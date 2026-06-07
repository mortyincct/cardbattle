import type { CardDefinition, CardFilter, CardZone, CharacterDefinition, ContentPack, Effect, EffectOperation, EffectParam, EffectTarget, EnemyDefinition, GameEvent, Rarity, RelicDefinition, RelicTrigger, StatusEffect } from "./types";

const player = "player" as const;
const selectedEnemy = "selectedEnemy" as const;
const self = "self" as const;

const physicalDamage = (amount: number, target: EffectTarget = selectedEnemy): Effect => ({ target, param: "physicalDamage", op: "subtract", amount });
const magicDamage = (amount: number, target: EffectTarget = selectedEnemy): Effect => ({ target, param: "magicDamage", op: "subtract", amount });
const physicalArmor = (amount: number, target: EffectTarget = player): Effect => ({ target, param: "physicalArmor", op: "add", amount });
const magicArmor = (amount: number, target: EffectTarget = player): Effect => ({ target, param: "magicArmor", op: "add", amount });
const heal = (amount: number, target: EffectTarget = player): Effect => ({ target, param: "hp", op: amount >= 0 ? "add" : "subtract", amount: Math.abs(amount) });
const energy = (amount: number): Effect => ({ target: player, param: "energy", op: "add", amount });
const gold = (amount: number): Effect => ({ target: player, param: "gold", op: "add", amount });
const draw = (amount: number): Effect => ({ target: player, param: "cards", op: "move", amount, fromZone: "drawPile", toZone: "hand" });
const status = (statusId: StatusEffect["id"], amount: number, target: EffectTarget = selectedEnemy): Effect => ({ target, param: "statusAmount", status: statusId, op: "add", amount });
const chooseDiscard = (amount: number): Effect => ({ target: player, param: "cards", op: "move", amount, fromZone: "hand", toZone: "discardPile", selection: "manual" });
const chooseExhaust = (amount: number): Effect => ({ target: player, param: "cards", op: "move", amount, fromZone: "hand", toZone: "exhaustPile", selection: "manual" });

export const cards: Record<string, CardDefinition> = {
  strike: { id: "strike", name: "Strike", type: "attack", rarity: "basic", cost: 1, description: "Deal 6 physical damage.", upgradedDescription: "Deal 9 physical damage.", effects: [physicalDamage(6)], upgradedEffects: [physicalDamage(9)] },
  guard: { id: "guard", name: "Guard", type: "skill", rarity: "basic", cost: 1, description: "Gain 5 physical armor.", upgradedDescription: "Gain 8 physical armor.", effects: [physicalArmor(5)], upgradedEffects: [physicalArmor(8)] },
  spark: { id: "spark", name: "Spark", type: "attack", rarity: "basic", cost: 1, description: "Deal 5 magic damage.", upgradedDescription: "Deal 8 magic damage.", effects: [magicDamage(5)], upgradedEffects: [magicDamage(8)] },
  ward: { id: "ward", name: "Ward", type: "skill", rarity: "basic", cost: 1, description: "Gain 4 magic armor.", upgradedDescription: "Gain 7 magic armor.", effects: [magicArmor(4)], upgradedEffects: [magicArmor(7)] },
  heavy_blow: { id: "heavy_blow", name: "Heavy Blow", type: "attack", rarity: "common", cost: 2, description: "Deal 16 physical damage.", upgradedDescription: "Deal 22 physical damage.", effects: [physicalDamage(16)], upgradedEffects: [physicalDamage(22)] },
  quick_cut: { id: "quick_cut", name: "Quick Cut", type: "attack", rarity: "common", cost: 0, description: "Deal 3 physical damage. Draw 1.", upgradedDescription: "Deal 5 physical damage. Draw 1.", effects: [physicalDamage(3), draw(1)], upgradedEffects: [physicalDamage(5), draw(1)] },
  bone_wall: { id: "bone_wall", name: "Bone Wall", type: "skill", rarity: "uncommon", cost: 2, description: "Gain 14 physical armor.", upgradedDescription: "Gain 19 physical armor.", effects: [physicalArmor(14)], upgradedEffects: [physicalArmor(19)] },
  war_drum: { id: "war_drum", name: "War Drum", type: "power", rarity: "uncommon", cost: 1, description: "Gain 2 Strength.", upgradedDescription: "Gain 3 Strength.", effects: [status("strength", 2, player)], upgradedEffects: [status("strength", 3, player)] },
  riposte: { id: "riposte", name: "Riposte", type: "skill", rarity: "common", cost: 1, description: "Gain 6 physical armor. Gain 2 Thorns.", upgradedDescription: "Gain 9 physical armor. Gain 2 Thorns.", effects: [physicalArmor(6), status("thorns", 2, player)], upgradedEffects: [physicalArmor(9), status("thorns", 2, player)] },
  arcane_bolt: { id: "arcane_bolt", name: "Arcane Bolt", type: "attack", rarity: "common", cost: 1, description: "Deal 7 magic damage.", upgradedDescription: "Deal 10 magic damage.", effects: [magicDamage(7)], upgradedEffects: [magicDamage(10)] },
  mana_veil: { id: "mana_veil", name: "Mana Veil", type: "skill", rarity: "common", cost: 1, description: "Gain 8 magic armor.", upgradedDescription: "Gain 12 magic armor.", effects: [magicArmor(8)], upgradedEffects: [magicArmor(12)] },
  starfall: { id: "starfall", name: "Starfall", type: "attack", rarity: "uncommon", cost: 2, description: "Deal 8 magic damage to all enemies.", upgradedDescription: "Deal 11 magic damage to all enemies.", effects: [magicDamage(8, "allEnemies")], upgradedEffects: [magicDamage(11, "allEnemies")] },
  focus_rite: { id: "focus_rite", name: "Focus Rite", type: "power", rarity: "uncommon", cost: 1, description: "Gain 2 Magic.", upgradedDescription: "Gain 3 Magic.", effects: [status("magic", 2, player)], upgradedEffects: [status("magic", 3, player)] },
  mirror_shell: { id: "mirror_shell", name: "Mirror Shell", type: "skill", rarity: "common", cost: 1, description: "Gain 6 magic armor. Draw 1.", upgradedDescription: "Gain 9 magic armor. Draw 1.", effects: [magicArmor(6), draw(1)], upgradedEffects: [magicArmor(9), draw(1)] },
  ember_lash: { id: "ember_lash", name: "Ember Lash", type: "attack", rarity: "common", cost: 1, description: "Deal 5 physical damage twice.", upgradedDescription: "Deal 7 physical damage twice.", effects: [{ ...physicalDamage(5), times: 2 }], upgradedEffects: [{ ...physicalDamage(7), times: 2 }] },
  eclipse: { id: "eclipse", name: "Eclipse", type: "attack", rarity: "rare", cost: 3, description: "Deal 18 physical and 18 magic damage.", upgradedDescription: "Deal 24 physical and 24 magic damage.", effects: [physicalDamage(18), magicDamage(18)], upgradedEffects: [physicalDamage(24), magicDamage(24)] },
  omen: { id: "omen", name: "Omen", type: "skill", rarity: "common", cost: 1, description: "Apply 2 Weak. Draw 1.", upgradedDescription: "Apply 3 Weak. Draw 1.", effects: [status("weak", 2), draw(1)], upgradedEffects: [status("weak", 3), draw(1)] },
  expose: { id: "expose", name: "Expose", type: "skill", rarity: "common", cost: 1, description: "Apply 2 Vulnerable.", upgradedDescription: "Apply 3 Vulnerable.", effects: [status("vulnerable", 2)], upgradedEffects: [status("vulnerable", 3)] },
  venom_pin: { id: "venom_pin", name: "Venom Pin", type: "attack", rarity: "common", cost: 1, description: "Deal 4 physical damage. Apply 3 poison.", upgradedDescription: "Deal 5 physical damage. Apply 5 poison.", effects: [physicalDamage(4), status("poison", 3)], upgradedEffects: [physicalDamage(5), status("poison", 5)] },
  dark_pact: { id: "dark_pact", name: "Dark Pact", type: "skill", rarity: "uncommon", cost: 0, description: "Gain 1 energy. Lose 3 HP.", upgradedDescription: "Gain 1 energy. Lose 1 HP.", effects: [energy(1), heal(-3)], upgradedEffects: [energy(1), heal(-1)] },
  blood_bloom: { id: "blood_bloom", name: "Blood Bloom", type: "skill", rarity: "rare", cost: 2, description: "Heal 8. Draw 2. Exhaust.", upgradedDescription: "Heal 12. Draw 2. Exhaust.", effects: [heal(8), draw(2)], upgradedEffects: [heal(12), draw(2)], exhaust: true },
  phantom_step: { id: "phantom_step", name: "Phantom Step", type: "skill", rarity: "rare", cost: 1, description: "Gain 5 physical armor and 5 magic armor. Draw 1.", upgradedDescription: "Gain 7 physical armor and 7 magic armor. Draw 1.", effects: [physicalArmor(5), magicArmor(5), draw(1)], upgradedEffects: [physicalArmor(7), magicArmor(7), draw(1)] },
  iron_jab: { id: "iron_jab", name: "Iron Jab", type: "attack", rarity: "common", cost: 0, description: "造成 6 点物理伤害。", upgradedDescription: "造成 9 点物理伤害。", effects: [physicalDamage(6)], upgradedEffects: [physicalDamage(9)] },
  ember_prick: { id: "ember_prick", name: "Ember Prick", type: "attack", rarity: "common", cost: 0, description: "造成 5 点魔法伤害。", upgradedDescription: "造成 7 点魔法伤害。", effects: [magicDamage(5)], upgradedEffects: [magicDamage(7)] },
  snap_guard: { id: "snap_guard", name: "Snap Guard", type: "skill", rarity: "common", cost: 0, description: "获得 5 点物理护甲。", upgradedDescription: "获得 7 点物理护甲。", effects: [physicalArmor(5)], upgradedEffects: [physicalArmor(7)] },
  glass_ward: { id: "glass_ward", name: "Glass Ward", type: "skill", rarity: "common", cost: 0, description: "获得 4 点魔法护甲。", upgradedDescription: "获得 6 点魔法护甲。", effects: [magicArmor(4)], upgradedEffects: [magicArmor(6)] },
  omen_pebble: { id: "omen_pebble", name: "Omen Pebble", type: "skill", rarity: "common", cost: 0, description: "施加 1 层虚弱。抽 1 张牌。", upgradedDescription: "施加 2 层虚弱。抽 1 张牌。", effects: [status("weak", 1), draw(1)], upgradedEffects: [status("weak", 2), draw(1)] },
  nick_and_read: { id: "nick_and_read", name: "Nick and Read", type: "attack", rarity: "common", cost: 0, description: "造成 3 点物理伤害。抽 1 张牌。选择弃掉 1 张其他手牌。", upgradedDescription: "造成 5 点物理伤害。抽 1 张牌。选择弃掉 1 张其他手牌。", effects: [physicalDamage(3), draw(1), chooseDiscard(1)], upgradedEffects: [physicalDamage(5), draw(1), chooseDiscard(1)] },
  venom_dot: { id: "venom_dot", name: "Venom Dot", type: "attack", rarity: "common", cost: 0, description: "施加 3 层中毒。", upgradedDescription: "施加 4 层中毒。", effects: [status("poison", 3)], upgradedEffects: [status("poison", 4)] },
  thorn_hint: { id: "thorn_hint", name: "Thorn Hint", type: "skill", rarity: "common", cost: 0, description: "获得 2 层荆棘。", upgradedDescription: "获得 3 层荆棘。", effects: [status("thorns", 2, player)], upgradedEffects: [status("thorns", 3, player)] },
  straight_cut: { id: "straight_cut", name: "Straight Cut", type: "attack", rarity: "common", cost: 1, description: "造成 9 点物理伤害。", upgradedDescription: "造成 13 点物理伤害。", effects: [physicalDamage(9)], upgradedEffects: [physicalDamage(13)] },
  bitter_spark: { id: "bitter_spark", name: "Bitter Spark", type: "attack", rarity: "common", cost: 1, description: "造成 8 点魔法伤害。", upgradedDescription: "造成 12 点魔法伤害。", effects: [magicDamage(8)], upgradedEffects: [magicDamage(12)] },
  brace_up: { id: "brace_up", name: "Brace Up", type: "skill", rarity: "common", cost: 1, description: "获得 8 点物理护甲。", upgradedDescription: "获得 12 点物理护甲。", effects: [physicalArmor(8)], upgradedEffects: [physicalArmor(12)] },
  blue_barrier: { id: "blue_barrier", name: "Blue Barrier", type: "skill", rarity: "common", cost: 1, description: "获得 6 点魔法护甲。", upgradedDescription: "获得 9 点魔法护甲。", effects: [magicArmor(6)], upgradedEffects: [magicArmor(9)] },
  blind_hex: { id: "blind_hex", name: "Blind Hex", type: "skill", rarity: "common", cost: 1, description: "施加 3 层虚弱。", upgradedDescription: "施加 4 层虚弱。", effects: [status("weak", 3)], upgradedEffects: [status("weak", 4)] },
  open_wound: { id: "open_wound", name: "Open Wound", type: "skill", rarity: "common", cost: 1, description: "施加 3 层易伤。", upgradedDescription: "施加 4 层易伤。", effects: [status("vulnerable", 3)], upgradedEffects: [status("vulnerable", 4)] },
  toxic_sting: { id: "toxic_sting", name: "Toxic Sting", type: "attack", rarity: "common", cost: 1, description: "施加 6 层中毒。", upgradedDescription: "施加 9 层中毒。", effects: [status("poison", 6)], upgradedEffects: [status("poison", 9)] },
  thorn_wrap: { id: "thorn_wrap", name: "Thorn Wrap", type: "skill", rarity: "common", cost: 1, description: "获得 4 层荆棘。", upgradedDescription: "获得 6 层荆棘。", effects: [status("thorns", 4, player)], upgradedEffects: [status("thorns", 6, player)] },
  read_the_ash: { id: "read_the_ash", name: "Read the Ash", type: "skill", rarity: "common", cost: 1, description: "抽 3 张牌。", upgradedDescription: "抽 4 张牌。", effects: [draw(3)], upgradedEffects: [draw(4)] },
  cut_and_cover: { id: "cut_and_cover", name: "Cut and Cover", type: "attack", rarity: "common", cost: 1, description: "造成 6 点物理伤害。抽 1 张牌。", upgradedDescription: "造成 9 点物理伤害。抽 1 张牌。", effects: [physicalDamage(6), draw(1)], upgradedEffects: [physicalDamage(9), draw(1)] },
  spell_prick: { id: "spell_prick", name: "Spell Prick", type: "attack", rarity: "common", cost: 1, description: "造成 5 点魔法伤害。抽 1 张牌。", upgradedDescription: "造成 7 点魔法伤害。抽 1 张牌。", effects: [magicDamage(5), draw(1)], upgradedEffects: [magicDamage(7), draw(1)] },
  warded_step: { id: "warded_step", name: "Warded Step", type: "skill", rarity: "common", cost: 1, description: "获得 5 点物理护甲。抽 1 张牌。选择弃掉 1 张其他手牌。", upgradedDescription: "获得 7 点物理护甲。抽 1 张牌。选择弃掉 1 张其他手牌。", effects: [physicalArmor(5), draw(1), chooseDiscard(1)], upgradedEffects: [physicalArmor(7), draw(1), chooseDiscard(1)] },
  mirror_breath: { id: "mirror_breath", name: "Mirror Breath", type: "skill", rarity: "common", cost: 1, description: "获得 4 点魔法护甲。抽 1 张牌。", upgradedDescription: "获得 6 点魔法护甲。抽 1 张牌。", effects: [magicArmor(4), draw(1)], upgradedEffects: [magicArmor(6), draw(1)] },
  thin_venom: { id: "thin_venom", name: "Thin Venom", type: "attack", rarity: "common", cost: 1, description: "造成 3 点物理伤害。施加 4 层中毒。选择弃掉 1 张其他手牌。", upgradedDescription: "造成 5 点物理伤害。施加 5 层中毒。选择弃掉 1 张其他手牌。", effects: [physicalDamage(3), status("poison", 4), chooseDiscard(1)], upgradedEffects: [physicalDamage(5), status("poison", 5), chooseDiscard(1)] },
  shatter_sign: { id: "shatter_sign", name: "Shatter Sign", type: "skill", rarity: "common", cost: 1, description: "造成 3 点物理伤害。施加 1 层虚弱和 1 层易伤。选择弃掉 1 张其他手牌。", upgradedDescription: "造成 5 点物理伤害。施加 1 层虚弱和 1 层易伤。选择弃掉 1 张其他手牌。", effects: [physicalDamage(3), status("weak", 1), status("vulnerable", 1), chooseDiscard(1)], upgradedEffects: [physicalDamage(5), status("weak", 1), status("vulnerable", 1), chooseDiscard(1)] },
  barb_stance: { id: "barb_stance", name: "Barb Stance", type: "skill", rarity: "common", cost: 1, description: "获得 2 层荆棘。抽 1 张牌。", upgradedDescription: "获得 3 层荆棘。抽 1 张牌。", effects: [status("thorns", 2, player), draw(1)], upgradedEffects: [status("thorns", 3, player), draw(1)] },
  twin_cut: { id: "twin_cut", name: "Twin Cut", type: "attack", rarity: "common", cost: 1, description: "造成 5 点物理伤害两次。", upgradedDescription: "造成 7 点物理伤害两次。", effects: [{ ...physicalDamage(5), times: 2 }], upgradedEffects: [{ ...physicalDamage(7), times: 2 }] },
  ember_slash: { id: "ember_slash", name: "Ember Slash", type: "attack", rarity: "common", cost: 1, description: "造成 3 点物理伤害和 5 点魔法伤害。", upgradedDescription: "造成 5 点物理伤害和 6 点魔法伤害。", effects: [physicalDamage(3), magicDamage(5)], upgradedEffects: [physicalDamage(5), magicDamage(6)] },
  heavy_swing: { id: "heavy_swing", name: "Heavy Swing", type: "attack", rarity: "common", cost: 2, description: "造成 18 点物理伤害。", upgradedDescription: "造成 27 点物理伤害。", effects: [physicalDamage(18)], upgradedEffects: [physicalDamage(27)] },
  cinder_bolt: { id: "cinder_bolt", name: "Cinder Bolt", type: "attack", rarity: "common", cost: 2, description: "造成 15 点魔法伤害。", upgradedDescription: "造成 22 点魔法伤害。", effects: [magicDamage(15)], upgradedEffects: [magicDamage(22)] },
  shield_raise: { id: "shield_raise", name: "Shield Raise", type: "skill", rarity: "common", cost: 2, description: "获得 15 点物理护甲。", upgradedDescription: "获得 22 点物理护甲。", effects: [physicalArmor(15)], upgradedEffects: [physicalArmor(22)] },
  mana_bastion: { id: "mana_bastion", name: "Mana Bastion", type: "skill", rarity: "common", cost: 2, description: "获得 12 点魔法护甲。", upgradedDescription: "获得 18 点魔法护甲。", effects: [magicArmor(12)], upgradedEffects: [magicArmor(18)] },
  wide_sweep: { id: "wide_sweep", name: "Wide Sweep", type: "attack", rarity: "common", cost: 2, description: "对所有敌人造成 9 点物理伤害。", upgradedDescription: "对所有敌人造成 13 点物理伤害。", effects: [physicalDamage(9, "allEnemies")], upgradedEffects: [physicalDamage(13, "allEnemies")] },
  arc_wave: { id: "arc_wave", name: "Arc Wave", type: "attack", rarity: "common", cost: 2, description: "对所有敌人造成 8 点魔法伤害。", upgradedDescription: "对所有敌人造成 12 点魔法伤害。", effects: [magicDamage(8, "allEnemies")], upgradedEffects: [magicDamage(12, "allEnemies")] },
  double_guard: { id: "double_guard", name: "Double Guard", type: "skill", rarity: "common", cost: 2, description: "获得 10 点物理护甲。抽 2 张牌。", upgradedDescription: "获得 15 点物理护甲。抽 2 张牌。", effects: [physicalArmor(10), draw(2)], upgradedEffects: [physicalArmor(15), draw(2)] },
  venom_brand: { id: "venom_brand", name: "Venom Brand", type: "attack", rarity: "common", cost: 2, description: "造成 6 点物理伤害。施加 6 层中毒。", upgradedDescription: "造成 9 点物理伤害。施加 7 层中毒。", effects: [physicalDamage(6), status("poison", 6)], upgradedEffects: [physicalDamage(9), status("poison", 7)] },
  weakening_blow: { id: "weakening_blow", name: "Weakening Blow", type: "attack", rarity: "common", cost: 2, description: "造成 9 点物理伤害。施加 3 层虚弱。", upgradedDescription: "造成 13 点物理伤害。施加 3 层虚弱。", effects: [physicalDamage(9), status("weak", 3)], upgradedEffects: [physicalDamage(13), status("weak", 3)] },
  exposed_spark: { id: "exposed_spark", name: "Exposed Spark", type: "attack", rarity: "common", cost: 2, description: "造成 8 点魔法伤害。施加 3 层易伤。", upgradedDescription: "造成 12 点魔法伤害。施加 3 层易伤。", effects: [magicDamage(8), status("vulnerable", 3)], upgradedEffects: [magicDamage(12), status("vulnerable", 3)] },
  crushing_arc: { id: "crushing_arc", name: "Crushing Arc", type: "attack", rarity: "common", cost: 3, description: "造成 27 点物理伤害。", upgradedDescription: "造成 36 点物理伤害。", effects: [physicalDamage(27)], upgradedEffects: [physicalDamage(36)] },
  storm_lance: { id: "storm_lance", name: "Storm Lance", type: "attack", rarity: "common", cost: 3, description: "造成 24 点魔法伤害。", upgradedDescription: "造成 31 点魔法伤害。", effects: [magicDamage(24)], upgradedEffects: [magicDamage(31)] },
  wall_of_bones: { id: "wall_of_bones", name: "Wall of Bones", type: "skill", rarity: "common", cost: 3, description: "获得 22 点物理护甲。", upgradedDescription: "获得 29 点物理护甲。", effects: [physicalArmor(22)], upgradedEffects: [physicalArmor(29)] },
  night_fog: { id: "night_fog", name: "Night Fog", type: "skill", rarity: "common", cost: 3, description: "对所有敌人施加 3 层虚弱。抽 3 张牌。", upgradedDescription: "对所有敌人施加 4 层虚弱。抽 3 张牌。", effects: [status("weak", 3, "allEnemies"), draw(3)], upgradedEffects: [status("weak", 4, "allEnemies"), draw(3)] },
  free_flurry: { id: "free_flurry", name: "Free Flurry", type: "attack", rarity: "uncommon", cost: 0, description: "造成 3 点物理伤害两次。抽 1 张牌。消耗。", upgradedDescription: "造成 4 点物理伤害两次。抽 1 张牌。消耗。", effects: [{ ...physicalDamage(3), times: 2 }, draw(1)], upgradedEffects: [{ ...physicalDamage(4), times: 2 }, draw(1)], exhaust: true },
  bloodless_bargain: { id: "bloodless_bargain", name: "Bloodless Bargain", type: "skill", rarity: "uncommon", cost: 0, description: "获得 1 点能量。选择消耗 1 张其他手牌。消耗。", upgradedDescription: "获得 1 点能量。抽 1 张牌。选择消耗 1 张其他手牌。消耗。", effects: [energy(1), chooseExhaust(1)], upgradedEffects: [energy(1), draw(1), chooseExhaust(1)], exhaust: true },
  quick_venom: { id: "quick_venom", name: "Quick Venom", type: "skill", rarity: "uncommon", cost: 0, description: "施加 6 层中毒。消耗。", upgradedDescription: "施加 9 层中毒。消耗。", effects: [status("poison", 6)], upgradedEffects: [status("poison", 9)], exhaust: true },
  silent_reading: { id: "silent_reading", name: "Silent Reading", type: "skill", rarity: "uncommon", cost: 0, description: "抽 3 张牌。消耗。", upgradedDescription: "抽 4 张牌。消耗。", effects: [draw(3)], upgradedEffects: [draw(4)], exhaust: true },
  iron_rhythm: { id: "iron_rhythm", name: "Iron Rhythm", type: "power", rarity: "uncommon", cost: 1, description: "获得 4 层荆棘。", upgradedDescription: "获得 6 层荆棘。", effects: [status("thorns", 4, player)], upgradedEffects: [status("thorns", 6, player)] },
  hexing_cut: { id: "hexing_cut", name: "Hexing Cut", type: "attack", rarity: "uncommon", cost: 1, description: "造成 6 点物理伤害。施加 1 层虚弱。", upgradedDescription: "造成 9 点物理伤害。施加 1 层虚弱。", effects: [physicalDamage(6), status("weak", 1)], upgradedEffects: [physicalDamage(9), status("weak", 1)] },
  venom_guard: { id: "venom_guard", name: "Venom Guard", type: "skill", rarity: "uncommon", cost: 1, description: "获得 5 点物理护甲。施加 3 层中毒。", upgradedDescription: "获得 7 点物理护甲。施加 4 层中毒。", effects: [physicalArmor(5), status("poison", 3)], upgradedEffects: [physicalArmor(7), status("poison", 4)] },
  arcane_flow: { id: "arcane_flow", name: "Arcane Flow", type: "skill", rarity: "uncommon", cost: 1, description: "获得 1 点能量。抽 1 张牌。选择弃掉 1 张其他手牌。消耗。", upgradedDescription: "获得 1 点能量。抽 2 张牌。选择弃掉 1 张其他手牌。消耗。", effects: [energy(1), draw(1), chooseDiscard(1)], upgradedEffects: [energy(1), draw(2), chooseDiscard(1)], exhaust: true },
  thorn_prayer: { id: "thorn_prayer", name: "Thorn Prayer", type: "power", rarity: "uncommon", cost: 1, description: "获得 2 层荆棘和 4 点魔法护甲。", upgradedDescription: "获得 3 层荆棘和 5 点魔法护甲。", effects: [status("thorns", 2, player), magicArmor(4)], upgradedEffects: [status("thorns", 3, player), magicArmor(5)] },
  exposed_line: { id: "exposed_line", name: "Exposed Line", type: "skill", rarity: "uncommon", cost: 1, description: "施加 2 层易伤。抽 1 张牌。", upgradedDescription: "施加 3 层易伤。抽 1 张牌。", effects: [status("vulnerable", 2), draw(1)], upgradedEffects: [status("vulnerable", 3), draw(1)] },
  dusk_needles: { id: "dusk_needles", name: "Dusk Needles", type: "attack", rarity: "uncommon", cost: 1, description: "造成 3 点物理伤害三次。", upgradedDescription: "造成 4 点物理伤害三次。", effects: [{ ...physicalDamage(3), times: 3 }], upgradedEffects: [{ ...physicalDamage(4), times: 3 }] },
  veil_cut: { id: "veil_cut", name: "Veil Cut", type: "attack", rarity: "uncommon", cost: 1, description: "造成 5 点魔法伤害。获得 4 点魔法护甲。", upgradedDescription: "造成 7 点魔法伤害。获得 5 点魔法护甲。", effects: [magicDamage(5), magicArmor(4)], upgradedEffects: [magicDamage(7), magicArmor(5)] },
  low_sun: { id: "low_sun", name: "Low Sun", type: "skill", rarity: "uncommon", cost: 1, description: "施加 1 层虚弱和 1 层易伤。抽 1 张牌。", upgradedDescription: "施加 2 层虚弱和 1 层易伤。抽 1 张牌。", effects: [status("weak", 1), status("vulnerable", 1), draw(1)], upgradedEffects: [status("weak", 2), status("vulnerable", 1), draw(1)] },
  sweeping_hook: { id: "sweeping_hook", name: "Sweeping Hook", type: "attack", rarity: "uncommon", cost: 2, description: "对所有敌人造成 6 点物理伤害。抽 1 张牌。选择弃掉 1 张其他手牌。", upgradedDescription: "对所有敌人造成 9 点物理伤害。抽 1 张牌。选择弃掉 1 张其他手牌。", effects: [physicalDamage(6, "allEnemies"), draw(1), chooseDiscard(1)], upgradedEffects: [physicalDamage(9, "allEnemies"), draw(1), chooseDiscard(1)] },
  boiling_rune: { id: "boiling_rune", name: "Boiling Rune", type: "attack", rarity: "uncommon", cost: 2, description: "对所有敌人造成 5 点魔法伤害。施加 3 层中毒。", upgradedDescription: "对所有敌人造成 7 点魔法伤害。施加 4 层中毒。", effects: [magicDamage(5, "allEnemies"), status("poison", 3)], upgradedEffects: [magicDamage(7, "allEnemies"), status("poison", 4)] },
  plated_thorns: { id: "plated_thorns", name: "Plated Thorns", type: "skill", rarity: "uncommon", cost: 2, description: "获得 8 点物理护甲和 4 层荆棘。", upgradedDescription: "获得 12 点物理护甲和 4 层荆棘。", effects: [physicalArmor(8), status("thorns", 4, player)], upgradedEffects: [physicalArmor(12), status("thorns", 4, player)] },
  toxic_opening: { id: "toxic_opening", name: "Toxic Opening", type: "skill", rarity: "uncommon", cost: 2, description: "施加 3 层易伤和 6 层中毒。选择消耗 1 张其他手牌。", upgradedDescription: "施加 4 层易伤和 7 层中毒。选择消耗 1 张其他手牌。", effects: [status("vulnerable", 3), status("poison", 6), chooseExhaust(1)], upgradedEffects: [status("vulnerable", 4), status("poison", 7), chooseExhaust(1)] },
  ash_bulwark: { id: "ash_bulwark", name: "Ash Bulwark", type: "skill", rarity: "uncommon", cost: 2, description: "获得 10 点物理护甲和 4 点魔法护甲。", upgradedDescription: "获得 15 点物理护甲和 4 点魔法护甲。", effects: [physicalArmor(10), magicArmor(4)], upgradedEffects: [physicalArmor(15), magicArmor(4)] },
  mind_splinter: { id: "mind_splinter", name: "Mind Splinter", type: "attack", rarity: "uncommon", cost: 2, description: "造成 8 点魔法伤害。施加 3 层虚弱。", upgradedDescription: "造成 12 点魔法伤害。施加 3 层虚弱。", effects: [magicDamage(8), status("weak", 3)], upgradedEffects: [magicDamage(12), status("weak", 3)] },
  red_needle: { id: "red_needle", name: "Red Needle", type: "attack", rarity: "uncommon", cost: 2, description: "造成 9 点物理伤害。施加 6 层中毒。", upgradedDescription: "造成 13 点物理伤害。施加 6 层中毒。", effects: [physicalDamage(9), status("poison", 6)], upgradedEffects: [physicalDamage(13), status("poison", 6)] },
  script_of_teeth: { id: "script_of_teeth", name: "Script of Teeth", type: "skill", rarity: "uncommon", cost: 2, description: "抽 3 张牌。获得 4 层荆棘。选择弃掉 1 张其他手牌。", upgradedDescription: "抽 4 张牌。获得 4 层荆棘。选择弃掉 1 张其他手牌。", effects: [draw(3), status("thorns", 4, player), chooseDiscard(1)], upgradedEffects: [draw(4), status("thorns", 4, player), chooseDiscard(1)] },
  split_pressure: { id: "split_pressure", name: "Split Pressure", type: "attack", rarity: "uncommon", cost: 2, description: "造成 9 点物理伤害。施加 3 层易伤。", upgradedDescription: "造成 13 点物理伤害。施加 3 层易伤。", effects: [physicalDamage(9), status("vulnerable", 3)], upgradedEffects: [physicalDamage(13), status("vulnerable", 3)] },
  black_salve: { id: "black_salve", name: "Black Salve", type: "skill", rarity: "uncommon", cost: 2, description: "获得 8 点魔法护甲。抽 2 张牌。", upgradedDescription: "获得 12 点魔法护甲。抽 2 张牌。", effects: [magicArmor(8), draw(2)], upgradedEffects: [magicArmor(12), draw(2)] },
  cinder_circle: { id: "cinder_circle", name: "Cinder Circle", type: "attack", rarity: "uncommon", cost: 3, description: "对所有敌人造成 15 点魔法伤害。", upgradedDescription: "对所有敌人造成 22 点魔法伤害。", effects: [magicDamage(15, "allEnemies")], upgradedEffects: [magicDamage(22, "allEnemies")] },
  grave_sweep: { id: "grave_sweep", name: "Grave Sweep", type: "attack", rarity: "uncommon", cost: 3, description: "对所有敌人造成 18 点物理伤害。", upgradedDescription: "对所有敌人造成 27 点物理伤害。", effects: [physicalDamage(18, "allEnemies")], upgradedEffects: [physicalDamage(27, "allEnemies")] },
  cruel_lesson: { id: "cruel_lesson", name: "Cruel Lesson", type: "skill", rarity: "uncommon", cost: 3, description: "对所有敌人施加 3 层虚弱和 3 层易伤。", upgradedDescription: "对所有敌人施加 4 层虚弱和 3 层易伤。", effects: [status("weak", 3, "allEnemies"), status("vulnerable", 3, "allEnemies")], upgradedEffects: [status("weak", 4, "allEnemies"), status("vulnerable", 3, "allEnemies")] },
  nest_of_barbs: { id: "nest_of_barbs", name: "Nest of Barbs", type: "power", rarity: "uncommon", cost: 3, description: "获得 8 层荆棘和 5 点物理护甲。", upgradedDescription: "获得 10 层荆棘和 7 点物理护甲。", effects: [status("thorns", 8, player), physicalArmor(5)], upgradedEffects: [status("thorns", 10, player), physicalArmor(7)] },
  venom_weather: { id: "venom_weather", name: "Venom Weather", type: "skill", rarity: "uncommon", cost: 3, description: "对所有敌人施加 6 层中毒。抽 3 张牌。", upgradedDescription: "对所有敌人施加 9 层中毒。抽 3 张牌。", effects: [status("poison", 6, "allEnemies"), draw(3)], upgradedEffects: [status("poison", 9, "allEnemies"), draw(3)] },
  mirror_citadel: { id: "mirror_citadel", name: "Mirror Citadel", type: "skill", rarity: "uncommon", cost: 3, description: "获得 15 点物理护甲和 8 点魔法护甲。", upgradedDescription: "获得 22 点物理护甲和 8 点魔法护甲。", effects: [physicalArmor(15), magicArmor(8)], upgradedEffects: [physicalArmor(22), magicArmor(8)] },
  eclipse_gate: { id: "eclipse_gate", name: "Eclipse Gate", type: "attack", rarity: "uncommon", cost: 4, description: "对所有敌人造成 18 点物理伤害和 15 点魔法伤害。", upgradedDescription: "对所有敌人造成 27 点物理伤害和 15 点魔法伤害。", effects: [physicalDamage(18, "allEnemies"), magicDamage(15, "allEnemies")], upgradedEffects: [physicalDamage(27, "allEnemies"), magicDamage(15, "allEnemies")] },
  zero_hour: { id: "zero_hour", name: "Zero Hour", type: "skill", rarity: "rare", cost: 0, description: "获得 1 点能量。抽 1 张牌。选择弃掉 1 张其他手牌。消耗。", upgradedDescription: "获得 1 点能量。抽 2 张牌。选择弃掉 1 张其他手牌。消耗。", effects: [energy(1), draw(1), chooseDiscard(1)], upgradedEffects: [energy(1), draw(2), chooseDiscard(1)], exhaust: true },
  demon_grin: { id: "demon_grin", name: "Demon Grin", type: "power", rarity: "rare", cost: 1, description: "获得 4 层荆棘。抽 3 张牌。消耗。", upgradedDescription: "获得 6 层荆棘。抽 3 张牌。消耗。", effects: [status("thorns", 4, player), draw(3)], upgradedEffects: [status("thorns", 6, player), draw(3)], exhaust: true },
  perfect_cut: { id: "perfect_cut", name: "Perfect Cut", type: "attack", rarity: "rare", cost: 1, description: "造成 9 点物理伤害。施加 3 层易伤。消耗。", upgradedDescription: "造成 13 点物理伤害。施加 3 层易伤。消耗。", effects: [physicalDamage(9), status("vulnerable", 3)], upgradedEffects: [physicalDamage(13), status("vulnerable", 3)], exhaust: true },
  silent_plague: { id: "silent_plague", name: "Silent Plague", type: "skill", rarity: "rare", cost: 1, description: "施加 6 层中毒和 3 层虚弱。选择消耗 1 张其他手牌。消耗。", upgradedDescription: "施加 9 层中毒和 3 层虚弱。选择消耗 1 张其他手牌。消耗。", effects: [status("poison", 6), status("weak", 3), chooseExhaust(1)], upgradedEffects: [status("poison", 9), status("weak", 3), chooseExhaust(1)], exhaust: true },
  red_math: { id: "red_math", name: "Red Math", type: "attack", rarity: "rare", cost: 2, description: "造成 18 点物理伤害。抽 1 张牌。选择弃掉 1 张其他手牌。消耗。", upgradedDescription: "造成 27 点物理伤害。抽 1 张牌。选择弃掉 1 张其他手牌。消耗。", effects: [physicalDamage(18), draw(1), chooseDiscard(1)], upgradedEffects: [physicalDamage(27), draw(1), chooseDiscard(1)], exhaust: true },
  lunar_edict: { id: "lunar_edict", name: "Lunar Edict", type: "skill", rarity: "rare", cost: 2, description: "对所有敌人施加 3 层虚弱。抽 3 张牌。消耗。", upgradedDescription: "对所有敌人施加 4 层虚弱。抽 3 张牌。消耗。", effects: [status("weak", 3, "allEnemies"), draw(3)], upgradedEffects: [status("weak", 4, "allEnemies"), draw(3)], exhaust: true },
  crown_crack: { id: "crown_crack", name: "Crown Crack", type: "attack", rarity: "rare", cost: 2, description: "造成 15 点魔法伤害。施加 3 层易伤。", upgradedDescription: "造成 22 点魔法伤害。施加 3 层易伤。", effects: [magicDamage(15), status("vulnerable", 3)], upgradedEffects: [magicDamage(22), status("vulnerable", 3)] },
  thorn_engine: { id: "thorn_engine", name: "Thorn Engine", type: "power", rarity: "rare", cost: 2, description: "获得 8 层荆棘。", upgradedDescription: "获得 12 层荆棘。", effects: [status("thorns", 8, player)], upgradedEffects: [status("thorns", 12, player)] },
  rhythm_engine: { id: "rhythm_engine", name: "Rhythm Engine", type: "power", rarity: "uncommon", cost: 1, description: "每使用 6 张牌，回复 1 点能量。", upgradedDescription: "每使用 5 张牌，回复 1 点能量。", effects: [], upgradedEffects: [] },
  skill_echo: { id: "skill_echo", name: "Skill Echo", type: "power", rarity: "rare", cost: 3, upgradedCost: 2, description: "每回合使用的第 1 张技能牌重复一次。", upgradedDescription: "费用变为 2。每回合使用的第 1 张技能牌重复一次。", effects: [], upgradedEffects: [] },
  assault_echo: { id: "assault_echo", name: "Assault Echo", type: "power", rarity: "rare", cost: 3, description: "每回合使用的第 1 张攻击牌重复一次。", upgradedDescription: "每回合使用的前 2 张攻击牌重复一次。", effects: [], upgradedEffects: [] },
  mana_cascade: { id: "mana_cascade", name: "Mana Cascade", type: "power", rarity: "rare", cost: 2, description: "每个回合中，每累计造成 50 点魔法伤害，回复 1 点能量并抽 2 张牌。", upgradedDescription: "每个回合中，每累计造成 50 点魔法伤害，回复 1 点能量并抽 3 张牌。", effects: [], upgradedEffects: [] },
  null_brand: { id: "null_brand", name: "Null Brand", type: "power", rarity: "uncommon", cost: 1, upgradedCost: 0, description: "每对敌人造成一次物理伤害，该敌人当前回合魔力 -1。", upgradedDescription: "费用变为 0。每对敌人造成一次物理伤害，该敌人当前回合魔力 -1。", effects: [], upgradedEffects: [] },
  iron_habit: { id: "iron_habit", name: "Iron Habit", type: "power", rarity: "common", cost: 1, description: "回合结束时获得 3 点物理护甲。", upgradedDescription: "回合结束时获得 4 点物理护甲。", effects: [], upgradedEffects: [] },
  blue_habit: { id: "blue_habit", name: "Blue Habit", type: "power", rarity: "common", cost: 2, upgradedCost: 1, description: "回合结束时获得 3 点魔法护甲。", upgradedDescription: "费用变为 1。回合结束时获得 3 点魔法护甲。", effects: [], upgradedEffects: [] },
  cruel_meter: { id: "cruel_meter", name: "Cruel Meter", type: "power", rarity: "rare", cost: 2, upgradedCost: 1, description: "每个回合中，敌人每受到 2 次物理伤害，获得 1 层易伤；每受到 2 次魔法伤害，获得 1 层虚弱。", upgradedDescription: "费用变为 1。每个回合中，敌人每受到 2 次物理伤害，获得 1 层易伤；每受到 2 次魔法伤害，获得 1 层虚弱。", effects: [], upgradedEffects: [] },
  dawn_ledger: { id: "dawn_ledger", name: "Dawn Ledger", type: "power", rarity: "rare", cost: 1, upgradedCost: 0, description: "每回合开始时抽牌数 +1。", upgradedDescription: "费用变为 0。每回合开始时抽牌数 +1。", effects: [], upgradedEffects: [] },
  venom_contract: { id: "venom_contract", name: "Venom Contract", type: "skill", rarity: "rare", cost: 2, description: "施加 12 层中毒。抽 2 张牌。选择消耗 1 张其他手牌。消耗。", upgradedDescription: "施加 18 层中毒。抽 2 张牌。选择消耗 1 张其他手牌。消耗。", effects: [status("poison", 12), draw(2), chooseExhaust(1)], upgradedEffects: [status("poison", 18), draw(2), chooseExhaust(1)], exhaust: true },
  twin_sanction: { id: "twin_sanction", name: "Twin Sanction", type: "attack", rarity: "rare", cost: 2, description: "造成 9 点物理伤害和 8 点魔法伤害。", upgradedDescription: "造成 13 点物理伤害和 10 点魔法伤害。", effects: [physicalDamage(9), magicDamage(8)], upgradedEffects: [physicalDamage(13), magicDamage(10)] },
  final_argument: { id: "final_argument", name: "Final Argument", type: "attack", rarity: "rare", cost: 3, description: "造成 27 点物理伤害。施加 3 层易伤。", upgradedDescription: "造成 36 点物理伤害。施加 3 层易伤。", effects: [physicalDamage(27), status("vulnerable", 3)], upgradedEffects: [physicalDamage(36), status("vulnerable", 3)] },
  astral_collapse: { id: "astral_collapse", name: "Astral Collapse", type: "attack", rarity: "rare", cost: 3, description: "对所有敌人造成 15 点魔法伤害并施加 3 层虚弱。", upgradedDescription: "对所有敌人造成 22 点魔法伤害并施加 3 层虚弱。", effects: [magicDamage(15, "allEnemies"), status("weak", 3, "allEnemies")], upgradedEffects: [magicDamage(22, "allEnemies"), status("weak", 3, "allEnemies")] },
  black_bastion: { id: "black_bastion", name: "Black Bastion", type: "skill", rarity: "rare", cost: 3, description: "获得 20 点物理护甲和 8 点魔法护甲。抽 1 张牌。", upgradedDescription: "获得 27 点物理护甲和 8 点魔法护甲。抽 1 张牌。", effects: [physicalArmor(20), magicArmor(8), draw(1)], upgradedEffects: [physicalArmor(27), magicArmor(8), draw(1)] },
  all_teeth: { id: "all_teeth", name: "All Teeth", type: "attack", rarity: "rare", cost: 3, description: "造成 9 点物理伤害三次。消耗。", upgradedDescription: "造成 12 点物理伤害三次。消耗。", effects: [{ ...physicalDamage(9), times: 3 }], upgradedEffects: [{ ...physicalDamage(12), times: 3 }], exhaust: true },
  plague_star: { id: "plague_star", name: "Plague Star", type: "skill", rarity: "rare", cost: 3, description: "对所有敌人施加 12 层中毒。", upgradedDescription: "对所有敌人施加 18 层中毒。", effects: [status("poison", 12, "allEnemies")], upgradedEffects: [status("poison", 18, "allEnemies")] },
  omen_engine: { id: "omen_engine", name: "Omen Engine", type: "skill", rarity: "rare", cost: 3, description: "施加 3 层虚弱和 3 层易伤。抽 3 张牌。", upgradedDescription: "施加 4 层虚弱和 3 层易伤。抽 3 张牌。", effects: [status("weak", 3), status("vulnerable", 3), draw(3)], upgradedEffects: [status("weak", 4), status("vulnerable", 3), draw(3)] },
  godless_sweep: { id: "godless_sweep", name: "Godless Sweep", type: "attack", rarity: "rare", cost: 4, description: "对所有敌人造成 27 点物理伤害。", upgradedDescription: "对所有敌人造成 36 点物理伤害。", effects: [physicalDamage(27, "allEnemies")], upgradedEffects: [physicalDamage(36, "allEnemies")] },
  void_lantern: { id: "void_lantern", name: "Void Lantern", type: "attack", rarity: "rare", cost: 4, description: "对所有敌人造成 24 点魔法伤害。", upgradedDescription: "对所有敌人造成 31 点魔法伤害。", effects: [magicDamage(24, "allEnemies")], upgradedEffects: [magicDamage(31, "allEnemies")] },
  collar_of_ruin: { id: "collar_of_ruin", name: "Collar of Ruin", type: "skill", rarity: "rare", cost: 4, description: "对所有敌人施加 3 层虚弱、3 层易伤和 6 层中毒。选择消耗 1 张其他手牌。", upgradedDescription: "对所有敌人施加 4 层虚弱、3 层易伤和 6 层中毒。选择消耗 1 张其他手牌。", effects: [status("weak", 3, "allEnemies"), status("vulnerable", 3, "allEnemies"), status("poison", 6, "allEnemies"), chooseExhaust(1)], upgradedEffects: [status("weak", 4, "allEnemies"), status("vulnerable", 3, "allEnemies"), status("poison", 6, "allEnemies"), chooseExhaust(1)] },
  night_judgment: { id: "night_judgment", name: "Night Judgment", type: "attack", rarity: "rare", cost: 4, description: "对所有敌人造成 18 点物理伤害和 15 点魔法伤害。抽 3 张牌。消耗。", upgradedDescription: "对所有敌人造成 27 点物理伤害和 15 点魔法伤害。抽 3 张牌。消耗。", effects: [physicalDamage(18, "allEnemies"), magicDamage(15, "allEnemies"), draw(3)], upgradedEffects: [physicalDamage(27, "allEnemies"), magicDamage(15, "allEnemies"), draw(3)], exhaust: true },
  wound: { id: "wound", name: "Wound", type: "status", rarity: "basic", cost: 1, description: "Unplayable weight in the deck.", upgradedDescription: "Unplayable weight in the deck.", effects: [], upgradedEffects: [] },
  curse: { id: "curse", name: "Night Mark", type: "curse", rarity: "basic", cost: 1, description: "A dead card born from risky bargains.", upgradedDescription: "A dead card born from risky bargains.", effects: [], upgradedEffects: [] }
};

export const rewardCardPool = Object.values(cards).filter((card) => !["basic", "status", "curse"].includes(card.rarity));

export const enemies: EnemyDefinition[] = [
  { id: "hollow", name: "Hollow Acolyte", tier: "normal", maxHp: 34, armor: 0, moves: [{ id: "chant", intent: "debuff", label: "Weak hex", effects: [status("weak", 1, player)] }, { id: "knife", intent: "attack", label: "Knife", effects: [physicalDamage(7, player)] }] },
  { id: "mawling", name: "Mawling", tier: "normal", maxHp: 42, armor: 0, moves: [{ id: "gnash", intent: "attack", label: "Gnash", effects: [{ ...physicalDamage(6, player), times: 2 }] }, { id: "hide", intent: "defend", label: "Hide", effects: [physicalArmor(9, self)] }] },
  { id: "cinder", name: "Cinder Husk", tier: "normal", maxHp: 38, armor: 2, moves: [{ id: "burn", intent: "mixed", label: "Burning shove", effects: [magicDamage(8, player), status("vulnerable", 1, player)] }, { id: "flare", intent: "attack", label: "Flare", effects: [magicDamage(11, player)] }] },
  { id: "widow", name: "Net Widow", tier: "normal", maxHp: 36, armor: 0, moves: [{ id: "venom", intent: "debuff", label: "Venom", effects: [status("poison", 4, player)] }, { id: "bite", intent: "attack", label: "Bite", effects: [physicalDamage(9, player)] }] },
  { id: "warden", name: "Grave Warden", tier: "elite", maxHp: 78, armor: 4, moves: [{ id: "cleave", intent: "attack", label: "Cleave", effects: [physicalDamage(14, player)] }, { id: "brace", intent: "mixed", label: "Brace", effects: [physicalDamage(8, player), physicalArmor(14, self)] }, { id: "command", intent: "buff", label: "Command", effects: [status("strength", 2, self)] }] },
  { id: "mirror", name: "Black Mirror", tier: "elite", maxHp: 70, armor: 0, moves: [{ id: "fracture", intent: "attack", label: "Fracture", effects: [{ ...magicDamage(6, player), times: 3 }] }, { id: "curse", intent: "debuff", label: "Mark", effects: [status("vulnerable", 2, player), magicArmor(8, self)] }] },
  { id: "oracle", name: "Ash Oracle", tier: "elite", maxHp: 64, armor: 0, moves: [{ id: "doom", intent: "debuff", label: "Doom", effects: [status("weak", 2, player), status("poison", 3, player)] }, { id: "smite", intent: "attack", label: "Smite", effects: [magicDamage(18, player)] }] },
  { id: "knight", name: "Dusk Knight", tier: "normal", maxHp: 50, armor: 3, moves: [{ id: "lunge", intent: "attack", label: "Lunge", effects: [physicalDamage(12, player)] }, { id: "guard", intent: "defend", label: "Guard", effects: [physicalArmor(12, self)] }] },
  { id: "lamprey", name: "Gloom Lamprey", tier: "normal", maxHp: 30, armor: 0, moves: [{ id: "drain", intent: "mixed", label: "Drain", effects: [magicDamage(5, player), status("weak", 1, player)] }, { id: "swarm", intent: "attack", label: "Swarm", effects: [{ ...physicalDamage(4, player), times: 3 }] }] },
  { id: "heart", name: "The Rootless Heart", tier: "boss", maxHp: 180, armor: 6, moves: [{ id: "pulse", intent: "attack", label: "Ruin pulse", effects: [{ ...magicDamage(12, player), times: 2 }] }, { id: "veil", intent: "mixed", label: "Veil", effects: [magicArmor(18, self), status("magic", 2, self)] }, { id: "sentence", intent: "debuff", label: "Sentence", effects: [status("vulnerable", 2, player), status("weak", 2, player)] }] },
  { id: "crown", name: "The Cinder Crown", tier: "boss", maxHp: 168, armor: 4, moves: [{ id: "coronate", intent: "buff", label: "Coronate", effects: [status("strength", 2, self), status("magic", 1, self)] }, { id: "scepter", intent: "attack", label: "Scepter fall", effects: [physicalDamage(18, player)] }, { id: "ashen_tax", intent: "mixed", label: "Ashen tax", effects: [magicDamage(10, player), physicalArmor(16, self), status("weak", 1, player)] }] },
  { id: "loom", name: "The Pale Loom", tier: "boss", maxHp: 156, armor: 8, moves: [{ id: "thread", intent: "debuff", label: "Thread the vein", effects: [status("poison", 6, player), magicArmor(8, self)] }, { id: "shuttle", intent: "attack", label: "Bone shuttle", effects: [{ ...physicalDamage(7, player), times: 3 }] }, { id: "weave", intent: "mixed", label: "Weave shut", effects: [physicalArmor(12, self), magicArmor(12, self), status("vulnerable", 1, player)] }] }
];

export const events: GameEvent[] = [
  { id: "sinkhole_gate", title: "下沉的门", body: "一段旧路塌进黑暗，门楣上刻着仍在变热的数字。", choices: [{ id: "enter", label: "进入副本", description: "进入一张临时地图。完成后威胁 +2；击败副本首领可获得金币、卡牌和宝箱。", effect: "enterDungeon", dungeonThreat: 2 }, { id: "leave", label: "绕开", description: "继续前进。", effect: "skip" }] },
  { id: "sealed_lift", title: "封印升降台", body: "铁链通往一片陌生层面，回程的铃声听起来并不可靠。", choices: [{ id: "descend", label: "启动升降台", description: "进入一张临时地图。完成后威胁 +3；击败副本首领可获得金币、卡牌和宝箱。", effect: "enterDungeon", dungeonThreat: 3 }, { id: "leave", label: "离开", description: "继续前进。", effect: "skip" }] },
  { id: "altar", title: "静齿祭坛", body: "金币在石圣的口中闪光。它索要一点温度。", choices: [{ id: "take", label: "取走金币", description: "获得 45 金币，失去 8 点生命。", effect: "gainGoldLoseHp" }, { id: "pray", label: "献上一张牌", description: "随机升级一张牌。", effect: "upgradeRandom" }, { id: "leave", label: "离开", description: "继续前进。", effect: "skip" }] },
  { id: "pool", title: "无月之池", body: "黑水映出一个更健康的你，笑得过分灿烂。", choices: [{ id: "drink", label: "饮下池水", description: "恢复 18 点生命，加入一张诅咒。", effect: "healGainCurse" }, { id: "study", label: "凝视倒影", description: "随机升级一张牌。", effect: "upgradeRandom" }, { id: "leave", label: "离开", description: "继续前进。", effect: "skip" }] },
  { id: "caravan", title: "失落商队", body: "车队早已废弃，但锁上还有新鲜抓痕。", choices: [{ id: "loot", label: "快速搜刮", description: "获得 45 金币，失去 8 点生命。", effect: "gainGoldLoseHp" }, { id: "repair", label: "修整装备", description: "随机升级一张牌。", effect: "upgradeRandom" }, { id: "leave", label: "离开", description: "继续前进。", effect: "skip" }] }
];

export const relics: Record<string, RelicDefinition> = {
  cracked_core: { id: "cracked_core", name: "恶魔项圈", rarity: "basic", description: "At the start of combat, gain 1 Strength.", trigger: "combatStart", effects: [status("strength", 1, player)] },
  pocket_lantern: { id: "pocket_lantern", name: "Pocket Lantern", rarity: "common", description: "At the start of combat, gain 1 energy.", trigger: "combatStart", effects: [energy(1)] },
  ash_charm: { id: "ash_charm", name: "Ash Charm", rarity: "common", description: "At the start of each turn, gain 2 physical armor.", trigger: "turnStart", effects: [physicalArmor(2)] },
  red_ledger: { id: "red_ledger", name: "Red Ledger", rarity: "common", description: "After combat, gain 8 gold.", trigger: "combatWon", effects: [gold(8)] },
  glass_feather: { id: "glass_feather", name: "Glass Feather", rarity: "uncommon", description: "After you play a card, gain 1 physical armor.", trigger: "cardPlayed", effects: [physicalArmor(1)] },
  marrow_cup: { id: "marrow_cup", name: "Marrow Cup", rarity: "uncommon", description: "After combat, heal 3 HP.", trigger: "combatWon", effects: [heal(3)] },
  iron_thread: { id: "iron_thread", name: "Iron Thread", rarity: "uncommon", description: "When damaged, gain 1 physical armor.", trigger: "beforeDamageTaken", effects: [physicalArmor(1)] },
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
    starterDeck: ["strike", "strike", "strike", "guard", "guard", "guard", "spark", "spark", "ward", "ward"],
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
export const effectParams = ["hp", "maxHp", "physicalDamage", "magicDamage", "physicalArmor", "magicArmor", "energy", "maxEnergy", "gold", "statusAmount", "upgraded", "cost", "cards", "turn", "threat", "movesTaken"] as const;
export const effectOps = ["add", "subtract", "set", "multiply", "move", "create", "remove", "clear"] as const;
export const cardSelectionModes = ["manual"] as const;
export const intents = ["attack", "defend", "buff", "debuff", "mixed"] as const;
export const tiers = ["normal", "elite", "boss"] as const;
export const relicTriggers = ["runStart", "combatStart", "turnStart", "turnEnd", "cardPlayed", "beforeDamageTaken", "playerDamaged", "enemyKilled", "combatWon", "cardDrawn", "statusApplied"] as const;
export const statuses = ["weak", "vulnerable", "frail", "poison", "burn", "bleed", "strength", "magic", "dexterity", "thorns", "regen", "platedArmor", "artifact", "intangible"] as const;
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
    if (card.upgradedCost !== undefined) validateInteger(card.upgradedCost, `Card ${key} upgraded cost`, errors, 0);
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
    if (item.selection && !cardSelectionModes.includes(item.selection)) errors.push(`${effectLabel} has invalid selection.`);
    if (item.selection === "manual" && (item.param !== "cards" || item.op !== "move" || item.fromZone !== "hand")) errors.push(`${effectLabel} manual selection must move cards from hand.`);
    if (item.param === "cards" && ["move", "create", "remove"].includes(item.op ?? "") && item.amount === undefined) errors.push(`${effectLabel} needs an amount.`);
    if (["hp", "maxHp", "physicalDamage", "magicDamage", "physicalArmor", "magicArmor", "energy", "maxEnergy", "gold", "statusAmount", "turn", "threat", "movesTaken", "cost"].includes(item.param ?? "") && item.op !== "clear" && item.amount === undefined) errors.push(`${effectLabel} needs an amount.`);
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
    ...(move.damage ? [{ ...physicalDamage(move.damage, player), times: move.hits ?? 1 }] : []),
    ...(move.block ? [physicalArmor(move.block, self)] : []),
    ...normalizeEffects(move.effects ?? [], "enemy")
  ];
}

function normalizeEffect(effect: LegacyEffect, context: EffectContext): Effect[] {
  if (effect.target && effect.param && effect.op) return [migrateParameterizedEffect(effect as Effect)];
  const amount = effect.amount ?? 0;
  if (effect.type === "damage") return [physicalDamage(amount, context === "enemy" ? player : selectedEnemy)];
  if (effect.type === "block" || effect.type === "gainBlock") return [physicalArmor(amount, context === "enemy" ? self : player)];
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
  if (effect.type === "reduceDamage") return [physicalArmor(amount, player)];
  return [];
}

function migrateParameterizedEffect(effect: Effect): Effect {
  if ((effect.param as string) === "block") return { ...effect, param: "physicalArmor" };
  return effect;
}

function migrateRelicTrigger(trigger: RelicTrigger): RelicTrigger {
  return trigger === "playerDamaged" ? "beforeDamageTaken" : trigger;
}
