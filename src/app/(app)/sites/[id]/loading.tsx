import { PageContainer } from "@/components/shell/PageContainer";

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none ${className}`} />;
}

/** Skeleton of the site sheet while the server reads the site. */
export default function Loading() {
  return (
    <PageContainer className="mx-auto max-w-[1440px] space-y-6">
      <div role="status" aria-live="polite" className="sr-only">
        Chargement de la fiche…
      </div>
      <div aria-hidden="true" className="space-y-6" data-slot="sheet-skeleton">
        <Block className="h-4 w-48" />
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex-1 space-y-4">
            <Block className="h-8 w-2/3" />
            <Block className="h-4 w-1/3" />
            <Block className="h-6 w-1/2" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Block key={i} className="h-10" />
              ))}
            </div>
          </div>
          <Block className="h-[220px] w-full sm:w-[360px]" />
        </div>
        <Block className="h-10 w-full" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Block key={i} className="h-24" />
          ))}
        </div>
        <Block className="h-40 w-full" />
      </div>
    </PageContainer>
  );
}
