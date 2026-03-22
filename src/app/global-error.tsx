"use client";

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#000", margin: 0 }}>
        <div
          style={{
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontFamily: "Inter, sans-serif",
            gap: "16px",
          }}
        >
          <div style={{ fontSize: "18px", fontWeight: 600 }}>
            Something went wrong
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "white",
              color: "black",
              border: "none",
              padding: "10px 24px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
