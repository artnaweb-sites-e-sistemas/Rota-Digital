import * as React from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type LinkButtonProps = Omit<React.ComponentProps<typeof Link>, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string };

export function LinkButton({
  className,
  variant = "cta",
  size = "default",
  href,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </Link>
  );
}
