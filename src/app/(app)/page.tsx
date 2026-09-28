import { MapStage } from "@/components/shell/MapStage";
import { Panel } from "@/components/panel/Panel";
import { StatusLegend } from "@/components/status/StatusLegend";

export default function MapPage() {
  return (
    <>
      <h1 className="sr-only">Carte des entrepôts</h1>
      <MapStage
        overlay={
          <Panel
            as="aside"
            title="Statut de conformité"
            className="absolute bottom-3 left-24 z-20 w-60"
          >
            <StatusLegend />
          </Panel>
        }
      />
    </>
  );
}
