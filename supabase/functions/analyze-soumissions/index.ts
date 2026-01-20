import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SoumissionDoc {
  file_name: string;
  file_url: string;
}

// Convert file to base64 for Gemini Vision
async function fetchFileAsBase64(fileUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log("Fetching file from:", fileUrl);
    
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error("Failed to fetch file:", response.status);
      return null;
    }
    
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    console.log(`File fetched: ${Math.round(buffer.byteLength / 1024)} KB, type: ${contentType}`);
    
    return { base64, mimeType: contentType };
  } catch (error) {
    console.error("Error fetching file:", error);
    return null;
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

const SYSTEM_PROMPT = `Tu es un EXPERT EN ANALYSE DE SOUMISSIONS pour la construction résidentielle au Québec.

## MISSION
Analyser et comparer plusieurs soumissions de sous-traitants avec PRÉCISION.

## RÈGLES D'EXTRACTION

1. **POUR CHAQUE DOCUMENT**, extraire:
   - Nom exact de l'entreprise/fournisseur
   - Numéro de téléphone (chercher PARTOUT: en-tête, pied de page, signature, logo)
   - Adresse/courriel si disponible
   - Numéro de licence RBQ si mentionné
   - Date de la soumission
   - Date de validité/expiration
   - Montant PRINCIPAL de la soumission

2. **DÉTECTION DES OPTIONS**
   - Identifier TOUTES les options/forfaits/configurations proposées
   - Ex: "Option A/B/C", "Forfait Bronze/Argent/Or", "Avec/Sans X"
   - Extraire le montant de CHAQUE option

3. **ÉLÉMENTS INCLUS/EXCLUS**
   - Liste complète des travaux INCLUS
   - Liste des EXCLUSIONS explicites
   - Conditions particulières
   - Garanties offertes
   - Délais de réalisation

## ANALYSE COMPARATIVE

1. **NORMALISATION** - Ajuster pour comparer équitablement:
   - Items manquants dans une soumission vs autres
   - Différences de scope (ex: un inclut permis, l'autre non)
   - Qualité des matériaux proposés

2. **DÉTECTION D'ANOMALIES**
   - Prix anormalement BAS (< -30% de la moyenne) = 🔴 ALERTE
   - Prix anormalement HAUT (> +30% de la moyenne) = 🟠 ATTENTION
   - Items manquants critiques = ⚠️ AVERTISSEMENT

3. **CALCUL DES ÉCARTS**
   - Écart en $ et en % vs moyenne
   - Écart vs budget prévu (si fourni)

## FORMAT DE RÉPONSE STRUCTURÉ

\`\`\`contacts
NOM_DOCUMENT|NOM_ENTREPRISE|TELEPHONE|MONTANT_PRINCIPAL|EMAIL|RBQ
\`\`\`

\`\`\`options
NOM_DOCUMENT|NOM_OPTION|MONTANT|DESCRIPTION_COURTE
\`\`\`

\`\`\`comparaison_json
{
  "soumissions": [
    {
      "document": "nom_fichier.pdf",
      "entreprise": "Nom Inc.",
      "telephone": "514-XXX-XXXX",
      "email": "contact@exemple.com",
      "rbq": "XXXX-XXXX-XX",
      "date_soumission": "2025-01-15",
      "validite": "30 jours",
      "montant_principal": 25000,
      "options": [
        {"nom": "Option Premium", "montant": 32000, "description": "Inclut X, Y, Z"}
      ],
      "inclus": ["Item 1", "Item 2"],
      "exclus": ["Item A", "Item B"],
      "garantie": "5 ans pièces et main-d'œuvre",
      "delai": "2-3 semaines",
      "ecart_vs_moyenne_pourcent": -5.2,
      "ecart_vs_moyenne_dollars": -1350,
      "alertes": ["🟢 Prix compétitif", "⚠️ Garantie plus courte que concurrent"]
    }
  ],
  "analyse": {
    "moyenne_marche": 26350,
    "mediane": 25500,
    "ecart_type": 3200,
    "prix_min": 22000,
    "prix_max": 32000,
    "items_manquants_par_soumission": {
      "soumission_1.pdf": ["Permis inclus"],
      "soumission_2.pdf": []
    }
  },
  "recommandation": {
    "meilleur_rapport_qualite_prix": "Entreprise ABC Inc.",
    "justification": "Prix compétitif (-5% vs moyenne) avec garantie complète et scope identique",
    "points_negociation": [
      "Demander alignement sur garantie 5 ans comme concurrent X",
      "Négocier inclusion du permis (valeur ~500$)"
    ]
  },
  "alertes_globales": [
    "⚠️ Soumission X expire dans 5 jours",
    "🔴 Prix de Entreprise Y anormalement bas - vérifier scope"
  ]
}
\`\`\`

## TABLEAU COMPARATIF FINAL

| Critère | Soumission 1 | Soumission 2 | Soumission 3 |
|---------|--------------|--------------|--------------|
| Entreprise | | | |
| Téléphone | | | |
| Montant | | | |
| Écart vs moyenne | | | |
| Garantie | | | |
| Délai | | | |
| Score qualité-prix | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## RECOMMANDATION FINALE

Indique clairement:
1. Le MEILLEUR choix avec justification détaillée
2. Le choix ALTERNATIF si budget serré
3. Les RED FLAGS à surveiller
4. Les points de NÉGOCIATION suggérés

Sois OBJECTIF et BASE tes recommandations sur les FAITS extraits.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tradeName, tradeDescription, documents, budgetPrevu } = await req.json() as {
      tradeName: string;
      tradeDescription: string;
      documents: SoumissionDoc[];
      budgetPrevu?: number;
    };

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Aucun document à analyser" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Analyzing ${documents.length} documents for ${tradeName} with Gemini 2.5 Pro`);

    // Build message parts with documents
    const messageParts: any[] = [];
    
    messageParts.push({
      type: "text",
      text: `ANALYSE DE SOUMISSIONS - ${tradeName.toUpperCase()}
      
Corps de métier: ${tradeName}
Description: ${tradeDescription}
Nombre de documents: ${documents.length}
${budgetPrevu ? `Budget prévu par le client: ${budgetPrevu.toLocaleString('fr-CA')} $` : ''}

Analyse les ${documents.length} soumission(s) ci-dessous avec PRÉCISION.
Extrait les contacts, compare les prix, identifie les anomalies.

Documents à analyser:`
    });

    // Process each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`Processing document ${i + 1}: ${doc.file_name}`);
      
      messageParts.push({
        type: "text",
        text: `\n\n--- DOCUMENT ${i + 1}: ${doc.file_name} ---`
      });
      
      const fileData = await fetchFileAsBase64(doc.file_url);
      
      if (fileData) {
        const mimeType = getMimeType(doc.file_name);
        
        if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
          messageParts.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${fileData.base64}`
            }
          });
          console.log(`Added ${mimeType} document to analysis`);
        } else {
          messageParts.push({
            type: "text",
            text: `[Document ${doc.file_name} - Format non supporté. Convertir en PDF ou image.]`
          });
        }
      } else {
        messageParts.push({
          type: "text",
          text: `[Impossible de charger le document ${doc.file_name}]`
        });
      }
    }

    // Add final instructions
    messageParts.push({
      type: "text",
      text: `

---

Maintenant, analyse TOUS ces documents et fournis:

1. Le bloc \`\`\`contacts\`\`\` avec les coordonnées extraites
2. Le bloc \`\`\`options\`\`\` si des options/forfaits sont proposés
3. Le bloc \`\`\`comparaison_json\`\`\` avec l'analyse détaillée
4. Le tableau comparatif visuel
5. Ta recommandation finale avec justification

${budgetPrevu ? `
IMPORTANT: Compare chaque soumission au budget prévu de ${budgetPrevu.toLocaleString('fr-CA')} $.
Calcule l'écart en % et signale si le budget est dépassé.
` : ''}`
    });

    console.log("Sending request to Gemini 2.5 Pro with", messageParts.length, "parts");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: messageParts }
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requêtes atteinte, réessayez plus tard." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits insuffisants, veuillez recharger votre compte." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erreur lors de l'analyse: " + errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("analyze-soumissions error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
