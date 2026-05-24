import { Copy, Download, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { clearContentDraft, defaultContentPack, saveContentDraft, validateContentPack } from "../game/content";
import type { CardDefinition, CardType, ContentPack, Effect, EnemyDefinition, EnemyMove, Rarity, RelicDefinition, RelicEffect, RelicTrigger } from "../game/types";

type Tab = "cards" | "enemies" | "relics";

const cardTypes: CardType[] = ["attack", "skill", "power", "status", "curse"];
const rarities: Rarity[] = ["basic", "common", "uncommon", "rare"];
const effectTypes: Effect["type"][] = ["damage", "block", "draw", "gainEnergy", "applyWeak", "applyVulnerable", "applyPoison", "heal", "strength", "thorns"];
const intents: EnemyMove["intent"][] = ["attack", "defend", "buff", "debuff", "mixed"];
const tiers: EnemyDefinition["tier"][] = ["normal", "elite", "boss"];
const relicTriggers: RelicTrigger[] = ["runStart", "combatStart", "turnStart", "cardPlayed", "playerDamaged", "combatWon"];
const relicEffectTypes: RelicEffect["type"][] = ["gainBlock", "gainEnergy", "draw", "heal", "gainGold", "gainStrength", "reduceDamage", "applyStatus"];
const statuses: NonNullable<RelicEffect["status"]>[] = ["weak", "vulnerable", "poison", "strength", "thorns"];

export function ContentEditor({ initialPack, onNewRun }: { initialPack: ContentPack; onNewRun: () => void }) {
  const [pack, setPack] = useState<ContentPack>(() => clone(initialPack));
  const [tab, setTab] = useState<Tab>("cards");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => Object.keys(initialPack.cards)[0] ?? "");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("Draft edits are local until saved.");
  const validation = useMemo(() => validateContentPack(pack), [pack]);
  const exportText = useMemo(() => JSON.stringify(pack, null, 2), [pack]);

  const selectTab = (next: Tab) => {
    setTab(next);
    setQuery("");
    setSelected(firstId(pack, next));
  };

  const saveDraft = () => {
    const result = validateContentPack(pack);
    if (!result.valid) {
      setMessage("Fix validation errors before saving.");
      return;
    }
    saveContentDraft(pack);
    setMessage("Draft saved. New runs will use this content.");
  };

  const resetDraft = () => {
    clearContentDraft();
    const next = clone(defaultContentPack);
    setPack(next);
    setSelected(firstId(next, tab));
    setMessage("Draft reset to default content.");
    onNewRun();
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText) as ContentPack;
      const result = validateContentPack(parsed);
      if (!result.valid) {
        setMessage(`Import blocked: ${result.errors[0]}`);
        return;
      }
      setPack(parsed);
      setSelected(firstId(parsed, tab));
      setMessage("Import loaded. Save draft to use it for new runs.");
    } catch {
      setMessage("Import blocked: invalid JSON.");
    }
  };

  return (
    <section className="editor">
      <div className="editorHeader">
        <div>
          <p className="eyebrow">Internal Tool</p>
          <h2>Content Editor</h2>
        </div>
        <div className="editorActions">
          <button className="toolButton" onClick={saveDraft}><Save /> Save draft</button>
          <button className="toolButton" onClick={resetDraft}><RotateCcw /> Reset defaults</button>
        </div>
      </div>
      <div className="tabs">
        {(["cards", "enemies", "relics"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => selectTab(item)}>{item}</button>)}
      </div>
      <div className="editorStatus">
        <span>{message}</span>
        <span className={validation.valid ? "ok" : "warn"}>{validation.valid ? "Content valid" : `${validation.errors.length} validation issue(s)`}</span>
      </div>
      {!validation.valid ? <div className="errorList">{validation.errors.slice(0, 6).map((error) => <span key={error}>{error}</span>)}</div> : null}
      <div className="editorBody">
        <EditorList pack={pack} tab={tab} selected={selected} query={query} setQuery={setQuery} onSelect={setSelected} onAdd={() => addEntry(tab, pack, setPack, setSelected)} onCopy={() => copyEntry(tab, selected, pack, setPack, setSelected)} />
        <div className="editorForm">
          {tab === "cards" ? <CardForm pack={pack} id={selected} setPack={setPack} setSelected={setSelected} /> : null}
          {tab === "enemies" ? <EnemyForm pack={pack} id={selected} setPack={setPack} setSelected={setSelected} /> : null}
          {tab === "relics" ? <RelicForm pack={pack} id={selected} setPack={setPack} setSelected={setSelected} /> : null}
          <button className="dangerButton" onClick={() => deleteEntry(tab, selected, pack, setPack, setSelected)}><Trash2 /> Delete selected</button>
        </div>
      </div>
      <div className="jsonTools">
        <label>
          Export JSON
          <textarea readOnly value={exportText} />
        </label>
        <label>
          Import JSON
          <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste a content pack JSON here." />
        </label>
        <button className="toolButton" onClick={importJson}><Upload /> Import</button>
        <button className="toolButton" onClick={() => setMessage("Export JSON is ready in the text area.")}><Download /> Export ready</button>
      </div>
    </section>
  );
}

function EditorList({ pack, tab, selected, query, setQuery, onSelect, onAdd, onCopy }: { pack: ContentPack; tab: Tab; selected: string; query: string; setQuery: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void; onCopy: () => void }) {
  const items = useMemo(() => getItems(pack, tab).filter((item) => `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase())), [pack, tab, query]);
  return (
    <aside className="editorList">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
      <div className="listActions">
        <button className="iconTextButton" onClick={onAdd}><Plus /> New</button>
        <button className="iconTextButton" onClick={onCopy} disabled={!selected}><Copy /> Copy</button>
      </div>
      <div className="itemList">
        {items.map((item) => (
          <button key={item.id} className={item.id === selected ? "active" : ""} onClick={() => onSelect(item.id)}>
            <strong>{item.name}</strong>
            <span>{item.id}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function CardForm({ pack, id, setPack, setSelected }: FormProps) {
  const card = pack.cards[id];
  if (!card) return <EmptyForm />;
  const update = (patch: Partial<CardDefinition>) => updateCard(pack, id, { ...card, ...patch }, setPack, setSelected);
  return (
    <>
      <TextField label="ID" value={card.id} onChange={(value) => update({ id: value })} />
      <TextField label="Name" value={card.name} onChange={(value) => update({ name: value })} />
      <SelectField label="Type" value={card.type} options={cardTypes} onChange={(value) => update({ type: value as CardType })} />
      <SelectField label="Rarity" value={card.rarity} options={rarities} onChange={(value) => update({ rarity: value as Rarity })} />
      <NumberField label="Cost" value={card.cost} min={0} onChange={(value) => update({ cost: value })} />
      <TextAreaField label="Description" value={card.description} onChange={(value) => update({ description: value })} />
      <TextAreaField label="Upgraded description" value={card.upgradedDescription} onChange={(value) => update({ upgradedDescription: value })} />
      <CheckField label="Exhaust" checked={Boolean(card.exhaust)} onChange={(value) => update({ exhaust: value })} />
      <CheckField label="Ethereal" checked={Boolean(card.ethereal)} onChange={(value) => update({ ethereal: value })} />
      <EffectList label="Effects" effects={card.effects} onChange={(effects) => update({ effects })} />
      <EffectList label="Upgraded effects" effects={card.upgradedEffects} onChange={(upgradedEffects) => update({ upgradedEffects })} />
    </>
  );
}

function EnemyForm({ pack, id, setPack, setSelected }: FormProps) {
  const enemy = pack.enemies.find((item) => item.id === id);
  if (!enemy) return <EmptyForm />;
  const update = (patch: Partial<EnemyDefinition>) => updateEnemy(pack, id, { ...enemy, ...patch }, setPack, setSelected);
  return (
    <>
      <TextField label="ID" value={enemy.id} onChange={(value) => update({ id: value })} />
      <TextField label="Name" value={enemy.name} onChange={(value) => update({ name: value })} />
      <SelectField label="Tier" value={enemy.tier} options={tiers} onChange={(value) => update({ tier: value as EnemyDefinition["tier"] })} />
      <NumberField label="Max HP" value={enemy.maxHp} min={1} onChange={(value) => update({ maxHp: value })} />
      <NumberField label="Armor" value={enemy.armor} min={0} onChange={(value) => update({ armor: value })} />
      <MoveList moves={enemy.moves} onChange={(moves) => update({ moves })} />
    </>
  );
}

function RelicForm({ pack, id, setPack, setSelected }: FormProps) {
  const relic = pack.relics[id];
  if (!relic) return <EmptyForm />;
  const update = (patch: Partial<RelicDefinition>) => updateRelic(pack, id, { ...relic, ...patch }, setPack, setSelected);
  return (
    <>
      <TextField label="ID" value={relic.id} onChange={(value) => update({ id: value })} />
      <TextField label="Name" value={relic.name} onChange={(value) => update({ name: value })} />
      <SelectField label="Rarity" value={relic.rarity} options={rarities} onChange={(value) => update({ rarity: value as Rarity })} />
      <SelectField label="Trigger" value={relic.trigger} options={relicTriggers} onChange={(value) => update({ trigger: value as RelicTrigger })} />
      <TextAreaField label="Description" value={relic.description} onChange={(value) => update({ description: value })} />
      <RelicEffectList effects={relic.effects} onChange={(effects) => update({ effects })} />
    </>
  );
}

function MoveList({ moves, onChange }: { moves: EnemyMove[]; onChange: (moves: EnemyMove[]) => void }) {
  const update = (index: number, move: EnemyMove) => onChange(moves.map((item, i) => (i === index ? move : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>Moves</legend>
      {moves.map((move, index) => (
        <div className="nestedItem" key={`${move.id}-${index}`}>
          <TextField label="Move ID" value={move.id} onChange={(value) => update(index, { ...move, id: value })} />
          <TextField label="Label" value={move.label} onChange={(value) => update(index, { ...move, label: value })} />
          <SelectField label="Intent" value={move.intent} options={intents} onChange={(value) => update(index, { ...move, intent: value as EnemyMove["intent"] })} />
          <NumberField label="Damage" value={move.damage ?? 0} min={0} onChange={(value) => update(index, { ...move, damage: value || undefined })} />
          <NumberField label="Hits" value={move.hits ?? 1} min={1} onChange={(value) => update(index, { ...move, hits: value })} />
          <NumberField label="Block" value={move.block ?? 0} min={0} onChange={(value) => update(index, { ...move, block: value || undefined })} />
          <EffectList label="Move effects" effects={move.effects ?? []} onChange={(effects) => update(index, { ...move, effects })} />
          <button className="miniButton" onClick={() => onChange(moves.filter((_, i) => i !== index))}>Remove move</button>
        </div>
      ))}
      <button className="miniButton" onClick={() => onChange([...moves, { id: uniqueId("move", moves.map((move) => move.id)), intent: "attack", label: "Strike", damage: 6 }])}>Add move</button>
    </fieldset>
  );
}

function EffectList({ label, effects, onChange }: { label: string; effects: Effect[]; onChange: (effects: Effect[]) => void }) {
  return (
    <fieldset className="nestedEditor">
      <legend>{label}</legend>
      {effects.map((effect, index) => (
        <div className="effectRow" key={`${effect.type}-${index}`}>
          <SelectField label="Type" value={effect.type} options={effectTypes} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, type: value as Effect["type"] } : item)))} />
          <NumberField label="Amount" value={effect.amount} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, amount: value } : item)))} />
          <button className="miniButton" onClick={() => onChange(effects.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      <button className="miniButton" onClick={() => onChange([...effects, { type: "damage", amount: 1 }])}>Add effect</button>
    </fieldset>
  );
}

function RelicEffectList({ effects, onChange }: { effects: RelicEffect[]; onChange: (effects: RelicEffect[]) => void }) {
  return (
    <fieldset className="nestedEditor">
      <legend>Relic effects</legend>
      {effects.map((effect, index) => (
        <div className="effectRow" key={`${effect.type}-${index}`}>
          <SelectField label="Type" value={effect.type} options={relicEffectTypes} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, type: value as RelicEffect["type"] } : item)))} />
          <NumberField label="Amount" value={effect.amount} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, amount: value } : item)))} />
          {effect.type === "applyStatus" ? <SelectField label="Status" value={effect.status ?? "strength"} options={statuses} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, status: value as RelicEffect["status"] } : item)))} /> : null}
          <button className="miniButton" onClick={() => onChange(effects.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      <button className="miniButton" onClick={() => onChange([...effects, { type: "gainBlock", amount: 1 }])}>Add relic effect</button>
    </fieldset>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field">{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field wide">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <label className="field">{label}<input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="checkField"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

function EmptyForm() {
  return <p>Select or create an item.</p>;
}

type FormProps = { pack: ContentPack; id: string; setPack: (pack: ContentPack) => void; setSelected: (id: string) => void };

function updateCard(pack: ContentPack, oldId: string, card: CardDefinition, setPack: (pack: ContentPack) => void, setSelected: (id: string) => void) {
  const nextCards = { ...pack.cards };
  delete nextCards[oldId];
  nextCards[card.id] = card;
  setPack({ ...pack, cards: nextCards });
  setSelected(card.id);
}

function updateEnemy(pack: ContentPack, oldId: string, enemy: EnemyDefinition, setPack: (pack: ContentPack) => void, setSelected: (id: string) => void) {
  setPack({ ...pack, enemies: pack.enemies.map((item) => (item.id === oldId ? enemy : item)) });
  setSelected(enemy.id);
}

function updateRelic(pack: ContentPack, oldId: string, relic: RelicDefinition, setPack: (pack: ContentPack) => void, setSelected: (id: string) => void) {
  const nextRelics = { ...pack.relics };
  delete nextRelics[oldId];
  nextRelics[relic.id] = relic;
  setPack({ ...pack, relics: nextRelics });
  setSelected(relic.id);
}

function addEntry(tab: Tab, pack: ContentPack, setPack: (pack: ContentPack) => void, setSelected: (id: string) => void) {
  if (tab === "cards") {
    const id = uniqueId("new_card", Object.keys(pack.cards));
    updateCard(pack, id, { id, name: "New Card", type: "attack", rarity: "common", cost: 1, description: "Deal 6 damage.", upgradedDescription: "Deal 9 damage.", effects: [{ type: "damage", amount: 6 }], upgradedEffects: [{ type: "damage", amount: 9 }] }, setPack, setSelected);
  } else if (tab === "enemies") {
    const id = uniqueId("new_enemy", pack.enemies.map((enemy) => enemy.id));
    setPack({ ...pack, enemies: [...pack.enemies, { id, name: "New Enemy", tier: "normal", maxHp: 32, armor: 0, moves: [{ id: "strike", intent: "attack", label: "Strike", damage: 6 }] }] });
    setSelected(id);
  } else {
    const id = uniqueId("new_relic", Object.keys(pack.relics));
    updateRelic(pack, id, { id, name: "New Relic", rarity: "common", description: "At the start of each turn, gain 1 block.", trigger: "turnStart", effects: [{ type: "gainBlock", amount: 1 }] }, setPack, setSelected);
  }
}

function copyEntry(tab: Tab, id: string, pack: ContentPack, setPack: (pack: ContentPack) => void, setSelected: (id: string) => void) {
  if (tab === "cards" && pack.cards[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.cards));
    updateCard(pack, newId, { ...clone(pack.cards[id]), id: newId, name: `${pack.cards[id].name} Copy` }, setPack, setSelected);
  } else if (tab === "enemies") {
    const enemy = pack.enemies.find((item) => item.id === id);
    if (!enemy) return;
    const newId = uniqueId(`${id}_copy`, pack.enemies.map((item) => item.id));
    setPack({ ...pack, enemies: [...pack.enemies, { ...clone(enemy), id: newId, name: `${enemy.name} Copy` }] });
    setSelected(newId);
  } else if (tab === "relics" && pack.relics[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.relics));
    updateRelic(pack, newId, { ...clone(pack.relics[id]), id: newId, name: `${pack.relics[id].name} Copy` }, setPack, setSelected);
  }
}

function deleteEntry(tab: Tab, id: string, pack: ContentPack, setPack: (pack: ContentPack) => void, setSelected: (id: string) => void) {
  if (!id) return;
  if (tab === "cards") {
    const nextCards = { ...pack.cards };
    delete nextCards[id];
    const next = { ...pack, cards: nextCards };
    setPack(next);
    setSelected(firstId(next, tab));
  } else if (tab === "enemies") {
    const next = { ...pack, enemies: pack.enemies.filter((enemy) => enemy.id !== id) };
    setPack(next);
    setSelected(firstId(next, tab));
  } else {
    const nextRelics = { ...pack.relics };
    delete nextRelics[id];
    const next = { ...pack, relics: nextRelics };
    setPack(next);
    setSelected(firstId(next, tab));
  }
}

function getItems(pack: ContentPack, tab: Tab): { id: string; name: string }[] {
  if (tab === "cards") return Object.values(pack.cards).map(({ id, name }) => ({ id, name }));
  if (tab === "enemies") return pack.enemies.map(({ id, name }) => ({ id, name }));
  return Object.values(pack.relics).map(({ id, name }) => ({ id, name }));
}

function firstId(pack: ContentPack, tab: Tab) {
  return getItems(pack, tab)[0]?.id ?? "";
}

function uniqueId(base: string, ids: string[]) {
  let id = base.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  let index = 2;
  while (ids.includes(id)) {
    id = `${base}_${index}`;
    index += 1;
  }
  return id;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
