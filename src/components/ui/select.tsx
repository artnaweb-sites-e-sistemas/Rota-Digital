"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 px-1 py-0.5", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex min-w-0 flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background text-sm text-foreground shadow-sm outline-none select-none",
        "transition-[transform,box-shadow,border-color,background-color,color] duration-200 ease-out",
        "hover:-translate-y-1 hover:border-brand/35 hover:bg-brand/[0.04] hover:shadow-md dark:hover:border-brand/30 dark:hover:bg-brand/[0.08] dark:hover:shadow-lg",
        "focus:-translate-y-1 focus:border-border focus:shadow-md focus:ring-0 dark:focus:shadow-lg",
        "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:translate-y-0",
        "aria-invalid:border-destructive/55 aria-invalid:ring-0 aria-invalid:shadow-md dark:aria-invalid:border-destructive/55 dark:aria-invalid:shadow-lg",
        "data-placeholder:text-muted-foreground",
        "dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100 dark:data-placeholder:text-zinc-500",
        "data-[size=default]:h-10 data-[size=default]:px-3.5",
        "data-[size=sm]:h-8 data-[size=sm]:rounded-md data-[size=sm]:px-2.5 data-[size=sm]:text-xs",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground opacity-80 dark:text-zinc-400" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

const SELECT_COLLISION_DEFAULT = {
  side: "shift" as const,
  align: "shift" as const,
  fallbackAxisSide: "none" as const,
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  /** Se true, o painel tenta alinhar o texto do item ao valor do trigger (pode parecer que abre “para cima”). */
  alignItemWithTrigger = false,
  collisionAvoidance = SELECT_COLLISION_DEFAULT,
  collisionPadding = 8,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "alignItemWithTrigger"
    | "collisionAvoidance"
    | "collisionPadding"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        collisionAvoidance={collisionAvoidance}
        collisionPadding={collisionPadding}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground",
            "w-(--anchor-width) p-1.5",
            "shadow-[0_10px_38px_-10px_rgba(0,0,0,0.16),0_4px_14px_-6px_rgba(0,0,0,0.08)]",
            "ring-1 ring-black/[0.04]",
            "duration-200 dark:border-white/[0.1] dark:bg-zinc-900/95 dark:text-zinc-100 dark:shadow-[0_24px_56px_-12px_rgba(0,0,0,0.72)] dark:ring-white/[0.06] dark:backdrop-blur-md",
            "data-[align-trigger=true]:animate-none",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-open:duration-200",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-1 data-closed:duration-150",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="space-y-0.5">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2.5 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md py-2.5 pr-9 pl-3 text-sm outline-none select-none",
        "text-foreground transition-colors duration-150",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
        "data-[highlighted]:bg-muted/85 data-[highlighted]:text-foreground",
        "dark:data-[highlighted]:bg-white/[0.08] dark:data-[highlighted]:text-zinc-100",
        "data-[selected]:bg-brand/12 data-[selected]:font-medium data-[selected]:text-foreground",
        "dark:data-[selected]:bg-brand/18 dark:data-[selected]:text-zinc-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2.5 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="size-3.5 text-brand dark:text-brand" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none my-1.5 h-px bg-border dark:bg-white/[0.08]", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center rounded-md bg-popover py-1.5 text-muted-foreground dark:bg-zinc-900/95 dark:text-zinc-500 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center rounded-md bg-popover py-1.5 text-muted-foreground dark:bg-zinc-900/95 dark:text-zinc-500 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
