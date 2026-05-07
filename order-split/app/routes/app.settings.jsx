import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const setting = await db.splitTagSetting.findUnique({
    where: { shop: session.shop },
  });

  const tags = setting?.tags
    ? setting.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  return { tags };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const rawTags  = formData.get("tags") || "";

  const cleaned = [
    ...new Set(
      rawTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].join(",");

  await db.splitTagSetting.upsert({
    where:  { shop: session.shop },
    update: { tags: cleaned },
    create: { shop: session.shop, tags: cleaned },
  });

  return { ok: true, tags: cleaned };
};

// ─── UI ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { tags: savedTags }  = useLoaderData();
  const fetcher              = useFetcher();

  const [tags,  setTags]  = useState(savedTags);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const isSaving = fetcher.state === "submitting";
  const savedOk  = fetcher.data?.ok && !isSaving;

  function addTag() {
    const val = input.trim().toLowerCase();
    if (!val) return;
    if (!/^[a-z0-9-_]+$/.test(val)) {
      setError("Tags can only contain letters, numbers, hyphens and underscores");
      return;
    }
    if (tags.includes(val)) {
      setError(`"${val}" is already added`);
      return;
    }
    setTags([...tags, val]);
    setInput("");
    setError("");
  }

  function removeTag(tag) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
    if (e.key === "Escape") { setInput(""); setError(""); }
  }

  const pill = (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 12px 5px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500,
    background: color === "blue"  ? "var(--color-background-info)"    : "var(--color-background-secondary)",
    color:      color === "blue"  ? "var(--color-text-info)"          : "var(--color-text-secondary)",
    border:     color === "ghost" ? "1px dashed var(--color-border-secondary)" : "none",
  });

  return (
    <div style={{ maxWidth: 600, margin: "48px auto", padding: "0 24px" }}>

      {/* Page header */}
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 6px", color: "var(--color-text-primary)" }}>
        Order split settings
      </h1>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 32px" }}>
        When a customer orders products with different split tags in the same cart,
        the order is automatically cancelled and replaced with one order per tag group.
      </p>

      {/* Tag manager card */}
      <div style={{
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        background: "var(--color-background-secondary)",
      }}>
        <label style={{ fontSize: 14, fontWeight: 500, display: "block", marginBottom: 4, color: "var(--color-text-primary)" }}>
          Split tags
        </label>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
          Must match your Shopify product tags exactly (case-insensitive)
        </p>

        {/* Pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, minHeight: 40, alignItems: "center" }}>
          {tags.length === 0
            ? <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No tags yet — add one below</span>
            : tags.map((tag) => (
                <span key={tag} style={pill("blue")}>
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    title={`Remove ${tag}`}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: "0 0 0 2px", lineHeight: 1, fontSize: 16,
                      color: "var(--color-text-info)", display: "flex", alignItems: "center",
                    }}
                  >×</button>
                </span>
              ))
          }
        </div>

        {/* Input row */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. winter"
            style={{
              flex: 1, padding: "9px 12px", fontSize: 14,
              border: `1px solid ${error ? "var(--color-border-danger)" : "var(--color-border-secondary)"}`,
              borderRadius: 8,
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={addTag}
            style={{
              padding: "9px 18px", fontSize: 14, fontWeight: 500,
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-secondary)",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: "6px 0 0" }}>
            {error}
          </p>
        )}
      </div>

      {/* Save row */}
      <fetcher.Form method="post">
        <input type="hidden" name="tags" value={tags.join(",")} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              padding: "10px 24px", fontSize: 14, fontWeight: 500,
              background: "var(--color-text-primary)",
              color: "var(--color-background-primary)",
              border: "none", borderRadius: 8,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? "Saving…" : "Save settings"}
          </button>

          {savedOk && (
            <span style={{ fontSize: 13, color: "var(--color-text-success)" }}>
              ✓ Settings saved
            </span>
          )}
        </div>
      </fetcher.Form>

      {/* Preview box */}
      {tags.length > 0 && (
        <div style={{
          marginTop: 32, padding: 16,
          border: "1px solid var(--color-border-tertiary)",
          borderRadius: 8, fontSize: 13,
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
        }}>
          <strong style={{ color: "var(--color-text-primary)" }}>How this works:</strong>
          <br />
          If an order contains products tagged{" "}
          {tags.map((t, i) => (
            <span key={t}>
              <code style={{
                background: "var(--color-background-primary)",
                padding: "1px 6px", borderRadius: 4, fontSize: 12,
                color: "var(--color-text-primary)",
              }}>{t}</code>
              {i < tags.length - 1 ? " and " : ""}
            </span>
          ))}{" "}
          it will be split into <strong style={{ color: "var(--color-text-primary)" }}>
            {tags.length} separate order{tags.length > 1 ? "s" : ""}
          </strong>.
        </div>
      )}
    </div>
  );
}