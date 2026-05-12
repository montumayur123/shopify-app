// @ts-check

export function run(input) {
  console.error("FUNCTION RUNNING");

  const operations = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const componentReference = line.merchandise.component_reference?.jsonValue;
    const componentQuantities = line.merchandise.component_quantities?.jsonValue;

    if (!componentReference || !Array.isArray(componentReference)) continue;

    console.error("BUNDLE FOUND:", line.merchandise.id);
    console.error("COMPONENTS:", JSON.stringify(componentReference));

    const expandedCartItems = componentReference.map((variantId, index) => ({
      merchandiseId: variantId,
      quantity: componentQuantities?.[index] ?? 1,
    }));

    operations.push({
      lineExpand: {                // ✅ fixed key
        cartLineId: line.id,
        expandedCartItems,
      },
    });
  }

  console.error("TOTAL OPERATIONS:", operations.length);
  return { operations };
}