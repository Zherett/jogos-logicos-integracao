import React from "react";
import {
  Brain,
  Grid,
  Bot,
  Variable,
  Shapes,
  Palette,
  Percent,
  Grid3x3,
  Puzzle as PuzzleIcon,
  Swords,
  Rocket,
} from "lucide-react";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";

const lazyGame = <K extends string>(
  loader: () => Promise<Record<K, React.ComponentType<GameComponentProps>>>,
  exportName: K,
) => React.lazy(() => loader().then((mod) => ({ default: mod[exportName] })));

const LogicGame = lazyGame(() => import("@/components/games/LogicGame"), "LogicGame");
const CartesianGame = lazyGame(() => import("@/components/games/CartesianGame"), "CartesianGame");
const RoboGridGame = lazyGame(() => import("@/components/games/RoboGridGame"), "RoboGridGame");
const VariableHuntGame = lazyGame(
  () => import("@/components/games/VariableHuntGame"),
  "VariableHuntGame",
);
const ShapeColorGame = lazyGame(() => import("@/components/games/ShapeColorGame"), "ShapeColorGame");
const ColorMemoryGame = lazyGame(
  () => import("@/components/games/ColorMemoryGame"),
  "ColorMemoryGame",
);
const MinefieldGame = lazyGame(() => import("@/components/games/MinefieldGame"), "MinefieldGame");
const PercentGame = lazyGame(() => import("@/components/games/PercentGame"), "PercentGame");
const CompleteLogicGame = lazyGame(
  () => import("@/components/games/CompleteLogicGame"),
  "CompleteLogicGame",
);
const RpgGame = lazyGame(() => import("@/components/games/RpgGame"), "RpgGame");
const SpaceQuestGame = lazyGame(() => import("@/components/games/SpaceQuestGame"), "SpaceQuestGame");

export interface GameComponentProps {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

export interface GameRegistration {
  id: GameId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  defaultCode: string;
  component: React.ComponentType<GameComponentProps>;
}

/**
 * Unified Game Registry:
 * To add a new game to the entire platform, simply register its definition here.
 * Menu cards, router rendering, default codes, ADM panel, tournament rotation,
 * and game-specific medals will be wired automatically.
 */
export const GAME_REGISTRY: GameRegistration[] = [
  {
    id: "logica",
    title: GAME_NAMES.logica,
    subtitle: "Raciocínio lógico, sequências e desafios matemáticos",
    icon: <Brain className="h-10 w-10" />,
    gradient: "from-primary to-primary-glow",
    defaultCode: "L1MT26",
    component: LogicGame,
  },
  {
    id: "cartesiano",
    title: GAME_NAMES.cartesiano,
    subtitle: "Coordenadas (X, Y), quadrantes e alvos no plano",
    icon: <Grid className="h-10 w-10" />,
    gradient: "from-accent to-accent-glow",
    defaultCode: "C2PL26",
    component: CartesianGame,
  },
  {
    id: "formas",
    title: GAME_NAMES.formas,
    subtitle: "Arraste formas geométricas por cor, forma e tamanho",
    icon: <Shapes className="h-10 w-10" />,
    gradient: "from-primary-glow to-accent",
    defaultCode: "F3FC26",
    component: ShapeColorGame,
  },
  {
    id: "memoria",
    title: GAME_NAMES.memoria,
    subtitle: "Repita a sequência antes do tempo acabar",
    icon: <Palette className="h-10 w-10" />,
    gradient: "from-primary to-accent-glow",
    defaultCode: "M4CR26",
    component: ColorMemoryGame,
  },
  {
    id: "variaveis",
    title: GAME_NAMES.variaveis,
    subtitle: "Arraste o número certo para resolver a expressão",
    icon: <Variable className="h-10 w-10" />,
    gradient: "from-accent-glow to-primary",
    defaultCode: "V5CV26",
    component: VariableHuntGame,
  },
  {
    id: "robogrid",
    title: GAME_NAMES.robogrid,
    subtitle: "Localização espacial em um tabuleiro colorido",
    icon: <Bot className="h-10 w-10" />,
    gradient: "from-primary to-accent",
    defaultCode: "R6RG26",
    component: RoboGridGame,
  },
  {
    id: "porcentagem",
    title: GAME_NAMES.porcentagem,
    subtitle: "Descubra, represente e complete partes de um todo com porcentagens e frações",
    icon: <Percent className="h-10 w-10" />,
    gradient: "from-primary-glow to-primary",
    defaultCode: "Q9PC26",
    component: PercentGame,
  },
  {
    id: "minado",
    title: GAME_NAMES.minado,
    subtitle: "Vire cartas do tabuleiro 8×8 e responda desafios",
    icon: <Grid3x3 className="h-10 w-10" />,
    gradient: "from-accent to-primary-glow",
    defaultCode: "N7CM26",
    component: MinefieldGame,
  },
  {
    id: "completar",
    title: GAME_NAMES.completar,
    subtitle: "Arraste operadores e digite números para completar a operação",
    icon: <PuzzleIcon className="h-10 w-10" />,
    gradient: "from-accent-glow to-primary-glow",
    defaultCode: "K0CL26",
    component: CompleteLogicGame,
  },
  {
    id: "rpg",
    title: GAME_NAMES.rpg,
    subtitle: "Luta de poder geométrica: empurre o raio azul acertando Verdadeiro ou Falso!",
    icon: <Swords className="h-10 w-10" />,
    gradient: "from-accent to-primary",
    defaultCode: "P8RP26",
    component: RpgGame,
  },
  {
    id: "spacequest",
    title: GAME_NAMES.spacequest,
    subtitle: "Interceptações espaciais: resolva operações lógicas e matemáticas que caem da galáxia!",
    icon: <Rocket className="h-10 w-10" />,
    gradient: "from-indigo-600 via-sky-600 to-purple-600",
    defaultCode: "S4SQ26",
    component: SpaceQuestGame,
  },
];

export function getGameRegistration(id: GameId): GameRegistration | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}

export function getAllRegisteredGameIds(): GameId[] {
  return GAME_REGISTRY.map((g) => g.id);
}
