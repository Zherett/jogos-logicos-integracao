import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const CARDS_PER_PAGE = 20;

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize = CARDS_PER_PAGE,
): {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
  startItem: number;
  endItem: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = items.slice(startIdx, startIdx + pageSize);
  const startItem = items.length === 0 ? 0 : startIdx + 1;
  const endItem = Math.min(items.length, startIdx + pageItems.length);
  return { pageItems, currentPage, totalPages, startItem, endItem };
}

function buildPageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) pages.push("ellipsis");
  for (let p = left; p <= right; p += 1) pages.push(p);
  if (right < totalPages - 1) pages.push("ellipsis");

  pages.push(totalPages);
  return pages;
}

interface CardPaginationProps {
  totalItems: number;
  currentPage: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
}

export function CardPagination({
  totalItems,
  currentPage,
  totalPages,
  startItem,
  endItem,
  onPageChange,
}: CardPaginationProps) {
  if (totalItems <= CARDS_PER_PAGE && totalPages <= 1) {
    return null;
  }

  const pageNumbers = buildPageNumbers(currentPage, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <span className="text-[11px] font-semibold text-muted-foreground">
        Mostrando {startItem}–{endItem} de {totalItems} cartas (Página {currentPage} de {totalPages})
      </span>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-8 rounded-xl px-2.5 text-xs font-bold"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Anterior
        </Button>

        {pageNumbers.map((entry, idx) =>
          entry === "ellipsis" ? (
            <span
              key={`ellipsis_${idx}`}
              className="px-1.5 text-xs font-bold text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Button
              key={entry}
              type="button"
              variant={entry === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(entry)}
              className="h-8 min-w-[2rem] rounded-xl px-2 text-xs font-bold"
            >
              {entry}
            </Button>
          ),
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-8 rounded-xl px-2.5 text-xs font-bold"
        >
          Próxima <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}
