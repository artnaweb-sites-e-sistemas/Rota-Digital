import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <div
      className={cn(
        "w-full min-w-0 transition-transform duration-200 ease-out",
        "focus-within:-translate-y-1",
        "has-[[data-slot=input]:disabled]:translate-y-0",
      )}
    >
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-sm outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground",
          "transition-[box-shadow,border-color] duration-200 ease-out",
          "focus:border-border focus:shadow-md dark:focus:shadow-lg",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 disabled:shadow-none",
          "aria-invalid:border-destructive/55 aria-invalid:ring-0 aria-invalid:shadow-md dark:aria-invalid:shadow-lg",
          "md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/55",
          className
        )}
        {...props}
      />
    </div>
  )
}

export { Input }
