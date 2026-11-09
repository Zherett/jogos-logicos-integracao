import { createFileRoute } from "@tanstack/react-router";
import { AdminPanelDialog } from "@/components/games/AdminPanelDialog";

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
    <AdminPanelDialog
      open={true}
      onOpenChange={() => {}}
      fullPageMode={true}
    />
  );
}
