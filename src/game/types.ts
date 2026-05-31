export type CardType = "attack" | "skill" | "power" | "status" | "curse";
export type Rarity = "basic" | "common" | "uncommon" | "rare";
export type NodeType = "start" | "combat" | "elite" | "event" | "campfire" | "shop" | "treasure" | "boss";
export type Screen = "menu" | "map" | "combat" | "reward" | "event" | "shop" | "campfire" | "treasure" | "gameover";
export type EffectTrigger = "runStart" | "combatStart" | "turnStart" | "turnEnd" | "cardPlayed" | "beforeDamageTaken" | "playerDamaged" | "enemyKilled" | "combatWon" | "cardDrawn" | "statusApplied";
export type RelicTrigger = EffectTrigger;
export type EffectTarget = "self" | "selectedEnemy" | "player" | "sourceOwner" | "allEnemies" | "randomEnemy" | "allCombatants";
export type EffectParam = "hp" | "maxHp" | "physicalDamage" | "magicDamage" | "physicalArmor" | "magicArmor" | "energy" | "maxEnergy" | "gold" | "statusAmount" | "upgraded" | "cost" | "cards" | "turn" | "threat" | "movesTaken";
export type EffectOperation = "add" | "subtract" | "set" | "multiply" | "move" | "create" | "remove" | "clear";
export type CardZone = "drawPile" | "hand" | "discardPile" | "exhaustPile" | "deck";
export type CardFilter = "any" | CardType | Rarity | "upgraded" | "notUpgraded";
export type ConditionOperator = "equals" | "notEquals" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual";

export interface EffectCondition {
  target?: EffectTarget;
  param: EffectParam;
  op: ConditionOperator;
  amount?: number;
  status?: StatusEffect["id"];
}

export interface Effect {
  target: EffectTarget;
  param: EffectParam;
  op: EffectOperation;
  amount?: number;
  status?: StatusEffect["id"];
  fromZone?: CardZone;
  toZone?: CardZone;
  cardFilter?: CardFilter;
  times?: number;
  condition?: EffectCondition;
}

export interface TriggeredEffect {
  trigger: EffectTrigger;
  effects: Effect[];
  condition?: EffectCondition;
  oncePerCombat?: boolean;
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
  cost?: number;
}

export interface StatusEffect {
  id: "weak" | "vulnerable" | "frail" | "poison" | "burn" | "bleed" | "strength" | "magic" | "dexterity" | "thorns" | "regen" | "platedArmor" | "artifact" | "intangible";
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
  effects: Effect[];
}

export interface CharacterDefinition {
  id: string;
  name: string;
  maxHp: number;
  maxEnergy: number;
  gold: number;
  starterDeck: string[];
  starterRelics: string[];
  passives: TriggeredEffect[];
}

export interface ContentPack {
  cards: Record<string, CardDefinition>;
  enemies: EnemyDefinition[];
  relics: Record<string, RelicDefinition>;
  characters: Record<string, CharacterDefinition>;
  defaultCharacterId: string;
}

export interface EnemyState {
  instanceId: string;
  definitionId: string;
  name: string;
  maxHp: number;
  hp: number;
  physicalArmor: number;
  magicArmor: number;
  statuses: StatusEffect[];
  moveIndex: number;
  intent: EnemyMove;
}

export interface PlayerState {
  maxHp: number;
  hp: number;
  physicalArmor: number;
  magicArmor: number;
  energy: number;
  maxEnergy: number;
  gold: number;
  statuses: StatusEffect[];
}

export interface MapNode {
  id: string;
  type: NodeType;
  encounterId?: string;
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
  oncePerCombatKeys: string[];
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
  act: number;
  screen: Screen;
  contentPack?: ContentPack;
  characterId?: string;
  player: PlayerState;
  relics: string[];
  deck: CardInstance[];
  map: MapNode[];
  currentNodeId: string;
  threat: number;
  movesTaken: number;
  rngCounter: number;
  combat?: CombatState;
  pendingReward?: Reward;
  activeEvent?: GameEvent;
  shopOffer?: CardInstance[];
  message: string;
  victory: boolean;
}
