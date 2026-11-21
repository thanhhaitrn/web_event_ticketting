import { createDemandLogHook } from "@/lib/pricing-copilot/demand-log";
import { prisma } from "@/lib/prisma";
import { PricingService } from "./pricing-service";
import { PrismaPricingRepository } from "./prisma-pricing-repository";

export const pricingRepository = new PrismaPricingRepository(prisma);

export const pricingService = new PricingService(pricingRepository, {
  lazyRecompute: process.env.PRICING_LAZY_RECOMPUTE !== "0",
  onSnapshot: createDemandLogHook(prisma),
});

export * from "./types";
export * from "./rules";
export * from "./rule-based-pricing-policy";
export * from "./pricing-service";
