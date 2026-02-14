import axios from 'axios'
import i18n from '../i18n'
import type { Slide } from './prompt'
import type { SystemPromptType } from './prompt'
import { extractContentFromChunk, parsePartialSlides } from './parseStream'
import { getAPIConfig, parseAPIError } from './utils'
import { API_CONFIG } from '../config/api'

// ============================================================================
// 1. ENHANCE ULTRA (Core Logic Only)
// Focus: Strict Schema, No Examples, Safety Constraints.
// ============================================================================
export const ENHANCE_ULTRA = `Role: Slide Enhancer.
Task: Improve content (engaging, markdown) and visuals (artistic prompt).
Output: Single JSON object. Short Keys. NO Markdown.

### SAFETY
Refuse politics/violence/hate. If found, return original slide with content: "Content filtered due to safety guidelines."

### SCHEMA (Short Keys)
{
  "i": number,      // ID (Preserve)
  "t": string,      // Title (Punchy, <10 words)
  "c": string,      // Content (Markdown, 60-100 words) - Include specific details, data, examples
  "v": boolean,     // Visual needed?
  "d"?: string,     // [Optional] Image Prompt (only if v=true) - Style, Light, Subject
  "l": "intro"|"left"|"right"|"center"|"quote", // Layout
  "n"?: string      // [Optional] Speaker Notes (2-3 sentences with specific talking points)
}`;

// ============================================================================
// 2. ENHANCE SHORT (Concise Instructions)
// Focus: Clear field definitions, Safety, No Examples.
// ============================================================================
export const ENHANCE_SHORT = `You are a Slide Enhancer. Rewrite the slide to be professional and impactful.
Output: Single valid JSON object. Short Keys. NO Markdown code blocks.

### SAFETY PROTOCOL
Do NOT enhance political, harmful, or illegal content. If detected, neutralize the content to be safe and generic.

### SCHEMA (Short Keys)
{
  "i": number,      // ID (Preserve)
  "t": string,      // Title (Punchy, <10 words)
  "c": string,      // Content (Markdown, 60-100 words) - Be specific, include data/examples
  "v": boolean,     // Visual needed?
  "d"?: string,     // [Optional] Image Prompt (only if v=true) - Style, Light, Subject
  "l": "intro"|"left"|"right"|"center"|"quote", // Layout
  "n"?: string      // [Optional] Speaker Notes (2-3 sentences)
}

NO Markdown code blocks. Just the raw JSON string.`;

// ============================================================================
// 3. ENHANCE MEDIUM (Standard)
// Focus: Basic Example, Detailed Content Rules.
// ============================================================================
export const ENHANCE_MEDIUM = `You are a Presentation Content Enhancer.
Task: Upgrade the slide's engagement, clarity, and visual appeal.
Output: Single valid JSON object. Short Keys. NO Markdown code blocks.

### 1. SAFETY & CONTENT RULES
- **Forbidden:** Politics, Hate Speech, Violence. **Action:** Replace harmful text with a safety warning.
- **Content (c):** 60-100 words. Use Markdown lists and bold text. Include specific details, statistics, examples, and actionable insights. Avoid vague generalizations.
- **Visual (d):** Write a creative *Generative AI Prompt* (describe artistic style, not just subject).
- **Speaker Notes (n):** 2-3 sentences with concrete talking points and emphasis areas.

### 2. SCHEMA (Short Keys)
{
  "i": number,      // ID (Preserve)
  "t": string,      // Title (Punchy, <10 words)
  "c": string,      // Content (Markdown, 60-100 words) - Detailed and specific
  "v": boolean,     // Visual needed?
  "d"?: string,     // [Optional] Image Prompt (only if v=true) - Style, Light, Subject
  "l": "intro"|"left"|"right"|"center"|"quote", // Layout
  "n"?: string      // [Optional] Speaker Notes (2-3 sentences)
}

### 3. EXAMPLE
Input: { Title: "Sales", Content: "We sold a lot." }
Output:
{"i": 1, "t": "Q4 Sales Performance", "c": "- **Revenue**: $5.2M total revenue (+23% YoY), exceeding target by $800K\\n- **Top Region**: Asia-Pacific contributed 45% of growth, led by Singapore and Tokyo markets\\n- **Product Mix**: Enterprise tier subscriptions grew 67%, now representing 58% of recurring revenue\\n- **Customer Acquisition**: Added 2,847 new customers at $142 avg CAC, improving efficiency by 18%", "v": true, "d": "Rising 3D bar chart with glowing blue columns, futuristic interface elements, dark background with data points floating, cinematic lighting", "l": "right", "n": "Emphasize the Asia-Pacific growth story and the shift to enterprise tier. Mention that this momentum positions us well for Q1 targets."}
`;

// ============================================================================
// 4. ENHANCE FULL (Detailed)
// Focus: Visual Thinking, Full Example, Formatting.
// ============================================================================
export const ENHANCE_FULL = `You are an expert Presentation Content Enhancer.
Your goal is to transform a basic slide into a professional, visually stunning narrative.

### 1. CRITICAL SAFETY
- **Policy:** Zero tolerance for politics, self-harm, or illegal acts.
- **Action:** If the input violates this, return the slide with "t": "Safety Warning" and "c": "Content removed."

### 2. ENHANCEMENT STRATEGY
- **Copywriting (c):** 70-120 words. Rich with specific details, data points, examples, and actionable insights. Use **bold** for key metrics. Structure with bullet points for readability.
- **Art Direction (d):** If "v": true, write a detailed standalone English prompt for DALL-E/Midjourney. Include: *Subject + Specific details + Art Style + Lighting + Camera angle + Mood*.
- **Speaker Notes (n):** 2-4 sentences. Include specific talking points, emphasis areas, and transitions to next slide.

### 3. OUTPUT SCHEMA (Short Keys)
Single JSON object:
{
  "i": number,      // ID (Preserve)
  "t": string,      // Title (Punchy, <10 words)
  "c": string,      // Content (Markdown, 70-120 words) - Detailed and data-rich
  "v": boolean,     // Visual needed?
  "d"?: string,     // [Optional] Image Prompt (only if v=true) - Style, Light, Subject
  "l": "intro"|"left"|"right"|"center"|"quote", // Layout
  "n"?: string      // [Optional] Speaker Notes (2-4 sentences)
}

### 4. EXAMPLE
**Input:** Slide 3: "Our Team. Bob is CEO, Alice is CTO."

**Output:**
{
  "i": 3,
  "t": "Leadership Team",
  "c": "- **Bob Smith**, CEO & Co-Founder: Former VP of Product at Adobe, 20 years in SaaS, led three successful exits totaling $400M. Stanford MBA, Y Combinator alum (W15). Specializes in go-to-market strategy and enterprise sales.\\n- **Alice Doe**, CTO & Co-Founder: Ex-Senior Engineer at Google Cloud, architected systems serving 100M+ users. MIT Computer Science, 8 patents in distributed systems. Expert in scalable infrastructure and team building.\\n- **Together**: Combined network of 500+ industry contacts, $2M angel investment secured, complementary skill sets in business and technology.",
  "v": true,
  "d": "Professional studio portrait of two diverse corporate leaders standing confidently in modern tech office, confident poses, one holding tablet showing company metrics, warm natural lighting from large windows, shallow depth of field, clean minimalist background, corporate photography style, 4k resolution",
  "l": "left",
  "n": "Start with Bob's Adobe background to establish credibility. Emphasize their complementary skills - Bob handles business/sales, Alice handles product/engineering. Mention the $2M raised as proof of investor confidence. Transition to next slide about product roadmap."
}
`;

// ============================================================================
// 5. ENHANCE ADVANCED (Expert)
// Focus: Persona, Edge Cases, Complex Example, Field Semantics.
// ============================================================================
export const ENHANCE_ADVANCED = `You are **Vibriona**, an expert AI Presentation Architect.
Your task is to rewrite a specific slide to maximize audience engagement and visual impact.

### 1. SAFETY & ETHICS GUARDRAILS
- **Prohibited:** Political figures, hate speech, violence, PII (Personally Identifiable Information).
- **Protocol:** If the input content is unsafe, **sanitize it** immediately. Return a slide regarding "General Principles" instead of specific controversial topics, or output a safety warning.

### 2. FIELD SEMANTICS (Short Keys - Optimized for Token Efficiency)
- **i (Index):** Integer ID. Preserve from input.
- **t (Title):** Action-oriented, punchy headline (<10 words). E.g., "Accelerating Growth" vs "Growth".
- **c (Content):** 80-150 words. Rich, data-driven Markdown. Use lists, bolding, and clear hierarchy. Include specific metrics, examples, case studies, and actionable insights. Avoid vague statements.
- **v (Visual):** Boolean. Set true if slide needs an image to explain the concept.
- **d (Description):** **The Art Prompt.** Describe the *image to be generated*, NOT the slide text. Be detailed: include subject, composition, style, lighting, camera angle, mood, and quality markers. E.g., "Isometric 3D illustration of a rocket launching from a launchpad, minimal geometric style, blue and orange color scheme, dramatic upward angle, sense of momentum, 4k render" (Good) vs "A slide showing a rocket" (Bad).
- **l (Layout):** UI Hint. \`intro\` (Cover), \`left\`/\`right\` (Split), \`center\` (Focus), \`quote\`.
- **n (Note):** 2-4 sentences. Concrete talking points, emphasis areas, key metrics to highlight, and smooth transitions.

### 3. OUTPUT SCHEMA
Return a SINGLE JSON object (NO Markdown code blocks):
{
  "i": number,      // ID (Preserve)
  "t": string,      // Title (Punchy, <10 words)
  "c": string,      // Content (Markdown, 80-150 words) - Detailed and specific
  "v": boolean,     // Visual needed?
  "d"?: string,     // [Optional] Image Prompt (only if v=true) - Detailed description
  "l": "intro"|"left"|"right"|"center"|"quote", // Layout
  "n"?: string      // [Optional] Speaker Notes (2-4 sentences with specific points)
}

### 4. COMPREHENSIVE EXAMPLE
**Input:**
Slide 5: "Market Analysis. Competitors are A, B, C. We are better."

**Output:**
{
  "i": 5,
  "t": "Competitive Landscape",
  "c": "**Traditional Players (Competitors A & B):**\\n- Legacy codebases built 2010-2015, struggle with modern cloud infrastructure\\n- Average deployment time: 6-8 weeks, 67% manual processes\\n- Customer churn: 23% annually, NPS score: 42\\n- Pricing: $299-499/month, limited API access\\n\\n**Our Differentiators:**\\n- **Speed**: AI-driven deployment in 48 hours (2x faster than competition)\\n- **Reliability**: 99.9% uptime SLA vs industry standard 99.5%\\n- **Growth**: Captured 15% market share in Q1, 127 enterprise customers\\n- **Value**: $199/month with unlimited API calls, saving customers avg. $2,400/year",
  "v": true,
  "d": "A professional chessboard photographed from dramatic low angle, glowing golden king piece prominently standing victorious among fallen dark grey pawns, dramatic side lighting creating long shadows, shallow depth of field with bokeh background, photorealistic 3D render, sense of strategic dominance, cinematic composition, 4k quality",
  "l": "right",
  "n": "Lead with the speed advantage - emphasize 48 hours vs 6-8 weeks. Use the chess metaphor to illustrate strategic positioning. Highlight the $2,400 annual savings as it resonates with CFOs in the audience. Pause after the market share stat to let it sink in, then transition to customer testimonials in the next slide."
}
`;

export function getEnhancePrompt(type: SystemPromptType): string {
  switch (type) {
    case 'ultra': return ENHANCE_ULTRA
    case 'short': return ENHANCE_SHORT
    case 'medium': return ENHANCE_MEDIUM
    case 'full': return ENHANCE_FULL
    case 'advanced': return ENHANCE_ADVANCED
    default: return ENHANCE_MEDIUM
  }
}

/**
 * Convert internal long-key Slide format to short-key format for AI input.
 * This ensures consistency: AI receives and returns the same short-key format.
 */
function convertSlideToShortKeys(slide: Slide): any {
  const shortKeySlide: any = {
    i: slide.slide_number,
    t: slide.title,
    c: slide.content,
    v: slide.visual_needs_image
  }

  // Optional fields
  if (slide.visual_description) {
    shortKeySlide.d = slide.visual_description
  }

  // Convert layout long to short
  if (slide.layout_suggestion) {
    const layoutMap: Record<string, string> = {
      'split-left': 'left',
      'split-right': 'right',
      'centered': 'center',
      'intro': 'intro',
      'quote': 'quote',
      'full-image': 'center' // fallback to center
    }
    shortKeySlide.l = layoutMap[slide.layout_suggestion] || slide.layout_suggestion
  }

  if (slide.speaker_notes) {
    shortKeySlide.n = slide.speaker_notes
  }

  return shortKeySlide
}

export function enhanceSlide(
  apiUrl: string,
  apiKey: string,
  model: string,
  apiType: 'ollama' | 'gemini' | 'openai',
  slide: Slide,
  onDone: (enhanced: Slide) => void,
  onError: (error: string) => void,
  systemPromptType: SystemPromptType = 'medium'
): AbortController {
  const controller = new AbortController()
  let processedLength = 0
  let fullContent = ''
  const enhancePrompt = getEnhancePrompt(systemPromptType)

  const config = getAPIConfig({ apiUrl, apiKey, model, apiType })
  // Convert slide to short-key format for consistency with enhance prompts
  const shortKeySlide = convertSlideToShortKeys(slide)
  const userMessage = JSON.stringify(shortKeySlide)

  let url = config.endpoint
  let body: any = {
    model: config.model,
  }

  if (apiType === 'gemini') {
    url = `${url}:generateContent`

    body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `"""\nSYSTEM PROMPT: ${enhancePrompt}\n"""` },
            { text: userMessage }
          ]
        }
      ],
      generationConfig: {
        temperature: API_CONFIG.DEFAULT_TEMPERATURE,
        maxOutputTokens: API_CONFIG.MAX_TOKENS,
      }
    }
  } else {
    body.messages = [
      { role: 'system', content: enhancePrompt },
      { role: 'user', content: userMessage },
    ]
    body.temperature = API_CONFIG.DEFAULT_TEMPERATURE
    body.stream = true
    body.max_tokens = API_CONFIG.MAX_TOKENS
  }

  // Choose request config based on API type
  const requestConfig: any = {
      method: 'post',
      url,
      data: body,
      headers: config.headers,
      signal: controller.signal,
  }

  if (apiType !== 'gemini') {
    requestConfig.responseType = 'text'
    requestConfig.onDownloadProgress = (event: any) => {
      const raw = (event.event?.target as XMLHttpRequest)?.responseText
      if (!raw) return
      const { content, finishReason, newProcessedLength } = extractContentFromChunk(raw, processedLength)
      processedLength = newProcessedLength
      if (content) fullContent += content
      
      if (finishReason) {
        let errorMsg = ''
        if (finishReason === 'MAX_TOKENS' || finishReason === 'length' || finishReason === 'LENGTH') {
          errorMsg = 'Enhancement truncated: Max output tokens reached.'
        } else if (finishReason === 'SAFETY' || finishReason === 'content_filter') {
          errorMsg = 'Enhancement blocked by safety filters.'
        } else if (finishReason === 'RECITATION') {
          errorMsg = 'Enhancement stopped: Copyright protection (Recitation).'
        } else if (finishReason !== 'STOP') {
          errorMsg = `Generation stopped: ${finishReason}`
        }
        
        if (errorMsg) {
          onError(errorMsg)
        }
      }
    }
  }

  axios(requestConfig)
    .then((response) => {
        // Handle Gemini non-streaming
        if (apiType === 'gemini') {
            const candidate = response.data?.candidates?.[0]
             const finishReason = candidate?.finishReason
          
            if (finishReason && !['STOP', 'stop', 'null', null].includes(finishReason)) {
               let errorMsg = ''
               if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') {
                    errorMsg = 'Enhancement truncated.'
               } else if (finishReason === 'SAFETY') {
                    errorMsg = 'Enhancement blocked by safety filters.'
               } else {
                    errorMsg = `Stopped: ${finishReason}`
               }
               if (errorMsg) onError(errorMsg)
            }

            const content = candidate?.content?.parts?.[0]?.text || ''
            fullContent = content
        }
      // Try to parse the single object
      const trimmed = fullContent.trim()
      
      // Strip markdown code blocks if AI wrapped the JSON
      let cleanedContent = trimmed.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
      
      try {
        const parsed = JSON.parse(cleanedContent)
        
        // Check if response uses short keys (i, t, c) or long keys (slide_number, title, content)
        const hasShortKeys = parsed.i !== undefined || parsed.t !== undefined || parsed.c !== undefined
        const hasLongKeys = parsed.slide_number !== undefined || parsed.title !== undefined || parsed.content !== undefined
        
        if (hasShortKeys || hasLongKeys) {
          // Use parsePartialSlides to apply key transformation
          const slides = parsePartialSlides(`[${cleanedContent}]`)
          if (slides.length > 0) {
            onDone({ ...slide, ...slides[0], slide_number: slide.slide_number })
            return
          }
        }
      } catch {
        // Try parsing as array
      }

      // Fallback: try partial slides parser with array format
      const slides = parsePartialSlides(cleanedContent.startsWith('[') ? cleanedContent : `[${cleanedContent}]`)
      if (slides.length > 0) {
        onDone({ ...slide, ...slides[0], slide_number: slide.slide_number })
      } else {
        onError(i18n.t('errors.parse'))
      }
    })
    .catch((err) => {
      if (axios.isCancel(err)) return
      const status = err.response?.status
      const parsedError = parseAPIError(err)
      if (parsedError) {
        onError(parsedError)
        return
      }

      if (status === 401) onError(i18n.t('errors.invalidKey'))
      else if (status === 429) onError(i18n.t('errors.rateLimit'))
      else if (err.code === 'ERR_NETWORK') onError(i18n.t('errors.network'))
      else onError(err.message || i18n.t('workspace.enhanceFailed'))
    })

  return controller
}
