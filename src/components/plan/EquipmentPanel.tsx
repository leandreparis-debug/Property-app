"use client";

import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pencil, Search } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INPUT_CLASS } from "@/components/editing/FieldInput";
import { categoryOf, EQUIPMENT_CATEGORIES, EQUIPMENT_TYPES, equipmentTypeLabel, type EquipmentCategoryCode } from "@/domain/equipment/catalog";
import type { EquipmentView } from "@/server/plans/data";
import { cn } from "@/lib/utils";
import { Pictogram } from "./Pictogram";

/** Props of {@link EquipmentPanel}. */
export interface EquipmentPanelProps {
  equipments: readonly EquipmentView[];
  selectedId: string | null;
  /** Selects (and centers) an equipment, or clears the selection. */
  onSelect: (id: string | null) => void;
  canEdit: boolean;
  /** The selected equipment has an unsaved position. */
  hasDraft: boolean;
  onNudge: (eastM: number, northM: number) => void;
  onSaveMove: () => void;
  onCancelMove: () => void;
  onEdit: (id: string) => void;
  onArchive: (id: string, comment: string) => Promise<string | null>;
  savingMove: boolean;
}

const categoryCode = (type: string): EquipmentCategoryCode | "OTHER" => categoryOf(type)?.code ?? "OTHER";

/**
 * « Équipements »: counts per category (filter toggles), type filter, search
 * on label or reference, the list (each row selects and centers the
 * equipment) and the card of the selected equipment with its actions. A
 * complete alternative to the map, keyboard included.
 */
export function EquipmentPanel(props: EquipmentPanelProps) {
  const { equipments, selectedId, onSelect, canEdit, hasDraft, onNudge, onSaveMove, onCancelMove, onEdit, onArchive, savingMove } = props;
  const id = useId().replace(/:/g, "");
  const [categories, setCategories] = useState<ReadonlySet<string>>(new Set());
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of equipments) out.set(categoryCode(e.type), (out.get(categoryCode(e.type)) ?? 0) + 1);
    return out;
  }, [equipments]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    return equipments.filter(
      (e) =>
        (categories.size === 0 || categories.has(categoryCode(e.type))) &&
        (!type || e.type === type) &&
        (!q || (e.label ?? "").toLocaleLowerCase("fr").includes(q) || (e.reference ?? "").toLocaleLowerCase("fr").includes(q)),
    );
  }, [equipments, categories, type, query]);
  const selected = equipments.find((e) => e.id === selectedId) ?? null;
  const toggle = (code: string) =>
    setCategories((all) => {
      const next = new Set(all);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const typeOptions = EQUIPMENT_TYPES.filter((t) => categories.size === 0 || categories.has(t.category));

  return (
    <aside aria-labelledby={`${id}-title`} data-slot="equipment-panel" className="flex min-h-0 flex-col border-border bg-surface-1 lg:border-l">
      <div className="border-b border-border p-4">
        <h3 id={`${id}-title`} className="text-sm font-semibold">
          Équipements <span className="numeric font-normal text-text-muted">({equipments.length})</span>
        </h3>
        <div role="group" aria-label="Filtrer par catégorie" className="mt-3 flex flex-wrap gap-1.5">
          {EQUIPMENT_CATEGORIES.map((c) => (
            <button
              key={c.code}
              type="button"
              aria-pressed={categories.has(c.code)}
              onClick={() => toggle(c.code)}
              data-slot="category-filter"
              className={cn(
                "rounded-sm border px-2 py-1 text-xs transition-colors outline-none focus-visible:outline-2 focus-visible:outline-ring",
                categories.has(c.code) ? "border-accent bg-accent/10 text-text" : "border-border text-text-muted hover:text-text",
              )}
            >
              {c.labelFr} <span className="numeric">{counts.get(c.code) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2">
          <label htmlFor={`${id}-type`} className="sr-only">
            Type d&apos;équipement
          </label>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)} className={INPUT_CLASS}>
            <option value="">Tous les types</option>
            {typeOptions.map((t) => (
              <option key={t.code} value={t.code}>
                {t.labelFr}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input type="search" aria-label="Rechercher un libellé ou une référence" placeholder="Libellé ou référence" value={query} onChange={(e) => setQuery(e.target.value)} className={cn(INPUT_CLASS, "pl-8")} />
          </div>
        </div>
      </div>

      <ul aria-label="Liste des équipements" data-slot="equipment-list" className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              aria-current={e.id === selectedId ? "true" : undefined}
              onClick={() => onSelect(e.id === selectedId ? null : e.id)}
              data-slot="equipment-row"
              className={cn(
                "flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-ring",
                e.id === selectedId ? "bg-surface-2 ring-2 ring-accent ring-inset" : "hover:bg-surface-2",
              )}
            >
              <Pictogram type={e.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.label ?? equipmentTypeLabel(e.type)}</span>
                <span className="block truncate text-xs text-text-muted">
                  {equipmentTypeLabel(e.type)}
                  {e.reference && ` · ${e.reference}`}
                  {!e.lngLat && " · sans position"}
                </span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-text-muted">{equipments.length ? "Aucun équipement ne correspond aux filtres." : "Aucun équipement sur ce site."}</li>}
      </ul>

      {selected && (
        <SelectedCard
          equipment={selected}
          canEdit={canEdit}
          hasDraft={hasDraft}
          savingMove={savingMove}
          onNudge={onNudge}
          onSaveMove={onSaveMove}
          onCancelMove={onCancelMove}
          onEdit={() => onEdit(selected.id)}
          onArchive={(comment) => onArchive(selected.id, comment)}
          onClose={() => onSelect(null)}
        />
      )}
    </aside>
  );
}

function SelectedCard({
  equipment: e,
  canEdit,
  hasDraft,
  savingMove,
  onNudge,
  onSaveMove,
  onCancelMove,
  onEdit,
  onArchive,
  onClose,
}: {
  equipment: EquipmentView;
  canEdit: boolean;
  hasDraft: boolean;
  savingMove: boolean;
  onNudge: (eastM: number, northM: number) => void;
  onSaveMove: () => void;
  onCancelMove: () => void;
  onEdit: () => void;
  onArchive: (comment: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const [archiving, setArchiving] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onPadKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const step = ev.shiftKey ? 5 : 0.5;
    const delta = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[ev.key];
    if (!delta) return;
    ev.preventDefault();
    onNudge(delta[0]!, delta[1]!);
  };
  const rows: [string, string | null][] = [
    ["Type", equipmentTypeLabel(e.type)],
    ["Catégorie", categoryOf(e.type)?.labelFr ?? "—"],
    ["Référence", e.reference],
    ["Niveau", e.level],
    ["Mise en service", e.installedAt ? new Date(`${e.installedAt}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : null],
    ["Position", e.lngLat ? `${e.lngLat[1].toFixed(6)}, ${e.lngLat[0].toFixed(6)}` : null],
    ["Sur le plan", e.planId && e.planX !== null ? `x ${Math.round(e.planX)} · y ${Math.round(e.planY ?? 0)} px` : "Non (position carte)"],
    ["Notes", e.notes],
  ];
  return (
    <section aria-labelledby={`${id}-title`} data-slot="equipment-card" className="border-t border-border bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <Pictogram type={e.type} className="size-8" />
        <h4 id={`${id}-title`} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {e.label ?? equipmentTypeLabel(e.type)}
        </h4>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {canEdit && (
        <>
          {e.lngLat && (
            <div className="mt-3">
              <div
                role="group"
                tabIndex={0}
                aria-label="Déplacer l'équipement : flèches 0,5 m, Maj + flèches 5 m"
                aria-describedby={`${id}-move-help`}
                onKeyDown={onPadKey}
                data-slot="move-pad"
                className="flex items-center gap-1 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring"
              >
                {(
                  [
                    [ArrowLeft, "vers l'ouest", -0.5, 0],
                    [ArrowUp, "vers le nord", 0, 0.5],
                    [ArrowDown, "vers le sud", 0, -0.5],
                    [ArrowRight, "vers l'est", 0.5, 0],
                  ] as const
                ).map(([Icon, label, dx, dy]) => (
                  <Button key={label} type="button" size="icon" variant="secondary" tabIndex={-1} aria-label={`Déplacer de 0,5 m ${label}`} onClick={() => onNudge(dx, dy)} className="size-8">
                    <Icon aria-hidden="true" />
                  </Button>
                ))}
                <span id={`${id}-move-help`} className="ml-2 text-xs text-text-muted">
                  Flèches ou glisser-déposer (Maj : 5 m)
                </span>
              </div>
              {hasDraft && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={onSaveMove} disabled={savingMove}>
                    Enregistrer la position
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onCancelMove} disabled={savingMove}>
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={onEdit}>
              <Pencil aria-hidden="true" />
              Modifier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setArchiving(true)}>
              <Archive aria-hidden="true" />
              Archiver
            </Button>
          </div>
          <Dialog open={archiving} onOpenChange={setArchiving}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Archiver « {e.label ?? equipmentTypeLabel(e.type)} » ?</DialogTitle>
                <DialogDescription>L&apos;équipement disparaît du plan et de la liste ; son historique reste dans le journal d&apos;audit.</DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor={`${id}-archive-comment`} className="mb-1 block text-xs font-medium text-text-muted">
                  Motif (facultatif)
                </label>
                <input id={`${id}-archive-comment`} value={comment} maxLength={500} onChange={(ev) => setComment(ev.target.value)} className={INPUT_CLASS} />
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setArchiving(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={async () => {
                    const message = await onArchive(comment);
                    if (message) setError(message);
                    else setArchiving(false);
                  }}
                >
                  Archiver
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
