/**
 * Major dams monitored by NIWIS.
 *
 * Capacities in Mm³ at full supply level. The 8 priority dams of spec §8.3 use the spec's capacities exactly.
 * All other capacities and coordinates are approximate public figures (DWS dam lists / Wikipedia), rounded;
 * entries marked `verify: true` are ones I am least sure of. PLEASE VERIFY against the DWS register before
 * operational use. Province and WMA are derived from the coordinates (nearest grid cell), except the Lesotho
 * Highlands dams which are tagged 'LS'.
 */
export interface DamRef {
  id: string;
  name: string;
  river: string;
  capacity: number;
  lat: number;
  lon: number;
  /** spec §8.3 priority site */
  priority?: boolean;
  /** capacity/coordinates uncertain — verify */
  verify?: boolean;
  /** Lesotho Highlands Water Project dam (transfers to SA) */
  lesotho?: boolean;
  supplyArea?: string;
}

type Row = [name: string, river: string, capacity: number, lat: number, lon: number, flags?: Partial<DamRef>];

const ROWS: Row[] = [
  // ---- spec §8.3 priority dams (capacities from the spec)
  ['Gariep', 'Orange', 5341, -30.623, 25.506, { priority: true, supplyArea: 'National' }],
  ['Vanderkloof', 'Orange', 3171, -29.993, 24.732, { priority: true, supplyArea: 'National' }],
  ['Sterkfontein', 'Nuwejaarspruit', 2617, -28.4, 29.03, { priority: true, supplyArea: 'Gauteng / Mpumalanga' }],
  ['Vaal', 'Vaal', 2536, -26.883, 28.117, { priority: true, supplyArea: 'Gauteng Metro' }],
  ['Pongolapoort', 'Phongolo', 2448, -27.42, 32.05, { priority: true, supplyArea: 'KZN / Maputo' }],
  ['Katse', 'Malibamatso', 1950, -29.336, 28.505, { priority: true, lesotho: true, supplyArea: 'Gauteng' }],
  ['Bloemhof', 'Vaal', 1232, -27.669, 25.617, { priority: true, supplyArea: 'North West' }],
  ['Theewaterskloof', 'Sonderend', 480, -34.075, 19.29, { priority: true, supplyArea: 'Cape Town' }],
  // ---- Lesotho Highlands
  ['Mohale', 'Senqunyane', 958, -29.456, 28.095, { lesotho: true, supplyArea: 'Gauteng' }],
  // ---- Vaal / Orange systems
  ['Grootdraai', 'Vaal', 354, -26.917, 29.283],
  ['Allemanskraal', 'Sand', 177, -28.283, 27.15],
  ['Erfenis', 'Vet', 207, -28.5, 26.783],
  ['Kalkfontein', 'Riet', 318, -29.497, 25.227],
  ['Krugersdrift', 'Modder', 72, -28.873, 25.967],
  ['Rustfontein', 'Modder', 72, -29.27, 26.617],
  ['Tierpoort', 'Tierpoortspruit', 34, -29.43, 26.13, { verify: true }],
  ['Welbedacht', 'Caledon', 16, -29.9, 26.85],
  ['Knellpoort', 'Rietspruit', 136, -29.73, 26.87],
  ['Koppies', 'Renoster', 41, -27.25, 27.62],
  ['Saulspoort', 'Liebenbergsvlei', 17, -28.1, 28.3, { verify: true }],
  ['Fika Patso', 'Namahadi', 28, -28.62, 28.84],
  ['Driekloof', 'Nuwejaarspruit', 35, -28.37, 29.08],
  ['Boskop', 'Mooi', 21, -26.56, 27.12],
  ['Klerkskraal', 'Mooi', 8, -26.25, 27.17],
  ['Spitskop', 'Harts', 60, -28.13, 24.5],
  ['Taung', 'Harts', 63, -27.55, 24.84],
  ['Wentzel', 'Harts', 6, -27.03, 24.92, { verify: true }],
  ['Boegoeberg', 'Orange', 20, -29.03, 22.17, { verify: true }],
  ['Smartt Syndicate', 'Ongers', 101, -30.75, 23.05, { verify: true }],
  ['Van Ryneveldspas (Nqweba)', 'Sundays', 47, -32.22, 24.55],
  ['Lake Arthur', 'Tarka', 11, -32.23, 25.85],
  ['Grassridge', 'Great Brak', 47, -31.73, 25.45],
  ['Kommandodrift', 'Tarka', 56, -32.1, 26.03],
  // ---- Crocodile (West) / Marico / Limpopo
  ['Hartbeespoort', 'Crocodile', 186, -25.733, 27.85],
  ['Roodekopjes', 'Crocodile', 103, -25.42, 27.58],
  ['Vaalkop', 'Elands', 56, -25.3, 27.48],
  ['Bospoort', 'Hex', 18, -25.57, 27.33],
  ['Lindleyspoort', 'Elands', 14, -25.47, 26.68],
  ['Klipvoor', 'Moretele', 42, -25.13, 27.83],
  ['Molatedi', 'Groot Marico', 201, -24.87, 26.48],
  ['Kosterrivier', 'Koster', 12, -25.88, 26.9, { verify: true }],
  ['Setumo', 'Molopo', 20, -25.86, 25.6],
  ['Disaneng', 'Ramatlabama', 16, -25.83, 25.53, { verify: true }],
  ['Roodeplaat', 'Pienaars', 41, -25.62, 28.37],
  ['Rietvlei', 'Rietvlei', 12, -25.88, 28.27],
  ['Bon Accord', 'Apies', 4, -25.6, 28.2, { verify: true }],
  ['Bronkhorstspruit', 'Bronkhorstspruit', 58, -25.89, 28.72],
  ['Rust de Winter', 'Elands', 27, -25.23, 28.53],
  ['Doorndraai', 'Sterk', 44, -24.28, 28.77],
  ['Mokolo', 'Mokolo', 146, -23.97, 27.73],
  ['Glen Alpine', 'Mogalakwena', 22, -23.17, 28.68],
  ['Houwater', 'Hout', 6, -23.6, 29.2, { verify: true }],
  ['Albasini', 'Luvuvhu', 25, -23.11, 30.12],
  ['Nandoni', 'Luvuvhu', 164, -22.98, 30.6],
  ['Vondo', 'Mutshindudi', 30, -22.94, 30.36],
  ['Damani', 'Damani', 12, -22.93, 30.42, { verify: true }],
  ['Nzhelele', 'Nzhelele', 55, -22.75, 30.1],
  ['Mutshedzi', 'Mutshedzi', 2, -22.82, 30.07, { verify: true }],
  // ---- Olifants / Letaba
  ['Loskop', 'Olifants', 362, -25.42, 29.36],
  ['Witbank', 'Olifants', 104, -25.9, 29.3],
  ['Middelburg', 'Klein Olifants', 48, -25.79, 29.55],
  ['Rhenosterkop', 'Elands', 205, -25.11, 28.92],
  ['Flag Boshielo', 'Olifants', 185, -24.82, 29.42],
  ['De Hoop', 'Steelpoort', 347, -24.93, 29.98],
  ['Blyderivierspoort', 'Blyde', 55, -24.54, 30.8],
  ['Ohrigstad', 'Ohrigstad', 13, -24.9, 30.6, { verify: true }],
  ['Ebenezer', 'Groot Letaba', 70, -23.94, 29.98],
  ['Tzaneen', 'Groot Letaba', 157, -23.8, 30.17],
  ['Magoebaskloof', 'Politsi', 5, -23.86, 30.05, { verify: true }],
  ['Middel Letaba', 'Middel Letaba', 172, -23.31, 30.38],
  ['Nsami', 'Klein Letaba', 22, -23.3, 30.75, { verify: true }],
  ['Modjadji', 'Molototsi', 8, -23.65, 30.38, { verify: true }],
  // ---- Inkomati-Usuthu
  ['Kwena', 'Crocodile', 155, -25.37, 30.39],
  ['Witklip', 'Sand', 12, -25.23, 30.88, { verify: true }],
  ['Klipkopjes', 'White', 12, -25.18, 30.93, { verify: true }],
  ['Longmere', 'White', 4, -25.13, 30.98, { verify: true }],
  ['Primkop', 'White', 2, -25.12, 31.0, { verify: true }],
  ['Da Gama', 'White', 13, -25.12, 31.03, { verify: true }],
  ['Driekoppies', 'Lomati', 251, -25.71, 31.53],
  ['Inyaka', 'Marite', 123, -24.9, 31.07],
  ['Nooitgedacht', 'Komati', 78, -25.97, 30.08],
  ['Vygeboom', 'Komati', 84, -25.88, 30.67],
  ['Westoe', 'Usuthu', 61, -26.47, 30.62],
  ['Jericho', 'Mpama', 60, -26.6, 30.45],
  ['Morgenstond', 'Ngwempisi', 101, -26.77, 30.75],
  ['Heyshope', 'Assegaai', 451, -27.0, 30.45],
  ['Zaaihoek', 'Slang', 185, -27.43, 30.07],
  ['Douglas', 'Usuthu', 3, -26.55, 30.23, { verify: true }],
  // ---- Pongola-Mtamvuna (KZN)
  ['Spioenkop', 'Thukela', 270, -28.68, 29.5],
  ['Woodstock', 'Thukela', 373, -28.75, 29.25],
  ['Driel Barrage', 'Thukela', 7, -28.75, 29.3, { verify: true }],
  ['Kilburn (Drakensberg Pumped Storage)', 'Mnjaneni', 36, -28.63, 29.13],
  ['Ntshingwayo (Chelmsford)', 'Ngagane', 194, -27.95, 29.95],
  ['Wagendrift', 'Bushmans', 58, -29.05, 29.85],
  ['Craigie Burn', 'Mnyamvubu', 23, -29.15, 30.3],
  ['Spring Grove', 'Mooi', 139, -29.33, 30.0],
  ['Mearns', 'Mooi', 5, -29.25, 30.25, { verify: true }],
  ['Midmar', 'uMngeni', 235, -29.5, 30.2],
  ['Albert Falls', 'uMngeni', 288, -29.43, 30.42],
  ['Nagle', 'uMngeni', 23, -29.58, 30.62],
  ['Inanda', 'uMngeni', 242, -29.69, 30.86],
  ['Hazelmere', 'Mdloti', 43, -29.6, 31.04],
  ['Shongweni', 'Mlazi', 4, -29.86, 30.72, { verify: true }],
  ['Goedertrouw', 'Mhlathuze', 301, -28.77, 31.47],
  ['Klipfontein', 'Wit Mfolozi', 19, -27.8, 30.92],
  ['Bivane (Paris)', 'Bivane', 113, -27.53, 31.0],
  ['Hluhluwe', 'Hluhluwe', 30, -28.1, 32.05],
  ['Mvutshini', 'Mvutshini', 6, -30.93, 30.23, { verify: true }],
  // ---- Mzimvubu-Tsitsikamma (EC)
  ['Xonxa', 'White Kei', 115, -31.93, 27.17],
  ['Lubisi', 'Indwe', 151, -31.72, 27.22],
  ['Ncora', 'Tsomo', 172, -31.8, 27.67],
  ['Wriggleswade', 'Kubusi', 92, -32.6, 27.55],
  ['Gubu', 'Gubu', 9, -32.6, 27.2, { verify: true }],
  ['Waterdown', 'Klaas Smits', 37, -32.07, 26.98],
  ['Bridle Drift', 'Buffalo', 74, -32.98, 27.73],
  ['Laing', 'Buffalo', 19, -32.97, 27.53],
  ['Rooikrantz', 'Buffalo', 5, -32.88, 27.33, { verify: true }],
  ['Nahoon', 'Nahoon', 21, -32.92, 27.85],
  ['Sandile', 'Keiskamma', 31, -32.73, 27.12],
  ['Binfield Park', 'Tyume', 37, -32.65, 26.92],
  ['Darlington (Lake Mentz)', 'Sundays', 186, -33.17, 25.15],
  ['Kouga', 'Kouga', 126, -33.73, 24.58],
  ['Churchill', 'Kromme', 36, -33.98, 24.32],
  ['Impofu', 'Kromme', 106, -33.94, 24.47],
  ['Groendal', 'Swartkops', 12, -33.63, 25.3],
  ['Loerie', 'Loerie', 3, -33.88, 25.0, { verify: true }],
  ['Mabeleni', 'Tsitsa', 12, -31.38, 28.6, { verify: true }],
  ['Ludeke', 'Mzintlava', 14, -30.88, 29.73, { verify: true }],
  // ---- Breede-Gouritz
  ['Brandvlei', 'Breede', 284, -33.7, 19.43],
  ['Stettynskloof', 'Holsloot', 15, -33.85, 19.25, { verify: true }],
  ['Kwaggaskloof', 'Breede', 33, -33.72, 19.48, { verify: true }],
  ['Stompdrift', 'Olifants (Gouritz)', 55, -33.52, 22.62],
  ['Kammanassie', 'Kammanassie', 36, -33.62, 22.63],
  ['Floriskraal', 'Buffels', 50, -33.27, 21.12],
  ['Gamkapoort', 'Gamka', 36, -33.27, 21.58],
  ['Leeu-Gamka', 'Leeu', 13, -32.78, 21.98, { verify: true }],
  ['Garden Route', 'Swart', 10, -33.95, 22.45, { verify: true }],
  ['Wolwedans', 'Groot Brak', 25, -34.03, 22.2],
  ['Haarlem', 'Groot', 4, -33.77, 23.27, { verify: true }],
  ['Calitzdorp', 'Nels', 5, -33.5, 21.68, { verify: true }],
  ['Misverstand', 'Berg', 7, -33.0, 18.78, { verify: true }],
  // ---- Berg-Olifants
  ['Voëlvlei', 'Klein Berg', 158, -33.35, 19.03],
  ['Berg River', 'Berg', 127, -33.88, 19.05],
  ['Wemmershoek', 'Wemmershoek', 58, -33.83, 19.1],
  ['Steenbras Upper', 'Steenbras', 32, -34.15, 18.9],
  ['Steenbras Lower', 'Steenbras', 34, -34.17, 18.85],
  ['Clanwilliam', 'Olifants (Western)', 122, -32.2, 18.88],
  ['Bulshoek', 'Olifants (Western)', 6, -31.98, 18.78, { verify: true }],
  ['Kogelberg', 'Palmiet', 19, -34.25, 18.97, { verify: true }],
  ['Rockview', 'Palmiet', 18, -34.18, 19.0, { verify: true }],
  ['Wolseley', 'Klein Berg', 3, -33.4, 19.2, { verify: true }],
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const DAM_REFS: DamRef[] = ROWS.map(([name, river, capacity, lat, lon, flags]) => ({
  id: `dam-${slug(name)}`,
  name,
  river,
  capacity,
  lat,
  lon,
  ...flags,
}));
