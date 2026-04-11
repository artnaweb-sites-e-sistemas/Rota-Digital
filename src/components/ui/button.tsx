import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,box-shadow,opacity] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        /** Ação principal — acento da marca; contorno suave para não parecer “bloco” pesado */
        cta:
          "border-brand/25 bg-brand font-medium text-brand-foreground shadow-sm shadow-black/[0.04] hover:border-brand/35 hover:bg-brand/[0.92] active:translate-y-0 active:brightness-[0.97] focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-brand/35 dark:shadow-none",
        /**
         * CTA com gradiente animado: só tons escuros (ouro fechado) para manter contraste com texto branco
         * em qualquer frame da animação — evita `via-brand` / claros que falhavam WCAG.
         */
        ctaMotion:
          "border-none bg-gradient-to-r from-[#1c1910] via-[#4a422c] to-[#5c5235] bg-[length:200%_100%] animate-[gradient-move_3s_ease_infinite] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        /**
         * CTA relatório público: gradiente verde terroso (tokens em globals.css), chama mais atenção
         * que o ouro mas mantém a mesma “séria” da identidade.
         */
        ctaMotionGreen:
          "border-none bg-gradient-to-r from-[var(--cta-report-green-from)] via-[var(--cta-report-green-via)] to-[var(--cta-report-green-to)] bg-[length:200%_100%] animate-[gradient-move_3s_ease_infinite] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.5)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-emerald-200/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-emerald-300/35",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-h-9 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
