// Route the prompt locally before selecting a simulator; no API credits required.
export function environmentForPrompt(prompt) {
  return /\b(highway|freeway|motorway|interstate)\b/i.test(prompt) ? "highway" : "crosswalk";
}
