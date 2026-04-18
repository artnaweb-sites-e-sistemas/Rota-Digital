import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <div
      className={cn(
        "w-full min-w-0 transition-transform duration-200 ease-out",
        "focus-within:-translate-y-1",
        "has-[[data-slot=textarea]:disabled]:translate-y-0",
      )}
    >
      <textarea
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base shadow-sm outline-none placeholder:text-muted-foreground",
          "transition-[box-shadow,border-color] duration-200 ease-out",
          "focus:border-border focus:shadow-md dark:focus:shadow-lg",
          "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 disabled:shadow-none",
          "aria-invalid:border-destructive/55 aria-invalid:ring-0 aria-invalid:shadow-md dark:aria-invalid:shadow-lg",
          "md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/55",
          className
        )}
        {...props}
      />
    </div>
  )
}

export { Textarea }
