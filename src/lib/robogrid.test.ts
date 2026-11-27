import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COLS,
  COLORS,
  ROWS,
  coordLabel,
  makeColorQ,
  makePositionQ,
  makeQuestionForLevel,
  makeRobotQ,
  randomBoard,
} from "./robogrid.ts";

describe("Motor espacial RoboGrid (robogrid)", () => {
  it("gera tabuleiro 10x10 válido com todas as células coloridas", () => {
    const board = randomBoard();
    assert.equal(COLS.length, 10);
    assert.equal(ROWS, 10);
    assert.equal(board.length, ROWS);
    for (const row of board) {
      assert.equal(row.length, COLS.length);
      for (const cell of row) {
        assert.ok(COLORS.includes(cell));
      }
    }
    assert.equal(coordLabel({ col: 0, row: 0 }), "A1");
    assert.equal(coordLabel({ col: 9, row: 9 }), "J10");
  });

  it("gera questões position, color e robot com coordenadas e respostas dentro do tabuleiro", () => {
    const board = randomBoard();
    for (let i = 0; i < 25; i++) {
      const pos = makePositionQ();
      assert.equal(pos.kind, "position");
      assert.ok(pos.target.col >= 0 && pos.target.col < COLS.length);
      assert.ok(pos.target.row >= 0 && pos.target.row < ROWS);

      const colQ = makeColorQ(board);
      assert.equal(colQ.kind, "color");
      assert.equal(colQ.color, board[colQ.target.row][colQ.target.col]);
      assert.equal(colQ.options.length, COLORS.length);
      assert.equal(new Set(colQ.options).size, COLORS.length);

      const robQ = makeRobotQ();
      assert.equal(robQ.kind, "robot");
      assert.equal(robQ.start.col + robQ.moves.dx, robQ.answer.col);
      assert.equal(robQ.start.row + robQ.moves.dy, robQ.answer.row);
      assert.ok(robQ.answer.col >= 0 && robQ.answer.col < COLS.length);
      assert.ok(robQ.answer.row >= 0 && robQ.answer.row < ROWS);
      assert.equal(robQ.options.length, 4);
      assert.deepEqual(robQ.options[robQ.correctIndex], robQ.answer);
    }
  });

  it("seleciona o tipo de questão esperado para os níveis 1, 2, 3 e 4+", () => {
    const board = randomBoard();
    assert.equal(makeQuestionForLevel(1, board).kind, "position");
    assert.equal(makeQuestionForLevel(2, board).kind, "color");
    assert.equal(makeQuestionForLevel(3, board).kind, "robot");
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      kinds.add(makeQuestionForLevel(4, board).kind);
    }
    assert.ok(kinds.has("position") && kinds.has("color") && kinds.has("robot"));
  });
});
