import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createInboxMessage,
  loadAllInboxMessages,
  getInboxMessagesForRecipient,
  getInboxMessagesForPlayer,
  markInboxMessageAsRead,
  markAllInboxMessagesAsReadForRecipient,
  recordDeviceSecurityAlert,
  clearMemoryInboxMessages,
  clearMemoryStudentClaims,
  sendAdminBroadcastMessage,
  claimInboxReward,
  deleteInboxMessageForPlayer,
  getInboxCountsForPlayer,
  getMessageReaders,
  mergeStudentReads,
  mergeStudentClaims,
  formatInboxMessageText,
  runRetroactiveInboxReadsScan,
  extractInboxTags,
  validateMessageTags,
  cancelInboxMessage,
  isMessageCanceled,
  loadCanceledMessageIds,
} from "./inbox-messages.ts";
import type { PlayerProfile } from "./playfab.ts";

function createTestStudent(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "aluno_1",
    nick: "Dede",
    nickNormalized: "dede",
    full_name: "MARCOS ANDRÉ",
    school: "Maria de Nazaré",
    grade: "5º ano",
    birthdate: "2014-06-10",
    xp: 500,
    seasonXp: 500,
    level: 3,
    wins: 10,
    matchesPlayed: 15,
    pointsBalance: 100,
    careerPoints: 250,
    badges: [],
    unlockedMedals: [],
    ...overrides,
  };
}

describe("Sistema Completo de Caixa de Entrada e Correio (inbox-messages)", () => {
  beforeEach(() => {
    clearMemoryInboxMessages();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("cria e recupera mensagens diretas por destinatário", () => {
    createInboxMessage({
      recipientId: "aluno_1",
      sender: "seguranca",
      category: "seguranca_acesso",
      title: "Alerta de teste",
      body: "Conteúdo do teste",
    });

    const student = createTestStudent({ id: "aluno_1" });
    const msgs = getInboxMessagesForPlayer(student);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].title, "Alerta de teste");
    assert.equal(msgs[0].read, false);
  });

  it("transmite mensagem broadcast geral (ALL) para todos os alunos", () => {
    sendAdminBroadcastMessage({
      mode: "all",
      title: "Aviso Geral",
      body: "Para toda a rede SEMED",
    });

    const alunoA = createTestStudent({ id: "aluno_a", school: "Raimundo Bezerra" });
    const alunoB = createTestStudent({ id: "aluno_b", school: "Maria de Nazaré" });

    const msgsA = getInboxMessagesForPlayer(alunoA);
    const msgsB = getInboxMessagesForPlayer(alunoB);

    assert.equal(msgsA.length, 1);
    assert.equal(msgsB.length, 1);
    assert.equal(msgsA[0].title, "Aviso Geral");
  });

  it("filtra transmissão por escola e respeita alunos desmarcados (excluídos)", () => {
    sendAdminBroadcastMessage({
      mode: "school",
      targetSchool: "Raimundo Bezerra",
      excludedStudentIds: ["aluno_desmarcado"],
      title: "Reunião de Pais",
      body: "Aviso exclusivo Raimundo Bezerra",
    });

    const alunoRaimundo = createTestStudent({ id: "aluno_raimundo", school: "Raimundo Bezerra" });
    const alunoOutra = createTestStudent({ id: "aluno_outra", school: "Maria de Nazaré" });
    const alunoDesmarcado = createTestStudent({ id: "aluno_desmarcado", school: "Raimundo Bezerra" });

    const msgsRaimundo = getInboxMessagesForPlayer(alunoRaimundo);
    const msgsOutra = getInboxMessagesForPlayer(alunoOutra);
    const msgsDesmarcado = getInboxMessagesForPlayer(alunoDesmarcado);

    assert.equal(msgsRaimundo.length, 1);
    assert.equal(msgsOutra.length, 0);
    assert.equal(msgsDesmarcado.length, 0);
  });

  it("gerencia recompensas de pontos: concede saldo e carreira", () => {
    const student = createTestStudent({ pointsBalance: 50, careerPoints: 100 });
    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Presente do Professor",
      body: "Receba 75 pontos de incentivo!",
      reward: {
        type: "points",
        pointsAmount: 75,
        isSecret: false,
      },
    });

    const res = claimInboxReward(msg.id, student);
    assert.equal(res.success, true);
    assert.equal(student.pointsBalance, 125);
    assert.equal(student.careerPoints, 175);

    // Impede resgate duplicado
    const resDuplicado = claimInboxReward(msg.id, student);
    assert.equal(resDuplicado.success, false);
    assert.equal(student.pointsBalance, 125);
  });

  it("gerencia recompensas de medalhas", () => {
    const student = createTestStudent({ unlockedMedals: [] });
    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Conquista Especial",
      body: "Você ganhou a medalha do Nível 2",
      reward: {
        type: "medal",
        medalId: "lvl_2",
        isSecret: true,
      },
    });

    const res = claimInboxReward(msg.id, student);
    assert.equal(res.success, true);
    assert.equal(student.unlockedMedals?.length, 1);
    assert.equal(student.unlockedMedals?.[0].medalId, "lvl_2");
  });

  it("impede que o aluno apague uma mensagem com recompensa antes de resgatar", () => {
    const student = createTestStudent();
    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Presente Misterioso",
      body: "Contém recompensa secreta",
      reward: {
        type: "points",
        pointsAmount: 50,
        isSecret: true,
      },
    });

    // Tentativa de apagar antes de resgatar -> DEVE FALHAR
    const delAntes = deleteInboxMessageForPlayer(msg.id, student);
    assert.equal(delAntes.success, false);
    assert.ok(delAntes.error?.includes("resgatar sua recompensa"));

    // Resgatar a recompensa
    claimInboxReward(msg.id, student);

    // Agora deve permitir apagar
    const delDepois = deleteInboxMessageForPlayer(msg.id, student);
    assert.equal(delDepois.success, true);

    // Mensagem não deve mais aparecer na caixa de entrada
    const msgs = getInboxMessagesForPlayer(student);
    assert.equal(msgs.length, 0);
  });

  it("permite apagar mensagem comum (sem recompensa) após leitura", () => {
    const student = createTestStudent();
    const msg = createInboxMessage({
      recipientId: student.id,
      sender: "adm",
      category: "comunicado",
      title: "Aviso simples",
      body: "Sem prêmios",
    });

    markInboxMessageAsRead(msg.id, student.id);
    const del = deleteInboxMessageForPlayer(msg.id, student);
    assert.equal(del.success, true);

    const msgs = getInboxMessagesForPlayer(student);
    assert.equal(msgs.length, 0);
  });

  it("calcula corretamente os contadores de mensagens não lidas e recompensas pendentes", () => {
    const student = createTestStudent();

    // Mensagem 1: sem recompensa, não lida
    createInboxMessage({
      recipientId: student.id,
      sender: "adm",
      category: "comunicado",
      title: "M1",
      body: "B1",
    });

    // Mensagem 2: com recompensa não resgatada
    sendAdminBroadcastMessage({
      mode: "all",
      title: "M2",
      body: "B2",
      reward: { type: "points", pointsAmount: 20, isSecret: false },
    });

    const counts1 = getInboxCountsForPlayer(student);
    assert.equal(counts1.unreadCount, 2);
    assert.equal(counts1.unclaimedRewardsCount, 1);
    assert.equal(counts1.totalAlerts, 3);
  });

  it("rastreia estatísticas de leitura (quem já abriu e quem ainda não abriu) no perfil ADM", () => {
    const s1 = createTestStudent({ id: "st_1", nick: "Lucas", nickNormalized: "lucas" });
    const s2 = createTestStudent({ id: "st_2", nick: "Ana", nickNormalized: "ana" });
    const s3 = createTestStudent({ id: "st_3", nick: "Pedro", nickNormalized: "pedro" });

    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Desafio SEMED",
      body: "Para todos",
      targetStudentIds: [s1.id, s2.id, s3.id],
    });

    // s1 e s2 abrem a mensagem
    markInboxMessageAsRead(msg.id, s1);
    markInboxMessageAsRead(msg.id, s2);

    // s3 ainda não abriu
    const readers = getMessageReaders(msg, [s1, s2, s3]);
    assert.equal(readers.readCount, 2);
    assert.equal(readers.totalTargeted, 3);
    assert.equal(readers.readStudents.length, 2);
    assert.equal(readers.unreadStudents.length, 1);
    assert.equal(readers.unreadStudents[0].nick, "Pedro");
  });

  it("garante que mensagem de transmissão ALL não vaza status lido entre alunos diferentes", () => {
    const s1 = createTestStudent({ id: "st_a", nick: "Zheret", nickNormalized: "zheret" });
    const s2 = createTestStudent({ id: "st_b", nick: "Lord", nickNormalized: "lord" });

    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Transmissão Oficial",
      body: "Para todos os alunos",
    });

    // Inicialmente nenhum leu
    const msgs1Before = getInboxMessagesForPlayer(s1);
    const msgs2Before = getInboxMessagesForPlayer(s2);
    assert.equal(msgs1Before[0].read, false);
    assert.equal(msgs2Before[0].read, false);

    // Zheret abre a mensagem
    markInboxMessageAsRead(msg.id, s1);

    // Zheret vê como lida, mas Lord AINDA vê como não lida
    const msgs1After = getInboxMessagesForPlayer(s1);
    const msgs2After = getInboxMessagesForPlayer(s2);
    assert.equal(msgs1After[0].read, true);
    assert.equal(msgs2After[0].read, false);
  });

  it("resgatar recompensa marca a mensagem como lida e conta em getMessageReaders", () => {
    const s1 = createTestStudent({ id: "st_claim", nick: "Zheret", nickNormalized: "zheret" });

    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Presente",
      body: "Pegue seus pontos",
      reward: { type: "points", pointsAmount: 30, isSecret: false },
    });

    const before = getMessageReaders(msg, [s1]);
    assert.equal(before.readCount, 0);

    // Resgata o prêmio
    claimInboxReward(msg.id, s1);

    const after = getMessageReaders(msg, [s1]);
    assert.equal(after.readCount, 1);
    assert.equal(after.readStudents[0].student.nick, "Zheret");
  });

  it("mergeStudentReads mescla leituras remotas com tolerância a nick, id e pf_local", () => {
    const s1 = createTestStudent({ id: "pf_local_zheret", nick: "ZHERET", nickNormalized: "zheret" });

    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Nuvem PlayFab",
      body: "Testando sinc remota",
    });

    // Simula recibo chegado do PlayFab gravado apenas com nick em minúsculo
    mergeStudentReads([
      {
        studentKey: "zheret",
        messageId: msg.id,
        readAt: "2026-11-07T04:00:00.000Z",
      },
    ]);

    const readers = getMessageReaders(msg, [s1]);
    assert.equal(readers.readCount, 1);
    assert.equal(readers.readStudents[0].student.nick, "ZHERET");
    assert.equal(readers.readStudents[0].readAt, "2026-11-07T04:00:00.000Z");
  });

  it("permite anexar tanto GIFs quanto imagens estáticas (PNG, JPG) com tags [gifX] e [imgX]", () => {
    const student = createTestStudent();
    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Comunicado com Imagens e GIFs",
      body: "Veja o infográfico abaixo:\n[img1]\nE a comemoração:\n[gif1]",
      gifLinks: { gif1: "https://media.tenor.com/test.gif" },
      imageLinks: { img1: "https://exemplo.com/infografico.png" },
    });

    const msgs = getInboxMessagesForPlayer(student);
    assert.equal(msgs.length > 0, true);
    const found = msgs.find((m) => m.id === msg.id);
    assert.ok(found);
    assert.equal(found?.imageLinks?.["img1"], "https://exemplo.com/infografico.png");
    assert.equal(found?.gifLinks?.["gif1"], "https://media.tenor.com/test.gif");
  });

  it("formatInboxMessageText substitui [nick] dinamicamente e [game] pelo nome do jogo", () => {
    const text = "Olá, [nick]! O desafio de hoje no jogo [game] está imperdível!";
    const formatted = formatInboxMessageText(text, {
      playerNick: "SuperAluno",
      mentionedGameId: "rpg",
    });

    assert.equal(formatted, "Olá, SuperAluno! O desafio de hoje no jogo Batalha de Robôs está imperdível!");
  });

  it("formatInboxMessageText substitui [event] dinamicamente pelo título do evento", () => {
    const text = "Atenção [nick], o evento [event] já começou!";
    const formatted = formatInboxMessageText(text, {
      playerNick: "Marcos",
      mentionedEventTitle: "3X de XP do Fim de Semana",
    });

    assert.equal(formatted, "Atenção Marcos, o evento 3X de XP do Fim de Semana já começou!");
  });

  it("sendAdminBroadcastMessage persiste corretamente mentionedEventId e linkEventDetails (true e false)", () => {
    const s1 = createTestStudent();
    
    // Mensagem com link ativo (padrão)
    const msgWithLink = sendAdminBroadcastMessage({
      mode: "all",
      title: "Grande Evento",
      body: "Participe do [event] agora!",
      mentionedEventId: "ev_fds_xp",
      mentionedEventTitle: "3X de XP do Fim de Semana",
      linkEventDetails: true,
    });

    assert.equal(msgWithLink.mentionedEventId, "ev_fds_xp");
    assert.equal(msgWithLink.mentionedEventTitle, "3X de XP do Fim de Semana");
    assert.equal(msgWithLink.linkEventDetails, true);

    // Mensagem sem link (apenas texto em negrito)
    const msgWithoutLink = sendAdminBroadcastMessage({
      mode: "all",
      title: "Grande Evento Informativo",
      body: "Lembre-se do [event] hoje!",
      mentionedEventId: "ev_fds_xp",
      mentionedEventTitle: "3X de XP do Fim de Semana",
      linkEventDetails: false,
    });

    assert.equal(msgWithoutLink.mentionedEventId, "ev_fds_xp");
    assert.equal(msgWithoutLink.linkEventDetails, false);

    const msgs = getInboxMessagesForPlayer(s1);
    const foundWith = msgs.find((m) => m.id === msgWithLink.id);
    const foundWithout = msgs.find((m) => m.id === msgWithoutLink.id);
    assert.equal(foundWith?.linkEventDetails, true);
    assert.equal(foundWithout?.linkEventDetails, false);
  });

  it("runRetroactiveInboxReadsScan reconcilia leituras retroativas de alunos que resgataram recompensa", () => {
    const s1 = createTestStudent({ id: "aluno_retro", nick: "RetroDede" });
    const msg = sendAdminBroadcastMessage({
      mode: "all",
      title: "Prêmio Especial",
      body: "Parabéns [nick], você ganhou pontos!",
      reward: {
        type: "points",
        pointsAmount: 100,
        isSecret: false,
      },
    });

    // O aluno resgatou o prêmio (simulando que abriu e resgatou)
    claimInboxReward(msg.id, s1);

    // Executa a retrobusca
    const scan = runRetroactiveInboxReadsScan([s1]);
    assert.ok(scan.recoveredCount >= 0);

    const readers = getMessageReaders(msg, [s1]);
    assert.equal(readers.readCount, 1);
    assert.equal(readers.readStudents[0].student.nick, "RetroDede");
  });

  describe("Regra de Auto-Purge de Mensagens após 24 horas", () => {
    it("mantém mensagem não lida mesmo após 25 horas", () => {
      const student = createTestStudent({ id: "aluno_purge_1" });
      const msg = createInboxMessage({
        recipientId: "aluno_purge_1",
        sender: "adm",
        category: "comunicado",
        title: "Mensagem Não Lida Antiga",
        body: "Aviso importante",
      });

      const futureTime = Date.now() + 25 * 60 * 60 * 1000;
      const msgs = getInboxMessagesForPlayer(student, futureTime);
      assert.equal(msgs.some((m) => m.id === msg.id), true);
    });

    it("mantém mensagem lida se houver recompensa ainda NÃO resgatada após 25 horas", () => {
      const student = createTestStudent({ id: "aluno_purge_2" });
      const msg = createInboxMessage({
        recipientId: "aluno_purge_2",
        sender: "adm",
        category: "recompensa",
        title: "Recompensa Pendente",
        body: "Resgate seus pontos!",
        reward: {
          type: "points",
          pointsAmount: 50,
          isSecret: false,
        },
      });

      // Aluno leu a mensagem
      markInboxMessageAsRead(msg.id, "aluno_purge_2");

      // 25 horas após a leitura, com prêmio NÃO resgatado
      const futureTime = Date.now() + 25 * 60 * 60 * 1000;
      const msgs = getInboxMessagesForPlayer(student, futureTime);
      assert.equal(msgs.some((m) => m.id === msg.id), true);
    });

    it("apaga automaticamente mensagem lida SEM recompensa após 24 horas", () => {
      const student = createTestStudent({ id: "aluno_purge_3" });
      const msg = createInboxMessage({
        recipientId: "aluno_purge_3",
        sender: "adm",
        category: "comunicado",
        title: "Mensagem Lida sem Prêmio",
        body: "Aviso normal",
      });

      // Aluno leu a mensagem
      markInboxMessageAsRead(msg.id, "aluno_purge_3");

      // 10 horas após a leitura: ainda deve existir
      const tenHoursLater = Date.now() + 10 * 60 * 60 * 1000;
      assert.equal(getInboxMessagesForPlayer(student, tenHoursLater).some((m) => m.id === msg.id), true);

      // 25 horas após a leitura: deve ser automaticamente purgada
      const twentyFiveHoursLater = Date.now() + 25 * 60 * 60 * 1000;
      const msgs = getInboxMessagesForPlayer(student, twentyFiveHoursLater);
      assert.equal(msgs.some((m) => m.id === msg.id), false);
    });

    it("apaga automaticamente mensagem lida COM recompensa resgatada após 24 horas do resgate", () => {
      const student = createTestStudent({ id: "aluno_purge_4" });
      const msg = createInboxMessage({
        recipientId: "aluno_purge_4",
        sender: "adm",
        category: "recompensa",
        title: "Mensagem com Prêmio Resgatado",
        body: "Seus 100 pontos",
        reward: {
          type: "points",
          pointsAmount: 100,
          isSecret: false,
        },
      });

      // Aluno leu e resgatou o prêmio
      markInboxMessageAsRead(msg.id, "aluno_purge_4");
      claimInboxReward(msg.id, student);

      // 12 horas após o resgate: ainda existe
      const twelveHoursLater = Date.now() + 12 * 60 * 60 * 1000;
      assert.equal(getInboxMessagesForPlayer(student, twelveHoursLater).some((m) => m.id === msg.id), true);

      // 25 horas após o resgate: deve ser expurgada
      const twentyFiveHoursLater = Date.now() + 25 * 60 * 60 * 1000;
      const msgs = getInboxMessagesForPlayer(student, twentyFiveHoursLater);
      assert.equal(msgs.some((m) => m.id === msg.id), false);
    });
  });

  describe("Validação Pré-Envio e Tags Dinâmicas Indexadas ([gameX], [eventX], [gifX], [imgX])", () => {
    it("extrai corretamente tags entre colchetes e ignora palavras de texto plano sem colchetes", () => {
      const text = "Atenção [nick]: confira o [game1] e o [game2]. O event de hoje é [event1] com o [gif1] e a [img1]. Apenas game ou event solto sem colchetes não deve ser tag.";
      const extracted = extractInboxTags(text);

      assert.deepEqual(extracted.games.sort(), ["game1", "game2"].sort());
      assert.deepEqual(extracted.events, ["event1"]);
      assert.deepEqual(extracted.gifs, ["gif1"]);
      assert.deepEqual(extracted.imgs, ["img1"]);
    });

    it("bloqueia o envio se o texto contiver tag [game1] mas nenhum jogo foi selecionado para ela", () => {
      const body = "Jogue agora [game1] e vença!";
      const res = validateMessageTags(body, {
        mentionedGames: {},
      });

      assert.equal(res.valid, false);
      assert.match(res.errorMessage || "", /tag \[game1\]/);
    });

    it("bloqueia o envio se o texto contiver tag [event1] mas nenhum evento foi vinculado a ela", () => {
      const body = "Participe do nosso [event1] no fim de semana!";
      const res = validateMessageTags(body, {
        mentionedEvents: {},
      });

      assert.equal(res.valid, false);
      assert.match(res.errorMessage || "", /tag \[event1\]/);
    });

    it("bloqueia o envio se o texto contiver tag [gif1] ou [img1] sem URL válida preenchida", () => {
      const bodyGif = "Veja a animação: [gif1]";
      const resGif = validateMessageTags(bodyGif, {
        gifLinks: {},
      });
      assert.equal(resGif.valid, false);
      assert.match(resGif.errorMessage || "", /tag \[gif1\]/);

      const bodyImg = "Veja a imagem: [img1]";
      const resImg = validateMessageTags(bodyImg, {
        imageLinks: { img1: "   " },
      });
      assert.equal(resImg.valid, false);
      assert.match(resImg.errorMessage || "", /tag \[img1\]/);
    });

    it("aprova o envio quando todas as tags adicionadas ao texto estiverem devidamente atribuídas", () => {
      const body = "Olá [nick], jogue [game1] durante o [event1] e veja [gif1] e [img1]!";
      const res = validateMessageTags(body, {
        mentionedGames: { game1: "velha" },
        mentionedEvents: { event1: { eventId: "ev_123" } },
        gifLinks: { gif1: "https://example.com/anim.gif" },
        imageLinks: { img1: "https://example.com/banner.png" },
      });

      assert.equal(res.valid, true);
      assert.equal(res.errorMessage, undefined);
    });

    it("formata tags dinâmicas indexadas [game1], [game2] e [event1] com títulos correspondentes", () => {
      const body = "Jogue [game1] e depois [game2] no [event1]!";
      const formatted = formatInboxMessageText(body, {
        mentionedGames: {
          game1: "rpg",
          game2: "memoria",
        },
        mentionedEvents: {
          event1: { eventTitle: "Torneio Relâmpago" },
        },
      });

      assert.equal(formatted, "Jogue Batalha de Robôs e depois Memória das Cores no Torneio Relâmpago!");
    });

    it("formata com includeEmoji, aliases [aluno]/[nick] e fallback seguro quando [game1] usa mentionedGameId", () => {
      const body = "[aluno], venha testar nosso novo jogo: [game1] no evento [event1]!";
      const formatted = formatInboxMessageText(body, {
        playerNick: "JOSINEY",
        mentionedGameId: "space_quest",
        mentionedEventTitle: "Festival Cósmico",
        includeEmoji: true,
      });

      assert.equal(formatted, "JOSINEY, venha testar nosso novo jogo: 🎮 Space Quest no evento ✨ Festival Cósmico!");
    });

    it("extrai e valida tags de mídia unificadas sem número [gif] e [img]", () => {
      const body = "Venha jogar [game1]! [gif] e [img]";
      const tags = extractInboxTags(body);
      assert.deepEqual(tags.gifs, ["gif"]);
      assert.deepEqual(tags.imgs, ["img"]);
      assert.deepEqual(tags.games, ["game1"]);

      const validRes = validateMessageTags(body, {
        mentionedGames: { game1: "space_quest" },
        gifLinks: { gif: "https://example.com/dance.gif" },
        imageLinks: { img: "https://example.com/banner.png" },
      });
      assert.equal(validRes.valid, true);

      const invalidRes = validateMessageTags(body, {
        mentionedGames: { game1: "space_quest" },
        gifLinks: {},
        imageLinks: { img: "https://example.com/banner.png" },
      });
      assert.equal(invalidRes.valid, false);
      assert.match(invalidRes.errorMessage || "", /\[gif\]/);
    });
  });

  describe("Prevenção de Resgate Duplo Cross-Device e Deduplicação de Leitores", () => {
    it("impede que o mesmo presente seja resgatado duas vezes entre múltiplos dispositivos (cross-device)", () => {
      clearMemoryInboxMessages();
      const student = createTestStudent({
        id: "aluno_cross_1",
        nick: "Piloto1",
        nickNormalized: "piloto1",
        pointsBalance: 10,
        careerPoints: 10,
        claimedInboxRewardIds: [],
      });

      const msg = sendAdminBroadcastMessage({
        mode: "all",
        title: "Presente de Boas-Vindas",
        body: "Receba 50 pontos!",
        reward: {
          type: "points",
          pointsAmount: 50,
          isSecret: false,
        },
      });

      // 1. Resgate no Dispositivo A: deve ter sucesso
      const resA = claimInboxReward(msg.id, student);
      assert.equal(resA.success, true);
      assert.equal(student.pointsBalance, 60);
      assert.equal(student.careerPoints, 60);
      assert.ok(student.claimedInboxRewardIds?.includes(msg.id));

      // 2. Simula Dispositivo B: memória local de claims zerada (sem claims locais no aparelho),
      // mas perfil sincronizado vindo da nuvem com claimedInboxRewardIds
      clearMemoryStudentClaims();
      const deviceBStudent: PlayerProfile = {
        ...student,
        id: "pf_cloud_piloto1", // ID da nuvem no segundo dispositivo
        nick: "Piloto1",
        nickNormalized: "piloto1",
      };

      // As mensagens na tela do dispositivo B já devem aparecer como "claimed: true"
      const msgsDeviceB = getInboxMessagesForPlayer(deviceBStudent);
      const msgOnDeviceB = msgsDeviceB.find((m) => m.id === msg.id);
      assert.ok(msgOnDeviceB?.reward);
      assert.equal(msgOnDeviceB?.reward?.claimed, true);

      // Tentativa de resgate no Dispositivo B deve ser rigorosamente bloqueada!
      const resB = claimInboxReward(msg.id, deviceBStudent);
      assert.equal(resB.success, false);
      assert.match(resB.error || "", /já foi resgatada/);
      assert.equal(deviceBStudent.pointsBalance, 60); // Saldo inalterado!

      // 3. Simula mesclagem de claims remotos da nuvem
      mergeStudentClaims([
        { studentKey: "piloto1", messageId: msg.id, claimedAt: new Date().toISOString() },
      ]);
      const resBAfterSync = claimInboxReward(msg.id, deviceBStudent);
      assert.equal(resBAfterSync.success, false);
    });

    it("getMessageReaders nunca duplica um aluno mesmo que ele conste múltiplas vezes na lista", () => {
      clearMemoryInboxMessages();
      const studentA1 = createTestStudent({
        id: "pf_local_douglas",
        nick: "Douglas",
        nickNormalized: "douglas",
        school: "Escola Municipal Ayrton Senna",
      });
      const studentA2 = createTestStudent({
        id: "E7A819C20DB",
        nick: "Douglas",
        nickNormalized: "douglas",
        school: "Escola Municipal Ayrton Senna",
      });
      const studentB = createTestStudent({
        id: "aluno_outro",
        nick: "OutroAluno",
        nickNormalized: "outroaluno",
        school: "Escola Municipal Ayrton Senna",
      });

      const msg = sendAdminBroadcastMessage({
        mode: "all",
        title: "Aviso de Teste",
        body: "Mensagem para todos",
        reward: {
          type: "points",
          pointsAmount: 20,
          isSecret: false,
        },
      });

      // Douglas lê e resgata a recompensa
      claimInboxReward(msg.id, studentA1);

      // Passa uma lista com Douglas DUPLICADO (como ocorria quando existia entrada local e cloud)
      const readers = getMessageReaders(msg, [studentA1, studentA2, studentB]);

      // Total de elegíveis deve ser 2 (Douglas e OutroAluno), nunca 3!
      assert.equal(readers.totalTargeted, 2);
      // Apenas Douglas abriu
      assert.equal(readers.readCount, 1);
      assert.equal(readers.readStudents.length, 1);
      assert.equal(readers.readStudents[0].student.nick, "Douglas");
      assert.equal(readers.readStudents[0].hasClaimedReward, true);

      // Outro aluno consta como não lido (1 aluno pendente)
      assert.equal(readers.unreadStudents.length, 1);
      assert.equal(readers.unreadStudents[0].nick, "OutroAluno");
    });
  });

  describe("Cancelamento de envio de mensagens no perfil ADM", () => {
    it("cancela envio de mensagem específica e remove da caixa de correio dos alunos", () => {
      const student1 = createTestStudent({ id: "aluno_1", nick: "Lucas" });
      const student2 = createTestStudent({ id: "aluno_2", nick: "Beatriz" });

      const msg = sendAdminBroadcastMessage({
        mode: "all",
        title: "Torneio Especial de Fim de Semana",
        body: "Venham todos participar!",
        reward: {
          type: "points",
          pointsAmount: 50,
          isSecret: false,
        },
      });

      // Antes do cancelamento: ambos os alunos recebem a mensagem
      const msgs1Before = getInboxMessagesForPlayer(student1);
      const msgs2Before = getInboxMessagesForPlayer(student2);
      assert.equal(msgs1Before.some((m) => m.id === msg.id), true);
      assert.equal(msgs2Before.some((m) => m.id === msg.id), true);

      // Contagem de não lidos e recompensas
      const countsBefore = getInboxCountsForPlayer(student1);
      assert.equal(countsBefore.unreadCount >= 1, true);
      assert.equal(countsBefore.unclaimedRewardsCount >= 1, true);

      // ADM cancela o envio da mensagem
      const cancelRes = cancelInboxMessage(msg.id);
      assert.equal(cancelRes.success, true);
      assert.equal(cancelRes.canceledMessage?.id, msg.id);
      assert.equal(isMessageCanceled(msg.id), true);
      assert.equal(loadCanceledMessageIds().has(msg.id), true);

      // Após o cancelamento: a mensagem sumiu da caixa de entrada de ambos os alunos
      const msgs1After = getInboxMessagesForPlayer(student1);
      const msgs2After = getInboxMessagesForPlayer(student2);
      assert.equal(msgs1After.some((m) => m.id === msg.id), false);
      assert.equal(msgs2After.some((m) => m.id === msg.id), false);

      // Também não aparece no repositório global de mensagens ativas
      const allActive = loadAllInboxMessages();
      assert.equal(allActive.some((m) => m.id === msg.id), false);

      // Contagem de alertas do jogador é reduzida
      const countsAfter = getInboxCountsForPlayer(student1);
      assert.equal(countsAfter.unreadCount, countsBefore.unreadCount - 1);
      assert.equal(countsAfter.unclaimedRewardsCount, countsBefore.unclaimedRewardsCount - 1);
    });
  });
});
