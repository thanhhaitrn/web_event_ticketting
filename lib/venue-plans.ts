// Hand-drawn venue plans. Coordinates are pixels on the event's published map, so a plan
// can be checked against the image; each section names the ticket tier (Zone.name) it sells.
type Point = [number, number];

export type PlanSection = {
  zone: string;
  label: string;
  points: Point[];
  rotate?: number;
  fontSize?: number;
};

export type Plan = {
  box: { x: number; y: number; w: number; h: number };
  stage: { x: number; y: number; label: string; fontSize: number };
  decor: { points: Point[]; fill: string; label?: string }[];
  sections: PlanSection[];
};

/** the map is symmetrical about x = 540: side A on the right, side B on the left */
const mirror = (points: Point[]): Point[] => points.map(([x, y]) => [1080 - x, y]);
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const UNSOLD = "#e9e6e2";
const unsoldRight: Point[][] = [
  // upper stand
  [[640, 268], [682, 233], [722, 262], [680, 292]],
  [[664, 300], [702, 274], [772, 318], [730, 344]],
  [[706, 352], [772, 322], [790, 345], [716, 376]],
  [[718, 382], [792, 350], [804, 382], [730, 412]],
  // outer stand, top and bottom
  [[822, 372], [870, 330], [920, 372], [882, 412]],
  [[850, 712], [946, 712], [930, 762], [850, 750]],
  // lower ring
  [[695, 772], [790, 822], [742, 895], [668, 850]],
  [[664, 856], [722, 893], [692, 935], [640, 900]],
  [[604, 868], [660, 898], [632, 960], [584, 938]],
  [[566, 892], [600, 908], [582, 978], [552, 978]],
];
const unsoldCentre: Point[] = [[514, 892], [566, 892], [568, 978], [512, 978]];

const pair = (zone: string, name: string, right: Point[], fontSize?: number): PlanSection[] => [
  { zone, label: `${name} A`, points: right, fontSize },
  { zone, label: `${name} B`, points: mirror(right), fontSize },
];

const standBlock = (zone: string, label: string, right: Point[]): PlanSection[] => [
  { zone, label: `${label.replace("#", "A")}`, points: right, fontSize: 10 },
  { zone, label: `${label.replace("#", "B")}`, points: mirror(right), fontSize: 10 },
];

export const PLANS: Record<string, Plan> = {
  // Tùng Dương – Bay Về Phía Mặt Trời, SVĐ Mỹ Đình
  "tung-duong-my-dinh": {
    box: { x: 110, y: 150, w: 860, h: 845 },
    stage: { x: 540, y: 374, label: "STAGE", fontSize: 30 },
    decor: [
      // the pitch, then the T-shaped stage and runway
      { points: ellipse(540, 590, 215, 325), fill: "#5a3019" },
      {
        points: [[422, 347], [657, 347], [657, 405], [558, 405], [558, 510], [522, 510], [522, 405], [422, 405]],
        fill: "#b8763c",
      },
      ...unsoldRight.flatMap((p) => [
        { points: p, fill: UNSOLD },
        { points: mirror(p), fill: UNSOLD },
      ]),
      { points: unsoldCentre, fill: UNSOLD },
      { points: rect(517, 785, 567, 806), fill: "#fff", label: "FOH" },
      { points: ellipse(713, 503, 13, 13), fill: "#111", label: "A" },
      { points: ellipse(367, 503, 13, 13), fill: "#111", label: "B" },
    ],
    sections: [
      { zone: "Skybox Phượng Hoàng", label: "PHƯỢNG HOÀNG", points: rect(458, 808, 625, 838), fontSize: 13 },
      ...pair("SVIP Mặt Trời", "MẶT TRỜI", rect(545, 574, 641, 630)),
      ...pair("VVIP Trời và Đất", "TRỜI VÀ ĐẤT", rect(545, 642, 641, 672), 10),
      ...pair("VIP Gold Tái Sinh", "TÁI SINH", rect(545, 682, 641, 727)),
      ...pair("Đậm Sâu", "ĐẬM SÂU", rect(547, 737, 642, 780)),
      {
        zone: "Khăn Piêu (đứng)",
        label: "KHĂN PIÊU A",
        points: [[571, 440], [629, 440], [629, 567], [550, 567], [550, 535], [571, 535]],
        rotate: -90,
      },
      {
        zone: "Khăn Piêu (đứng)",
        label: "KHĂN PIÊU B",
        points: mirror([[571, 440], [629, 440], [629, 567], [550, 567], [550, 535], [571, 535]]),
        rotate: -90,
      },
      { zone: "Mây (đứng)", label: "MÂY A", points: rect(633, 440, 690, 567), rotate: -90 },
      { zone: "Mây (đứng)", label: "MÂY B", points: mirror(rect(633, 440, 690, 567)), rotate: -90 },
      ...standBlock("Quê Nhà", "QUÊ NHÀ #1", [[731, 417], [812, 395], [822, 430], [741, 455]]),
      ...standBlock("Quê Nhà", "QUÊ NHÀ #1", [[746, 462], [826, 444], [836, 488], [750, 507]]),
      ...standBlock("Ánh Sáng", "ÁNH SÁNG #", [[756, 520], [836, 516], [840, 562], [758, 565]]),
      ...standBlock("Ánh Sáng", "ÁNH SÁNG #", [[757, 577], [838, 572], [842, 620], [758, 625]]),
      ...standBlock("Ánh Sáng", "ÁNH SÁNG #", [[755, 628], [833, 627], [841, 666], [759, 676]]),
      ...standBlock("Quê Nhà", "QUÊ NHÀ #2", [[747, 674], [825, 698], [805, 745], [733, 715]]),
      ...standBlock("Quê Nhà", "QUÊ NHÀ #2", [[728, 727], [800, 755], [775, 805], [712, 765]]),
      ...standBlock("Human", "HUMAN #", [[853, 418], [925, 395], [940, 440], [866, 462]]),
      ...standBlock("Human", "HUMAN #", [[862, 470], [940, 452], [950, 498], [870, 517]]),
      ...standBlock("Con Cò", "CON CÒ #", [[868, 516], [950, 513], [958, 558], [870, 564]]),
      ...standBlock("Con Cò", "CON CÒ #", [[868, 575], [958, 573], [958, 622], [870, 622]]),
      ...standBlock("Con Cò", "CON CÒ #", [[870, 628], [948, 626], [958, 672], [867, 687]]),
    ],
  },
};

function ellipse(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * 2 * Math.PI;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Point;
  });
}
