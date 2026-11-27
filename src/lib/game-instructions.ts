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
    objective: "Desenvolver o raciocínio dedutivo e a agilidade em cálculos mentais e comparações lógicas em 2 minutos.",
    howToPlay: [
      "Uma expressão matemática ou afirmação lógica (V/F, =, <, >) aparece no centro da tela.",
      "Analise a proposição e toque em Verdadeiro (V) ou Falso (F) dentro da rodada de 2:00.",
      "A cada 5 acertos seguidos, você sobe de nível (até o Nível 4), liberando operações avançadas.",
      "Com o bônus ativado, cada acerto adiciona +3s ao cronômetro (até +30s).",
    ],
    controls: "Clique ou toque nos botões [V] (Verdadeiro) ou [F] (Falso).",
    tips: "Atenção redobrada: cada erro custa −10 pontos e aplica uma pausa de 1,5s — evite chutar!",
    scoring: "Acerto: +10 pontos (+3s com bônus) • Erro: −10 pontos • Placar mínimo: 0.",
  },
  cartesiano: {
    objective: "Compreender o sistema de coordenadas bidimensional (X e Y) no primeiro quadrante do plano cartesiano.",
    howToPlay: [
      "Observe o ponto destacado por uma letra no plano cartesiano (malhas 8×8, 10×10 e 15×15).",
      "Leia a posição horizontal (eixo X) e depois a posição vertical (eixo Y) para formar o par ordenado.",
      "Escolha a alternativa correta correspondente à coordenada do ponto em até 2 minutos.",
      "A cada 4 acertos seguidos, você avança de nível (Níveis 1 a 3).",
    ],
    controls: "Clique ou toque na alternativa de coordenada (X, Y) correta abaixo do plano.",
    tips: "Regra de ouro: conte primeiro as colunas na horizontal (X) e só depois suba na vertical (Y).",
    scoring: "Acerto: +10 pontos (+3s com bônus, máx. +30s) • Erro: −5 pontos.",
  },
  formas: {
    objective: "Identificar polígonos, cores, quantidades, tamanhos proporcionais e classificação de figuras geométricas.",
    howToPlay: [
      "Cada fase apresenta um dos 4 desafios: agrupar no cesto, encaixar no molde, ajustar o tamanho (+/−) ou separar em duas áreas.",
      "Arraste e solte as figuras da bandeja conforme o enunciado antes de os 2:00 acabarem.",
      "Conclua 5 desafios seguidos para subir de nível automaticamente.",
    ],
    controls: "Arraste e solte (Drag & Drop) com o mouse ou toque e use [−] / [+] no desafio de tamanho.",
    tips: "No desafio de ajuste de tamanho, você pode redimensionar a figura antes de encaixá-la no contorno exato.",
    scoring: "Questão resolvida: +10 pontos (Nível 5+: +15 pontos) • Erro: −5 pontos • +3s com bônus.",
  },
  memoria: {
    objective: "Fortalecer a memória de trabalho, retenção sequencial audiovisual e concentração progressiva.",
    howToPlay: [
      "Escolha a dificuldade (Fácil: 2 cores, Normal: 3 cores, Difícil: 4 cores) antes de iniciar a rodada de 2:00.",
      "Observe e ouça a sequência em que os botões coloridos acendem.",
      "Repita a sequência na ordem exata; se errar, a mesma sequência é repetida para você tentar de novo.",
      "A cada duas rodadas perfeitas, um novo passo é adicionado à sequência.",
    ],
    controls: "Clique ou toque nos blocos coloridos do painel após o término da demonstração.",
    tips: "Fale mentalmente os nomes das cores em voz alta ou associe o ritmo dos sons durante a exibição.",
    scoring: "Sequência concluída: +10 pontos (+3s com bônus) • Erro: −5 pontos.",
  },
  variaveis: {
    objective: "Introduzir os fundamentos da álgebra calculando números e operadores ocultos em equações.",
    howToPlay: [
      "Uma equação com lacunas (número, variável ou operador) é exibida no centro da tela em rodadas de 2:00.",
      "Descubra qual valor ou sinal valida a igualdade matemática.",
      "Arraste a esfera correta até a caixa indicada. Você começa com 5 vidas e sobe de nível a cada 5 acertos.",
    ],
    controls: "Arraste e solte a esfera numérica ou de operador diretamente na caixa da equação.",
    tips: "Use a operação inversa na sua mente e proteja suas 5 vidas — perder todas encerra a partida.",
    scoring: "Acerto: +10 pontos (+3s com bônus) • Erro: −5 pontos e −1 vida.",
  },
  robogrid: {
    objective: "Exercitar localização espacial, leitura de coordenadas e rastreamento de trajetos em grade 10×10.",
    howToPlay: [
      "Nível 1: clique diretamente na célula do tabuleiro 10×10 (colunas A–J, linhas 1–10) solicitada.",
      "Nível 2: identifique a cor da célula indicada pela coordenada.",
      "Nível 3: acompanhe os passos do robô pela grade e selecione a coordenada final.",
      "Nível 4: desafio misto! 4 acertos seguidos avançam o nível dentro dos 2 minutos.",
    ],
    controls: "Clique nas células da grade (Nível 1), botões de cor (Nível 2) ou coordenadas (Nível 3/4).",
    tips: "Confira primeiro a letra da coluna no topo e depois o número da linha na lateral esquerda.",
    scoring: "Acerto: +10 pontos (+3s com bônus, máx. +30s) • Erro: −5 pontos.",
  },
  porcentagem: {
    objective: "Dominar porcentagens e frações equivalentes com barras visuais, réguas interativas e diagramas de pizza.",
    howToPlay: [
      "Escolha entre o Desafio da Porcentagem (5 níveis) ou o Desafio das Frações (6 níveis) em rodadas de 2:00.",
      "Responda questões de múltipla escolha, deslize barras percentuais ou pinte fatias equivalentes.",
      "Complete 5 questões para avançar ao próximo nível e chegar ao modo misto.",
    ],
    controls: "Toque nas alternativas, nas fatias dos diagramas ou arraste as réguas percentuais de 0% a 100%.",
    tips: "Acerte 5 seguidas para ganhar +10s extras (até +30s no modo bônus); no Torneio Ranqueado o modo oficial é Porcentagem.",
    scoring: "Acerto: +10 pontos (+10s a cada 5 seguidos com bônus) • Erro: −5 pontos.",
  },
  minado: {
    objective: "Estimular o cálculo rápido, geometria, porcentagens e raciocínio lógico em um tabuleiro 8×8 estratégico.",
    howToPlay: [
      "Toque em qualquer uma das 64 casas fechadas do tabuleiro 8×8 (sem tempo total limite de partida).",
      "Casas de desafio abrem uma pergunta com 20 segundos no relógio para responder.",
      "Casas de bônus ou armadilha aplicam imediatamente pontos positivos ou negativos.",
    ],
    controls: "Clique nas casas do tabuleiro para abri-las e selecione a resposta correta em até 20 segundos.",
    tips: "Responda antes dos 20 segundos acabarem para não perder pontos e encerrar a rodada com saldo máximo.",
    scoring: "Desafio correto: +5 pontos • Erro ou tempo esgotado: −3 pontos • Bônus/Armadilhas variados.",
  },
  completar: {
    objective: "Reconstruir igualdades matemáticas preenchendo operadores (+, −, ×, ÷) e números faltantes.",
    howToPlay: [
      "Nível 1: arraste o operador correto • Nível 2: digite o número faltante • Nível 3: ambos • Nível 4: misto.",
      "Preencha os espaços e confirme sua resposta durante a rodada de 2:00.",
      "Feche os 5 desafios de um nível sem erros para ganhar bônus extra de tempo!",
    ],
    controls: "Arraste os blocos de operadores, digite o valor no campo numérico e toque em Confirmar.",
    tips: "Faça a operação inversa para checar o resultado e conquiste níveis perfeitos (5/5) para somar +5s adicionais.",
    scoring: "Acerto: +10 pontos (+3s com bônus) • Erro: −5 pontos • Nível perfeito (5/5): +5s extras.",
  },
  rpg: {
    objective: "Enfrentar 5 robôs desafiantes em duelos de raciocínio rápido respondendo Verdadeiro ou Falso.",
    howToPlay: [
      "Cada acerto empurra a barra azul contra o robô inimigo (+1 dano normal, +10 a +20 pts conforme bônus/combo).",
      "Ao preencher 100% da barra azul, você dispara um Super Raio Triplo causando 3 de dano e pontuação dobrada!",
      "Erros empurram a barra vermelha para o seu lado; se chegar a 100%, você perde 1 dos seus 3 escudos.",
      "Derrote todos os 5 chefes da arena (atenção aos raros Carmesim e Ametista que rendem medalhas!).",
    ],
    controls: "Clique nos botões [V] / [F] ou use o teclado ([V] / Seta Esquerda = Verdadeiro, [F] / Seta Direita = Falso).",
    tips: "Emende sequências de 3+ acertos para ganhar bônus de combo sem perder escudos.",
    scoring: "Acerto: +10× multiplicador + combo • Vitória sobre o chefe: recompensa extra progressiva • Erro: −5 pts.",
  },
  spacequest: {
    objective: "Pilotar a nave estelar, interceptando e resolvendo operações lógicas e matemáticas que descem do espaço sideral.",
    howToPlay: [
      "Operações lógicas e matemáticas descem do topo em direção à base durante 2 minutos (você possui 5 vidas).",
      "Quanto mais difícil for a expressão, mais devagar ela desce; quanto mais fácil, mais rápido.",
      "Selecione a resposta correta no painel de comando da nave antes que a operação atinja a base.",
      "Identifique cápsulas com auras especiais: Azul (Safira 2×), Roxa (Ametista 3×), Vermelha (Rubi 4×) e Dourada (Âmbar 4× sem penalidade)!",
    ],
    controls: "Clique ou toque nas alternativas (V/F ou valores matemáticos) no painel da nave ou use o teclado.",
    tips: "Mantenha combos de 5 acertos (Ampulheta) e 10 acertos (Escudo) para sobreviver e somar +10 pts extras!",
    scoring: "Acerto: +10 pts (ou 2× a 4× com auras) • Erro no laser: −5 pts • Combo x5: +10 pts extras • Queda na base: −5 pts e −1 vida.",
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
