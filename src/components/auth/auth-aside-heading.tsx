import type { ReactNode } from "react";

const asideTitleClassName =
  "font-heading pr-2 text-3xl font-extrabold leading-snug tracking-[-0.02em] text-zinc-900 [text-wrap:balance] sm:text-4xl lg:text-[2.2rem] lg:leading-[1.18] xl:text-[2.6rem] xl:leading-[1.14] dark:text-zinc-900";

export function AuthAsideHeading({ children }: { children: ReactNode }) {
  return <h1 className={asideTitleClassName}>{children}</h1>;
}
