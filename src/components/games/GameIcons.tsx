import React from "react";

interface IconProps {
  className?: string;
}

/**
 * Memória das Cores: disco circular dividido em 4 quadrantes com círculo central.
 */
export function ColorMemoryIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2.5" x2="12" y2="9" />
      <line x1="12" y1="15" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21.5" y2="12" />
    </svg>
  );
}

/**
 * Campo Minado Lógico: tabuleiro 4x4 com um pavio aceso.
 */
export function MinefieldIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Tabuleiro 4x4 */}
      <rect x="3" y="7" width="14" height="14" rx="2" />
      <g strokeWidth={1.5}>
        <line x1="6.5" y1="7" x2="6.5" y2="21" />
        <line x1="10" y1="7" x2="10" y2="21" />
        <line x1="13.5" y1="7" x2="13.5" y2="21" />
        <line x1="3" y1="10.5" x2="17" y2="10.5" />
        <line x1="3" y1="14" x2="17" y2="14" />
        <line x1="3" y1="17.5" x2="17" y2="17.5" />
      </g>
      {/* Pavio e faísca acesa */}
      <path d="M16.4 7.6c.9-1.4 1.9-2.1 3.1-2.6" />
      <g strokeWidth={1.6}>
        <line x1="20" y1="2" x2="20" y2="3.4" />
        <line x1="20" y1="6.2" x2="20" y2="7.6" />
        <line x1="17.2" y1="4.8" x2="18.6" y2="4.8" />
        <line x1="21.4" y1="4.8" x2="22.8" y2="4.8" />
        <line x1="18.1" y1="2.9" x2="19" y2="3.8" />
        <line x1="21" y1="5.8" x2="21.9" y2="6.7" />
      </g>
    </svg>
  );
}

/**
 * Completando a Lógica: duas peças de quebra-cabeça prestes a se encaixar.
 */
export function PuzzlePairIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Peça esquerda com pino saliente */}
      <path d="M3 6h6v4c1.4 0 2.3.8 2.3 2s-.9 2-2.3 2v4H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      {/* Peça direita com encaixe côncavo */}
      <path d="M14 6h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7v-4c1.4 0 2.3-.8 2.3-2s-.9-2-2.3-2V6Z" />
    </svg>
  );
}

/**
 * Desafio das Partes: pizza dividida em frações com uma fatia destacada.
 */
export function PizzaFractionIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Corpo principal da pizza (3/4) */}
      <path d="M11 4.5A8.5 8.5 0 1 0 19.5 13H11V4.5Z" />
      <path d="M11 6.8A6.2 6.2 0 1 0 17.2 13" strokeWidth={1.4} />
      <line x1="11" y1="13" x2="11" y2="21.5" strokeWidth={1.5} />
      <line x1="11" y1="13" x2="2.5" y2="13" strokeWidth={1.5} />

      {/* Fatia destacada (1/4) */}
      <path d="M13.2 2.3A8.5 8.5 0 0 1 21.7 10.8H13.2V2.3Z" />
      <path d="M13.2 4.6A6.2 6.2 0 0 1 19.4 10.8" strokeWidth={1.4} />

      {/* Detalhes da pizza */}
      <circle cx="7.6" cy="9.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="16.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.2" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
