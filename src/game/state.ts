import { cards, enemies, events, loadContentPack, normalizeContentPack } from "./content";
import { mulberry32, pick, shuffle, uid } from "./rng";
import type { CardDefinition, CardFilter, CardInstance, CardZone, CombatState, ContentPack, Effect, EffectParam, EffectTarget, EnemyDefinition, EnemyMove, EnemyState, GameEvent, MapNode, NodeType, RelicTrigger, Reward, RunState, StatusEffect } from "./types";

export const SAVE_KEY = "netspire-save";
export const SAVE_VERSION = 6;
export const MAX_ACT = 3;
const BOSS_NODE_COUNT = 3;

export function makeCard(cardId: string, upgraded = false): CardInstance {
  return { uid: uid("card"), cardId, upgraded };
}

export function cardDef(card: CardInstance): CardDefinition {
  return loadContentPack().cards[card.cardId] ?? cards[card.cardId];
}

export function cardDefFrom(card: CardInstance, pack: ContentPack): CardDefinition {
  return pack.cards[card.cardId] ?? cards[card.cardId];
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
    combat: run.combat ? normalizeCombat(run.combat) : undefined
  };
}

function normalizeCombat(combat: CombatState): CombatState {
  return { ...combat, oncePerCombatKeys: combat.oncePerCombatKeys ?? [] };
}

function ensureCombatShape(combat: CombatState): CombatState {
  combat.oncePerCombatKeys ??= [];
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
    map: generateMap(mulberry32(run.seed + act * 1009), act, pack),
    rngCounter: run.rngCounter ?? 0,
    message: `第 ${act} 幕开始。选择新的路线。`
  };
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function generateMap(random: () => number, act = 1, pack: ContentPack = loadContentPack()): MapNode[] {
  const nodes: MapNode[] = [{ id: "start", type: "start", x: 50, y: 50, neighbors: [], completed: true, visible: true }];
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
        x: clamp(50 + Math.cos(angle) * ring.radius + (random() - 0.5) * 2.4, 6, 94),
        y: clamp(50 + Math.sin(angle) * ring.radius + (random() - 0.5) * 2.4, 6, 94),
        neighbors: [],
        completed: false,
        visible: ringIndex === 0
      });
    }
  });
  const bossPool = pack.enemies.filter((enemy) => enemy.tier === "boss");
  const bossOffset = bossPool.length ? Math.floor(random() * bossPool.length) : 0;
  const bossNodes = Array.from({ length: BOSS_NODE_COUNT }, (_, index) => {
    const encounter = bossPool.length ? bossPool[(bossOffset + index) % bossPool.length] : undefined;
    return {
      id: `boss-${index}`,
      type: "boss" as const,
      encounterId: encounter?.id,
      x: [50, 8, 92][index],
      y: [6, 82, 82][index],
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
  next.threat += 1;
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
    next.activeEvent = pick(events, mulberry32(next.seed + next.movesTaken));
    next.screen = "event";
  } else if (node.type === "shop") {
    next.shopOffer = makeRewardCards(next, 5);
    next.screen = "shop";
  } else if (node.type === "campfire") {
    next.screen = "campfire";
  } else if (node.type === "treasure") {
    next.pendingReward = { type: "gold", amount: 65 + next.threat * 2 };
    next.screen = "treasure";
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
  return next;
}

export function startCombat(run: RunState, nodeType: NodeType): CombatState {
  run.player.physicalArmor = 0;
  run.player.magicArmor = 0;
  const random = mulberry32(run.seed + run.movesTaken * 97);
  const tier = nodeType === "boss" ? "boss" : nodeType === "elite" ? "elite" : "normal";
  const node = run.map.find((item) => item.id === run.currentNodeId);
  const pack = getContentPack(run);
  const boundEnemy = node?.encounterId ? pack.enemies.find((enemy) => enemy.id === node.encounterId && enemy.tier === tier) : undefined;
  const candidates = boundEnemy ? [boundEnemy] : pack.enemies.filter((enemy) => enemy.tier === tier);
  const count = tier === "normal" && random() > 0.45 ? 2 : 1;
  const enemyStates = Array.from({ length: count }, () => toEnemyState(pick(candidates, random), run.threat));
  const drawPile = shuffle(run.deck.map((card) => ({ ...card })), random);
  const combat: CombatState = { enemies: enemyStates, drawPile, hand: [], discardPile: [], exhaustPile: [], turn: 1, log: ["抽取起始手牌。"], oncePerCombatKeys: [] };
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
  const next = clone(run);
  const combat = ensureCombatShape(next.combat!);
  const index = combat.hand.findIndex((card) => card.uid === cardUid);
  if (index < 0) return run;
  const card = combat.hand[index];
  const def = cardDefFrom(card, getContentPack(next));
  const cost = card.cost ?? def.cost;
  if (def.type === "status" || def.type === "curse" || next.player.energy < cost) return run;
  const target = targetEnemyId ? combat.enemies.find((enemy) => enemy.instanceId === targetEnemyId) : combat.enemies[0];
  next.player.energy -= cost;
  combat.hand.splice(index, 1);
  const effects = card.upgraded ? def.upgradedEffects : def.effects;
  const random = consumeRunRandom(next, 3000 + combat.turn);
  resolveEffects(next, effects, { source: "card", sourceOwner: next.player, selectedEnemy: target, card, random });
  applyTriggeredEffects(next, "cardPlayed", { source: "card", sourceOwner: next.player, selectedEnemy: target, card, random });
  if (def.id === "harvest" && target && target.hp <= 0) next.player.gold += card.upgraded ? 12 : 8;
  removeDeadEnemies(next);
  if (def.exhaust || def.type === "power") combat.exhaustPile.push(card);
  else combat.discardPile.push(card);
  pushCombatLog(next, `打出 ${def.name}${card.upgraded ? "+" : ""}。`);
  if (combat.enemies.length === 0) return winCombat(next);
  return next;
}

export function endTurn(run: RunState): RunState {
  if (!run.combat || run.screen !== "combat") return run;
  const next = clone(run);
  const combat = ensureCombatShape(next.combat!);
  applyTriggeredEffects(next, "turnEnd", { source: "character", sourceOwner: next.player, random: consumeRunRandom(next, 7100 + combat.turn) });
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
  applyTurnStartStatuses(next, next.player);
  if (next.player.hp <= 0) {
    next.screen = "gameover";
    next.message = "织网收拢。你倒下了。";
    return next;
  }
  drawCards(next, combat, 5, consumeRunRandom(next, 2000 + combat.turn));
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
  const node = run.map.find((item) => item.id === run.currentNodeId);
  if (node?.type === "boss") {
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
  run.act += 1;
  run.player.physicalArmor = 0;
  run.player.magicArmor = 0;
  run.player.statuses = run.player.statuses.filter((status) => ["strength", "magic", "dexterity", "thorns"].includes(status.id));
  run.combat = undefined;
  run.pendingReward = undefined;
  run.activeEvent = undefined;
  run.shopOffer = undefined;
  run.screen = "map";
  run.currentNodeId = "start";
  run.map = generateMap(mulberry32(run.seed + run.act * 1009), run.act, getContentPack(run));
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
  if (chosen) next.deck.push(chosen);
  next.message = chosen ? `${cardDef(chosen).name} 加入牌组。` : "你跳过了卡牌奖励。";
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
  if (choice.effect === "gainGoldLoseHp") {
    next.player.gold += 45;
    next.player.hp = Math.max(1, next.player.hp - 8);
  } else if (choice.effect === "healGainCurse") {
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 18);
    next.deck.push(makeCard("curse"));
  } else if (choice.effect === "upgradeRandom") {
    upgradeRandom(next);
  }
  next.message = choice.description;
  return completeNode(next);
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

function damageEnemy(run: RunState, enemy: EnemyState, amount: number, kind: DamageKind = "true") {
  const armorKey = kind === "magic" ? "magicArmor" : "physicalArmor";
  const blocked = kind === "true" ? 0 : Math.min(enemy[armorKey], amount);
  if (kind !== "true") enemy[armorKey] -= blocked;
  const loss = amount - blocked;
  enemy.hp -= loss;
  if (loss > 0 || blocked > 0) pushCombatLog(run, `${enemy.name} 受到 ${loss} 点${damageKindLabel(kind)}伤害${blocked > 0 ? `，${blocked} 点被护甲抵消` : ""}。`);
  afterDamage(run, enemy, loss, kind);
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
    boss: "首领"
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
  effects.forEach((effect) => {
    if (!conditionMet(run, effect.condition, context)) return;
    const repeats = effect.times ?? 1;
    for (let i = 0; i < repeats; i += 1) applyParamOperation(run, effect, context);
  });
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
    if (isEnemy(target)) damageEnemy(run, target, adjusted, kind);
    else damagePlayer(run, adjusted, source && isEnemy(source) ? source : undefined, kind);
    return;
  }
  if (effect.param === "hp" && effect.op === "subtract") {
    if (isEnemy(target)) damageEnemy(run, target, amount, "true");
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

