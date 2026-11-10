const fs = require("fs");
const path = require("path");
const axios = require("axios");
const satori = require("satori").default;
const { Resvg } = require("@resvg/resvg-js");

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const LOGO_PATH = path.join(__dirname, "..", "assets", "logo.png");
const BRAND_GREEN = "#0c831f";
const BRAND_GREEN_LIGHT = "#189a4e";
const BRAND_GREEN_DARK = "#094014";
const BRAND_ORANGE = "#FF6600";
const BRAND_RED = "#e11d48";

let logoDataUriCache = null;
const getLogoDataUri = () => {
  if (!logoDataUriCache) {
    logoDataUriCache = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
  }
  return logoDataUriCache;
};

// Fixed pixel layout budgets per platform — satori/resvg don't clip or
// auto-scale overflowing content, so every section's height is pinned up
// front and must sum to the canvas height exactly, rather than derived from
// percentages of width (which silently overflowed a square 1080 canvas).
const LAYOUTS = {
  instagram: {
    width: 1080,
    height: 1080,
    padding: 44,
    logoHeight: 46,
    headlineHeight: 130,
    footerHeight: 72,
    gap: 18,
    gridCols: 2
  },
  facebook: {
    width: 1200,
    height: 630,
    padding: 30,
    logoHeight: 36,
    headlineHeight: 90,
    footerHeight: 58,
    gap: 14,
    gridCols: 4
  }
};

let fontsCache = null;
const loadFonts = () => {
  if (fontsCache) return fontsCache;
  fontsCache = [
    { name: "Poppins", data: fs.readFileSync(path.join(FONT_DIR, "Poppins-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Poppins", data: fs.readFileSync(path.join(FONT_DIR, "Poppins-SemiBold.ttf")), weight: 600, style: "normal" },
    { name: "Poppins", data: fs.readFileSync(path.join(FONT_DIR, "Poppins-Bold.ttf")), weight: 700, style: "normal" }
  ];
  return fontsCache;
};

// Satori needs each <img> as a data URI (it doesn't fetch remote URLs itself,
// and resvg won't either) — pulled once per generated post, not cached, since
// product photos/prices change.
const toDataUri = async (url) => {
  try {
    const { data, headers } = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    const contentType = headers["content-type"] || "image/jpeg";
    return `data:${contentType};base64,${Buffer.from(data).toString("base64")}`;
  } catch (error) {
    console.error("socialPostGenerator: failed to fetch product image", url, error.message);
    return null;
  }
};

// Plain-object element builder — satori accepts React-element-shaped objects,
// no actual React/JSX needed.
const h = (type, props = {}, children) => ({ type, props: { ...props, children } });

const formatPrice = (n) => `Rs ${Math.round(n)}`;

// Soft, oversized translucent circles bleeding off the canvas edges — a
// cheap, reliable way to make the poster feel designed rather than a flat
// fill, with no AI/network dependency.
const buildDecorativeBlobs = (width, height) => [
  h("div", {
    style: {
      position: "absolute", top: -width * 0.18, right: -width * 0.18,
      width: width * 0.55, height: width * 0.55, borderRadius: "50%",
      background: "rgba(255,255,255,0.07)"
    }
  }),
  h("div", {
    style: {
      position: "absolute", bottom: -width * 0.22, left: -width * 0.15,
      width: width * 0.5, height: width * 0.5, borderRadius: "50%",
      background: "rgba(0,0,0,0.12)"
    }
  }),
  h("div", {
    style: {
      position: "absolute", top: height * 0.32, right: -width * 0.08,
      width: width * 0.22, height: width * 0.22, borderRadius: "50%",
      background: `rgba(255,102,0,0.18)`
    }
  })
];

const buildDiscountBadge = (percentOff, size) =>
  h("div", {
    style: {
      position: "absolute",
      top: -size * 0.18,
      right: -size * 0.18,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "50%",
      background: BRAND_RED,
      border: "3px solid #ffffff",
      transform: "rotate(10deg)"
    }
  }, [
    h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, [
      h("div", { style: { fontSize: size * 0.3, fontWeight: 700, color: "#ffffff", lineHeight: 1 } }, `${percentOff}%`),
      h("div", { style: { fontSize: size * 0.14, fontWeight: 600, color: "#ffffff" } }, "OFF")
    ])
  ]);

const buildProductCard = ({ name, price, oldPrice, imageDataUri }, cardWidth, cardHeight) => {
  const hasDiscount = oldPrice > price;
  const percentOff = hasDiscount ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const imageHeight = Math.round(cardHeight * 0.58);
  const textHeight = cardHeight - imageHeight;
  const badgeSize = Math.round(cardWidth * 0.26);

  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      width: cardWidth,
      height: cardHeight,
      background: "#ffffff",
      borderRadius: 18,
      overflow: "visible",
      boxShadow: "0 8px 20px rgba(0,0,0,0.22)"
    }
  }, [
    h("div", {
      style: { display: "flex", width: cardWidth, height: imageHeight, background: "#f3f4f6", borderRadius: "18px 18px 0 0", overflow: "hidden" }
    }, imageDataUri
      ? [h("img", { src: imageDataUri, width: cardWidth, height: imageHeight, style: { objectFit: "cover" } })]
      : []),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "8px 10px",
        width: cardWidth,
        height: textHeight,
        justifyContent: "center"
      }
    }, [
      h("div", {
        style: { fontSize: Math.min(15, cardWidth * 0.072), fontWeight: 600, color: "#1f2937", lineHeight: 1.15 }
      }, name.length > 22 ? `${name.slice(0, 22)}…` : name),
      h("div", {
        style: { display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }
      }, [
        h("div", { style: { fontSize: Math.min(18, cardWidth * 0.085), fontWeight: 700, color: BRAND_GREEN_DARK } }, formatPrice(price)),
        ...(hasDiscount ? [h("div", {
          style: { fontSize: Math.min(13, cardWidth * 0.06), color: "#9ca3af", textDecoration: "line-through" }
        }, formatPrice(oldPrice))] : [])
      ])
    ]),
    ...(hasDiscount ? [buildDiscountBadge(percentOff, badgeSize)] : [])
  ]);
};

// products: [{ name, price, oldPrice, imageDataUri }], exactly 4.
// backgroundImageDataUri (optional): AI-generated decorative art (no text/logo
// in it — see geminiImageGenerator.js) painted full-bleed behind everything,
// with a brand-colour wash over it so the white text stays legible. Falls
// back to the plain brand gradient + decorative blobs when not provided (no
// API key, generation failed, or the admin didn't ask for one on this post).
const buildTemplate = ({ categoryName, products, layout, backgroundImageDataUri }) => {
  const { width, height, padding, logoHeight, headlineHeight, footerHeight, gap, gridCols } = layout;

  const contentWidth = width - padding * 2;
  const gridRows = Math.ceil(products.length / gridCols);
  const gridHeight = height - padding * 2 - logoHeight - headlineHeight - footerHeight - gap * 3;
  const cardWidth = Math.round((contentWidth - gap * (gridCols - 1)) / gridCols);
  const cardHeight = Math.round((gridHeight - gap * (gridRows - 1)) / gridRows);

  const logoWidth = Math.round(logoHeight * 2.87); // logo.png is 612x213

  const backgroundLayers = backgroundImageDataUri
    ? [
        h("img", {
          src: backgroundImageDataUri,
          width,
          height,
          style: { position: "absolute", top: 0, left: 0, objectFit: "cover" }
        }),
        h("div", {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            background: `linear-gradient(135deg, ${BRAND_GREEN}cc 0%, ${BRAND_GREEN_DARK}e6 100%)`
          }
        })
      ]
    : buildDecorativeBlobs(width, height);

  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      width,
      height,
      background: backgroundImageDataUri ? "#000000" : `linear-gradient(135deg, ${BRAND_GREEN_LIGHT} 0%, ${BRAND_GREEN} 45%, ${BRAND_GREEN_DARK} 100%)`,
      fontFamily: "Poppins",
      overflow: "hidden"
    }
  }, [
    ...backgroundLayers,
    h("div", {
      style: { display: "flex", flexDirection: "column", position: "relative", width, height, padding }
    }, [
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          height: logoHeight,
          width: logoWidth,
          background: "#ffffff",
          borderRadius: 10,
          padding: "4px 10px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.18)"
        }
      }, [
        h("img", { src: getLogoDataUri(), width: logoWidth - 20, height: logoHeight - 8, style: { objectFit: "contain" } })
      ]),
      h("div", {
        style: { display: "flex", flexDirection: "column", height: headlineHeight, justifyContent: "center", marginTop: gap }
      }, [
        h("div", {
          style: { display: "flex", alignItems: "center", gap: 10 }
        }, [
          h("div", { style: { width: 8, height: Math.min(54, headlineHeight * 0.44), borderRadius: 4, background: BRAND_ORANGE } }),
          h("div", { style: { fontSize: Math.min(54, headlineHeight * 0.44), fontWeight: 700, color: "#ffffff", lineHeight: 1.1 } }, categoryName)
        ]),
        h("div", { style: { fontSize: Math.min(24, headlineHeight * 0.2), color: "#d6f5e3", marginTop: 4, marginLeft: 18 } }, "Today's Best Picks")
      ]),
      h("div", {
        style: { display: "flex", flexWrap: "wrap", gap, height: gridHeight, marginTop: gap }
      }, products.map((p) => buildProductCard(p, cardWidth, cardHeight))),
      h("div", {
        style: {
          display: "flex",
          height: footerHeight,
          marginTop: gap,
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(90deg, ${BRAND_ORANGE} 0%, #ff8a3d 100%)`,
          borderRadius: 999,
          boxShadow: "0 6px 16px rgba(0,0,0,0.25)"
        }
      }, [
        h("div", { style: { fontSize: Math.min(26, footerHeight * 0.38), fontWeight: 700, color: "#ffffff" } }, "Order now on GMKart")
      ])
    ])
  ]);
};

// categoryName: string, products: [{ name, price, oldPrice, imageUrl }], platform: 'instagram'|'facebook'.
// backgroundImageDataUri (optional): a pre-generated AI background (already a
// data URI) — pass the result of geminiImageGenerator.generateBackgroundImage
// here; this function never calls Gemini itself, so it stays usable even
// without an API key configured.
// Returns a PNG Buffer.
const generatePromoImage = async ({ categoryName, products, platform, backgroundImageDataUri }) => {
  const layout = LAYOUTS[platform];
  if (!layout) throw new Error(`Unknown platform: ${platform}`);

  const withDataUris = await Promise.all(
    products.map(async (p) => ({ ...p, imageDataUri: p.imageUrl ? await toDataUri(p.imageUrl) : null }))
  );

  const svg = await satori(buildTemplate({ categoryName, products: withDataUris, layout, backgroundImageDataUri }), {
    width: layout.width,
    height: layout.height,
    fonts: loadFonts()
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: layout.width } });
  return resvg.render().asPng();
};

// Composites our REAL logo and a tagline on top of a full-bleed AI-generated
// scene (geminiImageGenerator.generateLifestyleScene) — the scene is asked to
// contain no logo/text of its own, so this is the only text/brand mark on the
// final image, guaranteed accurate. Returns a PNG Buffer.
const generateLifestylePost = async ({ sceneImageDataUri, tagline, platform }) => {
  const layout = LAYOUTS[platform];
  if (!layout) throw new Error(`Unknown platform: ${platform}`);
  const { width, height } = layout;

  const logoHeight = Math.round(height * 0.07);
  const logoWidth = Math.round(logoHeight * 2.87);

  const element = h("div", {
    style: { position: "relative", display: "flex", width, height, fontFamily: "Poppins" }
  }, [
    h("img", { src: sceneImageDataUri, width, height, style: { position: "absolute", top: 0, left: 0, objectFit: "cover" } }),
    h("div", {
      style: {
        position: "absolute",
        top: Math.round(height * 0.04),
        right: Math.round(height * 0.04),
        display: "flex",
        alignItems: "center",
        height: logoHeight,
        width: logoWidth,
        background: "#ffffff",
        borderRadius: 10,
        padding: "4px 10px",
        boxShadow: "0 4px 10px rgba(0,0,0,0.25)"
      }
    }, [
      h("img", { src: getLogoDataUri(), width: logoWidth - 20, height: logoHeight - 8, style: { objectFit: "contain" } })
    ]),
    ...(tagline ? [h("div", {
      style: {
        position: "absolute",
        left: Math.round(width * 0.06),
        right: Math.round(width * 0.06),
        bottom: Math.round(height * 0.06),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `${Math.round(height * 0.025)}px ${Math.round(width * 0.04)}px`,
        background: "rgba(9,64,20,0.82)",
        borderRadius: 16
      }
    }, [
      h("div", { style: { fontSize: Math.min(40, width * 0.034), fontWeight: 700, color: "#ffffff", textAlign: "center" } }, tagline)
    ])] : [])
  ]);

  const svg = await satori(element, { width, height, fonts: loadFonts() });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return resvg.render().asPng();
};

module.exports = { generatePromoImage, generateLifestylePost, toDataUri, PLATFORM_SIZES: LAYOUTS };
