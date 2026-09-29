import type { Metadata } from "next";
import { PageContainer } from "@/components/shell/PageContainer";
import { SitesTable } from "@/components/sites/SitesTable";

export const metadata: Metadata = { title: "Sites" };

/** Dense list of the sites (shared filters, sort in the URL). */
export default function SitesPage() {
  return (
    <PageContainer className="pt-[7.5rem] pb-3">
      <h1 className="sr-only">Sites</h1>
      <SitesTable />
    </PageContainer>
  );
}
