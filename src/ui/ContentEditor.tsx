import { AlertTriangle, Copy, Download, FileJson, Plus, RotateCcw, Save, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clearContentDraft, defaultContentPack, saveContentDraft, validateContentPack } from "../game/content";
import type { CardDefinition, CardType, ContentPack, Effect, EnemyDefinition, EnemyMove, Rarity, RelicDefinition, RelicEffect, RelicTrigger } from "../game/types";

type EditorTab = "cards" | "enemies" | "relics";
type ConfirmAction = "delete" | "reset" | "import" | null;
type EditorMessage = { tone: "info" | "success" | "warn"; text: string };

type EditorItem = {
  id: string;
  name: string;
  meta: string;
  tone: string;
};

const tabs: { id: EditorTab; label: string }[] = [
  { id: "cards", label: "卡牌" },
  { id: "enemies", label: "敌人" },
  { id: "relics", label: "遗物" }
];

const cardTypes: CardType[] = ["attack", "skill", "power", "status", "curse"];
const rarities: Rarity[] = ["basic", "common", "uncommon", "rare"];
const effectTypes: Effect["type"][] = ["damage", "block", "draw", "gainEnergy", "applyWeak", "applyVulnerable", "applyPoison", "heal", "strength", "thorns"];
const intents: EnemyMove["intent"][] = ["attack", "defend", "buff", "debuff", "mixed"];
const tiers: EnemyDefinition["tier"][] = ["normal", "elite", "boss"];
const relicTriggers: RelicTrigger[] = ["runStart", "combatStart", "turnStart", "cardPlayed", "playerDamaged", "combatWon"];
const relicEffectTypes: RelicEffect["type"][] = ["gainBlock", "gainEnergy", "draw", "heal", "gainGold", "gainStrength", "reduceDamage", "applyStatus"];
const statuses: NonNullable<RelicEffect["status"]>[] = ["weak", "vulnerable", "poison", "strength", "thorns"];

const tabNouns: Record<EditorTab, string> = { cards: "卡牌", enemies: "敌人", relics: "遗物" };

export function ContentEditor({ initialPack, onNewRun }: { initialPack: ContentPack; onNewRun: () => void }) {
  const [pack, setPack] = useState<ContentPack>(() => clone(initialPack));
  const [tab, setTab] = useState<EditorTab>("cards");
  const [selected, setSelected] = useState(() => firstId(initialPack, "cards"));
  const [query, setQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [pendingImport, setPendingImport] = useState<ContentPack | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [message, setMessage] = useState<EditorMessage>({ tone: "info", text: "改动会先保存在当前草稿里，点击保存后才会影响新开局。" });

  const validation = useMemo(() => validateContentPack(pack), [pack]);
  const exportText = useMemo(() => JSON.stringify(pack, null, 2), [pack]);
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
    setMessage({ tone: "info", text: "草稿已更新，保存后新开局会使用这些内容。" });
  };

  const saveDraft = (startNewRun = false) => {
    const result = validateContentPack(pack);
    if (!result.valid) {
      setMessage({ tone: "warn", text: "还有校验问题，修好后才能保存草稿。" });
      return;
    }
    saveContentDraft(pack);
    setMessage({ tone: "success", text: startNewRun ? "草稿已保存，并已开始新开局。" : "草稿已保存，新开局会使用这些内容。" });
    if (startNewRun) onNewRun();
  };

  const prepareImport = () => {
    try {
      const parsed = JSON.parse(importText) as ContentPack;
      const result = validateContentPack(parsed);
      if (!result.valid) {
        setMessage({ tone: "warn", text: `导入被拦截：${result.errors[0]}` });
        return;
      }
      setPendingImport(parsed);
      setConfirmAction("import");
    } catch {
      setMessage({ tone: "warn", text: "导入被拦截：JSON 格式无效。" });
    }
  };

  const runConfirmedAction = () => {
    if (confirmAction === "delete") {
      const result = removeEntry(tab, selected, pack);
      if (!result.ok) {
        setMessage({ tone: "warn", text: result.message });
      } else {
        updatePack(result.pack, result.selected);
        setMessage({ tone: "success", text: `${tabNouns[tab]}已删除。` });
      }
    }
    if (confirmAction === "reset") {
      clearContentDraft();
      const next = clone(defaultContentPack);
      setPack(next);
      setSelected(firstId(next, tab));
      setMessage({ tone: "success", text: "已恢复默认内容，并清空浏览器草稿。" });
      onNewRun();
    }
    if (confirmAction === "import" && pendingImport) {
      const next = clone(pendingImport);
      setPack(next);
      setSelected(firstId(next, tab));
      setMessage({ tone: "success", text: "JSON 已导入到当前草稿。确认无误后点击保存草稿。" });
      setPendingImport(null);
    }
    setConfirmAction(null);
  };

  return (
    <section className="editor">
      <header className="editorHeader editorWorkbenchHeader">
        <div>
          <p className="eyebrow">内部内容工具</p>
          <h2>内容编辑器</h2>
        </div>
        <div className="editorActions">
          <button className="toolButton" onClick={() => saveDraft()}><Save /> 保存草稿</button>
          <button className="toolButton" onClick={() => saveDraft(true)}><Save /> 保存并新开局</button>
          <button className="toolButton" onClick={() => setConfirmAction("reset")}><RotateCcw /> 重置默认</button>
        </div>
      </header>

      <div className="editorStatus">
        <span className={`editorMessage ${message.tone}`}>{message.text}</span>
        <span className={validation.valid ? "ok" : "warn"}>{validation.valid ? "内容校验通过" : `${validation.errors.length} 个校验问题`}</span>
      </div>

      <div className="tabs editorTabs">
        {tabs.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => selectTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="editorWorkbench">
        <EditorList
          pack={pack}
          tab={tab}
          selected={selected}
          query={query}
          setQuery={setQuery}
          onSelect={setSelected}
          onAdd={() => {
            const result = createDefaultEntry(tab, pack);
            updatePack(result.pack, result.selected);
          }}
          onCopy={() => {
            const result = duplicateEntry(tab, selected, pack);
            if (!result.ok) {
              setMessage({ tone: "warn", text: result.message });
              return;
            }
            updatePack(result.pack, result.selected);
          }}
        />

        <main className="editorForm">
          {tab === "cards" ? <CardForm pack={pack} id={selected} setPack={updatePack} /> : null}
          {tab === "enemies" ? <EnemyForm pack={pack} id={selected} setPack={updatePack} /> : null}
          {tab === "relics" ? <RelicForm pack={pack} id={selected} setPack={updatePack} /> : null}
          <div className="formSection dangerSection">
            <div>
              <h3>危险操作</h3>
              <p>删除只会影响当前草稿，保存前可以通过重置或重新导入恢复。</p>
            </div>
            <button className="dangerButton" onClick={() => setConfirmAction("delete")} disabled={!selectedItem}>
              <Trash2 /> 删除当前{tabNouns[tab]}
            </button>
          </div>
        </main>

        <aside className="editorInspector">
          <PreviewPanel tab={tab} item={selectedItem} />
          <ValidationPanel selectionErrors={selectionErrors} otherErrors={otherErrors} />
        </aside>
      </div>

      <section className="jsonTools">
        <label>
          导出 JSON
          <textarea readOnly value={exportText} />
        </label>
        <label>
          导入 JSON
          <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴 ContentPack JSON，导入前会先校验。" />
        </label>
        <div className="jsonToolActions">
          <button className="toolButton" onClick={prepareImport}><Upload /> 导入到草稿</button>
          <button className="toolButton" onClick={() => setMessage({ tone: "info", text: "导出内容已在左侧文本框中准备好。" })}><Download /> 导出已就绪</button>
        </div>
      </section>

      {confirmAction ? (
        <ConfirmDialog action={confirmAction} tab={tab} selectedName={selectedItem?.name ?? selected} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmedAction} />
      ) : null}
    </section>
  );
}

function EditorList({ pack, tab, selected, query, setQuery, onSelect, onAdd, onCopy }: { pack: ContentPack; tab: EditorTab; selected: string; query: string; setQuery: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void; onCopy: () => void }) {
  const items = useMemo(() => getTabItems(pack, tab).filter((item) => `${item.id} ${item.name} ${item.meta}`.toLowerCase().includes(query.toLowerCase())), [pack, tab, query]);

  return (
    <aside className="editorList">
      <div className="searchBox">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${tabNouns[tab]}`} />
      </div>
      <div className="listActions">
        <button className="iconTextButton" onClick={onAdd}><Plus /> 新建</button>
        <button className="iconTextButton" onClick={onCopy} disabled={!selected}><Copy /> 复制</button>
      </div>
      <div className="itemList">
        {items.length ? items.map((item) => (
          <button key={item.id} className={item.id === selected ? "active" : ""} onClick={() => onSelect(item.id)}>
            <span className={`itemTone ${item.tone}`}>{tabNouns[tab]}</span>
            <strong>{item.name}</strong>
            <span>{item.id}</span>
            <small>{item.meta}</small>
          </button>
        )) : <p className="emptyHint">没有匹配内容。</p>}
      </div>
    </aside>
  );
}

function CardForm({ pack, id, setPack }: FormProps) {
  const card = pack.cards[id];
  if (!card) return <EmptyForm noun="卡牌" />;
  const update = (patch: Partial<CardDefinition>) => {
    const next = updateCard(pack, id, { ...card, ...patch });
    setPack(next, patch.id ?? card.id);
  };

  return (
    <>
      <FormSection title="基础信息" description="这些字段决定卡牌在奖励、商店和战斗中的显示方式。">
        <TextField label="ID" value={card.id} onChange={(value) => update({ id: value })} />
        <TextField label="名称" value={card.name} onChange={(value) => update({ name: value })} />
        <SelectField label="类型" value={card.type} options={cardTypes} onChange={(value) => update({ type: value as CardType })} />
        <SelectField label="稀有度" value={card.rarity} options={rarities} onChange={(value) => update({ rarity: value as Rarity })} />
      </FormSection>
      <FormSection title="战斗数值" description="费用和文本会直接进入游戏内卡牌展示。">
        <NumberField label="费用" value={card.cost} min={0} onChange={(value) => update({ cost: value })} />
        <CheckField label="打出后消耗" checked={Boolean(card.exhaust)} onChange={(value) => update({ exhaust: value || undefined })} />
        <CheckField label="虚无" checked={Boolean(card.ethereal)} onChange={(value) => update({ ethereal: value || undefined })} />
        <TextAreaField label="描述" value={card.description} onChange={(value) => update({ description: value })} />
        <TextAreaField label="升级描述" value={card.upgradedDescription} onChange={(value) => update({ upgradedDescription: value })} />
      </FormSection>
      <EffectList label="基础效果" effects={card.effects} onChange={(effects) => update({ effects })} />
      <EffectList label="升级效果" effects={card.upgradedEffects} onChange={(upgradedEffects) => update({ upgradedEffects })} />
    </>
  );
}

function EnemyForm({ pack, id, setPack }: FormProps) {
  const enemy = pack.enemies.find((item) => item.id === id);
  if (!enemy) return <EmptyForm noun="敌人" />;
  const update = (patch: Partial<EnemyDefinition>) => {
    const nextEnemy = { ...enemy, ...patch };
    setPack(updateEnemy(pack, id, nextEnemy), nextEnemy.id);
  };

  return (
    <>
      <FormSection title="基础信息" description="层级会影响地图节点选择和战斗难度曲线。">
        <TextField label="ID" value={enemy.id} onChange={(value) => update({ id: value })} />
        <TextField label="名称" value={enemy.name} onChange={(value) => update({ name: value })} />
        <SelectField label="层级" value={enemy.tier} options={tiers} onChange={(value) => update({ tier: value as EnemyDefinition["tier"] })} />
      </FormSection>
      <FormSection title="战斗数值" description="基础生命和护甲会被威胁等级继续缩放。">
        <NumberField label="最大生命" value={enemy.maxHp} min={1} onChange={(value) => update({ maxHp: value })} />
        <NumberField label="初始护甲" value={enemy.armor} min={0} onChange={(value) => update({ armor: value })} />
      </FormSection>
      <MoveList moves={enemy.moves} onChange={(moves) => update({ moves })} />
    </>
  );
}

function RelicForm({ pack, id, setPack }: FormProps) {
  const relic = pack.relics[id];
  if (!relic) return <EmptyForm noun="遗物" />;
  const update = (patch: Partial<RelicDefinition>) => {
    const next = updateRelic(pack, id, { ...relic, ...patch });
    setPack(next, patch.id ?? relic.id);
  };

  return (
    <>
      <FormSection title="基础信息" description="遗物会在获得后根据触发时机自动生效。">
        <TextField label="ID" value={relic.id} onChange={(value) => update({ id: value })} />
        <TextField label="名称" value={relic.name} onChange={(value) => update({ name: value })} />
        <SelectField label="稀有度" value={relic.rarity} options={rarities} onChange={(value) => update({ rarity: value as Rarity })} />
        <SelectField label="触发时机" value={relic.trigger} options={relicTriggers} onChange={(value) => update({ trigger: value as RelicTrigger })} />
        <TextAreaField label="描述" value={relic.description} onChange={(value) => update({ description: value })} />
      </FormSection>
      <RelicEffectList effects={relic.effects} onChange={(effects) => update({ effects })} />
    </>
  );
}

function MoveList({ moves, onChange }: { moves: EnemyMove[]; onChange: (moves: EnemyMove[]) => void }) {
  const update = (index: number, move: EnemyMove) => onChange(moves.map((item, i) => (i === index ? move : item)));
  return (
    <fieldset className="nestedEditor">
      <legend>敌人行动</legend>
      {moves.map((move, index) => (
        <div className="nestedItem" key={`${move.id}-${index}`}>
          <TextField label="行动 ID" value={move.id} onChange={(value) => update(index, { ...move, id: value })} />
          <TextField label="名称" value={move.label} onChange={(value) => update(index, { ...move, label: value })} />
          <SelectField label="意图" value={move.intent} options={intents} onChange={(value) => update(index, { ...move, intent: value as EnemyMove["intent"] })} />
          <NumberField label="伤害" value={move.damage ?? 0} min={0} onChange={(value) => update(index, { ...move, damage: value || undefined })} />
          <NumberField label="段数" value={move.hits ?? 1} min={1} onChange={(value) => update(index, { ...move, hits: value })} />
          <NumberField label="格挡" value={move.block ?? 0} min={0} onChange={(value) => update(index, { ...move, block: value || undefined })} />
          <EffectList label="附加效果" effects={move.effects ?? []} onChange={(effects) => update(index, { ...move, effects })} />
          <button className="miniButton removeButton" onClick={() => onChange(moves.filter((_, i) => i !== index))}>移除行动</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...moves, { id: uniqueId("move", moves.map((move) => move.id)), intent: "attack", label: "Strike", damage: 6 }])}>新增行动</button>
    </fieldset>
  );
}

function EffectList({ label, effects, onChange }: { label: string; effects: Effect[]; onChange: (effects: Effect[]) => void }) {
  return (
    <fieldset className="nestedEditor">
      <legend>{label}</legend>
      {effects.map((effect, index) => (
        <div className="effectRow" key={`${effect.type}-${index}`}>
          <SelectField label="类型" value={effect.type} options={effectTypes} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, type: value as Effect["type"] } : item)))} />
          <NumberField label="数值" value={effect.amount} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, amount: value } : item)))} />
          <button className="miniButton removeButton" onClick={() => onChange(effects.filter((_, i) => i !== index))}>移除</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...effects, { type: "damage", amount: 1 }])}>新增效果</button>
    </fieldset>
  );
}

function RelicEffectList({ effects, onChange }: { effects: RelicEffect[]; onChange: (effects: RelicEffect[]) => void }) {
  return (
    <fieldset className="nestedEditor">
      <legend>遗物效果</legend>
      {effects.map((effect, index) => (
        <div className="effectRow" key={`${effect.type}-${index}`}>
          <SelectField label="类型" value={effect.type} options={relicEffectTypes} onChange={(value) => onChange(effects.map((item, i) => (i === index ? normalizeRelicEffect({ ...item, type: value as RelicEffect["type"] }) : item)))} />
          <NumberField label="数值" value={effect.amount} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, amount: value } : item)))} />
          {effect.type === "applyStatus" ? <SelectField label="状态" value={effect.status ?? "strength"} options={statuses} onChange={(value) => onChange(effects.map((item, i) => (i === index ? { ...item, status: value as RelicEffect["status"] } : item)))} /> : null}
          <button className="miniButton removeButton" onClick={() => onChange(effects.filter((_, i) => i !== index))}>移除</button>
        </div>
      ))}
      <button className="miniButton addNestedButton" onClick={() => onChange([...effects, { type: "gainBlock", amount: 1 }])}>新增遗物效果</button>
    </fieldset>
  );
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="formSection">
      <div className="formSectionHeader">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="formGrid">{children}</div>
    </section>
  );
}

function PreviewPanel({ tab, item }: { tab: EditorTab; item?: CardDefinition | EnemyDefinition | RelicDefinition }) {
  return (
    <section className="previewPanel">
      <div className="panelHeader">
        <h3>实时预览</h3>
        <span>{tabNouns[tab]}</span>
      </div>
      {!item ? <p className="emptyHint">选择或新建内容后会显示预览。</p> : null}
      {tab === "cards" && item ? <CardPreview card={item as CardDefinition} /> : null}
      {tab === "enemies" && item ? <EnemyPreview enemy={item as EnemyDefinition} /> : null}
      {tab === "relics" && item ? <RelicPreview relic={item as RelicDefinition} /> : null}
    </section>
  );
}

function CardPreview({ card }: { card: CardDefinition }) {
  return (
    <div className={`card editorCardPreview ${card.type}`}>
      <span className="cost">{card.cost}</span>
      <strong>{card.name || "未命名卡牌"}</strong>
      <small>{card.type} / {card.rarity}</small>
      <p>{card.description || "暂无描述。"}</p>
      <div className="previewMeta">
        <span>{card.effects.length} 个基础效果</span>
        <span>{card.upgradedEffects.length} 个升级效果</span>
        {card.exhaust ? <span>消耗</span> : null}
        {card.ethereal ? <span>虚无</span> : null}
      </div>
    </div>
  );
}

function EnemyPreview({ enemy }: { enemy: EnemyDefinition }) {
  return (
    <div className="enemyPreview">
      <div className="enemyPreviewTop">
        <strong>{enemy.name || "未命名敌人"}</strong>
        <span>{enemy.tier}</span>
      </div>
      <div className="previewStats">
        <span>生命 {enemy.maxHp}</span>
        <span>护甲 {enemy.armor}</span>
        <span>{enemy.moves.length} 个行动</span>
      </div>
      <div className="movePreviewList">
        {enemy.moves.map((move) => (
          <div key={move.id || move.label} className="movePreview">
            <strong>{move.label || move.id || "未命名行动"}</strong>
            <span>{move.intent}</span>
            <small>{intentSummary(move)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelicPreview({ relic }: { relic: RelicDefinition }) {
  return (
    <div className="relicPreview">
      <div>
        <strong>{relic.name || "未命名遗物"}</strong>
        <span>{relic.rarity}</span>
      </div>
      <p>{relic.description || "暂无描述。"}</p>
      <div className="previewMeta">
        <span>触发：{relic.trigger}</span>
        <span>{relic.effects.length} 个效果</span>
      </div>
      <div className="effectSummary">
        {relic.effects.map((effect, index) => <span key={`${effect.type}-${index}`}>{effect.type} {effect.amount}{effect.status ? ` / ${effect.status}` : ""}</span>)}
      </div>
    </div>
  );
}

function ValidationPanel({ selectionErrors, otherErrors }: { selectionErrors: string[]; otherErrors: string[] }) {
  const hasErrors = selectionErrors.length > 0 || otherErrors.length > 0;
  return (
    <section className="validationPanel">
      <div className="panelHeader">
        <h3>校验状态</h3>
        <span className={hasErrors ? "warn" : "ok"}>{hasErrors ? "需要处理" : "通过"}</span>
      </div>
      {!hasErrors ? <p className="okText">当前内容包可以保存。</p> : null}
      {selectionErrors.length ? (
        <div className="errorGroup">
          <strong>当前项</strong>
          {selectionErrors.map((error) => <span key={error}>{error}</span>)}
        </div>
      ) : null}
      {otherErrors.length ? (
        <details className="errorGroup">
          <summary>其他问题（{otherErrors.length}）</summary>
          {otherErrors.map((error) => <span key={error}>{error}</span>)}
        </details>
      ) : null}
    </section>
  );
}

function ConfirmDialog({ action, tab, selectedName, onCancel, onConfirm }: { action: Exclude<ConfirmAction, null>; tab: EditorTab; selectedName: string; onCancel: () => void; onConfirm: () => void }) {
  const copy = {
    delete: { title: `删除${tabNouns[tab]}`, body: `确定要删除“${selectedName}”吗？这个操作只影响当前草稿。`, confirm: "确认删除" },
    reset: { title: "重置默认内容", body: "确定要清空浏览器草稿并恢复默认内容吗？当前未保存编辑会丢失。", confirm: "确认重置" },
    import: { title: "导入 JSON", body: "导入会覆盖当前编辑器草稿，但不会立刻写入浏览器草稿。", confirm: "确认导入" }
  }[action];

  return (
    <div className="confirmBackdrop" role="presentation">
      <div className="confirmDialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <AlertTriangle />
        <h3 id="confirm-title">{copy.title}</h3>
        <p>{copy.body}</p>
        <div className="confirmActions">
          <button className="toolButton" onClick={onCancel}>取消</button>
          <button className="dangerButton" onClick={onConfirm}>{copy.confirm}</button>
        </div>
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
  return <label className="checkField"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

function EmptyForm({ noun }: { noun: string }) {
  return <p className="emptyHint">选择或新建一个{noun}。</p>;
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

function createDefaultEntry(tab: EditorTab, pack: ContentPack): { pack: ContentPack; selected: string } {
  if (tab === "cards") {
    const id = uniqueId("new_card", Object.keys(pack.cards));
    const card: CardDefinition = { id, name: "New Card", type: "attack", rarity: "common", cost: 1, description: "Deal 6 damage.", upgradedDescription: "Deal 9 damage.", effects: [{ type: "damage", amount: 6 }], upgradedEffects: [{ type: "damage", amount: 9 }] };
    return { pack: updateCard(pack, id, card), selected: id };
  }
  if (tab === "enemies") {
    const id = uniqueId("new_enemy", pack.enemies.map((enemy) => enemy.id));
    return { pack: { ...pack, enemies: [...pack.enemies, { id, name: "New Enemy", tier: "normal", maxHp: 32, armor: 0, moves: [{ id: "strike", intent: "attack", label: "Strike", damage: 6 }] }] }, selected: id };
  }
  const id = uniqueId("new_relic", Object.keys(pack.relics));
  const relic: RelicDefinition = { id, name: "New Relic", rarity: "common", description: "At the start of each turn, gain 1 block.", trigger: "turnStart", effects: [{ type: "gainBlock", amount: 1 }] };
  return { pack: updateRelic(pack, id, relic), selected: id };
}

function duplicateEntry(tab: EditorTab, id: string, pack: ContentPack): { ok: true; pack: ContentPack; selected: string } | { ok: false; message: string } {
  if (tab === "cards" && pack.cards[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.cards));
    const card = { ...clone(pack.cards[id]), id: newId, name: `${pack.cards[id].name} Copy` };
    return { ok: true, pack: updateCard(pack, newId, card), selected: newId };
  }
  if (tab === "enemies") {
    const enemy = pack.enemies.find((item) => item.id === id);
    if (!enemy) return { ok: false, message: "没有可复制的敌人。" };
    const newId = uniqueId(`${id}_copy`, pack.enemies.map((item) => item.id));
    return { ok: true, pack: { ...pack, enemies: [...pack.enemies, { ...clone(enemy), id: newId, name: `${enemy.name} Copy` }] }, selected: newId };
  }
  if (tab === "relics" && pack.relics[id]) {
    const newId = uniqueId(`${id}_copy`, Object.keys(pack.relics));
    const relic = { ...clone(pack.relics[id]), id: newId, name: `${pack.relics[id].name} Copy` };
    return { ok: true, pack: updateRelic(pack, newId, relic), selected: newId };
  }
  return { ok: false, message: `没有可复制的${tabNouns[tab]}。` };
}

function removeEntry(tab: EditorTab, id: string, pack: ContentPack): { ok: true; pack: ContentPack; selected: string } | { ok: false; message: string } {
  if (!id) return { ok: false, message: `请先选择一个${tabNouns[tab]}。` };
  if (tab === "cards") {
    if (Object.keys(pack.cards).length <= 1) return { ok: false, message: "至少需要保留一张卡牌。" };
    const nextCards = { ...pack.cards };
    delete nextCards[id];
    const next = { ...pack, cards: nextCards };
    return { ok: true, pack: next, selected: firstId(next, tab) };
  }
  if (tab === "enemies") {
    if (pack.enemies.length <= 1) return { ok: false, message: "至少需要保留一个敌人。" };
    const next = { ...pack, enemies: pack.enemies.filter((enemy) => enemy.id !== id) };
    return { ok: true, pack: next, selected: firstId(next, tab) };
  }
  const nextRelics = { ...pack.relics };
  delete nextRelics[id];
  const next = { ...pack, relics: nextRelics };
  return { ok: true, pack: next, selected: firstId(next, tab) };
}

function getTabItems(pack: ContentPack, tab: EditorTab): EditorItem[] {
  if (tab === "cards") return Object.values(pack.cards).map((card) => ({ id: card.id, name: card.name, meta: `${card.type} / ${card.rarity} / ${card.cost} 费`, tone: card.type }));
  if (tab === "enemies") return pack.enemies.map((enemy) => ({ id: enemy.id, name: enemy.name, meta: `${enemy.tier} / ${enemy.maxHp} HP / ${enemy.moves.length} moves`, tone: enemy.tier }));
  return Object.values(pack.relics).map((relic) => ({ id: relic.id, name: relic.name, meta: `${relic.rarity} / ${relic.trigger}`, tone: relic.rarity }));
}

function getSelectedItem(pack: ContentPack, tab: EditorTab, id: string) {
  if (tab === "cards") return pack.cards[id];
  if (tab === "enemies") return pack.enemies.find((enemy) => enemy.id === id);
  return pack.relics[id];
}

function firstId(pack: ContentPack, tab: EditorTab) {
  return getTabItems(pack, tab)[0]?.id ?? "";
}

function errorsForSelection(errors: string[], tab: EditorTab, id: string) {
  if (!id) return [];
  const label = tab === "cards" ? "Card" : tab === "enemies" ? "Enemy" : "Relic";
  return errors.filter((error) => error.includes(`${label} ${id}`) || error.includes(`${label} ${id}_`) || error.includes(`${label} ${id} `));
}

function normalizeRelicEffect(effect: RelicEffect): RelicEffect {
  if (effect.type === "applyStatus") return { ...effect, status: effect.status ?? "strength" };
  const { status: _status, ...rest } = effect;
  return rest;
}

function intentSummary(move: EnemyMove) {
  const parts = [move.damage ? `${move.damage}x${move.hits ?? 1} 伤害` : "", move.block ? `${move.block} 格挡` : "", move.effects?.length ? `${move.effects.length} 效果` : ""].filter(Boolean);
  return parts.join(" / ") || "无数值";
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
