import "@shopify/ui-extensions/preact";
import { render } from "preact";

export default async () => {
  let canCancel = false;

  try {
    // Query Customer Account API to check if order can be cancelled
    const res = await fetch(
      "shopify://customer-account/api/2026-04/graphql.json",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query GetOrder($orderId: ID!) {
            order(id: $orderId) {
              cancelledAt
              fulfillmentStatus
            }
          }`,
          variables: {
            orderId: shopify.orderId,
          },
        }),
      }
    );

    const json = await res.json();
    console.log("Order check:", JSON.stringify(json));
    const order = json?.data?.order;

    // Show button only if order is NOT cancelled and NOT fulfilled
    canCancel =
      order &&
      !order.cancelledAt &&
      order.fulfillmentStatus !== "FULFILLED" &&
      order.fulfillmentStatus !== "PARTIALLY_FULFILLED";

  } catch (e) {
    console.error("Order check failed:", e);
    canCancel = false;
  }

  render(<CancelButton show={canCancel} />, document.body);
};

function CancelButton({ show }) {
  // Hide if order cannot be cancelled
  if (!show) return null;

  // No onPress or to = auto connects to CancelModal.jsx
  return (
    <s-button tone="critical">Cancel order</s-button>
  );
}