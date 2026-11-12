import type { Dataset, Region } from "@munchmap/core";

export type Tab = "map" | "deals" | "compare" | "share" | "me";

/** A selectable area: a campus, or a city without a campus. */
export interface Area {
  key: string; // "campus:uiuc" | "city:AE/DU/dubai"
  label: string;
  group: string;
  region: Region;
  campus?: string;
  city: string;
  cityName: string;
  lat: number;
  lon: number;
}

/** A restaurant picked on the map, handed to the Share forms. */
export interface PlaceTarget {
  name: string;
  lat: number;
  lon: number;
  osm: string | null;
}

export interface AppCtx {
  data: Dataset;
  area: Area;
  go(tab: Tab, target?: PlaceTarget): void;
}
