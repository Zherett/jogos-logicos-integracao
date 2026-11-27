import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePlayerAvatar, type PlayerAvatarConfig } from "./avatar.ts";

describe("Resolvedor determinístico de Avatar (avatar)", () => {
  it("preserva avatar customizado aplicando defaults nos campos opcionais", () => {
    const custom: PlayerAvatarConfig = {
      chassisId: "titan",
      headShape: "hexagon",
      visorId: "laser",
      primaryColor: "#112233",
      accentColor: "",
    };
    const resolved = resolvePlayerAvatar(custom, 123, "left");
    assert.equal(resolved.chassisId, "titan");
    assert.equal(resolved.headShape, "hexagon");
    assert.equal(resolved.visorId, "laser");
    assert.equal(resolved.primaryColor, "#112233");
    assert.equal(resolved.accentColor, "#112233");
    assert.equal(resolved.accessoryId, "none");
    assert.equal(resolved.emblemId, "core");
  });

  it("gera aparências determinísticas por seed e distintas por lado (left vs right)", () => {
    const left1 = resolvePlayerAvatar(null, 9876, "left");
    const left2 = resolvePlayerAvatar(null, 9876, "left");
    const right = resolvePlayerAvatar(null, 9876, "right");

    assert.deepEqual(left1, left2);
    assert.notEqual(left1.primaryColor, right.primaryColor);
    assert.ok(left1.primaryColor.startsWith("#"));
    assert.ok(right.accentColor.startsWith("#"));
  });
});
