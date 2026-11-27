import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  emptyStudentTrash,
  permanentlyDeleteStudent,
  restoreStudentFromTrash,
  syncStudentRosterFromPlayFab,
  type PlayerProfile,
} from "@/lib/playfab";

interface AdminTrashTabProps {
  trashPlayers: PlayerProfile[];
  onInspectStudent: (studentId: string) => void;
  onRefreshRoster: () => void;
  onFeedback: (msg: string) => void;
}

export function AdminTrashTab({
  trashPlayers,
  onInspectStudent,
  onRefreshRoster,
  onFeedback,
}: AdminTrashTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-display text-base font-extrabold text-destructive">
              <Trash2 className="h-5 w-5" /> Lixeira de Perfis de Alunos ({trashPlayers.length})
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              Os perfis nesta lixeira estão <b>invisíveis</b> em todos os rankings, recordes e modos
              de jogo. Eles serão <b>excluídos definitivamente de forma automática após 7 dias</b> da
              data de exclusão. Você pode recuperá-los ou excluí-los permanentemente a qualquer momento.
            </p>
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={trashPlayers.length === 0}
            onClick={async () => {
              if (
                confirm(
                  `Tem certeza de que deseja esvaziar a lixeira e apagar DEFINITIVAMENTE todos os ${trashPlayers.length} aluno(s)? Esta ação é irreversível!`,
                )
              ) {
                const res = await emptyStudentTrash();
                onFeedback(
                  `Lixeira esvaziada: ${res.count} perfil(is) excluído(s) permanentemente.`,
                );
                onRefreshRoster();
                void syncStudentRosterFromPlayFab().then(() => onRefreshRoster());
              }
            }}
            className="rounded-xl font-bold text-xs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Esvaziar Lixeira
          </Button>
        </div>
      </div>

      {trashPlayers.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center space-y-2">
          <Trash2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="font-bold text-sm text-foreground">A lixeira está vazia</p>
          <p className="text-xs text-muted-foreground">
            Nenhum perfil de aluno foi movido para a lixeira nos últimos 7 dias.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {trashPlayers.map((st) => {
            const msLeft = st.deleteScheduledPermanentAt
              ? new Date(st.deleteScheduledPermanentAt).getTime() - Date.now()
              : 0;
            const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            const delDateStr = st.deletedAt
              ? new Date(st.deletedAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Data desconhecida";

            return (
              <div
                key={st.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all hover:border-destructive/40"
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="min-w-0 cursor-pointer flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
                  onClick={() => onInspectStudent(st.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onInspectStudent(st.id);
                    }
                  }}
                  title="Clique para inspecionar os detalhes deste perfil"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-sm font-black text-foreground">
                      {st.nick}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      ({st.full_name})
                    </span>
                    <span className="rounded-full bg-destructive/15 border border-destructive/30 px-2 py-0.5 font-mono text-[10px] font-black text-destructive">
                      {daysLeft <= 0 ? "Expira hoje" : `Expira em ${daysLeft} dia(s)`}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>{st.school}</span>
                    {st.grade && <span>• {st.grade}</span>}
                    {st.turma && <span>Turma {st.turma}</span>}
                    <span>• Nv. {st.level} ({st.xp} XP)</span>
                    <span className="text-destructive font-medium">• Excluído em: {delDateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res = await restoreStudentFromTrash(st.id);
                      if (res.success) {
                        onFeedback(`Perfil de "${st.nick}" recuperado com sucesso!`);
                        onRefreshRoster();
                        void syncStudentRosterFromPlayFab().then(() => onRefreshRoster());
                      }
                    }}
                    className="rounded-xl border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 font-bold text-xs h-8"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Recuperar
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        confirm(
                          `Deseja apagar DEFINITIVAMENTE o perfil de "${st.nick}" agora? Esta ação não pode ser desfeita.`,
                        )
                      ) {
                        const res = await permanentlyDeleteStudent(st.id);
                        if (res.success) {
                          onFeedback(`Perfil de "${st.nick}" excluído permanentemente.`);
                          onRefreshRoster();
                          void syncStudentRosterFromPlayFab().then(() => onRefreshRoster());
                        }
                      }
                    }}
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-xl"
                    title="Excluir permanentemente agora"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
