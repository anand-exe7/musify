import type { Category } from "@/types";

const u = (id: string, w = 900) =>
  `https://images.unsplash.com/photo-${id}?ixlib=rb-4.0.3&auto=format&fit=crop&w=${w}&q=80`;

export const categories: {
  id: Category;
  name: string;
  tagline: string;
  count: number;
  icon: string;
  photo: string;
}[] = [
  {
    id: "string",
    name: "String",
    tagline: "Violin, Guitar, Cello",
    count: 42,
    icon: "violin",
    photo: u("1465847899084-d164df4dedc6"),
  },
  {
    id: "keyboard",
    name: "Keyboard",
    tagline: "Piano, Harmonium, Synth",
    count: 18,
    icon: "piano",
    photo: u("1520523839897-bd0b52f945a0"),
  },
  {
    id: "wind",
    name: "Wind",
    tagline: "Flute, Saxophone, Clarinet",
    count: 24,
    icon: "flute",
    photo: u("1511671782779-c97d3d27a1d4"),
  },
  {
    id: "percussion",
    name: "Percussion",
    tagline: "Tabla, Mridangam, Drums",
    count: 31,
    icon: "tabla",
    photo: u("1519892300165-cb5542fb47c7"),
  },
  {
    id: "indian-classical",
    name: "Indian Classical",
    tagline: "Veena, Sitar, Tanpura",
    count: 27,
    icon: "veena",
    photo: u("1508025690966-2a9a1957da31"),
  },
  {
    id: "accessories",
    name: "Accessories",
    tagline: "Strings, Rosin, Cases",
    count: 156,
    icon: "accessory",
    photo: u("1510915361894-db8b60106cb1"),
  },
];
