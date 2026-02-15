interface TankSpec {
  make: string;
  model: string;
  fuelType: string;
  capacityL: number;
  years?: string;
}

const TANK_DATABASE: TankSpec[] = [
  // RAM TRUCKS
  { make: "Ram", model: "1500", fuelType: "regular", capacityL: 98, years: "2019-2026" },
  { make: "Ram", model: "1500", fuelType: "diesel", capacityL: 98, years: "2020-2026" },
  { make: "Ram", model: "1500 Classic", fuelType: "regular", capacityL: 98 },
  { make: "Ram", model: "2500", fuelType: "diesel", capacityL: 117, years: "2019-2026" },
  { make: "Ram", model: "2500", fuelType: "regular", capacityL: 117, years: "2019-2026" },
  { make: "Ram", model: "3500", fuelType: "diesel", capacityL: 118, years: "2019-2026" },
  { make: "Ram", model: "3500", fuelType: "regular", capacityL: 118, years: "2019-2026" },

  // FORD TRUCKS
  { make: "Ford", model: "F-150", fuelType: "regular", capacityL: 98, years: "2021-2026" },
  { make: "Ford", model: "F-150", fuelType: "regular", capacityL: 87, years: "2015-2020" },
  { make: "Ford", model: "F-250", fuelType: "diesel", capacityL: 120, years: "2017-2026" },
  { make: "Ford", model: "F-250", fuelType: "regular", capacityL: 120, years: "2017-2026" },
  { make: "Ford", model: "F-350", fuelType: "diesel", capacityL: 120, years: "2017-2026" },
  { make: "Ford", model: "F-350", fuelType: "regular", capacityL: 120, years: "2017-2026" },
  { make: "Ford", model: "Ranger", fuelType: "regular", capacityL: 80, years: "2019-2026" },
  { make: "Ford", model: "Maverick", fuelType: "regular", capacityL: 54, years: "2022-2026" },
  { make: "Ford", model: "Explorer", fuelType: "regular", capacityL: 70, years: "2020-2026" },
  { make: "Ford", model: "Expedition", fuelType: "regular", capacityL: 104, years: "2018-2026" },
  { make: "Ford", model: "Edge", fuelType: "regular", capacityL: 68, years: "2015-2024" },
  { make: "Ford", model: "Escape", fuelType: "regular", capacityL: 55, years: "2020-2026" },
  { make: "Ford", model: "Bronco", fuelType: "regular", capacityL: 64, years: "2021-2026" },
  { make: "Ford", model: "Bronco Sport", fuelType: "regular", capacityL: 55, years: "2021-2026" },
  { make: "Ford", model: "Transit", fuelType: "regular", capacityL: 106, years: "2015-2026" },
  { make: "Ford", model: "Transit Connect", fuelType: "regular", capacityL: 53, years: "2014-2023" },

  // CHEVROLET / GMC TRUCKS
  { make: "Chevrolet", model: "Silverado 1500", fuelType: "regular", capacityL: 91, years: "2019-2026" },
  { make: "Chevrolet", model: "Silverado 1500", fuelType: "diesel", capacityL: 91, years: "2020-2026" },
  { make: "Chevrolet", model: "Silverado 2500HD", fuelType: "diesel", capacityL: 132, years: "2020-2026" },
  { make: "Chevrolet", model: "Silverado 2500HD", fuelType: "regular", capacityL: 132, years: "2020-2026" },
  { make: "Chevrolet", model: "Silverado 3500HD", fuelType: "diesel", capacityL: 132, years: "2020-2026" },
  { make: "Chevrolet", model: "Colorado", fuelType: "regular", capacityL: 63, years: "2023-2026" },
  { make: "Chevrolet", model: "Colorado", fuelType: "diesel", capacityL: 63, years: "2023-2026" },
  { make: "Chevrolet", model: "Tahoe", fuelType: "regular", capacityL: 91, years: "2021-2026" },
  { make: "Chevrolet", model: "Suburban", fuelType: "regular", capacityL: 91, years: "2021-2026" },
  { make: "Chevrolet", model: "Traverse", fuelType: "regular", capacityL: 73, years: "2018-2026" },
  { make: "Chevrolet", model: "Equinox", fuelType: "regular", capacityL: 55, years: "2018-2026" },
  { make: "Chevrolet", model: "Blazer", fuelType: "regular", capacityL: 60, years: "2019-2026" },
  { make: "GMC", model: "Sierra 1500", fuelType: "regular", capacityL: 91, years: "2019-2026" },
  { make: "GMC", model: "Sierra 1500", fuelType: "diesel", capacityL: 91, years: "2020-2026" },
  { make: "GMC", model: "Sierra 2500HD", fuelType: "diesel", capacityL: 132, years: "2020-2026" },
  { make: "GMC", model: "Sierra 3500HD", fuelType: "diesel", capacityL: 132, years: "2020-2026" },
  { make: "GMC", model: "Canyon", fuelType: "regular", capacityL: 63, years: "2023-2026" },
  { make: "GMC", model: "Yukon", fuelType: "regular", capacityL: 91, years: "2021-2026" },
  { make: "GMC", model: "Yukon XL", fuelType: "regular", capacityL: 91, years: "2021-2026" },
  { make: "GMC", model: "Terrain", fuelType: "regular", capacityL: 55, years: "2018-2026" },
  { make: "GMC", model: "Acadia", fuelType: "regular", capacityL: 73, years: "2017-2026" },

  // TOYOTA
  { make: "Toyota", model: "Tundra", fuelType: "regular", capacityL: 106, years: "2022-2026" },
  { make: "Toyota", model: "Tundra", fuelType: "regular", capacityL: 100, years: "2014-2021" },
  { make: "Toyota", model: "Tacoma", fuelType: "regular", capacityL: 72, years: "2024-2026" },
  { make: "Toyota", model: "Tacoma", fuelType: "regular", capacityL: 68, years: "2016-2023" },
  { make: "Toyota", model: "4Runner", fuelType: "regular", capacityL: 87, years: "2010-2026" },
  { make: "Toyota", model: "RAV4", fuelType: "regular", capacityL: 55, years: "2019-2026" },
  { make: "Toyota", model: "Highlander", fuelType: "regular", capacityL: 65, years: "2020-2026" },
  { make: "Toyota", model: "Sequoia", fuelType: "regular", capacityL: 100, years: "2023-2026" },
  { make: "Toyota", model: "Corolla", fuelType: "regular", capacityL: 50, years: "2019-2026" },
  { make: "Toyota", model: "Camry", fuelType: "regular", capacityL: 50, years: "2018-2026" },

  // HONDA
  { make: "Honda", model: "Civic", fuelType: "regular", capacityL: 47, years: "2022-2026" },
  { make: "Honda", model: "Accord", fuelType: "regular", capacityL: 56, years: "2023-2026" },
  { make: "Honda", model: "CR-V", fuelType: "regular", capacityL: 53, years: "2023-2026" },
  { make: "Honda", model: "Pilot", fuelType: "regular", capacityL: 73, years: "2023-2026" },
  { make: "Honda", model: "Ridgeline", fuelType: "regular", capacityL: 73, years: "2017-2026" },
  { make: "Honda", model: "HR-V", fuelType: "regular", capacityL: 45, years: "2023-2026" },
  { make: "Honda", model: "Passport", fuelType: "regular", capacityL: 73, years: "2019-2026" },

  // NISSAN
  { make: "Nissan", model: "Titan", fuelType: "regular", capacityL: 106, years: "2017-2024" },
  { make: "Nissan", model: "Frontier", fuelType: "regular", capacityL: 80, years: "2022-2026" },
  { make: "Nissan", model: "Pathfinder", fuelType: "regular", capacityL: 72, years: "2022-2026" },
  { make: "Nissan", model: "Rogue", fuelType: "regular", capacityL: 55, years: "2021-2026" },
  { make: "Nissan", model: "Murano", fuelType: "regular", capacityL: 72, years: "2015-2025" },

  // JEEP
  { make: "Jeep", model: "Wrangler", fuelType: "regular", capacityL: 72, years: "2018-2026" },
  { make: "Jeep", model: "Wrangler", fuelType: "diesel", capacityL: 72, years: "2020-2026" },
  { make: "Jeep", model: "Gladiator", fuelType: "regular", capacityL: 83, years: "2020-2026" },
  { make: "Jeep", model: "Gladiator", fuelType: "diesel", capacityL: 83, years: "2021-2026" },
  { make: "Jeep", model: "Grand Cherokee", fuelType: "regular", capacityL: 68, years: "2022-2026" },
  { make: "Jeep", model: "Grand Cherokee L", fuelType: "regular", capacityL: 87, years: "2021-2026" },
  { make: "Jeep", model: "Cherokee", fuelType: "regular", capacityL: 60, years: "2014-2023" },
  { make: "Jeep", model: "Compass", fuelType: "regular", capacityL: 51, years: "2017-2026" },

  // HYUNDAI
  { make: "Hyundai", model: "Tucson", fuelType: "regular", capacityL: 54, years: "2022-2026" },
  { make: "Hyundai", model: "Santa Fe", fuelType: "regular", capacityL: 67, years: "2024-2026" },
  { make: "Hyundai", model: "Santa Fe", fuelType: "regular", capacityL: 64, years: "2019-2023" },
  { make: "Hyundai", model: "Palisade", fuelType: "regular", capacityL: 71, years: "2020-2026" },
  { make: "Hyundai", model: "Kona", fuelType: "regular", capacityL: 47, years: "2018-2026" },
  { make: "Hyundai", model: "Elantra", fuelType: "regular", capacityL: 47, years: "2021-2026" },
  { make: "Hyundai", model: "Sonata", fuelType: "regular", capacityL: 60, years: "2020-2026" },
  { make: "Hyundai", model: "Santa Cruz", fuelType: "regular", capacityL: 64, years: "2022-2026" },

  // KIA
  { make: "Kia", model: "Telluride", fuelType: "regular", capacityL: 71, years: "2020-2026" },
  { make: "Kia", model: "Sorento", fuelType: "regular", capacityL: 67, years: "2021-2026" },
  { make: "Kia", model: "Sportage", fuelType: "regular", capacityL: 54, years: "2023-2026" },
  { make: "Kia", model: "Forte", fuelType: "regular", capacityL: 50, years: "2019-2026" },
  { make: "Kia", model: "Seltos", fuelType: "regular", capacityL: 50, years: "2021-2026" },

  // SUBARU
  { make: "Subaru", model: "Outback", fuelType: "regular", capacityL: 63, years: "2020-2026" },
  { make: "Subaru", model: "Forester", fuelType: "regular", capacityL: 63, years: "2019-2026" },
  { make: "Subaru", model: "Crosstrek", fuelType: "regular", capacityL: 63, years: "2018-2026" },
  { make: "Subaru", model: "Ascent", fuelType: "regular", capacityL: 73, years: "2019-2025" },

  // MAZDA
  { make: "Mazda", model: "CX-5", fuelType: "regular", capacityL: 58, years: "2017-2026" },
  { make: "Mazda", model: "CX-50", fuelType: "regular", capacityL: 63, years: "2023-2026" },
  { make: "Mazda", model: "CX-90", fuelType: "regular", capacityL: 73, years: "2024-2026" },
  { make: "Mazda", model: "Mazda3", fuelType: "regular", capacityL: 51, years: "2019-2026" },

  // VOLKSWAGEN
  { make: "Volkswagen", model: "Atlas", fuelType: "regular", capacityL: 69, years: "2018-2026" },
  { make: "Volkswagen", model: "Tiguan", fuelType: "regular", capacityL: 60, years: "2018-2026" },
  { make: "Volkswagen", model: "Jetta", fuelType: "regular", capacityL: 50, years: "2019-2026" },
  { make: "Volkswagen", model: "Taos", fuelType: "regular", capacityL: 50, years: "2022-2026" },

  // BMW
  { make: "BMW", model: "X3", fuelType: "premium", capacityL: 65, years: "2018-2026" },
  { make: "BMW", model: "X5", fuelType: "premium", capacityL: 80, years: "2019-2026" },
  { make: "BMW", model: "3 Series", fuelType: "premium", capacityL: 59, years: "2019-2026" },
  { make: "BMW", model: "5 Series", fuelType: "premium", capacityL: 68, years: "2024-2026" },

  // MERCEDES-BENZ
  { make: "Mercedes-Benz", model: "GLC", fuelType: "premium", capacityL: 62, years: "2023-2026" },
  { make: "Mercedes-Benz", model: "GLE", fuelType: "premium", capacityL: 85, years: "2020-2026" },
  { make: "Mercedes-Benz", model: "GLS", fuelType: "premium", capacityL: 91, years: "2020-2026" },
  { make: "Mercedes-Benz", model: "C-Class", fuelType: "premium", capacityL: 66, years: "2022-2026" },
  { make: "Mercedes-Benz", model: "Sprinter", fuelType: "diesel", capacityL: 93, years: "2019-2026" },

  // AUDI
  { make: "Audi", model: "Q5", fuelType: "premium", capacityL: 65, years: "2018-2026" },
  { make: "Audi", model: "Q7", fuelType: "premium", capacityL: 85, years: "2017-2026" },
  { make: "Audi", model: "Q8", fuelType: "premium", capacityL: 85, years: "2019-2026" },
  { make: "Audi", model: "A4", fuelType: "premium", capacityL: 58, years: "2017-2026" },

  // LEXUS
  { make: "Lexus", model: "RX", fuelType: "premium", capacityL: 65, years: "2023-2026" },
  { make: "Lexus", model: "NX", fuelType: "premium", capacityL: 55, years: "2022-2026" },
  { make: "Lexus", model: "GX", fuelType: "premium", capacityL: 87, years: "2024-2026" },
  { make: "Lexus", model: "LX", fuelType: "premium", capacityL: 93, years: "2022-2026" },

  // DODGE
  { make: "Dodge", model: "Durango", fuelType: "regular", capacityL: 93, years: "2014-2026" },
  { make: "Dodge", model: "Charger", fuelType: "regular", capacityL: 70, years: "2015-2023" },
  { make: "Dodge", model: "Challenger", fuelType: "regular", capacityL: 70, years: "2015-2023" },
  { make: "Dodge", model: "Grand Caravan", fuelType: "regular", capacityL: 76, years: "2011-2020" },

  // CHRYSLER
  { make: "Chrysler", model: "Pacifica", fuelType: "regular", capacityL: 68, years: "2017-2026" },

  // BUICK
  { make: "Buick", model: "Enclave", fuelType: "regular", capacityL: 73, years: "2018-2026" },
  { make: "Buick", model: "Encore GX", fuelType: "regular", capacityL: 48, years: "2020-2026" },

  // CADILLAC
  { make: "Cadillac", model: "Escalade", fuelType: "premium", capacityL: 91, years: "2021-2026" },
  { make: "Cadillac", model: "XT5", fuelType: "regular", capacityL: 73, years: "2017-2026" },
  { make: "Cadillac", model: "XT6", fuelType: "regular", capacityL: 73, years: "2020-2026" },

  // LINCOLN
  { make: "Lincoln", model: "Navigator", fuelType: "premium", capacityL: 104, years: "2018-2026" },
  { make: "Lincoln", model: "Aviator", fuelType: "premium", capacityL: 68, years: "2020-2026" },

  // VOLVO
  { make: "Volvo", model: "XC90", fuelType: "premium", capacityL: 71, years: "2016-2026" },
  { make: "Volvo", model: "XC60", fuelType: "premium", capacityL: 71, years: "2018-2026" },
  { make: "Volvo", model: "XC40", fuelType: "premium", capacityL: 54, years: "2019-2026" },

  // LAND ROVER
  { make: "Land Rover", model: "Range Rover", fuelType: "premium", capacityL: 90, years: "2022-2026" },
  { make: "Land Rover", model: "Range Rover Sport", fuelType: "premium", capacityL: 80, years: "2023-2026" },
  { make: "Land Rover", model: "Defender", fuelType: "premium", capacityL: 90, years: "2020-2026" },
  { make: "Land Rover", model: "Discovery", fuelType: "premium", capacityL: 89, years: "2017-2026" },

  // MITSUBISHI
  { make: "Mitsubishi", model: "Outlander", fuelType: "regular", capacityL: 60, years: "2022-2026" },
  { make: "Mitsubishi", model: "RVR", fuelType: "regular", capacityL: 51, years: "2011-2026" },

  // ACURA
  { make: "Acura", model: "MDX", fuelType: "premium", capacityL: 73, years: "2022-2026" },
  { make: "Acura", model: "RDX", fuelType: "premium", capacityL: 58, years: "2019-2026" },

  // INFINITI
  { make: "Infiniti", model: "QX80", fuelType: "premium", capacityL: 98, years: "2018-2026" },
  { make: "Infiniti", model: "QX60", fuelType: "premium", capacityL: 73, years: "2022-2026" },
  { make: "Infiniti", model: "QX50", fuelType: "premium", capacityL: 60, years: "2019-2026" },

  // GENESIS
  { make: "Genesis", model: "GV80", fuelType: "premium", capacityL: 78, years: "2021-2026" },
  { make: "Genesis", model: "GV70", fuelType: "premium", capacityL: 60, years: "2022-2026" },

  // PORSCHE
  { make: "Porsche", model: "Cayenne", fuelType: "premium", capacityL: 75, years: "2019-2026" },
  { make: "Porsche", model: "Macan", fuelType: "premium", capacityL: 65, years: "2019-2024" },
];

function normalize(str: string): string {
  return str.toLowerCase().replace(/[-_\s]+/g, " ").replace(/[^\w\s]/g, "").trim();
}

function yearInRange(year: string, range?: string): boolean {
  if (!range) return true;
  const y = parseInt(year);
  if (isNaN(y)) return true;
  const parts = range.split("-");
  const start = parseInt(parts[0]);
  const end = parseInt(parts[1]);
  return y >= start && y <= end;
}

export function lookupTankCapacity(
  year: string | null | undefined,
  make: string,
  model: string,
  fuelType: string
): number | null {
  const normMake = normalize(make);
  const normModel = normalize(model);
  const normFuel = normalize(fuelType);

  let bestMatch: TankSpec | null = null;
  let bestScore = 0;

  for (const spec of TANK_DATABASE) {
    const specMake = normalize(spec.make);
    const specModel = normalize(spec.model);
    const specFuel = normalize(spec.fuelType);

    if (specMake !== normMake) continue;

    if (specFuel !== normFuel) continue;

    let score = 0;
    if (specModel === normModel) {
      score = 3;
    } else if (normModel.includes(specModel) || specModel.includes(normModel)) {
      score = 2;
    } else {
      continue;
    }

    if (year && yearInRange(year, spec.years)) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = spec;
    }
  }

  return bestMatch?.capacityL ?? null;
}

export function getAllMakes(): string[] {
  const makes = new Set<string>();
  for (const spec of TANK_DATABASE) {
    makes.add(spec.make);
  }
  return Array.from(makes).sort();
}
