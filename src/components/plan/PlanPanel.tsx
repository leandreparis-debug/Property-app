"use client";

import { Box, Crosshair, Eye, EyeOff, Map as MapIcon, MapPinPlus, Ruler } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty/EmptyState";
import { INPUT_CLASS } from "@/components/editing/FieldInput";
import { useToast } from "@/components/editing/feedback";
import type { MapAssets } from "@/components/map/style/assets";
import { Button } from "@/components/ui/button";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_TYPES, equipmentTypeLabel, MAX_EQUIPMENT_DISTANCE_M, nextEquipmentLabel, withinSiteRadius } from "@/domain/equipment/catalog";
import { calibrationQuality, offsetLngLat, QUALITY_LABELS } from "@/domain/plan/calibration";
import { parseTab } from "@/domain/site-sheet/navigation";
import { archiveEquipmentAction, createEquipmentAction, moveEquipmentAction, setDockSideAction, updateEquipmentAction } from "@/server/plans/actions";
import type { SitePlanData } from "@/server/plans/data";
import { cn } from "@/lib/utils";
import { CalibrationWizard } from "./CalibrationWizard";
import { EquipmentForm, type EquipmentFormValues } from "./EquipmentForm";
import { EquipmentPanel } from "./EquipmentPanel";
import { PlanUploadDialog } from "./PlanUploadDialog";
import { SitePlanMapLoader } from "./SitePlanMapLoader";

/** Props of {@link PlanPanel}. */
export interface PlanPanelProps {
  data: SitePlanData;
  assets: MapAssets;
  /** `plan:calibrate` on a non-archived site. */
  canCalibrate: boolean;
  /** `equipment:write` on a non-archived site. */
  canEditEquipment: boolean;
  /** `site:write` on a non-archived site (dock side). */
  canWrite: boolean;
  exposeTestHook: boolean;
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
const fmt = (v: number, digits = 1) => v.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

/**
 * The « Plan » tab: site map (3D volume, calibrated plan overlay, equipment
 * pictograms) with the equipment panel on the right. Editors add a plan,
 * calibrate it, set the dock side and place, move, edit and archive
 * equipments; readers see everything without any editing action. The map is
 * mounted only while the tab is shown.
 */
export function PlanPanel({ data, assets, canCalibrate, canEditEquipment, canWrite, exposeTestHook }: PlanPanelProps) {
  const id = useId().replace(/:/g, "");
  const params = useSearchParams();
  const active = parseTab(params.get("tab")) === "plan";
  const router = useRouter();
  const toast = useToast();
  const { site, plan, volume, history } = data;

  const [showPlan, setShowPlan] = useState(true);
  const [opacity, setOpacity] = useState(plan?.opacity ?? 0.7);
  const [is3d, setIs3d] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [focusOn, setFocusOn] = useState<{ lngLat: [number, number]; key: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Position being moved; `saved` once stored, shown until the refreshed data arrives. */
  const [draft, setDraft] = useState<{ id: string; lngLat: [number, number]; saved?: boolean } | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [placingType, setPlacingType] = useState<string | null>(null);
  const [chooseType, setChooseType] = useState("");
  const [pendingCreate, setPendingCreate] = useState<{ type: string; lngLat: [number, number] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [dockSaving, setDockSaving] = useState(false);

  useEffect(() => setOpacity(plan?.opacity ?? 0.7), [plan?.id, plan?.opacity]);

  // Equipments with the unsaved position of the one being moved.
  const equipments = useMemo(() => data.equipments.map((e) => (draft && e.id === draft.id ? { ...e, lngLat: draft.lngLat } : e)), [data.equipments, draft]);
  const selected = equipments.find((e) => e.id === selectedId) ?? null;
  const calibrated = Boolean(plan?.corners && plan.imageUrl);
  const overlay = useMemo(
    () => (plan?.corners && plan.imageUrl ? { url: plan.imageUrl, corners: plan.corners, opacity, visible: showPlan } : null),
    [plan?.corners, plan?.imageUrl, opacity, showPlan],
  );

  const select = useCallback(
    (next: string | null) => {
      if (draft && !draft.saved && draft.id !== next && !window.confirm("La nouvelle position n'est pas enregistrée. L'abandonner ?")) return;
      if (draft && draft.id !== next) setDraft(null);
      setSelectedId(next);
      const target = next ? data.equipments.find((e) => e.id === next)?.lngLat : null;
      if (target) setFocusOn((f) => ({ lngLat: target, key: (f?.key ?? 0) + 1 }));
    },
    [draft, data.equipments],
  );

  // A saved position is replaced by the refreshed data.
  useEffect(() => setDraft((d) => (d?.saved ? null : d)), [data.equipments]);

  // Selection lost after a refresh (archived equipment). A just-created
  // equipment is kept selected until the refreshed data contains it.
  const justCreated = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    if (data.equipments.some((e) => e.id === selectedId)) {
      if (justCreated.current === selectedId) justCreated.current = null;
    } else if (justCreated.current !== selectedId) setSelectedId(null);
  }, [data.equipments, selectedId]);

  // Escape leaves the placing mode.
  useEffect(() => {
    if (!placingType) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlacingType(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placingType]);

  // ── Moves ──────────────────────────────────────────────────────────────
  const nudge = (eastM: number, northM: number) => {
    if (!selected?.lngLat) return;
    setDraft({ id: selected.id, lngLat: offsetLngLat(selected.lngLat, eastM, northM) });
  };
  const saveMove = async () => {
    if (!draft) return;
    setSavingMove(true);
    const result = await moveEquipmentAction({ equipmentId: draft.id, lngLat: draft.lngLat });
    setSavingMove(false);
    if (!result.ok) return toast("Position non enregistrée", result.message);
    toast("Position enregistrée");
    setDraft({ ...draft, saved: true });
    router.refresh();
  };

  // ── Creation ───────────────────────────────────────────────────────────
  const place = (lngLat: [number, number]) => {
    if (!placingType) return;
    if (site.center && !withinSiteRadius(lngLat, site.center)) return toast("Position refusée", `${MAX_EQUIPMENT_DISTANCE_M / 1000} km au maximum autour du site.`);
    setPendingCreate({ type: placingType, lngLat });
    setPlacingType(null);
  };
  const create = async (values: EquipmentFormValues): Promise<string | null> => {
    if (!pendingCreate) return null;
    const result = await createEquipmentAction({
      siteId: site.id,
      type: pendingCreate.type,
      lngLat: pendingCreate.lngLat,
      planId: calibrated && showPlan ? plan!.id : null,
      label: values.label,
      reference: values.reference,
      level: values.level,
      installedAt: values.installedAt || null,
      notes: values.notes,
      comment: values.comment,
    });
    if (!result.ok) return result.message;
    toast("Équipement ajouté", result.label);
    setPendingCreate(null);
    justCreated.current = result.id;
    setSelectedId(result.id);
    router.refresh();
    return null;
  };
  const editing = data.equipments.find((e) => e.id === editingId) ?? null;
  const update = async (values: EquipmentFormValues): Promise<string | null> => {
    if (!editing) return null;
    const result = await updateEquipmentAction({
      equipmentId: editing.id,
      type: values.type,
      label: values.label,
      reference: values.reference,
      level: values.level,
      installedAt: values.installedAt || null,
      notes: values.notes,
      comment: values.comment,
    });
    if (!result.ok) return result.message;
    toast("Équipement modifié", values.label);
    setEditingId(null);
    router.refresh();
    return null;
  };
  const archive = async (equipmentId: string, comment: string): Promise<string | null> => {
    const result = await archiveEquipmentAction({ equipmentId, comment });
    if (!result.ok) return result.message;
    toast("Équipement archivé");
    setSelectedId(null);
    setDraft(null);
    router.refresh();
    return null;
  };

  const setDockSide = async (side: "a" | "b") => {
    if (side === site.dockSide) return;
    setDockSaving(true);
    const result = await setDockSideAction({ siteId: site.id, dockSide: side });
    setDockSaving(false);
    if (!result.ok) return toast("Côté des quais non enregistré", result.message);
    toast("Côté des quais enregistré", `Côté ${side.toUpperCase()}`);
    router.refresh();
  };

  const quality = plan?.rmsErrorM !== null && plan?.rmsErrorM !== undefined ? calibrationQuality(plan.rmsErrorM) : null;
  return (
    <div data-slot="plan-panel" className="space-y-4">
      {/* Plan status and actions */}
      {plan ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm" data-slot="plan-status">
          <span className="font-medium">{plan.title ?? "Plan"}</span>
          {calibrated ? (
            <span className="text-text-muted">
              Calibré le {formatDate(plan.calibratedAt)}
              {plan.calibratedByName && ` par ${plan.calibratedByName}`}
              {quality && plan.rmsErrorM !== null && (
                <>
                  {" "}
                  — {QUALITY_LABELS[quality]}, erreur <span className="numeric">{fmt(plan.rmsErrorM, 2)}</span> m
                </>
              )}
            </span>
          ) : (
            <span className="font-medium">Plan non calibré : il n&apos;est pas encore superposé à la carte.</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2 print:hidden">
            {canCalibrate && plan.imageUrl && (
              <Button size="sm" variant={calibrated ? "secondary" : "default"} onClick={() => setWizardOpen(true)}>
                <Ruler aria-hidden="true" />
                {calibrated ? "Recalibrer" : "Calibrer le plan"}
              </Button>
            )}
            {canCalibrate && <PlanUploadDialog siteId={site.id} label="Remplacer le plan" variant="secondary" />}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-6">
          <EmptyState
            icon={MapIcon}
            headingLevel="h3"
            title="Aucun plan pour ce site"
            description={canCalibrate ? "Ajoutez une image du plan exportée d'AutoCAD, puis calibrez-la pour la superposer à la carte." : "Aucun plan n'a encore été ajouté. Le volume et les équipements restent consultables."}
          >
            {canCalibrate && <PlanUploadDialog siteId={site.id} />}
          </EmptyState>
        </div>
      )}

      {/* Map toolbar */}
      <div role="toolbar" aria-label="Affichage de la carte du site" className="flex flex-wrap items-center gap-2 print:hidden">
        {overlay && (
          <>
            <Button size="sm" variant="secondary" aria-pressed={!showPlan} onClick={() => setShowPlan((v) => !v)}>
              {showPlan ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              {showPlan ? "Masquer le plan" : "Afficher le plan"}
            </Button>
            <label className="flex items-center gap-2 text-sm text-text-muted">
              Opacité
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                disabled={!showPlan}
                onChange={(e) => setOpacity(Number(e.target.value))}
                aria-label="Opacité du plan"
                aria-valuetext={`${Math.round(opacity * 100)} %`}
                className="accent-[var(--color-accent)]"
              />
              <span className="numeric w-10 text-text">{Math.round(opacity * 100)} %</span>
            </label>
          </>
        )}
        <Button size="sm" variant="secondary" aria-pressed={is3d} onClick={() => setIs3d((v) => !v)}>
          <Box aria-hidden="true" />
          {is3d ? "Vue 2D" : "Vue 3D"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRecenter((n) => n + 1)}>
          <Crosshair aria-hidden="true" />
          Centrer sur le site
        </Button>
        {volume && (
          <fieldset className="flex items-center gap-1 text-sm" data-slot="dock-side">
            <legend className="sr-only">Côté des quais</legend>
            <span className="mr-1 text-text-muted">Côté des quais :</span>
            {(["a", "b"] as const).map((side) => (
              <label
                key={side}
                className={cn(
                  "cursor-pointer rounded-sm border px-2.5 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  site.dockSide === side ? "border-accent bg-accent/10 text-text" : "border-border text-text-muted",
                  (!canWrite || dockSaving) && "cursor-default",
                )}
              >
                <input type="radio" name={`${id}-dock`} value={side} checked={site.dockSide === side} disabled={!canWrite || dockSaving} onChange={() => void setDockSide(side)} className="sr-only" />
                {side.toUpperCase()}
              </label>
            ))}
          </fieldset>
        )}
        {canEditEquipment && (
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor={`${id}-new-type`} className="sr-only">
              Type de l&apos;équipement à ajouter
            </label>
            <select id={`${id}-new-type`} value={chooseType} onChange={(e) => setChooseType(e.target.value)} className={cn(INPUT_CLASS, "h-8 w-56 py-1")}>
              <option value="">Type d&apos;équipement…</option>
              {EQUIPMENT_CATEGORIES.map((c) => (
                <optgroup key={c.code} label={c.labelFr}>
                  {EQUIPMENT_TYPES.filter((t) => t.category === c.code).map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.labelFr}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button size="sm" disabled={!chooseType} onClick={() => setPlacingType(chooseType)}>
              <MapPinPlus aria-hidden="true" />
              Ajouter un équipement
            </Button>
          </div>
        )}
      </div>

      {volume?.approximate && <p className="text-xs text-text-muted">Volume approximatif (emprise non renseignée) : rectangle de la surface de référence, orienté est-ouest.</p>}

      <div className="grid overflow-hidden rounded-lg border border-border lg:h-[min(72vh,760px)] lg:grid-cols-[1fr_360px] print:hidden">
        <div className="relative h-[60vh] min-h-[420px] lg:h-auto">
          {active && (
            <SitePlanMapLoader
              assets={assets}
              center={site.center}
              volume={volume}
              overlay={overlay}
              equipments={equipments}
              selectedId={selectedId}
              onSelect={select}
              placing={placingType !== null}
              onMapClick={place}
              draggable={canEditEquipment}
              onDrag={(eid, lngLat) => eid === selectedId && setDraft({ id: eid, lngLat })}
              onNudge={nudge}
              is3d={is3d}
              recenter={recenter}
              focusOn={focusOn}
              ariaLabel={`Carte du site ${site.name} : volume, plan et équipements`}
              testHook={exposeTestHook ? "__vigiePlanMap" : undefined}
              className="absolute inset-0"
            />
          )}
          {placingType && (
            <div role="status" className="glass absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm shadow-panel" data-slot="placing-banner">
              <Crosshair className="size-4 text-accent" aria-hidden="true" />
              Cliquez sur {calibrated && showPlan ? "le plan" : "la carte"} pour placer : <strong className="font-medium">{equipmentTypeLabel(placingType)}</strong>
              {site.center && (
                <Button size="sm" variant="secondary" onClick={() => place(site.center!)}>
                  Placer au centre du site
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPlacingType(null)}>
                Annuler
              </Button>
            </div>
          )}
        </div>
        <EquipmentPanel
          equipments={equipments}
          selectedId={selectedId}
          onSelect={select}
          canEdit={canEditEquipment}
          hasDraft={Boolean(draft && !draft.saved && draft.id === selectedId)}
          savingMove={savingMove}
          onNudge={nudge}
          onSaveMove={() => void saveMove()}
          onCancelMove={() => setDraft(null)}
          onEdit={setEditingId}
          onArchive={archive}
        />
      </div>

      {history.length > 1 && (
        <details className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm" data-slot="plan-history">
          <summary className="cursor-pointer font-medium">Historique des plans ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-x-3">
                <span className={cn(p.isCurrent && "font-medium")}>{p.title ?? "Plan"}</span>
                <span className="text-text-muted">ajouté le {formatDate(p.createdAt)}</span>
                <span className="text-text-muted">{p.calibratedAt ? `calibré le ${formatDate(p.calibratedAt)}${p.rmsErrorM !== null ? ` (${fmt(p.rmsErrorM, 2)} m)` : ""}` : "non calibré"}</span>
                {p.isCurrent && <span className="text-text-muted">— plan courant</span>}
                {p.documentId && (
                  <a href={`/api/documents/${p.documentId}`} className="text-accent underline-offset-2 hover:underline">
                    Télécharger
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Print: the list of equipments */}
      <table className="hidden w-full text-sm print:table">
        <caption className="text-left font-semibold">Équipements ({data.equipments.length})</caption>
        <tbody>
          {data.equipments.map((e) => (
            <tr key={e.id}>
              <td>{e.label}</td>
              <td>{equipmentTypeLabel(e.type)}</td>
              <td>{e.reference}</td>
              <td>{e.level}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {plan && plan.imageUrl && canCalibrate && (
        <CalibrationWizard open={wizardOpen} onOpenChange={setWizardOpen} plan={plan} siteCenter={site.center} volume={volume} equipments={data.equipments} assets={assets} exposeTestHook={exposeTestHook} />
      )}
      <EquipmentForm
        open={pendingCreate !== null}
        mode="create"
        initial={{
          type: pendingCreate?.type ?? "",
          label: pendingCreate ? nextEquipmentLabel(pendingCreate.type, data.equipments.filter((e) => e.type === pendingCreate.type).map((e) => e.label)) : "",
          reference: "",
          level: "",
          installedAt: "",
          notes: "",
        }}
        detail={pendingCreate ? `Position : ${pendingCreate.lngLat[1].toFixed(6)}, ${pendingCreate.lngLat[0].toFixed(6)}${calibrated && showPlan ? " (sur le plan calibré)" : ""}` : undefined}
        onCancel={() => setPendingCreate(null)}
        onSubmit={create}
      />
      <EquipmentForm
        open={editing !== null}
        mode="edit"
        initial={{
          type: editing?.type ?? "",
          label: editing?.label ?? "",
          reference: editing?.reference ?? "",
          level: editing?.level ?? "",
          installedAt: editing?.installedAt ?? "",
          notes: editing?.notes ?? "",
        }}
        onCancel={() => setEditingId(null)}
        onSubmit={update}
      />
    </div>
  );
}
