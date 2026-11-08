import type { GameId } from "./game-storage";

export interface GameInstruction {
  objective: string;
  howToPlay: string[];
  controls: string;
  tips: string;
  scoring: string;
}

export const GAME_INSTRUCTIONS: Record<GameId, GameInstruction> = {
  logica: {
    objective: "Desenvolver o raciocínio dedutivo e a agilidade em cálculos mentais e comparações lógicas.",
    howToPlay: [
      "Uma expressão matemática ou desafio lógico será apresentado no centro da tela.",
      "Analise rapidamente a afirmação antes que o tempo esgote.",
      "Indique se a proposição é Verdadeira (V) ou Falsa (F).",
      "Cada acerto aumenta o seu nível de dificuldade e o multiplicador de pontos.",
    ],
    controls: "Clique ou toque nos botões [V] / [F] ou utilize o teclado para respostas rápidas.",
    tips: "Mantenha a calma e preste atenção aos sinais de maior (>), menor (<) e igualdade (=).",
    scoring: "Acerto: +10 pontos • Erro: -5 pontos • Bônus de sequência consecutiva.",
  },
  cartesiano: {
    objective: "Compreender o sistema de coordenadas bidimensional, eixos X (abscissas) e Y (ordenadas) e quadrantes.",
    howToPlay: [
      "Observe as coordenadas solicitadas na tela (ex: (3, -2)).",
      "Localize a interseção correta na malha quadriculada do plano.",
      "Toque ou clique no ponto correspondente para registrar o alvo.",
      "Em níveis avançados, capture alvos em movimento e identifique quadrantes.",
    ],
    controls: "Clique ou toque diretamente na malha do plano cartesiano.",
    tips: "Lembre-se da regra de ouro: primeiro ande na horizontal (X), depois suba ou desça na vertical (Y).",
    scoring: "+15 pontos por alvo localizado com precisão • Bônus de rapidez.",
  },
  formas: {
    objective: "Identificar propriedades de polígonos, contagem de lados, cores primárias/secundárias e classificação dimensional.",
    howToPlay: [
      "Observe a regra solicitada na rodada (por exemplo: 'Apenas polígonos azuis de 4 lados').",
      "Arraste as figuras geométricas que atendem à regra para dentro do cesto correspondente.",
      "Separe todas as formas antes que o tempo limite expire.",
    ],
    controls: "Arraste e solte (Drag & Drop) com o mouse ou toque arrastando na tela do celular.",
    tips: "Verifique tanto a cor quanto o número de vértices/lados das figuras solicitadas.",
    scoring: "+10 pontos por forma classificada corretamente • Penalidade por forma incorreta.",
  },
  memoria: {
    objective: "Fortalecer a memória de trabalho, retenção sequencial e velocidade de resposta reflexiva.",
    howToPlay: [
      "Observe a ordem em que as cores se iluminam e emitem sons.",
      "Aguarde o sinal para iniciar a sua vez.",
      "Repita a sequência exata de cores clicando nelas na ordem demonstrada.",
      "A cada rodada concluída com sucesso, um novo passo é adicionado à sequência.",
    ],
    controls: "Clique ou toque nas cores que compõem o painel.",
    tips: "Fale mentalmente o nome das cores em voz alta enquanto o padrão estiver sendo executado.",
    scoring: "Pontuação progressiva a cada rodada memorizada com perfeição.",
  },
  variaveis: {
    objective: "Introduzir os fundamentos da álgebra e a resolução de equações com incógnitas e incógnitas ocultas.",
    howToPlay: [
      "Uma equação matemática é apresentada com uma letra ou símbolo oculto (ex: x + 7 = 15).",
      "Calcule mentalmente qual valor substitui a incógnita mantendo a igualdade matemática.",
      "Arraste o bloco numérico correto até o espaço da variável.",
    ],
    controls: "Arraste o número correto ou toque nele para preencher a variável na equação.",
    tips: "Utilize a operação inversa para isolar a incógnita na sua mente.",
    scoring: "+15 pontos por equação resolvida • Bônus por acerto consecutivo sem erros.",
  },
  robogrid: {
    objective: "Exercitar o pensamento computacional, algoritmos sequenciais e orientação espacial matricial.",
    howToPlay: [
      "Analise a posição do robô e o destino final no tabuleiro quadriculado.",
      "Mantenha atenção redobrada aos obstáculos e armadilhas distribuídos no percurso.",
      "Envie comandos sequenciais (Avançar, Girar para a Esquerda, Girar para a Direita) para que o robô chegue ao objetivo.",
    ],
    controls: "Utilize os botões de controle na tela ou as setas do teclado.",
    tips: "Planeje o trajeto mentalmente antes de executar os movimentos do robô.",
    scoring: "+20 pontos por missão completada • Bônus pelo menor número de movimentos.",
  },
  porcentagem: {
    objective: "Dominar o cálculo de porcentagens, frações equivalentes e aplicações práticas do cotidiano.",
    howToPlay: [
      "Leia o problema ou observe a barra visual representativa.",
      "Identifique a relação entre a parte e o todo (10%, 25%, 50%, 75% ou 100%).",
      "Preencha o valor correto ou ajuste a barra fracionária até atingir a porcentagem solicitada.",
    ],
    controls: "Ajuste os seletores ou clique nos botões numéricos na tela.",
    tips: "10% equivale a dividir por 10; 50% equivale à metade; 25% equivale à metade da metade.",
    scoring: "+10 a +25 pontos dependendo da complexidade do cálculo percentual.",
  },
  minado: {
    objective: "Estimular o raciocínio dedutivo, cálculo de probabilidades e operações matemáticas sob desafio.",
    howToPlay: [
      "O tabuleiro 8×8 contém casas misteriosas.",
      "Clique para desvendar uma casa. Ao abrir uma pergunta matemática, resolva-a corretamente.",
      "Cuidado com os desafios de risco que podem custar vidas caso você erre o cálculo!",
    ],
    controls: "Clique ou toque nas células do tabuleiro para abri-las.",
    tips: "Analise a proximidade das casas já reveladas e responda com atenção para não perder pontos.",
    scoring: "+10 pontos por desafio matemático correto • Bônus ao limpar zonas estratégicas.",
  },
  completar: {
    objective: "Reconstruir sentenças matemáticas abertas, trabalhando com operadores aritméticos e propriedades numéricas.",
    howToPlay: [
      "Uma expressão matemática é exibida com lacunas nos operadores (+, -, ×, ÷) ou nos números.",
      "Analise o resultado final da igualdade.",
      "Arraste e solte os símbolos e algarismos corretos nas lacunas para validar a operação.",
    ],
    controls: "Arraste e solte operadores e algarismos diretamente nos espaços vazios.",
    tips: "Preste atenção na ordem de precedência das operações: multiplicações e divisões primeiro!",
    scoring: "+15 pontos por igualdade montada corretamente • Bônus de agilidade.",
  },
  rpg: {
    objective: "Participar de duelos matemáticos interativos aplicando raciocínio rápido para derrotar adversários robóticos.",
    howToPlay: [
      "Desafios matemáticos e geométricos de Verdadeiro ou Falso surgem em tempo real.",
      "Cada resposta correta empurra o feixe de energia azul contra o robô oponente.",
      "Erros empurram a barra vermelha na sua direção. Ao preencher a barra totalmente, um Super Golpe é disparado!",
    ],
    controls: "Toque nos botões Verdadeiro [V] ou Falso [F] com agilidade máxima.",
    tips: "Velocidade e precisão são essenciais: não chute respostas para não sofrer contra-ataques.",
    scoring: "XP por vitória e bônus de duelo conforme o nível de maestria alcançado.",
  },
  spacequest: {
    objective: "Pilotar a nave estelar, interceptando e resolvendo operações lógicas e matemáticas que descem do espaço sideral.",
    howToPlay: [
      "Operações lógicas e matemáticas descem do topo em direção à base.",
      "Quanto mais difícil for a expressão, mais devagar ela desce; quanto mais fácil, mais rápido.",
      "Selecione a resposta correta no painel de comando da nave antes que a operação atinja a parte inferior.",
      "Identifique cápsulas com auras especiais: Azul (Safira 2x), Roxa (Ametista 3x), Vermelha (Rubi 4x) e Dourada (Âmbar 4x sem penalidade) para desbloquear medalhas cósmicas!",
    ],
    controls: "Clique ou toque nas alternativas (V/F ou valores matemáticos) no painel da nave ou use o teclado.",
    tips: "Mantenha combos de 5 acertos seguidos para somar +10 pontos extras e priorize questões com auras raras!",
    scoring: "Acerto: +10 pts (ou 2x a 4x com auras) • Erro no laser: -5 pts (ou penalidade da aura) • Combo x5: +10 pts extras • Queda na barreira: -5 pts e -1 vida.",
  },
};

export function getGameInstructions(gameId: GameId): GameInstruction {
  return (
    GAME_INSTRUCTIONS[gameId] ?? {
      objective: "Resolver os desafios matemáticos e acumular pontos na plataforma.",
      howToPlay: ["Siga as instruções exibidas na tela e vença o desafio!"],
      controls: "Interaja utilizando o mouse, toque na tela ou teclado.",
      tips: "Concentre-se e pense antes de confirmar cada resposta.",
      scoring: "Pontuação por acertos e bônus por desafios completados.",
    }
  );
}
