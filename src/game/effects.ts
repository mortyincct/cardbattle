import type { ContentPack, EffectTarget, EffectType, GameEffect, StatusId } from "./types";

export type EffectSourceKind = "card" | "enemy" | "relic";

export const effectTypes: EffectType[] = ["damage", "block", "draw", "gainEnergy", "heal", "gainGold", "applyStatus", "gainStatus", "reduceDamage"];
export const effectTargets: EffectTarget[] = ["self", "player", "selectedEnemy", "allEnemies", "randomEnemy", "source"];
export const statuses: StatusId[] = ["weak", "vulnerable", "poison", "strength", "thorns"];

export const effectTypeLabels: Record<EffectType, string> = {
  damage: "伤害",
  block: "格挡",
  draw: "抽牌",
  gainEnergy: "获得能量",
  heal: "治疗",
  gainGold: "获得金币",
  applyStatus: "施加状态",
  gainStatus: "获得状态",
  reduceDamage: "减伤"
};

export const effectTargetLabels: Record<EffectTarget, string> = {
  self: "自己",
  player: "玩家",
  selectedEnemy: "选中敌人",
  allEnemies: "所有敌人",
  randomEnemy: "随机敌人",
  source: "来源"
};

export const statusLabels: Record<StatusId, string> = {
  weak: "虚弱",
  vulnerable: "易伤",
  poison: "中毒",
  strength: "力量",
  thorns: "荆棘"
};

const oldStatusEffects: Record<string, StatusId> = {
  applyWeak: "weak",
  applyVulnerable: "vulnerable",
  applyPoison: "poison",
  strength: "strength",
  thorns: "thorns",
  gainStrength: "strength"
};

export function createDefaultEffect(source: EffectSourceKind, type: EffectType = "damage"): GameEffect {
  return normalizeEffect({ type, amount: 1 }, source);
}

export function normalizeEffect(input: unknown, source: EffectSourceKind): GameEffect {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const oldType = String(raw.type ?? "damage");
  const amount = Number.isFinite(raw.amount) ? Number(raw.amount) : 1;
  const hits = Number.isFinite(raw.hits) ? Number(raw.hits) : undefined;
  const status = statuses.includes(raw.status as StatusId) ? (raw.status as StatusId) : undefined;
  const target = effectTargets.includes(raw.target as EffectTarget) ? (raw.target as EffectTarget) : undefined;

  if (oldType === "gainBlock") return withDefaults({ type: "block", amount, target: "player" }, source);
  if (oldType === "gainStrength") return withDefaults({ type: "gainStatus", amount, status: "strength", target: "player" }, source);
  if (oldType === "applyStatus") {
    return withDefaults({ type: source === "relic" ? "gainStatus" : "applyStatus", amount, status: status ?? "weak", target }, source);
  }
  if (oldType in oldStatusEffects) {
    const nextType: EffectType = oldType === "strength" || oldType === "thorns" || oldType === "gainStrength" ? "gainStatus" : "applyStatus";
    return withDefaults({ type: nextType, amount, status: oldStatusEffects[oldType], target }, source);
  }
  if (effectTypes.includes(oldType as EffectType)) {
    return withDefaults({ type: oldType as EffectType, amount, status, target, hits }, source);
  }
  return withDefaults({ type: "damage", amount, target, hits }, source);
}

export function normalizeEffects(effects: unknown, source: EffectSourceKind): GameEffect[] {
  return Array.isArray(effects) ? effects.map((effect) => normalizeEffect(effect, source)) : [];
}

export function upgradeContentPack(pack: ContentPack): ContentPack {
  return {
    cards: Object.fromEntries(
      Object.entries(pack.cards ?? {}).map(([key, card]) => [
        key,
        {
          ...card,
          effects: normalizeEffects(card.effects, "card"),
          upgradedEffects: normalizeEffects(card.upgradedEffects, "card")
        }
      ])
    ),
    enemies: (pack.enemies ?? []).map((enemy) => ({
      ...enemy,
      moves: (enemy.moves ?? []).map((move) => ({
        ...move,
        effects: move.effects === undefined ? undefined : normalizeEffects(move.effects, "enemy")
      }))
    })),
    relics: Object.fromEntries(
      Object.entries(pack.relics ?? {}).map(([key, relic]) => [
        key,
        {
          ...relic,
          effects: normalizeEffects(relic.effects, "relic")
        }
      ])
    )
  };
}

export function validateGameEffect(effect: unknown, label: string): string[] {
  const errors: string[] = [];
  if (!effect || typeof effect !== "object") return [`${label} must be an object.`];
  const item = effect as Partial<GameEffect>;
  if (!effectTypes.includes(item.type as EffectType)) errors.push(`${label} has invalid type.`);
  if (!Number.isInteger(item.amount)) errors.push(`${label} amount must be an integer.`);
  if (item.hits !== undefined && (!Number.isInteger(item.hits) || item.hits < 1)) errors.push(`${label} hits must be at least 1.`);
  if (needsTarget(item.type) && !effectTargets.includes(item.target as EffectTarget)) errors.push(`${label} needs a valid target.`);
  if (needsStatus(item.type) && !statuses.includes(item.status as StatusId)) errors.push(`${label} needs a valid status.`);
  return errors;
}

export function describeEffect(effect: GameEffect): string {
  const target = effect.target ? effectTargetLabels[effect.target] : "默认目标";
  const status = effect.status ? statusLabels[effect.status] : "状态";
  const hits = effect.hits && effect.hits > 1 ? `，重复 ${effect.hits} 次` : "";
  if (effect.type === "damage") return `对${target}造成 ${effect.amount} 点伤害${hits}`;
  if (effect.type === "block") return `给予${target} ${effect.amount} 点格挡`;
  if (effect.type === "draw") return `抽 ${effect.amount} 张牌`;
  if (effect.type === "gainEnergy") return `获得 ${effect.amount} 点能量`;
  if (effect.type === "heal") return effect.amount >= 0 ? `治疗 ${effect.amount} 点生命` : `失去 ${Math.abs(effect.amount)} 点生命`;
  if (effect.type === "gainGold") return `获得 ${effect.amount} 金币`;
  if (effect.type === "applyStatus") return `对${target}施加 ${effect.amount} 层${status}`;
  if (effect.type === "gainStatus") return `给予${target} ${effect.amount} 层${status}`;
  return `受到伤害时减少 ${effect.amount} 点伤害`;
}

export function needsStatus(type: EffectType | undefined) {
  return type === "applyStatus" || type === "gainStatus";
}

export function needsTarget(type: EffectType | undefined) {
  return type === "damage" || type === "block" || type === "applyStatus" || type === "gainStatus";
}

function withDefaults(effect: GameEffect, source: EffectSourceKind): GameEffect {
  const type = effect.type;
  const target = effect.target ?? defaultTarget(type, source);
  const next: GameEffect = { type, amount: Number.isFinite(effect.amount) ? effect.amount : 1 };
  if (needsTarget(type) || type === "reduceDamage") next.target = target;
  if (needsStatus(type)) next.status = effect.status ?? (type === "gainStatus" ? "strength" : "weak");
  if (type === "damage" && effect.hits && effect.hits > 1) next.hits = effect.hits;
  return next;
}

function defaultTarget(type: EffectType, source: EffectSourceKind): EffectTarget {
  if (source === "enemy") {
    if (type === "block" || type === "gainStatus") return "source";
    return "player";
  }
  if (source === "relic") return "player";
  if (type === "damage" || type === "applyStatus") return "selectedEnemy";
  return "player";
}
