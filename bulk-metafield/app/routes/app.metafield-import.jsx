import { useState, useCallback, useRef } from "react";

// ─── ACTION (server-side) ────────────────────────────────────────────────────
export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { admin } = await authenticate.admin(request);
  const rows = await request.json();
  const results = [];

  for (const row of rows) {
    try {
      const checkResponse = await admin.graphql(
        `#graphql
        query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!) {
          metafieldDefinitions(first: 100, ownerType: $ownerType) {
            nodes { id namespace key }
          }
        }`,
        { variables: { ownerType: row.ownerType } }
      );

      const checkData = await checkResponse.json();
      const exists = checkData.data.metafieldDefinitions.nodes.find(
        (item) => item.namespace === row.namespace && item.key === row.key
      );

      if (exists) {
        results.push({ name: row.name, status: "skipped" });
        continue;
      }

      const createResponse = await admin.graphql(
        `#graphql
        mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id name }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            definition: {
              name: row.name,
              namespace: row.namespace,
              key: row.key,
              type: row.type,
              ownerType: row.ownerType,
            },
          },
        }
      );

      const createData = await createResponse.json();
      const userErrors = createData.data.metafieldDefinitionCreate.userErrors;

      if (userErrors.length > 0) {
        results.push({ name: row.name, status: "error", error: userErrors.map((e) => e.message).join(", ") });
      } else {
        results.push({ name: row.name, status: "created" });
      }
    } catch (error) {
      results.push({ name: row.name, status: "error", error: error.message });
    }
  }

  return Response.json({ success: true, results });
}

// ─── TYPE OPTIONS ────────────────────────────────────────────────────────────
const TYPE_GROUPS = [
  {
    label: "Single Value",
    options: [
      { label: "Single line text", value: "single_line_text_field" },
      { label: "Multi-line text", value: "multi_line_text_field" },
      { label: "Rich text", value: "rich_text_field" },
      { label: "Integer", value: "number_integer" },
      { label: "Decimal", value: "number_decimal" },
      { label: "Date", value: "date" },
      { label: "Date & time", value: "date_time" },
      { label: "Boolean", value: "boolean" },
      { label: "URL", value: "url" },
      { label: "Color", value: "color" },
      { label: "Dimension", value: "dimension" },
      { label: "Volume", value: "volume" },
      { label: "Weight", value: "weight" },
      { label: "Rating", value: "rating" },
      { label: "Money", value: "money" },
      { label: "JSON", value: "json" },
    ],
  },
  {
    label: "List (multiple values)",
    options: [
      { label: "List: single line text", value: "list.single_line_text_field" },
      { label: "List: integer", value: "list.number_integer" },
      { label: "List: decimal", value: "list.number_decimal" },
      { label: "List: date", value: "list.date" },
      { label: "List: date & time", value: "list.date_time" },
      { label: "List: color", value: "list.color" },
      { label: "List: URL", value: "list.url" },
      { label: "List: dimension", value: "list.dimension" },
      { label: "List: rating", value: "list.rating" },
    ],
  },
  {
    label: "Reference",
    options: [
      { label: "Product reference", value: "product_reference" },
      { label: "Variant reference", value: "variant_reference" },
      { label: "Collection reference", value: "collection_reference" },
      { label: "Page reference", value: "page_reference" },
      { label: "File reference", value: "file_reference" },
      { label: "Metaobject reference", value: "metaobject_reference" },
      { label: "List: product ref", value: "list.product_reference" },
      { label: "List: file ref", value: "list.file_reference" },
      { label: "List: metaobject ref", value: "list.metaobject_reference" },
    ],
  },
];

const OWNER_OPTIONS = [
  { label: "Product", value: "PRODUCT" },
  { label: "Customer", value: "CUSTOMER" },
  { label: "Collection", value: "COLLECTION" },
  { label: "Order", value: "ORDER" },
  { label: "Article", value: "ARTICLE" },
  { label: "Page", value: "PAGE" },
  { label: "Blog", value: "BLOG" },
  { label: "Shop", value: "SHOP" },
];

function toKey(name) {
  return name.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// ─── PAGE COMPONENT ──────────────────────────────────────────────────────────
export default function MetafieldImportPage() {
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  // ── Global settings (applied to ALL rows) ─────────────────────────────────
  const [globalOwnerType, setGlobalOwnerType] = useState("PRODUCT");
  const [globalType, setGlobalType] = useState("single_line_text_field");
  const [globalNamespace, setGlobalNamespace] = useState("custom");

  const fileInputRef = useRef(null);

  // ── Parse CSV ──────────────────────────────────────────────────────────────
  const parseCSV = useCallback((text, name) => {
    const lines = text.trim().split(/\r?\n/);
    const start = lines[0].trim().toLowerCase().replace(/"/g, "") === "name" ? 1 : 0;

    const parsed = lines
      .slice(start)
      .map((line) => line.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .map((metafieldName, index) => ({
        id: index,
        name: metafieldName,
        key: toKey(metafieldName),
        status: "pending",
      }));

    setRows(parsed);
    setSelectedIds(new Set(parsed.map((r) => r.id)));
    setFileName(name);
  }, []);

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => parseCSV(ev.target.result, file.name);
      reader.readAsText(file);
    },
    [parseCSV]
  );

  // ── Checkbox selection ─────────────────────────────────────────────────────
  const toggleRow = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const pendingRows = rows.filter((r) => r.status !== "created");
  const allSelected = pendingRows.length > 0 && selectedIds.size === pendingRows.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.filter((r) => r.status !== "created").map((r) => r.id)));
    }
  }, [allSelected, rows]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const toCreate = rows
      .filter((r) => selectedIds.has(r.id) && r.status !== "created")
      .map((r) => ({
        ...r,
        namespace: globalNamespace,
        type: globalType,
        ownerType: globalOwnerType,
      }));

    if (!toCreate.length) return;
    setLoading(true);

    try {
      const response = await fetch("/app/metafield-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toCreate),
      });

      const data = await response.json();

      setRows((prev) =>
        prev.map((row) => {
          const result = data.results?.find((r) => r.name === row.name);
          if (!result) return row;
          return { ...row, status: result.status };
        })
      );

      shopify.toast.show(
        `Done: ${data.results.filter((r) => r.status === "created").length} created, ` +
          `${data.results.filter((r) => r.status === "skipped").length} skipped, ` +
          `${data.results.filter((r) => r.status === "error").length} failed`
      );
    } catch (err) {
      shopify.toast.show("Something went wrong. Please try again.", { isError: true });
    } finally {
      setLoading(false);
    }
  }, [rows, selectedIds, globalNamespace, globalType, globalOwnerType]);

  // ── Status badge ───────────────────────────────────────────────────────────
  const statusBadge = (status) => {
    switch (status) {
      case "created":  return <s-badge tone="success">Created</s-badge>;
      case "skipped":  return <s-badge tone="info">Already exists</s-badge>;
      case "error":    return <s-badge tone="critical">Failed</s-badge>;
      default:         return <s-badge tone="neutral">Pending</s-badge>;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <s-page heading="Metafield Bulk Creator">
      {rows.length > 0 && (
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={selectedIds.size === 0 || loading}
          onClick={handleSubmit}
        >
          {loading ? "Creating…" : `Create ${selectedIds.size} selected`}
        </s-button>
      )}

      <s-stack gap="base">

        {/* ── Step 1: Upload ──────────────────────────────────────────────── */}
        <s-section heading="Step 1 — Upload CSV">
          <s-stack gap="base">
            <s-text>
              Upload a CSV with one metafield name per row (with or without a header).
            </s-text>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <s-stack direction="inline" gap="base" align-items="center">
              <s-button
                variant="secondary"
                icon="import"
                onClick={() => fileInputRef.current?.click()}
              >
                {fileName ? "Replace CSV" : "Upload CSV"}
              </s-button>

              {fileName && (
                <s-text tone="subdued">
                  {fileName} — {rows.length} row{rows.length !== 1 ? "s" : ""}
                </s-text>
              )}
            </s-stack>

            <s-box padding="base" background="subdued" border-radius="base">
              <s-stack gap="small">
                <s-text tone="subdued">Expected CSV format (name only):</s-text>
                <s-text tone="subdued">
                  name<br />Fabric Type<br />Care Instructions<br />Birth Date
                </s-text>
              </s-stack>
            </s-box>
          </s-stack>
        </s-section>

        {/* ── Step 2: Global Settings ─────────────────────────────────────── */}
        {rows.length > 0 && (
          <s-section heading="Step 2 — Configure Type & Owner">
            <s-text tone="subdued">
              These settings will be applied to all selected metafields when you create them.
            </s-text>

            <s-stack gap="base">
              {/* Namespace */}
              <s-text-field
                label="Namespace"
                value={globalNamespace}
                onChange={(e) => setGlobalNamespace(e.target.value)}
                helpText="Applied to all metafields (e.g. custom)"
              />

              {/* Owner Type */}
              <s-select
                label="Owner Type"
                value={globalOwnerType}
                onChange={(e) => setGlobalOwnerType(e.target.value)}
                helpText="Which resource these metafields belong to"
              >
                {OWNER_OPTIONS.map((opt) => (
                  <s-option key={opt.value} value={opt.value}>
                    {opt.label}
                  </s-option>
                ))}
              </s-select>

              {/* Type */}
              <s-select
                label="Metafield Type"
                value={globalType}
                onChange={(e) => setGlobalType(e.target.value)}
                helpText="Data type applied to all selected metafields"
              >
                {TYPE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((opt) => (
                      <s-option key={opt.value} value={opt.value}>
                        {opt.label}
                      </s-option>
                    ))}
                  </optgroup>
                ))}
              </s-select>
            </s-stack>
          </s-section>
        )}

        {/* ── Step 3: Select Metafields ───────────────────────────────────── */}
        {rows.length > 0 && (
          <s-section heading="Step 3 — Select Metafields">
            <s-stack gap="base">
              {/* Bulk selection bar */}
              <s-grid grid-template-columns="1fr auto" gap="base" align-items="center">
                <s-checkbox
                  label={`${selectedIds.size} of ${rows.length} selected`}
                  checked={allSelected}
                  indeterminate={selectedIds.size > 0 && !allSelected}
                  onChange={toggleAll}
                />
                <s-stack direction="inline" gap="small">
                  <s-button
                    variant="secondary"
                    onClick={() =>
                      setSelectedIds(new Set(rows.filter((r) => r.status !== "created").map((r) => r.id)))
                    }
                  >
                    Select all
                  </s-button>
                  <s-button variant="secondary" onClick={() => setSelectedIds(new Set())}>
                    Deselect all
                  </s-button>
                </s-stack>
              </s-grid>

              {/* Table — name, key, status only (type/owner are global) */}
              <s-table>
                <s-table-row slot="heading">
                  <s-table-cell as-header></s-table-cell>
                  <s-table-cell as-header>Name</s-table-cell>
                  <s-table-cell as-header>Key (auto)</s-table-cell>
                  <s-table-cell as-header>Status</s-table-cell>
                </s-table-row>

                {rows.map((row) => (
                  <s-table-row key={row.id}>
                    <s-table-cell>
                      <s-checkbox
                        checked={selectedIds.has(row.id)}
                        disabled={row.status === "created"}
                        onChange={() => toggleRow(row.id)}
                        accessibilityLabel={`Select ${row.name}`}
                      />
                    </s-table-cell>

                    <s-table-cell>
                      <s-text>{row.name}</s-text>
                    </s-table-cell>

                    <s-table-cell>
                      <s-text tone="subdued">{row.key}</s-text>
                    </s-table-cell>

                    <s-table-cell>{statusBadge(row.status)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table>

              {/* Bottom submit */}
              <s-stack direction="inline" align="end">
                <s-button
                  variant="primary"
                  disabled={selectedIds.size === 0 || loading}
                  onClick={handleSubmit}
                >
                  {loading
                    ? "Creating…"
                    : `Create ${selectedIds.size} selected metafield${selectedIds.size !== 1 ? "s" : ""}`}
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        )}

      </s-stack>
    </s-page>
  );
}