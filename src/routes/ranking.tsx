import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { RankingTabKind } from "@/components/games/RankingView";

const RankingView = lazy(() =>
  import("@/components/games/RankingView").then((m) => ({
    default: m.RankingView,
  })),
);

const VALID_TABS: ReadonlySet<RankingTabKind> = new Set([
  "medalhas",
  "pontos",
  "geral",
  "jogos",
  "escolas",
  "torneio",
]);

export const Route = createFileRoute("/ranking")({
  validateSearch: (search: Record<string, unknown>): { tab?: RankingTabKind } => {
    const raw = typeof search.tab === "string" ? search.tab : undefined;
    if (raw && VALID_TABS.has(raw as RankingTabKind)) {
      return { tab: raw as RankingTabKind };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Ranking — Desafios de Lógica SEMED" },
      {
        name: "description",
        content: "Classificação oficial dos alunos por medalhas, pontos, XP, jogos, escolas e torneio ranqueado.",
      },
    ],
  }),
  component: RankingRouteComponent,
});

function RankingRouteComponent() {
  const { tab } = Route.useSearch();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm font-semibold text-muted-foreground">
          Carregando Ranking...
        </div>
      }
    >
      <RankingView initialTab={tab ?? "medalhas"} />
    </Suspense>
  );
}
