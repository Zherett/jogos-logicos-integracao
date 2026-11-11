import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const AdminPanelDialog = lazy(() =>
  import("@/components/games/AdminPanelDialog").then((m) => ({
    default: m.AdminPanelDialog,
  })),
);

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel do Administrador — Desafios de Lógica SEMED" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRouteComponent,
});

function AdminRouteComponent() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm font-semibold text-muted-foreground">
          Carregando Painel do Administrador...
        </div>
      }
    >
      <AdminPanelDialog
        open={true}
        onOpenChange={() => {}}
        fullPageMode={true}
      />
    </Suspense>
  );
}
