import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Layers, PackageOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  orderPackRevealCards,
  type CardDefinition,
  type CardPackDefinition,
} from "@/lib/cards-catalog";
import { CollectibleCardView } from "./CollectibleCardView";

export interface PackOpenOutcome {
  drawn: CardDefinition[];
  newlyDiscovered: string[];
}

interface PackOpeningModalProps {
  pack: CardPackDefinition | null;
  onConfirmOpen: (pack: CardPackDefinition) => Promise<PackOpenOutcome | null>;
  onClose: () => void;
  titlePrefix?: string;
}

type Stage = "sealed" | "tearing" | "stack" | "summary";

function SerratedEdge({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      aria-hidden="true"
      className={`h-2.5 w-full ${
        position === "top" ? "-mb-px bg-teal-700" : "-mt-px bg-teal-900"
      }`}
      style={{
        clipPath:
          position === "top"
            ? "polygon(0% 100%, 4% 0%, 8% 100%, 12% 0%, 16% 100%, 20% 0%, 24% 100%, 28% 0%, 32% 100%, 36% 0%, 40% 100%, 44% 0%, 48% 100%, 52% 0%, 56% 100%, 60% 0%, 64% 100%, 68% 0%, 72% 100%, 76% 0%, 80% 100%, 84% 0%, 88% 100%, 92% 0%, 96% 100%, 100% 0%, 100% 100%)"
            : "polygon(0% 0%, 4% 100%, 8% 0%, 12% 100%, 16% 0%, 20% 100%, 24% 0%, 28% 100%, 32% 0%, 36% 100%, 40% 0%, 44% 100%, 48% 0%, 52% 100%, 56% 0%, 60% 100%, 64% 0%, 68% 100%, 72% 0%, 76% 100%, 80% 0%, 84% 100%, 88% 0%, 92% 100%, 96% 0%, 100% 100%, 100% 0%)",
      }}
    />
  );
}

function CardBackFace({ minimal = false }: { minimal?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-2xl border-2 border-teal-400/80 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-4 shadow-xl select-none">
      <div className="flex w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.2em] text-teal-300/75">
        <span>Integração</span>
      </div>

      {/* Emblema circular central */}
      <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-teal-400/60 bg-teal-500/15 shadow-[0_0_28px_-4px_rgba(45,212,191,0.55)]">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-teal-300/60 bg-slate-950/60">
          <Sparkles className="h-9 w-9 text-teal-300" />
        </div>
      </div>

      {minimal ? (
        <div className="h-6" />
      ) : (
        <span className="rounded-full border border-teal-400/40 bg-teal-500/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-teal-200">
          Clique para virar
        </span>
      )}
    </div>
  );
}

export function PackOpeningModal({
  pack,
  onConfirmOpen,
  onClose,
  titlePrefix = "Pacote",
}: PackOpeningModalProps) {
  const [stage, setStage] = useState<Stage>("sealed");
  const [isOpening, setIsOpening] = useState(false);
  const [orderedCards, setOrderedCards] = useState<CardDefinition[]>([]);
  const [newlyDiscovered, setNewlyDiscovered] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (exitTimerRef.current) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setStage("sealed");
    setIsOpening(false);
    setOrderedCards([]);
    setNewlyDiscovered([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsExiting(false);
  }, [pack]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  async function handleStartOpen() {
    if (!pack || isOpening) return;
    setIsOpening(true);
    const outcome = await onConfirmOpen(pack);
    setIsOpening(false);
    if (!outcome || outcome.drawn.length === 0) return;

    const ordered = orderPackRevealCards(outcome.drawn);
    setOrderedCards(ordered);
    setNewlyDiscovered(outcome.newlyDiscovered);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsExiting(false);
    setStage("tearing");

    timerRef.current = window.setTimeout(() => {
      setStage("stack");
    }, 2350);
  }

  function handleCardInteraction() {
    if (stage !== "stack" || isExiting) return;
    if (!isFlipped) {
      setIsFlipped(true);
      return;
    }
    handleNextCard();
  }

  function handleNextCard() {
    if (isExiting) return;
    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      if (currentIndex + 1 < orderedCards.length) {
        setIsFlipped(false);
        setIsExiting(false);
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsExiting(false);
        setStage("summary");
      }
    }, 360);
  }

  const currentCard = orderedCards[currentIndex];
  const remainingCount = Math.max(0, orderedCards.length - currentIndex);
  const isHighRarity =
    currentCard &&
    (currentCard.rarity === "rara" ||
      currentCard.rarity === "epica" ||
      currentCard.rarity === "lendaria" ||
      currentCard.isFoil);

  return (
    <Dialog open={Boolean(pack)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`${
          stage === "summary" ? "max-w-3xl" : "max-w-md"
        } max-h-[90vh] overflow-y-auto rounded-3xl transition-all`}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg sm:text-xl font-extrabold flex flex-wrap items-center gap-2">
            <PackageOpen className="h-5 w-5 text-primary" />
            <span>
              {titlePrefix}: {pack?.name}
            </span>
            {pack && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                {pack.cardsPerPack} cartas
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ETAPA 1: PACOTE FECHADO */}
        {stage === "sealed" && pack && (
          <div className="flex h-[31rem] flex-col items-center justify-between py-2">
            <div className="flex flex-1 items-center justify-center">
              <div className="relative w-[17rem] select-none drop-shadow-xl transition-transform hover:scale-[1.02]">
                <SerratedEdge position="top" />
                <div className="flex h-[22.5rem] items-center justify-center bg-gradient-to-b from-teal-700 via-teal-800 to-teal-900">
                  <div className="grid h-24 w-24 place-items-center rounded-3xl border-2 border-teal-300/60 bg-teal-950/35 shadow-inner">
                    <Layers className="h-12 w-12 text-teal-200" />
                  </div>
                </div>
                <SerratedEdge position="bottom" />
              </div>
            </div>

            <div className="flex w-full flex-col items-center gap-2">
              <Button
                type="button"
                size="lg"
                onClick={handleStartOpen}
                disabled={isOpening}
                className="rounded-2xl font-extrabold px-6 shadow-md"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isOpening ? "Abrindo..." : "Abrir Pacote"}
              </Button>
              {pack.description && (
                <p className="max-w-xs text-center text-[11px] text-muted-foreground line-clamp-2">
                  {pack.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ETAPA 2: ANIMAÇÃO DE RASGO E SAÍDA DAS CARTAS */}
        {stage === "tearing" && (
          <div className="relative flex h-[31rem] flex-col items-center justify-center overflow-hidden py-2">
            {/* Pilha de cartas de costas no tamanho real (w-60 h-[21rem]) escondida atrás do pacote */}
            <div className="animate-pack-cards-emerge relative z-10 h-[21rem] w-60">
              <CardBackFace minimal />
            </div>

            {/* Embalagem 100% sólida do pacote rasgando na frente */}
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden">
              <div className="relative w-[17rem]">
                {/* Tira superior sólida destacada */}
                <div className="animate-pack-top-rip">
                  <SerratedEdge position="top" />
                  <div className="h-9 w-full bg-teal-700" />
                </div>

                {/* Linha de rasgo luminosa */}
                <div className="relative h-1 w-full">
                  <div className="animate-pack-tear-line h-1 rounded-full bg-white shadow-[0_0_12px_2px_#5eead4]" />
                </div>

                {/* Corpo sólido do pacote descendo e saindo da tela */}
                <div className="animate-pack-body-drop">
                  <div className="h-[20.25rem] w-full bg-gradient-to-b from-teal-700 via-teal-800 to-teal-900 flex items-center justify-center">
                    <div className="grid h-24 w-24 place-items-center rounded-3xl border-2 border-teal-300/60 bg-teal-950/35 shadow-inner">
                      <Layers className="h-12 w-12 text-teal-200" />
                    </div>
                  </div>
                  <SerratedEdge position="bottom" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 3: PILHA INTERATIVA (CLICAR PARA VIRAR E ARREMESSAR EM 2D) */}
        {stage === "stack" && currentCard && (
          <div className="flex h-[31rem] flex-col items-center justify-between py-2 overflow-hidden">
            {/* Contagem de restantes no topo do container, fora da carta */}
            <div className="flex items-center justify-between w-full px-2 text-xs font-bold text-muted-foreground">
              <span>
                Carta {currentIndex + 1} de {orderedCards.length}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[11px] font-extrabold text-foreground">
                {remainingCount} restante{remainingCount === 1 ? "" : "s"}
              </span>
            </div>

            {/* Pilha com cartas de trás para profundidade */}
            <div className="relative flex items-center justify-center py-2">
              {remainingCount > 2 && (
                <div
                  aria-hidden="true"
                  className="absolute h-[21rem] w-60 translate-x-3 translate-y-3 rotate-2 rounded-2xl border-2 border-teal-500/40 bg-slate-900 shadow-md"
                />
              )}
              {remainingCount > 1 && (
                <div
                  aria-hidden="true"
                  className={`absolute h-[21rem] w-60 rounded-2xl transition-all duration-300 ${
                    isExiting
                      ? "translate-x-0 translate-y-0 rotate-0"
                      : "translate-x-1.5 translate-y-1.5 rotate-1"
                  }`}
                >
                  <CardBackFace minimal />
                </div>
              )}

              {/* Carta ativa com giro 3D ao revelar e arremesso 2D ao sair */}
              <div
                key={`active_${currentIndex}`}
                role="button"
                tabIndex={0}
                onClick={handleCardInteraction}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardInteraction();
                  }
                }}
                className={`perspective-1000 relative z-10 w-60 cursor-pointer focus:outline-none ${
                  isExiting ? "animate-card-toss-out pointer-events-none" : ""
                }`}
              >
                <div
                  className={`preserve-3d relative min-h-[21rem] w-full transition-transform duration-500 ease-out ${
                    isFlipped ? "rotate-y-180" : "hover:-translate-y-1"
                  }`}
                >
                  {/* Verso (de costas) */}
                  <div
                    className="backface-hidden absolute inset-0 overflow-hidden rounded-2xl"
                    style={{ transform: "rotateY(0deg) translateZ(1px)" }}
                  >
                    <CardBackFace />
                  </div>

                  {/* Frente (carta revelada) */}
                  <div
                    className={`backface-hidden w-full overflow-hidden rounded-2xl ${
                      isFlipped && isHighRarity && !isExiting ? "animate-[pop-in_0.35s_ease-out]" : ""
                    }`}
                    style={{ transform: "rotateY(180deg) translateZ(1px)" }}
                  >
                    <CollectibleCardView
                      card={currentCard}
                      isNew={newlyDiscovered.includes(currentCard.id)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de ação contextual */}
            <div className="flex items-center gap-2">
              {!isFlipped ? (
                <Button
                  type="button"
                  onClick={() => setIsFlipped(true)}
                  disabled={isExiting}
                  className="rounded-xl font-bold"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" /> Virar Carta
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleNextCard}
                  disabled={isExiting}
                  className="rounded-xl font-bold"
                >
                  {currentIndex + 1 < orderedCards.length ? (
                    <>
                      Próxima Carta <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  ) : (
                    <>
                      Ver Todas as Cartas <Check className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Indicadores de progresso */}
            <div className="flex items-center gap-1.5">
              {orderedCards.map((c, idx) => {
                const revealed = idx < currentIndex || (idx === currentIndex && isFlipped);
                const isActive = idx === currentIndex;
                return (
                  <span
                    key={`${c.id}_${idx}`}
                    className={`h-2 rounded-full transition-all ${
                      isActive
                        ? "w-6 bg-primary"
                        : revealed
                          ? "w-2.5 bg-emerald-500"
                          : "w-2 bg-muted-foreground/30"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ETAPA 4: RESUMO FINAL */}
        {stage === "summary" && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {orderedCards.map((card, idx) => (
                <CollectibleCardView
                  key={`${card.id}_${idx}`}
                  card={card}
                  isNew={newlyDiscovered.includes(card.id)}
                  compact
                />
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose} className="rounded-xl font-bold">
                <Check className="h-4 w-4 mr-1.5" /> Concluir
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
