import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const { query, applyCartLinesChange, lines, i18n } = shopify;

  const [products, setProducts] = useState([]);
  

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data } = await query(`
      query {
        products(first: 4) {
          nodes {
            id
            title
            images(first: 1) {
              nodes {
                url
              }
            }
            variants(first: 1) {
              nodes {
                id
                price {
                  amount
                }
              }
            }
          }
        }
      }
    `);

    setProducts(data.products.nodes);
  }

  async function addToCart(variantId) {
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });

    
  }
  async function removeFromCart(lineId) {
  const result = await applyCartLinesChange({
    type: "removeCartLine",
    id: lineId,
    quantity: 1,
  });

  
}

  if (!products.length) return null;

  return (
    <s-stack gap="base">

      <s-divider />

      <s-heading>
        You May Also Like
      </s-heading>

      {products.map((p) => {
        const variant = p.variants.nodes[0];

        const imageUrl =
          p.images.nodes[0]?.url ??
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png";
        const line = lines.value.find(
          (item) => item.merchandise.id === variant.id
        );

        const isAdded = !!line;

        return (
          <s-box
            key={p.id}
            border="base"
            cornerRadius="large"
            padding="base"
          >

            <s-grid
              gridTemplateColumns="70px 1fr auto"
              gap="base"
              alignItems="center"
            >

              <s-image
                src={imageUrl}
                alt={p.title}
                aspectRatio="1"
                cornerRadius="medium"
              />

              <s-stack gap="none">

                <s-text type="strong">
                  {p.title}
                </s-text>

                <s-text appearance="subdued">
                  {i18n.formatCurrency(variant.price.amount)}
                </s-text>

              </s-stack>

              <s-button
                  size="slim"
                  variant="secondary"
                  onClick={() =>
                    isAdded
                      ? removeFromCart(line.id, p.id)
                      : addToCart(variant.id, p.id)
                  }
                >
                  {isAdded ? "Remove" : "Add"}
                </s-button>

            </s-grid>

          </s-box>
        );
      })}
    </s-stack>
  );
}