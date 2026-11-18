import { abbreviateStudentName } from "@/lib/player-profile";

interface StudentNameDisplayProps {
  fullName?: string | null;
  canViewFull?: boolean;
  uppercase?: boolean;
  className?: string;
}

/**
 * Exibe o nome do aluno sempre abreviado (Primeiro Nome + Inicial.) conforme LGPD.
 */
export function StudentNameDisplay({
  fullName,
  uppercase = true,
  className = "",
}: StudentNameDisplayProps) {
  const abbreviated = abbreviateStudentName(fullName);
  if (!abbreviated) return null;

  const formatted = uppercase ? abbreviated.toUpperCase() : abbreviated;
  return <span className={className}>{formatted}</span>;
}
