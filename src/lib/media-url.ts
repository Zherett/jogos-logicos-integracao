/**
 * media-url.ts
 *
 * Validação estrita e centralizada de URLs de mídia (cartas, correio e cosméticos),
 * bloqueando esquemas inseguros (`javascript:`, `vbscript:`), protocol-relative (`//evil`),
 * contrabarras (`/\evil` ou `\`), whitespace e caracteres de controle ASCII.
 */

export interface SafeMediaUrlOptions {
  /** Permite `data:image/(png|jpeg|jpg|gif|webp);base64,...` dentro do limite informado */
  allowDataImage?: boolean;
  /** Limite máximo de caracteres para data URLs (quando `allowDataImage: true`) */
  maxDataImageChars?: number;
}

const DATA_IMAGE_RASTER_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;
const PATH_TRAVERSAL_SEGMENT_RE = /(?:^|\/)\.\.(?:\/|$)/;

function hasControlOrWhitespace(value: string): boolean {
  if (/\s/.test(value)) return true;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Valida se uma URL ou caminho relativo é seguro para renderização em tags `<img>`:
 * - Caminhos relativos limpos iniciando com `/` (sem `//`, `\\`, `..`, espaços ou controles)
 * - URLs `https://` válidas com hostname e sem caracteres de controle/espaços
 * - Opcionalmente `data:image/(png|jpeg|jpg|webp|gif);base64,...` limitado
 */
export function isSafeHttpOrRelativeMediaUrl(
  url?: string | null,
  options?: SafeMediaUrlOptions,
): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (hasControlOrWhitespace(trimmed)) return false;

  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) return false;
    if (trimmed.includes("\\")) return false;
    if (PATH_TRAVERSAL_SEGMENT_RE.test(trimmed)) return false;
    return true;
  }

  if (options?.allowDataImage && DATA_IMAGE_RASTER_RE.test(trimmed)) {
    const maxChars = options.maxDataImageChars ?? Number.POSITIVE_INFINITY;
    return trimmed.length <= maxChars;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
