import { Activity, Coins, Database, Heart, Map, Play, RotateCcw, Shield, Swords, Zap } from "lucide-react";
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
          <p className="eyebrow">Netspire Prototype</p>
          <h1>Rootless Paths</h1>
        </div>
        <div className="meters">
          <Meter icon={<Heart />} label="HP" value={`${run.player.hp}/${run.player.maxHp}`} tone="blood" />
          <Meter icon={<Coins />} label="Gold" value={run.player.gold} tone="gold" />
          <Meter icon={<Activity />} label="Threat" value={run.threat} tone="threat" />
          <Meter icon={<Map />} label="Act" value={run.act} />
          <Meter icon={<Map />} label="Steps" value={run.movesTaken} />
        </div>
        <button className="toolButton" onClick={() => setMode(mode === "game" ? "editor" : "game")}>
          {mode === "game" ? <Database /> : <Play />}
          {mode === "game" ? "Dev Editor" : "Back to game"}
        </button>
        <button className="iconButton" title="New run" onClick={reset}>
          <RotateCcw />
        </button>
      </header>

      {mode === "editor" ? <ContentEditor initialPack={loadContentPack()} onNewRun={reset} /> : (
      <>
      <section className="statusLine">
        <span>{run.message}</span>
        <span>Current: {labelNode(currentNode, pack)}</span>
        <span>Next enemy tier: +{Math.round((run.threat + 1) * 7.5)}% HP / +{Math.round((run.threat + 1) * 5.5)}% damage</span>
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
      <Panel title="Card Reward">
        <p>Victory gold gained: {run.pendingReward.amount}</p>
        <div className="cardGrid">{run.pendingReward.cards.map((card) => <CardButton key={card.uid} pack={pack} card={card} onClick={() => setRun(chooseRewardCard(run, card.uid))} />)}</div>
        <button className="wideButton" onClick={() => setRun(chooseRewardCard(run))}>Skip card</button>
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
      <Panel title="Lantern Shop">
        <div className="cardGrid">{run.shopOffer?.map((card) => <CardButton key={card.uid} pack={pack} card={card} price={55} disabled={run.player.gold < 55} onClick={() => setRun(buyFromShop(run, card.uid))} />)}</div>
        <button className="wideButton" disabled={run.player.gold < 35} onClick={() => setRun(shopService(run, "heal"))}>Heal 18 HP - 35g</button>
        <button className="wideButton" disabled={run.player.gold < 75 || run.deck.length <= 6} onClick={() => setRun(shopService(run, "remove"))}>Remove a basic card - 75g</button>
        <button className="wideButton" onClick={() => setRun(shopService(run, "leave"))}>Leave shop</button>
      </Panel>
    );
  }
  if (run.screen === "campfire") {
    return (
      <Panel title="Cold Campfire">
        <button className="choice" onClick={() => setRun(restAtCampfire(run, "heal"))}><strong>Rest</strong><span>Recover 22 HP.</span></button>
        <button className="choice" onClick={() => setRun(restAtCampfire(run, "upgrade"))}><strong>Stoke</strong><span>Upgrade a random card.</span></button>
      </Panel>
    );
  }
  if (run.screen === "treasure") {
    return (
      <Panel title="Sunken Cache">
        <p>{run.pendingReward?.amount} gold waits under cracked wax seals.</p>
        <button className="wideButton" onClick={() => setRun(claimTreasure(run))}>Claim treasure</button>
      </Panel>
    );
  }
  if (run.screen === "gameover") {
    return (
      <Panel title={run.victory ? "Victory" : "Defeat"}>
        <p>{run.message}</p>
        <button className="wideButton" onClick={reset}>Start a new run</button>
      </Panel>
    );
  }
  return (
    <Panel title="Run">
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
            <span><Shield size={16} /> P {enemy.physicalArmor}</span>
            <span><Zap size={16} /> M {enemy.magicArmor}</span>
            <span><Swords size={16} /> {intentText(enemy)}</span>
            <StatusList statuses={enemy.statuses} />
          </button>
        ))}
      </div>
      <div className="playerStrip">
        <Meter icon={<Heart />} label="HP" value={`${run.player.hp}/${run.player.maxHp}`} tone="blood" />
        <Meter icon={<Shield />} label="P Armor" value={run.player.physicalArmor} />
        <Meter icon={<Zap />} label="M Armor" value={run.player.magicArmor} tone="gold" />
        <Meter icon={<Zap />} label="Energy" value={`${run.player.energy}/${run.player.maxEnergy}`} tone="gold" />
        <StatusList statuses={run.player.statuses} />
        <button className="endTurn" onClick={onEndTurn}>End Turn</button>
      </div>
      <div className="hand">
        {combat.hand.map((card) => {
          const def = cardDefFrom(card, pack);
          const cost = card.cost ?? def.cost;
          const disabled = cost > run.player.energy || def.type === "status" || def.type === "curse";
          return <CardButton key={card.uid} pack={pack} card={card} disabled={disabled} onClick={() => onPlay(card)} />;
        })}
      </div>
      <div className="combatFooter">
        <span>Draw {combat.drawPile.length}</span>
        <span>Discard {combat.discardPile.length}</span>
        <span>Exhaust {combat.exhaustPile.length}</span>
        <span>Turn {combat.turn}</span>
      </div>
    </section>
  );
}

function CardButton({ card, pack, onClick, disabled, price }: { card: CardInstance; pack: ContentPack; onClick: () => void; disabled?: boolean; price?: number }) {
  const def = cardDefFrom(card, pack);
  return (
    <button className={`card ${def.type}`} onClick={onClick} disabled={disabled}>
      <span className="cost">{card.cost ?? def.cost}</span>
      <strong>{def.name}{card.upgraded ? "+" : ""}</strong>
      <small>{def.type} · {def.rarity}</small>
      <p>{card.upgraded ? def.upgradedDescription : def.description}</p>
      {price ? <em>{price}g</em> : null}
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
  if (statuses.length === 0) return <span className="statuses">No status</span>;
  return <span className="statuses">{statuses.map((status) => `${status.id} ${status.amount}`).join(" · ")}</span>;
}

function labelNode(node?: MapNode, pack?: ContentPack) {
  if (!node) return "Unknown";
  if (node.type === "boss" && node.encounterId) return pack?.enemies.find((enemy) => enemy.id === node.encounterId)?.name ?? "Boss";
  return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

function nodeIcon(type: string) {
  const icons: Record<string, string> = { start: "◆", combat: "⚔", elite: "♜", event: "?", campfire: "♨", shop: "$", treasure: "◈", boss: "☠" };
  return icons[type] ?? "•";
}

function intentText(enemy: EnemyState) {
  const move = enemy.intent;
  const parts = [
    move.damage ? `${move.damage}x${move.hits ?? 1}` : "",
    move.block ? `Block ${move.block}` : "",
    ...(move.effects ?? []).map((effect) => `${effect.op} ${effect.amount ?? ""} ${effect.param}`.trim())
  ].filter(Boolean);
  return parts.join(" + ") || move.label;
}
