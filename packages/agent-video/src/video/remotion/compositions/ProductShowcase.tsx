import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface ProductShowcaseProps {
  productName: string;
  features: string[];
  imageUrl: string;
  price: string;
}

export const ProductShowcase: React.FC<ProductShowcaseProps> = ({
  productName,
  features,
  imageUrl,
  price,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });

  return (
    <AbsoluteFill
      style={{
        background: BACKGROUND_GRADIENTS.light_minimal,
        padding: 60,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{
            width: 480,
            height: 480,
            objectFit: "cover",
            borderRadius: 24,
            transform: `scale(${scale})`,
            marginBottom: 40,
          }}
        />
      ) : null}
      <h1 style={{ ...VERTICAL_TEXT, color: "#111", fontSize: 56 }}>{productName}</h1>
      {features.map((f, i) => (
        <p
          key={i}
          style={{
            ...VERTICAL_TEXT,
            color: "#333",
            fontSize: 32,
            marginTop: 12,
          }}
        >
          ✓ {f}
        </p>
      ))}
      {price ? (
        <p
          style={{
            ...VERTICAL_TEXT,
            color: "#2563eb",
            fontSize: 48,
            fontWeight: 800,
            marginTop: 32,
          }}
        >
          {price}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};
