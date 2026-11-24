import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Palette, RefreshCw, Sparkles, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AVATAR_BASIC_COLORS,
  canUseDualAvatar,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
  DUAL_AVATAR_MIN_LEVEL,
  getUnlockedAuraIds,
  getUnlockedAvatarIds,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  resolveEquippedAura,
  resolveEquippedAvatar,
} from "@/lib/cosmetics-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import { syncActiveProfileChangeToPlayFab } from "@/lib/playfab";
import { getAuraPresentation, PlayerAvatarBadge } from "./PlayerAvatarBadge";

interface CustomizeProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomizeProfileModal({ open, onOpenChange }: CustomizeProfileModalProps) {
  const auth = usePlayerAuth();
  const profile = auth.profile;

  const avatarsCatalog = useMemo(
    () => mergeWithDefaultAvatars(auth.adminConfig.avatarsCatalog),
    [auth.adminConfig.avatarsCatalog],
  );
  const aurasCatalog = useMemo(
    () => mergeWithDefaultAuras(auth.adminConfig.aurasCatalog),
    [auth.adminConfig.aurasCatalog],
  );

  const unlockedAvatars = useMemo(() => {
    const ids = new Set(getUnlockedAvatarIds(profile));
    return avatarsCatalog.filter((a) => ids.has(a.id));
  }, [avatarsCatalog, profile]);

  const unlockedAuras = useMemo(() => {
    const ids = new Set(getUnlockedAuraIds(profile));
    return aurasCatalog.filter((a) => ids.has(a.id));
  }, [aurasCatalog, profile]);

  const currentAvatar = useMemo(
    () => resolveEquippedAvatar(profile, avatarsCatalog),
    [profile, avatarsCatalog],
  );
  const currentAura = useMemo(
    () => resolveEquippedAura(profile, aurasCatalog),
    [profile, aurasCatalog],
  );

  const dualUnlocked = canUseDualAvatar(profile);
  const [activeSlot, setActiveSlot] = useState<"primary" | "secondary">("primary");
  const [selectedAvatarId, setSelectedAvatarId] = useState(currentAvatar.avatar.id);
  const [selectedSecondaryAvatarId, setSelectedSecondaryAvatarId] = useState<string>(
    currentAvatar.secondaryAvatar?.id ?? "",
  );
  const [selectedColor, setSelectedColor] = useState(currentAvatar.color);
  const [selectedAuraId, setSelectedAuraId] = useState<string>(currentAura?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveSlot("primary");
      setSelectedAvatarId(currentAvatar.avatar.id || DEFAULT_AVATAR_ID);
      setSelectedSecondaryAvatarId(currentAvatar.secondaryAvatar?.id ?? "");
      setSelectedColor(currentAvatar.color || DEFAULT_AVATAR_COLOR);
      setSelectedAuraId(currentAura?.id ?? "");
    }
  }, [
    open,
    currentAvatar.avatar.id,
    currentAvatar.secondaryAvatar?.id,
    currentAvatar.color,
    currentAura?.id,
  ]);

  const previewAvatar =
    unlockedAvatars.find((a) => a.id === selectedAvatarId) ?? unlockedAvatars[0];
  const previewSecondaryAvatar =
    dualUnlocked && selectedSecondaryAvatarId && selectedSecondaryAvatarId !== selectedAvatarId
      ? unlockedAvatars.find((a) => a.id === selectedSecondaryAvatarId) ?? null
      : null;
  const previewAura = unlockedAuras.find((a) => a.id === selectedAuraId) ?? null;
  const previewCardAura = getAuraPresentation(previewAura);

  function handleSelectAvatar(avatarId: string) {
    if (!dualUnlocked || activeSlot === "primary") {
      setSelectedAvatarId(avatarId);
      if (selectedSecondaryAvatarId === avatarId) {
        setSelectedSecondaryAvatarId("");
      }
      return;
    }
    if (avatarId === selectedAvatarId) {
      // Clicar no mesmo avatar já principal no slot secundário desativa o 2º avatar
      setSelectedSecondaryAvatarId("");
      return;
    }
    setSelectedSecondaryAvatarId((prev) => (prev === avatarId ? "" : avatarId));
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      const validSecondary =
        dualUnlocked &&
        selectedSecondaryAvatarId &&
        selectedSecondaryAvatarId !== (selectedAvatarId || DEFAULT_AVATAR_ID)
          ? selectedSecondaryAvatarId
          : undefined;

      await syncActiveProfileChangeToPlayFab({
        ...profile,
        equippedAvatar: {
          id: selectedAvatarId || DEFAULT_AVATAR_ID,
          ...(validSecondary ? { secondaryId: validSecondary } : {}),
          color: selectedColor || DEFAULT_AVATAR_COLOR,
        },
        equippedAuraId: selectedAuraId || "",
      });
      await auth.refresh();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-black">
            <Palette className="h-5 w-5 text-primary" />
            Personalizar Perfil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prévia ao vivo com Aura na borda */}
          <div
            className={`flex items-center gap-3.5 rounded-3xl border-2 bg-card p-3.5 transition-all ${previewCardAura.className}`}
            style={previewCardAura.style}
          >
            <PlayerAvatarBadge
              avatar={previewAvatar}
              secondaryAvatar={previewSecondaryAvatar}
              color={selectedColor}
              aura={previewAura}
              size="lg"
            />
            <div className="min-w-0">
              <div className="font-display text-base font-black text-foreground truncate">
                {profile?.nick ?? "Jogador"}
              </div>
              <div className="text-xs text-muted-foreground">
                Avatar: <b className="text-foreground">{previewAvatar?.name}</b>
                {previewSecondaryAvatar && (
                  <span className="text-primary font-bold">
                    {" "}⇄ {previewSecondaryAvatar.name}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Aura: <b className="text-foreground">{previewAura?.name ?? "Nenhuma"}</b>
              </div>
              {previewSecondaryAvatar && (
                <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  <RefreshCw className="h-3 w-3" />
                  Alternância 3D + Foil ativa
                </div>
              )}
            </div>
          </div>

          {/* 1. Avatares Desbloqueados */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-primary" />
                Seus Avatares Desbloqueados ({unlockedAvatars.length})
              </span>
            </div>

            {dualUnlocked ? (
              <div className="space-y-1.5 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-black text-amber-700 dark:text-amber-300">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Bônus Nível {DUAL_AVATAR_MIN_LEVEL}: Avatar Duplo Animado
                  </span>
                  {selectedSecondaryAvatarId && (
                    <button
                      type="button"
                      onClick={() => setSelectedSecondaryAvatarId("")}
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                      Usar só 1
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveSlot("primary")}
                    className={`rounded-xl border px-2.5 py-1.5 text-left text-[11px] font-bold transition-all cursor-pointer ${
                      activeSlot === "primary"
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/60 bg-background/80 text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <div className="text-[10px] opacity-80">1º Avatar (Principal)</div>
                    <div className="truncate font-extrabold">{previewAvatar?.name}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSlot("secondary")}
                    className={`rounded-xl border px-2.5 py-1.5 text-left text-[11px] font-bold transition-all cursor-pointer ${
                      activeSlot === "secondary"
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/60 bg-background/80 text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <div className="text-[10px] opacity-80">2º Avatar (Opcional)</div>
                    <div className="truncate font-extrabold">
                      {previewSecondaryAvatar ? previewSecondaryAvatar.name : "Nenhum (sem giro)"}
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-secondary/25 px-3 py-2 text-[11px] text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>
                  No <b className="text-foreground">Nível {DUAL_AVATAR_MIN_LEVEL}</b> você libera um <b>2º Avatar</b> que gira alternando com brilho <b>Foil</b>!
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
              {unlockedAvatars.map((av) => {
                const isPrimary = av.id === selectedAvatarId;
                const isSecondary = dualUnlocked && av.id === selectedSecondaryAvatarId;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => handleSelectAvatar(av.id)}
                    className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 text-center transition-all cursor-pointer ${
                      isPrimary
                        ? "border-primary bg-primary/10 shadow-xs"
                        : isSecondary
                          ? "border-amber-500 bg-amber-500/10 shadow-xs"
                          : "border-border/60 bg-secondary/20 hover:bg-secondary/40"
                    }`}
                  >
                    {(isPrimary || isSecondary) && dualUnlocked && (
                      <span
                        className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.2 text-[9px] font-black ${
                          isPrimary
                            ? "bg-primary text-primary-foreground"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {isPrimary ? "1º" : "2º"}
                      </span>
                    )}
                    <PlayerAvatarBadge avatar={av} color={selectedColor} size="sm" />
                    <span className="text-[10px] font-bold leading-tight line-clamp-1">
                      {av.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Cores Básicas Gratuitas */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-foreground">
              Cores Básicas do Avatar (Gratuitas)
            </div>
            <div className="flex flex-wrap gap-2">
              {AVATAR_BASIC_COLORS.map((c) => {
                const active = selectedColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.hex)}
                    title={c.label}
                    className={`flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                      active
                        ? "border-foreground bg-secondary shadow-xs"
                        : "border-border/60 bg-card hover:bg-secondary/40"
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/20"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Auras Desbloqueadas */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Suas Auras Desbloqueadas ({unlockedAuras.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setSelectedAuraId("")}
                className={`rounded-xl border-2 p-2 text-left text-xs font-bold transition-all cursor-pointer ${
                  selectedAuraId === ""
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-secondary/20 hover:bg-secondary/40"
                }`}
              >
                Sem Aura
              </button>
              {unlockedAuras.map((aura) => {
                const active = aura.id === selectedAuraId;
                const pres = getAuraPresentation(aura);
                return (
                  <button
                    key={aura.id}
                    type="button"
                    onClick={() => setSelectedAuraId(aura.id)}
                    className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left text-[11px] font-bold transition-all cursor-pointer ${
                      active ? "bg-primary/10" : "bg-card hover:bg-secondary/40"
                    } ${pres.className}`}
                    style={pres.style}
                  >
                    <span className="line-clamp-2">{aura.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full rounded-xl font-display font-bold gap-1.5"
          >
            <Check className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Personalização"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
