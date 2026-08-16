// ============================================================
// vehiculos.js — catálogo de marcas y modelos para autocompletado
// ============================================================

export const MARCAS_MODELOS = {
  "Toyota":     ["Hilux","Yaris","Corolla","RAV4","Land Cruiser","Prius","Etios","Avanza","Fortuner","4Runner","Tacoma","Camry","Rush","Agya","Hiace","Probox","Innova"],
  "Hyundai":    ["Accent","Tucson","Santa Fe","Elantra","i10","i20","i30","Creta","Grand i10","Porter","H1","H100","Sonata","Veloster","Kona","Venue"],
  "Kia":        ["Morning","Rio","Sportage","Cerato","Sorento","Picanto","Soul","Seltos","Carens","Frontier","K2500","Stonic","Optima","Forte"],
  "Chevrolet":  ["Spark","Sail","Aveo","Captiva","Cruze","Tracker","Onix","D-Max","Colorado","Silverado","Corsa","Optra","N300","N400","Groove","Trailblazer"],
  "Nissan":     ["Versa","Sentra","Qashqai","X-Trail","Navara","Frontier","March","Kicks","Note","Tiida","NP300","Terrano","Juke","Murano"],
  "Mazda":      ["Mazda 2","Mazda 3","Mazda 6","CX-3","CX-5","CX-30","CX-9","BT-50","Demio","Axela"],
  "Suzuki":     ["Swift","Baleno","Vitara","Grand Vitara","S-Presso","Celerio","Alto","Jimny","Ertiga","SX4","Ignis"],
  "Ford":       ["Ranger","EcoSport","Escape","Focus","Fiesta","Explorer","F-150","Mustang","Edge","Territory","Transit","Maverick"],
  "Volkswagen": ["Gol","Polo","Voyage","Amarok","Tiguan","Jetta","Passat","Bora","Golf","T-Cross","Virtus","Saveiro","Vento"],
  "Peugeot":    ["208","301","2008","3008","308","206","207","Partner","Expert","5008","Landtrek"],
  "Citroen":    ["C3","C4","C-Elysee","Berlingo","Jumpy","C5 Aircross","Xsara","Picasso"],
  "Renault":    ["Sandero","Logan","Duster","Kwid","Captur","Megane","Clio","Symbol","Kangoo","Oroch","Stepway","Fluence"],
  "Honda":      ["Civic","CR-V","Fit","City","HR-V","Accord","Pilot","BR-V","WR-V"],
  "Mitsubishi": ["L200","Outlander","ASX","Montero","Eclipse Cross","Lancer","Mirage","Xpander","Pajero"],
  "Subaru":     ["Impreza","Forester","XV","Outback","Legacy","Crosstrek","WRX","Ascent"],
  "Jeep":       ["Renegade","Compass","Cherokee","Wrangler","Grand Cherokee","Commander"],
  "BMW":        ["Serie 1","Serie 3","Serie 5","X1","X3","X5","Serie 4","Serie 7","X6"],
  "Mercedes":   ["Clase A","Clase C","Clase E","GLA","GLC","GLE","Sprinter","Vito","Clase B"],
  "Audi":       ["A1","A3","A4","A5","Q2","Q3","Q5","Q7","A6"],
  "Chery":      ["Tiggo 2","Tiggo 3","Tiggo 4","Tiggo 7","Tiggo 8","Arrizo 5","QQ","Fulwin"],
  "Great Wall": ["Wingle","Haval H6","Poer","Florid","Voleex","M4","Steed"],
  "JAC":        ["S2","S3","S4","T6","T8","J3","Sunray","X200"],
  "MG":         ["ZS","HS","MG3","MG5","RX5","MG6"],
  "Changan":    ["CS35","CS15","CS55","Alsvin","Star","Hunter","Eado"],
  "Maxus":      ["T60","T70","G10","V80","D60","Deliver 9"],
  "Dongfeng":   ["S30","H30","AX4","AX7","Rich","Glory"],
  "Fiat":       ["Palio","Uno","Mobi","Cronos","Argo","Strada","Toro","Ducato","Siena"],
  "Ssangyong":  ["Actyon","Korando","Rexton","Tivoli","Musso","Kyron"],
  "Isuzu":      ["D-Max","MU-X","NPR","NQR","Rodeo"],
  "Lexus":      ["RX","NX","ES","IS","GX","LX","UX"],
  "Opel":       ["Corsa","Astra","Zafira","Vectra","Meriva"],
  "Skoda":      ["Fabia","Octavia","Rapid","Superb","Kodiaq","Karoq"],
  "Volvo":      ["S60","XC40","XC60","XC90","V40","S90"],
  "Dodge":      ["Journey","Durango","RAM 1500","Attitude","Grand Caravan"],
  "Iveco":      ["Daily","Vertis","Tector","Stralis"],
  "BYD":        ["F3","Song","Yuan","Han","Dolphin","Tang"],
  "Foton":      ["Tunland","Aumark","Gratour","View"],
  "Baic":       ["X25","X35","X55","D20","Senova"],
  "Haval":      ["H2","H6","Jolion","Dargo","H9"]
};

export const MARCAS = Object.keys(MARCAS_MODELOS).sort();

// Devuelve marcas que empiezan o contienen el texto buscado
export function sugerirMarcas(texto, maxResultados = 6) {
  const q = (texto || "").trim().toLowerCase();
  if (!q) return [];
  const empiezan = MARCAS.filter(m => m.toLowerCase().startsWith(q));
  const contienen = MARCAS.filter(m => !m.toLowerCase().startsWith(q) && m.toLowerCase().includes(q));
  return [...empiezan, ...contienen].slice(0, maxResultados);
}

// Devuelve modelos de una marca que coinciden con el texto
export function sugerirModelos(marca, texto, maxResultados = 8) {
  const marcaKey = MARCAS.find(m => m.toLowerCase() === (marca || "").trim().toLowerCase());
  const modelos = marcaKey ? MARCAS_MODELOS[marcaKey] : [];
  const q = (texto || "").trim().toLowerCase();
  if (!q) return modelos.slice(0, maxResultados);
  const empiezan = modelos.filter(m => m.toLowerCase().startsWith(q));
  const contienen = modelos.filter(m => !m.toLowerCase().startsWith(q) && m.toLowerCase().includes(q));
  return [...empiezan, ...contienen].slice(0, maxResultados);
}
