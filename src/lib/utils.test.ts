import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cn } from "./utils.ts";

describe("Utilitário de classes Tailwind (utils)", () => {
  it("combina classes condicionais e resolve conflitos de utilitários Tailwind", () => {
    const disabled = false;
    const active = true;
    const out = cn("px-2 py-1 text-sm", disabled && "opacity-50", active && "px-4 text-base");
    assert.equal(out.includes("px-4"), true);
    assert.equal(out.includes("px-2"), false);
    assert.equal(out.includes("text-base"), true);
    assert.equal(out.includes("text-sm"), false);
    assert.equal(out.includes("opacity-50"), false);
  });
});
