import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
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
  type PromoCodePattern,
} from "./promo-codes.ts";

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

  it("trava de acesso restringe a função de resgate exclusivamente aos usuários de teste Zheret e Lord", () => {
    const alunoComum = { nick: "marcos_silva" } as any;
    const alunoBanana = { nick: "banana123" } as any;
    const testerZheret = { nick: "Zheret" } as any;
    const testerLord = { nick: "LORD" } as any;

    assert.equal(canAccessPromoCodeRedeem(alunoComum), false, "Aluno comum não pode ver o resgate");
    assert.equal(canAccessPromoCodeRedeem(alunoBanana), false, "Banana123 não pode ver o resgate");
    assert.equal(canAccessPromoCodeRedeem(testerZheret), true, "Zheret deve ter acesso liberado");
    assert.equal(canAccessPromoCodeRedeem(testerLord), true, "Lord deve ter acesso liberado");
  });
});
