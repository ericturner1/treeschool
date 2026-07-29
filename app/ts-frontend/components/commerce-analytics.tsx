"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "../lib/analytics/events";

type CommerceItem = {
  itemId: string;
  itemName: string;
  itemCategory: string;
  price?: number;
  quantity?: number;
};

function toGoogleItem(item: CommerceItem) {
  return {
    item_id: item.itemId,
    item_name: item.itemName,
    item_category: item.itemCategory,
    price: item.price,
    quantity: item.quantity ?? 1
  };
}

export function ViewItemAnalytics({
  currency,
  value,
  item
}: {
  currency: string;
  value: number;
  item: CommerceItem;
}) {
  useEffect(() => {
    trackAnalyticsEvent("view_item", {
      currency,
      value,
      items: [toGoogleItem(item)]
    });
  }, [currency, item, value]);

  return null;
}

export function PurchaseAnalytics({
  dedupeKey,
  currency,
  value,
  item
}: {
  dedupeKey: string;
  currency?: string;
  value?: number;
  item: CommerceItem;
}) {
  useEffect(() => {
    const storageKey = `treeschool:analytics-purchase:${dedupeKey}`;
    if (window.localStorage.getItem(storageKey)) return;

    trackAnalyticsEvent("purchase", {
      currency,
      event_id: dedupeKey,
      value,
      transaction_id: dedupeKey,
      items: [toGoogleItem(item)]
    });
    window.localStorage.setItem(storageKey, "1");
  }, [
    currency,
    dedupeKey,
    item,
    value
  ]);

  return null;
}
