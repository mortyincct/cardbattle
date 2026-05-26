import { beforeEach, describe, expect, it } from "vitest";
import { chooseRewardCard, endTurn, loadRun, moveToNode, newRun, playCard, resolveEffects, SAVE_KEY, scaleEnemy, startCombat } from "./state";
import { CONTENT_DRAFT_KEY, defaultContentPack, enemies, loadContentPack, saveContentDraft, validateContentPack } from "./content";
import { upgradeContentPack } from "./effects";

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
});

describe("threat scaling", () => {
  it("scales enemy health and damage from a single function", () => {
    const base = enemies.find((enemy) => enemy.tier === "normal" && enemy.moves.some((move) => move.damage))!;
    const scaled = scaleEnemy(base, 8);
    expect(scaled.maxHp).toBeGreaterThan(base.maxHp);
    expect(scaled.moves.some((move, index) => (move.damage ?? 0) > (base.moves[index].damage ?? 0))).toBe(true);
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
    expect(run.saveVersion).toBe(1);
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
      }
    };
    const result = validateContentPack(invalid as typeof defaultContentPack);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
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
    const draft = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    draft.cards.strike.name = "Draft Strike";
    saveContentDraft(draft);
    const run = newRun(99);
    expect(run.contentPack?.cards.strike.name).toBe("Draft Strike");
  });

  it("upgrades old card, enemy, and relic effects to the unified schema", () => {
    const oldPack = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    oldPack.cards.strike.effects = [{ type: "applyWeak", amount: 2 }] as never;
    oldPack.enemies[0].moves[0].effects = [{ type: "strength", amount: 3 }] as never;
    oldPack.relics.cracked_core.effects = [{ type: "gainStrength", amount: 1 }] as never;
    const upgraded = upgradeContentPack(oldPack);
    expect(upgraded.cards.strike.effects[0]).toMatchObject({ type: "applyStatus", status: "weak", target: "selectedEnemy" });
    expect(upgraded.enemies[0].moves[0].effects?.[0]).toMatchObject({ type: "gainStatus", status: "strength", target: "source" });
    expect(upgraded.relics.cracked_core.effects[0]).toMatchObject({ type: "gainStatus", status: "strength", target: "player" });
    expect(validateContentPack(upgraded).valid).toBe(true);
  });

  it("loads old browser drafts through migration before validation", () => {
    const draft = JSON.parse(JSON.stringify(defaultContentPack)) as typeof defaultContentPack;
    draft.cards.strike.effects = [{ type: "applyPoison", amount: 4 }] as never;
    localStorage.setItem(CONTENT_DRAFT_KEY, JSON.stringify(draft));
    const loaded = loadContentPack();
    expect(loaded.cards.strike.effects[0]).toMatchObject({ type: "applyStatus", status: "poison", target: "selectedEnemy" });
  });

  it("ignores malformed and incomplete saved runs", () => {
    localStorage.setItem(SAVE_KEY, "{not json");
    expect(loadRun()).toBeUndefined();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();

    localStorage.setItem(SAVE_KEY, JSON.stringify({ saveVersion: 1, screen: "map" }));
    expect(loadRun()).toBeUndefined();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it("falls back to default content when a saved run has a bad content pack", () => {
    const run = newRun(101);
    run.contentPack = { ...defaultContentPack, cards: {} };
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    const loaded = loadRun();
    expect(loaded?.contentPack?.cards.strike.name).toBe(defaultContentPack.cards.strike.name);
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
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
      enemies: [{ instanceId: "enemy-1", definitionId: "hollow", name: "Test", maxHp: 1, hp: 1, block: 0, statuses: [], moveIndex: 0, intent: { id: "wait", intent: "defend", label: "Wait" } }],
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

describe("unified effects", () => {
  it("resolves multi-hit, all-enemy damage, block, draw, energy, healing, and gold", () => {
    const run = newRun(31);
    run.screen = "combat";
    run.player.hp = 50;
    run.combat = {
      enemies: [
        { instanceId: "enemy-1", definitionId: "hollow", name: "One", maxHp: 30, hp: 30, block: 0, statuses: [], moveIndex: 0, intent: { id: "wait", intent: "defend", label: "Wait" } },
        { instanceId: "enemy-2", definitionId: "hollow", name: "Two", maxHp: 30, hp: 30, block: 0, statuses: [], moveIndex: 0, intent: { id: "wait", intent: "defend", label: "Wait" } }
      ],
      drawPile: [{ uid: "draw-1", cardId: "guard", upgraded: false }],
      hand: [],
      discardPile: [],
      exhaustPile: [],
      turn: 1,
      log: []
    };
    resolveEffects(run, [
      { type: "damage", amount: 3, hits: 2, target: "selectedEnemy" },
      { type: "damage", amount: 4, target: "allEnemies" },
      { type: "block", amount: 5, target: "player" },
      { type: "draw", amount: 1 },
      { type: "gainEnergy", amount: 1 },
      { type: "heal", amount: 2 },
      { type: "gainGold", amount: 7 }
    ], { source: "card", selectedEnemy: run.combat.enemies[0] });
    expect(run.combat.enemies[0].hp).toBe(20);
    expect(run.combat.enemies[1].hp).toBe(26);
    expect(run.player.block).toBe(5);
    expect(run.combat.hand).toHaveLength(1);
    expect(run.player.energy).toBe(4);
    expect(run.player.hp).toBe(52);
    expect(run.player.gold).toBe(67);
  });

  it("lets enemy effects damage the player and buff or block the acting enemy", () => {
    const run = newRun(32);
    run.screen = "combat";
    run.combat = {
      enemies: [{ instanceId: "enemy-1", definitionId: "hollow", name: "Caster", maxHp: 30, hp: 30, block: 0, statuses: [], moveIndex: 0, intent: { id: "hex", intent: "mixed", label: "Hex", effects: [{ type: "damage", amount: 5, target: "player" }, { type: "applyStatus", amount: 2, status: "weak", target: "player" }, { type: "gainStatus", amount: 3, status: "strength", target: "source" }, { type: "block", amount: 4, target: "source" }] } }],
      drawPile: [],
      hand: [],
      discardPile: [],
      exhaustPile: [],
      turn: 1,
      log: []
    };
    resolveEffects(run, run.combat.enemies[0].intent.effects ?? [], { source: "enemy", sourceEnemy: run.combat.enemies[0] });
    expect(run.player.hp).toBeLessThan(72);
    expect(run.player.statuses.some((status) => status.id === "weak")).toBe(true);
    expect(run.combat.enemies[0].statuses.some((status) => status.id === "strength" && status.amount === 3)).toBe(true);
    expect(run.combat.enemies[0].block).toBe(4);
  });
});
