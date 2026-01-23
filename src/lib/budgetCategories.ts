import { constructionSteps } from "@/data/constructionSteps";

export interface BudgetItem {
  name: string;
  cost: number;
  quantity: string;
  unit: string;
}

export interface BudgetCategory {
  name: string;
  budget: number;
  spent?: number;
  color: string;
  description?: string;
  items?: BudgetItem[];
}

export type IncomingAnalysisCategory = {
  name: string;
  budget: number;
  description: string;
  items?: BudgetItem[];
};

// Couleurs vives et distinctes pour une meilleure lisibilité
export const categoryColors = [
  "#3B82F6", // Bleu vif
  "#F97316", // Orange
  "#22C55E", // Vert
  "#EAB308", // Jaune doré
  "#EC4899", // Rose
  "#06B6D4", // Cyan
  "#8B5CF6", // Violet
  "#EF4444", // Rouge
  "#14B8A6", // Teal
  "#A855F7", // Pourpre
  "#F59E0B", // Ambre
  "#10B981", // Émeraude
  "#0EA5E9", // Bleu ciel
  "#DB2777", // Rose foncé
  "#64748B", // Gris ardoise
  "#78716C", // Pierre
  "#0891B2", // Cyan foncé
];

// Generate default categories from construction steps (physical work steps only: 5-22, excluding inspections)
// Merge Plomberie and Électricité rough-in + finition into single categories
const physicalWorkSteps = constructionSteps.filter(
  step => (step.phase === "gros-oeuvre" || step.phase === "second-oeuvre" || step.phase === "finitions") 
    && step.id !== "inspections-finales"
);

// IDs to merge (ONLY plumbing and electrical rough-in + finition phases)
const mergeMap: Record<string, string> = {
  "plomberie-roughin": "Plomberie",
  "plomberie-finition": "Plomberie",
  "electricite-roughin": "Électricité",
  "electricite-finition": "Électricité",
};

// Build a stable mapping of category -> tasks (based on the guide steps),
// so we can always display the tasks even if the budget analysis didn't produce items.
export const buildStepTasksByCategory = (): Record<string, string[]> => {
  const map: Record<string, string[]> = {};
  for (const step of physicalWorkSteps) {
    const name = mergeMap[step.id] ?? step.title;
    map[name] = [...(map[name] ?? []), ...step.tasks.map((t) => t.title)];
  }
  return map;
};

export const stepTasksByCategory = buildStepTasksByCategory();

// Normalize key for matching
const normalizeKey = (s: unknown) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

// Analysis to step mapping for legacy AI categories
const analysisToStepMap: Record<string, string[]> = {
  "excavation": ["Excavation"],
  "fondation": ["Fondation"],
  "structure": ["Structure et charpente"],
  "toiture": ["Toiture"],
  "revetement exterieur": ["Revêtement extérieur"],
  "revêtement extérieur": ["Revêtement extérieur"],
  "fenetres et portes": ["Fenêtres et portes extérieures"],
  "fenêtres et portes": ["Fenêtres et portes extérieures"],
  "isolation et pare-air": ["Isolation et pare-vapeur"],
  "isolation et pare air": ["Isolation et pare-vapeur"],
  "electricite": ["Électricité"],
  "électricité": ["Électricité"],
  "plomberie": ["Plomberie"],
  "chauffage/cvac": ["Chauffage et ventilation (HVAC)"],
  "chauffage et cvac": ["Chauffage et ventilation (HVAC)"],
  "chauffage": ["Chauffage et ventilation (HVAC)"],
  // Split finishes across the main finishing steps (approximation)
  "finition interieure": ["Gypse et peinture", "Revêtements de sol", "Finitions intérieures"],
  "finition intérieure": ["Gypse et peinture", "Revêtements de sol", "Finitions intérieures"],
  "cuisine": ["Travaux ébénisterie (Cuisine/SDB)"],
  "salle de bain": ["Travaux ébénisterie (Cuisine/SDB)"],
  "salles de bain": ["Travaux ébénisterie (Cuisine/SDB)"],
};

// Build merged categories
export const buildDefaultCategories = (): BudgetCategory[] => {
  const result: BudgetCategory[] = [];
  const mergedCategories: Record<string, { tasks: string[]; color: string }> = {};
  let colorIndex = 0;

  for (const step of physicalWorkSteps) {
    const mergedName = mergeMap[step.id];
    
    if (mergedName) {
      // This step should be merged
      if (!mergedCategories[mergedName]) {
        mergedCategories[mergedName] = {
          tasks: [],
          color: categoryColors[colorIndex % categoryColors.length],
        };
        colorIndex++;
        // Add placeholder to maintain order (will be replaced)
        result.push({
          name: mergedName,
          budget: 0,
          spent: 0,
          color: mergedCategories[mergedName].color,
          description: "",
        });
      }
      // Accumulate tasks from both phases
      mergedCategories[mergedName].tasks.push(...step.tasks.map(t => t.title));
    } else {
      // Regular step
      const taskTitles = stepTasksByCategory[step.title]?.join(", ") ?? step.tasks.map(t => t.title).join(", ");
      result.push({
        name: step.title,
        budget: 0,
        spent: 0,
        color: categoryColors[colorIndex % categoryColors.length],
        description: taskTitles,
      });
      colorIndex++;
    }
  }

  // Update merged categories with accumulated task descriptions
  return result.map(cat => {
    if (mergedCategories[cat.name]) {
      return {
        ...cat,
        description: mergedCategories[cat.name].tasks.join(", "),
      };
    }
    return cat;
  });
};

export const defaultCategories: BudgetCategory[] = buildDefaultCategories();

// Get the ordered category names (for consistent display order)
export const getOrderedCategoryNames = (): string[] => {
  return defaultCategories.map(cat => cat.name);
};

// Map legacy AI analysis categories (12-category model + taxes/contingence) into
// the app's step-based budget categories so the table always updates.
export const mapAnalysisToStepCategories = (
  analysisCategories: IncomingAnalysisCategory[],
  defaults: BudgetCategory[] = defaultCategories
): BudgetCategory[] => {
  const mapped: BudgetCategory[] = defaults.map((d) => ({
    ...d,
    budget: 0,
    spent: 0,
    items: [],
  }));

  const byName = new Map(mapped.map((c) => [c.name, c] as const));

  let extraAmount = 0; // taxes + contingence

  for (const cat of analysisCategories) {
    const key = normalizeKey(cat.name);

    if (key.includes("tax")) {
      extraAmount += Number(cat.budget) || 0;
      continue;
    }
    if (key.includes("contingence")) {
      extraAmount += Number(cat.budget) || 0;
      continue;
    }

    const targets = analysisToStepMap[key];
    if (!targets || targets.length === 0) {
      // Try direct match with step category name
      const directMatch = byName.get(cat.name);
      if (directMatch) {
        directMatch.budget += Number(cat.budget) || 0;
        if (cat.items?.length) {
          directMatch.items = [...(directMatch.items || []), ...cat.items];
        }
      }
      continue;
    }

    const totalBudget = Number(cat.budget) || 0;
    const perTargetBudget = targets.length > 0 ? totalBudget / targets.length : totalBudget;

    for (const targetName of targets) {
      const target = byName.get(targetName);
      if (!target) continue;
      target.budget += perTargetBudget;
      if (cat.items?.length) {
        target.items = [...(target.items || []), ...cat.items];
      }
    }
  }

  // Distribute extra (taxes/contingence) proportionally so totals match without adding extra categories
  const baseTotal = mapped.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
  if (extraAmount > 0 && baseTotal > 0) {
    for (const c of mapped) {
      if ((c.budget || 0) <= 0) continue;
      c.budget += (c.budget / baseTotal) * extraAmount;
    }
  }

  return mapped;
};
