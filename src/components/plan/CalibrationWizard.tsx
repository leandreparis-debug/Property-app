"use client";

import { Crosshair, Maximize, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { INPUT_CLASS } from "@/components/editing/FieldInput";
import { useToast } from "@/components/editing/feedback";
import type { MapAssets } from "@/components/map/style/assets";
import { distanceM } from "@/domain/equipment/catalog";
import type { FootprintRecord } from "@/domain/map-data";
import { imageCorners, MIN_CONTROL_POINTS, pixelToLngLat, QUALITY_LABELS, RECOMMENDED_CONTROL_POINTS, solveCalibration, type Calibration, type PlanControlPoint } from "@/domain/plan/calibration";
import { savePlanCalibrationAction } from "@/server/plans/actions";
import type { EquipmentView, PlanView } from "@/server/plans/data";
import { cn } from "@/lib/utils";
import { SitePlanMapLoader } from "./SitePlanMapLoader";

/** A row of the points table: raw text of the inputs (edited with the keyboard). */
interface Row {
  key: number;
  x: string;
  y: string;
  lat: string;
  lon: string;
}

const num = (s: string): number | null => {
  const v = Number(s.trim().replace(",", "."));
  return s.trim() !== "" && Number.isFinite(v) ? v : null;
};
const fmt = (v: number, digits: number) => String(Math.round(v * 10 ** digits) / 10 ** digits);

/** Complete point of a row, or null. */
function pointOf(row: Row): PlanControlPoint | null {
  const [x, y, lat, lon] = [num(row.x), num(row.y), num(row.lat), num(row.lon)];
  if (x === null || y === null || lat === null || lon === null || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { pixel: [x, y], lngLat: [lon, lat] };
}

const QUALITY_CLASS = { precise: "text-text", acceptable: "text-text", check: "text-text font-semibold" } as const;

/** Props of {@link CalibrationWizard}. */
export interface CalibrationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanView;
  siteCenter: [number, number] | null;
  volume: FootprintRecord | null;
  equipments: readonly EquipmentView[];
  assets: MapAssets;
  exposeTestHook: boolean;
}

/**
 * Full-screen calibration of a plan: the image on the left (zoom and pan), the
 * site map on the right (aerial imagery when installed, otherwise basemap or
 * fallback, footprint and volume). A click on the plan then on the map makes
 * a numbered pair; every value is editable in the table. From 3 points the
 * plan is previewed on the map and the RMS error is shown; points whose error
 * exceeds twice the mean are flagged. Saving is audited; a recalibration
 * announces how far the equipments placed on the plan will move.
 */
export function CalibrationWizard({ open, onOpenChange, plan, siteCenter, volume, equipments, assets, exposeTestHook }: CalibrationWizardProps) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const nextKey = useRef(1);
  const initialRows = useCallback(
    () =>
      plan.points.map((p) => ({ key: nextKey.current++, x: fmt(p.pixel[0], 1), y: fmt(p.pixel[1], 1), lat: fmt(p.lngLat[1], 7), lon: fmt(p.lngLat[0], 7) })),
    [plan.points],
  );
  const [rows, setRows] = useState<Row[]>(initialRows);
  /** Row waiting for its map position (after a click on the plan). */
  const [pending, setPending] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [opacity, setOpacity] = useState(plan.opacity);
  const [step, setStep] = useState<"edit" | "confirmQuality" | "confirmMove">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(initialRows());
      setPending(null);
      setStep("edit");
      setError(null);
      setComment("");
    }
  }, [open, initialRows]);

  // ── Solution ────────────────────────────────────────────────────────────
  const complete = useMemo(() => rows.map((r) => ({ key: r.key, point: pointOf(r) })).filter((r): r is { key: number; point: PlanControlPoint } => r.point !== null), [rows]);
  const solved = useMemo((): { calibration: Calibration } | { error: string } | null => {
    if (complete.length < MIN_CONTROL_POINTS) return null;
    try {
      return { calibration: solveCalibration(complete.map((c) => c.point)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Points invalides." };
    }
  }, [complete]);
  const calibration = solved && "calibration" in solved ? solved.calibration : null;
  const errorByKey = useMemo(() => new Map(calibration ? complete.map((c, i) => [c.key, { error: calibration.errorsM[i]!, suspect: calibration.suspect.includes(i) }]) : []), [calibration, complete]);

  // Equipments placed on this plan and their displacement with the new calibration.
  const impact = useMemo(() => {
    if (!calibration || !plan.matrix) return { moved: 0, meanShiftM: 0 };
    const onPlan = equipments.filter((e) => e.planId === plan.id && e.planX !== null && e.planY !== null && e.lngLat);
    const shifts = onPlan.map((e) => distanceM(e.lngLat!, pixelToLngLat(calibration.matrix, [e.planX!, e.planY!])));
    return { moved: onPlan.length, meanShiftM: shifts.length ? shifts.reduce((s, d) => s + d, 0) / shifts.length : 0 };
  }, [calibration, equipments, plan]);

  const overlay = useMemo(
    () => (calibration && plan.imageUrl && plan.width && plan.height ? { url: plan.imageUrl, corners: imageCorners(calibration.matrix, plan.width, plan.height), opacity, visible: true } : null),
    [calibration, plan, opacity],
  );
  const mapPoints = useMemo(
    () =>
      rows.flatMap((r, i) => {
        const lat = num(r.lat);
        const lon = num(r.lon);
        return lat !== null && lon !== null ? [{ n: i + 1, lngLat: [lon, lat] as [number, number], suspect: errorByKey.get(r.key)?.suspect }] : [];
      }),
    [rows, errorByKey],
  );

  // ── Editing ─────────────────────────────────────────────────────────────
  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (patch: Partial<Row> = {}) => {
    const key = nextKey.current++;
    setRows((all) => [...all, { key, x: "", y: "", lat: "", lon: "", ...patch }]);
    return key;
  };
  const onPlanPoint = (x: number, y: number) => {
    const waiting = rows.find((r) => r.key === pending && r.x === "" && r.y === "");
    if (waiting) {
      update(waiting.key, { x: fmt(x, 1), y: fmt(y, 1) });
      setPending(null);
    } else setPending(addRow({ x: fmt(x, 1), y: fmt(y, 1) }));
  };
  const onMapPoint = ([lon, lat]: [number, number]) => {
    const target = rows.find((r) => r.key === pending) ?? null;
    if (target) {
      update(target.key, { lat: fmt(lat, 7), lon: fmt(lon, 7) });
      setPending(null);
    } else setPending(addRow({ lat: fmt(lat, 7), lon: fmt(lon, 7) }));
  };

  // ── Saving ──────────────────────────────────────────────────────────────
  const save = async (confirmed: { quality?: boolean; move?: boolean } = {}) => {
    if (!calibration) return;
    if (calibration.quality === "check" && !confirmed.quality) return setStep("confirmQuality");
    if (impact.moved > 0 && !confirmed.move) return setStep("confirmMove");
    setSaving(true);
    setError(null);
    const result = await savePlanCalibrationAction({ planId: plan.id, points: complete.map((c) => c.point), opacity, confirmLowQuality: calibration.quality === "check", comment });
    setSaving(false);
    if (!result.ok) {
      setStep("edit");
      return setError(result.message);
    }
    toast("Calibration enregistrée", result.moved ? `${result.moved} équipement(s) repositionné(s).` : `Erreur moyenne ${fmt(result.rmsErrorM, 2)} m.`);
    onOpenChange(false);
    router.refresh();
  };

  const missing = Math.max(0, MIN_CONTROL_POINTS - complete.length);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        data-slot="calibration-wizard"
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
        onEscapeKeyDown={(e) => {
          if (pending !== null) {
            e.preventDefault();
            setPending(null);
          }
        }}
      >
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-5 py-3 pr-12">
          <DialogTitle className="text-base font-semibold">Calibrer le plan</DialogTitle>
          <DialogDescription className="text-sm text-text-muted">
            Cliquez un point du plan puis le même point sur la carte (angles du bâtiment, éloignés les uns des autres). {RECOMMENDED_CONTROL_POINTS} à 6 points recommandés ; toutes les valeurs sont modifiables dans le tableau.
          </DialogDescription>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
          <PlanImagePane plan={plan} rows={rows} errorByKey={errorByKey} onPoint={onPlanPoint} />
          <div className="relative min-h-0 border-t border-border lg:border-t-0 lg:border-l">
            <SitePlanMapLoader
              assets={assets}
              center={siteCenter}
              volume={volume}
              overlay={overlay}
              equipments={[]}
              controlPoints={mapPoints}
              onMapClick={onMapPoint}
              placing
              ariaLabel="Carte du site : cliquez le point correspondant"
              testHook={exposeTestHook ? "__vigieCalibrationMap" : undefined}
              className="absolute inset-0"
            />
            {pending !== null && (
              <p role="status" className="glass absolute top-3 left-3 z-10 flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm shadow-panel">
                <Crosshair className="size-4 text-accent" aria-hidden="true" />
                Point {rows.findIndex((r) => r.key === pending) + 1} : cliquez {rows.find((r) => r.key === pending)?.x ? "sur la carte" : "sur le plan"} (Échap pour annuler)
              </p>
            )}
          </div>
        </div>

        <section aria-label="Points de contrôle" className="max-h-[42dvh] overflow-y-auto border-t border-border bg-surface-1 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div role="status" aria-live="polite" data-slot="calibration-quality" className="min-w-64 text-sm">
              {calibration ? (
                <span className={QUALITY_CLASS[calibration.quality]}>
                  {calibration.quality === "check" && <TriangleAlert className="mr-1 inline size-4" aria-hidden="true" />}
                  {QUALITY_LABELS[calibration.quality]} — erreur moyenne <span className="numeric" data-slot="rms">{fmt(calibration.rmsErrorM, 2)}</span> m
                  {calibration.suspect.length > 0 && <span className="text-text-muted"> · point(s) à vérifier : {calibration.suspect.map((i) => rows.findIndex((r) => r.key === complete[i]!.key) + 1).join(", ")}</span>}
                </span>
              ) : solved && "error" in solved ? (
                <span className="font-medium">{solved.error}</span>
              ) : (
                <span className="text-text-muted">Encore {missing} point{missing > 1 ? "s" : ""} pour calculer la calibration.</span>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-text-muted">
              Opacité de l&apos;aperçu
              <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="accent-[var(--color-accent)]" />
              <span className="numeric w-10 text-text">{Math.round(opacity * 100)} %</span>
            </label>
            <Button size="sm" variant="secondary" onClick={() => setPending(addRow())} className="ml-auto">
              <Plus aria-hidden="true" />
              Ajouter un point
            </Button>
          </div>

          <table className="mt-3 w-full text-sm" data-slot="control-points">
            <caption className="sr-only">Points de contrôle : pixel du plan, position sur la carte, erreur</caption>
            <thead className="text-xs text-text-muted">
              <tr>
                <th scope="col" className="py-1 pr-2 text-left font-medium">N°</th>
                <th scope="col" className="px-1 text-left font-medium">x plan (px)</th>
                <th scope="col" className="px-1 text-left font-medium">y plan (px)</th>
                <th scope="col" className="px-1 text-left font-medium">Latitude</th>
                <th scope="col" className="px-1 text-left font-medium">Longitude</th>
                <th scope="col" className="px-1 text-right font-medium">Erreur (m)</th>
                <th scope="col" className="pl-2 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const e = errorByKey.get(r.key);
                const cell = (field: keyof Omit<Row, "key">, label: string) => (
                  <td className="px-1 py-1">
                    <input
                      aria-label={`${label} du point ${i + 1}`}
                      inputMode="decimal"
                      value={r[field]}
                      onChange={(ev) => update(r.key, { [field]: ev.target.value })}
                      aria-invalid={r[field] !== "" && num(r[field]) === null ? true : undefined}
                      className={cn(INPUT_CLASS, "numeric h-8 py-1")}
                    />
                  </td>
                );
                return (
                  <tr key={r.key} data-slot="control-point-row" className={cn(pending === r.key && "bg-surface-2")}>
                    <th scope="row" className="pr-2 text-left font-mono font-medium">{i + 1}</th>
                    {cell("x", "x plan")}
                    {cell("y", "y plan")}
                    {cell("lat", "Latitude")}
                    {cell("lon", "Longitude")}
                    <td className="numeric px-1 text-right">
                      {e ? (
                        <span className={cn(e.suspect && "font-semibold")}>
                          {fmt(e.error, 2)}
                          {e.suspect && <span className="ml-1 text-xs font-normal text-text-muted">à vérifier</span>}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="pl-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Supprimer le point ${i + 1}`}
                        onClick={() => {
                          setRows((all) => all.filter((x) => x.key !== r.key));
                          if (pending === r.key) setPending(null);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                        <span className="hidden sm:inline">Supprimer</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-text-muted">
                    Aucun point. Cliquez sur le plan, ou « Ajouter un point » pour une saisie numérique.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label htmlFor={`${id}-comment`} className="mb-1 block text-xs font-medium text-text-muted">
                Motif (facultatif)
              </label>
              <input id={`${id}-comment`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
            </div>
            {step === "edit" && (
              <Button onClick={() => void save()} disabled={!calibration || saving}>
                Enregistrer la calibration
              </Button>
            )}
          </div>

          {step === "confirmQuality" && calibration && (
            <div role="alertdialog" aria-labelledby={`${id}-q`} className="mt-3 rounded-md border border-border-strong bg-surface-2 p-3 text-sm">
              <p id={`${id}-q`} className="font-medium">
                <TriangleAlert className="mr-1 inline size-4" aria-hidden="true" />
                Vérifiez les points : erreur moyenne de {fmt(calibration.rmsErrorM, 1)} m (plus de 3 m).
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void save({ quality: true })} disabled={saving}>
                  Enregistrer malgré tout
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStep("edit")}>
                  Revoir les points
                </Button>
              </div>
            </div>
          )}
          {step === "confirmMove" && (
            <div role="alertdialog" aria-labelledby={`${id}-m`} className="mt-3 rounded-md border border-border-strong bg-surface-2 p-3 text-sm">
              <p id={`${id}-m`} className="font-medium">
                {impact.moved} équipement{impact.moved > 1 ? "s" : ""} placé{impact.moved > 1 ? "s" : ""} sur ce plan {impact.moved > 1 ? "seront déplacés" : "sera déplacé"} de {fmt(impact.meanShiftM, 1)} m en moyenne.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void save({ quality: true, move: true })} disabled={saving}>
                  Confirmer la recalibration
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStep("edit")}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium">
              {error}
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The plan image with zoom (wheel, buttons, + / −) and pan (drag, arrows).
 * A click (without drag) adds a point at that pixel.
 */
function PlanImagePane({ plan, rows, errorByKey, onPoint }: { plan: PlanView; rows: Row[]; errorByKey: Map<number, { suspect: boolean }>; onPoint: (x: number, y: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 0.1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const width = plan.width ?? 1000;
  const height = plan.height ?? 1000;

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const scale = Math.min(el.clientWidth / width, el.clientHeight / height) * 0.95;
    setView({ scale, tx: (el.clientWidth - width * scale) / 2, ty: (el.clientHeight - height * scale) / 2 });
  }, [width, height]);
  useEffect(() => {
    fit();
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const scale = Math.min(8, Math.max(0.01, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  const center = () => ({ x: (box.current?.clientWidth ?? 0) / 2, y: (box.current?.clientHeight ?? 0) / 2 });

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - view.tx) / view.scale;
    const y = (e.clientY - rect.top - view.ty) / view.scale;
    if (x >= 0 && y >= 0 && x <= width && y <= height) onPoint(x, y);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const c = center();
    const pan = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (pan) setView((v) => ({ ...v, tx: v.tx + pan[0]!, ty: v.ty + pan[1]! }));
    else if (e.key === "+" || e.key === "=") zoomAt(1.25, c.x, c.y);
    else if (e.key === "-") zoomAt(0.8, c.x, c.y);
    else if (e.key === "0") fit();
    else return;
    e.preventDefault();
  };

  return (
    <div className="relative min-h-0 overflow-hidden bg-surface-2">
      <div
        ref={box}
        role="application"
        aria-label="Image du plan : cliquez un point ; flèches pour déplacer, + et − pour zoomer, 0 pour ajuster"
        tabIndex={0}
        data-slot="plan-image-pane"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        className="absolute inset-0 cursor-crosshair outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {plan.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image, no optimization wanted
          <img
            src={plan.imageUrl}
            alt="Plan à calibrer"
            draggable={false}
            className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
            style={{ width: width * view.scale, height: height * view.scale, transform: `translate(${view.tx}px, ${view.ty}px)` }}
          />
        )}
        {rows.map((r, i) => {
          const x = num(r.x);
          const y = num(r.y);
          if (x === null || y === null) return null;
          return (
            <span
              key={r.key}
              aria-hidden="true"
              data-slot="plan-control-point"
              className={cn(
                "pointer-events-none absolute grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-surface-2 font-mono text-[11px] font-semibold text-text",
                errorByKey.get(r.key)?.suspect ? "border-dashed border-text-muted" : "border-accent",
              )}
              style={{ left: view.tx + x * view.scale, top: view.ty + y * view.scale }}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <div className="absolute right-3 bottom-3 flex gap-1">
        <Button size="icon" variant="secondary" aria-label="Zoomer" onClick={() => zoomAt(1.25, center().x, center().y)}>
          <Plus aria-hidden="true" />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Dézoomer" onClick={() => zoomAt(0.8, center().x, center().y)}>
          <Minus aria-hidden="true" />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Ajuster le plan à la zone" onClick={fit}>
          <Maximize aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
