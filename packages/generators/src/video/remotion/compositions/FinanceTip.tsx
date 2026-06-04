import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface FinanceTipProps {
  tip: string;
  data: Array<{ label: string; value: string }>;
}

export const FinanceTip: React.FC<FinanceTipProps> = ({ tip, data }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: BACKGROUND_GRADIENTS.dark_luxury,
        padding: 80,
        justifyContent: "center",
      }}
    >
      <div style={{ opacity }}>
        <p style={{ ...VERTICAL_TEXT, fontSize: 56, fontWeight: 700 }}>{tip}</p>
        <div style={{ marginTop: 48 }}>
          {data.map((row, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 20,
                borderBottom: "1px solid rgba(255,255,255,0.2)",
                paddingBottom: 12,
              }}
            >
              <span style={{ ...VERTICAL_TEXT, fontSize: 32 }}>{row.label}</span>
              <span
                style={{
                  ...VERTICAL_TEXT,
                  fontSize: 32,
                  color: "#f5af19",
                  fontWeight: 700,
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
