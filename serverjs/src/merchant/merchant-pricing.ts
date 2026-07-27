export interface MerchantPricingPolicy {
  /** Multiplier applied after the item's EQ-style sell rate when the player buys. */
  readonly sellToPlayerPermille: number;
  /** Fraction of base value paid to a player who sells an item. */
  readonly buyFromPlayerPermille: number;
  readonly minimumTransactionCopper: number;
}

export interface MerchantPricedItem {
  readonly basePrice: number;
  readonly sellRatePermille: number;
}

export const DEFAULT_MERCHANT_PRICING_POLICY: MerchantPricingPolicy = {
  sellToPlayerPermille: 1_000,
  buyFromPlayerPermille: 950,
  minimumTransactionCopper: 1,
};

/** Server-authoritative integer pricing; clients only display the quoted values. */
export const merchantSellPrice = (
  item: MerchantPricedItem,
  quantity: number,
  policy: MerchantPricingPolicy,
): number => price(
  item.basePrice,
  item.sellRatePermille,
  policy.sellToPlayerPermille,
  quantity,
  policy.minimumTransactionCopper,
);

/** What the merchant pays the player. */
export const merchantBuyPrice = (
  item: MerchantPricedItem,
  quantity: number,
  policy: MerchantPricingPolicy,
): number => price(
  item.basePrice,
  1_000,
  policy.buyFromPlayerPermille,
  quantity,
  policy.minimumTransactionCopper,
);

const price = (
  basePrice: number,
  itemRate: number,
  merchantRate: number,
  quantity: number,
  minimum: number,
): number => {
  const count = Math.max(1, Math.trunc(quantity));
  const unit = Math.max(
    Math.max(0, Math.trunc(minimum)),
    Math.ceil(
      Math.max(0, Math.trunc(basePrice))
      * Math.max(0, Math.trunc(itemRate))
      * Math.max(0, Math.trunc(merchantRate))
      / 1_000_000,
    ),
  );
  const total = unit * count;
  if (!Number.isSafeInteger(total)) throw new RangeError("merchant price overflow");
  return total;
};

