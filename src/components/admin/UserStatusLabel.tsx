import { CircleCheck, CircleSlash, KeyRound } from "lucide-react";

/** Props of {@link UserStatusLabel}. */
export interface UserStatusLabelProps {
  isActive: boolean;
  mustChangePassword: boolean;
}

/** Account status: icon and label, neutral tokens (never green, amber or red). */
export function UserStatusLabel({ isActive, mustChangePassword }: UserStatusLabelProps) {
  return (
    <span className="flex flex-col gap-0.5" data-status={isActive ? "active" : "inactive"}>
      {isActive ? (
        <span className="inline-flex items-center gap-1.5 text-text-muted">
          <CircleCheck className="size-4" aria-hidden="true" />
          Actif
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-semibold text-text">
          <CircleSlash className="size-4" aria-hidden="true" />
          Désactivé
        </span>
      )}
      {mustChangePassword && (
        <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
          <KeyRound className="size-3.5" aria-hidden="true" />
          Mot de passe temporaire
        </span>
      )}
    </span>
  );
}
