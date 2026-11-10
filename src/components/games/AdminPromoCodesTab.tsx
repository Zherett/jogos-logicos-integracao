import { useState, useMemo } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Ticket,
  Coins,
  Zap,
  Package,
  Search,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generatePromoCodesBatch,
  loadLocalPromoCodes,
  deletePromoCode,
  syncPromoCodesToPlayFab,
  fetchPromoCodesFromPlayFab,
  PROMO_CODE_PATTERN_NAMES,
  type PromoCodePattern,
  type PromoCodeItem,
} from "@/lib/promo-codes";

export function AdminPromoCodesTab() {
  const [codes, setCodes] = useState<PromoCodeItem[]>(() => loadLocalPromoCodes());
  const [filterStatus, setFilterStatus] = useState<"ALL" | "active" | "claimed">("ALL");
  const [searchFilter, setSearchFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [copiedBatch, setCopiedBatch] = useState(false);

  // Form states for batch generation
  const [batchName, setBatchName] = useState("Gincana de Lógica 2026");
  const [pattern, setPattern] = useState<PromoCodePattern>("padrao_1");
  const [batchCount, setBatchCount] = useState<number>(10);
  const [rewardXp, setRewardXp] = useState<number>(50);
  const [rewardPoints, setRewardPoints] = useState<number>(25);
  const [chestName, setChestName] = useState<string>("");
  const [chestQuantity, setChestQuantity] = useState<number>(1);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  function flash(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  }

  function handleGenerate() {
    if (batchCount <= 0 || batchCount > 200) {
      flash("A quantidade deve estar entre 1 e 200 códigos por lote.");
      return;
    }

    const created = generatePromoCodesBatch({
      count: batchCount,
      pattern,
      batchName,
      rewards: {
        xp: rewardXp,
        points: rewardPoints,
        chestName: chestName.trim() || undefined,
        chestQuantity: chestName.trim() ? chestQuantity : undefined,
      },
      createdBy: "admin",
    });

    const updated = loadLocalPromoCodes();
    setCodes(updated);
    void syncPromoCodesToPlayFab();
    flash(`✅ Lote com ${created.length} códigos gerado com sucesso!`);
  }

  function handleDeleteCode(id: string) {
    const res = deletePromoCode(id);
    const updated = loadLocalPromoCodes();
    setCodes(updated);
    void syncPromoCodesToPlayFab();
    flash(
      res.mode === "hard_deleted"
        ? "🗑️ Código ativo excluído permanentemente."
        : "👁️ Código resgatado arquivado/ocultado do painel com sucesso.",
    );
  }

  async function handleRefreshCloud() {
    setSyncing(true);
    try {
      const refreshed = await fetchPromoCodesFromPlayFab();
      setCodes(refreshed);
      flash(`☁️ ${refreshed.length} códigos sincronizados com a nuvem PlayFab!`);
    } finally {
      setSyncing(false);
    }
  }

  // Filtra os códigos visíveis para o ADM (exclui soft-deleted hiddenForAdmin)
  const visibleCodes = useMemo(() => {
    return codes.filter((c) => {
      if (c.hiddenForAdmin) return false;
      if (filterStatus === "active" && c.status !== "active") return false;
      if (filterStatus === "claimed" && c.status !== "claimed") return false;
      if (searchFilter.trim()) {
        const s = searchFilter.toLowerCase().trim();
        const mCode = c.code.toLowerCase().includes(s);
        const mBatch = c.batchName.toLowerCase().includes(s);
        const mStudent = (c.claimedByFullName || c.claimedByNick || "").toLowerCase().includes(s);
        if (!mCode && !mBatch && !mStudent) return false;
      }
      return true;
    });
  }, [codes, filterStatus, searchFilter]);

  function handleCopyAllActive() {
    const actives = visibleCodes.filter((c) => c.status === "active").map((c) => c.code);
    if (actives.length === 0) {
      flash("Nenhum código ativo para copiar.");
      return;
    }
    const text = actives.join("\n");
    navigator.clipboard.writeText(text);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 3000);
    flash(`📋 ${actives.length} códigos copiados para a área de transferência!`);
  }

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="font-display text-lg font-black text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5 text-fuchsia-500" />
            Gerador & Gestão de Códigos Promocionais
            <span className="rounded-full bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400 px-2 py-0.5 text-[10px] font-black uppercase">
              Closed Beta
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crie lotes de códigos com máscaras criptográficas de alta entropia para cartões escolares e eventos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshCloud}
            disabled={syncing}
            className="rounded-xl text-xs font-bold gap-1.5 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Nuvem"}
          </Button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-bold text-foreground animate-fade-in">
          {feedbackMsg}
        </div>
      )}

      {/* BLOCO 1: CRIAÇÃO EM LOTE */}
      <div className="rounded-2xl border bg-card/60 p-4 space-y-4 shadow-xs">
        <h4 className="font-display text-sm font-black text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-500" />
          Gerar Novo Lote de Códigos
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground">Nome do Lote / Evento:</Label>
            <Input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Ex: Gincana de Lógica - 5º Ano"
              className="h-9 text-xs rounded-xl"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground">Padrão de Código (Máscara):</Label>
            <select
              value={pattern}
              onChange={(e) => setPattern(e.target.value as PromoCodePattern)}
              className="w-full h-9 text-xs font-bold rounded-xl border bg-background px-2.5 text-foreground"
            >
              {Object.entries(PROMO_CODE_PATTERN_NAMES).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.name} • Ex: {info.example}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground">Quantidade de Códigos:</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value))}
              className="h-9 text-xs rounded-xl font-bold"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground">Experiência (XP):</Label>
            <Input
              type="number"
              min={0}
              value={rewardXp}
              onChange={(e) => setRewardXp(Number(e.target.value))}
              className="h-9 text-xs rounded-xl font-bold"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground">Moedas (Pontos):</Label>
            <Input
              type="number"
              min={0}
              value={rewardPoints}
              onChange={(e) => setRewardPoints(Number(e.target.value))}
              className="h-9 text-xs rounded-xl font-bold"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground">Baú de Recompensa (Opcional):</Label>
            <Input
              value={chestName}
              onChange={(e) => setChestName(e.target.value)}
              placeholder="Ex: Baú de Lógica Quântica"
              className="h-9 text-xs rounded-xl"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleGenerate}
            className="rounded-xl h-10 px-5 text-xs font-display font-extrabold gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white shadow-md cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Gerar Lote de Códigos
          </Button>
        </div>
      </div>

      {/* BLOCO 2: LISTAGEM E RASTREAMENTO */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-background border p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterStatus("ALL")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                filterStatus === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({codes.filter((c) => !c.hiddenForAdmin).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("active")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                filterStatus === "active" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ativos ({codes.filter((c) => !c.hiddenForAdmin && c.status === "active").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("claimed")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                filterStatus === "claimed" ? "bg-purple-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Resgatados ({codes.filter((c) => !c.hiddenForAdmin && c.status === "claimed").length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Buscar código ou aluno..."
                className="h-8 pl-8 text-xs rounded-xl w-48"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyAllActive}
              className="rounded-xl text-xs font-bold gap-1.5 h-8"
              title="Copiar todos os códigos ativos visíveis"
            >
              {copiedBatch ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              Copiar Ativos
            </Button>
          </div>
        </div>

        {visibleCodes.length === 0 ? (
          <div className="rounded-2xl border bg-card/40 p-8 text-center text-xs text-muted-foreground">
            Nenhum código encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-bold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Código</th>
                  <th className="px-3 py-2.5">Lote / Evento</th>
                  <th className="px-3 py-2.5">Recompensa</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Resgatado Por</th>
                  <th className="px-3 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleCodes.slice(0, 100).map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-mono font-black text-foreground">{item.code}</td>
                    <td className="px-3 py-2.5 text-muted-foreground font-medium">{item.batchName}</td>
                    <td className="px-3 py-2.5 font-bold">
                      <span className="text-amber-500">+{item.rewards.xp} XP</span>
                      {item.rewards.points > 0 && <span className="text-yellow-500 ml-1.5">+{item.rewards.points} pts</span>}
                      {item.rewards.chestName && <span className="text-primary ml-1.5">• 🎁 {item.rewards.chestName}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.status === "active" ? (
                        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                          Ativo
                        </span>
                      ) : (
                        <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-black text-purple-600 dark:text-purple-400">
                          Resgatado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.claimedByNick ? (
                        <div>
                          <div className="font-bold text-foreground">
                            {item.claimedByFullName || item.claimedByNick} ({item.claimedByNick})
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {item.claimedBySchool} • {item.claimedAt ? new Date(item.claimedAt).toLocaleDateString("pt-BR") : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCode(item.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title={
                          item.status === "active"
                            ? "Excluir permanentemente (Hard Delete)"
                            : "Ocultar do painel (Soft Delete preservando integridade)"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
