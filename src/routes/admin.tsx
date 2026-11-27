import { lazy, Suspense, useEffect } from "react";
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
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Painel do Administrador — Desafios de Lógica SEMED";
    let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !robotsMeta;
    const prevContent = robotsMeta?.getAttribute("content") ?? null;
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.name = "robots";
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.content = "noindex, nofollow";

    return () => {
      document.title = prevTitle;
      if (created) {
        robotsMeta?.remove();
      } else if (robotsMeta) {
        if (prevContent !== null) robotsMeta.setAttribute("content", prevContent);
        else robotsMeta.removeAttribute("content");
      }
    };
  }, []);

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
