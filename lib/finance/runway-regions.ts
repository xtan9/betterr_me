import type { RunwayCountry } from "@/lib/finance/cushion";

export type RunwayLocale = "en" | "zh" | "zh-TW";

export interface RunwayRegion {
  code: string;
  labels: Record<RunwayLocale, string>;
}

function region(
  code: string,
  en: string,
  zh = en,
  zhTW = zh,
): RunwayRegion {
  return { code, labels: { en, zh, "zh-TW": zhTW } };
}

const US_REGIONS = [
  region("AL", "Alabama", "阿拉巴马州", "阿拉巴馬州"),
  region("AK", "Alaska", "阿拉斯加州"),
  region("AZ", "Arizona", "亚利桑那州", "亞利桑那州"),
  region("AR", "Arkansas", "阿肯色州"),
  region("CA", "California", "加利福尼亚州", "加利福尼亞州"),
  region("CO", "Colorado", "科罗拉多州", "科羅拉多州"),
  region("CT", "Connecticut", "康涅狄格州", "康乃狄克州"),
  region("DE", "Delaware", "特拉华州", "德拉瓦州"),
  region("DC", "District of Columbia", "哥伦比亚特区", "哥倫比亞特區"),
  region("FL", "Florida", "佛罗里达州", "佛羅里達州"),
  region("GA", "Georgia", "佐治亚州", "喬治亞州"),
  region("HI", "Hawaii", "夏威夷州"),
  region("ID", "Idaho", "爱达荷州", "愛達荷州"),
  region("IL", "Illinois", "伊利诺伊州", "伊利諾州"),
  region("IN", "Indiana", "印第安纳州", "印第安納州"),
  region("IA", "Iowa", "艾奥瓦州", "愛荷華州"),
  region("KS", "Kansas", "堪萨斯州", "堪薩斯州"),
  region("KY", "Kentucky", "肯塔基州"),
  region("LA", "Louisiana", "路易斯安那州"),
  region("ME", "Maine", "缅因州", "緬因州"),
  region("MD", "Maryland", "马里兰州", "馬里蘭州"),
  region("MA", "Massachusetts", "马萨诸塞州", "麻薩諸塞州"),
  region("MI", "Michigan", "密歇根州"),
  region("MN", "Minnesota", "明尼苏达州", "明尼蘇達州"),
  region("MS", "Mississippi", "密西西比州"),
  region("MO", "Missouri", "密苏里州", "密蘇里州"),
  region("MT", "Montana", "蒙大拿州"),
  region("NE", "Nebraska", "内布拉斯加州", "內布拉斯加州"),
  region("NV", "Nevada", "内华达州", "內華達州"),
  region("NH", "New Hampshire", "新罕布什尔州", "新罕布夏州"),
  region("NJ", "New Jersey", "新泽西州", "紐澤西州"),
  region("NM", "New Mexico", "新墨西哥州"),
  region("NY", "New York", "纽约州", "紐約州"),
  region("NC", "North Carolina", "北卡罗来纳州", "北卡羅來納州"),
  region("ND", "North Dakota", "北达科他州", "北達科他州"),
  region("OH", "Ohio", "俄亥俄州"),
  region("OK", "Oklahoma", "俄克拉荷马州", "奧克拉荷馬州"),
  region("OR", "Oregon", "俄勒冈州", "俄勒岡州"),
  region("PA", "Pennsylvania", "宾夕法尼亚州", "賓夕法尼亞州"),
  region("RI", "Rhode Island", "罗得岛州", "羅德島州"),
  region("SC", "South Carolina", "南卡罗来纳州", "南卡羅來納州"),
  region("SD", "South Dakota", "南达科他州", "南達科他州"),
  region("TN", "Tennessee", "田纳西州", "田納西州"),
  region("TX", "Texas", "得克萨斯州", "德克薩斯州"),
  region("UT", "Utah", "犹他州", "猶他州"),
  region("VT", "Vermont", "佛蒙特州"),
  region("VA", "Virginia", "弗吉尼亚州", "維吉尼亞州"),
  region("WA", "Washington", "华盛顿州", "華盛頓州"),
  region("WV", "West Virginia", "西弗吉尼亚州", "西維吉尼亞州"),
  region("WI", "Wisconsin", "威斯康星州"),
  region("WY", "Wyoming", "怀俄明州", "懷俄明州"),
];

const CA_REGIONS = [
  region("AB", "Alberta", "阿尔伯塔省", "亞伯達省"),
  region("BC", "British Columbia", "不列颠哥伦比亚省", "卑詩省"),
  region("MB", "Manitoba", "曼尼托巴省"),
  region("NB", "New Brunswick", "新不伦瑞克省", "新不倫瑞克省"),
  region("NL", "Newfoundland and Labrador", "纽芬兰与拉布拉多省", "紐芬蘭與拉布拉多省"),
  region("NS", "Nova Scotia", "新斯科舍省", "新斯科細亞省"),
  region("NT", "Northwest Territories", "西北地区", "西北地區"),
  region("NU", "Nunavut", "努纳武特地区", "努納武特地區"),
  region("ON", "Ontario", "安大略省"),
  region("PE", "Prince Edward Island", "爱德华王子岛省", "愛德華王子島省"),
  region("QC", "Quebec", "魁北克省"),
  region("SK", "Saskatchewan", "萨斯喀彻温省", "薩斯喀徹溫省"),
  region("YT", "Yukon", "育空地区", "育空地區"),
];

const CN_REGIONS = [
  region("BJ", "Beijing", "北京市", "北京市"),
  region("TJ", "Tianjin", "天津市", "天津市"),
  region("HE", "Hebei", "河北省", "河北省"),
  region("SX", "Shanxi", "山西省", "山西省"),
  region("NM", "Inner Mongolia", "内蒙古自治区", "內蒙古自治區"),
  region("LN", "Liaoning", "辽宁省", "遼寧省"),
  region("JL", "Jilin", "吉林省", "吉林省"),
  region("HL", "Heilongjiang", "黑龙江省", "黑龍江省"),
  region("SH", "Shanghai", "上海市", "上海市"),
  region("JS", "Jiangsu", "江苏省", "江蘇省"),
  region("ZJ", "Zhejiang", "浙江省", "浙江省"),
  region("AH", "Anhui", "安徽省", "安徽省"),
  region("FJ", "Fujian", "福建省", "福建省"),
  region("JX", "Jiangxi", "江西省", "江西省"),
  region("SD", "Shandong", "山东省", "山東省"),
  region("HA", "Henan", "河南省", "河南省"),
  region("HB", "Hubei", "湖北省", "湖北省"),
  region("HN", "Hunan", "湖南省", "湖南省"),
  region("GD", "Guangdong", "广东省", "廣東省"),
  region("GX", "Guangxi", "广西壮族自治区", "廣西壯族自治區"),
  region("HI", "Hainan", "海南省", "海南省"),
  region("CQ", "Chongqing", "重庆市", "重慶市"),
  region("SC", "Sichuan", "四川省", "四川省"),
  region("GZ", "Guizhou", "贵州省", "貴州省"),
  region("YN", "Yunnan", "云南省", "雲南省"),
  region("XZ", "Tibet", "西藏自治区", "西藏自治區"),
  region("SN", "Shaanxi", "陕西省", "陝西省"),
  region("GS", "Gansu", "甘肃省", "甘肅省"),
  region("QH", "Qinghai", "青海省", "青海省"),
  region("NX", "Ningxia", "宁夏回族自治区", "寧夏回族自治區"),
  region("XJ", "Xinjiang", "新疆维吾尔自治区", "新疆維吾爾自治區"),
];

const TW_REGIONS = [
  region("TPE", "Taipei City", "台北市", "臺北市"),
  region("NWT", "New Taipei City", "新北市", "新北市"),
  region("TAO", "Taoyuan City", "桃园市", "桃園市"),
  region("TXG", "Taichung City", "台中市", "臺中市"),
  region("TNN", "Tainan City", "台南市", "臺南市"),
  region("KHH", "Kaohsiung City", "高雄市", "高雄市"),
  region("KEE", "Keelung City", "基隆市", "基隆市"),
  region("HSZ", "Hsinchu City", "新竹市", "新竹市"),
  region("CYI", "Chiayi City", "嘉义市", "嘉義市"),
  region("HSQ", "Hsinchu County", "新竹县", "新竹縣"),
  region("MIA", "Miaoli County", "苗栗县", "苗栗縣"),
  region("CHA", "Changhua County", "彰化县", "彰化縣"),
  region("NAN", "Nantou County", "南投县", "南投縣"),
  region("YUN", "Yunlin County", "云林县", "雲林縣"),
  region("CYQ", "Chiayi County", "嘉义县", "嘉義縣"),
  region("PIF", "Pingtung County", "屏东县", "屏東縣"),
  region("ILA", "Yilan County", "宜兰县", "宜蘭縣"),
  region("HUA", "Hualien County", "花莲县", "花蓮縣"),
  region("TTT", "Taitung County", "台东县", "臺東縣"),
  region("PEN", "Penghu County", "澎湖县", "澎湖縣"),
  region("KIN", "Kinmen County", "金门县", "金門縣"),
  region("LIE", "Lienchiang County", "连江县", "連江縣"),
];

export const RUNWAY_REGIONS: Record<RunwayCountry, RunwayRegion[]> = {
  US: US_REGIONS,
  CA: CA_REGIONS,
  CN: CN_REGIONS,
  TW: TW_REGIONS,
};

export function normalizeRunwayLocale(locale: string): RunwayLocale {
  if (locale.toLowerCase().startsWith("zh-tw")) return "zh-TW";
  if (locale.toLowerCase().startsWith("zh")) return "zh";
  return "en";
}

export function runwayRegionLabel(
  country: RunwayCountry,
  code: string,
  locale: string,
) {
  return RUNWAY_REGIONS[country].find((item) => item.code === code)?.labels[
    normalizeRunwayLocale(locale)
  ];
}

export function normalizeLegacyRegion(
  country: RunwayCountry,
  value: string,
) {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return "";
  const compact = normalized.normalize("NFKC").replace(/[.\s_-]/g, "");
  const exact = RUNWAY_REGIONS[country].find(
    (item) =>
      item.code.toLocaleLowerCase() === normalized ||
      Object.values(item.labels).some(
        (label) => label.toLocaleLowerCase() === normalized,
      ),
  );
  if (exact) return exact.code;
  if (compact.length < 4) return "";
  const prefixMatches = RUNWAY_REGIONS[country].filter((item) =>
    Object.values(item.labels).some((label) =>
      label
        .toLocaleLowerCase()
        .normalize("NFKC")
        .replace(/[.\s_-]/g, "")
        .startsWith(compact),
    ),
  );
  return (
    prefixMatches.length === 1 ? prefixMatches[0].code : ""
  );
}
