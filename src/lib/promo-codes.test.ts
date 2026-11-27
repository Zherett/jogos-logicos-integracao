import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  archiveOldClaimedPromoCodes,
  generateSingleCode,
  generatePromoCodesBatch,
  inspectPromoCode,
  claimPromoCode,
  deletePromoCode,
  canAccessPromoCodeRedeem,
  checkStudentPromoRateLimit,
  resetStudentPromoFailedAttempts,
  loadLocalPromoCodes,
  saveLocalPromoCodes,
  normalizePromoCodeInput,
  mergePromoCatalogs,
  type PromoCodePattern,
} from "./promo-codes.ts";
import { getPlayerScoreLedger } from "./score-history-ledger.ts";
import { DEFAULT_AVATARS } from "./cosmetics-catalog.ts";
import { calculateDuplicateCosmeticCompensation } from "./chests-catalog.ts";

describe("Sistema de Códigos Promocionais e QR Codes (promo-codes)", () => {
  beforeEach(() => {
    saveLocalPromoCodes([]);
    resetStudentPromoFailedAttempts("zheret");
    resetStudentPromoFailedAttempts("aluno_comum");
  });

  it("gera códigos conformes aos 6 padrões de máscara de alta entropia", () => {
    const patterns: PromoCodePattern[] = [
      "padrao_1",
      "padrao_2",
      "padrao_3",
      "padrao_4",
      "padrao_5",
      "padrao_6",
    ];

    for (const pat of patterns) {
      const code = generateSingleCode(pat);
      assert.ok(code.includes("-"), `Código do ${pat} deve conter hífen`);
      const parts = code.split("-");
      assert.equal(parts.length, 2, `Código ${pat} deve ter 2 partes separadas por hífen`);

      if (pat === "padrao_1") {
        // LNNNL-LNNNL -> 5 chars - 5 chars
        assert.equal(parts[0].length, 5);
        assert.equal(parts[1].length, 5);
      } else if (pat === "padrao_2" || pat === "padrao_3" || pat === "padrao_4" || pat === "padrao_5") {
        // 4 chars - 4 chars
        assert.equal(parts[0].length, 4);
        assert.equal(parts[1].length, 4);
      } else if (pat === "padrao_6") {
        // LNLNLN-LNLN -> 6 chars - 4 chars
        assert.equal(parts[0].length, 6);
        assert.equal(parts[1].length, 4);
      }
    }
  });

  it("gera lote de códigos únicos sem colisões", () => {
    const batch = generatePromoCodesBatch({
      count: 20,
      pattern: "padrao_1",
      rewards: { xp: 50, points: 25 },
      batchName: "Gincana de Lógica",
      createdBy: "admin_test",
    });

    assert.equal(batch.length, 20);
    const codesSet = new Set(batch.map((b) => b.code));
    assert.equal(codesSet.size, 20, "Todos os 20 códigos gerados devem ser únicos");
  });

  it("aplica hard delete para códigos ativos e soft delete para códigos já resgatados", () => {
    const batch = generatePromoCodesBatch({
      count: 2,
      pattern: "padrao_2",
      rewards: { xp: 100, points: 50 },
      batchName: "Lote Teste",
      createdBy: "admin",
    });

    const codeActive = batch[0];
    const codeClaimed = batch[1];

    // Resgata o segundo código
    const mockStudent = { id: "stu_zheret", nick: "Zheret", full_name: "Zheret Tester" } as any;
    const claimRes = claimPromoCode(codeClaimed.code, mockStudent);
    assert.ok(claimRes.success);

    // 1. Deletar código ativo -> Hard Delete (remove da lista)
    const delActive = deletePromoCode(codeActive.id);
    assert.equal(delActive.mode, "hard_deleted");
    const listAfter1 = loadLocalPromoCodes();
    assert.ok(!listAfter1.some((c) => c.id === codeActive.id));

    // 2. Deletar código resgatado -> Soft Delete (permanece com hiddenForAdmin: true)
    const delClaimed = deletePromoCode(codeClaimed.id);
    assert.equal(delClaimed.mode, "soft_deleted");
    const listAfter2 = loadLocalPromoCodes();
    const foundClaimed = listAfter2.find((c) => c.id === codeClaimed.id);
    assert.ok(foundClaimed);
    assert.equal(foundClaimed?.hiddenForAdmin, true, "Código resgatado deve ficar oculto para ADM");
  });

  it("protege contra ataques de força bruta com rate limiting adaptativo", () => {
    const studentId = "aluno_curioso";

    // Simula 3 tentativas com códigos inexistentes
    for (let i = 0; i < 3; i++) {
      const inspect = inspectPromoCode(`FAKECODE${i}`, studentId);
      assert.equal(inspect.valid, false);
    }

    // Na 3ª falha, ativa o cooldown
    const rateCheck = checkStudentPromoRateLimit(studentId);
    assert.ok(rateCheck.blocked, "Aluno deve entrar em cooldown temporário");
    assert.ok(rateCheck.remainingSeconds > 0);

    // Próxima tentativa deve retornar rate_limited
    const inspectBlocked = inspectPromoCode("OUTROCODIGO", studentId);
    assert.equal(inspectBlocked.status, "rate_limited");
  });

  it("executa o fluxo de 2 etapas: inspeção prévia da recompensa e resgate atômico", () => {
    const batch = generatePromoCodesBatch({
      count: 1,
      pattern: "padrao_4",
      rewards: { xp: 150, points: 75, chestName: "Baú de Lógica Quântica", chestQuantity: 1 },
      batchName: "Evento Especial",
      createdBy: "adm",
    });
    const targetCode = batch[0].code;

    // Etapa 1: Inspeciona prévia
    const inspect = inspectPromoCode(targetCode, "zheret");
    assert.equal(inspect.valid, true);
    assert.equal(inspect.status, "active");
    assert.equal(inspect.rewards?.xp, 150);
    assert.equal(inspect.rewards?.points, 75);

    // O código ainda não foi consumido
    const listBefore = loadLocalPromoCodes();
    assert.equal(listBefore[0].status, "active");

    // Etapa 2: Confirma resgate
    const mockStudent = {
      id: "stu_zheret",
      nick: "zheret",
      full_name: "Zheret Admin",
      xp: 100,
      careerPoints: 200,
    } as any;

    const claim = claimPromoCode(targetCode, mockStudent);
    assert.equal(claim.success, true);
    assert.equal(mockStudent.xp, 250, "XP deve ter sido incrementado (+150)");
    assert.equal(mockStudent.careerPoints, 275, "Pontos devem ter sido incrementados (+75)");

    // Tentar resgatar de novo deve falhar
    const claimAgain = claimPromoCode(targetCode, mockStudent);
    assert.equal(claimAgain.success, false);
    assert.equal(claimAgain.errorMessage, "Código inválido ou já resgatado.");
  });

  it("libera a função de resgate para todos os alunos autenticados e bloqueia sessões nulas", () => {
    const alunoComum = { id: "stu_marcos", nick: "marcos_silva" } as any;
    const alunoBanana = { id: "stu_banana", nick: "banana123" } as any;
    const testerZheret = { id: "stu_zheret", nick: "Zheret" } as any;
    const adminSemId = { isAdmin: true } as any;
    const vazio = {} as any;

    assert.equal(canAccessPromoCodeRedeem(null), false, "Sem perfil não pode acessar");
    assert.equal(canAccessPromoCodeRedeem(vazio), false, "Perfil vazio sem id/nick não pode acessar");
    assert.equal(canAccessPromoCodeRedeem(alunoComum), true, "Aluno comum autenticado deve ter acesso liberado");
    assert.equal(canAccessPromoCodeRedeem(alunoBanana), true, "Qualquer aluno autenticado deve ter acesso liberado");
    assert.equal(canAccessPromoCodeRedeem(testerZheret), true, "Zheret deve ter acesso liberado");
    assert.equal(canAccessPromoCodeRedeem(adminSemId), true, "Admin deve ter acesso liberado");
  });

  it("respeita a trava de lote: impede múltiplos resgates quando allowMultiplePerStudent for false", () => {
    // Cria lote com allowMultiplePerStudent: false (padrão)
    const batch = generatePromoCodesBatch({
      count: 2,
      pattern: "padrao_3",
      rewards: { xp: 50, points: 20 },
      batchName: "Gincana 1x por Aluno",
      createdBy: "adm",
      allowMultiplePerStudent: false,
    });

    const code1 = batch[0].code;
    const code2 = batch[1].code;

    const studentA = { id: "stu_aluno_a", nick: "AlunoA", xp: 0, careerPoints: 0 } as any;
    const studentB = { id: "stu_aluno_b", nick: "AlunoB", xp: 0, careerPoints: 0 } as any;

    // Aluno A resgata o primeiro código com sucesso
    const claim1 = claimPromoCode(code1, studentA);
    assert.equal(claim1.success, true);

    // Aluno A tenta inspecionar e resgatar o segundo código DO MESMO LOTE -> Deve ser bloqueado!
    const inspect2 = inspectPromoCode(code2, studentA.id);
    assert.equal(inspect2.valid, false);
    assert.equal(inspect2.status, "already_claimed");
    assert.ok(inspect2.errorMessage?.includes("mesma leva"), "Deve informar que já resgatou código desta leva");

    const claim2 = claimPromoCode(code2, studentA);
    assert.equal(claim2.success, false);
    assert.ok(claim2.errorMessage?.includes("mesma leva"));

    // Aluno B (outro aluno) DEVE conseguir resgatar o segundo código normalmente
    const claimB = claimPromoCode(code2, studentB);
    assert.equal(claimB.success, true);
  });

  it("permite múltiplos resgates da mesma leva quando allowMultiplePerStudent for true", () => {
    // Cria lote com allowMultiplePerStudent: true
    const batch = generatePromoCodesBatch({
      count: 2,
      pattern: "padrao_5",
      rewards: { xp: 10, points: 5 },
      batchName: "Lote Múltiplo Liberado",
      createdBy: "adm",
      allowMultiplePerStudent: true,
    });

    const code1 = batch[0].code;
    const code2 = batch[1].code;

    const student = { id: "stu_zheret", nick: "Zheret", xp: 0, careerPoints: 0 } as any;

    const claim1 = claimPromoCode(code1, student);
    assert.equal(claim1.success, true);

    // Como allowMultiplePerStudent é true, o mesmo aluno PODE resgatar o segundo código
    const inspect2 = inspectPromoCode(code2, student.id);
    assert.equal(inspect2.valid, true);

    const claim2 = claimPromoCode(code2, student);
    assert.equal(claim2.success, true);
    assert.equal(student.xp, 20);
    assert.equal(student.careerPoints, 10);
  });

  it("impede que códigos excluídos voltem no merge da nuvem (tombstones) e preserva soft delete", () => {
    const nowIso = new Date().toISOString();
    const deletedActive = {
      id: "promo_del_1",
      code: "TEST-1111-AAAA",
      cleanCode: "TEST1111AAAA",
      pattern: "padrao_1" as const,
      batchId: "b1",
      batchName: "Teste",
      status: "active" as const,
      rewards: { xp: 10, points: 5 },
      createdAt: nowIso,
      createdBy: "admin",
    };
    const claimedCloud = {
      id: "promo_claim_1",
      code: "TEST-2222-BBBB",
      cleanCode: "TEST2222BBBB",
      pattern: "padrao_1" as const,
      batchId: "b1",
      batchName: "Teste",
      status: "claimed" as const,
      rewards: { xp: 10, points: 5 },
      createdAt: nowIso,
      createdBy: "admin",
    };
    const claimedLocalHidden = { ...claimedCloud, hiddenForAdmin: true };

    const merged = mergePromoCatalogs(
      [deletedActive, claimedCloud],
      [claimedLocalHidden],
      new Set(["TEST1111AAAA"]),
    );

    assert.equal(merged.some((c) => c.cleanCode === "TEST1111AAAA"), false, "Código na tombstone não pode voltar");
    const kept = merged.find((c) => c.cleanCode === "TEST2222BBBB");
    assert.ok(kept);
    assert.equal(kept.hiddenForAdmin, true, "Soft delete local (hiddenForAdmin) deve ser preservado no merge");
  });

  it("Bloco 1.3 (ECON-08/ECON-10/ECON-21): preserva pendingCloudSync >15s, valida perfil no inspect, não duplica ledger, aceita avatarPieceId e compensa cosmético", () => {
    const oldCreated = new Date(Date.now() - 60_000).toISOString();
    const pendingItem = {
      id: "promo_pending_1",
      code: "TEST-3333-CCCC",
      cleanCode: "TEST3333CCCC",
      pattern: "padrao_1" as const,
      batchId: "b_pend",
      batchName: "Lote Lento",
      status: "active" as const,
      rewards: { xp: 10, points: 5 },
      createdAt: oldCreated,
      createdBy: "admin",
      pendingCloudSync: true,
    };
    const staleWithoutFlag = { ...pendingItem, id: "promo_stale", code: "TEST-4444-DDDD", cleanCode: "TEST4444DDDD", pendingCloudSync: false };
    const merged = mergePromoCatalogs([], [pendingItem, staleWithoutFlag], new Set(), Date.now());
    assert.equal(merged.some((c) => c.cleanCode === "TEST3333CCCC"), true, "pendingCloudSync preserva após >15s");
    assert.equal(merged.some((c) => c.cleanCode === "TEST4444DDDD"), false, "Sem pendingCloudSync e >15s deve expirar");

    const paidAvatar = DEFAULT_AVATARS.find((a) => a.priceCoins > 0)!;
    const batch = generatePromoCodesBatch({
      count: 2,
      pattern: "padrao_1",
      allowMultiplePerStudent: false,
      batchName: "Lote Cosmético",
      createdBy: "adm",
      rewards: { xp: 0, points: 60, avatarPieceId: paidAvatar.id },
    });

    const pId = `stu_promo_cosm_${Date.now()}`;
    const student: any = {
      id: pId,
      nick: "PromoCosm",
      nickNormalized: "promocosm",
      xp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      unlockedAvatars: [paidAvatar.id],
    };

    const claim = claimPromoCode(batch[0].code, student);
    assert.equal(claim.success, true);
    assert.equal(student.careerPoints, 60);
    assert.equal(student.coins, calculateDuplicateCosmeticCompensation(paidAvatar.priceCoins));

    // Não deve haver lançamento duplicado de pontos no ledger
    const ptsEntries = getPlayerScoreLedger(pId, { type: "career_points" });
    assert.equal(ptsEntries.length, 1);
    assert.equal(ptsEntries[0].source, "codigo_promocional");
    assert.equal(ptsEntries[0].amount, 60);

    // Inspect cross-device rejeita mesmo se perfil já tiver código/lote no histórico
    const inspectCode = inspectPromoCode(batch[0].code, student.id, student);
    assert.equal(inspectCode.valid, false);
    assert.equal(inspectCode.status, "already_claimed");
    const inspectBatch = inspectPromoCode(batch[1].code, student.id, {
      claimedPromoCodeIds: [],
      claimedPromoBatchIds: [batch[1].batchId!],
    });
    assert.equal(inspectBatch.valid, false);
    assert.equal(inspectBatch.status, "already_claimed");
  });

  it("QUOTA-02: archiveOldClaimedPromoCodes remove apenas códigos resgatados/ocultos > 90 dias preservando ativos", () => {
    const nowMs = Date.UTC(2026, 10, 27, 12, 0, 0);
    const oldIso = new Date(nowMs - 100 * 86_400_000).toISOString();
    const recentIso = new Date(nowMs - 10 * 86_400_000).toISOString();

    const sample = [
      { id: "1", code: "A1", cleanCode: "A1", status: "active" as const, createdAt: oldIso },
      { id: "2", code: "C_OLD", cleanCode: "COLD", status: "claimed" as const, createdAt: oldIso, claimedAt: oldIso },
      { id: "3", code: "C_NEW", cleanCode: "CNEW", status: "claimed" as const, createdAt: recentIso, claimedAt: recentIso },
      { id: "4", code: "H_OLD", cleanCode: "HOLD", status: "active" as const, hiddenForAdmin: true, createdAt: oldIso },
    ] as any[];

    const res = archiveOldClaimedPromoCodes(sample, { maxAgeDays: 90, nowMs });
    assert.equal(res.archivedCount, 2);
    assert.deepEqual(res.remaining.map((c) => c.id), ["1", "3"]);
  });
});
