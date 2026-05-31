import { cards, enemies, events, loadContentPack, normalizeContentPack } from "./content";
import { mulberry32, pick, shuffle, uid } from "./rng";
import type { CardDefinition, CardFilter, CardInstance, CardZone, CombatState, ContentPack, Effect, EffectParam, EffectTarget, EnemyDefinition, EnemyMove, EnemyState, GameEvent, MapNode, NodeType, RelicTrigger, Reward, RunState, StatusEffect } from "./types";

export const SAVE_KEY = "netspire-save";
export const SAVE_VERSION = 5;
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
    message: "The net opens. Choose a neighboring node.",
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
  const parsed = JSON.parse(raw) as RunState;
  if (parsed.saveVersion === SAVE_VERSION) return { ...parsed, contentPack: parsed.contentPack ? normalizeContentPack(parsed.contentPack) : undefined };
  if (parsed.saveVersion >= 1 && parsed.saveVersion < SAVE_VERSION) return migrateLegacyRun(parsed);
  return undefined;
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
    message: `Act ${act} begins. Choose a new path.`
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
    next.message = "You pass through a quiet, already-cleared place.";
    return next;
  }
  if (node.type === "combat" || node.type === "elite" || node.type === "boss") {
    next.combat = startCombat(next, node.type);
    next.screen = "combat";
    next.message = `A ${node.type === "boss" ? "boss" : node.type} fight begins.`;
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
  const combat: CombatState = { enemies: enemyStates, drawPile, hand: [], discardPile: [], exhaustPile: [], turn: 1, log: ["Draw your opening hand."] };
  drawCards(combat, 5, random);
  const next = { ...run, combat };
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
  const combat = next.combat!;
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
  resolveEffects(next, effects, { source: "card", sourceOwner: next.player, selectedEnemy: target, card });
  applyTriggeredEffects(next, "cardPlayed", { source: "card", sourceOwner: next.player, selectedEnemy: target, card });
  if (def.id === "harvest" && target && target.hp <= 0) next.player.gold += card.upgraded ? 12 : 8;
  combat.enemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  if (def.exhaust || def.type === "power") combat.exhaustPile.push(card);
  else combat.discardPile.push(card);
  combat.log.unshift(`Played ${def.name}.`);
  if (combat.enemies.length === 0) return winCombat(next);
  return next;
}

export function endTurn(run: RunState): RunState {
  if (!run.combat || run.screen !== "combat") return run;
  const next = clone(run);
  const combat = next.combat!;
  combat.discardPile.push(...combat.hand);
  combat.hand = [];
  combat.enemies.forEach((enemy) => {
    enemy.physicalArmor = 0;
    triggerPoison(enemy);
    if (enemy.hp <= 0) return;
    resolveEnemyMove(next, enemy, enemy.intent);
  });
  combat.enemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  if (next.player.hp <= 0) {
    next.screen = "gameover";
    next.message = "The net closes. You died.";
    return next;
  }
  if (combat.enemies.length === 0) return winCombat(next);
  tickStatuses(next.player.statuses);
  combat.enemies.forEach((enemy) => {
    tickStatuses(enemy.statuses);
    const def = scaleEnemy(getContentPack(next).enemies.find((item) => item.id === enemy.definitionId) ?? enemies.find((item) => item.id === enemy.definitionId)!, next.threat);
    enemy.moveIndex = (enemy.moveIndex + 1) % def.moves.length;
    enemy.intent = def.moves[enemy.moveIndex];
  });
  next.player.physicalArmor = 0;
  next.player.energy = next.player.maxEnergy;
  combat.turn += 1;
  drawCards(combat, 5, Math.random);
  applyTriggeredEffects(next, "turnStart", { source: "character", sourceOwner: next.player });
  combat.log.unshift(`Turn ${combat.turn} begins.`);
  return next;
}

function resolveEnemyMove(run: RunState, enemy: EnemyState, move: EnemyMove) {
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
  resolveEffects(run, move.effects ?? [], { source: "enemy", sourceOwner: enemy });
  run.combat!.log.unshift(`${enemy.name}: ${move.label}.`);
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
  run.message = "Victory. Choose a card reward.";
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
  run.message = `Act ${run.act} begins. Choose a new path.`;
  return run;
}

function winRun(run: RunState): RunState {
  run.screen = "gameover";
  run.victory = true;
  run.message = `The Act ${MAX_ACT} boss falls. The Rootless Paths open.`;
  clearSave();
  return run;
}

export function chooseRewardCard(run: RunState, cardUid?: string): RunState {
  if (!run.pendingReward || run.screen !== "reward") return run;
  const next = clone(run);
  const chosen = cardUid ? next.pendingReward!.cards?.find((card) => card.uid === cardUid) : undefined;
  if (chosen) next.deck.push(chosen);
  next.message = chosen ? `${cardDef(chosen).name} joins the deck.` : "You skip the card reward.";
  return completeNode(next);
}

export function claimTreasure(run: RunState): RunState {
  if (!run.pendingReward || run.screen !== "treasure") return run;
  const next = clone(run);
  const amount = next.pendingReward?.amount ?? 0;
  next.player.gold += amount;
  next.message = `Found ${amount} gold.`;
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
    next.message = "You rest under cold sparks.";
  } else {
    upgradeRandom(next);
    next.message = "A card sharpens in the firelight.";
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
  next.message = `${cardDef(card).name} purchased.`;
  return next;
}

export function shopService(run: RunState, action: "heal" | "remove" | "leave"): RunState {
  if (run.screen !== "shop") return run;
  const next = clone(run);
  if (action === "heal" && next.player.gold >= 35) {
    next.player.gold -= 35;
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 18);
    next.message = "A bitter tonic closes old cuts.";
    return next;
  }
  if (action === "remove" && next.player.gold >= 75 && next.deck.length > 6) {
    next.player.gold -= 75;
    const removable = next.deck.find((card) => card.cardId === "strike") ?? next.deck.find((card) => card.cardId === "guard") ?? next.deck[0];
    next.deck = next.deck.filter((card) => card.uid !== removable.uid);
    next.message = `${cardDef(removable).name} removed.`;
    return next;
  }
  return completeNode(next);
}

function makeRewardCards(run: RunState, amount: number): CardInstance[] {
  const random = mulberry32(run.seed + run.movesTaken * 131 + run.threat);
  const rewardCardPool = Object.values(getContentPack(run).cards).filter((card) => !["basic", "status", "curse"].includes(card.rarity));
  return Array.from({ length: amount }, () => makeCard(pick(rewardCardPool, random).id, random() > 0.88));
}

function drawCards(combat: CombatState, amount: number, random: () => number) {
  for (let i = 0; i < amount; i += 1) {
    if (combat.drawPile.length === 0) {
      combat.drawPile = shuffle(combat.discardPile, random);
      combat.discardPile = [];
    }
    const drawn = combat.drawPile.shift();
    if (drawn) combat.hand.push(drawn);
  }
}

type DamageKind = "physical" | "magic" | "true";

function damageEnemy(enemy: EnemyState, amount: number, kind: DamageKind = "true") {
  const armorKey = kind === "magic" ? "magicArmor" : "physicalArmor";
  const blocked = kind === "true" ? 0 : Math.min(enemy[armorKey], amount);
  if (kind !== "true") enemy[armorKey] -= blocked;
  enemy.hp -= amount - blocked;
}

function damagePlayer(run: RunState, amount: number, source?: EnemyState, kind: DamageKind = "true") {
  const poison = getStatus(run.player.statuses, "poison");
  if (poison > 0) run.player.hp -= poison;
  applyTriggeredEffects(run, "beforeDamageTaken", { source: "enemy", sourceOwner: source, selectedEnemy: source });
  const armorKey = kind === "magic" ? "magicArmor" : "physicalArmor";
  const blocked = kind === "true" ? 0 : Math.min(run.player[armorKey], amount);
  if (kind !== "true") run.player[armorKey] -= blocked;
  run.player.hp -= amount - blocked;
  if (source && amount > 0) {
    const thorns = getStatus(run.player.statuses, "thorns");
    if (thorns > 0) damageEnemy(source, thorns, "true");
  }
  if (amount > 0) applyTriggeredEffects(run, "playerDamaged", { source: "enemy", sourceOwner: source, selectedEnemy: source });
}

function triggerPoison(enemy: EnemyState) {
  const poison = getStatus(enemy.statuses, "poison");
  if (poison > 0) {
    enemy.hp -= poison;
    const status = enemy.statuses.find((item) => item.id === "poison");
    if (status) status.amount = Math.max(0, status.amount - 1);
  }
}

function tickStatuses(statuses: StatusEffect[]) {
  statuses.forEach((status) => {
    if (status.id === "weak" || status.id === "vulnerable") status.amount -= 1;
  });
  for (let i = statuses.length - 1; i >= 0; i -= 1) {
    if (statuses[i].amount <= 0) statuses.splice(i, 1);
  }
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
  return event?.title ?? "Strange Silence";
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
    run.combat?.log.unshift(`${relic.name} triggered.`);
  });
  const character = pack.characters[run.characterId ?? pack.defaultCharacterId];
  character?.passives.forEach((passive) => {
    if (passive.trigger !== trigger || !conditionMet(run, passive.condition, context)) return;
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
      applyStatusOperation(target.statuses, effect.status, effect.op, effect.amount ?? 0);
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
    const random = context.random ?? Math.random;
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
    if (isEnemy(target)) damageEnemy(target, adjusted, kind);
    else damagePlayer(run, adjusted, source && isEnemy(source) ? source : undefined, kind);
    return;
  }
  if (effect.param === "hp" && effect.op === "subtract") {
    if (isEnemy(target)) damageEnemy(target, amount, "true");
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
    target[effect.param] = Math.max(0, applyNumberOp(target[effect.param], effect.op, armorAmount));
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
      drawCards(run.combat, amount, context.random ?? Math.random);
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

function applyStatusOperation(statuses: StatusEffect[], id: StatusEffect["id"], op: Effect["op"], amount: number) {
  if (op === "clear") {
    const index = statuses.findIndex((status) => status.id === id);
    if (index >= 0) statuses.splice(index, 1);
    return;
  }
  const current = getStatus(statuses, id);
  const next = Math.max(0, applyNumberOp(current, op, amount));
  const existing = statuses.find((status) => status.id === id);
  if (existing) existing.amount = next;
  else if (next > 0) statuses.push({ id, amount: next });
  for (let i = statuses.length - 1; i >= 0; i -= 1) {
    if (statuses[i].amount <= 0) statuses.splice(i, 1);
  }
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

