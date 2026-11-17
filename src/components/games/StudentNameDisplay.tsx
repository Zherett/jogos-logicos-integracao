import { splitStudentNameForPrivacy } from "@/lib/player-profile";

interface StudentNameDisplayProps {
  fullName?: string | null;
  canViewFull?: boolean;
  uppercase?: boolean;
  className?: string;
}

/**
 * Exibe o nome oficial do aluno com proteção de privacidade:
 * - ADMs e o próprio dono veem o nome completo normalmente.
 * - Outros alunos/visitantes veem apenas o primeiro nome nítido,
 *   com o restante mascarado no DOM e visualmente embaçado.
 */
export function StudentNameDisplay({
  fullName,
  canViewFull = false,
  uppercase = true,
  className = "",
}: StudentNameDisplayProps) {
  const raw = String(fullName ?? "").trim();
  if (!raw) return null;

  const formatted = uppercase ? raw.toUpperCase() : raw;
  if (canViewFull) {
    return <span className={className}>{formatted}</span>;
  }

  const { firstName, maskedRest } = splitStudentNameForPrivacy(formatted);
  if (!firstName) return null;

  return (
    <span className={className}>
      <span>{firstName}</span>
      {maskedRest && (
        <>
          {" "}
          <span
            className="blur-[4px] select-none opacity-75 inline-block"
            aria-hidden="true"
          >
            {maskedRest}
          </span>
        </>
      )}
    </span>
  );
}
