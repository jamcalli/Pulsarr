import * as SliderPrimitive from "@radix-ui/react-slider"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Renders a customizable slider UI component using Radix UI primitives.
 *
 * The component determines its thumb count based on the provided slider values in either the controlled
 * `value` prop or the uncontrolled `defaultValue` prop. If neither is provided as an array, it defaults to
 * a range defined by `min` and `max`. The slider displays a track, a range indicator, and one or more draggable
 * thumbs, with additional props forwarded to the underlying slider element.
 *
 * @param defaultValue - Initial slider values for uncontrolled usage (array for multi-thumb support).
 * @param value - Controlled slider values (array for multi-thumb support).
 * @param min - The minimum slider value, defaults to 0.
 * @param max - The maximum slider value, defaults to 100.
 *
 * @example
 * <Slider defaultValue={[10, 90]} min={0} max={100} />
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative w-full grow overflow-hidden rounded-base bg-secondary-background border-2 border-border data-[orientation=horizontal]:h-3 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-3"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-main data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="block h-5 w-5 rounded-full border-2 border-border bg-white ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
