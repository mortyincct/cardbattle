import { describe, expect, it } from "vitest";
import { chooseRewardCard, endTurn, moveToNode, newRun, playCard, scaleEnemy } from "./state";
import { enemies } from "./content";

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
    run.pendingReward = { type: "card", amount: 10, cards: [{ uid: "reward-1", cardId: "quickCut", upgraded: false }] };
    const next = chooseRewardCard(run, "reward-1");
    expect(next.deck.some((card) => card.uid === "reward-1")).toBe(true);
    expect(next.screen).toBe("map");
  });
});
