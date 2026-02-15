/**
 * AI Slide Designer: system prompt and types for NDJSON design schema.
 * The AI returns one JSON object per line (NDJSON): first line = config, then design elements in Z-order.
 */

// ============================================================================
// NDJSON design schema types (AI output)
// ============================================================================

/** Shadow options for shapes and text (PptxGenJS ShadowProps). */
export interface NDJSONShadowProps {
  type: 'outer' | 'inner' | 'none'
  /** Blur in points (0-100). */
  blur?: number
  /** Offset in points (0-200). */
  offset?: number
  /** Angle in degrees (0-359). */
  angle?: number
  /** Shadow color HEX (no #). */
  color?: string
  /** Opacity 0-1. */
  opacity?: number
  rotateWithShape?: boolean
}

/** Line/border options for shapes (PptxGenJS ShapeLineProps). */
export interface NDJSONLineProps {
  color?: string
  width?: number
  dashType?:
    | 'solid'
    | 'dash'
    | 'dashDot'
    | 'lgDash'
    | 'lgDashDot'
    | 'lgDashDotDot'
    | 'sysDash'
    | 'sysDot'
  beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
  endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
  transparency?: number
}

/** Fill options for shapes (PptxGenJS ShapeFillProps). */
export interface NDJSONFillProps {
  color: string
  /** Transparency percent 0-100. */
  transparency?: number
  type?: 'none' | 'solid'
}

export interface NDJSONConfig {
  type: 'config'
  layout?:
    | 'cover'
    | 'hero'
    | 'hero_center'
    | 'section'
    | 'split_left'
    | 'split_right'
    | 'grid'
    | 'grid_cards'
    | 'grid_2x2'
    | 'chart'
    | 'minimal'
  background?: { color: string; transparency?: number }
}

export interface NDJSONError {
  type: 'error'
  message: string
}

export interface NDJSONShapeOptions {
  x: number
  y: number
  w: number
  h: number
  fill?: NDJSONFillProps
  line?: NDJSONLineProps
  /** Corner rounding 0-1 (e.g. 0.1 to 0.5 for roundRect). */
  rectRadius?: number
  shadow?: NDJSONShadowProps
  /** Rotation in degrees -360 to 360. */
  rotate?: number
  flipH?: boolean
  flipV?: boolean
}

/**
 * All PptxGenJS shape type names. Use string at runtime so any valid ShapeType is accepted.
 * @see https://gitbrent.github.io/PptxGenJS/docs/api-shapes.html
 */
export type NDJSONShapeType =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'line'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'rtTriangle'
  | 'donut'
  | 'heart'
  | 'star5'
  | 'star6'
  | 'star7'
  | 'star8'
  | 'star10'
  | 'star4'
  | 'star12'
  | 'star16'
  | 'star24'
  | 'star32'
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'leftRightArrow'
  | 'upDownArrow'
  | 'wedgeRoundRectCallout'
  | 'wedgeRectCallout'
  | 'wedgeEllipseCallout'
  | 'cloudCallout'
  | 'borderCallout1'
  | 'borderCallout2'
  | 'borderCallout3'
  | 'callout1'
  | 'callout2'
  | 'callout3'
  | 'accentCallout1'
  | 'accentCallout2'
  | 'accentCallout3'
  | 'flowChartProcess'
  | 'flowChartDecision'
  | 'flowChartTerminator'
  | 'flowChartInputOutput'
  | 'flowChartDocument'
  | 'chevron'
  | 'parallelogram'
  | 'trapezoid'
  | 'bevel'
  | 'homePlate'
  | 'plaque'
  | 'cloud'
  | 'wave'
  | 'doubleWave'
  | 'plus'
  | 'can'
  | 'lightningBolt'
  | 'sun'
  | 'moon'
  | 'arc'
  | 'bentArrow'
  | 'bentUpArrow'
  | 'blockArc'
  | 'circularArrow'
  | 'curvedDownArrow'
  | 'curvedLeftArrow'
  | 'curvedRightArrow'
  | 'curvedUpArrow'
  | 'decagon'
  | 'diagStripe'
  | 'dodecagon'
  | 'ellipseRibbon'
  | 'ellipseRibbon2'
  | 'frame'
  | 'funnel'
  | 'gear6'
  | 'gear9'
  | 'halfFrame'
  | 'heptagon'
  | 'horizontalScroll'
  | 'irregularSeal1'
  | 'irregularSeal2'
  | 'leftArrowCallout'
  | 'leftBrace'
  | 'leftBracket'
  | 'leftCircularArrow'
  | 'leftRightArrowCallout'
  | 'leftRightCircularArrow'
  | 'leftRightRibbon'
  | 'leftRightUpArrow'
  | 'leftUpArrow'
  | 'lineInv'
  | 'mathDivide'
  | 'mathEqual'
  | 'mathMinus'
  | 'mathMultiply'
  | 'mathNotEqual'
  | 'mathPlus'
  | 'nonIsoscelesTrapezoid'
  | 'noSmoking'
  | 'notchedRightArrow'
  | 'pie'
  | 'pieWedge'
  | 'plaqueTabs'
  | 'quadArrow'
  | 'quadArrowCallout'
  | 'ribbon'
  | 'ribbon2'
  | 'rightArrowCallout'
  | 'rightBrace'
  | 'rightBracket'
  | 'round1Rect'
  | 'round2DiagRect'
  | 'round2SameRect'
  | 'smileyFace'
  | 'snip1Rect'
  | 'snip2DiagRect'
  | 'snip2SameRect'
  | 'snipRoundRect'
  | 'squareTabs'
  | 'stripedRightArrow'
  | 'swooshArrow'
  | 'teardrop'
  | 'upArrowCallout'
  | 'upDownArrowCallout'
  | 'uturnArrow'
  | 'verticalScroll'
  | 'accentBorderCallout1'
  | 'accentBorderCallout2'
  | 'accentBorderCallout3'
  | 'actionButtonBackPrevious'
  | 'actionButtonBeginning'
  | 'actionButtonBlank'
  | 'actionButtonDocument'
  | 'actionButtonEnd'
  | 'actionButtonForwardNext'
  | 'actionButtonHelp'
  | 'actionButtonHome'
  | 'actionButtonInformation'
  | 'actionButtonMovie'
  | 'actionButtonReturn'
  | 'actionButtonSound'
  | 'chartPlus'
  | 'chartStar'
  | 'chartX'
  | 'chord'
  | 'corner'
  | 'cornerTabs'
  | 'cube'
  | 'downArrowCallout'
  | 'folderCorner'
  | 'flowChartAlternateProcess'
  | 'flowChartCollate'
  | 'flowChartConnector'
  | 'flowChartDelay'
  | 'flowChartDisplay'
  | 'flowChartExtract'
  | 'flowChartInternalStorage'
  | 'flowChartMagneticDisk'
  | 'flowChartMagneticDrum'
  | 'flowChartMagneticTape'
  | 'flowChartManualInput'
  | 'flowChartManualOperation'
  | 'flowChartMerge'
  | 'flowChartMultidocument'
  | 'flowChartOfflineStorage'
  | 'flowChartOffpageConnector'
  | 'flowChartOnlineStorage'
  | 'flowChartOr'
  | 'flowChartPredefinedProcess'
  | 'flowChartPreparation'
  | 'flowChartPunchedCard'
  | 'flowChartPunchedTape'
  | 'flowChartSort'
  | 'flowChartSummingJunction'
  | 'bracePair'
  | 'bracketPair'

export interface NDJSONShape {
  type: 'shape'
  shapeType: NDJSONShapeType
  options: NDJSONShapeOptions
}

export interface NDJSONTextOptions extends NDJSONShapeOptions {
  fontSize?: number
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  fontFace?: string
  bullet?: boolean | { type: 'number' }
  /** Line spacing (pt) or multiple. */
  lineSpacing?: number
  lineSpacingMultiple?: number
  shrinkText?: boolean
  wrap?: boolean
  autoFit?: boolean
}

export interface NDJSONText {
  type: 'text'
  text: string
  options: NDJSONTextOptions
}

export interface NDJSONImagePlaceholderOptions {
  x: number
  y: number
  w: number
  h: number
}

export interface NDJSONImagePlaceholder {
  type: 'image-placeholder'
  altText?: string
  options: NDJSONImagePlaceholderOptions
}

export type NDJSONLine =
  | NDJSONConfig
  | NDJSONError
  | NDJSONShape
  | NDJSONText
  | NDJSONImagePlaceholder

export interface NDJSONDesignResult {
  config: NDJSONConfig | null
  elements: Array<NDJSONShape | NDJSONText | NDJSONImagePlaceholder>
  safetyError: string | null
}

// ============================================================================
// System prompt for AI slide designer (comprehensive PptxGenJS API reference)
// ============================================================================

export const SLIDE_DESIGNER_SYSTEM_PROMPT = `You are **Vibriona Design Engine**, an expert AI Presentation Architect.
Your task is to design professional slides using PptxGenJS.

=== 1. SAFETY & BASICS ===
- **Refusal:** {"type": "error", "message": "..."} for unsafe content.
- **Canvas:** 16:9 (10.0 x 5.625 inches). Safe zone: 0.5 padding.
- **Colors:** HEX strings (e.g. "FF0000"). NO '#'.

=== 2. AVAILABLE TOOLS (USE THEM!) ===
- **Shadows:** Use for Images/Cards to create depth. {"type": "outer", "blur": 10, "opacity": 0.2}
- **Rounded Corners:** rectRadius: 0.1 for modern look.
- **Transparency:** fill: {"color": "HEX", "transparency": 80} for background blobs.
- **Shapes:** Don't just use rect. Use 'ellipse', 'roundRect', 'triangle' for decoration.

=== 3. STRICT LAYOUT TEMPLATES ===
Available layouts: cover (slide 1 only), split_left, split_right, grid_cards (exactly 3 list items), grid_2x2 (exactly 4 list items), minimal (text only). You will be given the Required Layout; use EXACT coordinates for that layout only.

**LAYOUT: cover (Slide 1 Only)**
- **Background:** Add 2 decorative shapes (ellipse/triangle) in corners with high transparency (80-90%).
- **Title:** x: 0.5, y: 1.8, w: 9.0, h: 1.5. fontSize: 54. align: "center". bold: true.
- **Subtitle:** x: 1.0, y: 3.4, w: 8.0, h: 1.0. fontSize: 24. align: "center".
- **Decoration:** - Shape 1: type: ellipse, x: -1, y: -1, w: 4, h: 4, fill: {color: <PrimaryColor>, transparency: 85}
    - Shape 2: type: ellipse, x: 8, y: 3.5, w: 3, h: 3, fill: {color: <SecondaryColor>, transparency: 85}

**LAYOUT: split_left (Image Left, Content Right)**
- **Image BG (Shadow):** x: 0.5, y: 1.2, w: 4.2, h: 3.8, rectRadius: 0.1, fill: "F0F0F0"
- **Image Placeholder:** x: 0.5, y: 1.2, w: 4.2, h: 3.8
- **Title:** x: 5.0, y: 0.5, w: 4.5, h: 0.8. align: "left". fontSize: 32. bold: true.
- **Content:** x: 5.0, y: 1.4, w: 4.5, h: 3.6. align: "left". fontSize: 16.

**LAYOUT: split_right (Content Left, Image Right)**
- **Title:** x: 0.5, y: 0.5, w: 4.5, h: 0.8. align: "left". fontSize: 32. bold: true.
- **Content:** x: 0.5, y: 1.4, w: 4.5, h: 3.6. align: "left". fontSize: 16.
- **Image BG (Shadow):** x: 5.3, y: 1.2, w: 4.2, h: 3.8, rectRadius: 0.1, fill: "F0F0F0"
- **Image Placeholder:** x: 5.3, y: 1.2, w: 4.2, h: 3.8

**LAYOUT: grid_cards (Lists with exactly 3 items)**
- **Title:** x: 0.5, y: 0.4, w: 9.0, h: 0.8. align: "center".
- **Card 1:** x: 0.5, y: 1.4, w: 2.8, h: 3.8. fill: "FFFFFF", shadow: true.
- **Card 2:** x: 3.6, y: 1.4, w: 2.8, h: 3.8. fill: "FFFFFF", shadow: true.
- **Card 3:** x: 6.7, y: 1.4, w: 2.8, h: 3.8. fill: "FFFFFF", shadow: true.
- **Note:** Place text INSIDE the card coordinates with padding. USE ONLY FOR 3 ITEMS.

**LAYOUT: grid_2x2 (Lists with exactly 4 items)**
- **Title:** x: 0.5, y: 0.4, w: 9.0, h: 0.8. align: "center".
- **Card 1 (Top Left):** x: 0.5, y: 1.4, w: 4.3, h: 1.9. fill: "FFFFFF", shadow: true.
- **Card 2 (Top Right):** x: 5.2, y: 1.4, w: 4.3, h: 1.9. fill: "FFFFFF", shadow: true.
- **Card 3 (Bottom Left):** x: 0.5, y: 3.5, w: 4.3, h: 1.9. fill: "FFFFFF", shadow: true.
- **Card 4 (Bottom Right):** x: 5.2, y: 3.5, w: 4.3, h: 1.9. fill: "FFFFFF", shadow: true.
- **Note:** Use roundRect with shadow. Place text INSIDE the card coordinates with padding. USE ONLY FOR 4 ITEMS.

**LAYOUT: minimal (Text Only)**
- **Title:** x: 0.5, y: 0.5, w: 9.0, h: 0.8.
- **Content:** x: 0.5, y: 1.5, w: 9.0, h: 3.5. fontSize: 18.

=== 4. OUTPUT RULES ===
1. **Markdown:** You MAY use **bold** in text fields.
2. **Z-Order:** Config -> Background Shapes -> Image -> Text.
3. **Colors:** Use the Brand Colors provided in the prompt.
4. **JSON Only:** One object per line.

=== 5. EXAMPLE OUTPUT (COVER) ===
{"type": "config", "layout": "cover", "background": {"color": "FFFFFF"}}
{"type": "shape", "shapeType": "ellipse", "options": {"x": -0.5, "y": -0.5, "w": 4, "h": 4, "fill": {"color": "007AFF", "transparency": 90}}}
{"type": "text", "text": "AI & FUTURE", "options": {"x": 0.5, "y": 2.0, "w": 9, "h": 1.5, "fontSize": 60, "bold": true, "color": "007AFF", "align": "center"}}
{"type": "text", "text": "Deep Dive into LLMs", "options": {"x": 1, "y": 3.6, "w": 8, "h": 1, "fontSize": 24, "color": "333333", "align": "center"}}
`
