import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { getCountryOptions, type CountryOption } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Props = {
  value: string | null | undefined;
  onChange: (code: string) => void;
  placeholder?: string;
  locale?: string;
  disabled?: boolean;
  className?: string;
};

export function CountryCombobox({ value, onChange, placeholder = "Select a country", locale = "en", disabled, className }: Props) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => getCountryOptions(locale), [locale]);
  const selected = useMemo<CountryOption | null>(() => {
    if (!value) return null;
    return options.find((o) => o.code === value) || null;
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between border-white/15 bg-black/30 text-white/80 hover:bg-white/10", className)}
        >
          <span className={cn("truncate text-left", !selected && "text-white/50")}>{selected?.name || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-gray-900 border border-white/10 text-white">
        <Command>
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.code}
                  value={`${opt.name} ${opt.code}`}
                  onSelect={() => {
                    onChange(opt.code);
                    setOpen(false);
                  }}
                  className="text-white/80"
                >
                  <Check className={cn("mr-2 h-4 w-4", opt.code === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt.name}</span>
                  <span className="ml-auto text-[10px] text-white/40">{opt.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

