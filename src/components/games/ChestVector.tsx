import {
  DEFAULT_CHEST_METAL_COLOR,
  DEFAULT_CHEST_PRIMARY_COLOR,
  type ChestShape,
} from "@/lib/chests-catalog";

interface ChestVectorProps {
  primaryColor?: string;
  metalColor?: string;
  shape?: ChestShape;
  isOpen?: boolean;
  isShaking?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ChestVector({
  primaryColor = DEFAULT_CHEST_PRIMARY_COLOR,
  metalColor = DEFAULT_CHEST_METAL_COLOR,
  shape = "padrao",
  isOpen = false,
  isShaking = false,
  size = "md",
  className = "",
}: ChestVectorProps) {
  const mainColor = primaryColor || DEFAULT_CHEST_PRIMARY_COLOR;
  const trimColor = metalColor || DEFAULT_CHEST_METAL_COLOR;

  const baseSizeClass = {
    sm: "h-12 w-16",
    md: "h-24 w-32",
    lg: "h-36 w-48",
  }[size];

  const shapeTransform =
    shape === "largo"
      ? "scale-x-125 scale-y-95"
      : shape === "compacto"
        ? "scale-x-85 scale-y-90"
        : "";

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${baseSizeClass} ${shapeTransform} ${
        isShaking ? "animate-chest-shake" : ""
      } ${className}`}
    >
      <svg
        viewBox="0 0 240 185"
        className="h-full w-full overflow-visible drop-shadow-md"
        aria-hidden="true"
      >
        {/* Cavidade interna revelada quando a tampa sobe */}
        {isOpen && (
          <g>
            <rect
              x="22"
              y="72"
              width="196"
              height="26"
              rx="6"
              fill="#1e1b2e"
              opacity="0.95"
            />
            <ellipse
              cx="120"
              cy="84"
              rx="74"
              ry="12"
              fill="#fbbf24"
              opacity="0.35"
            />
          </g>
        )}

        {/* CORPO INFERIOR DO BAÚ */}
        <g className="transition-transform duration-500">
          {/* Moldura externa metálica inferior */}
          <rect
            x="16"
            y="88"
            width="208"
            height="84"
            rx="10"
            fill={trimColor}
          />
          {/* Sombra sutil na borda superior da base */}
          <rect
            x="16"
            y="84"
            width="208"
            height="8"
            rx="3"
            fill="#000000"
            opacity="0.18"
          />
          {/* Painel de madeira / cor principal inferior */}
          <rect
            x="32"
            y="98"
            width="176"
            height="62"
            rx="4"
            fill={mainColor}
          />
          {/* Reflexo sutil no painel */}
          <rect
            x="32"
            y="98"
            width="176"
            height="8"
            fill="#ffffff"
            opacity="0.12"
          />
        </g>

        {/* TAMPA SUPERIOR DO BAÚ + FECHADURA (sobe e separa quando aberto) */}
        <g
          style={{
            transform: isOpen ? "translateY(-44px) rotate(-4deg)" : "translateY(0px) rotate(0deg)",
            transformOrigin: "120px 60px",
            transition: "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* Moldura metálica arredondada da tampa */}
          <path
            d="M 16 84 L 16 56 C 16 28 38 14 68 14 L 172 14 C 202 14 224 28 224 56 L 224 84 Z"
            fill={trimColor}
          />
          {/* Painel superior principal */}
          <path
            d="M 32 80 L 32 56 C 32 36 48 24 72 24 L 168 24 C 192 24 208 36 208 56 L 208 80 Z"
            fill={mainColor}
          />
          {/* Brilho curvo no topo da tampa */}
          <path
            d="M 44 40 C 56 28 70 26 84 26 L 156 26 C 170 26 184 28 196 40"
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.18"
          />

          {/* Fenda superior da lingueta da fechadura */}
          <ellipse cx="120" cy="54" rx="22" ry="3.5" fill="#000000" opacity="0.32" />

          {/* Placa/Lingueta da Fechadura (metalColor com leve sombra) */}
          <path
            d="M 103 54 L 137 54 L 143 108 L 120 128 L 97 108 Z"
            fill={trimColor}
            stroke="#000000"
            strokeOpacity="0.18"
            strokeWidth="1.5"
          />
          {/* Miolo da chave */}
          <circle cx="120" cy="86" r="9" fill="#334155" />
          <rect x="116.5" y="88" width="7" height="14" rx="3" fill="#334155" />
        </g>
      </svg>
    </div>
  );
}
