export type CardType = "attack" | "skill" | "power" | "status" | "curse";
export type Rarity = "basic" | "common" | "uncommon" | "rare";
export type NodeType = "start" | "combat" | "elite" | "event" | "campfire" | "shop" | "treasure" | "boss";
export type Screen = "menu" | "map" | "combat" | "reward" | "event" | "shop" | "campfire" | "treasure" | "gameover";
export type RelicTrigger = "runStart" | "combatStart" | "turnStart" | "cardPlayed" | "playerDamaged" | "combatWon";

export interface Effect {
  type: "damage" | "block" | "draw" | "gainEnergy" | "applyWeak" | "applyVulnerable" | "applyPoison" | "heal" | "strength" | "thorns";
  amount: number;
}

export interface RelicEffect {
  type: "gainBlock" | "gainEnergy" | "draw" | "heal" | "gainGold" | "gainStrength" | "reduceDamage" | "applyStatus";
  amount: number;
  status?: StatusEffect["id"];
}

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  cost: number;
  description: string;
  upgradedDescription: string;
  effects: Effect[];
  upgradedEffects: Effect[];
  exhaust?: boolean;
  ethereal?: boolean;
}

export interface CardInstance {
  uid: string;
  cardId: string;
  upgraded: boolean;
}

export interface StatusEffect {
  id: "weak" | "vulnerable" | "poison" | "strength" | "thorns";
  amount: number;
}

export interface EnemyMove {
  id: string;
  intent: "attack" | "defend" | "buff" | "debuff" | "mixed";
  label: string;
  damage?: number;
  hits?: number;
  block?: number;
  effects?: Effect[];
}

export interface EnemyDefinition {
  id: string;
  name: string;
  tier: "normal" | "elite" | "boss";
  maxHp: number;
  armor: number;
  moves: EnemyMove[];
}

export interface RelicDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  trigger: RelicTrigger;
  effects: RelicEffect[];
}

export interface ContentPack {
  cards: Record<string, CardDefinition>;
  enemies: EnemyDefinition[];
  relics: Record<string, RelicDefinition>;
}

export interface EnemyState {
  instanceId: string;
  definitionId: string;
  name: string;
  maxHp: number;
  hp: number;
  block: number;
  statuses: StatusEffect[];
  moveIndex: number;
  intent: EnemyMove;
}

export interface PlayerState {
  maxHp: number;
  hp: number;
  block: number;
  energy: number;
  maxEnergy: number;
  gold: number;
  statuses: StatusEffect[];
}

export interface MapNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  neighbors: string[];
  completed: boolean;
  visible: boolean;
}

export interface CombatState {
  enemies: EnemyState[];
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  turn: number;
  log: string[];
}

export interface Reward {
  type: "card" | "gold" | "heal" | "remove";
  cards?: CardInstance[];
  amount?: number;
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  effect: "gainGoldLoseHp" | "healGainCurse" | "upgradeRandom" | "skip";
}

export interface GameEvent {
  id: string;
  title: string;
  body: string;
  choices: EventChoice[];
}

export interface RunState {
  saveVersion: number;
  seed: number;
  screen: Screen;
  contentPack?: ContentPack;
  player: PlayerState;
  relics: string[];
  deck: CardInstance[];
  map: MapNode[];
  currentNodeId: string;
  threat: number;
  movesTaken: number;
  combat?: CombatState;
  pendingReward?: Reward;
  activeEvent?: GameEvent;
  shopOffer?: CardInstance[];
  message: string;
  victory: boolean;
}
