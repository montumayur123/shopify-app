import shopify, { authenticate } from "../shopify.server";

// ✅ Only fix — define json helper since @remix-run/node json is deprecated
const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const loader = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const action = async ({ request }) => {
  const method = request.method;
  if (method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  try {
    const { sessionToken } = await authenticate.public.customerAccount(request);
    const shop = sessionToken.dest?.startsWith("http")
      ? new URL(sessionToken.dest).host
      : sessionToken.dest;
    console.log("Shop:", shop);
    const { admin } = await shopify.unauthenticated.admin(shop);
    if (method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }
    let body = null;
    try {
      body = await request.json();
    } catch (e) {
      return json(
        { error: "Invalid JSON body" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const { orderId } = body;
    console.log("Cancelling order:", orderId);
    if (!orderId) {
      return json(
        { error: "Order ID is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const response = await admin.graphql(
      `#graphql
      mutation OrderCancel(
        $orderId: ID!
        $reason: OrderCancelReason!
        $restock: Boolean!
        $notifyCustomer: Boolean
        $refundMethod: OrderCancelRefundMethodInput!
      ) {
        orderCancel(
          orderId: $orderId
          reason: $reason
          restock: $restock
          notifyCustomer: $notifyCustomer
          refundMethod: $refundMethod
        ) {
          job { id done }
          orderCancelUserErrors { message code }
          userErrors { message }
        }
      }`,
      {
        variables: {
          orderId,
          reason: "CUSTOMER",
          restock: true,
          notifyCustomer: true,
          refundMethod: {
            originalPaymentMethodsRefund: true,
          },
        },
      }
    );
    const data = await response.json();
    console.log("GraphQL result:", JSON.stringify(data));
    const result = data?.data?.orderCancel;
    const errors = [
      ...(result?.orderCancelUserErrors || []),
      ...(result?.userErrors || []),
    ];
    if (errors.length > 0) {
      return json(
        { error: errors[0].message },
        { status: 422, headers: CORS_HEADERS }
      );
    }
    return json(
      { success: true, job: result?.job },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Cancel order error:", err);
    return json(
      { error: "Something went wrong. Please try again." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};