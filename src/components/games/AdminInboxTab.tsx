import { useState, useMemo, useEffect, useRef } from "react";
import {
  Mail,
  Send,
  Gift,
  Plus,
  Trash2,
  Search,
  Users,
  School,
  GraduationCap,
  CheckSquare,
  Square,
  Sparkles,
  Clock,
  Lock,
  Eye,
  Award,
  Coins,
  Package,
  Copy,
  Check,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Image as ImageIcon,
  Gamepad2,
  Calendar,
  CalendarClock,
  Play,
  Pause,
  Pencil,
  Zap,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  sendAdminBroadcastMessage,
  loadAllInboxMessages,
  getMessageReaders,
  runRetroactiveInboxReadsScan,
  subscribeToInboxSync,
  extractInboxTags,
  validateMessageTags,
  cancelInboxMessage,
  loadCanceledMessageIds,
  type SystemInboxMessage,
  type AdminBroadcastDraft,
} from "@/lib/inbox-messages";
import {
  loadScheduledInboxRules,
  upsertScheduledInboxRule,
  deleteScheduledInboxRule,
  toggleScheduledInboxRuleActive,
  evaluateAndTriggerScheduledMessages,
  computeNextRunDate,
  formatRecurrenceLabel,
  DAY_NAMES_SHORT,
  type ScheduledInboxRule,
  type ScheduleRecurrenceType,
} from "@/lib/scheduled-inbox";
import { getAllAvailableMedals, RARITY_INFO } from "@/lib/medals-catalog";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import { loadSpecialEvents, loadRecurringEvents } from "@/lib/custom-events";
import {
  SCHOOLS,
  AGE_STAGES,
  stageFromBirthdate,
  levelProgress,
} from "@/lib/player-profile";
import {
  getAllRegisteredPlayers,
  syncInboxReadsFromPlayFab,
  type PlayerProfile,
} from "@/lib/playfab";
import { usePlayerAuth } from "@/lib/player-auth";
import { MedalIcon } from "./MedalIcon";

interface Props {
  registeredStudents?: PlayerProfile[];
  onBroadcastSent?: (msg: string) => void;
}

export function AdminInboxTab({ registeredStudents = [], onBroadcastSent }: Props) {
  const auth = usePlayerAuth();

  // Chave estável de dependência para evitar recriação desnecessária da lista em cada render
  const registeredStudentsKey = useMemo(() => {
    return Array.isArray(registeredStudents)
      ? registeredStudents.map((s) => s.id).join(",")
      : "";
  }, [registeredStudents]);

  // Lista de alunos garantida (usa prop ou fallback direto para a base local)
  const studentsList = useMemo(() => {
    if (Array.isArray(registeredStudents) && registeredStudents.length > 0) {
      return registeredStudents;
    }
    return getAllRegisteredPlayers();
  }, [registeredStudents, registeredStudentsKey]);

  const studentsListRef = useRef(studentsList);
  useEffect(() => {
    studentsListRef.current = studentsList;
  }, [studentsList]);

  // Modo de destinatários
  const [recipientMode, setRecipientMode] = useState<"all" | "school" | "stage" | "students">("all");
  const [selectedSchool, setSelectedSchool] = useState<string>("TODAS");
  const [selectedStage, setSelectedStage] = useState<string>("TODAS");
  const [studentSearch, setStudentSearch] = useState("");

  // Conjunto de IDs de alunos explicitamente selecionados
  // REGRA DO USUÁRIO: Por padrão, os alunos começam DESMARCADOS
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Dados da mensagem
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Refs para os textareas permitindo inserção cirúrgica de tags no ponto exato do cursor
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const schedBodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Função utilitária para inserir tags exatamente na posição atual do cursor no textarea
  const insertTagIntoTextarea = (
    textarea: HTMLTextAreaElement | null,
    currentValue: string,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    tag: string,
  ) => {
    if (!textarea) {
      setValue((prev) => (prev ? `${prev} ${tag} ` : `${tag} `));
      return;
    }

    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;

    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);

    // Formata o espaçamento ao redor da tag para não grudar em palavras adjacentes
    const needsSpaceBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const needsSpaceAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

    const formattedTag = `${needsSpaceBefore ? " " : ""}${tag}${needsSpaceAfter ? " " : ""}`;
    const nextValue = `${before}${formattedTag}${after}`;

    setValue(nextValue);

    // Restaura o foco no textarea e posiciona o cursor logo após a tag inserida
    requestAnimationFrame(() => {
      textarea.focus();
      const newCursor = start + formattedTag.length;
      textarea.setSelectionRange(newCursor, newCursor);
    });
  };

  // Tags de Mídia unificadas (GIFs e Imagens Estáticas): [{ id: "...", type: "img" | "gif", url: "" }]
  const [mediaList, setMediaList] = useState<{ id: string; type: "gif" | "img"; url: string }[]>([]);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  // Menção a Jogo na Tag [game] e tags dinâmicas [game1], [game2]
  const [selectedMentionGame, setSelectedMentionGame] = useState<string>("");
  const [mentionedGames, setMentionedGames] = useState<Record<string, string>>({});

  // Menção a Evento na Tag [event] e tags dinâmicas [event1], [event2]
  const [selectedMentionEventId, setSelectedMentionEventId] = useState<string>("");
  const [linkEventDetails, setLinkEventDetails] = useState<boolean>(true);
  const [mentionedEvents, setMentionedEvents] = useState<
    Record<string, { eventId: string; linkEventDetails: boolean }>
  >({});

  // Tags dinamicamente detectadas no texto da mensagem imediata
  const detectedTags = useMemo(() => extractInboxTags(body), [body]);

  // Lista de todos os eventos configurados (pontuais e recorrentes) para menção na tag [event]
  const allConfiguredEvents = useMemo(() => {
    try {
      const s = loadSpecialEvents();
      const r = loadRecurringEvents();
      return [
        ...s.map((e) => ({ id: e.id, title: e.title, type: "Pontual" as const })),
        ...r.map((e) => ({ id: e.id, title: e.title, type: "Recorrente" as const })),
      ];
    } catch {
      return [];
    }
  }, []);

  // Configurações de Recompensa
  const [hasReward, setHasReward] = useState(false);
  const [rewardType, setRewardType] = useState<"points" | "medal" | "future_item">("points");
  const [rewardPoints, setRewardPoints] = useState<number>(100);
  const [selectedMedalId, setSelectedMedalId] = useState<string>("");
  const [isSecretReward, setIsSecretReward] = useState<boolean>(false);

  // ABA DO COMPOSITOR: Envio Imediato ("immediate") ou Mensagens Programadas ("scheduled")
  const [inboxTab, setInboxTab] = useState<"immediate" | "scheduled">("immediate");

  // Regras de Mensagens Programadas e Recorrentes
  const [scheduledRules, setScheduledRules] = useState<ScheduledInboxRule[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Estados do formulário da Mensagem Programada
  const [schedTitle, setSchedTitle] = useState("");
  const [schedBody, setSchedBody] = useState("");
  const [schedRecurrence, setSchedRecurrence] = useState<ScheduleRecurrenceType>("weekly");
  const [schedDaysOfWeek, setSchedDaysOfWeek] = useState<number[]>([6]); // Sábado por padrão
  const [schedDayOfMonth, setSchedDayOfMonth] = useState<number>(1);
  const [schedSpecificDate, setSchedSpecificDate] = useState<string>("");
  const [schedTimeOfDay, setSchedTimeOfDay] = useState<string>("08:00");
  const [schedValidFrom, setSchedValidFrom] = useState<string>("");
  const [schedValidUntil, setSchedValidUntil] = useState<string>("");
  const [schedMediaList, setSchedMediaList] = useState<{ id: string; type: "gif" | "img"; url: string }[]>([]);
  const [schedMentionGame, setSchedMentionGame] = useState<string>("");
  const [schedMentionGames, setSchedMentionGames] = useState<Record<string, string>>({});
  const [schedMentionEventId, setSchedMentionEventId] = useState<string>("");
  const [schedLinkEventDetails, setSchedLinkEventDetails] = useState<boolean>(true);
  const [schedMentionEvents, setSchedMentionEvents] = useState<
    Record<string, { eventId: string; linkEventDetails: boolean }>
  >({});

  // Tags dinamicamente detectadas no texto da mensagem programada
  const schedDetectedTags = useMemo(() => extractInboxTags(schedBody), [schedBody]);
  const [schedHasReward, setSchedHasReward] = useState<boolean>(false);
  const [schedRewardType, setSchedRewardType] = useState<"points" | "medal" | "future_item">("points");
  const [schedRewardPoints, setSchedRewardPoints] = useState<number>(100);
  const [schedSelectedMedalId, setSchedSelectedMedalId] = useState<string>("");
  const [schedIsSecretReward, setSchedIsSecretReward] = useState<boolean>(false);

  // Histórico de mensagens enviadas e visualizador de leituras
  const [sentHistory, setSentHistory] = useState<SystemInboxMessage[]>([]);
  // Ordem de exibição do histórico: "desc" (mais recentes no topo - padrão) ou "asc" (mais antigas no topo)
  const [historySortOrder, setHistorySortOrder] = useState<"desc" | "asc">("desc");
  const [readersModalMsg, setReadersModalMsg] = useState<SystemInboxMessage | null>(null);
  const [readersTab, setReadersTab] = useState<"read" | "unread">("read");

  // Estado para confirmação de cancelamento de envio
  const [cancelingMsg, setCancelingMsg] = useState<SystemInboxMessage | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  // Histórico ordenado conforme a preferência selecionada
  const sortedSentHistory = useMemo(() => {
    return [...sentHistory].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return historySortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });
  }, [sentHistory, historySortOrder]);

  // Carrega lista de medalhas disponíveis de forma segura
  const availableMedals = useMemo(() => {
    try {
      return getAllAvailableMedals() || [];
    } catch {
      return [];
    }
  }, []);

  // Define medalha padrão caso vazio
  useEffect(() => {
    if (!selectedMedalId && availableMedals.length > 0) {
      setSelectedMedalId(availableMedals[0].id);
    }
  }, [availableMedals, selectedMedalId]);

  const [readersRefreshCount, setReadersRefreshCount] = useState(0);
  const [isSyncingReaders, setIsSyncingReaders] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const isAnySyncing = isSyncingReaders || isBackgroundSyncing;

  // Carrega histórico de mensagens enviadas
  const refreshHistory = () => {
    try {
      const all = loadAllInboxMessages();
      const admMsgs = all.filter((m) => m && m.sender === "adm");
      setSentHistory(admMsgs.slice().reverse());
      // Dispara sincronização em segundo plano das leituras na nuvem
      syncInboxReadsFromPlayFab()
        .then(() => setReadersRefreshCount((c) => c + 1))
        .catch(console.warn);
    } catch (err) {
      console.error("Erro ao carregar histórico de mensagens:", err);
      setSentHistory([]);
    }
  };

  useEffect(() => {
    refreshHistory();
  }, []);

  // Escuta instantânea via BroadcastChannel / localStorage sync:
  // Notificação imediata (0ms) no painel ADM quando um aluno lê mensagem ou resgata recompensa
  useEffect(() => {
    const unsubscribe = subscribeToInboxSync((payload) => {
      if (payload.type === "message_read" || payload.type === "rewards_claimed") {
        runRetroactiveInboxReadsScan(studentsListRef.current);
        setReadersRefreshCount((c) => c + 1);
        void syncInboxReadsFromPlayFab()
          .then(() => {
            runRetroactiveInboxReadsScan(studentsListRef.current);
            setReadersRefreshCount((c) => c + 1);
          })
          .catch(console.warn);
      } else if (payload.type === "new_message" || payload.type === "message_canceled") {
        refreshHistory();
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Cancela o envio da mensagem selecionada no histórico ADM e remove da caixa de entrada de todos os alunos
  const handleConfirmCancelMessage = async () => {
    if (!cancelingMsg) return;
    setIsCanceling(true);
    try {
      const res = cancelInboxMessage(cancelingMsg.id);
      if (res.success) {
        // Sincroniza imediatamente com PlayFab Cloud através de PlatformAdminConfig
        const allMsgs = loadAllInboxMessages();
        const canceledIds = Array.from(loadCanceledMessageIds());
        try {
          await auth.updateAdminConfig({
            ...auth.adminConfig,
            inboxMessages: allMsgs.slice(0, 50),
            canceledInboxMessageIds: canceledIds,
          });
        } catch (err) {
          console.warn("Aviso ao salvar configuração remota após cancelamento:", err);
        }

        refreshHistory();
        if (readersModalMsg?.id === cancelingMsg.id) {
          setReadersModalMsg(null);
        }
        onBroadcastSent?.(
          `🚫 O envio da mensagem "${cancelingMsg.title}" foi cancelado com sucesso. Ela foi removida da caixa de correio de todos os alunos.`
        );
      }
    } catch (err) {
      console.error("Erro ao cancelar envio da mensagem:", err);
    } finally {
      setIsCanceling(false);
      setCancelingMsg(null);
    }
  };

  // Sincroniza ativamente da nuvem PlayFab e executa retrobusca sempre que o modal de detalhes de leitura for aberto
  // e mantém polling em tempo real a cada 5 segundos de forma silenciosa e estável (sem nenhum layout shift)
  useEffect(() => {
    if (!readersModalMsg) return;
    let isSubscribed = true;

    // 1. Executa retrobusca imediata no registro local de alunos e claims
    runRetroactiveInboxReadsScan(studentsListRef.current);
    setReadersRefreshCount((c) => c + 1);

    // 2. Consulta a nuvem PlayFab silenciosamente (apenas gira o ícone sem alterar dimensões do layout)
    const pollReaders = async (isInitial = false) => {
      if (isInitial) {
        setIsSyncingReaders(true);
      } else {
        setIsBackgroundSyncing(true);
      }
      try {
        await syncInboxReadsFromPlayFab();
        if (isSubscribed) {
          runRetroactiveInboxReadsScan(studentsListRef.current);
          setReadersRefreshCount((c) => c + 1);
        }
      } catch (err) {
        console.warn("Falha no polling silencioso de leituras:", err);
      } finally {
        if (isSubscribed) {
          if (isInitial) setIsSyncingReaders(false);
          setIsBackgroundSyncing(false);
        }
      }
    };

    void pollReaders(true);
    const pollId = setInterval(() => {
      void pollReaders(false);
    }, 5000);

    return () => {
      isSubscribed = false;
      clearInterval(pollId);
    };
  }, [readersModalMsg?.id]);

  const handleManualSyncReaders = async () => {
    setIsSyncingReaders(true);
    try {
      runRetroactiveInboxReadsScan(studentsListRef.current);
      await syncInboxReadsFromPlayFab();
      runRetroactiveInboxReadsScan(studentsListRef.current);
      setReadersRefreshCount((c) => c + 1);
    } catch (err) {
      console.warn("Falha na sincronização manual de leituras:", err);
    } finally {
      setIsSyncingReaders(false);
    }
  };

  // Alunos elegíveis de acordo com os filtros de escola e etapa
  const eligibleStudents = useMemo(() => {
    return studentsList.filter((student) => {
      if (!student || !student.id) return false;

      // Filtro de Escola
      if (recipientMode === "school" && selectedSchool !== "TODAS") {
        const studentSchool = (student.school || "").trim().toLowerCase();
        if (studentSchool !== selectedSchool.trim().toLowerCase()) {
          return false;
        }
      }

      // Filtro de Etapa
      if (recipientMode === "stage" && selectedStage !== "TODAS") {
        try {
          const stInfo = stageFromBirthdate(student.birthdate, new Date(), student.school);
          if (stInfo.id !== selectedStage && stInfo.shortLabel !== selectedStage) {
            return false;
          }
        } catch {
          return false;
        }
      }

      return true;
    });
  }, [studentsList, recipientMode, selectedSchool, selectedStage]);

  // Alunos elegíveis filtrados pelo termo de pesquisa na UI
  const displayStudents = useMemo(() => {
    if (!studentSearch.trim()) return eligibleStudents;
    const q = studentSearch.toLowerCase().trim();
    return eligibleStudents.filter((s) => {
      const nick = (s.nick || "").toLowerCase();
      const fullName = (s.full_name || "").toLowerCase();
      const school = (s.school || "").toLowerCase();
      return nick.includes(q) || fullName.includes(q) || school.includes(q);
    });
  }, [eligibleStudents, studentSearch]);

  // Contagem de alunos por escola para exibir no seletor
  const schoolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const st of studentsList) {
      if (st.school) {
        counts[st.school] = (counts[st.school] || 0) + 1;
      }
    }
    return counts;
  }, [studentsList]);

  // Contagem de alunos por etapa para exibir no seletor
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const st of studentsList) {
      try {
        const info = stageFromBirthdate(st.birthdate, new Date(), st.school);
        counts[info.id] = (counts[info.id] || 0) + 1;
      } catch {
        /* ignore */
      }
    }
    return counts;
  }, [studentsList]);

  // Ao alternar o modo ou alterar o filtro de escola/etapa:
  // Por regra, os alunos começam DESMARCADOS (seleção limpa)
  useEffect(() => {
    setSelectedStudentIds(new Set());
  }, [recipientMode, selectedSchool, selectedStage]);

  // Verifica se todos os alunos elegíveis estão marcados atualmente
  const isAllSelected = useMemo(() => {
    if (eligibleStudents.length === 0) return false;
    return eligibleStudents.every((s) => selectedStudentIds.has(s.id));
  }, [eligibleStudents, selectedStudentIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      // Se todos estiverem selecionados, desmarca todos
      setSelectedStudentIds(new Set());
    } else {
      // Caso contrário, marca todos os elegíveis
      const next = new Set(eligibleStudents.map((s) => s.id));
      setSelectedStudentIds(next);
    }
  };

  const handleToggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Mídias indexadas dinamicamente com numeração incremental por tipo (gif1, gif2... img1, img2...)
  const indexedMediaList = useMemo(() => {
    let gifCount = 0;
    let imgCount = 0;
    return mediaList.map((item) => {
      if (item.type === "gif") {
        gifCount++;
        return { ...item, tagKey: `gif${gifCount}` };
      } else {
        imgCount++;
        return { ...item, tagKey: `img${imgCount}` };
      }
    });
  }, [mediaList]);

  // Manipulação de Mídias (+ Adicionar Mídia)
  const handleAddMedia = (type: "gif" | "img" = "img") => {
    const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setMediaList((prev) => [...prev, { id, type, url: "" }]);
  };

  const handleToggleMediaType = (id: string, newType: "gif" | "img") => {
    setMediaList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, type: newType } : m))
    );
  };

  const handleUpdateMediaUrl = (id: string, url: string) => {
    setMediaList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, url: url.trim() } : m))
    );
  };

  const handleRemoveMedia = (id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id));
  };

  const handleInsertTagIntoBody = (tagKey: string) => {
    const tag = `[${tagKey}]`;
    insertTagIntoTextarea(bodyTextareaRef.current, body, setBody, tag);
    setCopiedTag(tagKey);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Envio da Mensagem
  const handleSendMessage = async () => {
    if (!title.trim()) {
      alert("Por favor, informe o título da mensagem.");
      return;
    }
    if (!body.trim()) {
      alert("Por favor, escreva o texto da mensagem.");
      return;
    }

    if (selectedStudentIds.size === 0) {
      alert(
        "Nenhum aluno está selecionado para receber a mensagem. Marque pelo menos um aluno ou utilize o botão 'Marcar Todos'."
      );
      return;
    }

    // Coleta todos os identificadores (id, nick, nickNormalizado, playfabId) dos alunos marcados
    const selectedStudents = studentsList.filter((s) => selectedStudentIds.has(s.id));
    const targetIdentifiers: string[] = [];
    for (const s of selectedStudents) {
      if (s.id) targetIdentifiers.push(s.id);
      if (s.nick) targetIdentifiers.push(s.nick);
      if (s.nickNormalized) targetIdentifiers.push(s.nickNormalized);
      if (s.playfabId) targetIdentifiers.push(s.playfabId);
    }

    // Alunos que foram desmarcados dentro do escopo elegível
    const excludedStudentIds = eligibleStudents
      .filter((s) => !selectedStudentIds.has(s.id))
      .map((s) => s.id);

    // Constrói mapas de gifLinks e imageLinks a partir da lista unificada de mídias
    const gifLinks: Record<string, string> = {};
    const imageLinks: Record<string, string> = {};
    for (const m of indexedMediaList) {
      if (m.url.trim()) {
        if (m.type === "gif") {
          gifLinks[m.tagKey] = m.url.trim();
        } else {
          imageLinks[m.tagKey] = m.url.trim();
        }
      }
    }

    // Consolidação de jogos e eventos para a mensagem
    const effectiveGames: Record<string, string> = { ...mentionedGames };
    if (selectedMentionGame && !effectiveGames["game"]) {
      effectiveGames["game"] = selectedMentionGame;
    }
    const effectiveEvents: Record<string, { eventId: string; eventTitle?: string; linkEventDetails?: boolean }> = { ...mentionedEvents };
    if (selectedMentionEventId && !effectiveEvents["event"]) {
      effectiveEvents["event"] = {
        eventId: selectedMentionEventId,
        eventTitle: allConfiguredEvents.find((e) => e.id === selectedMentionEventId)?.title,
        linkEventDetails,
      };
    }
    for (const [k, evObj] of Object.entries(effectiveEvents)) {
      if (evObj && evObj.eventId && !evObj.eventTitle) {
        evObj.eventTitle = allConfiguredEvents.find((e) => e.id === evObj.eventId)?.title;
      }
    }

    // REGRA DO USUÁRIO: Validação rigorosa pré-envio
    // Se houver tags [gameX], [eventX], [gifX], [imgX] no texto sem o respectivo item/link selecionado, bloqueia o envio
    const tagValidation = validateMessageTags(body, {
      mentionedGames: effectiveGames,
      mentionedEvents: effectiveEvents,
      gifLinks,
      imageLinks,
      singleGameId: selectedMentionGame,
      singleEventId: selectedMentionEventId,
    });
    if (!tagValidation.valid) {
      alert(tagValidation.errorMessage);
      return;
    }

    const foundMentionEvent = allConfiguredEvents.find((e) => e.id === selectedMentionEventId);

    const draft: AdminBroadcastDraft = {
      mode: recipientMode,
      targetSchool: recipientMode === "school" ? selectedSchool : undefined,
      targetStage: recipientMode === "stage" ? selectedStage : undefined,
      targetStudentIds: targetIdentifiers,
      excludedStudentIds: excludedStudentIds,
      title: title.trim(),
      body: body.trim(),
      gifLinks: Object.keys(gifLinks).length > 0 ? gifLinks : undefined,
      imageLinks: Object.keys(imageLinks).length > 0 ? imageLinks : undefined,
      mentionedGameId: selectedMentionGame || undefined,
      mentionedEventId: selectedMentionEventId || undefined,
      mentionedEventTitle: foundMentionEvent?.title || undefined,
      linkEventDetails: linkEventDetails,
      mentionedGames: Object.keys(effectiveGames).length > 0 ? effectiveGames : undefined,
      mentionedEvents: Object.keys(effectiveEvents).length > 0 ? effectiveEvents : undefined,
      reward: hasReward
        ? {
            type: rewardType,
            pointsAmount: rewardType === "points" ? Number(rewardPoints) || 50 : undefined,
            medalId: rewardType === "medal" ? selectedMedalId : undefined,
            isSecret: isSecretReward,
          }
        : undefined,
    };

    const sent = sendAdminBroadcastMessage(draft);

    // Sincroniza imediatamente com PlayFab Cloud através de PlatformAdminConfig
    const allMsgs = loadAllInboxMessages();
    try {
      await auth.updateAdminConfig({
        ...auth.adminConfig,
        inboxMessages: allMsgs.slice(0, 50),
      });
    } catch (err) {
      console.warn("Aviso ao salvar configuração remota:", err);
    }

    refreshHistory();

    const recipientCount = selectedStudentIds.size;
    const msgFeedback = `✅ Mensagem "${sent.title}" transmitida com sucesso para ${recipientCount} aluno(s)!`;
    onBroadcastSent?.(msgFeedback);

    // Limpa campos do compositor e seleção
    setTitle("");
    setBody("");
    setMediaList([]);
    setSelectedMentionGame("");
    setMentionedGames({});
    setSelectedMentionEventId("");
    setMentionedEvents({});
    setLinkEventDetails(true);
    setHasReward(false);
    setIsSecretReward(false);
    setSelectedStudentIds(new Set());
  };

  // Mídias indexadas para o formulário de Mensagem Programada
  const indexedSchedMediaList = useMemo(() => {
    let gifCount = 0;
    let imgCount = 0;
    return schedMediaList.map((item) => {
      if (item.type === "gif") {
        gifCount++;
        return { ...item, tagKey: `gif${gifCount}` };
      } else {
        imgCount++;
        return { ...item, tagKey: `img${imgCount}` };
      }
    });
  }, [schedMediaList]);

  const handleAddSchedMedia = (type: "gif" | "img" = "img") => {
    const id = `media_sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setSchedMediaList((prev) => [...prev, { id, type, url: "" }]);
  };

  const handleToggleSchedMediaType = (id: string, newType: "gif" | "img") => {
    setSchedMediaList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, type: newType } : m))
    );
  };

  const handleUpdateSchedMediaUrl = (id: string, url: string) => {
    setSchedMediaList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, url: url.trim() } : m))
    );
  };

  const handleRemoveSchedMedia = (id: string) => {
    setSchedMediaList((prev) => prev.filter((m) => m.id !== id));
  };

  const handleInsertSchedTagIntoBody = (tagKey: string) => {
    const tag = `[${tagKey}]`;
    insertTagIntoTextarea(schedBodyTextareaRef.current, schedBody, setSchedBody, tag);
    setCopiedTag(tagKey);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const refreshScheduledRules = () => {
    try {
      const list = loadScheduledInboxRules();
      setScheduledRules(list);
    } catch {
      setScheduledRules([]);
    }
  };

  // Motor periódico de verificação e disparo das mensagens programadas
  useEffect(() => {
    refreshScheduledRules();

    const runAutoDispatch = () => {
      const res = evaluateAndTriggerScheduledMessages(undefined, new Date());
      if (res.triggeredCount > 0) {
        refreshScheduledRules();
        refreshHistory();
        try {
          auth.updateAdminConfig({
            ...auth.adminConfig,
            inboxMessages: loadAllInboxMessages().slice(0, 50),
            scheduledInboxRules: loadScheduledInboxRules(),
          }).catch(console.warn);
        } catch {
          /* ignore */
        }
      }
    };

    runAutoDispatch();
    const interval = setInterval(() => {
      runAutoDispatch();
      void syncInboxReadsFromPlayFab().catch(console.warn);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleCancelEditScheduledRule = () => {
    setEditingRuleId(null);
    setSchedTitle("");
    setSchedBody("");
    setSchedRecurrence("weekly");
    setSchedDaysOfWeek([6]);
    setSchedDayOfMonth(1);
    setSchedSpecificDate("");
    setSchedTimeOfDay("08:00");
    setSchedValidFrom("");
    setSchedValidUntil("");
    setSchedMediaList([]);
    setSchedMentionGame("");
    setSchedMentionGames({});
    setSchedMentionEventId("");
    setSchedMentionEvents({});
    setSchedLinkEventDetails(true);
    setSchedHasReward(false);
    setSchedIsSecretReward(false);
  };

  const handleSaveScheduledRule = async () => {
    if (!schedTitle.trim()) {
      alert("Por favor, digite o título da mensagem programada.");
      return;
    }
    if (!schedBody.trim()) {
      alert("Por favor, digite o texto da mensagem programada.");
      return;
    }
    if (selectedStudentIds.size === 0) {
      alert(
        "Nenhum aluno está selecionado para receber esta mensagem programada. Marque pelo menos um aluno na coluna da esquerda ou use o botão 'Marcar Todos'."
      );
      return;
    }

    const selectedStudents = studentsList.filter((s) => selectedStudentIds.has(s.id));
    const targetIdentifiers: string[] = [];
    for (const s of selectedStudents) {
      if (s.id) targetIdentifiers.push(s.id);
      if (s.nick) targetIdentifiers.push(s.nick);
      if (s.nickNormalized) targetIdentifiers.push(s.nickNormalized);
      if (s.playfabId) targetIdentifiers.push(s.playfabId);
    }

    const excludedStudentIds = eligibleStudents
      .filter((s) => !selectedStudentIds.has(s.id))
      .map((s) => s.id);

    const gifLinks: Record<string, string> = {};
    const imageLinks: Record<string, string> = {};
    for (const m of indexedSchedMediaList) {
      if (m.url.trim()) {
        if (m.type === "gif") {
          gifLinks[m.tagKey] = m.url.trim();
        } else {
          imageLinks[m.tagKey] = m.url.trim();
        }
      }
    }

    // Consolidação de jogos e eventos para a mensagem programada
    const effectiveGames: Record<string, string> = { ...schedMentionGames };
    if (schedMentionGame && !effectiveGames["game"]) {
      effectiveGames["game"] = schedMentionGame;
    }
    const effectiveEvents: Record<string, { eventId: string; eventTitle?: string; linkEventDetails?: boolean }> = { ...schedMentionEvents };
    if (schedMentionEventId && !effectiveEvents["event"]) {
      effectiveEvents["event"] = {
        eventId: schedMentionEventId,
        eventTitle: allConfiguredEvents.find((e) => e.id === schedMentionEventId)?.title,
        linkEventDetails: schedLinkEventDetails,
      };
    }
    for (const [k, evObj] of Object.entries(effectiveEvents)) {
      if (evObj && evObj.eventId && !evObj.eventTitle) {
        evObj.eventTitle = allConfiguredEvents.find((e) => e.id === evObj.eventId)?.title;
      }
    }

    // REGRA DO USUÁRIO: Validação rigorosa antes de salvar agendamento
    const tagValidation = validateMessageTags(schedBody, {
      mentionedGames: effectiveGames,
      mentionedEvents: effectiveEvents,
      gifLinks,
      imageLinks,
      singleGameId: schedMentionGame,
      singleEventId: schedMentionEventId,
    });
    if (!tagValidation.valid) {
      alert(tagValidation.errorMessage);
      return;
    }

    const foundEvent = allConfiguredEvents.find((e) => e.id === schedMentionEventId);
    const existingRule = editingRuleId
      ? scheduledRules.find((r) => r.id === editingRuleId)
      : null;

    const rule: ScheduledInboxRule = {
      id: editingRuleId || `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: schedTitle.trim(),
      body: schedBody.trim(),
      active: existingRule ? existingRule.active : true,
      recurrence: schedRecurrence,
      daysOfWeek: schedRecurrence === "weekly" ? (schedDaysOfWeek.length > 0 ? schedDaysOfWeek : [6]) : undefined,
      dayOfMonth: schedRecurrence === "monthly" ? Number(schedDayOfMonth) || 1 : undefined,
      specificDate: schedRecurrence === "once" ? schedSpecificDate : undefined,
      timeOfDay: schedTimeOfDay || "08:00",
      validFrom: schedValidFrom || undefined,
      validUntil: schedValidUntil || undefined,
      recipientMode: recipientMode,
      targetSchool: recipientMode === "school" ? selectedSchool : undefined,
      targetStage: recipientMode === "stage" ? selectedStage : undefined,
      targetStudentIds: targetIdentifiers,
      excludedStudentIds: excludedStudentIds,
      gifLinks: Object.keys(gifLinks).length > 0 ? gifLinks : undefined,
      imageLinks: Object.keys(imageLinks).length > 0 ? imageLinks : undefined,
      mentionedGameId: schedMentionGame || undefined,
      mentionedEventId: schedMentionEventId || undefined,
      mentionedEventTitle: foundEvent?.title || undefined,
      linkEventDetails: schedLinkEventDetails,
      mentionedGames: Object.keys(effectiveGames).length > 0 ? effectiveGames : undefined,
      mentionedEvents: Object.keys(effectiveEvents).length > 0 ? effectiveEvents : undefined,
      reward: schedHasReward
        ? {
            type: schedRewardType,
            pointsAmount: schedRewardType === "points" ? Number(schedRewardPoints) || 50 : undefined,
            medalId: schedRewardType === "medal" ? schedSelectedMedalId : undefined,
            isSecret: schedIsSecretReward,
          }
        : undefined,
      lastTriggeredAt: existingRule?.lastTriggeredAt,
      lastTriggeredCycleKey: existingRule?.lastTriggeredCycleKey,
      lastTriggeredMessageId: existingRule?.lastTriggeredMessageId,
      createdAt: existingRule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = upsertScheduledInboxRule(rule);
    setScheduledRules(updatedList);

    try {
      await auth.updateAdminConfig({
        ...auth.adminConfig,
        scheduledInboxRules: updatedList,
      });
    } catch (err) {
      console.warn("Aviso ao salvar configuração remota:", err);
    }

    const actionText = editingRuleId ? "atualizada" : "agendada";
    onBroadcastSent?.(`⏰ Mensagem "${rule.title}" ${actionText} com sucesso!`);

    handleCancelEditScheduledRule();
  };

  const handleEditRule = (rule: ScheduledInboxRule) => {
    setEditingRuleId(rule.id);
    setSchedTitle(rule.title);
    setSchedBody(rule.body);
    setSchedRecurrence(rule.recurrence);
    setSchedDaysOfWeek(rule.daysOfWeek || [6]);
    setSchedDayOfMonth(rule.dayOfMonth || 1);
    setSchedSpecificDate(rule.specificDate || "");
    setSchedTimeOfDay(rule.timeOfDay || "08:00");
    setSchedValidFrom(rule.validFrom || "");
    setSchedValidUntil(rule.validUntil || "");
    setSchedMentionGame(rule.mentionedGameId || "");
    setSchedMentionGames(rule.mentionedGames || (rule.mentionedGameId ? { game: rule.mentionedGameId } : {}));
    setSchedMentionEventId(rule.mentionedEventId || "");
    setSchedMentionEvents(
      rule.mentionedEvents ||
        (rule.mentionedEventId
          ? {
              event: {
                eventId: rule.mentionedEventId,
                linkEventDetails: rule.linkEventDetails !== false,
              },
            }
          : {})
    );
    setSchedLinkEventDetails(rule.linkEventDetails !== false);

    const media: { id: string; type: "gif" | "img"; url: string }[] = [];
    if (rule.imageLinks) {
      for (const [k, url] of Object.entries(rule.imageLinks)) {
        media.push({ id: `edit_${k}_${Math.random()}`, type: "img", url });
      }
    }
    if (rule.gifLinks) {
      for (const [k, url] of Object.entries(rule.gifLinks)) {
        media.push({ id: `edit_${k}_${Math.random()}`, type: "gif", url });
      }
    }
    setSchedMediaList(media);

    if (rule.reward) {
      setSchedHasReward(true);
      setSchedRewardType(rule.reward.type);
      if (rule.reward.pointsAmount) setSchedRewardPoints(rule.reward.pointsAmount);
      if (rule.reward.medalId) setSchedSelectedMedalId(rule.reward.medalId);
      setSchedIsSecretReward(Boolean(rule.reward.isSecret));
    } else {
      setSchedHasReward(false);
    }

    setRecipientMode(rule.recipientMode);
    if (rule.targetSchool) setSelectedSchool(rule.targetSchool);
    if (rule.targetStage) setSelectedStage(rule.targetStage);
    if (Array.isArray(rule.targetStudentIds) && rule.targetStudentIds.length > 0) {
      setSelectedStudentIds(new Set(rule.targetStudentIds));
    }
  };

  const handleToggleRuleActive = async (ruleId: string, currentActive: boolean) => {
    const updated = toggleScheduledInboxRuleActive(ruleId, !currentActive);
    setScheduledRules(updated);
    try {
      await auth.updateAdminConfig({
        ...auth.adminConfig,
        scheduledInboxRules: updated,
      });
    } catch (err) {
      console.warn("Aviso ao atualizar status remoto da regra:", err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Deseja realmente excluir esta mensagem programada?")) return;
    const updated = deleteScheduledInboxRule(ruleId);
    setScheduledRules(updated);
    if (editingRuleId === ruleId) {
      handleCancelEditScheduledRule();
    }
    try {
      await auth.updateAdminConfig({
        ...auth.adminConfig,
        scheduledInboxRules: updated,
      });
    } catch (err) {
      console.warn("Aviso ao excluir regra remota:", err);
    }
  };

  const handleTriggerRuleNow = async (ruleId: string) => {
    const res = evaluateAndTriggerScheduledMessages(undefined, new Date(), ruleId);
    if (res.triggeredCount > 0) {
      refreshScheduledRules();
      refreshHistory();
      try {
        await auth.updateAdminConfig({
          ...auth.adminConfig,
          inboxMessages: loadAllInboxMessages().slice(0, 50),
          scheduledInboxRules: loadScheduledInboxRules(),
        });
      } catch (err) {
        console.warn("Aviso ao salvar PlayFab:", err);
      }
      onBroadcastSent?.(`⚡ Mensagem programada disparada com sucesso para o ciclo atual!`);
    }
  };

  // Estatísticas de leitura para o modal de inspeção
  const activeReadersData = useMemo(() => {
    if (!readersModalMsg) return null;
    // readersRefreshCount garante recalculo imediato após retorno do PlayFab
    void readersRefreshCount;
    return getMessageReaders(readersModalMsg, studentsList);
  }, [readersModalMsg, studentsList, readersRefreshCount]);

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="rounded-3xl border bg-gradient-to-r from-amber-500/10 via-primary/10 to-transparent p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-zinc-950 shadow-md">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-lg font-black text-foreground">
                Correio & Transmissão de Mensagens
              </h2>
              <p className="text-xs text-muted-foreground">
                Envie comunicados gerais, gifs animados, pontos e medalhas para todos os alunos ou grupos específicos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-foreground border">
              Total na Plataforma: <b>{studentsList.length}</b> alunos
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA: DESTINATÁRIOS & SELEÇÃO DE ALUNOS (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl border bg-card p-4 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Destinatários da Mensagem
                </h3>
              </div>
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {selectedStudentIds.size} selecionado(s)
              </span>
            </div>

            {/* SELETOR DE MODO */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Modo de Envio</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-secondary/50 p-1">
                <button
                  type="button"
                  onClick={() => setRecipientMode("all")}
                  className={`rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                    recipientMode === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🌐 Todos
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode("school")}
                  className={`rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                    recipientMode === "school"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🏫 Por Escola
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode("stage")}
                  className={`rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                    recipientMode === "stage"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🎓 Por Etapa
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode("students")}
                  className={`rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                    recipientMode === "students"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  👤 Específicos
                </button>
              </div>
            </div>

            {/* FILTROS ADICIONAIS CONFORME MODO */}
            {recipientMode === "school" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">Selecione a Escola</Label>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {selectedSchool === "TODAS"
                      ? `${studentsList.length} alunos cadastrados`
                      : `${schoolCounts[selectedSchool] || 0} alunos cadastrados`}
                  </span>
                </div>
                <select
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className="h-10 w-full rounded-xl border bg-background px-3 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary"
                >
                  <option value="TODAS">Todas as Escolas ({studentsList.length} alunos)</option>
                  {SCHOOLS.map((s) => {
                    const count = schoolCounts[s.name] || 0;
                    return (
                      <option key={s.name} value={s.name}>
                        {s.name} ({count} {count === 1 ? "aluno" : "alunos"})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {recipientMode === "stage" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">Selecione a Etapa</Label>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {selectedStage === "TODAS"
                      ? `${studentsList.length} alunos no total`
                      : `${stageCounts[selectedStage] || 0} alunos`}
                  </span>
                </div>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  className="h-10 w-full rounded-xl border bg-background px-3 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary"
                >
                  <option value="TODAS">Todas as Etapas ({studentsList.length} alunos)</option>
                  {AGE_STAGES.map((st) => {
                    const count = stageCounts[st.id] || 0;
                    return (
                      <option key={st.id} value={st.id}>
                        {st.label} ({count} {count === 1 ? "aluno" : "alunos"})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* BARRA DE PESQUISA E AÇÃO RÁPIDA DE MARCAÇÃO EM 1 BOTÃO */}
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Pesquisar por nick ou escola..."
                  className="h-9 pl-8 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className={`flex items-center gap-1.5 font-bold text-xs py-1.5 px-3 rounded-xl transition-all cursor-pointer border ${
                    isAllSelected
                      ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                      : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                  }`}
                >
                  {isAllSelected ? (
                    <>
                      <CheckSquare className="h-3.5 w-3.5" />
                      <span>Desmarcar Todos ({eligibleStudents.length})</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      <span>Marcar Todos ({eligibleStudents.length})</span>
                    </>
                  )}
                </button>

                <span className="text-[11px] font-bold text-muted-foreground">
                  {selectedStudentIds.size} de {eligibleStudents.length} marcados
                </span>
              </div>
            </div>

            {/* LISTA ROLÁVEL DE ALUNOS COM CHECKBOX */}
            <div className="max-h-[380px] overflow-y-auto space-y-1.5 rounded-2xl border bg-background/50 p-2">
              {displayStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum aluno encontrado com os filtros atuais.
                </div>
              ) : (
                displayStudents.map((student) => {
                  const isChecked = selectedStudentIds.has(student.id);
                  let stageText = "Geral";
                  try {
                    const stInfo = stageFromBirthdate(student.birthdate, new Date(), student.school);
                    stageText = stInfo.shortLabel || "Geral";
                  } catch {
                    stageText = "Geral";
                  }

                  const studentLvl = student.level || levelProgress(student.xp || 0).level || 1;

                  return (
                    <div
                      key={student.id}
                      onClick={() => handleToggleStudent(student.id)}
                      className={`flex items-center justify-between gap-2 rounded-xl p-2.5 text-xs transition-colors cursor-pointer border ${
                        isChecked
                          ? "border-primary/40 bg-primary/5 text-foreground"
                          : "border-border/60 bg-card/60 opacity-60 text-muted-foreground hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleStudent(student.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded accent-primary cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-foreground truncate">
                            {student.nick}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {student.school || "Sem escola"} • {stageText}
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-secondary shrink-0">
                        Nv. {studentLvl}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: COMPOSITOR DA MENSAGEM, GIFS E RECOMPENSAS (7 colunas) */}
        <div className="lg:col-span-7 space-y-5">
          {/* SELETOR DE ABAS DO COMPOSITOR */}
          <div className="flex items-center gap-2 rounded-2xl bg-secondary/50 p-1.5 border">
            <button
              type="button"
              onClick={() => setInboxTab("immediate")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all cursor-pointer ${
                inboxTab === "immediate"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Envio Imediato</span>
            </button>
            <button
              type="button"
              onClick={() => setInboxTab("scheduled")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all cursor-pointer ${
                inboxTab === "scheduled"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Mensagens Programadas</span>
              {scheduledRules.filter((r) => r.active).length > 0 && (
                <span className="rounded-full bg-amber-500 text-zinc-950 px-2 py-0.5 text-[10px] font-black">
                  {scheduledRules.filter((r) => r.active).length}
                </span>
              )}
            </button>
          </div>

          {inboxTab === "immediate" ? (
            <>
              <div className="rounded-3xl border bg-card p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-sm font-bold text-foreground">
                      Compositor do Comunicado Imediato
                    </h3>
                  </div>
              <span className="text-xs text-muted-foreground">
                Suporta quebras de linha e tags de mídia
              </span>
            </div>

            {/* TÍTULO DA MENSAGEM */}
            <div className="space-y-1.5">
              <Label htmlFor="msg-title" className="text-xs font-bold text-foreground">
                Título do Comunicado
              </Label>
              <Input
                id="msg-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: 🏆 Desafio de Sexta-feira liberado para todos!"
                className="h-11 rounded-2xl font-bold text-sm"
              />
            </div>

            {/* CORPO DA MENSAGEM */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="msg-body" className="text-xs font-bold text-foreground">
                  Texto da Mensagem
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {body.length} caracteres
                </span>
              </div>
              <textarea
                id="msg-body"
                ref={bodyTextareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva a mensagem completa para os alunos. Para exibir um GIF animado em um ponto específico do texto, use a tag [gif1] ou [gif2]..."
                rows={6}
                className="w-full rounded-2xl border bg-background p-3.5 text-xs font-medium leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* MENÇÕES DINÂMICAS: [nick], [gameX] e [eventX] */}
            <div className="rounded-2xl border bg-secondary/20 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4 text-primary" />
                  <span className="font-display text-xs font-bold text-foreground">
                    Menções Dinâmicas no Texto: Tags [nick], [game] & [event]
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      insertTagIntoTextarea(bodyTextareaRef.current, body, setBody, "[nick]");
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold cursor-pointer"
                    title="Insere a tag [nick] exatamente na posição do cursor"
                  >
                    + Inserir [nick]
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const nextTag = detectedTags.games.length === 0 ? "[game1]" : `[game${detectedTags.games.length + 1}]`;
                      insertTagIntoTextarea(bodyTextareaRef.current, body, setBody, nextTag);
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold cursor-pointer border-primary/40 text-primary hover:bg-primary/10"
                    title="Insere a tag de jogo no ponto do cursor"
                  >
                    + Inserir {detectedTags.games.length === 0 ? "[game1]" : `[game${detectedTags.games.length + 1}]`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const nextTag = detectedTags.events.length === 0 ? "[event1]" : `[event${detectedTags.events.length + 1}]`;
                      insertTagIntoTextarea(bodyTextareaRef.current, body, setBody, nextTag);
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold cursor-pointer border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    title="Insere a tag de evento no ponto do cursor"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    + Inserir {detectedTags.events.length === 0 ? "[event1]" : `[event${detectedTags.events.length + 1}]`}
                  </Button>
                </div>
              </div>

              {/* Seletores Dinâmicos de Jogo: gera automaticamente uma linha para cada tag [gameX] encontrada no texto */}
              {detectedTags.games.length === 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Label htmlFor="mention-game-select" className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                    Jogo para a tag <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono">[game]</code>:
                  </Label>
                  <select
                    id="mention-game-select"
                    value={selectedMentionGame}
                    onChange={(e) => {
                      setSelectedMentionGame(e.target.value);
                      setMentionedGames((prev) => ({ ...prev, game: e.target.value }));
                    }}
                    className="h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1"
                  >
                    <option value="">(Nenhum jogo selecionado — tag [game] inativa)</option>
                    {ALL_GAME_IDS.map((gId) => (
                      <option key={gId} value={gId}>
                        🎯 {GAME_NAMES[gId]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2 border-t pt-2.5">
                  <div className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                    <Gamepad2 className="h-3.5 w-3.5" />
                    <span>Jogos Vinculados às Tags Detectadas no Texto ({detectedTags.games.length}):</span>
                  </div>
                  {detectedTags.games.map((gTag) => {
                    const currentVal = mentionedGames[gTag] || (gTag === "game" ? selectedMentionGame : "");
                    return (
                      <div
                        key={gTag}
                        className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border p-2.5 transition-all ${
                          !currentVal ? "border-amber-500/60 bg-amber-500/10" : "border-primary/30 bg-background"
                        }`}
                      >
                        <Label className="text-[11px] font-bold text-foreground whitespace-nowrap">
                          Jogo para a tag <code className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-black">[{gTag}]</code>:
                        </Label>
                        <select
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMentionedGames((prev) => ({ ...prev, [gTag]: val }));
                            if (gTag === "game") setSelectedMentionGame(val);
                          }}
                          className={`h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1 ${
                            !currentVal ? "border-amber-500 text-amber-700 dark:text-amber-300" : ""
                          }`}
                        >
                          <option value="">⚠️ (Selecione o jogo correspondente à tag [{gTag}])</option>
                          {ALL_GAME_IDS.map((gId) => (
                            <option key={gId} value={gId}>
                              🎯 {GAME_NAMES[gId]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Seletores Dinâmicos de Evento: gera automaticamente uma linha para cada tag [eventX] encontrada no texto */}
              {detectedTags.events.length === 0 ? (
                <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Label htmlFor="mention-event-select" className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Evento para a tag <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300 font-mono">[event]</code>:
                    </Label>
                    <select
                      id="mention-event-select"
                      value={selectedMentionEventId}
                      onChange={(e) => {
                        setSelectedMentionEventId(e.target.value);
                        setMentionedEvents((prev) => ({
                          ...prev,
                          event: {
                            eventId: e.target.value,
                            linkEventDetails: prev["event"]?.linkEventDetails ?? linkEventDetails,
                          },
                        }));
                      }}
                      className="h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1"
                    >
                      <option value="">(Nenhum evento selecionado — exibe título padrão)</option>
                      {allConfiguredEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          ✨ [{ev.type}] {ev.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-500/20">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span>Linkar detalhes completos do evento</span>
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/20 px-1.5 py-0.2 rounded">
                          Padrão: Ativado
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Se <b>marcado</b>, o nome do evento é exibido em cor de destaque e se torna clicável para abrir um modal sobreposto com as informações do evento. Se <b>desmarcado</b>, o nome do evento é exibido apenas em <b>negrito</b>.
                      </p>
                    </div>
                    <Switch
                      checked={linkEventDetails}
                      onCheckedChange={(checked) => {
                        setLinkEventDetails(checked);
                        setMentionedEvents((prev) => ({
                          ...prev,
                          event: {
                            eventId: prev["event"]?.eventId || selectedMentionEventId,
                            linkEventDetails: checked,
                          },
                        }));
                      }}
                      aria-label="Linkar detalhes do evento"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 border-t pt-2.5">
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Eventos Vinculados às Tags Detectadas no Texto ({detectedTags.events.length}):</span>
                  </div>
                  {detectedTags.events.map((eTag) => {
                    const currentVal = mentionedEvents[eTag]?.eventId || (eTag === "event" ? selectedMentionEventId : "");
                    const canLink = mentionedEvents[eTag]?.linkEventDetails ?? (eTag === "event" ? linkEventDetails : true);
                    return (
                      <div
                        key={eTag}
                        className={`space-y-2.5 rounded-xl border p-3 transition-all ${
                          !currentVal
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-amber-500/40 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <Label className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Evento para a tag <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300 font-mono font-black">[{eTag}]</code>:
                          </Label>
                          <select
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMentionedEvents((prev) => ({
                                ...prev,
                                [eTag]: {
                                  eventId: val,
                                  linkEventDetails: prev[eTag]?.linkEventDetails ?? canLink,
                                },
                              }));
                              if (eTag === "event") setSelectedMentionEventId(val);
                            }}
                            className={`h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1 ${
                              !currentVal ? "border-amber-500 text-amber-700 dark:text-amber-300 font-black" : ""
                            }`}
                          >
                            <option value="">⚠️ (Selecione o evento correspondente à tag [{eTag}])</option>
                            {allConfiguredEvents.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                ✨ [{ev.type}] {ev.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-500/20">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <span>Linkar detalhes completos para [{eTag}]</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              Torna a menção <b>[{eTag}]</b> clicável para exibir o modal de detalhes do evento.
                            </p>
                          </div>
                          <Switch
                            checked={canLink}
                            onCheckedChange={(checked) => {
                              setMentionedEvents((prev) => ({
                                ...prev,
                                [eTag]: {
                                  eventId: prev[eTag]?.eventId || currentVal,
                                  linkEventDetails: checked,
                                },
                              }));
                              if (eTag === "event") setLinkEventDetails(checked);
                            }}
                            aria-label={`Linkar detalhes do evento ${eTag}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground leading-relaxed">
                💡 <b>[nick]</b> menciona dinamicamente o apelido do aluno em <b>negrito destacado</b>.<br />
                💡 <b>[game]</b> ou <b>[game1]</b>, <b>[game2]</b> escreve o nome do jogo selecionado como menção em <b>negrito</b>.<br />
                💡 <b>[event]</b> ou <b>[event1]</b>, <b>[event2]</b> exibe o nome do evento vinculado como link clicável (abre modal com multiplicadores e regras) ou em <b>negrito</b> conforme o botão acima.
              </p>
            </div>

            {/* GERENCIADOR DE MÍDIAS (GIFS E IMAGENS) */}
            <div className="space-y-3.5 rounded-2xl border bg-secondary/30 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="font-display text-xs font-bold text-foreground">
                    Anexar Mídia (GIFs Animados & Imagens)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddMedia("img")}
                  className="h-8 rounded-xl text-xs font-bold gap-1.5 cursor-pointer bg-primary/10 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Mídia
                </Button>
              </div>

              {indexedMediaList.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma mídia anexada. Clique em <b>&quot;+ Adicionar Mídia&quot;</b> para incluir uma imagem (<code>[img1]</code>) ou GIF animado (<code>[gif1]</code>) e colar a URL correspondente.
                </p>
              ) : (
                <div className="space-y-2.5 border-t border-border/50 pt-2.5">
                  {indexedMediaList.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-xl border bg-background p-2.5"
                    >
                      {/* Alternador de Tipo: Imagem ou GIF */}
                      <div className="flex items-center rounded-lg bg-secondary p-0.5 shrink-0 border">
                        <button
                          type="button"
                          onClick={() => handleToggleMediaType(m.id, "img")}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            m.type === "img"
                              ? "bg-card text-blue-600 dark:text-blue-400 shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <ImageIcon className="h-3 w-3" /> Img
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleMediaType(m.id, "gif")}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            m.type === "gif"
                              ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Sparkles className="h-3 w-3" /> GIF
                        </button>
                      </div>

                      {/* Botão de Inserir Tag */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleInsertTagIntoBody(m.tagKey)}
                        title="Clique para inserir a tag no texto da mensagem exatamente onde o cursor estiver"
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-mono font-bold transition-colors cursor-pointer shrink-0 ${
                          m.type === "gif"
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-zinc-950"
                            : "bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white"
                        }`}
                      >
                        {copiedTag === m.tagKey ? (
                          <>
                            <Check className="h-3 w-3" /> Inserido!
                          </>
                        ) : (
                          <>
                            [{m.tagKey}] <Copy className="h-3 w-3 opacity-70" />
                          </>
                        )}
                      </button>

                      {/* Input da URL */}
                      <Input
                        value={m.url}
                        onChange={(e) => handleUpdateMediaUrl(m.id, e.target.value)}
                        placeholder={
                          m.type === "gif"
                            ? "Link direto do GIF (ex: https://.../anim.gif)"
                            : "Link direto da imagem (ex: https://.../aviso.png)"
                        }
                        className="h-8 rounded-lg text-xs flex-1"
                      />

                      {/* Preview em miniatura */}
                      {m.url && (
                        <div className="h-8 w-8 rounded-lg border bg-muted/50 overflow-hidden shrink-0 flex items-center justify-center">
                          <img
                            src={m.url}
                            alt="preview"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                      )}

                      {/* Botão Remover */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMedia(m.id)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer shrink-0"
                        title="Remover anexo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="text-[10px] text-muted-foreground pt-1 border-t">
                    💡 <b>Dica:</b> Escolha entre <b>Img</b> (tag <code>[img1]</code>) ou <b>GIF</b> (tag <code>[gif1]</code>) e clique no botão da tag para inseri-la no texto da mensagem.
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO DE RECOMPENSAS */}
            <div className="space-y-3 rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-amber-500 animate-bounce" />
                  <div>
                    <span className="font-display text-xs font-bold text-foreground block">
                      Anexar Recompensa à Mensagem
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      O aluno receberá um botão para resgatar o prêmio dentro do correio
                    </span>
                  </div>
                </div>
                <Switch
                  checked={hasReward}
                  onCheckedChange={setHasReward}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {hasReward && (
                <div className="space-y-3.5 pt-2 border-t border-primary/10">
                  {/* TIPO DE RECOMPENSA */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">Tipo de Recompensa</Label>
                    <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-background p-1 border">
                      <button
                        type="button"
                        onClick={() => setRewardType("points")}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                          rewardType === "points"
                            ? "bg-amber-500 text-zinc-950 shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Coins className="h-3.5 w-3.5" /> Pontos
                      </button>
                      <button
                        type="button"
                        onClick={() => setRewardType("medal")}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                          rewardType === "medal"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Award className="h-3.5 w-3.5" /> Medalha
                      </button>
                      <button
                        type="button"
                        onClick={() => setRewardType("future_item")}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                          rewardType === "future_item"
                            ? "bg-secondary text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Package className="h-3.5 w-3.5" /> Novo Item
                      </button>
                    </div>
                  </div>

                  {/* CONFIGURAÇÃO ESPECÍFICA DO TIPO */}
                  {rewardType === "points" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="reward-points" className="text-xs font-bold text-foreground">
                        Quantidade de Pontos de Carreira
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="reward-points"
                          type="number"
                          min={10}
                          max={5000}
                          step={10}
                          value={rewardPoints}
                          onChange={(e) => setRewardPoints(Math.max(1, Number(e.target.value)))}
                          className="h-10 rounded-xl font-bold text-sm w-36"
                        />
                        <span className="text-xs text-muted-foreground">
                          Serão adicionados diretamente ao saldo de pontos do aluno.
                        </span>
                      </div>
                    </div>
                  )}

                  {rewardType === "medal" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="reward-medal" className="text-xs font-bold text-foreground">
                        Medalha a Conceder
                      </Label>
                      <select
                        id="reward-medal"
                        value={selectedMedalId}
                        onChange={(e) => setSelectedMedalId(e.target.value)}
                        className="h-10 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                      >
                        {availableMedals.map((m) => (
                          <option key={m.id} value={m.id}>
                            [{m.rarity.toUpperCase()}] {m.title} — {m.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {rewardType === "future_item" && (
                    <div className="rounded-xl border border-dashed border-primary/40 bg-background/50 p-3 text-center space-y-1">
                      <Package className="h-6 w-6 text-primary mx-auto opacity-70" />
                      <div className="text-xs font-bold text-foreground">
                        Módulo de Itens Futuros (Reservado)
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Esta área já está isolada e estruturada para expansões de inventário e itens especiais que serão adicionados futuramente à plataforma.
                      </div>
                    </div>
                  )}

                  {/* TOGGLE DE RECOMPENSA SECRETA */}
                  <div className="flex items-center justify-between rounded-xl border bg-background/80 p-3">
                    <div className="flex items-center gap-2.5">
                      <Lock className="h-4 w-4 text-amber-500" />
                      <div>
                        <span className="font-display text-xs font-bold text-foreground block">
                          Tornar Recompensa Secreta
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          O aluno terá que pressionar para carregar a barra de revelação antes de abrir o prêmio
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={isSecretReward}
                      onCheckedChange={setIsSecretReward}
                      className="data-[state=checked]:bg-amber-500"
                    />
                  </div>

                  <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Regra do Sistema: O aluno só poderá excluir esta mensagem após resgatar a recompensa.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* BOTÃO PRINCIPAL DE ENVIO */}
            <Button
              type="button"
              size="lg"
              onClick={() => void handleSendMessage()}
              className="h-12 w-full rounded-2xl font-display text-sm font-extrabold gap-2 shadow-lg cursor-pointer"
            >
              <Send className="h-4 w-4" /> Transmitir Mensagem para {selectedStudentIds.size} Aluno(s)
            </Button>
          </div>

          {/* HISTÓRICO DE MENSAGENS TRANSMITIDAS COM CONTADOR DE LEITURAS */}
          <div className="rounded-3xl border bg-card p-5 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-display text-xs font-bold text-foreground uppercase tracking-wider">
                  Histórico de Mensagens Transmitidas ({sentHistory.length})
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHistorySortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                  className="h-7 rounded-xl text-[11px] font-bold gap-1.5 cursor-pointer bg-secondary/50 hover:bg-secondary border-border/80"
                  title={
                    historySortOrder === "desc"
                      ? "Ordem atual: Mais recentes no topo. Clique para exibir mais antigas no topo."
                      : "Ordem atual: Mais antigas no topo. Clique para exibir mais recentes no topo."
                  }
                >
                  <ArrowUpDown className="h-3 w-3 text-primary" />
                  <span>{historySortOrder === "desc" ? "Mais Recentes ⬇️" : "Mais Antigas ⬆️"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshHistory}
                  className="h-7 text-xs font-bold cursor-pointer"
                >
                  Atualizar
                </Button>
              </div>
            </div>

            {sortedSentHistory.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nenhum comunicado foi transmitido recentemente.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2.5">
                {sortedSentHistory.map((msg) => {
                  let formattedDate = "Recente";
                  try {
                    formattedDate = new Date(msg.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  } catch {
                    formattedDate = "Recente";
                  }

                  const stats = getMessageReaders(msg, studentsList);
                  const readPercent =
                    stats.totalTargeted > 0
                      ? Math.round((stats.readCount / stats.totalTargeted) * 100)
                      : 0;

                  return (
                    <div
                      key={msg.id}
                      className="flex flex-col gap-2 rounded-2xl border bg-secondary/25 p-3.5 text-xs transition-colors hover:bg-secondary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-foreground truncate text-sm">
                              {msg.title}
                            </span>
                            {msg.reward && (
                              <span className="rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 shrink-0">
                                🎁 Recompensa
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {formattedDate} • Destinatários:{" "}
                            {msg.recipientId === "ALL"
                              ? msg.recipientFilter?.school
                                ? `Escola: ${msg.recipientFilter.school}`
                                : msg.recipientFilter?.stage
                                  ? `Etapa: ${msg.recipientFilter.stage}`
                                  : "Todos os Alunos"
                              : `Aluno: ${msg.recipientId}`}
                          </div>
                        </div>

                        <span
                          className="text-[10px] font-mono font-bold text-muted-foreground shrink-0 bg-background/80 px-2 py-0.5 rounded-md border"
                          title={`ID completo no sistema: ${msg.id}`}
                        >
                          ID: #{msg.id.split("_").pop() || msg.id.slice(-6)}
                        </span>
                      </div>

                      {/* ESTATÍSTICA DE LEITURAS / QUEM ABRIU A MENSAGEM */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-bold text-primary">
                            <Eye className="h-3.5 w-3.5" />
                            <span>
                              {stats.readCount} de {stats.totalTargeted} alunos abriram ({readPercent}%)
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReadersModalMsg(msg);
                              setReadersTab("read");
                            }}
                            className="h-7 rounded-xl text-[11px] font-bold gap-1 cursor-pointer"
                          >
                            <Users className="h-3 w-3" /> Ver Detalhes de Leitura
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setCancelingMsg(msg)}
                            className="h-7 rounded-xl text-[11px] font-bold gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                            title="Cancelar o envio e remover esta mensagem da caixa de correio de todos os alunos"
                          >
                            <Trash2 className="h-3 w-3" /> Cancelar Envio
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* COMPOSITOR DE MENSAGEM PROGRAMADA */}
          <div className="rounded-3xl border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  {editingRuleId ? "✏️ Editando Mensagem Programada" : "⏰ Compositor de Mensagem Programada"}
                </h3>
              </div>
              {editingRuleId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEditScheduledRule}
                  className="h-7 text-xs font-bold text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  Cancelar Edição
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Configure envios automáticos por dia da semana ou data
                </span>
              )}
            </div>

            {/* TÍTULO DA MENSAGEM PROGRAMADA */}
            <div className="space-y-1.5">
              <Label htmlFor="sched-title" className="text-xs font-bold text-foreground">
                Título da Mensagem Programada
              </Label>
              <Input
                id="sched-title"
                value={schedTitle}
                onChange={(e) => setSchedTitle(e.target.value)}
                placeholder="Ex: ⚡ Bônus 3X de XP de Fim de Semana Ativo!"
                className="h-11 rounded-2xl font-bold text-sm"
              />
            </div>

            {/* CORPO DA MENSAGEM PROGRAMADA */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sched-body" className="text-xs font-bold text-foreground">
                  Texto da Mensagem
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {schedBody.length} caracteres
                </span>
              </div>
              <textarea
                id="sched-body"
                ref={schedBodyTextareaRef}
                value={schedBody}
                onChange={(e) => setSchedBody(e.target.value)}
                placeholder="Escreva a mensagem programada. Use [nick] para o aluno, [game] para o jogo e [event] para o evento..."
                rows={5}
                className="w-full rounded-2xl border bg-background p-3.5 text-xs font-medium leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* MENÇÕES DINÂMICAS: [nick], [game] e [event] */}
            <div className="rounded-2xl border bg-secondary/20 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4 text-primary" />
                  <span className="font-display text-xs font-bold text-foreground">
                    Menções Dinâmicas no Texto: Tags [nick], [game] & [event]
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      insertTagIntoTextarea(schedBodyTextareaRef.current, schedBody, setSchedBody, "[nick]");
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold cursor-pointer"
                    title="Insere a tag [nick] exatamente na posição do cursor"
                  >
                    + Inserir [nick]
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const nextTag = schedDetectedTags.games.length === 0 ? "[game1]" : `[game${schedDetectedTags.games.length + 1}]`;
                      insertTagIntoTextarea(schedBodyTextareaRef.current, schedBody, setSchedBody, nextTag);
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold cursor-pointer border-primary/40 text-primary hover:bg-primary/10"
                    title="Insere a tag de jogo no ponto do cursor"
                  >
                    + Inserir {schedDetectedTags.games.length === 0 ? "[game1]" : `[game${schedDetectedTags.games.length + 1}]`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const nextTag = schedDetectedTags.events.length === 0 ? "[event1]" : `[event${schedDetectedTags.events.length + 1}]`;
                      insertTagIntoTextarea(schedBodyTextareaRef.current, schedBody, setSchedBody, nextTag);
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold cursor-pointer border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    title="Insere a tag de evento no ponto do cursor"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    + Inserir {schedDetectedTags.events.length === 0 ? "[event1]" : `[event${schedDetectedTags.events.length + 1}]`}
                  </Button>
                </div>
              </div>

              {/* Seletores Dinâmicos de Jogo da Mensagem Programada */}
              {schedDetectedTags.games.length === 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Label htmlFor="sched-mention-game-select" className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                    Jogo para a tag <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono">[game]</code>:
                  </Label>
                  <select
                    id="sched-mention-game-select"
                    value={schedMentionGame}
                    onChange={(e) => {
                      setSchedMentionGame(e.target.value);
                      setSchedMentionGames((prev) => ({ ...prev, game: e.target.value }));
                    }}
                    className="h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1"
                  >
                    <option value="">(Nenhum jogo selecionado — tag [game] inativa)</option>
                    {ALL_GAME_IDS.map((gId) => (
                      <option key={gId} value={gId}>
                        🎯 {GAME_NAMES[gId]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2 border-t pt-2.5">
                  <div className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                    <Gamepad2 className="h-3.5 w-3.5" />
                    <span>Jogos Vinculados às Tags Detectadas no Agendamento ({schedDetectedTags.games.length}):</span>
                  </div>
                  {schedDetectedTags.games.map((gTag) => {
                    const currentVal = schedMentionGames[gTag] || (gTag === "game" ? schedMentionGame : "");
                    return (
                      <div
                        key={gTag}
                        className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border p-2.5 transition-all ${
                          !currentVal ? "border-amber-500/60 bg-amber-500/10" : "border-primary/30 bg-background"
                        }`}
                      >
                        <Label className="text-[11px] font-bold text-foreground whitespace-nowrap">
                          Jogo para a tag <code className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-black">[{gTag}]</code>:
                        </Label>
                        <select
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSchedMentionGames((prev) => ({ ...prev, [gTag]: val }));
                            if (gTag === "game") setSchedMentionGame(val);
                          }}
                          className={`h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1 ${
                            !currentVal ? "border-amber-500 text-amber-700 dark:text-amber-300" : ""
                          }`}
                        >
                          <option value="">⚠️ (Selecione o jogo correspondente à tag [{gTag}])</option>
                          {ALL_GAME_IDS.map((gId) => (
                            <option key={gId} value={gId}>
                              🎯 {GAME_NAMES[gId]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Seletores Dinâmicos de Evento da Mensagem Programada */}
              {schedDetectedTags.events.length === 0 ? (
                <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Label htmlFor="sched-mention-event-select" className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Evento para a tag <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300 font-mono">[event]</code>:
                    </Label>
                    <select
                      id="sched-mention-event-select"
                      value={schedMentionEventId}
                      onChange={(e) => {
                        setSchedMentionEventId(e.target.value);
                        setSchedMentionEvents((prev) => ({
                          ...prev,
                          event: {
                            eventId: e.target.value,
                            linkEventDetails: prev["event"]?.linkEventDetails ?? schedLinkEventDetails,
                          },
                        }));
                      }}
                      className="h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1"
                    >
                      <option value="">(Nenhum evento selecionado — exibe título padrão)</option>
                      {allConfiguredEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          ✨ [{ev.type}] {ev.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-500/20">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-foreground">
                        Linkar detalhes completos do evento
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Se ativado, torna o nome do evento clicável para abrir o modal de detalhes.
                      </p>
                    </div>
                    <Switch
                      checked={schedLinkEventDetails}
                      onCheckedChange={(checked) => {
                        setSchedLinkEventDetails(checked);
                        setSchedMentionEvents((prev) => ({
                          ...prev,
                          event: {
                            eventId: prev["event"]?.eventId || schedMentionEventId,
                            linkEventDetails: checked,
                          },
                        }));
                      }}
                      aria-label="Linkar detalhes do evento"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 border-t pt-2.5">
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Eventos Vinculados às Tags Detectadas no Agendamento ({schedDetectedTags.events.length}):</span>
                  </div>
                  {schedDetectedTags.events.map((eTag) => {
                    const currentVal = schedMentionEvents[eTag]?.eventId || (eTag === "event" ? schedMentionEventId : "");
                    const canLink = schedMentionEvents[eTag]?.linkEventDetails ?? (eTag === "event" ? schedLinkEventDetails : true);
                    return (
                      <div
                        key={eTag}
                        className={`space-y-2.5 rounded-xl border p-3 transition-all ${
                          !currentVal
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-amber-500/40 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <Label className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Evento para a tag <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300 font-mono font-black">[{eTag}]</code>:
                          </Label>
                          <select
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSchedMentionEvents((prev) => ({
                                ...prev,
                                [eTag]: {
                                  eventId: val,
                                  linkEventDetails: prev[eTag]?.linkEventDetails ?? canLink,
                                },
                              }));
                              if (eTag === "event") setSchedMentionEventId(val);
                            }}
                            className={`h-8 rounded-xl border bg-background px-3 text-xs font-bold flex-1 ${
                              !currentVal ? "border-amber-500 text-amber-700 dark:text-amber-300 font-black" : ""
                            }`}
                          >
                            <option value="">⚠️ (Selecione o evento correspondente à tag [{eTag}])</option>
                            {allConfiguredEvents.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                ✨ [{ev.type}] {ev.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-500/20">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-foreground">
                              Linkar detalhes completos para [{eTag}]
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Torna a menção <b>[{eTag}]</b> clicável para abrir o modal de detalhes do evento.
                            </p>
                          </div>
                          <Switch
                            checked={canLink}
                            onCheckedChange={(checked) => {
                              setSchedMentionEvents((prev) => ({
                                ...prev,
                                [eTag]: {
                                  eventId: prev[eTag]?.eventId || currentVal,
                                  linkEventDetails: checked,
                                },
                              }));
                              if (eTag === "event") setSchedLinkEventDetails(checked);
                            }}
                            aria-label={`Linkar detalhes do evento ${eTag}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* GERENCIADOR DE MÍDIAS DA MENSAGEM PROGRAMADA */}
            <div className="space-y-3 rounded-2xl border bg-secondary/30 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="font-display text-xs font-bold text-foreground">
                    Anexar Mídia (GIFs & Imagens)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddSchedMedia("img")}
                  className="h-7 rounded-xl text-xs font-bold gap-1 cursor-pointer bg-primary/10 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Mídia
                </Button>
              </div>

              {indexedSchedMediaList.length > 0 && (
                <div className="space-y-2 border-t border-border/50 pt-2">
                  {indexedSchedMediaList.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-xl border bg-background p-2 text-xs"
                    >
                      <div className="flex items-center rounded-lg bg-secondary p-0.5 shrink-0 border">
                        <button
                          type="button"
                          onClick={() => handleToggleSchedMediaType(m.id, "img")}
                          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            m.type === "img" ? "bg-card text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                          }`}
                        >
                          Img
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSchedMediaType(m.id, "gif")}
                          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            m.type === "gif" ? "bg-card text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                          }`}
                        >
                          GIF
                        </button>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleInsertSchedTagIntoBody(m.tagKey)}
                        className="h-7 rounded-lg text-xs font-mono font-bold"
                        title="Clique para inserir a tag no texto da mensagem exatamente onde o cursor estiver"
                      >
                        [{m.tagKey}]
                      </Button>

                      <Input
                        value={m.url}
                        onChange={(e) => handleUpdateSchedMediaUrl(m.id, e.target.value)}
                        placeholder="URL da mídia..."
                        className="h-7 text-xs flex-1"
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSchedMedia(m.id)}
                        className="h-7 w-7 p-0 text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RECOMPENSAS DA MENSAGEM PROGRAMADA */}
            <div className="space-y-3.5 rounded-2xl border bg-secondary/30 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-amber-500" />
                  <span className="font-display text-xs font-bold text-foreground">
                    Anexar Recompensa na Mensagem Programada
                  </span>
                </div>
                <Switch
                  checked={schedHasReward}
                  onCheckedChange={setSchedHasReward}
                  aria-label="Ativar recompensa na mensagem programada"
                />
              </div>

              {schedHasReward && (
                <div className="space-y-3.5 border-t border-border/50 pt-3">
                  <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-secondary/50 p-1">
                    <button
                      type="button"
                      onClick={() => setSchedRewardType("points")}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                        schedRewardType === "points"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Coins className="h-3.5 w-3.5" /> Pontos / Moedas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchedRewardType("medal")}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                        schedRewardType === "medal"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Award className="h-3.5 w-3.5" /> Medalha
                    </button>
                  </div>

                  {schedRewardType === "points" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">
                        Quantidade de Pontos de Carreira
                      </Label>
                      <Input
                        type="number"
                        min={10}
                        max={10000}
                        step={10}
                        value={schedRewardPoints}
                        onChange={(e) => setSchedRewardPoints(Math.max(1, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl font-mono font-bold text-sm"
                      />
                    </div>
                  )}

                  {schedRewardType === "medal" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">
                        Selecione a Medalha a Conceder
                      </Label>
                      <select
                        value={schedSelectedMedalId}
                        onChange={(e) => setSchedSelectedMedalId(e.target.value)}
                        className="w-full h-10 rounded-xl border bg-background px-3 text-xs font-bold"
                      >
                        {availableMedals.map((m) => {
                          const rarity = RARITY_INFO[m.rarity] || RARITY_INFO.ouro;
                          return (
                            <option key={m.id} value={m.id}>
                              🏅 {m.title} — [{rarity.label.toUpperCase()}]
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-xl bg-background/50 p-2.5 border">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Recompensa Secreta
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        O aluno só descobrirá o prêmio ao clicar no presente misterioso.
                      </p>
                    </div>
                    <Switch
                      checked={schedIsSecretReward}
                      onCheckedChange={setSchedIsSecretReward}
                      aria-label="Ativar recompensa secreta"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* BLOCO DE CRONOGRAMA / PROGRAMAÇÃO DO HORÁRIO */}
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-primary/20 pb-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h4 className="font-display text-xs font-black text-foreground uppercase tracking-wider">
                  Cronograma de Disparo Automático
                </h4>
              </div>

              {/* TIPO DE RECORRÊNCIA */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Frequência do Envio</Label>
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary/50 p-1">
                  <button
                    type="button"
                    onClick={() => setSchedRecurrence("weekly")}
                    className={`rounded-xl py-2 text-xs font-black transition-all cursor-pointer ${
                      schedRecurrence === "weekly"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    📅 Semanal
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedRecurrence("monthly")}
                    className={`rounded-xl py-2 text-xs font-black transition-all cursor-pointer ${
                      schedRecurrence === "monthly"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🗓️ Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedRecurrence("once")}
                    className={`rounded-xl py-2 text-xs font-black transition-all cursor-pointer ${
                      schedRecurrence === "once"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🎯 Data Única
                  </button>
                </div>
              </div>

              {/* CONFIGURAÇÃO ESPECÍFICA POR FREQUÊNCIA */}
              {schedRecurrence === "weekly" && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-foreground">
                    Dias da Semana de Envio:
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_NAMES_SHORT.map((dayName, dayIdx) => {
                      const isSelected = schedDaysOfWeek.includes(dayIdx);
                      return (
                        <button
                          key={dayIdx}
                          type="button"
                          onClick={() => {
                            setSchedDaysOfWeek((prev) => {
                              if (prev.includes(dayIdx)) {
                                if (prev.length === 1) return prev;
                                return prev.filter((d) => d !== dayIdx);
                              }
                              return [...prev, dayIdx].sort((a, b) => a - b);
                            });
                          }}
                          className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-background text-muted-foreground border-border/70 hover:text-foreground"
                          }`}
                        >
                          {dayName}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Exemplo: marque <b>Sáb</b> para o comunicado de fim de semana, ou <b>Seg</b> para abertura da rodada.
                  </p>
                </div>
              )}

              {schedRecurrence === "monthly" && (
                <div className="space-y-1.5">
                  <Label htmlFor="sched-month-day" className="text-xs font-bold text-foreground">
                    Dia do Mês para Envio
                  </Label>
                  <select
                    id="sched-month-day"
                    value={schedDayOfMonth}
                    onChange={(e) => setSchedDayOfMonth(Number(e.target.value) || 1)}
                    className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        Todo dia {d} de cada mês
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {schedRecurrence === "once" && (
                <div className="space-y-1.5">
                  <Label htmlFor="sched-specific-date" className="text-xs font-bold text-foreground">
                    Data Exata do Disparo
                  </Label>
                  <Input
                    id="sched-specific-date"
                    type="date"
                    value={schedSpecificDate}
                    onChange={(e) => setSchedSpecificDate(e.target.value)}
                    className="h-9 rounded-xl text-xs font-bold"
                  />
                </div>
              )}

              {/* HORÁRIO DO DISPARO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-primary/20">
                <div className="space-y-1.5">
                  <Label htmlFor="sched-time" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Horário de Envio (24h)
                  </Label>
                  <Input
                    id="sched-time"
                    type="time"
                    value={schedTimeOfDay}
                    onChange={(e) => setSchedTimeOfDay(e.target.value)}
                    className="h-9 rounded-xl font-mono text-xs font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    Validade da Programação (Opcional)
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={schedValidFrom}
                      onChange={(e) => setSchedValidFrom(e.target.value)}
                      placeholder="De"
                      className="h-9 rounded-xl text-[11px]"
                      title="Data de Início da Validade"
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input
                      type="date"
                      value={schedValidUntil}
                      onChange={(e) => setSchedValidUntil(e.target.value)}
                      placeholder="Até"
                      className="h-9 rounded-xl text-[11px]"
                      title="Data de Fim da Validade"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BOTÃO SALVAR MENSAGEM PROGRAMADA */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="lg"
                onClick={() => void handleSaveScheduledRule()}
                className="h-12 flex-1 rounded-2xl font-display text-sm font-extrabold gap-2 shadow-lg cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <CalendarClock className="h-4 w-4" />
                {editingRuleId ? "💾 Atualizar Programação" : `⏰ Salvar e Ativar Programação para ${selectedStudentIds.size} Aluno(s)`}
              </Button>
            </div>
          </div>

          {/* PAINEL INFERIOR: ACOMPANHAMENTO DAS MENSAGENS PROGRAMADAS SALVAS */}
          <div className="rounded-3xl border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <h3 className="font-display text-xs font-bold text-foreground uppercase tracking-wider">
                  Mensagens Programadas Salvas ({scheduledRules.length})
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const res = evaluateAndTriggerScheduledMessages(undefined, new Date());
                  refreshScheduledRules();
                  refreshHistory();
                  if (res.triggeredCount > 0) {
                    onBroadcastSent?.(`⚡ ${res.triggeredCount} mensagem(ns) programada(s) disparada(s)!`);
                  } else {
                    onBroadcastSent?.("Nenhum disparo pendente no momento exato.");
                  }
                }}
                className="h-7 text-xs font-bold cursor-pointer"
              >
                Verificar Disparos Agora
              </Button>
            </div>

            {scheduledRules.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
                <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p>Nenhuma mensagem programada cadastrada no momento.</p>
                <p className="text-[11px]">Use o formulário acima para programar avisos semanais, mensais ou pontuais.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledRules.map((rule) => {
                  const nextRun = computeNextRunDate(rule);
                  let nextRunFormatted = "Nenhum disparo futuro";
                  if (nextRun) {
                    nextRunFormatted = nextRun.toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }

                  let lastTriggeredFormatted = "Ainda não disparada";
                  if (rule.lastTriggeredAt) {
                    try {
                      lastTriggeredFormatted = new Date(rule.lastTriggeredAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    } catch {
                      lastTriggeredFormatted = "Recente";
                    }
                  }

                  // Busca a mensagem do ciclo atual mais recente para calcular leituras deste ciclo
                  const allMsgs = loadAllInboxMessages();
                  const currentCycleMsg = rule.lastTriggeredMessageId
                    ? allMsgs.find((m) => m.id === rule.lastTriggeredMessageId)
                    : null;

                  const cycleStats = currentCycleMsg
                    ? getMessageReaders(currentCycleMsg, studentsList)
                    : null;
                  const cycleReadPercent =
                    cycleStats && cycleStats.totalTargeted > 0
                      ? Math.round((cycleStats.readCount / cycleStats.totalTargeted) * 100)
                      : 0;

                  return (
                    <div
                      key={rule.id}
                      className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                        rule.active ? "bg-secondary/20 border-primary/20" : "bg-card/40 opacity-70 border-border"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display font-black text-sm text-foreground truncate">
                              {rule.title}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                rule.active
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {rule.active ? "🟢 ATIVA" : "⚪ PAUSADA"}
                            </span>
                            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold">
                              {formatRecurrenceLabel(rule)}
                            </span>
                          </div>

                          <div className="text-[11px] text-muted-foreground mt-1">
                            <b>Público:</b>{" "}
                            {rule.recipientMode === "all"
                              ? "Todos os Alunos"
                              : rule.recipientMode === "school"
                                ? `Escola: ${rule.targetSchool || "Todas"}`
                                : rule.recipientMode === "stage"
                                  ? `Etapa: ${rule.targetStage || "Todas"}`
                                  : `${rule.targetStudentIds?.length || 0} alunos selecionados`}
                          </div>
                        </div>

                        {/* AÇÕES DA REGRA */}
                        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleTriggerRuleNow(rule.id)}
                            className="h-7 rounded-xl text-[11px] font-bold gap-1 cursor-pointer border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            title="Disparar uma nova rodada desta mensagem agora para teste"
                          >
                            <Zap className="h-3 w-3" /> Disparar Agora
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleToggleRuleActive(rule.id, rule.active)}
                            className="h-7 rounded-xl text-[11px] font-bold gap-1 cursor-pointer"
                            title={rule.active ? "Pausar regra" : "Ativar regra"}
                          >
                            {rule.active ? <Pause className="h-3 w-3 text-amber-500" /> : <Play className="h-3 w-3 text-emerald-500" />}
                            {rule.active ? "Pausar" : "Ativar"}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRule(rule)}
                            className="h-7 rounded-xl text-[11px] font-bold gap-1 cursor-pointer"
                            title="Editar texto e horários desta regra"
                          >
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeleteRule(rule.id)}
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 cursor-pointer"
                            title="Excluir regra programada"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* TIMELINE DE DISPAROS */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-background/60 p-2.5 rounded-xl border border-border/50">
                        <div>
                          <span className="text-muted-foreground">Último disparo realizado: </span>
                          <b className="text-foreground">{lastTriggeredFormatted}</b>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Próximo envio previsto: </span>
                          <b className="text-primary">{nextRunFormatted}</b>
                        </div>
                      </div>

                      {/* STATUS DE LEITURA DO CICLO ATUAL (RESETADO A CADA NOVA SEMANA/ENVIO) */}
                      <div className="rounded-xl border bg-secondary/30 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <Eye className="h-3.5 w-3.5 text-primary" />
                            <span>Acompanhamento do Ciclo Atual:</span>
                          </div>
                          {currentCycleMsg && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ID: {currentCycleMsg.id.substring(0, 10)}
                            </span>
                          )}
                        </div>

                        {cycleStats ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/40">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  🟢 {cycleStats.readCount} de {cycleStats.totalTargeted} alunos abriram ({cycleReadPercent}%)
                                </span>
                                <span className="text-muted-foreground">
                                  ⚪ {cycleStats.unreadStudents.length} pendentes
                                </span>
                              </div>
                              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${cycleReadPercent}%` }}
                                />
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReadersModalMsg(currentCycleMsg);
                                setReadersTab("read");
                              }}
                              className="h-7 rounded-xl text-[11px] font-bold gap-1 cursor-pointer shrink-0"
                            >
                              <Users className="h-3 w-3" /> Ver Leituras do Ciclo
                            </Button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground italic">
                            Nenhum ciclo foi disparado ainda. As leituras aparecerão aqui assim que o primeiro envio for realizado.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
      </div>

      {/* MODAL DE DETALHES DE LEITURA (QUEM ABRIU / QUEM NÃO ABRIU) */}
      <Dialog open={Boolean(readersModalMsg)} onOpenChange={() => setReadersModalMsg(null)}>
        <DialogContent className="w-[95vw] max-w-lg rounded-3xl p-6">
          <DialogHeader className="space-y-1 pb-2 border-b">
            <div className="flex items-center justify-between gap-3 pr-6 min-h-[36px]">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="h-5 w-5 text-primary shrink-0" />
                <DialogTitle className="font-display text-base sm:text-lg font-black text-foreground truncate">
                  Controle de Leitura do Comunicado
                </DialogTitle>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSyncingReaders}
                onClick={handleManualSyncReaders}
                className="h-8 px-3 rounded-xl text-xs font-bold gap-1.5 text-primary border-primary/30 hover:bg-primary/10 cursor-pointer shrink-0 min-w-[125px] justify-center transition-colors select-none"
                title={isAnySyncing ? "Sincronizando leituras em tempo real com o servidor..." : "Executa a retrobusca completa e sincroniza com a nuvem PlayFab"}
              >
                <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isAnySyncing ? "animate-spin text-primary" : ""}`} />
                <span>Sincronizar</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground truncate font-medium">
              {readersModalMsg?.title}
            </p>
          </DialogHeader>

          {activeReadersData && (
            <div className="space-y-4 pt-2">
              {/* RESUMO EM NÚMEROS */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="font-display text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {activeReadersData.readCount}
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground">
                    Já Abriram ({activeReadersData.totalTargeted > 0 ? Math.round((activeReadersData.readCount / activeReadersData.totalTargeted) * 100) : 0}%)
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-secondary/40 p-3">
                  <div className="font-display text-2xl font-black text-foreground">
                    {activeReadersData.unreadStudents.length}
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground">
                    Ainda Não Abriram
                  </div>
                </div>
              </div>

              {/* SELETOR DE ABA DENTRO DO MODAL */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setReadersTab("read")}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    readersTab === "read"
                      ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🟢 Já Abriram ({activeReadersData.readStudents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReadersTab("unread")}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    readersTab === "unread"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ⚪ Não Abriram ({activeReadersData.unreadStudents.length})
                </button>
              </div>

              {/* LISTA ROLÁVEL DE ALUNOS */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-2xl border bg-background/50 p-2 text-xs">
                {readersTab === "read" ? (
                  activeReadersData.readStudents.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground">
                      Nenhum aluno abriu esta mensagem ainda.
                    </div>
                  ) : (
                    activeReadersData.readStudents.map(({ student, readAt, hasClaimedReward }) => (
                      <div
                        key={student.nickNormalized || student.nick || student.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5"
                      >
                        <div>
                          <div className="font-display font-bold text-foreground">
                            {student.nick}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {student.school || "Sem escola"}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>
                              {readAt
                                ? new Date(readAt).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Lida"}
                            </span>
                          </div>
                          {readersModalMsg?.reward && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                hasClaimedReward
                                  ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
                                  : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              }`}
                            >
                              {hasClaimedReward ? "🎁 Presente Resgatado" : "Pendente de Resgate"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )
                ) : activeReadersData.unreadStudents.length === 0 ? (
                  <div className="py-6 text-center text-emerald-600 font-bold">
                    🎉 Todos os alunos destinatários já abriram esta mensagem!
                  </div>
                ) : (
                  activeReadersData.unreadStudents.map((student) => (
                    <div
                      key={student.nickNormalized || student.nick || student.id}
                      className="flex items-center justify-between gap-2 rounded-xl border bg-card/60 p-2.5"
                    >
                      <div>
                        <div className="font-display font-bold text-foreground">
                          {student.nick}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {student.school || "Sem escola"}
                        </div>
                      </div>

                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                        <Clock3 className="h-3 w-3" /> Pendente
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReadersModalMsg(null)}
                  className="flex-1 rounded-xl text-xs font-bold"
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (readersModalMsg) {
                      setCancelingMsg(readersModalMsg);
                    }
                  }}
                  className="rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                  title="Cancelar o envio deste comunicado e removê-lo de todos os alunos"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Cancelar Envio
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMAÇÃO DE CANCELAMENTO DE ENVIO */}
      <Dialog
        open={Boolean(cancelingMsg)}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isCanceling) setCancelingMsg(null);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-destructive">
              <AlertCircle className="h-5 w-5" />
              Cancelar Envio da Mensagem
            </DialogTitle>
          </DialogHeader>

          {cancelingMsg && (
            <div className="space-y-4 py-2 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Tem certeza de que deseja cancelar o envio do comunicado{" "}
                <strong className="text-foreground font-semibold">"{cancelingMsg.title}"</strong>?
              </p>

              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3.5 space-y-1.5 text-destructive text-[11px]">
                <p className="font-bold flex items-center gap-1.5">
                  ⚠️ Efeitos imediatos do cancelamento:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>
                    A mensagem será <strong className="text-foreground">removida imediatamente</strong> da caixa de entrada de todos os jogadores.
                  </li>
                  <li>
                    Alunos que ainda não leram não terão mais acesso ao comunicado.
                  </li>
                  <li>
                    Quaisquer recompensas pendentes não resgatadas serão canceladas.
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelingMsg(null)}
                  disabled={isCanceling}
                  className="h-9 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmCancelMessage}
                  disabled={isCanceling}
                  className="h-9 rounded-xl font-bold text-xs gap-1.5 cursor-pointer shadow-xs"
                >
                  {isCanceling ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Cancelando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" /> Confirmar e Cancelar Envio
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
