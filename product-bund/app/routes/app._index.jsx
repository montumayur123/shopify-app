import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

const GET_FUNCTIONS = `
  query {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
        app {
          title
        }
      }
    }
  }
`;

const REGISTER_CART_TRANSFORM = `
  mutation cartTransformCreate($functionId: String!) {
    cartTransformCreate(functionId: $functionId, blockOnFailure: false) {
      cartTransform {
        id
        functionId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Step 1: Get all functions registered for this app
  const functionsResponse = await admin.graphql(GET_FUNCTIONS);
  const functionsData = await functionsResponse.json();

  const functions = functionsData?.data?.shopifyFunctions?.nodes ?? [];
  console.log("ALL FUNCTIONS:", JSON.stringify(functions, null, 2));

  // Step 2: Find our cart_transform function
  const cartTransformFunction = functions.find(
    (fn) => fn.apiType === "cart_transform"
  );

  if (!cartTransformFunction) {
    console.log("Cart transform function NOT found. Run shopify app dev first.");
    return { status: "not_found", functionId: null };
  }

  console.log("FOUND FUNCTION:", cartTransformFunction.id);

  // Step 3: Register the function on the store
  const registerResponse = await admin.graphql(REGISTER_CART_TRANSFORM, {
    variables: { functionId: cartTransformFunction.id },
  });

  const registerData = await registerResponse.json();
  const errors = registerData?.data?.cartTransformCreate?.userErrors ?? [];

  if (errors.length > 0) {
    console.log("REGISTRATION ERRORS:", JSON.stringify(errors));
    // "already registered" error is fine — means it's already active
    return { status: "already_registered", functionId: cartTransformFunction.id };
  }

  console.log("REGISTERED:", registerData?.data?.cartTransformCreate?.cartTransform);
  return { status: "registered", functionId: cartTransformFunction.id };
};

export default function Index() {
  const { status, functionId } = useLoaderData();

  const statusMap = {
    registered: "✅ Cart Transform registered successfully!",
    already_registered: "✅ Already registered and active",
    not_found: "❌ Function not found — make sure shopify app dev is running",
  };

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
      <h1>Bundle App</h1>
      <p><strong>Status:</strong> {statusMap[status] ?? status}</p>
      {functionId && (
        <p><strong>Function ID:</strong> <code>{functionId}</code></p>
      )}
      <hr />
      <h2>How to test your bundle:</h2>
      <ol>
        <li>Create a product in Shopify Admin</li>
        <li>Add <code>component_reference</code> metafield to the variant with child variant IDs</li>
        <li>Add <code>component_quantities</code> metafield with quantities</li>
        <li>Add the bundle product to cart on your storefront</li>
        <li>Check the terminal for function logs</li>
      </ol>
    </div>
  );
}