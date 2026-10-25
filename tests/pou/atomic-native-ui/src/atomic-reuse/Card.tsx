import type { HTMLAttributes } from "react";

/**
 * Source-reuse provenance:
 * Derived from marmelab/atomic-crm src/components/ui/card.tsx
 * commit 167a4cdb652b1ab2b4b030831cfa7adcf2099321 (MIT).
 *
 * The Atomic/shadcn component shape is retained, while Tailwind-specific class
 * composition is replaced with GBAP PoU semantic classes so this experiment
 * does not pull the complete Atomic styling/runtime contract into GBAP.
 */
const cn = (...classes: Array<string | undefined>) => classes.filter(Boolean).join(" ");

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card" className={cn("atomic-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn("atomic-card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-title" className={cn("atomic-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-description" className={cn("atomic-card-description", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("atomic-card-content", className)} {...props} />;
}
