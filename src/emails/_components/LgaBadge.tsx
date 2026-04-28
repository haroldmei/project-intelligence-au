import React from "react";

export function LgaBadge({ lga }: { lga: string }): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        backgroundColor: "#FEF3C7",
        color: "#78350F",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: "500",
        marginRight: "8px",
      }}
    >
      {lga}
    </span>
  );
}
