import { useState } from "react";

export default function NewPromotion() {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = { title, code, value };

    try {
      const res = await fetch("/apps/promotion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log("RESULT:", data);
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <s-page heading="Create Promotion">
      <s-stack direction="block" gap="base">
        <s-text variant="headingLg">New Promotion</s-text>

        {/* 👇 replaced Form with normal form */}
        <form onSubmit={handleSubmit}>
          <s-stack direction="block" gap="base">

            <s-text-field
              label="Promotion title"
              name="title"
              placeholder="e.g. Summer Sale"
              value={title}
              onInput={(e) => setTitle(e.target.value)}
              required
            />

            <s-text-field
              label="Discount code"
              name="code"
              placeholder="e.g. SUMMER25"
              value={code}
              onInput={(e) => setCode(e.target.value)}
              required
            />

            <s-text-field
              label="Discount value (%)"
              name="value"
              type="number"
              placeholder="10"
              min="1"
              max="100"
              value={value}
              onInput={(e) => setValue(e.target.value)}
              required
            />

            <s-stack direction="inline" gap="base">
              <s-button variant="primary" type="submit">
                Save promotion
              </s-button>

              <s-button
                type="button"
                onClick={() => {
                  setTitle("");
                  setCode("");
                  setValue("");
                }}
              >
                Reset
              </s-button>
            </s-stack>

          </s-stack>
        </form>
      </s-stack>
    </s-page>
  );
}