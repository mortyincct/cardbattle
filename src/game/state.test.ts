import { beforeEach, describe, expect, it } from "vitest";
import { applyEventChoice, buyFromShop, chooseRewardCard, claimTreasure, clearSave, completeCardChoice, endTurn, loadRun, MAX_ACT, moveToNode, newRun, playCard, restAtCampfire, saveRun, SAVE_KEY, SAVE_VERSION, scaleEnemy, shopService, startCombat } from "./state";
import { clearContentDraft, CONTENT_DRAFT_KEY, defaultContentPack, enemies, loadContentPack, normalizeContentPack, saveContentDraft, validateContentPack } from "./content";
import type { Effect, EnemyState, EventChoice, RunState, StatusEffect } from "./types";

beforeEach(() => {
  localStorage.removeItem(CONTENT_DRAFT_KEY);
  localStorage.removeItem(SAVE_KEY);
});

const expansionCardIds = [
  "iron_jab", "ember_prick", "snap_guard", "glass_ward", "omen_pebble", "nick_and_read", "venom_dot", "thorn_hint", "straight_cut", "bitter_spark",
  "brace_up", "blue_barrier", "blind_hex", "open_wound", "toxic_sting", "thorn_wrap", "read_the_ash", "cut_and_cover", "spell_prick", "warded_step",
  "mirror_breath", "thin_venom", "shatter_sign", "barb_stance", "twin_cut", "ember_slash", "heavy_swing", "cinder_bolt", "shield_raise", "mana_bastion",
  "wide_sweep", "arc_wave", "double_guard", "venom_brand", "weakening_blow", "exposed_spark", "crushing_arc", "storm_lance", "wall_of_bones", "night_fog",
  "free_flurry", "bloodless_bargain", "quick_venom", "silent_reading", "iron_rhythm", "hexing_cut", "venom_guard", "arcane_flow", "thorn_prayer", "exposed_line",
  "dusk_needles", "veil_cut", "low_sun", "sweeping_hook", "boiling_rune", "plated_thorns", "toxic_opening", "ash_bulwark", "mind_splinter", "red_needle",
  "script_of_teeth", "split_pressure", "black_salve", "cinder_circle", "grave_sweep", "cruel_lesson", "nest_of_barbs", "venom_weather", "mirror_citadel", "eclipse_gate",
  "zero_hour", "demon_grin", "perfect_cut", "silent_plague", "red_math", "lunar_edict", "crown_crack", "thorn_engine", "venom_contract", "twin_sanction",
  "final_argument", "astral_collapse", "black_bastion", "all_teeth", "plague_star", "omen_engine", "godless_sweep", "void_lantern", "collar_of_ruin", "night_judgment"
] as const;

describe("map movement", () => {
  it("only allows movement to visible neighboring nodes and raises threat", () => {
    const run = newRun(42);
    const start = run.map.find((node) => node.id === "start")!;
    const moved = moveToNode(run, start.neighbors[0]);
    expect(moved.currentNodeId).toBe(start.neighbors[0]);
    expect(moved.threat).toBe(1);
    expect(moved.movesTaken).toBe(1);
  });

  it("starts each run in act 1 with a central start, expanded network, and three edge bosses", () => {
    const run = newRun(42);
    const start = run.map.find((node) => node.id === "start")!;
    const bossNodes = run.map.filter((node) => node.type === "boss");
    const innerRing = run.map.filter((node) => node.id.startsWith("ring0-"));
    const outerRing = run.map.filter((node) => node.id.startsWith("ring2-"));

    expect(run.act).toBe(1);
    expect(run.map.length).toBeGreaterThanOrEqual(40);
    expect(start.x).toBe(50);
    expect(start.y).toBe(50);
    expect(bossNodes).toHaveLength(3);
    bossNodes.forEach((node) => expect(node.encounterId).toBeTruthy());
    expect(bossNodes.some((node) => node.y <= 8)).toBe(true);
    expect(bossNodes.some((node) => node.x <= 10)).toBe(true);
    expect(bossNodes.some((node) => node.x >= 90)).toBe(true);
    innerRing.forEach((node) => expect(start.neighbors).toContain(node.id));
    bossNodes.forEach((boss) => expect(outerRing.some((node) => node.neighbors.includes(boss.id))).toBe(true));
  });

  it("does not move to invisible, non-neighbor, or non-map targets", () => {
    const run = newRun(42);
    const invisible = run.map.find((node) => !node.visible)!;
    const blocked = moveToNode(run, invisible.id);
    expect(blocked).toBe(run);

    const next = { ...run, screen: "reward" as const };
    const start = next.map.find((node) => node.id === "start")!;
    const notMap = moveToNode(next, start.neighbors[0]);
    expect(notMap).toBe(next);
  });

  it("passes through completed nodes without starting a new encounter", () => {
    const run = newRun(42);
    const start = run.map.find((node) => node.id === "start")!;
    const target = run.map.find((node) => node.id === start.neighbors[0])!;
    target.completed = true;
    target.visible = true;

    const moved = moveToNode(run, target.id);

    expect(moved.currentNodeId).toBe(target.id);
    expect(moved.screen).toBe("map");
    expect(moved.combat).toBeUndefined();
    expect(moved.pendingReward).toBeUndefined();
  });
});

describe("threat scaling", () => {
  it("scales enemy health and damage from a single function", () => {
    const damageParams = new Set(["physicalDamage", "magicDamage"]);
    const base = enemies.find((enemy) => enemy.tier === "normal" && enemy.moves.some((move) => move.effects?.some((effect) => damageParams.has(effect.param) && effect.target === "player")))!;
    const scaled = scaleEnemy(base, 8);
    expect(scaled.maxHp).toBeGreaterThan(base.maxHp);
    expect(scaled.moves.some((move, index) => {
      const scaledDamage = move.effects?.find((effect) => damageParams.has(effect.param) && effect.target === "player")?.amount ?? 0;
      const baseDamage = base.moves[index].effects?.find((effect) => damageParams.has(effect.param) && effect.target === "player")?.amount ?? 0;
      return scaledDamage > baseDamage;
    })).toBe(true);
  });
});

describe("combat flow", () => {
  it("starts combat, plays a card, and preserves legal piles", () => {
    let run = newRun(12);
    const combatNode = run.map.find((node) => node.visible && node.type === "combat") ?? run.map.find((node) => node.id === run.map.find((item) => item.id === "start")!.neighbors[0])!;
    run = moveToNode(run, combatNode.id);
    if (run.screen !== "combat" || !run.combat) return;
    const playable = run.combat.hand.find((card) => card.cardId === "strike") ?? run.combat.hand[0];
    const beforeHand = run.combat.hand.length;
    run = playCard(run, playable.uid, run.combat.enemies[0].instanceId);
    if (run.screen === "combat" && run.combat) {
      expect(run.combat.hand.length).toBeLessThan(beforeHand);
      expect(run.player.energy).toBeLessThanOrEqual(run.player.maxEnergy);
    }
  });

  it("can progress enemy turn without losing save-compatible state shape", () => {
    let run = newRun(18);
    const start = run.map.find((node) => node.id === "start")!;
    run = moveToNode(run, start.neighbors[0]);
    if (run.screen !== "combat") return;
    run = endTurn(run);
    expect(["combat", "reward", "gameover"]).toContain(run.screen);
    expect(run.saveVersion).toBe(SAVE_VERSION);
  });

  it("draws the same next hand for the same seed and combat state", () => {
    const first = makeShuffleRun();
    const second = makeShuffleRun();

    const firstNext = endTurn(first);
    const secondNext = endTurn(second);

    expect(firstNext.combat?.hand.map((card) => card.uid)).toEqual(secondNext.combat?.hand.map((card) => card.uid));
    expect(firstNext.rngCounter).toBe(secondNext.rngCounter);
  });

  it("uses the boss encounter bound to the selected map node", () => {
    let run = newRun(33);
    const boss = run.map.find((node) => node.type === "boss")!;
    const feeder = run.map.find((node) => node.type !== "boss" && node.neighbors.includes(boss.id))!;
    run.currentNodeId = feeder.id;
    boss.visible = true;

    run = moveToNode(run, boss.id);

    expect(run.screen).toBe("combat");
    expect(run.combat?.enemies[0].definitionId).toBe(boss.encounterId);
  });

  it("advances to the next act after defeating a non-final boss", () => {
    let run = newRun(44);
    const boss = run.map.find((node) => node.type === "boss")!;
    const originalDeckSize = run.deck.length;
    const originalGold = run.player.gold;
    run.screen = "combat";
    run.currentNodeId = boss.id;
    run.threat = 9;
    run.movesTaken = 7;
    run.player.magicArmor = 5;
    run.combat = makeSingleHpCombat(boss.encounterId ?? "heart");

    run = playCard(run, "card-1", "enemy-1");

    expect(run.act).toBe(2);
    expect(run.screen).toBe("map");
    expect(run.currentNodeId).toBe("start");
    expect(run.map.find((node) => node.id === "start")).toMatchObject({ x: boss.x, y: boss.y });
    expect(run.deck).toHaveLength(originalDeckSize);
    expect(run.player.gold).toBe(originalGold);
    expect(run.threat).toBe(9);
    expect(run.movesTaken).toBe(7);
    expect(run.player.magicArmor).toBe(0);
    expect(run.pendingReward).toBeUndefined();
    expect(run.map.filter((node) => node.type === "boss")).toHaveLength(3);
    expect(run.map.find((node) => node.id === "start")?.neighbors.length).toBeGreaterThan(0);
  });

  it("wins the run after defeating an act 3 boss", () => {
    let run = newRun(45);
    const boss = run.map.find((node) => node.type === "boss")!;
    run.act = MAX_ACT;
    run.screen = "combat";
    run.currentNodeId = boss.id;
    run.combat = makeSingleHpCombat(boss.encounterId ?? "heart");

    run = playCard(run, "card-1", "enemy-1");

    expect(run.screen).toBe("gameover");
    expect(run.victory).toBe(true);
  });

  it("applies parameterized card effects across resources, statuses, cards, and run state", () => {
    let run = newRun(77);
    const pack = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    pack.cards.parameter_lab = {
      id: "parameter_lab",
      name: "Parameter Lab",
      type: "skill",
      rarity: "rare",
      cost: 0,
      description: "Exercise parameterized effects.",
      upgradedDescription: "Exercise parameterized effects.",
      effects: [
        { target: "player", param: "maxHp", op: "add", amount: 2 },
        { target: "player", param: "hp", op: "add", amount: 2 },
        { target: "player", param: "maxEnergy", op: "add", amount: 1 },
        { target: "player", param: "energy", op: "add", amount: 1 },
        { target: "player", param: "gold", op: "add", amount: 5 },
        { target: "player", param: "physicalArmor", op: "add", amount: 3 },
        { target: "player", param: "magicArmor", op: "add", amount: 2 },
        { target: "player", param: "statusAmount", op: "add", status: "strength", amount: 1 },
        { target: "player", param: "statusAmount", op: "add", status: "magic", amount: 1 },
        { target: "player", param: "cards", op: "move", amount: 1, fromZone: "drawPile", toZone: "hand" },
        { target: "player", param: "upgraded", op: "set", amount: 1, cardFilter: "notUpgraded" },
        { target: "player", param: "cost", op: "set", amount: 0, cardFilter: "upgraded" },
        { target: "player", param: "threat", op: "add", amount: 1 },
        { target: "player", param: "movesTaken", op: "add", amount: 1 },
        { target: "player", param: "turn", op: "add", amount: 1 }
      ],
      upgradedEffects: []
    };
    run.contentPack = pack;
    run.screen = "combat";
    run.combat = {
      enemies: [makeEnemy()],
      drawPile: [{ uid: "drawn-1", cardId: "guard", upgraded: false }],
      hand: [{ uid: "card-1", cardId: "parameter_lab", upgraded: false }],
      discardPile: [],
      exhaustPile: [],
      turn: 1,
      log: [],
      oncePerCombatKeys: []
    };
    run.player.hp = 60;
    const beforeGold = run.player.gold;

    run = playCard(run, "card-1", "enemy-1");

    expect(run.player.maxHp).toBe(74);
    expect(run.player.hp).toBe(64);
    expect(run.player.maxEnergy).toBe(4);
    expect(run.player.energy).toBe(4);
    expect(run.player.gold).toBe(beforeGold + 5);
    expect(run.player.physicalArmor).toBe(3);
    expect(run.player.magicArmor).toBe(2);
    expect(run.player.statuses).toContainEqual({ id: "strength", amount: 1 });
    expect(run.player.statuses).toContainEqual({ id: "magic", amount: 1 });
    expect(run.combat?.hand.some((card) => card.uid === "drawn-1")).toBe(true);
    expect(run.combat?.hand.find((card) => card.uid === "drawn-1")?.upgraded).toBe(true);
    expect(run.combat?.hand.find((card) => card.uid === "drawn-1")?.cost).toBe(0);
    expect(run.threat).toBe(1);
    expect(run.movesTaken).toBe(1);
    expect(run.combat?.turn).toBe(2);
  });

  it("chooses the same random enemy target for the same seed and action", () => {
    const effects: Effect[] = [{ target: "randomEnemy", param: "hp", op: "subtract", amount: 3 }];
    const first = makeCombatRun("test_random_enemy", effects);
    const second = makeCombatRun("test_random_enemy", effects);
    first.combat!.enemies = [makeEnemy({ instanceId: "enemy-1", hp: 30 }), makeEnemy({ instanceId: "enemy-2", hp: 30 })];
    second.combat!.enemies = [makeEnemy({ instanceId: "enemy-1", hp: 30 }), makeEnemy({ instanceId: "enemy-2", hp: 30 })];

    const firstNext = playCard(first, "card-1");
    const secondNext = playCard(second, "card-1");

    expect(firstNext.combat?.enemies.map((enemy) => enemy.hp)).toEqual(secondNext.combat?.enemies.map((enemy) => enemy.hp));
  });

  it("pauses for manual discard choices and completes the played card after selection", () => {
    let run = makeCombatRun("test_manual_discard", [{ target: "player", param: "cards", op: "move", amount: 1, fromZone: "hand", toZone: "discardPile", selection: "manual" }]);
    run.combat!.hand.push({ uid: "other-1", cardId: "guard", upgraded: false }, { uid: "other-2", cardId: "spark", upgraded: false });

    run = playCard(run, "card-1", "enemy-1");

    expect(run.combat?.pendingCardChoice?.sourceCard.uid).toBe("card-1");
    expect(run.combat?.hand.map((card) => card.uid)).toEqual(["other-1", "other-2"]);
    expect(run.combat?.discardPile).toHaveLength(0);

    run = completeCardChoice(run, ["other-2"]);

    expect(run.combat?.pendingCardChoice).toBeUndefined();
    expect(run.combat?.discardPile.map((card) => card.uid)).toEqual(["other-2", "card-1"]);
    expect(run.combat?.hand.map((card) => card.uid)).toEqual(["other-1"]);
  });

  it("auto-completes manual choices when no other hand cards are available", () => {
    let run = makeCombatRun("test_empty_manual_discard", [{ target: "player", param: "cards", op: "move", amount: 1, fromZone: "hand", toZone: "discardPile", selection: "manual" }]);

    run = playCard(run, "card-1", "enemy-1");

    expect(run.combat?.pendingCardChoice).toBeUndefined();
    expect(run.combat?.discardPile.map((card) => card.uid)).toEqual(["card-1"]);
  });

  it("saves and loads pending manual card choices", () => {
    let run = makeCombatRun("test_saved_manual_discard", [{ target: "player", param: "cards", op: "move", amount: 1, fromZone: "hand", toZone: "discardPile", selection: "manual" }]);
    run.combat!.hand.push({ uid: "other-1", cardId: "guard", upgraded: false });
    run = playCard(run, "card-1", "enemy-1");

    saveRun(run);
    const loaded = loadRun();

    expect(loaded?.combat?.pendingCardChoice?.sourceCard.uid).toBe("card-1");
    expect(loaded?.combat?.hand.map((card) => card.uid)).toEqual(["other-1"]);
  });

  it("applies ongoing powers for card cadence and repeated cards", () => {
    let cadence = makeDefaultCardRun(["snap_guard", "snap_guard", "snap_guard", "snap_guard", "snap_guard", "snap_guard"]);
    cadence.player.energy = 0;
    cadence.combat!.activePowers = [{ id: "rhythm_engine", cardId: "rhythm_engine", upgraded: false, counters: {} }];
    for (const card of [...cadence.combat!.hand]) cadence = playCard(cadence, card.uid, "enemy-1");
    expect(cadence.player.energy).toBe(1);

    let skillRepeat = makeDefaultCardRun(["guard"]);
    skillRepeat.combat!.activePowers = [{ id: "skill_echo", cardId: "skill_echo", upgraded: false, counters: {} }];
    skillRepeat = playCard(skillRepeat, "card-1", "enemy-1");
    expect(skillRepeat.player.physicalArmor).toBe(10);

    let attackRepeat = makeDefaultCardRun(["strike"]);
    attackRepeat.combat!.activePowers = [{ id: "assault_echo", cardId: "assault_echo", upgraded: false, counters: {} }];
    attackRepeat = playCard(attackRepeat, "card-1", "enemy-1");
    expect(attackRepeat.combat?.enemies[0].hp).toBe(18);
  });

  it("applies damage-count and magic-damage ongoing powers", () => {
    let magicRun = makeCombatRun("test_big_magic", [{ target: "selectedEnemy", param: "magicDamage", op: "subtract", amount: 50 }]);
    magicRun.combat!.enemies[0].hp = 100;
    magicRun.combat!.enemies[0].maxHp = 100;
    magicRun.combat!.drawPile = [{ uid: "draw-1", cardId: "guard", upgraded: false }, { uid: "draw-2", cardId: "spark", upgraded: false }, { uid: "draw-3", cardId: "ward", upgraded: false }];
    magicRun.combat!.activePowers = [{ id: "mana_cascade", cardId: "mana_cascade", upgraded: true, counters: {} }];
    const energyBefore = magicRun.player.energy;
    magicRun = playCard(magicRun, "card-1", "enemy-1");
    expect(magicRun.player.energy).toBe(energyBefore + 1);
    expect(magicRun.combat?.hand.map((card) => card.uid)).toContain("draw-3");

    let hitRun = makeDefaultCardRun(["twin_cut"]);
    hitRun.combat!.enemies[0].statuses = [{ id: "magic", amount: 3 }];
    hitRun.combat!.activePowers = [
      { id: "null_brand", cardId: "null_brand", upgraded: false, counters: {} },
      { id: "cruel_meter", cardId: "cruel_meter", upgraded: false, counters: {} }
    ];
    hitRun = playCard(hitRun, "card-1", "enemy-1");
    expect(hitRun.combat?.enemies[0].statuses).toContainEqual({ id: "magic", amount: 1 });
    expect(hitRun.combat?.enemies[0].statuses).toContainEqual({ id: "vulnerable", amount: 1 });
  });

  it("applies turn-end armor powers and dawn draw bonus", () => {
    let run = makeDefaultCardRun([]);
    run.combat!.drawPile = Array.from({ length: 6 }, (_, index) => ({ uid: `draw-${index}`, cardId: "guard", upgraded: false }));
    run.combat!.enemies[0].intent = { id: "wait", intent: "defend", label: "Wait", effects: [] };
    run.combat!.activePowers = [
      { id: "blue_habit", cardId: "blue_habit", upgraded: false, counters: {} },
      { id: "dawn_ledger", cardId: "dawn_ledger", upgraded: false, counters: {} }
    ];

    run = endTurn(run);

    expect(run.player.magicArmor).toBe(3);
    expect(run.combat?.hand).toHaveLength(6);
  });

  it("records combat log entries and keeps the log capped", () => {
    const effects: Effect[] = Array.from({ length: 45 }, () => ({ target: "player", param: "statusAmount", op: "add", status: "strength", amount: 1 }));
    const run = makeCombatRun("test_log_flood", effects);

    const next = playCard(run, "card-1", "enemy-1");

    expect(next.combat?.log.length).toBeLessThanOrEqual(40);
    expect(next.combat?.log[0]).toContain("打出");
    expect(next.combat?.log.some((line) => line.includes("力量"))).toBe(true);
  });
});

describe("physical and magic combat", () => {
  it("uses Strength for physical damage only and Magic for magic damage only", () => {
    let physicalRun = makeCombatRun("test_physical", [{ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 6 }], [{ id: "strength", amount: 2 }, { id: "magic", amount: 3 }]);
    physicalRun = playCard(physicalRun, "card-1", "enemy-1");
    expect(physicalRun.combat?.enemies[0].hp).toBe(22);

    let magicRun = makeCombatRun("test_magic", [{ target: "selectedEnemy", param: "magicDamage", op: "subtract", amount: 6 }], [{ id: "strength", amount: 2 }, { id: "magic", amount: 3 }]);
    magicRun = playCard(magicRun, "card-1", "enemy-1");
    expect(magicRun.combat?.enemies[0].hp).toBe(21);
  });

  it("uses Dexterity for physical armor only and Magic for magic armor only", () => {
    let physicalRun = makeCombatRun("test_physical_armor", [{ target: "player", param: "physicalArmor", op: "add", amount: 5 }], [{ id: "dexterity", amount: 2 }, { id: "magic", amount: 3 }]);
    physicalRun = playCard(physicalRun, "card-1", "enemy-1");
    expect(physicalRun.player.physicalArmor).toBe(7);

    let magicRun = makeCombatRun("test_magic_armor", [{ target: "player", param: "magicArmor", op: "add", amount: 5 }], [{ id: "dexterity", amount: 2 }, { id: "magic", amount: 3 }]);
    magicRun = playCard(magicRun, "card-1", "enemy-1");
    expect(magicRun.player.magicArmor).toBe(8);
  });

  it("keeps physical and magic armor in separate damage lanes", () => {
    let physicalBlocked = makeCombatRun("test_physical_blocked", [{ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 6 }]);
    physicalBlocked.combat!.enemies[0].physicalArmor = 4;
    physicalBlocked = playCard(physicalBlocked, "card-1", "enemy-1");
    expect(physicalBlocked.combat?.enemies[0].hp).toBe(28);
    expect(physicalBlocked.combat?.enemies[0].physicalArmor).toBe(0);

    let physicalIgnoresMagic = makeCombatRun("test_physical_ignores_magic", [{ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 6 }]);
    physicalIgnoresMagic.combat!.enemies[0].magicArmor = 4;
    physicalIgnoresMagic = playCard(physicalIgnoresMagic, "card-1", "enemy-1");
    expect(physicalIgnoresMagic.combat?.enemies[0].hp).toBe(24);
    expect(physicalIgnoresMagic.combat?.enemies[0].magicArmor).toBe(4);

    let magicBlocked = makeCombatRun("test_magic_blocked", [{ target: "selectedEnemy", param: "magicDamage", op: "subtract", amount: 6 }]);
    magicBlocked.combat!.enemies[0].magicArmor = 4;
    magicBlocked = playCard(magicBlocked, "card-1", "enemy-1");
    expect(magicBlocked.combat?.enemies[0].hp).toBe(28);
    expect(magicBlocked.combat?.enemies[0].magicArmor).toBe(0);

    let magicIgnoresPhysical = makeCombatRun("test_magic_ignores_physical", [{ target: "selectedEnemy", param: "magicDamage", op: "subtract", amount: 6 }]);
    magicIgnoresPhysical.combat!.enemies[0].physicalArmor = 4;
    magicIgnoresPhysical = playCard(magicIgnoresPhysical, "card-1", "enemy-1");
    expect(magicIgnoresPhysical.combat?.enemies[0].hp).toBe(24);
    expect(magicIgnoresPhysical.combat?.enemies[0].physicalArmor).toBe(4);
  });

  it("clears physical armor on turn change while magic armor remains", () => {
    let run = makeCombatRun("test_wait", []);
    run.player.physicalArmor = 5;
    run.player.magicArmor = 7;
    run.combat!.enemies[0].physicalArmor = 6;
    run.combat!.enemies[0].magicArmor = 8;

    run = endTurn(run);

    expect(run.screen).toBe("combat");
    expect(run.player.physicalArmor).toBe(0);
    expect(run.player.magicArmor).toBe(7);
    expect(run.combat?.enemies[0].physicalArmor).toBe(0);
    expect(run.combat?.enemies[0].magicArmor).toBe(8);
  });

  it("treats hp subtract as true HP loss that bypasses armor and damage stats", () => {
    let run = makeCombatRun("test_true_loss", [{ target: "player", param: "hp", op: "subtract", amount: 3 }], [{ id: "strength", amount: 5 }, { id: "magic", amount: 5 }]);
    run.player.physicalArmor = 10;
    run.player.magicArmor = 10;

    run = playCard(run, "card-1", "enemy-1");

    expect(run.player.hp).toBe(69);
    expect(run.player.physicalArmor).toBe(10);
    expect(run.player.magicArmor).toBe(10);
  });
});

describe("core rule details", () => {
  it("resolves poison and regen at the player's turn start", () => {
    let run = makeCombatRun("test_wait", []);
    run.player.hp = 50;
    run.player.statuses = [{ id: "poison", amount: 3 }, { id: "regen", amount: 2 }];
    run.combat!.enemies[0].intent = { id: "wait", intent: "defend", label: "Wait", effects: [] };

    run = endTurn(run);

    expect(run.player.hp).toBe(49);
    expect(run.player.statuses).toContainEqual({ id: "poison", amount: 2 });
    expect(run.player.statuses).toContainEqual({ id: "regen", amount: 1 });
  });

  it("resolves burn and intangible at the owner's turn end", () => {
    let run = makeCombatRun("test_wait", []);
    run.player.hp = 50;
    run.player.statuses = [{ id: "burn", amount: 4 }, { id: "intangible", amount: 1 }];
    run.combat!.enemies[0].intent = { id: "wait", intent: "defend", label: "Wait", effects: [] };

    run = endTurn(run);

    expect(run.player.hp).toBe(46);
    expect(run.player.statuses).toContainEqual({ id: "burn", amount: 3 });
    expect(run.player.statuses.some((status) => status.id === "intangible")).toBe(false);
  });

  it("uses bleed only after unblocked physical damage", () => {
    let physicalRun = makeCombatRun("test_bleed_physical", [{ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 6 }]);
    physicalRun.combat!.enemies[0].statuses = [{ id: "bleed", amount: 2 }];
    physicalRun = playCard(physicalRun, "card-1", "enemy-1");
    expect(physicalRun.combat?.enemies[0].hp).toBe(22);
    expect(physicalRun.combat?.enemies[0].statuses).toContainEqual({ id: "bleed", amount: 1 });

    let magicRun = makeCombatRun("test_bleed_magic", [{ target: "selectedEnemy", param: "magicDamage", op: "subtract", amount: 6 }]);
    magicRun.combat!.enemies[0].statuses = [{ id: "bleed", amount: 2 }];
    magicRun = playCard(magicRun, "card-1", "enemy-1");
    expect(magicRun.combat?.enemies[0].hp).toBe(24);
    expect(magicRun.combat?.enemies[0].statuses).toContainEqual({ id: "bleed", amount: 2 });
  });

  it("applies plated armor at turn start and reduces it after HP damage", () => {
    let run = makeCombatRun("test_plated_hit", [{ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 6 }]);
    run.combat!.enemies[0].statuses = [{ id: "platedArmor", amount: 2 }];
    run = playCard(run, "card-1", "enemy-1");
    expect(run.combat?.enemies[0].statuses).toContainEqual({ id: "platedArmor", amount: 1 });

    let turnRun = makeCombatRun("test_wait", []);
    turnRun.combat!.enemies[0].statuses = [{ id: "platedArmor", amount: 3 }];
    turnRun.combat!.enemies[0].intent = { id: "wait", intent: "defend", label: "Wait", effects: [] };
    turnRun = endTurn(turnRun);
    expect(turnRun.combat?.enemies[0].physicalArmor).toBe(3);
  });

  it("caps damage with intangible", () => {
    let run = makeCombatRun("test_intangible_damage", [{ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 12 }]);
    run.combat!.enemies[0].statuses = [{ id: "intangible", amount: 1 }];

    run = playCard(run, "card-1", "enemy-1");

    expect(run.combat?.enemies[0].hp).toBe(29);
  });

  it("lets artifact block negative statuses without firing statusApplied", () => {
    let run = makeCombatRun("test_artifact", [{ target: "player", param: "statusAmount", op: "add", status: "weak", amount: 2 }]);
    const pack = run.contentPack!;
    pack.characters[pack.defaultCharacterId].passives = [{ trigger: "statusApplied", effects: [{ target: "player", param: "gold", op: "add", amount: 5 }] }];
    run.player.statuses = [{ id: "artifact", amount: 1 }];
    const gold = run.player.gold;

    run = playCard(run, "card-1", "enemy-1");

    expect(run.player.statuses.some((status) => status.id === "weak")).toBe(false);
    expect(run.player.statuses.some((status) => status.id === "artifact")).toBe(false);
    expect(run.player.gold).toBe(gold);
  });

  it("exhausts ethereal cards and discards unplayable status and curse cards at turn end", () => {
    let run = makeCombatRun("test_wait", []);
    const pack = run.contentPack!;
    pack.cards.ghost = { ...pack.cards.guard, id: "ghost", name: "Ghost", ethereal: true };
    run.combat!.hand = [
      { uid: "ghost-1", cardId: "ghost", upgraded: false },
      { uid: "wound-1", cardId: "wound", upgraded: false },
      { uid: "curse-1", cardId: "curse", upgraded: false }
    ];
    run.combat!.drawPile = [
      { uid: "draw-1", cardId: "strike", upgraded: false },
      { uid: "draw-2", cardId: "strike", upgraded: false },
      { uid: "draw-3", cardId: "strike", upgraded: false },
      { uid: "draw-4", cardId: "strike", upgraded: false },
      { uid: "draw-5", cardId: "strike", upgraded: false }
    ];
    run.combat!.enemies[0].intent = { id: "wait", intent: "defend", label: "Wait", effects: [] };

    run = endTurn(run);

    expect(run.combat?.exhaustPile.some((card) => card.uid === "ghost-1")).toBe(true);
    expect(run.combat?.discardPile.some((card) => card.uid === "wound-1")).toBe(true);
    expect(run.combat?.discardPile.some((card) => card.uid === "curse-1")).toBe(true);
  });

  it("fires turnEnd, cardDrawn, enemyKilled, and statusApplied triggers", () => {
    let run = makeCombatRun("trigger_lab", [
      { target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 3 },
      { target: "player", param: "statusAmount", op: "add", status: "strength", amount: 1 },
      { target: "player", param: "cards", op: "move", amount: 1, fromZone: "drawPile", toZone: "hand" }
    ]);
    const pack = run.contentPack!;
    pack.characters[pack.defaultCharacterId].passives = [
      { trigger: "turnEnd", effects: [{ target: "player", param: "gold", op: "add", amount: 2 }] },
      { trigger: "cardDrawn", effects: [{ target: "player", param: "gold", op: "add", amount: 3 }] },
      { trigger: "enemyKilled", effects: [{ target: "player", param: "gold", op: "add", amount: 5 }] },
      { trigger: "statusApplied", effects: [{ target: "player", param: "gold", op: "add", amount: 7 }] }
    ];
    run.combat!.drawPile = [{ uid: "draw-1", cardId: "guard", upgraded: false }];
    run.combat!.enemies = [makeEnemy({ hp: 3 }), makeEnemy({ instanceId: "enemy-2", hp: 30 })];
    const gold = run.player.gold;

    run = playCard(run, "card-1", "enemy-1");
    expect(run.player.gold).toBe(gold + 15);

    run.combat!.enemies[0].intent = { id: "wait", intent: "defend", label: "Wait", effects: [] };
    run.contentPack!.characters[run.contentPack!.defaultCharacterId].passives = [{ trigger: "turnEnd", effects: [{ target: "player", param: "gold", op: "add", amount: 2 }] }];
    run = endTurn(run);
    expect(run.player.gold).toBe(gold + 17);
  });

  it("runs oncePerCombat passives only once per combat", () => {
    let run = makeCombatRun("once_lab", []);
    const pack = run.contentPack!;
    pack.characters[pack.defaultCharacterId].passives = [{ trigger: "cardPlayed", oncePerCombat: true, effects: [{ target: "player", param: "gold", op: "add", amount: 1 }] }];
    run.combat!.hand = [
      { uid: "card-1", cardId: "once_lab", upgraded: false },
      { uid: "card-2", cardId: "once_lab", upgraded: false }
    ];
    const gold = run.player.gold;

    run = playCard(run, "card-1", "enemy-1");
    run = playCard(run, "card-2", "enemy-1");

    expect(run.player.gold).toBe(gold + 1);
    expect(run.combat?.oncePerCombatKeys).toHaveLength(1);
  });
});

describe("saves", () => {
  it("returns undefined when no save exists", () => {
    expect(loadRun()).toBeUndefined();
  });

  it("round-trips saves with content, rng, and combat trigger state", () => {
    const run = makeCombatRun("test_wait", []);
    run.contentPack!.cards.strike.name = "Saved Strike";
    run.rngCounter = 11;
    run.combat!.oncePerCombatKeys = ["character:wanderer:cardPlayed:0"];

    saveRun(run);
    const loaded = loadRun();

    expect(loaded?.contentPack?.cards.strike.name).toBe("Saved Strike");
    expect(loaded?.rngCounter).toBe(11);
    expect(loaded?.combat?.oncePerCombatKeys).toEqual(["character:wanderer:cardPlayed:0"]);
  });

  it("returns undefined for unknown or damaged save data", () => {
    const run = newRun(3);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...run, saveVersion: 999 }));
    expect(loadRun()).toBeUndefined();

    localStorage.setItem(SAVE_KEY, "{bad json");
    expect(loadRun()).toBeUndefined();
  });

  it("clears saved runs", () => {
    saveRun(newRun(4));
    expect(loadRun()).toBeTruthy();
    clearSave();
    expect(loadRun()).toBeUndefined();
  });

  it("migrates v1 saves to the current act-aware shape", () => {
    const legacy = newRun(51);
    const raw = JSON.parse(JSON.stringify(legacy));
    raw.saveVersion = 1;
    delete raw.act;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));

    const loaded = loadRun();

    expect(loaded?.saveVersion).toBe(SAVE_VERSION);
    expect(loaded?.act).toBe(1);
    expect(loaded?.rngCounter).toBe(0);
    expect(loaded?.dungeon).toBeUndefined();
  });

  it("adds once-per-combat tracking to current saves with older combat objects", () => {
    const run = makeCombatRun("test_wait", []);
    const raw = JSON.parse(JSON.stringify(run));
    delete raw.combat.oncePerCombatKeys;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));

    const loaded = loadRun();

    expect(loaded?.saveVersion).toBe(SAVE_VERSION);
    expect(loaded?.combat?.oncePerCombatKeys).toEqual([]);
  });
});

describe("rewards", () => {
  it("adds a chosen reward card to the deck", () => {
    let run = newRun(5);
    run.screen = "reward";
    run.pendingReward = { type: "card", amount: 10, cards: [{ uid: "reward-1", cardId: "quick_cut", upgraded: false }] };
    const next = chooseRewardCard(run, "reward-1");
    expect(next.deck.some((card) => card.uid === "reward-1")).toBe(true);
    expect(next.screen).toBe("map");
  });

  it("skips card rewards without changing the deck", () => {
    const run = newRun(5);
    run.screen = "reward";
    run.pendingReward = { type: "card", amount: 10, cards: [{ uid: "reward-1", cardId: "quick_cut", upgraded: false }] };
    const deckSize = run.deck.length;

    const next = chooseRewardCard(run);

    expect(next.deck).toHaveLength(deckSize);
    expect(next.screen).toBe("map");
    expect(next.pendingReward).toBeUndefined();
  });
});

describe("events, campfires, shops, and treasure", () => {
  it("applies gain-gold-lose-HP event choices and completes the node", () => {
    const run = makeEventRun("gainGoldLoseHp");
    const hp = run.player.hp;
    const gold = run.player.gold;

    const next = applyEventChoice(run, "choice");

    expect(next.player.gold).toBe(gold + 45);
    expect(next.player.hp).toBe(hp - 8);
    expect(next.screen).toBe("map");
    expect(next.activeEvent).toBeUndefined();
    expect(next.map.find((node) => node.id === "current-node")?.completed).toBe(true);
  });

  it("applies heal-curse event choices with max HP cap", () => {
    const run = makeEventRun("healGainCurse");
    run.player.hp = run.player.maxHp - 5;

    const next = applyEventChoice(run, "choice");

    expect(next.player.hp).toBe(next.player.maxHp);
    expect(next.deck.some((card) => card.cardId === "curse")).toBe(true);
    expect(next.screen).toBe("map");
  });

  it("applies upgrade and skip event choices", () => {
    const upgradeRun = makeEventRun("upgradeRandom");
    const upgraded = applyEventChoice(upgradeRun, "choice");
    expect(upgraded.deck.some((card) => card.upgraded)).toBe(true);
    expect(upgraded.screen).toBe("map");

    const skipRun = makeEventRun("skip");
    const before = JSON.stringify(skipRun.deck);
    const skipped = applyEventChoice(skipRun, "choice");
    expect(JSON.stringify(skipped.deck)).toBe(before);
    expect(skipped.screen).toBe("map");
  });

  it("rests at campfire with HP cap and upgrades one card", () => {
    const healRun = makeScreenRun("campfire");
    healRun.player.hp = healRun.player.maxHp - 5;
    const healed = restAtCampfire(healRun, "heal");
    expect(healed.player.hp).toBe(healed.player.maxHp);
    expect(healed.screen).toBe("map");
    expect(healed.map.find((node) => node.id === "current-node")?.completed).toBe(true);

    const upgradeRun = makeScreenRun("campfire");
    const upgraded = restAtCampfire(upgradeRun, "upgrade");
    expect(upgraded.deck.some((card) => card.upgraded)).toBe(true);
  });

  it("buys cards and rejects unaffordable shop cards", () => {
    const run = makeShopRun();
    const offer = run.shopOffer![0];
    const gold = run.player.gold;

    const bought = buyFromShop(run, offer.uid);
    expect(bought.player.gold).toBe(gold - 55);
    expect(bought.deck.some((card) => card.uid === offer.uid)).toBe(true);
    expect(bought.shopOffer?.some((card) => card.uid === offer.uid)).toBe(false);

    const poor = makeShopRun();
    poor.player.gold = 0;
    const rejected = buyFromShop(poor, poor.shopOffer![0].uid);
    expect(rejected).toBe(poor);
  });

  it("uses shop services for healing, removing, and leaving", () => {
    const healRun = makeShopRun();
    healRun.player.hp = 40;
    const healed = shopService(healRun, "heal");
    expect(healed.player.hp).toBe(58);
    expect(healed.player.gold).toBe(healRun.player.gold - 35);
    expect(healed.screen).toBe("shop");

    const removeRun = makeShopRun();
    const deckSize = removeRun.deck.length;
    const removed = shopService(removeRun, "remove");
    expect(removed.deck).toHaveLength(deckSize - 1);
    expect(removed.player.gold).toBe(removeRun.player.gold - 75);

    const left = shopService(makeShopRun(), "leave");
    expect(left.screen).toBe("map");
    expect(left.shopOffer).toBeUndefined();
  });

  it("claims treasure and completes the node", () => {
    const run = makeScreenRun("treasure");
    run.pendingReward = { type: "gold", amount: 77 };
    const gold = run.player.gold;

    const next = claimTreasure(run);

    expect(next.player.gold).toBe(gold + 77);
    expect(next.screen).toBe("map");
    expect(next.pendingReward).toBeUndefined();
    expect(next.map.find((node) => node.id === "current-node")?.completed).toBe(true);
  });

  it("enters a dungeon from an event and preserves the main map return point", () => {
    const run = makeEventRun("enterDungeon");
    run.activeEvent!.choices[0].dungeonThreat = 4;
    const mainMap = JSON.parse(JSON.stringify(run.map));

    const next = applyEventChoice(run, "choice");

    expect(next.screen).toBe("map");
    expect(next.currentNodeId).toBe("dungeon-start");
    expect(next.dungeon?.returnNodeId).toBe("current-node");
    expect(next.dungeon?.returnMap).toEqual(mainMap);
    expect(next.dungeon?.threatIncrease).toBe(4);
    expect(next.map.some((node) => node.type === "exit")).toBe(true);
    expect(next.map.some((node) => node.id === "dungeon-boss")).toBe(true);
    expect(next.threat).toBe(run.threat);
  });

  it("does not raise threat for dungeon movement", () => {
    const run = applyEventChoice(makeEventRun("enterDungeon"), "choice");
    const start = run.map.find((node) => node.id === "dungeon-start")!;
    const threat = run.threat;

    const next = moveToNode(run, start.neighbors[0]);

    expect(next.threat).toBe(threat);
    expect(next.movesTaken).toBe(run.movesTaken + 1);
  });

  it("returns from a dungeon exit, completes the entry event, and applies the stored threat", () => {
    let run = makeEventRun("enterDungeon");
    run.activeEvent!.choices[0].dungeonThreat = 5;
    run = applyEventChoice(run, "choice");
    const exit = run.map.find((node) => node.type === "exit")!;
    const feeder = run.map.find((node) => node.neighbors.includes(exit.id) && node.id !== "dungeon-boss")!;
    run.currentNodeId = feeder.id;
    exit.visible = true;
    const threat = run.threat;

    const next = moveToNode(run, exit.id);

    expect(next.dungeon).toBeUndefined();
    expect(next.screen).toBe("map");
    expect(next.currentNodeId).toBe("current-node");
    expect(next.threat).toBe(threat + 5);
    expect(next.map.find((node) => node.id === "current-node")?.completed).toBe(true);
  });

  it("returns from a dungeon boss with card, gold, and relic rewards before completing the entry event", () => {
    let run = makeEventRun("enterDungeon");
    run.activeEvent!.choices[0].dungeonThreat = 3;
    run = applyEventChoice(run, "choice");
    const gold = run.player.gold;
    const threat = run.threat;
    run.screen = "combat";
    run.currentNodeId = "dungeon-boss";
    run.combat = makeSingleHpCombat(run.map.find((node) => node.id === "dungeon-boss")?.encounterId ?? "heart");

    run = playCard(run, "card-1", "enemy-1");

    expect(run.dungeon).toBeUndefined();
    expect(run.screen).toBe("reward");
    expect(run.currentNodeId).toBe("current-node");
    expect(run.threat).toBe(threat + 3);
    expect(run.pendingReward?.source).toBe("dungeonBoss");
    expect(run.pendingReward?.cards).toHaveLength(3);
    expect(run.pendingReward?.relicId).toBeTruthy();
    expect(run.player.gold).toBeGreaterThan(gold);
    expect(run.map.find((node) => node.id === "current-node")?.completed).toBe(false);

    const relicId = run.pendingReward?.relicId!;
    const completed = chooseRewardCard(run);

    expect(completed.screen).toBe("map");
    expect(completed.relics).toContain(relicId);
    expect(completed.map.find((node) => node.id === "current-node")?.completed).toBe(true);
  });

  it("saves and loads an active dungeon context", () => {
    const run = applyEventChoice(makeEventRun("enterDungeon"), "choice");

    saveRun(run);
    const loaded = loadRun();

    expect(loaded?.saveVersion).toBe(SAVE_VERSION);
    expect(loaded?.currentNodeId).toBe("dungeon-start");
    expect(loaded?.dungeon?.returnNodeId).toBe("current-node");
    expect(loaded?.map.some((node) => node.type === "exit")).toBe(true);
  });
});

describe("content packs", () => {
  it("accepts the default content pack", () => {
    expect(validateContentPack(defaultContentPack).valid).toBe(true);
  });

  it("contains the planned expansion card counts and manual choice cards", () => {
    const expansionCards = expansionCardIds.map((id) => defaultContentPack.cards[id]);
    expect(expansionCards.every(Boolean)).toBe(true);
    expect(expansionCards).toHaveLength(90);
    expect(expansionCards.filter((card) => card.rarity === "common")).toHaveLength(40);
    expect(expansionCards.filter((card) => card.rarity === "uncommon")).toHaveLength(30);
    expect(expansionCards.filter((card) => card.rarity === "rare")).toHaveLength(20);
    expect(expansionCards.filter((card) => card.cost === 4)).toHaveLength(5);
    expect(expansionCards.filter((card) => [...card.effects, ...card.upgradedEffects].some((effect) => effect.selection === "manual"))).toHaveLength(14);
  });

  it("loads default content without a draft and falls back from invalid draft data", () => {
    expect(loadContentPack().cards.strike.name).toBe(defaultContentPack.cards.strike.name);

    localStorage.setItem(CONTENT_DRAFT_KEY, "{bad json");
    expect(loadContentPack().cards.strike.name).toBe(defaultContentPack.cards.strike.name);

    const invalid = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    invalid.defaultCharacterId = "missing";
    localStorage.setItem(CONTENT_DRAFT_KEY, JSON.stringify(invalid));
    expect(loadContentPack().defaultCharacterId).toBe(defaultContentPack.defaultCharacterId);
  });

  it("loads valid content drafts and clears them", () => {
    const draft = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    draft.cards.strike.name = "Loaded Draft Strike";
    saveContentDraft(draft);
    expect(loadContentPack().cards.strike.name).toBe("Loaded Draft Strike");

    clearContentDraft();
    expect(loadContentPack().cards.strike.name).toBe(defaultContentPack.cards.strike.name);
  });

  it("rejects invalid ids, invalid effects, empty moves, and bad numbers", () => {
    const invalid = {
      cards: {
        "Bad Id": { ...defaultContentPack.cards.strike, id: "Bad Id", cost: -1, effects: [{ type: "missing", amount: 1 }] }
      },
      enemies: [{ ...defaultContentPack.enemies[0], maxHp: 0, moves: [] }],
      relics: {
        bad: { ...defaultContentPack.relics.cracked_core, id: "bad", effects: [{ type: "applyStatus", amount: 1 }] }
      },
      characters: defaultContentPack.characters,
      defaultCharacterId: defaultContentPack.defaultCharacterId
    };
    const result = validateContentPack(invalid as unknown as typeof defaultContentPack);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });

  it("rejects duplicated enemy ids, invalid default characters, and missing references", () => {
    const invalid = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    invalid.enemies.push({ ...invalid.enemies[0] });
    invalid.defaultCharacterId = "missing_character";
    invalid.characters.wanderer.starterDeck.push("missing_card");
    invalid.characters.wanderer.starterRelics.push("missing_relic");

    const result = validateContentPack(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`Enemy ${invalid.enemies[0].id} id is duplicated.`);
    expect(result.errors).toContain("Default character must reference a valid character.");
    expect(result.errors).toContain("Character wanderer starter deck references missing card missing_card.");
    expect(result.errors).toContain("Character wanderer starter relics reference missing relic missing_relic.");
  });

  it("rejects missing parameterized effect fields", () => {
    const invalid = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    invalid.cards.strike.effects = [{ target: "selectedEnemy", param: "statusAmount", op: "add", amount: 1 } as never];
    invalid.cards.guard.effects = [{ target: "player", param: "cards", op: "move", amount: 1 } as never];
    const result = validateContentPack(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("valid status"))).toBe(true);
    expect(result.errors.some((error) => error.includes("fromZone"))).toBe(true);
  });

  it("migrates legacy effect schemas into parameter operations", () => {
    const legacy = JSON.parse(JSON.stringify(defaultContentPack)) as Partial<typeof defaultContentPack>;
    legacy.cards!.strike.effects = [{ type: "damage", amount: 6 } as never];
    legacy.cards!.guard.effects = [{ type: "block", amount: 5 } as never];
    legacy.cards!.dark_pact.effects = [{ target: "player", param: "hp", op: "subtract", amount: 3 } as never];
    legacy.enemies![0].moves[0].effects = [{ type: "applyWeak", amount: 1 } as never];
    legacy.relics!.cracked_core.effects = [{ type: "gainStrength", amount: 1 } as never];
    const migrated = normalizeContentPack(legacy);
    expect(migrated.cards.strike.effects[0]).toMatchObject({ target: "selectedEnemy", param: "physicalDamage", op: "subtract", amount: 6 });
    expect(migrated.cards.guard.effects[0]).toMatchObject({ target: "player", param: "physicalArmor", op: "add", amount: 5 });
    expect(migrated.cards.dark_pact.effects[0]).toMatchObject({ target: "player", param: "hp", op: "subtract", amount: 3 });
    expect(migrated.enemies[0]!.moves[0]!.effects![0]).toMatchObject({ target: "player", param: "statusAmount", status: "weak" });
    expect(migrated.relics.cracked_core.effects[0]).toMatchObject({ target: "player", param: "statusAmount", status: "strength" });
    expect(validateContentPack(migrated).valid).toBe(true);
  });

  it("requires card and relic keys to match edited ids", () => {
    const invalid = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    invalid.cards.strike.id = "edited_strike";
    invalid.relics.cracked_core.id = "edited_core";
    const result = validateContentPack(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Card strike key must match id.");
    expect(result.errors).toContain("Relic cracked_core key must match id.");
  });

  it("uses a saved valid draft for new runs", () => {
    localStorage.removeItem(CONTENT_DRAFT_KEY);
    const draft = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    draft.cards.strike.name = "Draft Strike";
    saveContentDraft(draft);
    const run = newRun(99);
    expect(run.contentPack?.cards.strike.name).toBe("Draft Strike");
    localStorage.removeItem(CONTENT_DRAFT_KEY);
  });
});

describe("relics", () => {
  it("applies combat start relic effects", () => {
    const run = newRun(21);
    run.relics = ["pocket_lantern", "cracked_core"];
    run.combat = startCombat(run, "combat");
    expect(run.player.energy).toBeGreaterThanOrEqual(4);
    expect(run.player.statuses.some((status) => status.id === "strength" && status.amount >= 1)).toBe(true);
  });

  it("applies combat won relic effects", () => {
    let run = newRun(22);
    run.relics = ["red_ledger", "marrow_cup"];
    run.screen = "combat";
    run.currentNodeId = run.map.find((node) => node.type !== "boss")?.id ?? "start";
    run.combat = {
      enemies: [makeEnemy({ maxHp: 1, hp: 1 })],
      drawPile: [],
      hand: [{ uid: "card-1", cardId: "strike", upgraded: false }],
      discardPile: [],
      exhaustPile: [],
      turn: 1,
      log: [],
      oncePerCombatKeys: []
    };
    run.player.hp = 50;
    const gold = run.player.gold;
    run = playCard(run, "card-1", "enemy-1");
    expect(run.screen).toBe("reward");
    expect(run.player.gold).toBeGreaterThan(gold + 7);
    expect(run.player.hp).toBe(53);
  });
});

function makeSingleHpCombat(definitionId: string) {
  return {
    enemies: [makeEnemy({ definitionId, name: "Test Boss", maxHp: 1, hp: 1 })],
    drawPile: [],
    hand: [{ uid: "card-1", cardId: "strike", upgraded: false }],
    discardPile: [],
    exhaustPile: [],
    turn: 1,
    log: [],
    oncePerCombatKeys: []
  };
}

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    instanceId: "enemy-1",
    definitionId: "hollow",
    name: "Test",
    maxHp: 30,
    hp: 30,
    physicalArmor: 0,
    magicArmor: 0,
    statuses: [],
    moveIndex: 0,
    intent: { id: "wait", intent: "defend", label: "Wait" },
    ...overrides
  };
}

function makeScreenRun(screen: RunState["screen"]): RunState {
  const run = newRun(202);
  run.screen = screen;
  run.currentNodeId = "current-node";
  run.map = [
    { id: "start", type: "start", x: 50, y: 50, neighbors: ["current-node"], completed: true, visible: true },
    { id: "current-node", type: screen === "treasure" ? "treasure" : screen === "shop" ? "shop" : screen === "campfire" ? "campfire" : "event", x: 60, y: 50, neighbors: ["start"], completed: false, visible: true }
  ];
  return run;
}

function makeEventRun(effect: EventChoice["effect"]): RunState {
  const run = makeScreenRun("event");
  run.activeEvent = {
    id: "test-event",
    title: "Test Event",
    body: "Test body.",
    choices: [{ id: "choice", label: "Choice", description: "Choice result.", effect }]
  };
  return run;
}

function makeShopRun(): RunState {
  const run = makeScreenRun("shop");
  run.player.gold = 120;
  run.shopOffer = [
    { uid: "shop-1", cardId: "quick_cut", upgraded: false },
    { uid: "shop-2", cardId: "arcane_bolt", upgraded: false }
  ];
  return run;
}

function makeShuffleRun(): RunState {
  const run = makeCombatRun("test_wait", []);
  run.seed = 2026;
  run.act = 1;
  run.movesTaken = 4;
  run.rngCounter = 0;
  run.combat!.drawPile = [];
  run.combat!.hand = [];
  run.combat!.discardPile = [
    { uid: "shuffle-1", cardId: "strike", upgraded: false },
    { uid: "shuffle-2", cardId: "guard", upgraded: false },
    { uid: "shuffle-3", cardId: "spark", upgraded: false },
    { uid: "shuffle-4", cardId: "ward", upgraded: false },
    { uid: "shuffle-5", cardId: "quick_cut", upgraded: false }
  ];
  run.combat!.enemies = [makeEnemy({ intent: { id: "wait", intent: "defend", label: "Wait", effects: [] } })];
  return run;
}

function makeDefaultCardRun(cardIds: string[]): RunState {
  const run = newRun(303);
  run.screen = "combat";
  run.contentPack = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
  run.combat = {
    enemies: [makeEnemy()],
    drawPile: [],
    hand: cardIds.map((cardId, index) => ({ uid: `card-${index + 1}`, cardId, upgraded: false })),
    discardPile: [],
    exhaustPile: [],
    turn: 1,
    log: [],
    oncePerCombatKeys: [],
    activePowers: []
  };
  run.player.energy = run.player.maxEnergy;
  return run;
}

function makeCombatRun(cardId: string, effects: Effect[], statuses: StatusEffect[] = []): RunState {
  const run = newRun(101);
  const pack = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
  pack.cards[cardId] = {
    id: cardId,
    name: "Test Card",
    type: "skill",
    rarity: "rare",
    cost: 0,
    description: "Test card.",
    upgradedDescription: "Test card.",
    effects,
    upgradedEffects: effects
  };
  run.contentPack = pack;
  run.screen = "combat";
  run.combat = {
    enemies: [makeEnemy()],
    drawPile: [],
    hand: [{ uid: "card-1", cardId, upgraded: false }],
    discardPile: [],
    exhaustPile: [],
    turn: 1,
    log: [],
    oncePerCombatKeys: []
  };
  run.player.statuses = statuses.map((status) => ({ ...status }));
  run.player.energy = run.player.maxEnergy;
  return run;
}
