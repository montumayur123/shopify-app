import React from "react";
import NewPromotion from "./NewPromotion";
import { createRoot } from "react-dom/client";

const mapclubWidgetElement = document.getElementById("promotion-root");
if (mapclubWidgetElement) {
  createRoot(mapclubWidgetElement).render(
      <NewPromotion />
  );
}
