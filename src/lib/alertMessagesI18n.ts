/**
 * Utility for translating alert messages dynamically based on step type
 */

export interface SupplierContact {
  name?: string | null;
  phone?: string | null;
}

// Format supplier contact info for display
const formatSupplierContact = (supplier: SupplierContact | undefined, lang: string = "fr"): string => {
  if (!supplier?.name && !supplier?.phone) return "";
  
  const parts: string[] = [];
  if (supplier.name) parts.push(supplier.name);
  if (supplier.phone) parts.push(supplier.phone);
  
  const contactInfo = parts.join(" - ");
  const prefix = lang === "en" ? "Contact" : "Contact";
  
  return ` (${prefix}: ${contactInfo})`;
};

// Get the alert message based on step ID and language (for generating alerts)
export const getAlertMessage = (
  stepId: string,
  stepName: string,
  measurementNotes: string | null | undefined,
  lang: string = "fr",
  supplierContact?: SupplierContact
): string => {
  const isEnglish = lang === "en";
  const contactInfo = formatSupplierContact(supplierContact, lang);

  if (stepId === "cuisine-sdb") {
    const base = isEnglish
      ? `Contact your cabinet maker for on-site measurements for "${translateStepName(stepName, lang)}"`
      : `Contactez votre ébéniste pour la prise des mesures en chantier pour "${stepName}"`;
    
    const notes = measurementNotes
      ? isEnglish
        ? ` - Measurements after drywall, before painting`
        : ` - ${measurementNotes}`
      : "";
    
    return base + contactInfo + notes;
  }

  // Default message for other steps
  const base = isEnglish
    ? `📏 Take on-site measurements for "${translateStepName(stepName, lang)}"`
    : `📏 Prendre les mesures en chantier pour "${stepName}"`;

  const notes = measurementNotes ? ` - ${translateMeasurementNotes(measurementNotes, lang)}` : "";
  
  return base + contactInfo + notes;
};

// Translate a stored French alert message to English (for display)
export const translateAlertMessage = (message: string, lang: string): string => {
  if (lang === "fr") return message;

  // Extract and preserve contact info if present
  const contactMatch = message.match(/\(Contact: ([^)]+)\)/);
  const contactInfo = contactMatch ? ` (Contact: ${contactMatch[1]})` : "";

  // Cabinet maker alert pattern
  if (message.includes("Contactez votre ébéniste")) {
    const stepMatch = message.match(/pour "([^"]+)"/);
    const stepName = stepMatch ? stepMatch[1] : "";
    const translatedStep = translateStepName(stepName, lang);
    
    let result = `Contact your cabinet maker for on-site measurements for "${translatedStep}"`;
    result += contactInfo;
    
    if (message.includes("Mesures après gypse, avant peinture")) {
      result += " - Measurements after drywall, before painting";
    }
    
    return result;
  }

  // Generic measurement alert pattern
  if (message.includes("📏 Prendre les mesures")) {
    const stepMatch = message.match(/pour "([^"]+)"/);
    const stepName = stepMatch ? stepMatch[1] : "";
    const translatedStep = translateStepName(stepName, lang);
    
    let result = `📏 Take on-site measurements for "${translatedStep}"`;
    result += contactInfo;
    
    // Translate notes if present (excluding contact info)
    const notesMatch = message.replace(/\(Contact: [^)]+\)/, "").match(/ - (.+)$/);
    if (notesMatch) {
      result += ` - ${translateMeasurementNotes(notesMatch[1], lang)}`;
    }
    
    return result;
  }

  // Urgent subcontractor contact alerts - preserve contact info
  if (message.includes("⚠️ URGENT:") || message.includes("📅 Contacter")) {
    return message
      .replace("⚠️ URGENT: Contacter", "⚠️ URGENT: Contact")
      .replace("📅 Contacter", "📅 Contact")
      .replace("pour", "for")
      .replace("déplacé au", "moved to")
      .replace("L'échéancier a pris du retard", "Schedule has been delayed")
      .replace("L'échéancier est en avance de", "Schedule is ahead by")
      .replace("jour(s)", "day(s)")
      .replace("Date prévue:", "Scheduled date:")
      .replace("Possibilité d'avancer les travaux ?", "Possibility to advance the work?");
  }

  return message;
};

// Translate step names to English
const translateStepName = (stepName: string, lang: string): string => {
  if (lang === "fr") return stepName;

  const stepNameMap: Record<string, string> = {
    "Travaux ébénisterie": "Cabinetry Work",
    "Cuisine et salle de bain": "Kitchen and Bathroom",
    "Revêtements de sol": "Flooring",
    "Peinture": "Painting",
    "Gypse": "Drywall",
  };

  return stepNameMap[stepName] || stepName;
};

// Translate measurement notes to English
const translateMeasurementNotes = (notes: string, lang: string): string => {
  if (lang === "fr") return notes;

  const notesMap: Record<string, string> = {
    "Mesures après gypse, avant peinture": "Measurements after drywall, before painting",
    "Mesures après tirage de joints": "Measurements after joint finishing",
  };

  return notesMap[notes] || notes;
};
