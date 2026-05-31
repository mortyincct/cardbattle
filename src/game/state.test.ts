import { beforeEach, describe, expect, it } from "vitest";
import { chooseRewardCard, endTurn, loadRun, MAX_ACT, moveToNode, newRun, playCard, SAVE_KEY, SAVE_VERSION, scaleEnemy, startCombat } from "./state";
import { CONTENT_DRAFT_KEY, defaultContentPack, enemies, normalizeContentPack, saveContentDraft, validateContentPack } from "./content";
import type { Effect, EnemyState, RunState, StatusEffect } from "./types";

beforeEach(() => {
  localStorage.removeItem(CONTENT_DRAFT_KEY);
  localStorage.removeItem(SAVE_KEY);
});

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
    expect(run.deck).toHaveLength(originalDeckSize);
    expect(run.player.gold).toBe(originalGold);
    expect(run.threat).toBe(9);
    expect(run.movesTaken).toBe(7);
    expect(run.player.magicArmor).toBe(0);
    expect(run.map.filter((node) => node.type === "boss")).toHaveLength(3);
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
      log: []
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

describe("saves", () => {
  it("migrates v1 saves to the current act-aware shape", () => {
    const legacy = newRun(51);
    const raw = JSON.parse(JSON.stringify(legacy));
    raw.saveVersion = 1;
    delete raw.act;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));

    const loaded = loadRun();

    expect(loaded?.saveVersion).toBe(SAVE_VERSION);
    expect(loaded?.act).toBe(1);
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
});

describe("content packs", () => {
  it("accepts the default content pack", () => {
    expect(validateContentPack(defaultContentPack).valid).toBe(true);
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
      log: []
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
    log: []
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
    log: []
  };
  run.player.statuses = statuses.map((status) => ({ ...status }));
  run.player.energy = run.player.maxEnergy;
  return run;
}
