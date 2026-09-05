import type { Category } from "@/types";

export const categories: { id: Category; name: string; tagline: string; count: number; icon: string }[] = [
  { id: "string", name: "String", tagline: "Violin, Guitar, Cello", count: 42, icon: "violin" },
  { id: "keyboard", name: "Keyboard", tagline: "Piano, Harmonium, Synth", count: 18, icon: "piano" },
  { id: "wind", name: "Wind", tagline: "Flute, Saxophone, Clarinet", count: 24, icon: "flute" },
  { id: "percussion", name: "Percussion", tagline: "Tabla, Mridangam, Drums", count: 31, icon: "tabla" },
  { id: "indian-classical", name: "Indian Classical", tagline: "Veena, Sitar, Tanpura", count: 27, icon: "veena" },
  { id: "accessories", name: "Accessories", tagline: "Strings, Rosin, Cases", count: 156, icon: "accessory" },
];
