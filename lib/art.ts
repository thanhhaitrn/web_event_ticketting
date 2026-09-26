import type { CSSProperties } from "react";
import { assetUrl } from "@/lib/demo";

// cover the gradient tile with the event's promo image when there is one
export function artStyle(
  imageUrl: string | null | undefined,
): CSSProperties | undefined {
  if (!imageUrl) return undefined;
  return {
    backgroundImage: `url("${assetUrl(imageUrl)}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}
