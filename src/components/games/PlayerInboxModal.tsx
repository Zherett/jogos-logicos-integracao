import { useState, useMemo, useEffect } from "react";
import {
  Mail,
  Gift,
  CheckCircle2,
  Trash2,
  Sparkles,
  Clock,
  ArrowLeft,
  Check,
  AlertTriangle,
  HelpCircle,
  Eye,
  Award,
  Coins,
  ShieldAlert,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getInboxMessagesForPlayer,
  markInboxMessageAsRead,
  markAllInboxMessagesAsReadForRecipient,
  claimInboxReward,
  getMessageRewards,
  deleteInboxMessageForPlayer,
  formatInboxMessageText,
  type SystemInboxMessage,
  type InboxReward,
} from "@/lib/inbox-messages";
import { getAllAvailableMedals, RARITY_INFO } from "@/lib/medals-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  pushInboxReadToPlayFab,
  pushInboxClaimToPlayFab,
  savePlayerProfile,
  syncInboxReadsFromPlayFab,
} from "@/lib/playfab";
import { GAME_NAMES, type GameId } from "@/lib/game-storage";
import { findEventById, type SpecialEvent, type RecurringEvent } from "@/lib/custom-events";
import { MedalIcon } from "./MedalIcon";
import { EventDetailModal } from "./EventDetailModal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlayerInboxModal({ open, onOpenChange }: Props) {
  const auth = usePlayerAuth();
  const profile = auth.profile;

  const [messages, setMessages] = useState<SystemInboxMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "rewards">("all");

  // Estados da Revelação de Recompensa Secreta
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealProgress, setRevealProgress] = useState(0);
  const [revealedRewardModal, setRevealedRewardModal] = useState<InboxReward | null>(null);
  const [selectedEventModal, setSelectedEventModal] = useState<{
    event: (SpecialEvent | RecurringEvent) | null;
    fallbackTitle?: string;
  } | null>(null);

  // Mensagem selecionada ativa
  const activeMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    return messages.find((m) => m.id === selectedMessageId) || null;
  }, [selectedMessageId, messages]);

  const refreshMessages = () => {
    if (profile) {
      const list = getInboxMessagesForPlayer(profile);
      setMessages(list);
    } else {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedMessageId(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && profile) {
      refreshMessages();
      void syncInboxReadsFromPlayFab().then(() => refreshMessages());
      // Escuta novos eventos de correio em tempo real
      const handleNew = () => refreshMessages();
      window.addEventListener("desafios:inbox-message-received", handleNew);
      return () => {
        window.removeEventListener("desafios:inbox-message-received", handleNew);
      };
    }
  }, [open, profile]);

  // Filtro ativo
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (filterTab === "unread") return !m.read;
      if (filterTab === "rewards") return getMessageRewards(m).some((r) => !r.claimed);
      return true;
    });
  }, [messages, filterTab]);

  const unreadCount = messages.filter((m) => !m.read).length;
  const unclaimedRewardsCount = messages.filter((m) =>
    getMessageRewards(m).some((r) => !r.claimed)
  ).length;

  const handleSelectMessage = (msg: SystemInboxMessage) => {
    setSelectedMessageId(msg.id);
    if (profile) {
      markInboxMessageAsRead(msg.id, profile);
      pushInboxReadToPlayFab(msg.id, profile).catch(console.warn);
      refreshMessages();
    }
  };

  const handleMarkAllRead = () => {
    if (profile) {
      markAllInboxMessagesAsReadForRecipient(profile.id, profile);
      for (const m of messages) {
        pushInboxReadToPlayFab(m.id, profile).catch(console.warn);
      }
      refreshMessages();
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!profile) return;
    const res = deleteInboxMessageForPlayer(msgId, profile);
    if (res.success) {
      if (selectedMessageId === msgId) {
        setSelectedMessageId(null);
      }
      refreshMessages();
    } else {
      alert(res.error || "Não foi possível apagar a mensagem.");
    }
  };

  // Fluxo de Recompensa Secreta
  const handleStartSecretReveal = (reward: InboxReward) => {
    setIsRevealing(true);
    setRevealProgress(0);

    const interval = setInterval(() => {
      setRevealProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsRevealing(false);
            setRevealedRewardModal(reward);
          }, 300);
          return 100;
        }
        return prev + 10;
      });
    }, 120);
  };

  // Confirmar Resgate
  const handleClaimReward = async (msgId: string) => {
    if (!profile) return;
    const res = claimInboxReward(msgId, profile);
    if (res.success) {
      setRevealedRewardModal(null);
      markInboxMessageAsRead(msgId, profile);
      pushInboxReadToPlayFab(msgId, profile).catch(console.warn);
      pushInboxClaimToPlayFab(msgId, profile).catch(console.warn);
      await savePlayerProfile(res.profile);
      await auth.refresh();
      refreshMessages();
    } else {
      alert(res.error || "Erro ao resgatar recompensa.");
    }
  };

  const formatText = (
    text: string,
    msg?: SystemInboxMessage | null,
    includeEmoji = true
  ) => {
    return formatInboxMessageText(text, {
      playerNick: profile?.nick || profile?.id || "Jogador",
      mentionedGameId: msg?.mentionedGameId,
      mentionedGames: msg?.mentionedGames,
      mentionedEventTitle: msg?.mentionedEventTitle,
      mentionedEvents: msg?.mentionedEvents,
      includeEmoji,
    });
  };

  const handleOpenEventDetails = (eventId?: string, fallbackTitle?: string) => {
    if (eventId) {
      const found = findEventById(eventId);
      if (found) {
        setSelectedEventModal({ event: found.event, fallbackTitle: found.event.title });
        return;
      }
    }
    setSelectedEventModal({
      event: null,
      fallbackTitle: fallbackTitle || "Evento Especial",
    });
  };

  // Renderiza tags inline substituindo [nick]/[aluno], [game]/[gameX] (negrito) e [event]/[eventX] (clicável ou negrito)
  const renderInlineTags = (
    text: string,
    msg?: SystemInboxMessage | null
  ) => {
    const userNick = profile?.nick || profile?.id || "Jogador";

    // Divide pelas tags [nick], [aluno], [gameX], [eventX]
    const subParts = text.split(/(\[(?:nick|aluno|game\d*|event\d*)\])/gi);

    return subParts.map((sub, sIdx) => {
      const lower = sub.toLowerCase();
      if (lower === "[nick]" || lower === "[aluno]") {
        return (
          <strong
            key={sIdx}
            className="font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shadow-2xs inline-block"
          >
            {userNick}
          </strong>
        );
      }
      const gameMatch = /^\[(game\d*)\]$/i.exec(lower);
      if (gameMatch) {
        const tagKey = gameMatch[1];
        const gId =
          msg?.mentionedGames?.[tagKey] ||
          (tagKey === "game"
            ? msg?.mentionedGameId || Object.values(msg?.mentionedGames || {})[0]
            : msg?.mentionedGameId || Object.values(msg?.mentionedGames || {})[0]);
        const normalizedGId = gId ? (gId.toLowerCase().replace(/[_-]/g, "") as GameId) : undefined;
        const gameName = gId ? GAME_NAMES[gId as GameId] || (normalizedGId ? GAME_NAMES[normalizedGId] : undefined) || gId : "Jogo de Lógica";
        return (
          <strong
            key={sIdx}
            className="font-black text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg tracking-wide shadow-2xs inline-block mx-0.5 align-middle"
          >
            🎮 {gameName}
          </strong>
        );
      }
      const eventMatch = /^\[(event\d*)\]$/i.exec(lower);
      if (eventMatch) {
        const tagKey = eventMatch[1];
        const evData =
          msg?.mentionedEvents?.[tagKey] ||
          (tagKey === "event"
            ? (msg?.mentionedEventTitle
                ? {
                    eventId: msg?.mentionedEventId || "",
                    eventTitle: msg?.mentionedEventTitle,
                    linkEventDetails: msg?.linkEventDetails,
                  }
                : Object.values(msg?.mentionedEvents || {})[0])
            : (msg?.mentionedEventTitle
                ? {
                    eventId: msg?.mentionedEventId || "",
                    eventTitle: msg?.mentionedEventTitle,
                    linkEventDetails: msg?.linkEventDetails,
                  }
                : Object.values(msg?.mentionedEvents || {})[0]));
        const eventTitle = evData?.eventTitle || "Evento Especial";
        const canLink = evData?.linkEventDetails !== false && Boolean(evData?.eventId || evData?.eventTitle);

        if (canLink) {
          return (
            <button
              key={sIdx}
              type="button"
              onClick={() => handleOpenEventDetails(evData?.eventId, eventTitle)}
              className="inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs font-black text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-zinc-950 transition-all cursor-pointer shadow-2xs underline underline-offset-2 my-0.5 align-middle"
              title="Clique para ver os detalhes completos deste evento"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>{eventTitle}</span>
            </button>
          );
        }
        return (
          <strong key={sIdx} className="font-extrabold text-foreground px-1 py-0.5 bg-muted rounded">
            {eventTitle}
          </strong>
        );
      }
      return <span key={sIdx}>{sub}</span>;
    });
  };

  // Renderiza corpo da mensagem sem caixas/bordas azuis nos GIFs e sem legendas "GIF ANIMADO"
  const renderMessageBody = (
    body: string,
    gifLinks?: Record<string, string>,
    imageLinks?: Record<string, string>,
    msg?: SystemInboxMessage | null
  ) => {
    // Divide texto pelas tags [gif], [gif1], [gif2], [img], [img1], [img2], etc.
    const parts = body.split(/(\[(?:gif|img)\d*\])/gi);

    return (
      <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed space-y-3">
        {parts.map((part, index) => {
          const match = /^\[(gif|img)(\d*)\]$/i.exec(part.trim());
          if (match) {
            const prefix = match[1].toLowerCase();
            const tagNum = match[2];
            const tagKey = tagNum ? `${prefix}${tagNum}`.toLowerCase() : prefix;
            const url =
              prefix === "gif"
                ? gifLinks?.[tagKey] ||
                  (tagKey === "gif" ? gifLinks?.["gif1"] || Object.values(gifLinks || {})[0] : undefined)
                : imageLinks?.[tagKey] ||
                  (tagKey === "img" ? imageLinks?.["img1"] || Object.values(imageLinks || {})[0] : undefined);
            const isGif = prefix === "gif";

            if (url) {
              return (
                <div key={index} className="my-3 flex justify-center">
                  <img
                    src={url}
                    alt={isGif ? "GIF animado" : "Imagem"}
                    className="max-h-80 w-auto rounded-2xl object-contain shadow-lg"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              );
            }
            // Se a tag não tem link válido associado, oculta em vez de vazar a tag bruta no corpo
            return null;
          }
          return <span key={index}>{renderInlineTags(part, msg)}</span>;
        })}
      </div>
    );
  };

  const allCatalogMedals = getAllAvailableMedals();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] md:w-[90vw] max-w-4xl h-[88vh] max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-3xl border bg-background shadow-2xl">
          {/* Header da Caixa de Entrada */}
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/15 text-amber-500 border border-amber-500/30">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-xl font-black text-foreground flex items-center gap-2">
                  <span>Caixa de Entrada & Correio</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-black text-primary-foreground">
                      {unreadCount} nova{unreadCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {unclaimedRewardsCount > 0 && (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-black text-amber-600 dark:text-amber-400">
                      🎁 {unclaimedRewardsCount} presente{unclaimedRewardsCount === 1 ? "" : "s"}
                    </span>
                  )}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Comunicados oficiais da SEMED, avisos pedagógicos e recompensas exclusivas
                </p>
              </div>
            </div>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                className="hidden sm:flex text-xs rounded-xl"
              >
                <Check className="h-3.5 w-3.5 mr-1" /> Marcar lidas
              </Button>
            )}
          </DialogHeader>

          {/* Corpo: Lista de Mensagens ou Visualizador de Mensagem */}
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Barra lateral de filtros e lista (oculta no mobile quando lendo mensagem) */}
            <div
              className={`w-full md:w-88 border-r border-slate-200 dark:border-zinc-800 flex flex-col shrink-0 bg-slate-100/70 dark:bg-zinc-950/80 ${
                activeMessage ? "hidden md:flex" : "flex"
              }`}
            >
              {/* Filtros em Abas */}
              <div className="p-3 border-b border-slate-200 dark:border-zinc-800 grid grid-cols-3 gap-1.5 bg-slate-200/50 dark:bg-zinc-900/60">
                <button
                  type="button"
                  onClick={() => setFilterTab("all")}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterTab === "all"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-slate-600 dark:text-muted-foreground hover:bg-white/80 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-foreground"
                  }`}
                >
                  Todas ({messages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("unread")}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterTab === "unread"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-slate-600 dark:text-muted-foreground hover:bg-white/80 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-foreground"
                  }`}
                >
                  Novas ({unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("rewards")}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterTab === "rewards"
                      ? "bg-amber-500 text-zinc-950 font-black shadow-xs"
                      : "text-slate-600 dark:text-muted-foreground hover:bg-white/80 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-foreground"
                  }`}
                >
                  Presentes ({unclaimedRewardsCount})
                </button>
              </div>

              {/* Lista com Rolagem — visualmente destacada do fundo da caixa */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-100/90 dark:bg-zinc-950/60">
                {filteredMessages.length === 0 ? (
                  <div className="py-16 text-center space-y-2 px-4">
                    <Mail className="mx-auto h-10 w-10 text-slate-400 dark:text-muted-foreground/40" />
                    <p className="font-display text-sm font-bold text-slate-800 dark:text-foreground">
                      Nenhuma mensagem por aqui
                    </p>
                    <p className="text-xs text-slate-500 dark:text-muted-foreground">
                      Quando a coordenação enviar comunicados ou prêmios, eles aparecerão aqui.
                    </p>
                  </div>
                ) : (
                  filteredMessages.map((msg) => {
                    const isSelected = selectedMessageId === msg.id;
                    const isUnread = !msg.read;
                    const hasUnclaimedReward = getMessageRewards(msg).some((r) => !r.claimed);

                    return (
                      <div
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        className={`group relative rounded-2xl p-4 cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? "border-2 border-primary bg-sky-50 dark:bg-primary/20 shadow-md ring-2 ring-primary/30 -translate-y-0.5"
                            : isUnread
                              ? "border-2 border-sky-400 dark:border-sky-500 bg-white dark:bg-zinc-900 shadow-md shadow-sky-500/10 hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
                              : "border border-slate-200/90 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              {isUnread ? (
                                <span
                                  className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-black shadow-sm ring-2 ring-red-400/40 shrink-0"
                                  title="Nova mensagem não lida"
                                >
                                  1
                                </span>
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-zinc-600 shrink-0" />
                              )}
                              <h4
                                className={`truncate font-display ${
                                  isSelected
                                    ? "text-sm font-black text-primary"
                                    : isUnread
                                      ? "text-sm font-black text-slate-900 dark:text-zinc-50"
                                      : "text-xs font-bold text-slate-700 dark:text-zinc-300"
                                }`}
                              >
                                {formatText(msg.title, msg)}
                              </h4>
                            </div>
                            <p
                              className={`line-clamp-2 text-xs leading-relaxed ${
                                isUnread
                                  ? "text-slate-600 dark:text-zinc-300 font-medium"
                                  : "text-slate-500 dark:text-zinc-400"
                              }`}
                            >
                              {formatText(msg.body, msg, true)
                                .replace(/\[gif\d*\]/gi, " [GIF] ")
                                .replace(/\[img\d*\]/gi, " [IMAGEM] ")
                                .replace(/\s{2,}/g, " ")
                                .trim()}
                            </p>
                          </div>

                          {hasUnclaimedReward && (
                            <span
                              className="shrink-0 grid h-8 w-8 place-items-center rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/40 shadow-sm text-sm"
                              title="Contém presente para resgatar!"
                            >
                              🎁
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[11px] border-t border-slate-100 dark:border-zinc-800/80 pt-2">
                          <span
                            className={
                              isUnread
                                ? "font-bold text-sky-600 dark:text-sky-400"
                                : "font-medium text-slate-500 dark:text-zinc-400"
                            }
                          >
                            {msg.senderName}
                          </span>
                          <span className="font-mono text-slate-400 dark:text-zinc-500 text-[10.5px]">
                            {new Date(msg.createdAt).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Painel de Visualização da Mensagem Selecionada */}
            <div className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-background p-4 sm:p-6">
              {activeMessage ? (
                <div className="space-y-4 max-w-2xl mx-auto w-full">
                  {/* Botão de Voltar no Mobile */}
                  <div className="flex items-center justify-between md:hidden pb-2 border-b border-slate-200 dark:border-border">
                    <button
                      type="button"
                      onClick={() => setSelectedMessageId(null)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary"
                    >
                      <ArrowLeft className="h-4 w-4" /> Voltar para a lista
                    </button>
                  </div>

                  {/* Cabeçalho da Mensagem */}
                  <div className="rounded-3xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-secondary/30 p-4 sm:p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-xs font-extrabold text-primary">
                        {activeMessage.senderName}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-muted-foreground font-medium flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(activeMessage.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 dark:text-foreground">
                      {formatText(activeMessage.title, activeMessage)}
                    </h2>
                  </div>

                  {/* Corpo do Texto, GIFs e Imagens */}
                  <div className="rounded-3xl border border-slate-200 dark:border-border bg-white dark:bg-card p-5 sm:p-6 shadow-xs text-slate-800 dark:text-foreground">
                    {renderMessageBody(activeMessage.body, activeMessage.gifLinks, activeMessage.imageLinks, activeMessage)}
                  </div>

                  {/* Seção de Recompensa Anexa (se houver) */}
                  {(() => {
                    const activeRewards = getMessageRewards(activeMessage);
                    if (activeRewards.length === 0) return null;
                    const allClaimed = activeRewards.every((r) => r.claimed);
                    const hasSecret = activeRewards.some((r) => r.isSecret);
                    const firstClaimedAt = activeRewards.find((r) => r.claimedAt)?.claimedAt;
                    const firstSecret = activeRewards.find((r) => r.isSecret) ?? activeRewards[0];

                    return (
                    <div className="rounded-3xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-5 space-y-4 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/20 text-xl">
                            🎁
                          </span>
                          <div>
                            <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                              {allClaimed
                                ? activeRewards.length > 1
                                  ? "Recompensas Resgatadas"
                                  : "Recompensa Resgatada"
                                : hasSecret
                                  ? "Presente Misterioso do ADM"
                                  : activeRewards.length > 1
                                    ? `${activeRewards.length} Recompensas Especiais Anexas`
                                    : "Recompensa Especial Anexa"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {allClaimed
                                ? `Resgatada com sucesso!`
                                : hasSecret
                                  ? "Descubra qual surpresa foi enviada para você"
                                  : "Disponível para coletar na sua conta"}
                            </p>
                          </div>
                        </div>

                        {allClaimed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" /> Resgatado
                          </span>
                        )}
                      </div>

                      {/* Estado: Já Resgatada */}
                      {allClaimed ? (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>
                            Você já resgatou {activeRewards.length > 1 ? "estas recompensas" : "esta recompensa"} em{" "}
                            <b>
                              {firstClaimedAt
                                ? new Date(firstClaimedAt).toLocaleString("pt-BR")
                                : "data recente"}
                            </b>
                            .
                          </span>
                        </div>
                      ) : hasSecret ? (
                        /* Estado: Recompensa Secreta Pendente */
                        <div className="rounded-2xl border border-dashed border-amber-500/50 bg-background/80 p-5 text-center space-y-3">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-amber-500/20 text-3xl ring-2 ring-amber-500/30">
                            ❓
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-display text-base font-black text-foreground">
                              Recompensa Secreta Oculta
                            </h4>
                          </div>

                          {isRevealing ? (
                            <div className="space-y-2 max-w-sm mx-auto pt-2">
                              <div className="flex justify-between text-xs font-bold text-amber-500">
                                <span>Revelando segredo...</span>
                                <span>{revealProgress}%</span>
                              </div>
                              <div className="h-3 w-full rounded-full bg-muted overflow-hidden border">
                                <div
                                  className="h-full bg-amber-500 transition-all duration-150"
                                  style={{ width: `${revealProgress}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="lg"
                              onClick={() => handleStartSecretReveal(firstSecret)}
                              className="rounded-2xl font-display font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 shadow-lg"
                            >
                              <Sparkles className="h-4 w-4 mr-2" /> Revelar Recompensa
                            </Button>
                          )}
                        </div>
                      ) : (
                        /* Estado: Recompensas Normais Visíveis */
                        <div className="space-y-2.5">
                          {activeRewards.map((rew, idx) => (
                            <div key={rew.id || idx} className="rounded-2xl border bg-background/90 p-3.5 flex items-center gap-3">
                              {rew.type === "points" && (
                                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500/20 text-2xl font-black shrink-0">
                                  🪙
                                </div>
                              )}
                              {rew.type === "medal" && (
                                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/20 text-2xl shrink-0">
                                  🏅
                                </div>
                              )}
                              {rew.type === "future_item" && (
                                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-2xl shrink-0">
                                  📦
                                </div>
                              )}

                              <div>
                                <div className="font-display text-sm sm:text-base font-black text-foreground">
                                  {rew.type === "points" && (
                                    <span>+{rew.pointsAmount} Pontos Conquistados</span>
                                  )}
                                  {rew.type === "medal" && (() => {
                                    const itemData = rew.itemData as any;
                                    const tourMedal = itemData?.tournamentMedal;
                                    if (tourMedal?.label) {
                                      return <span>{tourMedal.label}</span>;
                                    }
                                    const def = allCatalogMedals.find(
                                      (m) => m.id === rew.medalId
                                    );
                                    return (
                                      <span>
                                        Medalha: {def ? def.title : rew.medalId}
                                      </span>
                                    );
                                  })()}
                                  {rew.type === "future_item" && (
                                    <span>Item Especial</span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {rew.type === "points"
                                    ? "Pontos serão somados à sua carteira e Hall da Fama"
                                    : (rew.itemData as any)?.tournamentMedal
                                      ? `+${(rew.itemData as any).tournamentMedal.bonusXpAwarded ?? 0} XP Extra e Medalha de Pódio Oficial`
                                      : "Adicionada à sua galeria de troféus e medalhas"}
                                </div>
                              </div>
                            </div>
                          ))}

                          <Button
                            size="lg"
                            onClick={() => handleClaimReward(activeMessage.id)}
                            className="w-full rounded-2xl font-display font-black bg-amber-500 text-zinc-950 hover:bg-amber-600 shadow-md"
                          >
                            <Gift className="h-4 w-4 mr-1.5" />{" "}
                            {activeRewards.length > 1 ? "Resgatar Recompensas" : "Resgatar Recompensa"}
                          </Button>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* Rodapé: Ação de Exclusão da Mensagem */}
                  <div className="pt-4 border-t flex items-center justify-between gap-2">
                    {getMessageRewards(activeMessage).some((r) => !r.claimed) ? (
                      <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Resgate sua recompensa antes de apagar esta mensagem</span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Mensagem lida e salva no seu histórico
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={getMessageRewards(activeMessage).some((r) => !r.claimed)}
                      onClick={() => handleDeleteMessage(activeMessage.id)}
                      className="text-destructive hover:bg-destructive/10 rounded-xl"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" /> Apagar Mensagem
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground space-y-2">
                  <Mail className="h-12 w-12 stroke-1 text-muted-foreground/40" />
                  <p className="font-display font-bold text-foreground">
                    Selecione uma mensagem na lista ao lado
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Abra para ler comunicados completos, visualizar mídias e resgatar presentes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Sobreposto de Comemoração ao Revelar Recompensa Secreta */}
      {revealedRewardModal && (
        <Dialog open={Boolean(revealedRewardModal)} onOpenChange={() => setRevealedRewardModal(null)}>
          <DialogContent className="max-w-md rounded-3xl border-2 border-amber-500/50 bg-card p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-500/20 text-4xl shadow-inner border-2 border-amber-500/40 animate-bounce">
              🎉
            </div>

            <div className="space-y-1">
              <DialogTitle className="font-display text-2xl font-black text-foreground">
                Recompensa Revelada!
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                O segredo foi desbloqueado com sucesso! Veja o que você ganhou:
              </p>
            </div>

            <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 p-4 space-y-1">
              {revealedRewardModal.type === "points" && (
                <>
                  <div className="font-display text-2xl font-black text-amber-600 dark:text-amber-400">
                    🪙 +{revealedRewardModal.pointsAmount} Pontos
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold">
                    Adicionados à sua carteira e ao Hall da Fama
                  </div>
                </>
              )}
              {revealedRewardModal.type === "medal" && (() => {
                const def = allCatalogMedals.find((m) => m.id === revealedRewardModal.medalId);
                const rarity = def ? RARITY_INFO[def.rarity] : RARITY_INFO.ouro;
                return (
                  <>
                    <div className="font-display text-xl font-black text-primary">
                      🏅 {def ? def.title : revealedRewardModal.medalId}
                    </div>
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">
                      Raridade: {rarity.label}
                    </div>
                    {def?.description && (
                      <p className="text-xs text-muted-foreground mt-1">{def.description}</p>
                    )}
                  </>
                );
              })()}
            </div>

            <Button
              size="lg"
              onClick={() => activeMessage && handleClaimReward(activeMessage.id)}
              className="w-full h-12 rounded-2xl font-display font-black text-base bg-amber-500 hover:bg-amber-600 text-zinc-950 shadow-lg"
            >
              <Check className="h-5 w-5 mr-2" /> Confirmar e Receber Recompensa
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Sobreposto com Detalhes Completos do Evento ao Clicar na Tag [event] */}
      <EventDetailModal
        open={Boolean(selectedEventModal)}
        onOpenChange={(open) => !open && setSelectedEventModal(null)}
        event={selectedEventModal?.event ?? null}
        fallbackTitle={selectedEventModal?.fallbackTitle}
      />
    </>
  );
}
