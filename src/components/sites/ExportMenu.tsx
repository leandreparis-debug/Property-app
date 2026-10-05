"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { filterQuery } from "@/domain/filters/url";

/**
 * « Exporter » of the site list: XLSX or CSV of the list AS FILTERED (filters
 * of the URL). Shown with `export:read`; the server checks it again and
 * leaves out the financial columns without `finance:read`.
 */
export function ExportMenu() {
  const params = useSearchParams();
  const filters = filterQuery(params.toString());
  const href = (format: "xlsx" | "csv") => `/api/exports/sites?${[`format=${format}`, filters].filter(Boolean).join("&")}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" data-slot="export-menu">
          <Download aria-hidden="true" />
          Exporter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-text-muted">Liste affichée{filters ? " (filtres appliqués)" : ""}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={href("xlsx")} download data-format="xlsx">
            <FileSpreadsheet aria-hidden="true" />
            Classeur Excel (.xlsx)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("csv")} download data-format="csv">
            <FileText aria-hidden="true" />
            Fichier CSV (.csv)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
