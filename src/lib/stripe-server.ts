import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

/** Instância Stripe (servidor). Devolve `null` se `STRIPE_SECRET_KEY` não estiver definida. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}
