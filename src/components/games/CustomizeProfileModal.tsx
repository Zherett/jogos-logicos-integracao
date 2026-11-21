import { useEffect, useMemo, useState } from "react";
import { Check, Palette, Sparkles, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AVATAR_BASIC_COLORS,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
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

  const [selectedAvatarId, setSelectedAvatarId] = useState(currentAvatar.avatar.id);
  const [selectedColor, setSelectedColor] = useState(currentAvatar.color);
  const [selectedAuraId, setSelectedAuraId] = useState<string>(currentAura?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedAvatarId(currentAvatar.avatar.id || DEFAULT_AVATAR_ID);
      setSelectedColor(currentAvatar.color || DEFAULT_AVATAR_COLOR);
      setSelectedAuraId(currentAura?.id ?? "");
    }
  }, [open, currentAvatar.avatar.id, currentAvatar.color, currentAura?.id]);

  const previewAvatar =
    unlockedAvatars.find((a) => a.id === selectedAvatarId) ?? unlockedAvatars[0];
  const previewAura = unlockedAuras.find((a) => a.id === selectedAuraId) ?? null;
  const previewCardAura = getAuraPresentation(previewAura);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await syncActiveProfileChangeToPlayFab({
        ...profile,
        equippedAvatar: {
          id: selectedAvatarId || DEFAULT_AVATAR_ID,
          color: selectedColor || DEFAULT_AVATAR_COLOR,
        },
        equippedAuraId: selectedAuraId || undefined,
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
              </div>
              <div className="text-xs text-muted-foreground">
                Aura: <b className="text-foreground">{previewAura?.name ?? "Nenhuma"}</b>
              </div>
            </div>
          </div>

          {/* 1. Avatares Desbloqueados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-primary" />
                Seus Avatares Desbloqueados ({unlockedAvatars.length})
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
              {unlockedAvatars.map((av) => {
                const isSelected = av.id === selectedAvatarId;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(av.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border/60 bg-secondary/20 hover:bg-secondary/40"
                    }`}
                  >
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
