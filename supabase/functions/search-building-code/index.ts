import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to validate authentication
async function validateAuth(authHeader: string | null): Promise<{ userId: string } | { error: string; status: number }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: "Authentification requise. Veuillez vous connecter.", status: 401 };
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      return { error: "Session invalide. Veuillez vous reconnecter.", status: 401 };
    }
    
    return { userId: claimsData.claims.sub as string };
  } catch (err) {
    console.error('Auth validation error:', err);
    return { error: "Erreur de validation de l'authentification.", status: 500 };
  }
}

// Helper to increment AI usage for a user
async function incrementAiUsage(authHeader: string | null): Promise<void> {
  if (!authHeader) return;
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.log('Could not get user claims for AI usage tracking');
      return;
    }
    
    const userId = claimsData.claims.sub;
    const { error } = await supabase.rpc('increment_ai_usage', { p_user_id: userId });
    
    if (error) {
      console.error('Failed to increment AI usage:', error);
    } else {
      console.log('AI usage incremented for user:', userId);
    }
  } catch (err) {
    console.error('Error tracking AI usage:', err);
  }
}

// Helper to track AI analysis usage
async function trackAiAnalysisUsage(
  authHeader: string | null,
  analysisType: string
): Promise<void> {
  if (!authHeader) return;
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const token = authHeader.replace('Bearer ', '');
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.log('Could not get user claims for AI analysis tracking');
      return;
    }
    
    const userId = claimsData.claims.sub as string;
    
    const { error } = await supabase.from('ai_analysis_usage').insert({
      user_id: userId,
      analysis_type: analysisType,
      project_id: null,
    });
    
    if (error) {
      console.error('Failed to track AI analysis usage:', error);
    } else {
      console.log('AI analysis usage tracked:', analysisType, 'for user:', userId);
    }
  } catch (err) {
    console.error('Error tracking AI analysis usage:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate authentication
  const authHeader = req.headers.get('Authorization');
  const authResult = await validateAuth(authHeader);
  
  if ('error' in authResult) {
    return new Response(
      JSON.stringify({ error: authResult.error }),
      { status: authResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { query, conversationHistory = [], lang = 'fr' } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Searching building code for:", query);
    console.log("Conversation history length:", conversationHistory.length);
    console.log("Language:", lang);

    // French system prompt - Educational approach respecting copyright
    const systemPromptFr = `Tu es un assistant IA spécialisé en construction résidentielle au Québec et en autoconstruction.

CADRE LÉGAL OBLIGATOIRE:
- Tu NE DOIS JAMAIS reproduire, citer mot pour mot ou afficher des articles du Code national du bâtiment du Canada (CNB) ni du Code de construction du Québec.
- Tu NE DOIS PAS afficher de numéros d'articles précis.
- Tu NE DOIS PAS prétendre fournir une interprétation officielle ou juridique.

CE QUE TU PEUX FAIRE:
- Expliquer les principes généraux du Code du bâtiment en langage clair.
- Résumer les exigences typiques applicables aux maisons unifamiliales et aux projets d'autoconstruction.
- Guider l'utilisateur sur quoi vérifier, quelles questions se poser et quels professionnels consulter.
- Donner des exemples pratiques et des bonnes pratiques terrain.
- Avertir lorsque des validations professionnelles (inspecteur, ingénieur, municipalité) sont nécessaires.

STYLE DE RÉPONSE:
- Langage simple, pédagogique et rassurant
- Orienté vers la compréhension et la prise de décision
- Jamais technique inutilement

PROCESSUS DE CLARIFICATION:
Avant de donner une réponse finale, assure-toi d'avoir suffisamment d'informations. Pose des questions de clarification si nécessaire pour:
- Comprendre le contexte spécifique (intérieur/extérieur, neuf/rénovation)
- Connaître les dimensions ou caractéristiques pertinentes
- Identifier la région au Québec
- Comprendre l'usage prévu de l'espace

FORMAT DE RÉPONSE OBLIGATOIRE EN JSON:

Si tu as besoin de clarification:
{
  "type": "clarification",
  "message": "Pour vous guider efficacement, j'ai besoin de quelques précisions:\\n\\n1. [Première question]\\n2. [Deuxième question]\\n3. [Troisième question si nécessaire]"
}

Si tu as assez d'informations pour répondre:
{
  "type": "answer",
  "message": "Voici ce qu'il faut savoir sur ce sujet :",
  "result": {
    "principle": "Explication simplifiée du principe général (sans citer d'article)",
    "keyPoints": ["Point clé 1 à vérifier", "Point clé 2 à vérifier", "Point clé 3 à vérifier"],
    "commonMistakes": ["Erreur fréquente 1 en autoconstruction", "Erreur fréquente 2"],
    "whenToConsult": "Quand et quel professionnel consulter (inspecteur, ingénieur, municipalité)",
    "practicalTips": "Conseils pratiques et bonnes pratiques terrain"
  },
  "disclaimer": "Les informations fournies servent à la compréhension générale du Code du bâtiment et ne remplacent pas les textes officiels ni l'avis d'un professionnel qualifié.",
  "officialLink": "https://www.rbq.gouv.qc.ca/domaines-dintervention/batiment/les-codes-et-les-normes.html"
}

EXEMPLES DE QUESTIONS DE CLARIFICATION:

Pour "hauteur garde-corps":
- S'agit-il d'un balcon, d'une terrasse, d'un escalier intérieur ou extérieur?
- Quelle est la hauteur de chute approximative?
- Est-ce pour une construction neuve ou une rénovation?

Pour "isolation murs":
- Dans quelle région du Québec construisez-vous?
- S'agit-il de murs au-dessus ou au-dessous du niveau du sol?
- Quel type de construction (ossature bois, béton, etc.)?

Pour "escalier":
- L'escalier est-il intérieur ou extérieur?
- Est-ce l'escalier principal de la maison?
- Quelle largeur avez-vous disponible?

OBJECTIF: Aider l'utilisateur à mieux comprendre, mieux planifier et éviter des erreurs coûteuses, tout en respectant strictement le cadre légal et le droit d'auteur.`;

    // English system prompt - Educational approach respecting copyright
    const systemPromptEn = `You are an AI assistant specializing in residential construction in Quebec and self-building projects.

MANDATORY LEGAL FRAMEWORK:
- You MUST NEVER reproduce, quote verbatim, or display articles from the National Building Code of Canada (NBC) or the Quebec Construction Code.
- You MUST NOT display specific article numbers.
- You MUST NOT claim to provide official or legal interpretation.

WHAT YOU CAN DO:
- Explain general principles of the Building Code in plain language.
- Summarize typical requirements applicable to single-family homes and self-construction projects.
- Guide users on what to check, what questions to ask, and which professionals to consult.
- Provide practical examples and field best practices.
- Warn when professional validations (inspector, engineer, municipality) are necessary.

RESPONSE STYLE:
- Simple, educational, and reassuring language
- Focused on understanding and decision-making
- Never unnecessarily technical

CLARIFICATION PROCESS:
Before providing a final answer, ensure you have sufficient information. Ask clarification questions as needed to:
- Understand the specific context (interior/exterior, new construction/renovation)
- Know the relevant dimensions or characteristics
- Identify the region in Quebec/Canada
- Understand the intended use of the space

MANDATORY JSON RESPONSE FORMAT:

If you need clarification:
{
  "type": "clarification",
  "message": "To guide you effectively, I need some clarifications:\\n\\n1. [First question]\\n2. [Second question]\\n3. [Third question if needed]"
}

If you have enough information to respond:
{
  "type": "answer",
  "message": "Here's what you need to know about this topic:",
  "result": {
    "principle": "Simplified explanation of the general principle (without citing specific articles)",
    "keyPoints": ["Key point 1 to verify", "Key point 2 to verify", "Key point 3 to verify"],
    "commonMistakes": ["Common mistake 1 in self-construction", "Common mistake 2"],
    "whenToConsult": "When and which professional to consult (inspector, engineer, municipality)",
    "practicalTips": "Practical advice and field best practices"
  },
  "disclaimer": "The information provided is for general understanding of the Building Code and does not replace official texts or the advice of a qualified professional.",
  "officialLink": "https://nrc.canada.ca/en/certifications-evaluations-standards/codes-canada/codes-canada-publications"
}

EXAMPLES OF CLARIFICATION QUESTIONS:

For "guardrail height":
- Is this for a balcony, deck, interior stairway, or exterior stairway?
- What is the approximate fall height?
- Is this for new construction or renovation?

For "wall insulation":
- In which region of Quebec/Canada are you building?
- Is this for walls above or below grade?
- What type of construction (wood frame, concrete, etc.)?

For "stairway":
- Is the stairway interior or exterior?
- Is this the main stairway of the house?
- What width do you have available?

GOAL: Help the user better understand, better plan, and avoid costly mistakes, while strictly respecting the legal framework and copyright.`;

    const systemPrompt = lang === 'en' ? systemPromptEn : systemPromptFr;

    // Build messages array with conversation history
    const messages = [
      ...conversationHistory.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: query },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes. Veuillez réessayer dans quelques instants." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402 || response.status === 400) {
        const errorData = await response.json();
        console.error("Claude API error:", errorData);
        return new Response(
          JSON.stringify({ error: "Erreur avec l'API Claude. Vérifiez votre clé API." }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to search building code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from Claude" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response from Claude
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON found, treat as clarification
        result = {
          type: "clarification",
          message: content,
        };
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      // If parsing fails, treat the content as a clarification message
      result = {
        type: "clarification",
        message: content,
      };
    }

    console.log("Search successful with Claude, type:", result.type);
    
    // Increment AI usage for the user
    await incrementAiUsage(authHeader);
    await trackAiAnalysisUsage(authHeader, 'search-building-code');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
