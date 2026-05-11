import { cn } from '@/lib/utils';

const BG_COLOR = '#3B5BDB';
const LINE_COLOR = '#3B5BDB';
const CHECK_COLOR = '#4F46E5';

/**
 * Ícone do Sigma — combina um ticket/chamado (retângulo com linhas)
 * e uma chave de manutenção (wrench), representando gestão de chamados
 * de manutenção.
 *
 * Usa cores sólidas (sem <defs>/<linearGradient>) para evitar colisão
 * de IDs SVG e hydration mismatch quando múltiplas instâncias coexistem.
 */
export function SigmaLogo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      {/* Background rounded square */}
      <rect width="64" height="64" rx="14" fill={BG_COLOR} />

      {/* Ticket/clipboard body */}
      <rect x="16" y="12" width="26" height="34" rx="3" fill="white" fillOpacity="0.95" />
      {/* Ticket top notch */}
      <rect x="24" y="9" width="10" height="6" rx="2" fill="white" fillOpacity="0.95" />

      {/* Ticket lines */}
      <rect x="21" y="22" width="16" height="2.5" rx="1.25" fill={LINE_COLOR} fillOpacity="0.25" />
      <rect x="21" y="28" width="12" height="2.5" rx="1.25" fill={LINE_COLOR} fillOpacity="0.2" />
      <rect x="21" y="34" width="14" height="2.5" rx="1.25" fill={LINE_COLOR} fillOpacity="0.15" />

      {/* Checkmark on ticket */}
      <path
        d="M22 40 L25 43 L31 37"
        stroke={CHECK_COLOR}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Wrench */}
      <g transform="translate(34, 28) rotate(-45)">
        <path
          d="M2 -1.5 C2 -5, 5 -8, 9 -8 C10.5 -8, 12 -7.5, 13 -6.5 L10 -3.5 L10.5 -1 L13 -0.5 L16 -3.5 C17 -2.5, 17.5 -1, 17.5 0.5 C17.5 4.5, 14.5 7.5, 10.5 7.5 C9 7.5, 7.5 7, 6.5 6 L2 1.5 Z"
          fill="white"
          fillOpacity="0.95"
        />
        <rect x="-8" y="-2" width="11" height="4" rx="2" fill="white" fillOpacity="0.95" />
      </g>
    </svg>
  );
}
