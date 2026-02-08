/**
 * Consist type images — real photos from Wikimedia Commons.
 * All images are CC-licensed or public domain.
 */

export interface ConsistInfo {
  name: string;
  imageUrl: string;
  attribution: string;
}

const CONSIST_MAP: Record<string, ConsistInfo> = {
  Waratah: {
    name: "Waratah (A set)",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/A_set_on_the_T4_line.jpg/320px-A_set_on_the_T4_line.jpg",
    attribution: "Wikimedia Commons, CC BY-SA",
  },
  Oscar: {
    name: "Oscar (H set)",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/H22_at_Gosford_railway_station.jpg/320px-H22_at_Gosford_railway_station.jpg",
    attribution: "Wikimedia Commons, CC BY-SA",
  },
  Endeavour: {
    name: "Endeavour railcar",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/CityRail-endeavour-Campbelltown.jpg/320px-CityRail-endeavour-Campbelltown.jpg",
    attribution: "Wikimedia Commons, CC BY-SA",
  },
  // Freight
  "Locomotive + coal wagons (approx 80 wagons)": {
    name: "Coal train",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Pacific_National_coal_train_Maitland_NSW.jpg/320px-Pacific_National_coal_train_Maitland_NSW.jpg",
    attribution: "Wikimedia Commons, CC BY-SA",
  },
  "Locomotive + container wagons": {
    name: "Intermodal freight",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/NR18_and_NR37_at_Junee.jpg/320px-NR18_and_NR37_at_Junee.jpg",
    attribution: "Wikimedia Commons, CC BY-SA",
  },
  "Locomotive + grain hoppers": {
    name: "Grain train",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/48s34_%2B_48s33_grain_Junee_spiral.jpg/320px-48s34_%2B_48s33_grain_Junee_spiral.jpg",
    attribution: "Wikimedia Commons, CC BY-SA",
  },
};

// Fallback for unknown types
const FALLBACK: ConsistInfo = {
  name: "Unknown consist",
  imageUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/A_set_on_the_T4_line.jpg/320px-A_set_on_the_T4_line.jpg",
  attribution: "Wikimedia Commons, CC BY-SA",
};

export function getConsistInfo(consistType?: string): ConsistInfo | null {
  if (!consistType) return null;
  return CONSIST_MAP[consistType] || FALLBACK;
}
