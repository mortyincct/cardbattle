import { Activity, CircleDot, Coins, Crown, Database, Flame, Gem, Heart, HelpCircle, Map, Play, RotateCcw, Shield, ShoppingBag, Swords, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cards, loadContentPack } from "../game/content";
import { applyEventChoice, buyFromShop, cardDefFrom, chooseRewardCard, claimTreasure, clearSave, endTurn, loadRun, moveToNode, newRun, playCard, restAtCampfire, saveRun, shopService } from "../game/state";
import type { CardInstance, ContentPack, EnemyState, MapNode, RunState } from "../game/types";
import { ContentEditor } from "./ContentEditor";

export function App() {
  const [run, setRun] = useState<RunState>(() => loadRun() ?? newRun());
  const [mode, setMode] = useState<"game" | "editor">("game");
  const [selectedEnemy, setSelectedEnemy] = useState<string | undefined>();

  useEffect(() => {
    if (run.screen !== "gameover") saveRun(run);
  }, [run]);

  const currentNode = useMemo(() => run.map.find((node) => node.id === run.currentNodeId), [run]);
  const selectedTarget = run.combat?.enemies.find((enemy) => enemy.instanceId === selectedEnemy) ?? run.combat?.enemies[0];

  const reset = () => {
    clearSave();
    setRun(newRun());
    setSelectedEnemy(undefined);
  };

  const pack = run.contentPack ?? loadContentPack();

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">织网原型</p>
          <h1>Rootless Paths</h1>
        </div>
        <div className="meters">
          <Meter icon={<Heart />} label="生命" value={`${run.player.hp}/${run.player.maxHp}`} tone="blood" />
          <Meter icon={<Coins />} label="金币" value={run.player.gold} tone="gold" />
          <Meter icon={<Activity />} label="威胁" value={run.threat} tone="threat" />
          <Meter icon={<Map />} label="幕" value={run.act} />
          <Meter icon={<Map />} label="步数" value={run.movesTaken} />
        </div>
        <button className="toolButton" onClick={() => setMode(mode === "game" ? "editor" : "game")}>
          {mode === "game" ? <Database /> : <Play />}
          {mode === "game" ? "开发编辑器" : "返回游戏"}
        </button>
        <button className="iconButton" title="新一局" onClick={reset}>
          <RotateCcw />
        </button>
      </header>

      {mode === "editor" ? <ContentEditor initialPack={loadContentPack()} onNewRun={reset} /> : (
      <>
      <section className="statusLine">
        <span>{run.message}</span>
        <span>当前位置：{labelNode(currentNode, pack)}</span>
        <span>下一层敌人：生命 +{Math.round((run.threat + 1) * 7.5)}% / 伤害 +{Math.round((run.threat + 1) * 5.5)}%</span>
      </section>

      {run.screen === "combat" && run.combat ? (
        <CombatView run={run} pack={pack} selectedEnemy={selectedTarget} onSelectEnemy={setSelectedEnemy} onPlay={(card) => setRun(playCard(run, card.uid, selectedTarget?.instanceId))} onEndTurn={() => setRun(endTurn(run))} />
      ) : (
        <div className="layout">
          <MapView run={run} pack={pack} onMove={(nodeId) => setRun(moveToNode(run, nodeId))} />
          <SidePanel run={run} pack={pack} setRun={setRun} reset={reset} />
        </div>
      )}
      </>
      )}
    </main>
  );
}

function Meter({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: string | number; tone?: string }) {
  return (
    <div className={`meter ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MapView({ run, pack, onMove }: { run: RunState; pack: ContentPack; onMove: (nodeId: string) => void }) {
  const current = run.map.find((node) => node.id === run.currentNodeId)!;
  return (
    <section className="mapStage">
      <svg viewBox="0 0 100 100" className="mapLines" aria-hidden="true">
        {run.map.flatMap((node) =>
          node.neighbors
            .filter((neighbor) => node.id < neighbor)
            .map((neighbor) => {
              const target = run.map.find((item) => item.id === neighbor)!;
              const active = node.id === run.currentNodeId || target.id === run.currentNodeId;
              return <line key={`${node.id}-${neighbor}`} x1={node.x} y1={node.y} x2={target.x} y2={target.y} className={active ? "line active" : "line"} />;
            })
        )}
      </svg>
      {run.map.map((node) => {
        const reachable = current.neighbors.includes(node.id) && node.visible && run.screen === "map";
        return (
          <button
            key={node.id}
            className={`node ${node.type} ${node.id === run.currentNodeId ? "current" : ""} ${node.completed ? "done" : ""} ${node.visible ? "visible" : "hidden"}`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            disabled={!reachable}
            title={labelNode(node, pack)}
            onClick={() => onMove(node.id)}
          >
            <span className="nodeGlyph" aria-hidden="true">{nodeIcon(node.type)}</span>
          </button>
        );
      })}
    </section>
  );
}

function SidePanel({ run, pack, setRun, reset }: { run: RunState; pack: ContentPack; setRun: (run: RunState) => void; reset: () => void }) {
  if (run.screen === "reward" && run.pendingReward?.cards) {
    return (
      <Panel title="卡牌奖励">
        <p>战斗金币：{run.pendingReward.amount}</p>
        <div className="cardGrid">{run.pendingReward.cards.map((card) => <CardButton key={card.uid} pack={pack} card={card} onClick={() => setRun(chooseRewardCard(run, card.uid))} />)}</div>
        <button className="wideButton" onClick={() => setRun(chooseRewardCard(run))}>跳过卡牌</button>
      </Panel>
    );
  }
  if (run.screen === "event" && run.activeEvent) {
    return (
      <Panel title={run.activeEvent.title}>
        <p>{run.activeEvent.body}</p>
        {run.activeEvent.choices.map((choice) => (
          <button className="choice" key={choice.id} onClick={() => setRun(applyEventChoice(run, choice.id))}>
            <strong>{choice.label}</strong>
            <span>{choice.description}</span>
          </button>
        ))}
      </Panel>
    );
  }
  if (run.screen === "shop") {
    return (
      <Panel title="提灯商店">
        <div className="cardGrid">{run.shopOffer?.map((card) => <CardButton key={card.uid} pack={pack} card={card} price={55} disabled={run.player.gold < 55} onClick={() => setRun(buyFromShop(run, card.uid))} />)}</div>
        <button className="wideButton" disabled={run.player.gold < 35} onClick={() => setRun(shopService(run, "heal"))}>恢复 18 生命 - 35 金币</button>
        <button className="wideButton" disabled={run.player.gold < 75 || run.deck.length <= 6} onClick={() => setRun(shopService(run, "remove"))}>移除一张基础牌 - 75 金币</button>
        <button className="wideButton" onClick={() => setRun(shopService(run, "leave"))}>离开商店</button>
      </Panel>
    );
  }
  if (run.screen === "campfire") {
    return (
      <Panel title="冷火营地">
        <button className="choice" onClick={() => setRun(restAtCampfire(run, "heal"))}><strong>休息</strong><span>恢复 22 点生命。</span></button>
        <button className="choice" onClick={() => setRun(restAtCampfire(run, "upgrade"))}><strong>添火</strong><span>随机升级一张牌。</span></button>
      </Panel>
    );
  }
  if (run.screen === "treasure") {
    return (
      <Panel title="沉没宝箱">
        <p>裂开的蜡封下藏着 {run.pendingReward?.amount} 金币。</p>
        <button className="wideButton" onClick={() => setRun(claimTreasure(run))}>拿走宝物</button>
      </Panel>
    );
  }
  if (run.screen === "gameover") {
    return (
      <Panel title={run.victory ? "胜利" : "失败"}>
        <p>{run.message}</p>
        <button className="wideButton" onClick={reset}>开始新一局</button>
      </Panel>
    );
  }
  return (
    <Panel title="本局状态">
      <RelicList run={run} pack={pack} />
      <DeckList deck={run.deck} pack={pack} />
    </Panel>
  );
}

function CombatView({ run, pack, selectedEnemy, onSelectEnemy, onPlay, onEndTurn }: { run: RunState; pack: ContentPack; selectedEnemy?: EnemyState; onSelectEnemy: (id: string) => void; onPlay: (card: CardInstance) => void; onEndTurn: () => void }) {
  const combat = run.combat!;
  return (
    <section className="combat">
      <div className="enemyRow">
        {combat.enemies.map((enemy) => (
          <button key={enemy.instanceId} className={`enemy ${selectedEnemy?.instanceId === enemy.instanceId ? "selected" : ""}`} onClick={() => onSelectEnemy(enemy.instanceId)}>
            <strong>{enemy.name}</strong>
            <span><Heart size={16} /> {enemy.hp}/{enemy.maxHp}</span>
            <span><Shield size={16} /> 物甲 {enemy.physicalArmor}</span>
            <span><Zap size={16} /> 魔甲 {enemy.magicArmor}</span>
            <span><Swords size={16} /> {intentText(enemy)}</span>
            <StatusList statuses={enemy.statuses} />
          </button>
        ))}
      </div>
      <div className="playerStrip">
        <Meter icon={<Heart />} label="生命" value={`${run.player.hp}/${run.player.maxHp}`} tone="blood" />
        <Meter icon={<Shield />} label="物甲" value={run.player.physicalArmor} />
        <Meter icon={<Zap />} label="魔甲" value={run.player.magicArmor} tone="gold" />
        <Meter icon={<Zap />} label="能量" value={`${run.player.energy}/${run.player.maxEnergy}`} tone="gold" />
        <StatusList statuses={run.player.statuses} />
        <button className="endTurn" onClick={onEndTurn}>结束回合</button>
      </div>
      <div className="combatMain">
        <div className="hand">
          {combat.hand.map((card) => {
            const def = cardDefFrom(card, pack);
            const cost = card.cost ?? def.cost;
            const disabled = cost > run.player.energy || def.type === "status" || def.type === "curse";
            return <CardButton key={card.uid} pack={pack} card={card} disabled={disabled} onClick={() => onPlay(card)} />;
          })}
        </div>
        <CombatLog log={combat.log} />
      </div>
      <div className="combatFooter">
        <span>抽牌堆 {combat.drawPile.length}</span>
        <span>弃牌堆 {combat.discardPile.length}</span>
        <span>消耗堆 {combat.exhaustPile.length}</span>
        <span>第 {combat.turn} 回合</span>
      </div>
    </section>
  );
}

function CombatLog({ log }: { log: string[] }) {
  return (
    <aside className="combatLog">
      <h2>战斗日志</h2>
      {log.slice(0, 8).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
    </aside>
  );
}

function CardButton({ card, pack, onClick, disabled, price }: { card: CardInstance; pack: ContentPack; onClick: () => void; disabled?: boolean; price?: number }) {
  const def = cardDefFrom(card, pack);
  return (
    <button className={`card ${def.type}`} onClick={onClick} disabled={disabled}>
      <span className="cost">{card.cost ?? def.cost}</span>
      <strong>{def.name}{card.upgraded ? "+" : ""}</strong>
      <small>{cardTypeLabel(def.type)} / {rarityLabel(def.rarity)}</small>
      <p>{card.upgraded ? def.upgradedDescription : def.description}</p>
      {price ? <em>{price} 金币</em> : null}
    </button>
  );
}

function DeckList({ deck, pack }: { deck: CardInstance[]; pack: ContentPack }) {
  const grouped = deck.reduce<Record<string, number>>((acc, card) => {
    const key = `${(pack.cards[card.cardId] ?? cards[card.cardId]).name}${card.upgraded ? "+" : ""}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="deckList">
      {Object.entries(grouped).map(([name, count]) => <span key={name}>{count}x {name}</span>)}
    </div>
  );
}

function RelicList({ run, pack }: { run: RunState; pack: ContentPack }) {
  if (!run.relics.length) return null;
  return (
    <div className="relicList">
      {run.relics.map((id) => {
        const relic = pack.relics[id];
        return relic ? <span key={id} title={relic.description}>{relic.name}</span> : null;
      })}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="panel">
      <h2>{title}</h2>
      {children}
    </aside>
  );
}

function StatusList({ statuses }: { statuses: { id: string; amount: number }[] }) {
  if (statuses.length === 0) return <span className="statuses">无状态</span>;
  return <span className="statuses">{statuses.map((status) => `${statusLabel(status.id)} ${status.amount}`).join(" / ")}</span>;
}

function labelNode(node?: MapNode, pack?: ContentPack) {
  if (!node) return "未知";
  if (node.type === "boss" && node.encounterId) return pack?.enemies.find((enemy) => enemy.id === node.encounterId)?.name ?? "首领";
  return nodeTypeLabel(node.type);
}

function nodeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    start: <CircleDot />,
    combat: <Swords />,
    elite: <Shield />,
    event: <HelpCircle />,
    campfire: <Flame />,
    shop: <ShoppingBag />,
    treasure: <Gem />,
    boss: <Crown />
  };
  return icons[type] ?? <CircleDot />;
}

function nodeTypeLabel(type: string) {
  const labels: Record<string, string> = {
    start: "起点",
    combat: "普通战斗",
    elite: "精英",
    event: "事件",
    campfire: "营火",
    shop: "商店",
    treasure: "宝箱",
    boss: "首领"
  };
  return labels[type] ?? "未知";
}

function cardTypeLabel(type: string) {
  const labels: Record<string, string> = {
    attack: "攻击",
    skill: "技能",
    power: "能力",
    status: "状态",
    curse: "诅咒"
  };
  return labels[type] ?? type;
}

function rarityLabel(rarity: string) {
  const labels: Record<string, string> = {
    basic: "基础",
    common: "普通",
    uncommon: "罕见",
    rare: "稀有"
  };
  return labels[rarity] ?? rarity;
}

function statusLabel(id: string) {
  const labels: Record<string, string> = {
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
  return labels[id] ?? id;
}

function intentText(enemy: EnemyState) {
  const move = enemy.intent;
  const parts = [
    move.damage ? `${move.damage}x${move.hits ?? 1}` : "",
    move.block ? `格挡 ${move.block}` : "",
    ...(move.effects ?? []).map((effect) => effectIntentText(effect.op, effect.amount, effect.param))
  ].filter(Boolean);
  return parts.join(" + ") || move.label;
}

function effectIntentText(op: string, amount: number | undefined, param: string) {
  const paramText: Record<string, string> = {
    physicalDamage: "物理伤害",
    magicDamage: "魔法伤害",
    physicalArmor: "物理护甲",
    magicArmor: "魔法护甲",
    hp: "生命",
    statusAmount: "状态",
    energy: "能量",
    gold: "金币",
    cards: "卡牌"
  };
  const opText: Record<string, string> = {
    add: "+",
    subtract: "-",
    set: "设为",
    multiply: "x",
    move: "移动",
    create: "生成",
    remove: "移除",
    clear: "清除"
  };
  return `${opText[op] ?? op} ${amount ?? ""} ${paramText[param] ?? param}`.trim();
}
