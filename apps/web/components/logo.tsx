"use client";

import Image from "next/image";
import { useTheme } from "./theme-provider";

export function Logo({ iconOnly = false }: { iconOnly?: boolean }) {
  const { theme } = useTheme();
  const src =
    theme === "dark" ? "/light_mode_logo_full.svg" : "/dark_mode_logo_full.svg";
  const icon =
    theme === "dark"
      ? "/light_mode_logo_icon_only.svg"
      : "/dark_mode_logo_icon_only.svg";
  return (
    <Image
      src={iconOnly ? icon : src}
      alt="Recourse"
      width={iconOnly ? 42 : 148}
      height={42}
      priority
    />
  );
}
