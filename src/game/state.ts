import { cards, enemies, loadContentPack, normalizeContentPack } from "./content";
import { mulberry32, pick, shuffle, uid } from "./rng";
import type { ActivePower, CardDefinition, CardFilter, CardInstance, CardZone, CombatState, ContentPack, Effect, EffectParam, EffectTarget, EnemyDefinition, EnemyMove, EnemyState, EventAction, GameEvent, MapNode, NodeType, RelicTrigger, Reward, RunState, StatusEffect } from "./types";

export const SAVE_KEY = "netspire-save";
export const SAVE_VERSION = 7;
export const MAX_ACT = 3;
const BOSS_NODE_COUNT = 3;
const DUNGEON_DEFAULT_THREAT = 2;
const DEFAULT_START_POSITION = { x: 50, y: 50 };
type MapPosition = Pick<MapNode, "x" | "y">;

export function makeCard(cardId: string, upgraded = false): CardInstance {
  return { uid: uid("card"), cardId, upgraded };
}

export function cardDef(card: CardInstance): CardDefinition {
  return loadContentPack().cards[card.cardId] ?? cards[card.cardId];
}

export function cardDefFrom(card: CardInstance, pack: ContentPack): CardDefinition {
  return pack.cards[card.cardId] ?? cards[card.cardId];
}

export function cardCostFrom(card: CardInstance, pack: ContentPack): number {
  const def = cardDefFrom(card, pack);
  return card.cost ?? (card.upgraded && def.upgradedCost !== undefined ? def.upgradedCost : def.cost);
}

export function newRun(seed = Date.now()): RunState {
  const contentPack = loadContentPack();
  const character = contentPack.characters[contentPack.defaultCharacterId];
  const random = mulberry32(seed + 1 * 1009);
  const deck = character.starterDeck.map((id) => makeCard(id));
  const map = generateMap(random, 1, contentPack);
  const run: RunState = {
    saveVersion: SAVE_VERSION,
    seed,
    act: 1,
    screen: "map",
    contentPack,
    characterId: character.id,
    player: { maxHp: character.maxHp, hp: character.maxHp, physicalArmor: 0, magicArmor: 0, energy: character.maxEnergy, maxEnergy: character.maxEnergy, gold: character.gold, statuses: [] },
    relics: character.starterRelics.filter((id) => contentPack.relics[id]),
    deck,
    map,
    currentNodeId: "start",
    threat: 0,
    movesTaken: 0,
    rngCounter: 0,
    message: "织网展开。选择一个相邻节点。",
    victory: false
  };
  applyTriggeredEffects(run, "runStart", { source: "character", sourceOwner: run.player });
  return run;
}

export function saveRun(run: RunState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(run));
}

export function loadRun(): RunState | undefined {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as RunState;
    if (parsed.saveVersion === SAVE_VERSION) return normalizeLoadedRun(parsed);
    if (parsed.saveVersion >= 1 && parsed.saveVersion < SAVE_VERSION) return migrateLegacyRun(parsed);
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeLoadedRun(run: RunState): RunState {
  return {
    ...run,
    rngCounter: run.rngCounter ?? 0,
    contentPack: run.contentPack ? normalizeContentPack(run.contentPack) : undefined,
    combat: run.combat ? normalizeCombat(run.combat) : undefined,
    dungeon: run.dungeon,
    eventCombat: run.eventCombat
  };
}

function normalizeCombat(combat: CombatState): CombatState {
  return { ...combat, oncePerCombatKeys: combat.oncePerCombatKeys ?? [], activePowers: combat.activePowers ?? [] };
}

function ensureCombatShape(combat: CombatState): CombatState {
  combat.oncePerCombatKeys ??= [];
  combat.activePowers ??= [];
  return combat;
}

function migrateLegacyRun(run: RunState): RunState {
  const act = run.act ?? 1;
  const pack = normalizeContentPack(run.contentPack ?? loadContentPack());
  const legacyPlayer = run.player as RunState["player"] & { block?: number; physicalArmor?: number; magicArmor?: number };
  return {
    ...run,
    saveVersion: SAVE_VERSION,
    act,
    contentPack: pack,
    characterId: run.characterId ?? pack.defaultCharacterId,
    player: {
      ...run.player,
      physicalArmor: legacyPlayer.physicalArmor ?? legacyPlayer.block ?? 0,
      magicArmor: legacyPlayer.magicArmor ?? 0
    },
    screen: "map",
    currentNodeId: "start",
    combat: undefined,
    pendingReward: undefined,
    activeEvent: undefined,
    shopOffer: undefined,
    dungeon: undefined,
    eventCombat: undefined,
    map: generateMap(mulberry32(run.seed + act * 1009), act, pack),
    rngCounter: run.rngCounter ?? 0,
    message: `第 ${act} 幕开始。选择新的路线。`
  };
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function generateMap(random: () => number, act = 1, pack: ContentPack = loadContentPack(), startPosition: MapPosition = DEFAULT_START_POSITION): MapNode[] {
  const start = { x: clamp(startPosition.x, 6, 94), y: clamp(startPosition.y, 6, 94) };
  const nodes: MapNode[] = [{ id: "start", type: "start", x: start.x, y: start.y, neighbors: [], completed: true, visible: true }];
  const rings: { count: number; radius: number; variants: NodeType[] }[] = [
    { count: 8, radius: 17, variants: ["combat", "combat", "event", "treasure"] },
    { count: 12, radius: 30, variants: ["combat", "event", "elite", "shop", "treasure", "combat"] },
    { count: 16, radius: 42, variants: ["combat", "elite", "campfire", "shop", "event", "treasure", "combat", "elite"] }
  ];
  rings.forEach((ring, ringIndex) => {
    const angleOffset = -Math.PI / 2 + ringIndex * 0.11 + (random() - 0.5) * 0.08;
    for (let i = 0; i < ring.count; i += 1) {
      const angle = angleOffset + (Math.PI * 2 * i) / ring.count + (random() - 0.5) * 0.08;
      nodes.push({
        id: `ring${ringIndex}-${i}`,
        type: pick(ring.variants, random),
        x: clamp(start.x + Math.cos(angle) * ring.radius + (random() - 0.5) * 2.4, 6, 94),
        y: clamp(start.y + Math.sin(angle) * ring.radius + (random() - 0.5) * 2.4, 6, 94),
        neighbors: [],
        completed: false,
        visible: ringIndex === 0
      });
    }
  });
  const bossPool = pack.enemies.filter((enemy) => enemy.tier === "boss");
  const bossOffset = bossPool.length ? Math.floor(random() * bossPool.length) : 0;
  const bossPositions = bossPositionsForStart(start);
  const bossNodes = Array.from({ length: BOSS_NODE_COUNT }, (_, index) => {
    const encounter = bossPool.length ? bossPool[(bossOffset + index) % bossPool.length] : undefined;
    return {
      id: `boss-${index}`,
      type: "boss" as const,
      encounterId: encounter?.id,
      x: bossPositions[index].x,
      y: bossPositions[index].y,
      neighbors: [],
      completed: false,
      visible: false
    };
  });
  nodes.push(...bossNodes);

  const connect = (a: string, b: string) => {
    const left = nodes.find((node) => node.id === a)!;
    const right = nodes.find((node) => node.id === b)!;
    if (!left.neighbors.includes(b)) left.neighbors.push(b);
    if (!right.neighbors.includes(a)) right.neighbors.push(a);
  };
  rings.forEach((_, ringIndex) => {
    const ringNodes = nodes.filter((node) => node.id.startsWith(`ring${ringIndex}-`));
    ringNodes.forEach((node, i) => {
      connect(node.id, ringNodes[(i + 1) % ringNodes.length].id);
      if (ringIndex === 0) connect("start", node.id);
      const outerRing = nodes.filter((candidate) => candidate.id.startsWith(`ring${ringIndex + 1}-`));
      if (outerRing.length) {
        const mapped = Math.round((i / ringNodes.length) * outerRing.length) % outerRing.length;
        connect(node.id, outerRing[mapped].id);
        connect(node.id, outerRing[(mapped + 1) % outerRing.length].id);
      } else {
        const orderedBosses = [...bossNodes].sort((a, b) => distance(node, a) - distance(node, b));
        connect(node.id, orderedBosses[0].id);
        if (distance(node, orderedBosses[1]) < 32) connect(node.id, orderedBosses[1].id);
      }
    });
  });
  return nodes;
}

function generateDungeonMap(random: () => number, pack: ContentPack): MapNode[] {
  const bossPool = pack.enemies.filter((enemy) => enemy.tier === "boss");
  const boss = bossPool.length ? pick(bossPool, random) : undefined;
  const nodes: MapNode[] = [
    { id: "dungeon-start", type: "start", x: 50, y: 88, neighbors: [], completed: true, visible: true },
    { id: "dungeon-0", type: "combat", x: 32, y: 64, neighbors: [], completed: false, visible: true },
    { id: "dungeon-1", type: random() > 0.5 ? "treasure" : "combat", x: 68, y: 64, neighbors: [], completed: false, visible: true },
    { id: "dungeon-2", type: "elite", x: 35, y: 40, neighbors: [], completed: false, visible: false },
    { id: "dungeon-3", type: random() > 0.5 ? "campfire" : "combat", x: 65, y: 40, neighbors: [], completed: false, visible: false },
    { id: "dungeon-exit", type: "exit", x: 24, y: 14, neighbors: [], completed: false, visible: false },
    { id: "dungeon-boss", type: "boss", encounterId: boss?.id, x: 76, y: 14, neighbors: [], completed: false, visible: false }
  ];
  const connect = (a: string, b: string) => {
    const left = nodes.find((node) => node.id === a)!;
    const right = nodes.find((node) => node.id === b)!;
    if (!left.neighbors.includes(b)) left.neighbors.push(b);
    if (!right.neighbors.includes(a)) right.neighbors.push(a);
  };
  connect("dungeon-start", "dungeon-0");
  connect("dungeon-start", "dungeon-1");
  connect("dungeon-0", "dungeon-2");
  connect("dungeon-1", "dungeon-3");
  connect("dungeon-2", "dungeon-exit");
  connect("dungeon-2", "dungeon-boss");
  connect("dungeon-3", "dungeon-exit");
  connect("dungeon-3", "dungeon-boss");
  return nodes;
}

export function canMove(run: RunState, nodeId: string): boolean {
  const current = run.map.find((node) => node.id === run.currentNodeId);
  const target = run.map.find((node) => node.id === nodeId);
  return Boolean(current && target && target.visible && current.neighbors.includes(nodeId));
}

export function moveToNode(run: RunState, nodeId: string): RunState {
  if (!canMove(run, nodeId) || run.screen !== "map") return run;
  const next = clone(run);
  const node = next.map.find((item) => item.id === nodeId)!;
  next.currentNodeId = nodeId;
  next.movesTaken += 1;
  if (!next.dungeon) next.threat += 1;
  revealNeighbors(next, nodeId);
  if (node.completed) {
    next.message = "你穿过一处已经清理过的安静地点。";
    return next;
  }
  if (node.type === "combat" || node.type === "elite" || node.type === "boss") {
    next.combat = startCombat(next, node.type);
    next.screen = "combat";
    next.message = `${nodeTypeLabel(node.type)}战斗开始。`;
  } else if (node.type === "event") {
    next.activeEvent = pickEvent(next, mulberry32(next.seed + next.movesTaken));
    next.screen = "event";
  } else if (node.type === "shop") {
    next.shopOffer = makeRewardCards(next, 5);
    next.screen = "shop";
  } else if (node.type === "campfire") {
    next.screen = "campfire";
  } else if (node.type === "treasure") {
    next.pendingReward = { type: "gold", amount: 65 + next.threat * 2 };
    next.screen = "treasure";
  } else if (node.type === "exit") {
    return leaveDungeon(next, "exit");
  }
  return next;
}

function revealNeighbors(run: RunState, nodeId: string) {
  const node = run.map.find((item) => item.id === nodeId);
  node?.neighbors.forEach((neighbor) => {
    const target = run.map.find((item) => item.id === neighbor);
    if (target) target.visible = true;
  });
}

export function completeNode(run: RunState): RunState {
  const next = clone(run);
  const node = next.map.find((item) => item.id === next.currentNodeId);
  if (node) node.completed = true;
  revealNeighbors(next, next.currentNodeId);
  next.screen = "map";
  next.combat = undefined;
  next.pendingReward = undefined;
  next.activeEvent = undefined;
  next.shopOffer = undefined;
  next.eventCombat = undefined;
  return next;
}

export function startCombat(run: RunState, nodeType: NodeType, encounterId?: string): CombatState {
  run.player.physicalArmor = 0;
  run.player.magicArmor = 0;
  const random = mulberry32(run.seed + run.movesTaken * 97);
  const tier = nodeType === "boss" ? "boss" : nodeType === "elite" ? "elite" : "normal";
  const node = run.map.find((item) => item.id === run.currentNodeId);
  const pack = getContentPack(run);
  const boundEncounterId = encounterId ?? node?.encounterId;
  const boundEnemy = boundEncounterId ? pack.enemies.find((enemy) => enemy.id === boundEncounterId && enemy.tier === tier) : undefined;
  const candidates = boundEnemy ? [boundEnemy] : pack.enemies.filter((enemy) => enemy.tier === tier);
  const count = tier === "normal" && random() > 0.45 ? 2 : 1;
  const enemyStates = Array.from({ length: count }, () => toEnemyState(pick(candidates, random), run.threat));
  const drawPile = shuffle(run.deck.map((card) => ({ ...card })), random);
  const combat: CombatState = { enemies: enemyStates, drawPile, hand: [], discardPile: [], exhaustPile: [], turn: 1, log: ["抽取起始手牌。"], oncePerCombatKeys: [], activePowers: [] };
  const next = { ...run, combat };
  drawCards(next, combat, 5, random);
  applyTriggeredEffects(next, "combatStart", { source: "character", sourceOwner: next.player, random });
  return combat;
}

export function scaleEnemy(enemy: EnemyDefinition, threat: number): EnemyDefinition {
  const hpScale = 1 + threat * 0.075;
  const damageScale = 1 + threat * 0.055;
  return {
    ...enemy,
    maxHp: Math.round(enemy.maxHp * hpScale),
    armor: enemy.armor + Math.floor(threat / 4),
    moves: enemy.moves.map((move) => ({
      ...move,
      damage: move.damage ? Math.max(1, Math.round(move.damage * damageScale)) : undefined,
      block: move.block ? move.block + Math.floor(threat / 3) : undefined,
      effects: move.effects?.map((effect) => scaleEnemyEffect(effect, damageScale, threat))
    }))
  };
}

function toEnemyState(enemy: EnemyDefinition, threat: number): EnemyState {
  const scaled = scaleEnemy(enemy, threat);
  return { instanceId: uid("enemy"), definitionId: enemy.id, name: scaled.name, maxHp: scaled.maxHp, hp: scaled.maxHp, physicalArmor: scaled.armor, magicArmor: 0, statuses: [], moveIndex: 0, intent: scaled.moves[0] };
}

export function playCard(run: RunState, cardUid: string, targetEnemyId?: string): RunState {
  if (!run.combat || run.screen !== "combat") return run;
  if (run.combat.pendingCardChoice) return run;
  const next = clone(run);
  const combat = ensureCombatShape(next.combat!);
  const index = combat.hand.findIndex((card) => card.uid === cardUid);
  if (index < 0) return run;
  const card = combat.hand[index];
  const def = cardDefFrom(card, getContentPack(next));
  const cost = cardCostFrom(card, getContentPack(next));
  if (def.type === "status" || def.type === "curse" || next.player.energy < cost) return run;
  const target = targetEnemyId ? combat.enemies.find((enemy) => enemy.instanceId === targetEnemyId) : combat.enemies[0];
  next.player.energy -= cost;
  combat.hand.splice(index, 1);
  const effects = card.upgraded ? def.upgradedEffects : def.effects;
  const random = consumeRunRandom(next, 3000 + combat.turn);
  resolveEffects(next, effects, { source: "card", sourceOwner: next.player, selectedEnemy: target, card, random });
  if (combat.pendingCardChoice) return autoCompleteEmptyCardChoice(next);
  return finishPlayedCard(next, card, target?.instanceId, random);
}

export function completeCardChoice(run: RunState, selectedUids: string[]): RunState {
  if (!run.combat?.pendingCardChoice || run.screen !== "combat") return run;
  const next = clone(run);
  const combat = ensureCombatShape(next.combat!);
  const choice = combat.pendingCardChoice!;
  const selected = new Set(selectedUids.slice(0, choice.amount));
  const from = getZone(next, choice.fromZone);
  const to = getZone(next, choice.toZone);
  const moved: CardInstance[] = [];
  for (let i = from.length - 1; i >= 0; i -= 1) {
    const selectedCard = from[i];
    if (!selected.has(selectedCard.uid) || !cardMatches(next, selectedCard, choice.cardFilter)) continue;
    moved.unshift(...from.splice(i, 1));
  }
  to.push(...moved);
  combat.pendingCardChoice = undefined;
  pushCombatLog(next, `${choice.toZone === "exhaustPile" ? "消耗" : "弃掉"} ${moved.length} 张牌。`);
  const target = choice.targetEnemyId ? combat.enemies.find((enemy) => enemy.instanceId === choice.targetEnemyId) : undefined;
  return finishPlayedCard(next, choice.sourceCard, target?.instanceId);
}

function autoCompleteEmptyCardChoice(run: RunState): RunState {
  const choice = run.combat?.pendingCardChoice;
  if (!choice) return run;
  const candidates = getZone(run, choice.fromZone).filter((card) => cardMatches(run, card, choice.cardFilter));
  if (candidates.length > 0 && choice.amount > 0) return run;
  return completeCardChoice(run, []);
}

function finishPlayedCard(run: RunState, card: CardInstance, targetEnemyId?: string, random?: () => number): RunState {
  const combat = ensureCombatShape(run.combat!);
  const def = cardDefFrom(card, getContentPack(run));
  const target = targetEnemyId ? combat.enemies.find((enemy) => enemy.instanceId === targetEnemyId) : combat.enemies[0];
  applyPowerCardRepeats(run, def, card, target, random);
  if (combat.pendingCardChoice) return autoCompleteEmptyCardChoice(run);
  applyTriggeredEffects(run, "cardPlayed", { source: "card", sourceOwner: run.player, selectedEnemy: target, card, random });
  applyPowerCardPlayed(run, def);
  activateCombatPower(run, def, card);
  if (def.id === "harvest" && target && target.hp <= 0) run.player.gold += card.upgraded ? 12 : 8;
  removeDeadEnemies(run);
  if (def.exhaust || def.type === "power") combat.exhaustPile.push(card);
  else combat.discardPile.push(card);
  pushCombatLog(run, `打出 ${def.name}${card.upgraded ? "+" : ""}。`);
  if (combat.enemies.length === 0) return winCombat(run);
  return run;
}

function activateCombatPower(run: RunState, def: CardDefinition, card: CardInstance) {
  if (def.type !== "power" || !run.combat || !ongoingPowerIds.has(def.id)) return;
  const combat = ensureCombatShape(run.combat);
  combat.activePowers!.push({ id: def.id, cardId: card.cardId, upgraded: card.upgraded, counters: {} });
  pushCombatLog(run, `${def.name} 生效。`);
}

const ongoingPowerIds = new Set([
  "rhythm_engine",
  "skill_echo",
  "assault_echo",
  "mana_cascade",
  "null_brand",
  "iron_habit",
  "blue_habit",
  "cruel_meter",
  "dawn_ledger"
]);

function powerCount(combat: CombatState, id: string) {
  return (combat.activePowers ?? []).filter((power) => power.id === id).length;
}

function forEachPower(run: RunState, id: string, callback: (power: ActivePower) => void) {
  ensureCombatShape(run.combat!);
  run.combat!.activePowers!.filter((power) => power.id === id).forEach(callback);
}

function applyPowerCardPlayed(run: RunState, def: CardDefinition) {
  forEachPower(run, "rhythm_engine", (power) => {
    const threshold = power.upgraded ? 5 : 6;
    power.counters.cardsPlayed = (power.counters.cardsPlayed ?? 0) + 1;
    if (power.counters.cardsPlayed >= threshold) {
      power.counters.cardsPlayed -= threshold;
      run.player.energy += 1;
      pushCombatLog(run, "节奏引擎回复 1 点能量。");
    }
  });
}

function applyPowerCardRepeats(run: RunState, def: CardDefinition, card: CardInstance, target: EnemyState | undefined, random?: () => number) {
  if (def.type === "skill") {
    forEachPower(run, "skill_echo", (power) => {
      if ((power.counters.skillRepeatsThisTurn ?? 0) >= 1) return;
      power.counters.skillRepeatsThisTurn = (power.counters.skillRepeatsThisTurn ?? 0) + 1;
      resolveEffects(run, card.upgraded ? def.upgradedEffects : def.effects, { source: "card", sourceOwner: run.player, selectedEnemy: target, card, random });
      pushCombatLog(run, "技能回响重复了这张技能牌。");
    });
  }
  if (def.type === "attack") {
    forEachPower(run, "assault_echo", (power) => {
      const limit = power.upgraded ? 2 : 1;
      if ((power.counters.attackRepeatsThisTurn ?? 0) >= limit) return;
      power.counters.attackRepeatsThisTurn = (power.counters.attackRepeatsThisTurn ?? 0) + 1;
      resolveEffects(run, card.upgraded ? def.upgradedEffects : def.effects, { source: "card", sourceOwner: run.player, selectedEnemy: target, card, random });
      pushCombatLog(run, "攻击回响重复了这张攻击牌。");
    });
  }
}

function applyPowerTurnEnd(run: RunState) {
  forEachPower(run, "iron_habit", (power) => {
    run.player.physicalArmor += power.upgraded ? 4 : 3;
  });
  forEachPower(run, "blue_habit", () => {
    run.player.magicArmor += 3;
  });
}

function resetPowerTurnCounters(run: RunState) {
  if (!run.combat) return;
  ensureCombatShape(run.combat);
  run.combat.activePowers!.forEach((power) => {
    delete power.counters.skillRepeatsThisTurn;
    delete power.counters.attackRepeatsThisTurn;
    delete power.counters.magicDamageThisTurn;
    Object.keys(power.counters).filter((key) => key.startsWith("physicalHits:") || key.startsWith("magicHits:")).forEach((key) => delete power.counters[key]);
  });
}

function restoreTemporaryEnemyMagic(run: RunState) {
  if (!run.combat) return;
  const combat = ensureCombatShape(run.combat);
  combat.activePowers!.forEach((power) => {
    Object.entries(power.counters).forEach(([key, amount]) => {
      if (!key.startsWith("tempMagicLoss:") || amount <= 0) return;
      const enemyId = key.slice("tempMagicLoss:".length);
      const enemy = combat.enemies.find((item) => item.instanceId === enemyId);
      if (enemy) {
        addStatus(enemy.statuses, "magic", amount);
        pruneStatuses(enemy.statuses);
      }
      delete power.counters[key];
    });
  });
}

function applyPowerDamageDealt(run: RunState, enemy: EnemyState, loss: number, kind: Exclude<DamageKind, "true">) {
  if (!run.combat) return;
  if (kind === "physical") {
    forEachPower(run, "null_brand", (power) => {
      addStatus(enemy.statuses, "magic", -1);
      const key = `tempMagicLoss:${enemy.instanceId}`;
      power.counters[key] = (power.counters[key] ?? 0) + 1;
    });
    forEachPower(run, "cruel_meter", (power) => {
      const key = `physicalHits:${enemy.instanceId}`;
      power.counters[key] = (power.counters[key] ?? 0) + 1;
      if (power.counters[key] >= 2) {
        power.counters[key] -= 2;
        addStatus(enemy.statuses, "vulnerable", 1);
      }
    });
  }
  if (kind === "magic") {
    forEachPower(run, "mana_cascade", (power) => {
      power.counters.magicDamageThisTurn = (power.counters.magicDamageThisTurn ?? 0) + loss;
      while (power.counters.magicDamageThisTurn >= 50) {
        power.counters.magicDamageThisTurn -= 50;
        run.player.energy += 1;
        drawCards(run, run.combat!, power.upgraded ? 3 : 2, consumeRunRandom(run, 8200 + run.combat!.turn));
      }
    });
    forEachPower(run, "cruel_meter", (power) => {
      const key = `magicHits:${enemy.instanceId}`;
      power.counters[key] = (power.counters[key] ?? 0) + 1;
      if (power.counters[key] >= 2) {
        power.counters[key] -= 2;
        addStatus(enemy.statuses, "weak", 1);
      }
    });
  }
}

export function endTurn(run: RunState): RunState {
  if (!run.combat || run.screen !== "combat") return run;
  if (run.combat.pendingCardChoice) return run;
  const next = clone(run);
  const combat = ensureCombatShape(next.combat!);
  applyTriggeredEffects(next, "turnEnd", { source: "character", sourceOwner: next.player, random: consumeRunRandom(next, 7100 + combat.turn) });
  applyPowerTurnEnd(next);
  applyTurnEndStatuses(next, next.player);
  discardHandAtTurnEnd(next);
  const enemyRandom = consumeRunRandom(next, 4000 + combat.turn);
  combat.enemies.forEach((enemy) => {
    enemy.physicalArmor = 0;
    applyTurnStartStatuses(next, enemy);
    removeDeadEnemies(next);
    if (enemy.hp <= 0) return;
    resolveEnemyMove(next, enemy, enemy.intent, enemyRandom);
    applyTurnEndStatuses(next, enemy);
    removeDeadEnemies(next);
  });
  restoreTemporaryEnemyMagic(next);
  if (next.player.hp <= 0) {
    next.screen = "gameover";
    next.message = "织网收拢。你倒下了。";
    return next;
  }
  if (combat.enemies.length === 0) return winCombat(next);
  tickDurationStatuses(next.player.statuses);
  combat.enemies.forEach((enemy) => {
    tickDurationStatuses(enemy.statuses);
    const def = scaleEnemy(getContentPack(next).enemies.find((item) => item.id === enemy.definitionId) ?? enemies.find((item) => item.id === enemy.definitionId)!, next.threat);
    enemy.moveIndex = (enemy.moveIndex + 1) % def.moves.length;
    enemy.intent = def.moves[enemy.moveIndex];
  });
  next.player.physicalArmor = 0;
  next.player.energy = next.player.maxEnergy;
  combat.turn += 1;
  resetPowerTurnCounters(next);
  applyTurnStartStatuses(next, next.player);
  if (next.player.hp <= 0) {
    next.screen = "gameover";
    next.message = "织网收拢。你倒下了。";
    return next;
  }
  drawCards(next, combat, 5 + powerCount(combat, "dawn_ledger"), consumeRunRandom(next, 2000 + combat.turn));
  applyTriggeredEffects(next, "turnStart", { source: "character", sourceOwner: next.player });
  pushCombatLog(next, `第 ${combat.turn} 回合开始。`);
  return next;
}

function resolveEnemyMove(run: RunState, enemy: EnemyState, move: EnemyMove, random?: () => number) {
  const hasParamEffects = Boolean(move.effects?.length);
  if (!hasParamEffects && move.block) enemy.physicalArmor += move.block;
  const hits = move.hits ?? 1;
  for (let i = 0; i < hits; i += 1) {
    if (hasParamEffects || !move.damage) continue;
    let amount = move.damage + getStatus(enemy.statuses, "strength");
    if (getStatus(enemy.statuses, "weak") > 0) amount = Math.floor(amount * 0.75);
    if (getStatus(run.player.statuses, "vulnerable") > 0) amount = Math.floor(amount * 1.5);
    damagePlayer(run, amount, enemy, "physical");
  }
  resolveEffects(run, move.effects ?? [], { source: "enemy", sourceOwner: enemy, random });
  pushCombatLog(run, `${enemy.name} 使用 ${move.label}。`);
}

function winCombat(run: RunState): RunState {
  applyTriggeredEffects(run, "combatWon", { source: "character", sourceOwner: run.player });
  if (run.eventCombat) return finishEventCombat(run);
  const node = run.map.find((item) => item.id === run.currentNodeId);
  if (node?.type === "boss") {
    if (run.dungeon) return leaveDungeon(run, "boss");
    return run.act < MAX_ACT ? advanceAct(run) : winRun(run);
  }
  run.player.physicalArmor = 0;
  run.player.magicArmor = 0;
  run.player.statuses = run.player.statuses.filter((status) => ["strength", "magic", "dexterity", "thorns"].includes(status.id));
  run.combat = undefined;
  run.pendingReward = { type: "card", cards: makeRewardCards(run, 3), amount: 18 + run.threat * 2 };
  run.player.gold += run.pendingReward.amount ?? 0;
  run.screen = "reward";
  run.message = "战斗胜利。选择一张卡牌奖励。";
  return run;
}

function advanceAct(run: RunState): RunState {
  const previousBoss = run.map.find((item) => item.id === run.currentNodeId);
  const nextStart = previousBoss ? { x: previousBoss.x, y: previousBoss.y } : DEFAULT_START_POSITION;
  run.act += 1;
  run.player.physicalArmor = 0;
  run.player.magicArmor = 0;
  run.player.statuses = run.player.statuses.filter((status) => ["strength", "magic", "dexterity", "thorns"].includes(status.id));
  run.combat = undefined;
  run.pendingReward = undefined;
  run.activeEvent = undefined;
  run.shopOffer = undefined;
  run.eventCombat = undefined;
  run.screen = "map";
  run.currentNodeId = "start";
  run.map = generateMap(mulberry32(run.seed + run.act * 1009), run.act, getContentPack(run), nextStart);
  run.message = `第 ${run.act} 幕开始。选择新的路线。`;
  return run;
}

function winRun(run: RunState): RunState {
  run.screen = "gameover";
  run.victory = true;
  run.message = `第 ${MAX_ACT} 幕首领倒下。无根之路重新打开。`;
  clearSave();
  return run;
}

export function chooseRewardCard(run: RunState, cardUid?: string): RunState {
  if (!run.pendingReward || run.screen !== "reward") return run;
  const next = clone(run);
  const chosen = cardUid ? next.pendingReward!.cards?.find((card) => card.uid === cardUid) : undefined;
  const relicId = next.pendingReward?.relicId;
  const relic = relicId ? getContentPack(next).relics[relicId] : undefined;
  if (chosen) next.deck.push(chosen);
  if (relicId && !next.relics.includes(relicId)) next.relics.push(relicId);
  if (next.pendingReward?.source === "dungeonBoss") {
    const cardText = chosen ? `${cardDef(chosen).name} 加入牌组` : "跳过卡牌";
    next.message = relic ? `${cardText}。宝箱中获得 ${relic.name}。` : `${cardText}。副本宝箱已经清空。`;
  } else {
    next.message = chosen ? `${cardDef(chosen).name} 加入牌组。` : "你跳过了卡牌奖励。";
  }
  return completeNode(next);
}

export function claimTreasure(run: RunState): RunState {
  if (!run.pendingReward || run.screen !== "treasure") return run;
  const next = clone(run);
  const amount = next.pendingReward?.amount ?? 0;
  next.player.gold += amount;
  next.message = `获得 ${amount} 金币。`;
  return completeNode(next);
}

export function applyEventChoice(run: RunState, choiceId: string): RunState {
  const choice = run.activeEvent?.choices.find((item) => item.id === choiceId);
  if (!choice) return run;
  const next = clone(run);
  const applied = applyEventActions(next, eventChoiceActions(choice), true);
  if (applied.screen !== "event") return applied;
  next.message = choice.description;
  return completeNode(next);
}

function eventChoiceActions(choice: { effect?: string; dungeonThreat?: number; actions?: EventAction[] }): EventAction[] {
  if (choice.actions?.length) return choice.actions;
  if (choice.effect === "gainGoldLoseHp") return [{ type: "gainGold", amount: 45 }, { type: "loseHp", amount: 8 }];
  if (choice.effect === "healGainCurse") return [{ type: "heal", amount: 18 }, { type: "addCurse", cardId: "curse" }];
  if (choice.effect === "upgradeRandom") return [{ type: "upgradeRandom" }];
  if (choice.effect === "enterDungeon") return [{ type: "enterDungeon", dungeonThreat: choice.dungeonThreat ?? DUNGEON_DEFAULT_THREAT }];
  return [{ type: "skip" }];
}

function applyEventActions(run: RunState, actions: EventAction[], completeAfter = false): RunState {
  for (const action of actions) {
    const amount = action.amount ?? 0;
    if (action.type === "skip") continue;
    if (action.type === "gainGold") run.player.gold += amount;
    else if (action.type === "loseGold") run.player.gold = Math.max(0, run.player.gold - amount);
    else if (action.type === "loseHp") run.player.hp = Math.max(1, run.player.hp - amount);
    else if (action.type === "heal") run.player.hp = Math.min(run.player.maxHp, run.player.hp + amount);
    else if (action.type === "gainMaxHp") {
      run.player.maxHp += amount;
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + amount);
    } else if (action.type === "loseMaxHp") {
      run.player.maxHp = Math.max(1, run.player.maxHp - amount);
      run.player.hp = Math.min(run.player.hp, run.player.maxHp);
    } else if (action.type === "addCard") run.deck.push(makeCard(action.cardId ?? "wound"));
    else if (action.type === "addCurse") run.deck.push(makeCard(action.cardId ?? "curse"));
    else if (action.type === "upgradeRandom") upgradeRandom(run);
    else if (action.type === "removeRandomBasic") removeRandomBasic(run);
    else if (action.type === "transformRandomCard") transformRandomCard(run);
    else if (action.type === "gainRelic") gainEventRelic(run, action.relicId);
    else if (action.type === "gainThreat") run.threat = Math.max(0, run.threat + amount);
    else if (action.type === "enterDungeon") return enterDungeon(run, action.dungeonThreat ?? action.amount ?? DUNGEON_DEFAULT_THREAT);
    else if (action.type === "startEventCombat") return startEventCombat(run, action);
  }
  return completeAfter ? run : run;
}

function startEventCombat(run: RunState, action: EventAction): RunState {
  const tier = action.tier ?? "normal";
  const nodeType: NodeType = tier === "boss" ? "boss" : tier === "elite" ? "elite" : "combat";
  run.eventCombat = { returnNodeId: run.currentNodeId, onWinActions: action.onWinActions ?? [] };
  run.activeEvent = undefined;
  run.pendingReward = undefined;
  run.shopOffer = undefined;
  run.combat = startCombat(run, nodeType, action.encounterId);
  run.screen = "combat";
  run.message = "事件战斗开始。";
  return run;
}

function finishEventCombat(run: RunState): RunState {
  const eventCombat = run.eventCombat;
  if (!eventCombat) return run;
  run.eventCombat = undefined;
  run.combat = undefined;
  run.currentNodeId = eventCombat.returnNodeId;
  run.screen = "map";
  applyEventActions(run, eventCombat.onWinActions, false);
  run.message = "事件战斗胜利。";
  return completeNode(run);
}

function enterDungeon(run: RunState, threatIncrease: number): RunState {
  if (run.dungeon) return run;
  run.dungeon = {
    returnMap: clone(run.map),
    returnNodeId: run.currentNodeId,
    threatIncrease: Math.max(0, threatIncrease)
  };
  run.map = generateDungeonMap(mulberry32(run.seed + run.act * 7919 + run.movesTaken * 313 + run.threat * 17), getContentPack(run));
  run.currentNodeId = "dungeon-start";
  run.screen = "map";
  run.combat = undefined;
  run.pendingReward = undefined;
  run.activeEvent = undefined;
  run.shopOffer = undefined;
  run.eventCombat = undefined;
  run.message = `进入副本。完成后威胁 +${run.dungeon.threatIncrease}。`;
  return run;
}

function leaveDungeon(run: RunState, reason: "exit" | "boss"): RunState {
  const dungeon = run.dungeon;
  if (!dungeon) return run;
  const threatIncrease = dungeon.threatIncrease;
  run.map = clone(dungeon.returnMap);
  run.currentNodeId = dungeon.returnNodeId;
  run.dungeon = undefined;
  run.threat += threatIncrease;
  run.combat = undefined;
  run.eventCombat = undefined;
  run.activeEvent = undefined;
  run.shopOffer = undefined;
  if (reason === "exit") {
    run.pendingReward = undefined;
    run.screen = "map";
    run.message = `你离开副本，威胁 +${threatIncrease}。`;
    return completeNode(run);
  }
  run.player.physicalArmor = 0;
  run.player.magicArmor = 0;
  run.player.statuses = run.player.statuses.filter((status) => ["strength", "magic", "dexterity", "thorns"].includes(status.id));
  const goldReward = 45 + run.threat * 2;
  run.player.gold += goldReward;
  run.pendingReward = { type: "card", cards: makeRewardCards(run, 3), amount: goldReward, source: "dungeonBoss", relicId: pickAvailableRelic(run) };
  run.screen = "reward";
  run.message = `副本首领倒下。威胁 +${threatIncrease}，获得 ${goldReward} 金币。`;
  return run;
}

export function restAtCampfire(run: RunState, action: "heal" | "upgrade"): RunState {
  if (run.screen !== "campfire") return run;
  const next = clone(run);
  if (action === "heal") {
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 22);
    next.message = "你在冷火旁休息，恢复了生命。";
  } else {
    upgradeRandom(next);
    next.message = "一张卡牌在火光中变得更锋利。";
  }
  return completeNode(next);
}

export function buyFromShop(run: RunState, cardUid: string): RunState {
  if (run.screen !== "shop" || !run.shopOffer) return run;
  const next = clone(run);
  const card = next.shopOffer!.find((item) => item.uid === cardUid);
  if (!card || next.player.gold < 55) return run;
  next.player.gold -= 55;
  next.deck.push(card);
  next.shopOffer = next.shopOffer!.filter((item) => item.uid !== cardUid);
  next.message = `购买了 ${cardDef(card).name}。`;
  return next;
}

export function shopService(run: RunState, action: "heal" | "remove" | "leave"): RunState {
  if (run.screen !== "shop") return run;
  const next = clone(run);
  if (action === "heal" && next.player.gold >= 35) {
    next.player.gold -= 35;
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 18);
    next.message = "苦涩药剂让旧伤合拢。";
    return next;
  }
  if (action === "remove" && next.player.gold >= 75 && next.deck.length > 6) {
    next.player.gold -= 75;
    const removable = next.deck.find((card) => card.cardId === "strike") ?? next.deck.find((card) => card.cardId === "guard") ?? next.deck[0];
    next.deck = next.deck.filter((card) => card.uid !== removable.uid);
    next.message = `移除了 ${cardDef(removable).name}。`;
    return next;
  }
  return completeNode(next);
}

function makeRewardCards(run: RunState, amount: number): CardInstance[] {
  const random = mulberry32(run.seed + run.movesTaken * 131 + run.threat);
  const rewardCardPool = Object.values(getContentPack(run).cards).filter((card) => !["basic", "status", "curse"].includes(card.rarity));
  return Array.from({ length: amount }, () => makeCard(pick(rewardCardPool, random).id, random() > 0.88));
}

function pickEvent(run: RunState, random: () => number): GameEvent {
  const pack = getContentPack(run);
  const candidates = pack.events.filter((event) => !event.acts?.length || event.acts.includes(run.act));
  const pool = candidates.length ? candidates : pack.events;
  const weighted = pool.flatMap((event) => Array.from({ length: Math.max(1, event.weight ?? 1) }, () => event));
  return pick(weighted.length ? weighted : pack.events, random);
}

function pickAvailableRelic(run: RunState): string | undefined {
  const random = mulberry32(run.seed + run.movesTaken * 991 + run.threat * 37);
  const candidates = Object.values(getContentPack(run).relics).filter((relic) => relic.rarity !== "basic" && !run.relics.includes(relic.id));
  return candidates.length ? pick(candidates, random).id : undefined;
}

function gainEventRelic(run: RunState, relicId?: string) {
  const nextRelic = relicId && getContentPack(run).relics[relicId] ? relicId : pickAvailableRelic(run);
  if (nextRelic && !run.relics.includes(nextRelic)) run.relics.push(nextRelic);
}

function removeRandomBasic(run: RunState) {
  if (run.deck.length <= 1) return;
  const removable = run.deck.find((card) => card.cardId === "strike") ?? run.deck.find((card) => card.cardId === "guard") ?? run.deck.find((card) => cardDefFrom(card, getContentPack(run)).rarity === "basic");
  if (removable) run.deck = run.deck.filter((card) => card.uid !== removable.uid);
}

function transformRandomCard(run: RunState) {
  const random = mulberry32(run.seed + run.movesTaken * 733 + run.threat * 19);
  const index = run.deck.findIndex((card) => !["curse", "wound"].includes(card.cardId));
  const rewardCardPool = Object.values(getContentPack(run).cards).filter((card) => !["basic", "status", "curse"].includes(card.rarity));
  if (index >= 0 && rewardCardPool.length) run.deck[index] = makeCard(pick(rewardCardPool, random).id, random() > 0.88);
}

function drawCards(run: RunState, combat: CombatState, amount: number, random: () => number) {
  for (let i = 0; i < amount; i += 1) {
    if (combat.drawPile.length === 0) {
      combat.drawPile = shuffle(combat.discardPile, random);
      combat.discardPile = [];
    }
    const drawn = combat.drawPile.shift();
    if (drawn) {
      combat.hand.push(drawn);
      applyTriggeredEffects(run, "cardDrawn", { source: "card", sourceOwner: run.player, card: drawn, random });
    }
  }
}

type DamageKind = "physical" | "magic" | "true";

function damageEnemy(run: RunState, enemy: EnemyState, amount: number, kind: DamageKind = "true", source: EffectSource = "status") {
  const armorKey = kind === "magic" ? "magicArmor" : "physicalArmor";
  const blocked = kind === "true" ? 0 : Math.min(enemy[armorKey], amount);
  if (kind !== "true") enemy[armorKey] -= blocked;
  const loss = amount - blocked;
  enemy.hp -= loss;
  if (loss > 0 || blocked > 0) pushCombatLog(run, `${enemy.name} 受到 ${loss} 点${damageKindLabel(kind)}伤害${blocked > 0 ? `，${blocked} 点被护甲抵消` : ""}。`);
  afterDamage(run, enemy, loss, kind);
  if (source === "card" && loss > 0 && (kind === "physical" || kind === "magic")) applyPowerDamageDealt(run, enemy, loss, kind);
  return loss;
}

function damagePlayer(run: RunState, amount: number, source?: EnemyState, kind: DamageKind = "true") {
  applyTriggeredEffects(run, "beforeDamageTaken", { source: "enemy", sourceOwner: source, selectedEnemy: source });
  const armorKey = kind === "magic" ? "magicArmor" : "physicalArmor";
  const blocked = kind === "true" ? 0 : Math.min(run.player[armorKey], amount);
  if (kind !== "true") run.player[armorKey] -= blocked;
  const loss = amount - blocked;
  run.player.hp -= loss;
  if (loss > 0 || blocked > 0) pushCombatLog(run, `你受到 ${loss} 点${damageKindLabel(kind)}伤害${blocked > 0 ? `，${blocked} 点被护甲抵消` : ""}。`);
  afterDamage(run, run.player, loss, kind);
  if (source && amount > 0) {
    const thorns = getStatus(run.player.statuses, "thorns");
    if (thorns > 0) damageEnemy(run, source, thorns, "true");
  }
  if (amount > 0) applyTriggeredEffects(run, "playerDamaged", { source: "enemy", sourceOwner: source, selectedEnemy: source });
  return loss;
}

function tickDurationStatuses(statuses: StatusEffect[]) {
  statuses.forEach((status) => {
    if (status.id === "weak" || status.id === "vulnerable" || status.id === "frail") status.amount -= 1;
  });
  pruneStatuses(statuses);
}

function applyTurnStartStatuses(run: RunState, target: EffectOwner) {
  const poison = getStatus(target.statuses, "poison");
  if (poison > 0) {
    loseHpFromStatus(run, target, poison, "中毒");
    decrementStatus(target.statuses, "poison");
  }
  const regen = getStatus(target.statuses, "regen");
  if (regen > 0) {
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + regen);
    pushCombatLog(run, `${combatantName(target)} 再生恢复 ${target.hp - before} 点生命。`);
    decrementStatus(target.statuses, "regen");
  }
  const platedArmor = getStatus(target.statuses, "platedArmor");
  if (platedArmor > 0) {
    target.physicalArmor += platedArmor;
    pushCombatLog(run, `${combatantName(target)} 的多层护甲提供 ${platedArmor} 点物理护甲。`);
  }
}

function applyTurnEndStatuses(run: RunState, target: EffectOwner) {
  const burn = getStatus(target.statuses, "burn");
  if (burn > 0) {
    loseHpFromStatus(run, target, burn, "燃烧");
    decrementStatus(target.statuses, "burn");
  }
  if (getStatus(target.statuses, "intangible") > 0) decrementStatus(target.statuses, "intangible");
}

function afterDamage(run: RunState, target: EffectOwner, hpLoss: number, kind: DamageKind) {
  if (hpLoss <= 0) return;
  if (getStatus(target.statuses, "platedArmor") > 0) decrementStatus(target.statuses, "platedArmor");
  if (kind === "physical" && getStatus(target.statuses, "bleed") > 0) {
    const bleed = getStatus(target.statuses, "bleed");
    loseHpFromStatus(run, target, bleed, "流血");
    decrementStatus(target.statuses, "bleed");
  }
}

function loseHpFromStatus(run: RunState, target: EffectOwner, amount: number, label: string) {
  target.hp -= amount;
  pushCombatLog(run, `${combatantName(target)} 因${label}失去 ${amount} 点生命。`);
}

function decrementStatus(statuses: StatusEffect[], id: StatusEffect["id"], amount = 1) {
  const status = statuses.find((item) => item.id === id);
  if (status) status.amount -= amount;
  pruneStatuses(statuses);
}

function pruneStatuses(statuses: StatusEffect[]) {
  for (let i = statuses.length - 1; i >= 0; i -= 1) {
    if (statuses[i].amount <= 0) statuses.splice(i, 1);
  }
}

function discardHandAtTurnEnd(run: RunState) {
  const combat = run.combat!;
  const hand = combat.hand;
  combat.hand = [];
  hand.forEach((card) => {
    const def = cardDefFrom(card, getContentPack(run));
    if (def.ethereal) {
      combat.exhaustPile.push(card);
      pushCombatLog(run, `${def.name} 因虚无进入消耗堆。`);
    } else {
      combat.discardPile.push(card);
    }
  });
}

function removeDeadEnemies(run: RunState) {
  if (!run.combat) return;
  const dead = run.combat.enemies.filter((enemy) => enemy.hp <= 0);
  dead.forEach((enemy) => {
    applyTriggeredEffects(run, "enemyKilled", { source: "status", sourceOwner: run.player, selectedEnemy: enemy });
    pushCombatLog(run, `${enemy.name} 被击倒。`);
  });
  run.combat.enemies = run.combat.enemies.filter((enemy) => enemy.hp > 0);
}

function addStatus(statuses: StatusEffect[], id: StatusEffect["id"], amount: number) {
  const existing = statuses.find((status) => status.id === id);
  if (existing) existing.amount += amount;
  else statuses.push({ id, amount });
}

function getStatus(statuses: StatusEffect[], id: StatusEffect["id"]) {
  return statuses.find((status) => status.id === id)?.amount ?? 0;
}

function upgradeRandom(run: RunState) {
  const card = run.deck.find((item) => !item.upgraded && !["curse", "wound"].includes(item.cardId));
  if (card) card.upgraded = true;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bossPositionsForStart(start: MapPosition): MapPosition[] {
  const positions = [{ x: 50, y: 6 }, { x: 8, y: 82 }, { x: 92, y: 82 }];
  const replacements = [{ x: 50, y: 94 }, { x: 92, y: 18 }, { x: 8, y: 18 }];
  return positions.map((position, index) => (distance(position, start) < 8 ? replacements[index] : position));
}

function distance(a: Pick<MapNode, "x" | "y">, b: Pick<MapNode, "x" | "y">) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function eventTitle(event?: GameEvent) {
  return event?.title ?? "诡异寂静";
}

function consumeRunRandom(run: RunState, salt: number) {
  const counter = run.rngCounter ?? 0;
  run.rngCounter = counter + 1;
  return mulberry32(run.seed + run.act * 1000003 + run.movesTaken * 1009 + counter * 9176 + salt);
}

function pushCombatLog(run: RunState, message: string) {
  if (!run.combat) return;
  run.combat.log.unshift(message);
  if (run.combat.log.length > 40) run.combat.log.splice(40);
}

function damageKindLabel(kind: DamageKind) {
  if (kind === "physical") return "物理";
  if (kind === "magic") return "魔法";
  return "真实";
}

function combatantName(target: EffectOwner) {
  return isEnemy(target) ? target.name : "你";
}

function statusLabel(id: StatusEffect["id"]) {
  const labels: Record<StatusEffect["id"], string> = {
    weak: "虚弱",
    vulnerable: "易伤",
    frail: "脆弱",
    poison: "中毒",
    burn: "燃烧",
    bleed: "流血",
    strength: "力量",
    magic: "魔力",
    dexterity: "敏捷",
    thorns: "荆棘",
    regen: "再生",
    platedArmor: "多层护甲",
    artifact: "人工制品",
    intangible: "无形"
  };
  return labels[id];
}

function nodeTypeLabel(type: NodeType) {
  const labels: Record<NodeType, string> = {
    start: "起点",
    combat: "普通",
    elite: "精英",
    event: "事件",
    campfire: "营火",
    shop: "商店",
    treasure: "宝箱",
    boss: "首领",
    exit: "出口"
  };
  return labels[type];
}

function getContentPack(run: RunState): ContentPack {
  return run.contentPack ? normalizeContentPack(run.contentPack) : loadContentPack();
}

type EffectSource = "card" | "enemy" | "relic" | "character" | "status";
type EffectOwner = PlayerStateLike | EnemyState;
type PlayerStateLike = RunState["player"];

interface ResolveContext {
  source: EffectSource;
  sourceOwner?: EffectOwner;
  selectedEnemy?: EnemyState;
  card?: CardInstance;
  random?: () => number;
}

function applyTriggeredEffects(run: RunState, trigger: RelicTrigger, context: ResolveContext) {
  const pack = getContentPack(run);
  run.relics.forEach((id) => {
    const relic = pack.relics[id];
    if (!relic || relic.trigger !== trigger) return;
    resolveEffects(run, relic.effects, { ...context, source: "relic", sourceOwner: run.player });
    pushCombatLog(run, `${relic.name} 触发。`);
  });
  const character = pack.characters[run.characterId ?? pack.defaultCharacterId];
  character?.passives.forEach((passive, index) => {
    if (passive.trigger !== trigger || !conditionMet(run, passive.condition, context)) return;
    const onceKey = `character:${character.id}:${trigger}:${index}`;
    if (passive.oncePerCombat && run.combat) {
      ensureCombatShape(run.combat);
      if (run.combat.oncePerCombatKeys.includes(onceKey)) return;
      run.combat.oncePerCombatKeys.push(onceKey);
    }
    resolveEffects(run, passive.effects, { ...context, source: "character", sourceOwner: run.player });
  });
}

function resolveEffects(run: RunState, effects: Effect[], context: ResolveContext) {
  for (const effect of effects) {
    if (!conditionMet(run, effect.condition, context)) continue;
    const repeats = effect.times ?? 1;
    for (let i = 0; i < repeats; i += 1) {
      applyParamOperation(run, effect, context);
      if (run.combat?.pendingCardChoice) return;
    }
  }
}

function applyParamOperation(run: RunState, effect: Effect, context: ResolveContext) {
  if (effect.param === "cards") {
    applyCardOperation(run, effect, context);
    return;
  }
  if (effect.param === "upgraded" || effect.param === "cost") {
    applyCardInstanceOperation(run, effect);
    return;
  }
  const targets = resolveTargets(run, effect.target, context);
  targets.forEach((target) => {
    if (effect.param === "statusAmount" && effect.status && isCombatant(target)) {
      const before = getStatus(target.statuses, effect.status);
      const applied = applyStatusOperation(run, target, effect.status, effect.op, effect.amount ?? 0, context);
      const after = getStatus(target.statuses, effect.status);
      if (after !== before) pushCombatLog(run, `${combatantName(target)} 的 ${statusLabel(effect.status)} ${before} -> ${after}。`);
      if (applied && after > before) applyTriggeredEffects(run, "statusApplied", { ...context, source: "status", sourceOwner: target, selectedEnemy: isEnemy(target) ? target : context.selectedEnemy });
    } else if (isCombatant(target) && ["hp", "maxHp", "physicalDamage", "magicDamage", "physicalArmor", "magicArmor", "energy", "maxEnergy", "gold"].includes(effect.param)) {
      applyCombatantParam(run, target, effect, context);
    } else {
      applyRunParam(run, effect);
    }
  });
}

function resolveTargets(run: RunState, target: EffectTarget, context: ResolveContext): EffectOwner[] {
  const combat = run.combat;
  if (target === "player" || target === "sourceOwner") return [run.player];
  if (target === "selectedEnemy") return context.selectedEnemy ? [context.selectedEnemy] : combat?.enemies[0] ? [combat.enemies[0]] : [];
  if (target === "self") return context.sourceOwner ? [context.sourceOwner] : [run.player];
  if (target === "allEnemies") return combat?.enemies ?? [];
  if (target === "randomEnemy") {
    if (!combat?.enemies.length) return [];
    const random = context.random ?? consumeRunRandom(run, 5000 + (combat.turn ?? 0));
    return [combat.enemies[Math.floor(random() * combat.enemies.length)]];
  }
  if (target === "allCombatants") return combat ? [run.player, ...combat.enemies] : [run.player];
  return [];
}

function applyCombatantParam(run: RunState, target: EffectOwner, effect: Effect, context: ResolveContext) {
  const amount = effect.amount ?? 0;
  if ((effect.param === "physicalDamage" || effect.param === "magicDamage") && effect.op === "subtract") {
    const source = context.sourceOwner && isCombatant(context.sourceOwner) ? context.sourceOwner : undefined;
    const kind = effect.param === "magicDamage" ? "magic" : "physical";
    const adjusted = adjustDamage(amount, source, target, kind);
    if (isEnemy(target)) damageEnemy(run, target, adjusted, kind, context.source);
    else damagePlayer(run, adjusted, source && isEnemy(source) ? source : undefined, kind);
    return;
  }
  if (effect.param === "hp" && effect.op === "subtract") {
    if (isEnemy(target)) damageEnemy(run, target, amount, "true", context.source);
    else damagePlayer(run, amount, context.sourceOwner && isEnemy(context.sourceOwner) ? context.sourceOwner : undefined, "true");
    return;
  }
  if (effect.param === "hp") {
    target.hp = clamp(applyNumberOp(target.hp, effect.op, amount), 1, target.maxHp);
    return;
  }
  if (effect.param === "maxHp") {
    const before = target.maxHp;
    target.maxHp = Math.max(1, applyNumberOp(target.maxHp, effect.op, amount));
    target.hp = clamp(target.hp + Math.max(0, target.maxHp - before), 1, target.maxHp);
    return;
  }
  if (effect.param === "physicalArmor" || effect.param === "magicArmor") {
    const armorAmount = context.source === "card" ? modifyArmorGain(amount, target, effect.param === "magicArmor" ? "magic" : "physical") : amount;
    const before = target[effect.param];
    target[effect.param] = Math.max(0, applyNumberOp(target[effect.param], effect.op, armorAmount));
    if (target[effect.param] !== before) pushCombatLog(run, `${combatantName(target)} 的 ${effect.param === "magicArmor" ? "魔法护甲" : "物理护甲"} ${before} -> ${target[effect.param]}。`);
    return;
  }
  if (!isEnemy(target) && effect.param === "energy") target.energy = Math.max(0, applyNumberOp(target.energy, effect.op, amount));
  if (!isEnemy(target) && effect.param === "maxEnergy") target.maxEnergy = Math.max(1, applyNumberOp(target.maxEnergy, effect.op, amount));
  if (!isEnemy(target) && effect.param === "gold") target.gold = Math.max(0, applyNumberOp(target.gold, effect.op, amount));
}

function applyRunParam(run: RunState, effect: Effect) {
  const amount = effect.amount ?? 0;
  if (effect.param === "turn" && run.combat) run.combat.turn = Math.max(1, applyNumberOp(run.combat.turn, effect.op, amount));
  if (effect.param === "threat") run.threat = Math.max(0, applyNumberOp(run.threat, effect.op, amount));
  if (effect.param === "movesTaken") run.movesTaken = Math.max(0, applyNumberOp(run.movesTaken, effect.op, amount));
}

function applyCardOperation(run: RunState, effect: Effect, context: ResolveContext) {
  if (!run.combat && effect.fromZone !== "deck" && effect.toZone !== "deck") return;
  const amount = effect.amount ?? 1;
  if (effect.op === "move" && effect.fromZone && effect.toZone) {
    if (effect.selection === "manual" && effect.fromZone === "hand" && run.combat && context.card) {
      run.combat.pendingCardChoice = {
        sourceCard: context.card!,
        targetEnemyId: context.selectedEnemy?.instanceId,
        fromZone: effect.fromZone,
        toZone: effect.toZone,
        amount,
        cardFilter: effect.cardFilter ?? "any"
      };
      return;
    }
    if (effect.fromZone === "drawPile" && effect.toZone === "hand" && run.combat) {
      drawCards(run, run.combat, amount, context.random ?? consumeRunRandom(run, 6000 + run.combat.turn));
      return;
    }
    moveCards(run, effect.fromZone, effect.toZone, amount, effect.cardFilter ?? "any");
  } else if (effect.op === "remove" && effect.fromZone) {
    const zone = getZone(run, effect.fromZone);
    removeFromZone(zone, amount, effect.cardFilter ?? "any", run);
  } else if (effect.op === "clear" && effect.fromZone) {
    getZone(run, effect.fromZone).splice(0);
  }
}

function applyCardInstanceOperation(run: RunState, effect: Effect) {
  const cards = run.combat ? [run.combat.hand, run.combat.drawPile, run.combat.discardPile, run.combat.exhaustPile, run.deck].flat() : run.deck;
  const card = cards.find((item) => cardMatches(run, item, effect.cardFilter ?? "any"));
  if (!card) return;
  if (effect.param === "upgraded" && effect.op === "set") card.upgraded = (effect.amount ?? 0) > 0;
  if (effect.param === "cost") card.cost = Math.max(0, applyNumberOp(card.cost ?? cardDefFrom(card, getContentPack(run)).cost, effect.op, effect.amount ?? 0));
}

function moveCards(run: RunState, fromZone: CardZone, toZone: CardZone, amount: number, filter: CardFilter) {
  const from = getZone(run, fromZone);
  const to = getZone(run, toZone);
  const moved: CardInstance[] = [];
  for (let i = from.length - 1; i >= 0 && moved.length < amount; i -= 1) {
    if (!cardMatches(run, from[i], filter)) continue;
    moved.unshift(...from.splice(i, 1));
  }
  to.push(...moved);
}

function removeFromZone(zone: CardInstance[], amount: number, filter: CardFilter, run: RunState) {
  let removed = 0;
  for (let i = zone.length - 1; i >= 0 && removed < amount; i -= 1) {
    if (!cardMatches(run, zone[i], filter)) continue;
    zone.splice(i, 1);
    removed += 1;
  }
}

function getZone(run: RunState, zone: CardZone): CardInstance[] {
  if (zone === "deck") return run.deck;
  const combat = run.combat!;
  return combat[zone];
}

function cardMatches(run: RunState, card: CardInstance, filter: CardFilter) {
  const def = cardDefFrom(card, getContentPack(run));
  if (filter === "any") return true;
  if (filter === "upgraded") return card.upgraded;
  if (filter === "notUpgraded") return !card.upgraded;
  return def.type === filter || def.rarity === filter;
}

function applyStatusOperation(run: RunState, target: EffectOwner, id: StatusEffect["id"], op: Effect["op"], amount: number, context: ResolveContext) {
  const statuses = target.statuses;
  if (op === "clear") {
    const index = statuses.findIndex((status) => status.id === id);
    if (index >= 0) statuses.splice(index, 1);
    return false;
  }
  const current = getStatus(statuses, id);
  const next = Math.max(0, applyNumberOp(current, op, amount));
  if (shouldArtifactBlockStatus(target, id, op, current, next)) {
    decrementStatus(target.statuses, "artifact");
    pushCombatLog(run, `${combatantName(target)} 的人工制品抵消了 ${statusLabel(id)}。`);
    return false;
  }
  const existing = statuses.find((status) => status.id === id);
  if (existing) existing.amount = next;
  else if (next > 0) statuses.push({ id, amount: next });
  pruneStatuses(statuses);
  return next > current && context.source !== "status";
}

function shouldArtifactBlockStatus(target: EffectOwner, id: StatusEffect["id"], op: Effect["op"], current: number, next: number) {
  if (!isNegativeStatus(id) || getStatus(target.statuses, "artifact") <= 0) return false;
  if (op === "add") return next > current;
  if (op === "set") return next > current;
  if (op === "multiply") return next > current;
  return false;
}

function isNegativeStatus(id: StatusEffect["id"]) {
  return id === "weak" || id === "vulnerable" || id === "frail" || id === "poison" || id === "burn" || id === "bleed";
}

function applyNumberOp(current: number, op: Effect["op"], amount: number) {
  if (op === "add") return current + amount;
  if (op === "subtract") return current - amount;
  if (op === "set") return amount;
  if (op === "multiply") return current * amount;
  if (op === "clear") return 0;
  return current;
}

function conditionMet(run: RunState, condition: Effect["condition"], context: ResolveContext) {
  if (!condition) return true;
  const target = resolveTargets(run, condition.target ?? "self", context)[0];
  const value = getParamValue(run, target, condition.param, condition.status);
  const amount = condition.amount ?? 0;
  if (condition.op === "equals") return value === amount;
  if (condition.op === "notEquals") return value !== amount;
  if (condition.op === "greaterThan") return value > amount;
  if (condition.op === "greaterThanOrEqual") return value >= amount;
  if (condition.op === "lessThan") return value < amount;
  if (condition.op === "lessThanOrEqual") return value <= amount;
  return true;
}

function getParamValue(run: RunState, target: EffectOwner | undefined, param: EffectParam, status?: StatusEffect["id"]) {
  if (param === "turn") return run.combat?.turn ?? 0;
  if (param === "threat") return run.threat;
  if (param === "movesTaken") return run.movesTaken;
  if (!target) return 0;
  if (param === "statusAmount" && status) return getStatus(target.statuses, status);
  return typeof target[param as keyof EffectOwner] === "number" ? (target[param as keyof EffectOwner] as number) : 0;
}

function adjustDamage(amount: number, source: EffectOwner | undefined, target: EffectOwner, kind: Exclude<DamageKind, "true">) {
  let next = amount + (source ? getStatus(source.statuses, kind === "magic" ? "magic" : "strength") : 0);
  if (source && getStatus(source.statuses, "weak") > 0) next = Math.floor(next * 0.75);
  if (getStatus(target.statuses, "vulnerable") > 0) next = Math.floor(next * 1.5);
  if (getStatus(target.statuses, "intangible") > 0) next = Math.min(next, 1);
  return Math.max(0, next);
}

function modifyArmorGain(amount: number, target: EffectOwner, kind: Exclude<DamageKind, "true">) {
  let next = amount + getStatus(target.statuses, kind === "magic" ? "magic" : "dexterity");
  if (getStatus(target.statuses, "frail") > 0) next = Math.floor(next * 0.75);
  return Math.max(0, next);
}

function isCombatant(value: EffectOwner | RunState): value is EffectOwner {
  return "statuses" in value && "hp" in value && "physicalArmor" in value && "magicArmor" in value;
}

function isEnemy(value: EffectOwner): value is EnemyState {
  return "instanceId" in value;
}

function scaleEnemyEffect(effect: Effect, damageScale: number, threat: number): Effect {
  if ((effect.param === "physicalDamage" || effect.param === "magicDamage") && effect.op === "subtract" && effect.target === "player" && effect.amount) return { ...effect, amount: Math.max(1, Math.round(effect.amount * damageScale)) };
  if ((effect.param === "physicalArmor" || effect.param === "magicArmor") && effect.target === "self" && effect.amount) return { ...effect, amount: effect.amount + Math.floor(threat / 3) };
  return effect;
}

