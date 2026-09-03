/**
 * 物种树的 dev 预览页。**不经过登录和 API**，用于单独验证 3D 树本身。
 *
 * 路由：/dev/tree            空收集（冷启动的样子）
 *       /dev/tree?mock=40    造 40 条假收集，看点亮后的样子
 *
 * 有这个页面的理由：树的渲染问题和数据链路无关，混在一起排查很慢；
 * 而且冷启动态（一条收集都没有）恰恰是最该反复看的状态 —— 新用户看到的就是它。
 * 参照 /dev/settle-art 的先例。
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CollectionEntry, Rarity, Taxonomy } from "../api";
import SpeciesTree3D from "../components/SpeciesTree3D";

/** 造假收集条目。路径都取真实存在于骨架里的类群，否则挂不上树。 */
const MOCK_PATHS: { path: [string, string][]; zh: string; sci: string }[] = [
  { path: [["kingdom", "Animalia"], ["phylum", "Chordata"], ["class", "Aves"], ["order", "Passeriformes"], ["family", "Corvidae"], ["genus", "Corvus"], ["species", "Corvus corax"]], zh: "渡鸦", sci: "Corvus corax" },
  { path: [["kingdom", "Animalia"], ["phylum", "Chordata"], ["class", "Aves"], ["order", "Passeriformes"], ["family", "Paridae"], ["genus", "Parus"], ["species", "Parus major"]], zh: "大山雀", sci: "Parus major" },
  { path: [["kingdom", "Animalia"], ["phylum", "Chordata"], ["class", "Aves"], ["order", "Anseriformes"], ["family", "Anatidae"], ["genus", "Anas"], ["species", "Anas platyrhynchos"]], zh: "绿头鸭", sci: "Anas platyrhynchos" },
  { path: [["kingdom", "Animalia"], ["phylum", "Chordata"], ["class", "Mammalia"], ["order", "Carnivora"], ["family", "Felidae"], ["genus", "Felis"], ["species", "Felis catus"]], zh: "家猫", sci: "Felis catus" },
  { path: [["kingdom", "Animalia"], ["phylum", "Chordata"], ["class", "Mammalia"], ["order", "Rodentia"], ["family", "Sciuridae"], ["genus", "Sciurus"], ["species", "Sciurus vulgaris"]], zh: "红松鼠", sci: "Sciurus vulgaris" },
  { path: [["kingdom", "Animalia"], ["phylum", "Arthropoda"], ["class", "Insecta"], ["order", "Lepidoptera"], ["family", "Papilionidae"], ["genus", "Papilio"], ["species", "Papilio machaon"]], zh: "金凤蝶", sci: "Papilio machaon" },
  { path: [["kingdom", "Animalia"], ["phylum", "Arthropoda"], ["class", "Insecta"], ["order", "Odonata"], ["family", "Libellulidae"], ["genus", "Orthetrum"]], zh: "灰蜻属", sci: "Orthetrum" },
  { path: [["kingdom", "Animalia"], ["phylum", "Arthropoda"], ["class", "Insecta"], ["order", "Coleoptera"], ["family", "Coccinellidae"]], zh: "瓢虫科", sci: "Coccinellidae" },
  { path: [["kingdom", "Animalia"], ["phylum", "Mollusca"], ["class", "Gastropoda"]], zh: "腹足纲", sci: "Gastropoda" },
  { path: [["kingdom", "Plantae"], ["phylum", "Tracheophyta"], ["class", "Magnoliopsida"], ["order", "Rosales"], ["family", "Rosaceae"], ["genus", "Rosa"], ["species", "Rosa chinensis"]], zh: "月季", sci: "Rosa chinensis" },
  { path: [["kingdom", "Plantae"], ["phylum", "Tracheophyta"], ["class", "Magnoliopsida"], ["order", "Rosales"], ["family", "Rosaceae"], ["genus", "Prunus"], ["species", "Prunus serrulata"]], zh: "樱花", sci: "Prunus serrulata" },
  { path: [["kingdom", "Plantae"], ["phylum", "Tracheophyta"], ["class", "Magnoliopsida"], ["order", "Asterales"], ["family", "Asteraceae"], ["genus", "Taraxacum"]], zh: "蒲公英属", sci: "Taraxacum" },
  { path: [["kingdom", "Plantae"], ["phylum", "Tracheophyta"], ["class", "Magnoliopsida"], ["order", "Fagales"], ["family", "Fagaceae"], ["genus", "Quercus"], ["species", "Quercus acutissima"]], zh: "麻栎", sci: "Quercus acutissima" },
  { path: [["kingdom", "Plantae"], ["phylum", "Tracheophyta"], ["class", "Liliopsida"], ["order", "Poales"], ["family", "Poaceae"], ["genus", "Phyllostachys"]], zh: "刚竹属", sci: "Phyllostachys" },
  { path: [["kingdom", "Plantae"], ["phylum", "Tracheophyta"], ["class", "Pinopsida"], ["order", "Pinales"], ["family", "Pinaceae"], ["genus", "Pinus"], ["species", "Pinus tabuliformis"]], zh: "油松", sci: "Pinus tabuliformis" },
  { path: [["kingdom", "Plantae"], ["phylum", "Bryophyta"], ["class", "Bryopsida"]], zh: "真藓纲", sci: "Bryopsida" },
  { path: [["kingdom", "Fungi"], ["phylum", "Basidiomycota"], ["class", "Agaricomycetes"], ["order", "Agaricales"], ["family", "Amanitaceae"], ["genus", "Amanita"], ["species", "Amanita muscaria"]], zh: "毒蝇鹅膏", sci: "Amanita muscaria" },
  { path: [["kingdom", "Fungi"], ["phylum", "Basidiomycota"], ["class", "Agaricomycetes"], ["order", "Polyporales"], ["family", "Polyporaceae"]], zh: "多孔菌科", sci: "Polyporaceae" },
  { path: [["kingdom", "Fungi"], ["phylum", "Ascomycota"], ["class", "Pezizomycetes"], ["order", "Pezizales"], ["family", "Morchellaceae"], ["genus", "Morchella"]], zh: "羊肚菌属", sci: "Morchella" },
  { path: [["kingdom", "Chromista"], ["phylum", "Ochrophyta"], ["class", "Phaeophyceae"], ["order", "Laminariales"]], zh: "海带目", sci: "Laminariales" },
  { path: [["kingdom", "Protozoa"], ["phylum", "Mycetozoa"]], zh: "黏菌门", sci: "Mycetozoa" },
];

const RARITY: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

function emptyTax(): Taxonomy {
  const k = { name_la: null, name_zh: null };
  return { kingdom: { ...k }, phylum: { ...k }, class: { ...k }, order: { ...k }, family: { ...k }, genus: { ...k }, species: { ...k } };
}

function mockEntries(n: number): CollectionEntry[] {
  const out: CollectionEntry[] = [];
  for (let i = 0; i < n; i++) {
    const src = MOCK_PATHS[i % MOCK_PATHS.length]!;
    const tax = emptyTax();
    let deepest = "";
    for (const [rank, la] of src.path) {
      tax[rank as keyof Taxonomy] = { name_la: la, name_zh: null };
      deepest = la;
    }
    // 同一条路径重复出现时改学名，模拟「一个属下拍到多个种」
    const dup = Math.floor(i / MOCK_PATHS.length);
    out.push({
      id: `mock-${i}`,
      taxonKey: deepest,
      commonName: dup > 0 ? `${src.zh} ${dup + 1}` : src.zh,
      scientificName: src.sci,
      rarity: RARITY[i % RARITY.length]!,
      coverObservationId: null,
      coverDisplayUrl: null,
      firstCollectedAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
      taxonomy: tax,
    });
  }
  return out;
}

export default function DevTreePage() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const n = Math.max(0, Math.min(400, Number(sp.get("mock") ?? 0) || 0));
  const entries = useMemo(() => mockEntries(n), [n]);
  const focusId = sp.get("at");

  return (
    <div className="page-tree3d">
      <SpeciesTree3D
        entries={entries}
        focusId={focusId}
        onFocusChange={(id) => {
          const next = new URLSearchParams(sp);
          if (id) next.set("at", id);
          else next.delete("at");
          setSp(next, { replace: true });
        }}
        onOpenEntry={(e) => navigate(`/collection/species/${e.id}`)}
      />
      <div className="tree3d-devbar">
        {[0, 6, 21, 60, 140].map((v) => (
          <button
            type="button"
            key={v}
            className={v === n ? "on" : ""}
            onClick={() => {
              const next = new URLSearchParams(sp);
              if (v) next.set("mock", String(v));
              else next.delete("mock");
              next.delete("at");
              setSp(next, { replace: true });
            }}
          >
            {v === 0 ? "空" : `${v} 项`}
          </button>
        ))}
      </div>
    </div>
  );
}
