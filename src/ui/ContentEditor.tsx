import { AlertTriangle, Copy, Download, Plus, RotateCcw, Save, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cardFilters, cardTypes, cardZones, clearContentDraft, defaultContentPack, effectOps, effectParams, effectTargets, eventActionTypes, intents, normalizeContentPack, rarities, relicTriggers, saveContentDraft, statuses, tiers, validateContentPack } from "../game/content";
import type { CardDefinition, CardType, CharacterDefinition, ContentPack, Effect, EffectCondition, EnemyDefinition, EnemyMove, EventAction, EventActionType, EventChoice, GameEvent, Rarity, RelicDefinition, RelicTrigger, TriggeredEffect } from "../game/types";

type EditorTab = "cards" | "enemies" | "relics" | "characters" | "events";
type ConfirmAction = "delete" | "reset" | "import" | null;
type EditorMessage = { tone: "info" | "success" | "warn"; text: string };
type EditorItem = { id: string; name: string; meta: string; tone: string };
type FilePickerAcceptType = { description?: string; accept: Record<string, string[]> };
type SaveFilePickerOptions = { suggestedName?: string; types?: FilePickerAcceptType[] };
type OpenFilePickerOptions = { multiple?: boolean; types?: FilePickerAcceptType[] };
type WritableFileStream = {
  write: (data: BlobPart) => Promise<void>;
  close: () => Promise<void>;
};
type FileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<WritableFileStream>;
};
type WindowWithFilePickers = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileHandle>;
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileHandle[]>;
};

const tabs: { id: EditorTab; label: string }[] = [
  { id: "cards", label: "Cards" },
  { id: "enemies", label: "Enemies" },
  { id: "relics", label: "Relics" },
  { id: "characters", label: "Characters" },
  { id: "events", label: "Events" }
];

const tabNouns: Record<EditorTab, string> = { cards: "card", enemies: "enemy", relics: "relic", characters: "character", events: "event" };
const importDataStart = "--- NETSPIRE_CONTENT_JSON_START ---";
const importDataEnd = "--- NETSPIRE_CONTENT_JSON_END ---";
const contentFileTypes: FilePickerAcceptType[] = [
  { description: "Netspire content files", accept: { "text/plain": [".txt"], "application/json": [".json"] } }
];

export function ContentEditor({ initialPack, onNewRun }: { initialPack: ContentPack; onNewRun: () => void }) {
  const [pack, setPack] = useState<ContentPack>(() => normalizeContentPack(clone(initialPack)));
  const [tab, setTab] = useState<EditorTab>("cards");
  const [selected, setSelected] = useState(() => firstId(normalizeContentPack(initialPack), "cards"));
  const [query, setQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [pendingImport, setPendingImport] = useState<ContentPack | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [message, setMessage] = useState<EditorMessage>({ tone: "info", text: "Changes are saved as a draft before they affect new runs." });
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileImportAppliesRef = useRef(false);

  const validation = useMemo(() => validateContentPack(pack), [pack]);
  const exportText = useMemo(() => formatReadableExport(pack), [pack]);
  const selectedItem = getSelectedItem(pack, tab, selected);
  const selectionErrors = errorsForSelection(validation.errors, tab, selected);
  const otherErrors = validation.errors.filter((error) => !selectionErrors.includes(error));

  const selectTab = (next: EditorTab) => {
    setTab(next);
    setQuery("");
    setSelected(firstId(pack, next));
  };

  const updatePack = (next: ContentPack, nextSelected = selected) => {
    setPack(next);
    setSelected(nextSelected);
    setMessage({ tone: "info", text: "Draft updated. Save the draft to use it for new runs." });
  };

  const saveDraft = (startNewRun = false) => {
    const result = validateContentPack(pack);
    if (!result.valid) {
      setMessage({ tone: "warn", text: `Fix validation first: ${result.errors[0]}` });
      return;
    }
    saveContentDraft(pack);
    setMessage({ tone: "success", text: startNewRun ? "Draft saved and a new run started." : "Draft saved for future runs." });
    if (startNewRun) onNewRun();
  };

  const prepareImport = () => prepareImportFromText(importText);

  const downloadExport = () => {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `netspire-content-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "success", text: "Readable export downloaded." });
  };

  const exportToChosenPath = async () => {
    const picker = window as WindowWithFilePickers;
    if (!picker.showSaveFilePicker) {
      downloadExport();
      setMessage({ tone: "info", text: "This browser used the download fallback. Choose the save path in the download prompt." });
      return;
    }
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName: `netspire-content-${new Date().toISOString().slice(0, 10)}.txt`,
        types: contentFileTypes
      });
      const writable = await handle.createWritable?.();
      if (!writable) throw new Error("This browser cannot write to the chosen file.");
      await writable.write(exportText);
      await writable.close();
      setMessage({ tone: "success", text: `Export written to ${handle.name}.` });
    } catch (error) {
      if (isAbortError(error)) return;
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Export failed." });
    }
  };

  const loadImportFile = (file?: File, applyImmediately = false) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportText(text);
      if (applyImmediately) {
        prepareImportFromText(text, `Loaded ${file.name}. Confirm to copy it into the active draft.`);
      } else {
        setMessage({ tone: "info", text: `Loaded ${file.name}. Review it, then import to draft.` });
      }
    };
    reader.onerror = () => setMessage({ tone: "warn", text: "Could not read that import file." });
    reader.readAsText(file);
  };

  const importFromChosenPath = async () => {
    const picker = window as WindowWithFilePickers;
    if (!picker.showOpenFilePicker) {
      fileImportAppliesRef.current = true;
      importFileInputRef.current?.click();
      setMessage({ tone: "info", text: "This browser used the file input fallback. Choose a content file to load." });
      return;
    }
    try {
      const [handle] = await picker.showOpenFilePicker({ multiple: false, types: contentFileTypes });
      const file = await handle.getFile();
      loadImportFile(file, true);
    } catch (error) {
      if (isAbortError(error)) return;
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Import file selection failed." });
    }
  };

  const prepareImportFromText = (text: string, successText?: string) => {
    try {
      const parsed = parseContentImport(text);
      const result = validateContentPack(parsed);
      if (!result.valid) {
        setMessage({ tone: "warn", text: `Import rejected: ${result.errors[0]}` });
        return;
      }
      setPendingImport(parsed);
      setConfirmAction("import");
      if (successText) setMessage({ tone: "info", text: successText });
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Import rejected." });
    }
  };

  const runConfirmedAction = () => {
    if (confirmAction === "delete") {
      const result = removeEntry(tab, selected, pack);
      if (!result.ok) setMessage({ tone: "warn", text: result.message });
      else {
        updatePack(result.pack, result.selected);
        setMessage({ tone: "success", text: `${tabNouns[tab]} deleted.` });
      }
    }
    if (confirmAction === "reset") {
      clearContentDraft();
      const next = clone(defaultContentPack);
      setPack(next);
      setSelected(firstId(next, tab));
      setMessage({ tone: "success", text: "Default content restored." });
      onNewRun();
    }
    if (confirmAction === "import" && pendingImport) {
      const next = clone(pendingImport);
      setPack(next);
      setSelected(firstId(next, tab));
      saveContentDraft(next);
      setMessage({ tone: "success", text: "Content imported and copied into the active draft path." });
      setPendingImport(null);
    }
    setConfirmAction(null);
  };

  return (
    <section className="editor">
      <header className="editorHeader editorWorkbenchHeader">
        <div>
          <p className="eyebrow">Internal content tool</p>
          <h2>Content Editor</h2>
        </div>
        <div className="editorActions">
          <button className="toolButton" onClick={() => saveDraft()}><Save /> Save draft</button>
          <button className="toolButton" onClick={() => saveDraft(true)}><Save /> Save and new run</button>
          <button className="toolButton" onClick={() => setConfirmAction("reset")}><RotateCcw /> Reset defaults</button>
        </div>
      </header>

      <div className="editorStatus">
        <span className={`editorMessage ${message.tone}`}>{message.text}</span>
        <span className={validation.valid ? "ok" : "warn"}>{validation.valid ? "Content validates" : `${validation.errors.length} validation issues`}</span>
      </div>

      <div className="tabs editorTabs">
        {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => selectTab(item.id)}>{item.label}</button>)}
      </div>

      <div className="editorWorkbench">
        <EditorList pack={pack} tab={tab} selected={selected} query={query} setQuery={setQuery} onSelect={setSelected} onAdd={() => {
          const result = createDefaultEntry(tab, pack);
          updatePack(result.pack, result.selected);
        }} onCopy={() => {
          const result = duplicateEntry(tab, selected, pack);
          if (!result.ok) setMessage({ tone: "warn", text: result.message });
          else updatePack(result.pack, result.selected);
        }} />

        <main className="editorForm">
          {tab === "cards" ? <CardForm pack={pack} id={selected} setPack={updatePack} /> : null}
          {tab === "enemies" ? <EnemyForm pack={pack} id={selected} setPack={updatePack} /> : null}
          {tab === "relics" ? <RelicForm pack={pack} id={selected} setPack={updatePack} /> : null}
          {tab === "characters" ? <CharacterForm pack={pack} id={selected} setPack={updatePack} /> : null}
          {tab === "events" ? <EventForm pack={pack} id={selected} setPack={updatePack} /> : null}
          <div className="formSection dangerSection">
            <div>
              <h3>Danger zone</h3>
              <p>Deletion only affects the current draft until it is saved.</p>
            </div>
            <button className="dangerButton" onClick={() => setConfirmAction("delete")} disabled={!selectedItem}>
              <Trash2 /> Delete current {tabNouns[tab]}
            </button>
          </div>
        </main>

        <aside className="editorInspector">
          <PreviewPanel tab={tab} item={selectedItem} />
          <ValidationPanel selectionErrors={selectionErrors} otherErrors={otherErrors} />
        </aside>
      </div>

      <section className="jsonTools">
        <label>Readable export<textarea readOnly value={exportText} /></label>
        <label>Import text<textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste a readable export or ContentPack JSON draft." /></label>
        <div className="jsonToolActions">
          <button className="toolButton" onClick={prepareImport}><Upload /> Import and apply</button>
          <button className="toolButton" onClick={exportToChosenPath}><Download /> Export to path</button>
          <button className="toolButton" onClick={importFromChosenPath}><Upload /> Import from path</button>
          <button className="toolButton" onClick={() => {
            fileImportAppliesRef.current = false;
            importFileInputRef.current?.click();
          }}><Upload /> Load only</button>
          <input ref={importFileInputRef} className="fileInput" type="file" accept=".txt,.json,application/json,text/plain" onChange={(event) => {
            loadImportFile(event.target.files?.[0], fileImportAppliesRef.current);
            fileImportAppliesRef.current = false;
            event.currentTarget.value = "";
          }} />
        </div>
      </section>

      {confirmAction ? <ConfirmDialog action={confirmAction} tab={tab} selectedName={selectedItem ? itemDisplayName(selectedItem) : selected} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmedAction} /> : null}
    </section>
  );
}

function EditorList({ pack, tab, selected, query, setQuery, onSelect, onAdd, onCopy }: { pack: ContentPack; tab: EditorTab; selected: string; query: string; setQuery: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void; onCopy: () => void }) {
  const items = useMemo(() => getTabItems(pack, tab).filter((item) => `${item.id} ${item.name} ${item.meta}`.toLowerCase().includes(query.toLowerCase())), [pack, tab, query]);
  return (
    <aside className="editorList">
      <div className="searchBox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tabNouns[tab]}s`} /></div>
      <div className="listActions">
        <button className="iconTextButton" onClick={onAdd}><Plus /> New</button>
        <button className="iconTextButton" onClick={onCopy} disabled={!selected}><Copy /> Copy</button>
      </div>
      <div className="itemList">
        {items.length ? items.map((item) => (
          <button key={item.id} className={item.id === selected ? "active" : ""} onClick={() => onSelect(item.id)}>
            <span className={`itemTone ${item.tone}`}>{tabNouns[tab]}</span>
            <strong>{item.name}</strong>
            <span>{item.id}</span>
            <small>{item.meta}</small>
          </button>
        )) : <p className="emptyHint">No matching content.</p>}
      </div>
    </aside>
  );
}

function CardForm({ pack, id, setPack }: FormProps) {
  const card = pack.cards[id];
  if (!card) return <EmptyForm noun="card" />;
  const update = (patch: Partial<CardDefinition>) => setPack(updateCard(pack, id, { ...card, ...patch }), patch.id ?? card.id);
  return (
    <>
      <FormSection title="Identity" description="Card identity, reward rarity, and combat display.">
        <TextField label="ID" value={card.id} onChange={(value) => update({ id: value })} />
        <TextField label="Name" value={card.name} onChange={(value) => update({ name: value })} />
        <SelectField label="Type" value={card.type} options={cardTypes} onChange={(value) => update({ type: value as CardType })} />
        <SelectField label="Rarity" value={card.rarity} options={rarities} onChange={(value) => update({ rarity: value as Rarity })} />
      </FormSection>
      <FormSection title="Combat" description="Cost and text shown on cards.">
        <NumberField label="Cost" value={card.cost} min={0} onChange={(value) => update({ cost: value })} />
        <CheckField label="Exhaust after play" checked={Boolean(card.exhaust)} onChange={(value) => update({ exhaust: value || undefined })} />
        <CheckField label="Ethereal" checked={Boolean(card.ethereal)} onChange={(value) => update({ ethereal: value || undefined })} />
        <TextAreaField label="Description" value={card.description} onChange={(value) => update({ description: value })} />
        <TextAreaField label="Upgraded description" value={card.upgradedDescription} onChange={(value) => update({ upgradedDescription: value })} />
      </FormSection>
      <EffectList label="Base effects" effects={card.effects} onChange={(effects) => update({ effects })} />
      <EffectList label="Upgraded effects" effects={card.upgradedEffects} onChange={(upgradedEffects) => update({ upgradedEffects })} />
    </>
  );
}

function EnemyForm({ pack, id, setPack }: FormProps) {
  const enemy = pack.enemies.find((item) => item.id === id);
  if (!enemy) return <EmptyForm noun="enemy" />;
  const update = (patch: Partial<EnemyDefinition>) => {
    const nextEnemy = { ...enemy, ...patch };
    setPack(updateEnemy(pack, id, nextEnemy), nextEnemy.id);
  };
  return (
    <>
      <FormSection title="Identity" description="Tier controls map encounters and scaling.">
        <TextField label="ID" value={enemy.id} onChange={(value) => update({ id: value })} />
        <TextField label="Name" value={enemy.name} onChange={(value) => update({ name: value })} />
        <SelectField label="Tier" value={enemy.tier} options={tiers} onChange={(value) => update({ tier: value as EnemyDefinition["tier"] })} />
      </FormSection>
      <FormSection title="Stats" description="Base stats are scaled by threat.">
        <NumberField label="Max HP" value={enemy.maxHp} min={1} onChange={(value) => update({ maxHp: value })} />
        <NumberField label="Starting physical armor" value={enemy.armor} min={0} onChange={(value) => update({ armor: value })} />
      </FormSection>
      <MoveList moves={enemy.moves} onChange={(moves) => update({ moves })} />
    </>
  );
}

function RelicForm({ pack, id, setPack }: FormProps) {
  const relic = pack.relics[id];
  if (!relic) return <EmptyForm noun="relic" />;
  const update = (patch: Partial<RelicDefinition>) => setPack(updateRelic(pack, id, { ...relic, ...patch }), patch.id ?? relic.id);
  return (
    <>
      <FormSection title="Identity" description="Relics fire their effects when the trigger happens.">
        <TextField label="ID" value={relic.id} onChange={(value) => update({ id: value })} />
        <TextField label="Name" value={relic.name} onChange={(value) => update({ name: value })} />
        <SelectField label="Rarity" value={relic.rarity} options={rarities} onChange={(value) => update({ rarity: value as Rarity })} />
        <SelectField label="Trigger" value={relic.trigger} options={relicTriggers} onChange={(value) => update({ trigger: value as RelicTrigger })} />
        <TextAreaField label="Description" value={relic.description} onChange={(value) => update({ description: value })} />
      </FormSection>
      <EffectList label="Relic effects" effects={relic.effects} onChange={(effects) => update({ effects })} />
    </>
  );
}

function CharacterForm({ pack, id, setPack }: FormProps) {
  const character = pack.characters[id];
  if (!character) return <EmptyForm noun="character" />;
  const update = (patch: Partial<CharacterDefinition>) => setPack(updateCharacter(pack, id, { ...character, ...patch }), patch.id ?? character.id);
  return (
    <>
      <FormSection title="Identity" description="The default character starts every new run.">
        <TextField label="ID" value={character.id} onChange={(value) => update({ id: value })} />
        <TextField label="Name" value={character.name} onChange={(value) => update({ name: value })} />
        <CheckField label="Default character" checked={pack.defaultCharacterId === character.id} onChange={(value) => value ? setPack({ ...pack, defaultCharacterId: character.id }, character.id) : undefined} />
      </FormSection>
      <FormSection title="Starting resources" description="Starting HP, energy, gold, deck, and relic ids.">
        <NumberField label="Max HP" value={character.maxHp} min={1} onChange={(value) => update({ maxHp: value })} />
        <NumberField label="Max energy" value={character.maxEnergy} min={1} onChange={(value) => update({ maxEnergy: value })} />
        <NumberField label="Gold" value={character.gold} min={0} onChange={(value) => update({ gold: value })} />
        <TextAreaField label="Starter deck ids" value={character.starterDeck.join("\n")} onChange={(value) => update({ starterDeck: lines(value) })} />
        <TextAreaField label="Starter relic ids" value={character.starterRelics.join("\n")} onChange={(value) => update({ starterRelics: lines(value) })} />
      </FormSection>
      <PassiveList passives={character.passives} onChange={(passives) => update({ passives })} />
    </>
  );
}

function EventForm({ pack, id, setPack }: FormProps) {
  const event = pack.events.find((item) => item.id === id);
  if (!event) return <EmptyForm noun="event" />;
  const update = (patch: Partial<GameEvent>) => {
    const nextEvent = { ...event, ...patch };
    setPack(updateEvent(pack, id, nextEvent), nextEvent.id);
  };
  return (
    <>
      <FormSection title="Identity" description="Events are selected from the map event pool.">
        <TextField label="ID" value={event.id} onChange={(value) => update({ id: value })} />
        <TextField label="Title" value={event.title} onChange={(value) => update({ title: value })} />
        <NumberField label="Weight" value={event.weight ?? 1} min={1} onChange={(value) => update({ weight: value <= 1 ? undefined : value })} />
        <TextField label="Acts" value={event.acts?.join(",") ?? ""} onChange={(value) => update({ acts: parseActs(value) })} />
        <TextAreaField label="Body" value={event.body} onChange={(value) => update({ body: value })} />
      </FormSection>
      <ChoiceList choices={event.choices} onChange={(choices) => update({ choices })} />
    </>
  );
}

function ChoiceList({ choices, onChange }: { choices: EventChoice[]; onChange: (choices: EventChoice[]) => void }) {
  const update = (index: number, choice: EventChoice) => onChange(choices.map((item, i) => (i === index ? choice : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>Event choices</legend>
      {choices.map((choice, index) => (
        <div className="nestedItem" key={`${choice.id}-${index}`}>
          <TextField label="Choice ID" value={choice.id} onChange={(value) => update(index, { ...choice, id: value })} />
          <TextField label="Label" value={choice.label} onChange={(value) => update(index, { ...choice, label: value })} />
          <TextAreaField label="Description" value={choice.description} onChange={(value) => update(index, { ...choice, description: value })} />
          <EventActionList label="Actions" actions={choice.actions ?? []} onChange={(actions) => update(index, { ...choice, effect: undefined, dungeonThreat: undefined, actions })} />
          <button className="miniButton removeButton" onClick={() => onChange(choices.filter((_, i) => i !== index))}>Remove choice</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...choices, { id: uniqueId("choice", choices.map((choice) => choice.id)), label: "Leave", description: "Continue onward.", actions: [{ type: "skip" }] }])}>Add choice</button>
    </fieldset>
  );
}

function EventActionList({ label, actions, onChange }: { label: string; actions: EventAction[]; onChange: (actions: EventAction[]) => void }) {
  const update = (index: number, action: EventAction) => onChange(actions.map((item, i) => (i === index ? normalizeEventAction(action) : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>{label}</legend>
      {actions.map((action, index) => (
        <div className="effectRow" key={`${action.type}-${index}`}>
          <SelectField label="Type" value={action.type} options={eventActionTypes} onChange={(value) => update(index, { ...action, type: value as EventActionType })} />
          {eventActionNeedsAmount(action.type) ? <NumberField label="Amount" value={action.amount ?? defaultEventActionAmount(action.type)} onChange={(value) => update(index, { ...action, amount: value })} /> : null}
          {action.type === "addCard" || action.type === "addCurse" ? <TextField label="Card ID" value={action.cardId ?? (action.type === "addCurse" ? "curse" : "wound")} onChange={(value) => update(index, { ...action, cardId: value })} /> : null}
          {action.type === "gainRelic" ? <TextField label="Relic ID" value={action.relicId ?? ""} onChange={(value) => update(index, { ...action, relicId: value || undefined })} /> : null}
          {action.type === "enterDungeon" ? <NumberField label="Dungeon threat" value={action.dungeonThreat ?? action.amount ?? 2} min={0} onChange={(value) => update(index, { ...action, dungeonThreat: value })} /> : null}
          {action.type === "startEventCombat" ? <SelectField label="Tier" value={action.tier ?? "normal"} options={tiers} onChange={(value) => update(index, { ...action, tier: value as EnemyDefinition["tier"] })} /> : null}
          {action.type === "startEventCombat" ? <TextField label="Enemy ID" value={action.encounterId ?? ""} onChange={(value) => update(index, { ...action, encounterId: value || undefined })} /> : null}
          {action.type === "startEventCombat" ? <EventActionList label="On win actions" actions={action.onWinActions ?? []} onChange={(onWinActions) => update(index, { ...action, onWinActions })} /> : null}
          <button className="miniButton removeButton" onClick={() => onChange(actions.filter((_, i) => i !== index))}>Remove action</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...actions, { type: "skip" }])}>Add action</button>
    </fieldset>
  );
}

function MoveList({ moves, onChange }: { moves: EnemyMove[]; onChange: (moves: EnemyMove[]) => void }) {
  const update = (index: number, move: EnemyMove) => onChange(moves.map((item, i) => (i === index ? move : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>Enemy moves</legend>
      {moves.map((move, index) => (
        <div className="nestedItem" key={`${move.id}-${index}`}>
          <TextField label="Move ID" value={move.id} onChange={(value) => update(index, { ...move, id: value })} />
          <TextField label="Label" value={move.label} onChange={(value) => update(index, { ...move, label: value })} />
          <SelectField label="Intent" value={move.intent} options={intents} onChange={(value) => update(index, { ...move, intent: value as EnemyMove["intent"] })} />
          <EffectList label="Effects" effects={move.effects ?? []} onChange={(effects) => update(index, { ...move, effects })} />
          <button className="miniButton removeButton" onClick={() => onChange(moves.filter((_, i) => i !== index))}>Remove move</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...moves, { id: uniqueId("move", moves.map((move) => move.id)), intent: "attack", label: "Strike", effects: [{ target: "player", param: "hp", op: "subtract", amount: 6 }] }])}>Add move</button>
    </fieldset>
  );
}

function PassiveList({ passives, onChange }: { passives: TriggeredEffect[]; onChange: (passives: TriggeredEffect[]) => void }) {
  const update = (index: number, passive: TriggeredEffect) => onChange(passives.map((item, i) => (i === index ? passive : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>Character passives</legend>
      {passives.map((passive, index) => (
        <div className="nestedItem" key={`${passive.trigger}-${index}`}>
          <SelectField label="Trigger" value={passive.trigger} options={relicTriggers} onChange={(value) => update(index, { ...passive, trigger: value as RelicTrigger })} />
          <EffectList label="Effects" effects={passive.effects} onChange={(effects) => update(index, { ...passive, effects })} />
          <button className="miniButton removeButton" onClick={() => onChange(passives.filter((_, i) => i !== index))}>Remove passive</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...passives, { trigger: "combatStart", effects: [{ target: "player", param: "physicalArmor", op: "add", amount: 1 }] }])}>Add passive</button>
    </fieldset>
  );
}

function EffectList({ label, effects, onChange }: { label: string; effects: Effect[]; onChange: (effects: Effect[]) => void }) {
  const update = (index: number, patch: Partial<Effect>) => onChange(effects.map((item, i) => (i === index ? normalizeEffect({ ...item, ...patch }) : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>{label}</legend>
      {effects.map((effect, index) => (
        <div className="effectRow" key={`${effect.target}-${effect.param}-${index}`}>
          <SelectField label="Target" value={effect.target} options={effectTargets} onChange={(value) => update(index, { target: value as Effect["target"] })} />
          <SelectField label="Param" value={effect.param} options={effectParams} onChange={(value) => update(index, { param: value as Effect["param"] })} />
          <SelectField label="Op" value={effect.op} options={effectOps} onChange={(value) => update(index, { op: value as Effect["op"] })} />
          {effect.op !== "clear" ? <NumberField label="Amount" value={effect.amount ?? 1} onChange={(value) => update(index, { amount: value })} /> : null}
          {effect.param === "statusAmount" ? <SelectField label="Status" value={effect.status ?? "strength"} options={statuses} onChange={(value) => update(index, { status: value as Effect["status"] })} /> : null}
          {effect.param === "cards" ? <SelectField label="From" value={effect.fromZone ?? "drawPile"} options={cardZones} onChange={(value) => update(index, { fromZone: value as Effect["fromZone"] })} /> : null}
          {effect.param === "cards" && effect.op === "move" ? <SelectField label="To" value={effect.toZone ?? "hand"} options={cardZones} onChange={(value) => update(index, { toZone: value as Effect["toZone"] })} /> : null}
          {["cards", "upgraded", "cost"].includes(effect.param) ? <SelectField label="Card filter" value={effect.cardFilter ?? "any"} options={cardFilters} onChange={(value) => update(index, { cardFilter: value as Effect["cardFilter"] })} /> : null}
          <NumberField label="Times" value={effect.times ?? 1} min={1} onChange={(value) => update(index, { times: value <= 1 ? undefined : value })} />
          <ConditionField value={effect.condition} onChange={(condition) => update(index, { condition })} />
          <button className="miniButton removeButton" onClick={() => onChange(effects.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...effects, { target: "selectedEnemy", param: "hp", op: "subtract", amount: 1 }])}>Add effect</button>
    </fieldset>
  );
}

function ConditionField({ value, onChange }: { value?: EffectCondition; onChange: (value?: EffectCondition) => void }) {
  const serialized = value ? JSON.stringify(value) : "";
  const [text, setText] = useState(serialized);
  useEffect(() => setText(serialized), [serialized]);
  return <TextField label="Condition JSON" value={text} onChange={(next) => {
    setText(next);
    if (!next.trim()) onChange(undefined);
    else {
      const parsed = parseCondition(next);
      if (parsed) onChange(parsed);
    }
  }} />;
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="formSection"><div className="formSectionHeader"><h3>{title}</h3><p>{description}</p></div><div className="formGrid">{children}</div></section>;
}

function PreviewPanel({ tab, item }: { tab: EditorTab; item?: CardDefinition | EnemyDefinition | RelicDefinition | CharacterDefinition | GameEvent }) {
  if (!item) return <section className="previewPanel"><div className="panelHeader"><h3>Preview</h3><span>{tab}</span></div><p className="emptyHint">Choose or create content.</p></section>;
  return (
    <section className="previewPanel">
      <div className="panelHeader"><h3>Preview</h3><span>{tabNouns[tab]}</span></div>
      <strong>{"name" in item ? item.name : item.title}</strong>
      <p>{item.id}</p>
      <div className="effectSummary">{summaryLines(tab, item).map((line) => <span key={line}>{line}</span>)}</div>
    </section>
  );
}

function ValidationPanel({ selectionErrors, otherErrors }: { selectionErrors: string[]; otherErrors: string[] }) {
  const hasErrors = selectionErrors.length > 0 || otherErrors.length > 0;
  return (
    <section className="validationPanel">
      <div className="panelHeader"><h3>Validation</h3><span className={hasErrors ? "warn" : "ok"}>{hasErrors ? "Needs work" : "Pass"}</span></div>
      {!hasErrors ? <p className="okText">Current content can be saved.</p> : null}
      {selectionErrors.length ? <div className="errorGroup"><strong>Current item</strong>{selectionErrors.map((error) => <span key={error}>{error}</span>)}</div> : null}
      {otherErrors.length ? <details className="errorGroup"><summary>Other issues ({otherErrors.length})</summary>{otherErrors.map((error) => <span key={error}>{error}</span>)}</details> : null}
    </section>
  );
}

function ConfirmDialog({ action, tab, selectedName, onCancel, onConfirm }: { action: Exclude<ConfirmAction, null>; tab: EditorTab; selectedName: string; onCancel: () => void; onConfirm: () => void }) {
  const copy = {
    delete: { title: `Delete ${tabNouns[tab]}`, body: `Delete "${selectedName}" from the current draft?`, confirm: "Delete" },
    reset: { title: "Reset defaults", body: "Clear the browser draft and restore default content?", confirm: "Reset" },
    import: { title: "Import content", body: "Importing replaces the editor draft and saves it as the active content for new runs.", confirm: "Import and apply" }
  }[action];
  return (
    <div className="confirmBackdrop" role="presentation">
      <div className="confirmDialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <AlertTriangle />
        <h3 id="confirm-title">{copy.title}</h3>
        <p>{copy.body}</p>
        <div className="confirmActions"><button className="toolButton" onClick={onCancel}>Cancel</button><button className="dangerButton" onClick={onConfirm}>{copy.confirm}</button></div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field">{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field wide">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <label className="field">{label}<input type="number" min={min} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="checkField"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function formatReadableExport(pack: ContentPack) {
  const normalized = normalizeContentPack(pack);
  const lines: string[] = [
    "Netspire Content Editor Export",
    `Generated: ${new Date().toLocaleString()}`,
    `Default character: ${normalized.characters[normalized.defaultCharacterId]?.name ?? "Unknown"} (${normalized.defaultCharacterId})`,
    `Totals: ${Object.keys(normalized.cards).length} cards, ${normalized.enemies.length} enemies, ${Object.keys(normalized.relics).length} relics, ${Object.keys(normalized.characters).length} characters, ${normalized.events.length} events`,
    "",
    "Cards"
  ];

  Object.values(normalized.cards).forEach((card, index) => {
    lines.push(
      `${index + 1}. ${card.name} [${card.id}]`,
      `   Kind: ${card.rarity} ${card.type}, costs ${card.cost} energy.`,
      `   Text: ${card.description || "No description."}`,
      `   Upgrade: ${card.upgradedDescription || "No upgraded description."}`,
      `   Flags: ${flagList([["exhausts after play", card.exhaust], ["ethereal", card.ethereal]])}`
    );
    pushEffectList(lines, "   Base effects", card.effects);
    pushEffectList(lines, "   Upgraded effects", card.upgradedEffects);
    lines.push("");
  });

  lines.push("Enemies");
  normalized.enemies.forEach((enemy, index) => {
    lines.push(
      `${index + 1}. ${enemy.name} [${enemy.id}]`,
      `   Tier: ${enemy.tier}. HP: ${enemy.maxHp}. Starting physical armor: ${enemy.armor}.`,
      "   Moves:"
    );
    enemy.moves.forEach((move, moveIndex) => {
      lines.push(`     ${moveIndex + 1}. ${move.label} [${move.id}] - intent: ${move.intent}.`);
      pushEffectList(lines, "        Effects", move.effects ?? []);
    });
    lines.push("");
  });

  lines.push("Relics");
  Object.values(normalized.relics).forEach((relic, index) => {
    lines.push(
      `${index + 1}. ${relic.name} [${relic.id}]`,
      `   Rarity: ${relic.rarity}. Trigger: ${readableTrigger(relic.trigger)}.`,
      `   Text: ${relic.description || "No description."}`
    );
    pushEffectList(lines, "   Effects", relic.effects);
    lines.push("");
  });

  lines.push("Characters");
  Object.values(normalized.characters).forEach((character, index) => {
    lines.push(
      `${index + 1}. ${character.name} [${character.id}]${character.id === normalized.defaultCharacterId ? " - default" : ""}`,
      `   Starts with ${character.maxHp} HP, ${character.maxEnergy} max energy, and ${character.gold} gold.`,
      `   Starter deck: ${character.starterDeck.join(", ") || "none"}.`,
      `   Starter relics: ${character.starterRelics.join(", ") || "none"}.`
    );
    if (character.passives.length) {
      lines.push("   Passives:");
      character.passives.forEach((passive, passiveIndex) => {
        lines.push(`     ${passiveIndex + 1}. On ${readableTrigger(passive.trigger)}${passive.oncePerCombat ? " once per combat" : ""}:`);
        pushEffectList(lines, "        Effects", passive.effects);
        if (passive.condition) lines.push(`        Condition: ${JSON.stringify(passive.condition)}`);
      });
    } else {
      lines.push("   Passives: none.");
    }
    lines.push("");
  });

  lines.push("Events");
  normalized.events.forEach((event, index) => {
    lines.push(
      `${index + 1}. ${event.title} [${event.id}]`,
      `   Acts: ${event.acts?.join(", ") || "all"}. Weight: ${event.weight ?? 1}.`,
      `   Body: ${event.body || "No body text."}`,
      "   Choices:"
    );
    event.choices.forEach((choice, choiceIndex) => {
      lines.push(`     ${choiceIndex + 1}. ${choice.label} [${choice.id}] - ${choice.description}`);
      (choice.actions ?? []).forEach((action) => lines.push(`        - ${describeEventAction(action)}`));
    });
    lines.push("");
  });

  lines.push(
    "Import data",
    "The editor uses the block below to restore this exact content.",
    importDataStart,
    JSON.stringify(normalized),
    importDataEnd
  );

  return lines.join("\n");
}

function parseContentImport(text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Import rejected: paste or load content first.");
  const embedded = extractImportData(trimmed);
  const raw = embedded ?? trimmed;
  try {
    return normalizeContentPack(JSON.parse(raw) as Partial<ContentPack>);
  } catch {
    throw new Error(embedded ? "Import rejected: the embedded import data is invalid." : "Import rejected: paste a readable export from this editor or raw ContentPack JSON.");
  }
}

function extractImportData(text: string) {
  const start = text.indexOf(importDataStart);
  const end = text.indexOf(importDataEnd);
  if (start === -1 || end === -1 || end <= start) return undefined;
  return text.slice(start + importDataStart.length, end).trim();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function pushEffectList(lines: string[], title: string, effects: Effect[]) {
  const indent = title.match(/^\s*/)?.[0] ?? "";
  lines.push(`${title}:`);
  if (!effects.length) {
    lines.push(`${indent}  - No effects.`);
    return;
  }
  effects.forEach((effect) => lines.push(`${indent}  - ${describeEffect(effect)}`));
}

function describeEffect(effect: Effect) {
  const target = readableTarget(effect.target);
  const amount = effect.amount ?? 0;
  const times = effect.times && effect.times > 1 ? `, repeated ${effect.times} times` : "";
  const condition = effect.condition ? `, if ${describeCondition(effect.condition)}` : "";
  const cardFilter = effect.cardFilter && effect.cardFilter !== "any" ? `, filtered to ${effect.cardFilter} cards` : "";

  if (effect.op === "clear") return `${capitalize(target)} clears ${readableParam(effect.param)}${condition}.`;
  if (effect.param === "statusAmount") return `${capitalize(target)} ${opVerb(effect.op)} ${amount} ${effect.status ?? "status"}${times}${condition}.`;
  if (effect.param === "cards") {
    const zoneMove = effect.op === "move" ? ` from ${effect.fromZone ?? "drawPile"} to ${effect.toZone ?? "hand"}` : "";
    return `${capitalize(target)} ${opVerb(effect.op)} ${amount} card${amount === 1 ? "" : "s"}${zoneMove}${cardFilter}${times}${condition}.`;
  }
  return `${capitalize(target)} ${opVerb(effect.op)} ${amount} ${readableParam(effect.param)}${cardFilter}${times}${condition}.`;
}

function describeEventAction(action: EventAction): string {
  if (action.type === "startEventCombat") return `start ${action.tier ?? "normal"} event combat${action.encounterId ? ` against ${action.encounterId}` : ""}, then ${action.onWinActions?.map(describeEventAction).join("; ") || "complete"}`;
  if (action.type === "enterDungeon") return `enter dungeon, threat +${action.dungeonThreat ?? action.amount ?? 2} on completion`;
  if (action.type === "addCard" || action.type === "addCurse") return `${action.type} ${action.cardId ?? (action.type === "addCurse" ? "curse" : "card")}`;
  if (action.type === "gainRelic") return `gain relic${action.relicId ? ` ${action.relicId}` : ""}`;
  return `${action.type}${action.amount !== undefined ? ` ${action.amount}` : ""}`;
}

function describeCondition(condition: EffectCondition) {
  const target = condition.target ? `${readableTarget(condition.target)} ` : "";
  const value = condition.status ? `${condition.amount ?? 0} ${condition.status}` : `${condition.amount ?? 0}`;
  return `${target}${readableParam(condition.param)} is ${condition.op} ${value}`;
}

function flagList(flags: Array<[string, boolean | undefined]>) {
  const enabled = flags.filter(([, value]) => Boolean(value)).map(([label]) => label);
  return enabled.length ? enabled.join(", ") : "none";
}

function opVerb(op: Effect["op"]) {
  return {
    add: "gains",
    subtract: "loses",
    set: "sets",
    multiply: "multiplies",
    move: "moves",
    create: "creates",
    remove: "removes",
    clear: "clears"
  }[op];
}

function readableParam(param: Effect["param"]) {
  return {
    hp: "HP",
    maxHp: "max HP",
    physicalDamage: "physical damage",
    magicDamage: "magic damage",
    physicalArmor: "physical armor",
    magicArmor: "magic armor",
    energy: "energy",
    maxEnergy: "max energy",
    gold: "gold",
    statusAmount: "status",
    upgraded: "upgrade state",
    cost: "cost",
    cards: "cards",
    turn: "turn count",
    threat: "threat",
    movesTaken: "moves taken"
  }[param];
}

function readableTarget(target: Effect["target"]) {
  return {
    self: "self",
    selectedEnemy: "selected enemy",
    player: "player",
    sourceOwner: "source owner",
    allEnemies: "all enemies",
    randomEnemy: "a random enemy",
    allCombatants: "all combatants"
  }[target];
}

function readableTrigger(trigger: RelicTrigger) {
  return {
    runStart: "run start",
    combatStart: "combat start",
    turnStart: "turn start",
    turnEnd: "turn end",
    cardPlayed: "card played",
    beforeDamageTaken: "before damage is taken",
    playerDamaged: "player damaged",
    enemyKilled: "enemy killed",
    combatWon: "combat won",
    cardDrawn: "card drawn",
    statusApplied: "status applied"
  }[trigger];
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function EmptyForm({ noun }: { noun: string }) {
  return <p className="emptyHint">Choose or create a {noun}.</p>;
}

type FormProps = { pack: ContentPack; id: string; setPack: (pack: ContentPack, selected?: string) => void };

function updateCard(pack: ContentPack, oldId: string, card: CardDefinition): ContentPack {
  const nextCards = { ...pack.cards };
  delete nextCards[oldId];
  nextCards[card.id] = card;
  return { ...pack, cards: nextCards };
}

function updateEnemy(pack: ContentPack, oldId: string, enemy: EnemyDefinition): ContentPack {
  return { ...pack, enemies: pack.enemies.map((item) => (item.id === oldId ? enemy : item)) };
}

function updateRelic(pack: ContentPack, oldId: string, relic: RelicDefinition): ContentPack {
  const nextRelics = { ...pack.relics };
  delete nextRelics[oldId];
  nextRelics[relic.id] = relic;
  return { ...pack, relics: nextRelics };
}

function updateCharacter(pack: ContentPack, oldId: string, character: CharacterDefinition): ContentPack {
  const nextCharacters = { ...pack.characters };
  delete nextCharacters[oldId];
  nextCharacters[character.id] = character;
  return { ...pack, characters: nextCharacters, defaultCharacterId: pack.defaultCharacterId === oldId ? character.id : pack.defaultCharacterId };
}

function updateEvent(pack: ContentPack, oldId: string, event: GameEvent): ContentPack {
  return { ...pack, events: pack.events.map((item) => (item.id === oldId ? event : item)) };
}

function createDefaultEntry(tab: EditorTab, pack: ContentPack): { pack: ContentPack; selected: string } {
  if (tab === "cards") {
    const id = uniqueId("new_card", Object.keys(pack.cards));
    const card: CardDefinition = { id, name: "New Card", type: "attack", rarity: "common", cost: 1, description: "Deal 6 damage.", upgradedDescription: "Deal 9 damage.", effects: [{ target: "selectedEnemy", param: "hp", op: "subtract", amount: 6 }], upgradedEffects: [{ target: "selectedEnemy", param: "hp", op: "subtract", amount: 9 }] };
    return { pack: updateCard(pack, id, card), selected: id };
  }
  if (tab === "enemies") {
    const id = uniqueId("new_enemy", pack.enemies.map((enemy) => enemy.id));
    return { pack: { ...pack, enemies: [...pack.enemies, { id, name: "New Enemy", tier: "normal", maxHp: 32, armor: 0, moves: [{ id: "strike", intent: "attack", label: "Strike", effects: [{ target: "player", param: "hp", op: "subtract", amount: 6 }] }] }] }, selected: id };
  }
  if (tab === "relics") {
    const id = uniqueId("new_relic", Object.keys(pack.relics));
    const relic: RelicDefinition = { id, name: "New Relic", rarity: "common", description: "At the start of each turn, gain 1 physical armor.", trigger: "turnStart", effects: [{ target: "player", param: "physicalArmor", op: "add", amount: 1 }] };
    return { pack: updateRelic(pack, id, relic), selected: id };
  }
  if (tab === "events") {
    const id = uniqueId("new_event", pack.events.map((event) => event.id));
    const event: GameEvent = { id, title: "New Event", body: "A strange place waits for a decision.", choices: [{ id: "leave", label: "Leave", description: "Continue onward.", actions: [{ type: "skip" }] }] };
    return { pack: { ...pack, events: [...pack.events, event] }, selected: id };
  }
  const id = uniqueId("new_character", Object.keys(pack.characters));
  const character: CharacterDefinition = { id, name: "New Character", maxHp: 72, maxEnergy: 3, gold: 60, starterDeck: ["strike", "strike", "strike", "guard", "guard"], starterRelics: [], passives: [] };
  return { pack: updateCharacter(pack, id, character), selected: id };
}

function duplicateEntry(tab: EditorTab, id: string, pack: ContentPack): { ok: true; pack: ContentPack; selected: string } | { ok: false; message: string } {
  if (tab === "cards" && pack.cards[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.cards));
    return { ok: true, pack: updateCard(pack, newId, { ...clone(pack.cards[id]), id: newId, name: `${pack.cards[id].name} Copy` }), selected: newId };
  }
  if (tab === "enemies") {
    const enemy = pack.enemies.find((item) => item.id === id);
    if (!enemy) return { ok: false, message: "No enemy to copy." };
    const newId = uniqueId(`${id}_copy`, pack.enemies.map((item) => item.id));
    return { ok: true, pack: { ...pack, enemies: [...pack.enemies, { ...clone(enemy), id: newId, name: `${enemy.name} Copy` }] }, selected: newId };
  }
  if (tab === "relics" && pack.relics[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.relics));
    return { ok: true, pack: updateRelic(pack, newId, { ...clone(pack.relics[id]), id: newId, name: `${pack.relics[id].name} Copy` }), selected: newId };
  }
  if (tab === "characters" && pack.characters[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.characters));
    return { ok: true, pack: updateCharacter(pack, newId, { ...clone(pack.characters[id]), id: newId, name: `${pack.characters[id].name} Copy` }), selected: newId };
  }
  if (tab === "events") {
    const event = pack.events.find((item) => item.id === id);
    if (!event) return { ok: false, message: "No event to copy." };
    const newId = uniqueId(`${id}_copy`, pack.events.map((item) => item.id));
    return { ok: true, pack: { ...pack, events: [...pack.events, { ...clone(event), id: newId, title: `${event.title} Copy` }] }, selected: newId };
  }
  return { ok: false, message: `No ${tabNouns[tab]} to copy.` };
}

function removeEntry(tab: EditorTab, id: string, pack: ContentPack): { ok: true; pack: ContentPack; selected: string } | { ok: false; message: string } {
  if (!id) return { ok: false, message: `Choose a ${tabNouns[tab]} first.` };
  if (tab === "cards") {
    if (Object.keys(pack.cards).length <= 1) return { ok: false, message: "At least one card is required." };
    const nextCards = { ...pack.cards };
    delete nextCards[id];
    const next = { ...pack, cards: nextCards };
    return { ok: true, pack: next, selected: firstId(next, tab) };
  }
  if (tab === "enemies") {
    if (pack.enemies.length <= 1) return { ok: false, message: "At least one enemy is required." };
    const next = { ...pack, enemies: pack.enemies.filter((enemy) => enemy.id !== id) };
    return { ok: true, pack: next, selected: firstId(next, tab) };
  }
  if (tab === "relics") {
    const nextRelics = { ...pack.relics };
    delete nextRelics[id];
    const next = { ...pack, relics: nextRelics };
    return { ok: true, pack: next, selected: firstId(next, tab) };
  }
  if (tab === "events") {
    if (pack.events.length <= 1) return { ok: false, message: "At least one event is required." };
    const next = { ...pack, events: pack.events.filter((event) => event.id !== id) };
    return { ok: true, pack: next, selected: firstId(next, tab) };
  }
  if (Object.keys(pack.characters).length <= 1) return { ok: false, message: "At least one character is required." };
  const nextCharacters = { ...pack.characters };
  delete nextCharacters[id];
  const fallback = Object.keys(nextCharacters)[0];
  const next = { ...pack, characters: nextCharacters, defaultCharacterId: pack.defaultCharacterId === id ? fallback : pack.defaultCharacterId };
  return { ok: true, pack: next, selected: firstId(next, tab) };
}

function getTabItems(pack: ContentPack, tab: EditorTab): EditorItem[] {
  if (tab === "cards") return Object.values(pack.cards).map((card) => ({ id: card.id, name: card.name, meta: `${card.type} / ${card.rarity} / ${card.cost} cost`, tone: card.type }));
  if (tab === "enemies") return pack.enemies.map((enemy) => ({ id: enemy.id, name: enemy.name, meta: `${enemy.tier} / ${enemy.maxHp} HP / ${enemy.moves.length} moves`, tone: enemy.tier }));
  if (tab === "relics") return Object.values(pack.relics).map((relic) => ({ id: relic.id, name: relic.name, meta: `${relic.rarity} / ${relic.trigger}`, tone: relic.rarity }));
  if (tab === "events") return pack.events.map((event) => ({ id: event.id, name: event.title, meta: `${event.acts?.join(",") || "all acts"} / ${event.choices.length} choices`, tone: "event" }));
  return Object.values(pack.characters).map((character) => ({ id: character.id, name: character.name, meta: `${character.maxHp} HP / ${character.maxEnergy} energy`, tone: character.id === pack.defaultCharacterId ? "rare" : "common" }));
}

function getSelectedItem(pack: ContentPack, tab: EditorTab, id: string) {
  if (tab === "cards") return pack.cards[id];
  if (tab === "enemies") return pack.enemies.find((enemy) => enemy.id === id);
  if (tab === "relics") return pack.relics[id];
  if (tab === "events") return pack.events.find((event) => event.id === id);
  return pack.characters[id];
}

function itemDisplayName(item: CardDefinition | EnemyDefinition | RelicDefinition | CharacterDefinition | GameEvent) {
  return "name" in item ? item.name : item.title;
}

function firstId(pack: ContentPack, tab: EditorTab) {
  return getTabItems(pack, tab)[0]?.id ?? "";
}

function errorsForSelection(errors: string[], tab: EditorTab, id: string) {
  if (!id) return [];
  const label = tab === "cards" ? "Card" : tab === "enemies" ? "Enemy" : tab === "relics" ? "Relic" : tab === "events" ? "Event" : "Character";
  return errors.filter((error) => error.includes(`${label} ${id}`) || error.includes(`${label} ${id}_`) || error.includes(`${label} ${id} `));
}

function normalizeEffect(effect: Effect): Effect {
  const next = { ...effect };
  if (next.param === "statusAmount") next.status ??= "strength";
  else delete next.status;
  if (next.param === "cards") {
    next.fromZone ??= "drawPile";
    if (next.op === "move") next.toZone ??= "hand";
  } else {
    delete next.fromZone;
    delete next.toZone;
  }
  if (!["cards", "upgraded", "cost"].includes(next.param)) delete next.cardFilter;
  return next;
}

function normalizeEventAction(action: EventAction): EventAction {
  const next: EventAction = { ...action };
  if (!eventActionTypes.includes(next.type)) next.type = "skip";
  if (!eventActionNeedsAmount(next.type)) delete next.amount;
  if (next.type !== "addCard" && next.type !== "addCurse") delete next.cardId;
  if (next.type !== "gainRelic") delete next.relicId;
  if (next.type !== "enterDungeon") delete next.dungeonThreat;
  if (next.type !== "startEventCombat") {
    delete next.tier;
    delete next.encounterId;
    delete next.onWinActions;
  } else {
    next.tier ??= "normal";
    next.onWinActions ??= [];
  }
  return next;
}

function eventActionNeedsAmount(type: EventActionType) {
  return ["gainGold", "loseGold", "loseHp", "heal", "gainMaxHp", "loseMaxHp", "gainThreat"].includes(type);
}

function defaultEventActionAmount(type: EventActionType) {
  if (type === "gainGold" || type === "loseGold") return 50;
  if (type === "gainThreat") return 1;
  return 5;
}

function parseActs(value: string) {
  const acts = value.split(/[,\s]+/).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 3);
  return acts.length ? Array.from(new Set(acts)) : undefined;
}

function parseCondition(text: string): EffectCondition | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as EffectCondition;
  } catch {
    return undefined;
  }
}

function summaryLines(tab: EditorTab, item: CardDefinition | EnemyDefinition | RelicDefinition | CharacterDefinition | GameEvent) {
  if (tab === "cards") {
    const card = item as CardDefinition;
    return [`${card.type} / ${card.rarity}`, `${card.effects.length} base effects`, `${card.upgradedEffects.length} upgraded effects`];
  }
  if (tab === "enemies") {
    const enemy = item as EnemyDefinition;
    return [`${enemy.tier}`, `${enemy.maxHp} HP`, `${enemy.moves.length} moves`];
  }
  if (tab === "relics") {
    const relic = item as RelicDefinition;
    return [`${relic.rarity}`, relic.trigger, `${relic.effects.length} effects`];
  }
  if (tab === "events") {
    const event = item as GameEvent;
    return [`${event.acts?.join(", ") || "all acts"}`, `${event.choices.length} choices`, `weight ${event.weight ?? 1}`];
  }
  const character = item as CharacterDefinition;
  return [`${character.maxHp} HP`, `${character.maxEnergy} energy`, `${character.starterDeck.length} cards`, `${character.passives.length} passives`];
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function uniqueId(base: string, ids: string[]) {
  const normalized = base.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "new_item";
  let id = normalized;
  let index = 2;
  while (ids.includes(id)) {
    id = `${normalized}_${index}`;
    index += 1;
  }
  return id;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
