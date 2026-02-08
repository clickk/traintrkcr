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
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Waratah_A-Set_%28A73%29.jpg/500px-Waratah_A-Set_%28A73%29.jpg",
    attribution: "Wikimedia Commons, CC BY-SA 4.0",
  },
  Oscar: {
    name: "Oscar (H set)",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/NSW_TrainLink_H-set_OSCAR_%2831713977194%29.jpg/500px-NSW_TrainLink_H-set_OSCAR_%2831713977194%29.jpg",
    attribution: "Wikimedia Commons, CC BY 2.0",
  },
  Endeavour: {
    name: "Endeavour railcar",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/CityRail_Endeavour_Railcar.jpg/500px-CityRail_Endeavour_Railcar.jpg",
    attribution: "Wikimedia Commons, CC BY-SA 3.0",
  },
  // Freight
  "Locomotive + coal wagons (approx 80 wagons)": {
    name: "Coal train",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/PN_9403_0627.jpg/500px-PN_9403_0627.jpg",
    attribution: "Wikimedia Commons, CC BY-SA 4.0",
  },
  "Locomotive + container wagons": {
    name: "Intermodal freight",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/NR18_%2B_IP_Stratton%2C_2014.JPG/500px-NR18_%2B_IP_Stratton%2C_2014.JPG",
    attribution: "Wikimedia Commons, CC BY-SA 3.0",
  },
  "Locomotive + grain hoppers": {
    name: "Grain train",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Pacific_National_81_class_loco_%288176%29_in_Coota.jpg/500px-Pacific_National_81_class_loco_%288176%29_in_Coota.jpg",
    attribution: "Wikimedia Commons, CC BY-SA 3.0",
  },
};

// Fallback for unknown types
const FALLBACK: ConsistInfo = {
  name: "Unknown consist",
  imageUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Waratah_A-Set_%28A73%29.jpg/500px-Waratah_A-Set_%28A73%29.jpg",
  attribution: "Wikimedia Commons, CC BY-SA 4.0",
};

export function getConsistInfo(consistType?: string): ConsistInfo | null {
  if (!consistType) return null;
  return CONSIST_MAP[consistType] || FALLBACK;
}
