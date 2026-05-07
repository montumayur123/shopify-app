import { authenticate } from "../shopify.server";
import db from "../db.server";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const processingOrders = new Set();

// ─── GraphQL Helper ───────────────────────────────────────────────────────────

async function gql(shop, accessToken, query, variables = {}) {
  const res = await fetch(
    `https://${shop}/admin/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await res.json();

  if (json.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(json.errors)}`);
  }

  // Surface any userErrors from mutations
  const mutationKey = Object.keys(json.data || {})[0];
  const userErrors = json.data?.[mutationKey]?.userErrors;
  if (userErrors?.length) {
    throw new Error(`UserErrors: ${JSON.stringify(userErrors)}`);
  }

  return json.data;
}

async function getSplitTags(shop) {
  const setting = await db.splitTagSetting.findUnique({
    where: { shop },
  });

  if (!setting?.tags) {
    console.log(`⚙️ No split tags configured for shop: ${shop}`);
    return [];
  }

  return setting.tags
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// ─── Queries & Mutations ──────────────────────────────────────────────────────

/** Fetch order status + product tags for all line items in one query */
async function fetchOrderDetails(shop, accessToken, orderId) {
  // GraphQL global ID format
  const gid = `gid://shopify/Order/${orderId}`;

  const data = await gql(shop, accessToken, `
    query GetOrderDetails($id: ID!) {
      order(id: $id) {
        id
        name
        cancelledAt
        tags
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              quantity
              variant {
                id
                price
              }
              product {
                tags
              }
            }
          }
        }
      }
    }
  `, { id: gid });

  return data.order;
}

/** Cancel order via GraphQL */
async function cancelOrder(shop, accessToken, orderId) {
  const gid = `gid://shopify/Order/${orderId}`;

  return gql(shop, accessToken, `
    mutation CancelOrder($orderId: ID!, $reason: OrderCancelReason!, $notifyCustomer: Boolean!) {
      orderCancel(
        orderId: $orderId
        reason: $reason
        notifyCustomer: $notifyCustomer
        refund: false
        restock: false
      ) {
        userErrors {
          field
          message
        }
      }
    }
  `, {
    orderId: gid,
    reason: "OTHER",
    notifyCustomer: false,
  });
}

/** Create a draft order via GraphQL */
async function createDraftOrder(shop, accessToken, lineItems, originalOrder, groupLabel) {
  const data = await gql(shop, accessToken, `
    mutation CreateDraftOrder($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          legacyResourceId
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    input: {
      lineItems: lineItems.map((item) => ({
        variantId: item.variantId,
        quantity:  item.quantity,
      })),

      // Customer
      ...(originalOrder.customer?.id
        ? { customerId: `gid://shopify/Customer/${originalOrder.customer.id}` }
        : {}),
      email: originalOrder.email,

      // Addresses
      shippingAddress: formatAddress(originalOrder.shipping_address),
      billingAddress:  formatAddress(originalOrder.billing_address),

      // Shipping
      ...(originalOrder.shipping_lines?.[0]
        ? {
            shippingLine: {
              title: originalOrder.shipping_lines[0].title,
              price: originalOrder.shipping_lines[0].price,
            },
          }
        : {}),

      note: `Split [${groupLabel.toUpperCase()}] from original order #${originalOrder.order_number}`,
      tags: [
      "split-order",
      `${originalOrder.order_number}-${groupLabel}`,
    ]
    },
  });

  return data.draftOrderCreate.draftOrder;
}

/** Complete a draft order → real order */
async function completeDraftOrder(shop, accessToken, draftGid) {
  const data = await gql(shop, accessToken, `
    mutation CompleteDraftOrder($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder {
          id
          order {
            id
            legacyResourceId
            name
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { id: draftGid });

  return data.draftOrderComplete.draftOrder;
}

/** Complete with retry for "still calculating" error */
async function completeDraftWithRetry(shop, accessToken, draftGid, retries = 6, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await completeDraftOrder(shop, accessToken, draftGid);
    } catch (err) {
      const stillCalculating =
        err.message.includes("not finished calculating") ||
        err.message.includes("CALCULATING");

      if (stillCalculating && attempt < retries) {
        console.log(`⏳ Draft still calculating — retry ${attempt}/${retries}`);
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
}

// ─── Address formatter (webhook payload → GraphQL MailingAddressInput) ────────

function formatAddress(addr) {
  if (!addr) return undefined;
  return {
    firstName: addr.first_name,
    lastName:  addr.last_name,
    address1:  addr.address1,
    address2:  addr.address2,
    city:      addr.city,
    province:  addr.province_code,
    country:   addr.country_code,
    zip:       addr.zip,
    phone:     addr.phone,
    company:   addr.company,
  };
}

// ─── Resolve tag → group ──────────────────────────────────────────────────────

function resolveGroup(productTags, splitTags) {
  const lower = productTags.map((t) => t.toLowerCase());

  // Return the first splitTag that this product has
  const match = splitTags.find((splitTag) => lower.includes(splitTag));

  return match ?? "other";
}

// ─── Core split logic ─────────────────────────────────────────────────────────

async function processSplitOrder(shop, accessToken, originalOrder) {
  const orderId = originalOrder.id;

  if (processingOrders.has(orderId)) {
    console.log(`🔒 Already processing ${orderId}`);
    return;
  }
  processingOrders.add(orderId);

  try {
    // ── STEP 1: load split tags from DB ──────────────────────────────────────
    const splitTags = await getSplitTags(shop);

    if (splitTags.length === 0) {
      console.log("⚙️ No split tags saved — nothing to do");
      return;
    }

    console.log(`🏷 Split tags:`, splitTags);

    // ── STEP 2: fetch order + product tags (1 GraphQL call) ──────────────────
    const order = await fetchOrderDetails(shop, accessToken, orderId);

    // Loop guard
    if (order.tags?.map((t) => t.toLowerCase()).includes("split-order")) {
      console.log(`⏭ Skipping split-order #${order.name}`);
      return;
    }

    // Retry guard
    if (order.cancelledAt) {
      console.log(`⏭ Order ${orderId} already cancelled — skipping retry`);
      return;
    }

    console.log(`🔀 Processing split for order: ${order.name}`);

    // ── STEP 3: group items using DB tags ─────────────────────────────────────
    const lineItems = order.lineItems.edges.map(({ node }) => ({
      variantId: node.variant?.id,
      quantity:  node.quantity,
      title:     node.title,
      tags:      node.product?.tags || [],
      group:     resolveGroup(node.product?.tags || [], splitTags), // ← uses DB tags
    }));

    lineItems.forEach((item) =>
      console.log(`  • "${item.title}" → group: ${item.group}`)
    );

    const groups = lineItems.reduce((acc, item) => {
      acc[item.group] = acc[item.group] || [];
      acc[item.group].push(item);
      return acc;
    }, {});

    const activeGroups = Object.entries(groups).filter(([, items]) => items.length > 0);

    if (activeGroups.length <= 1) {
      console.log("⏭ No split needed — all items same group");
      return;
    }

    // ── STEP 4: cancel original ───────────────────────────────────────────────
    await cancelOrder(shop, accessToken, orderId);
    console.log(`❌ Cancelled original order: ${order.name}`);

    // ── STEP 5: create one order per group ───────────────────────────────────
    const results = [];
    for (const [label, items] of activeGroups) {
      console.log(`📝 Creating draft [${label}] with ${items.length} item(s)...`);

      const draft = await createDraftOrder(shop, accessToken, items, originalOrder, label);
      console.log(`✅ Draft [${label}]: ${draft.id}`);

      await sleep(3000);

      const completed = await completeDraftWithRetry(shop, accessToken, draft.id);
      console.log(`✅ Real order [${label}]: ${completed.order.name}`);

      results.push({
        group:     label,
        draftId:   draft.legacyResourceId,
        orderId:   completed.order.legacyResourceId,
        orderName: completed.order.name,
      });

      await sleep(1000);
    }

    console.log("🎉 Split complete:", JSON.stringify(results, null, 2));

  } catch (err) {
    console.error(`❌ Split failed for order ${orderId}:`, err.message);
  } finally {
    setTimeout(() => processingOrders.delete(orderId), 120_000);
  }
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { topic, shop, session, payload: originalOrder } =
    await authenticate.webhook(request);

  console.log(`📦 Webhook [${topic}] received — order: ${originalOrder?.id}`);

  const accessToken = session?.accessToken;
  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  processSplitOrder(shop, accessToken, originalOrder);

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};