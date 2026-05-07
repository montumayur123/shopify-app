import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";

//  No api parameter — everything comes from global shopify object in 2025-10+
export default async () => {
  render(<CancelModal />, document.body);
};

function CancelModal() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  async function confirmCancel() {
    setLoading(true);
    setError(null);
    try {
      //  Session token from global shopify object
      const token = await shopify.sessionToken.get();

      console.log(token);

      console.log("hhhhhhhhhhhhhhhhhhhhhh");


      const APP_URL = process.env.APP_URL;
      console.log("APP_URL:", APP_URL);

      const res = await fetch(`${APP_URL}/api/cancel-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Pass token so backend can verify the request
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: shopify.orderId,
          }),
        }
      );

      const result = await res.json();
      console.log("Cancel result:", JSON.stringify(result));

      if (!res.ok || result.error) {
        setError(result.error || "Failed to cancel order. Please try again.");
      } else {
        setSuccess(true);
        // ui.overlay from global shopify object
        setTimeout(() => shopify.close(), 2000);
      }
    } catch (e) {
      console.error("Cancel failed:", e);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <s-customer-account-action heading="Cancel order">
      {success && (
        <s-banner status="success">
          <s-text>
            ✅ Your order has been cancelled! Refund will arrive in 5–7 business days.
          </s-text>
        </s-banner>
      )}
      {!success && (
        <s-text>
          Are you sure you want to cancel this order? Your refund will go back to your original payment method.
        </s-text>
      )}
      {error && (
        <s-banner status="critical">
          <s-text>{error}</s-text>
        </s-banner>
      )}
      {!success && (
        <s-button slot="primary-action" tone="critical" loading={loading} onclick={confirmCancel}>
          Yes, cancel order
        </s-button>
      )}
      {!success && (
        <s-button slot="secondary-actions" onclick={() => shopify.close()} disabled={loading}>
          Go back
        </s-button>
      )}
    </s-customer-account-action>
  );
}