// Vị trí địa danh (địa điểm học) và thành phố chính của từng tỉnh, dạng [vĩ độ, kinh độ].
//
// Nguồn toạ độ: Wikipedia tiếng Nhật (toạ độ chính của bài viết). Mỗi điểm đã được kiểm tra nằm trong
// đúng tỉnh theo ranh giới thành phố/quận (国土数値情報 N03). Trong ngoặc là bài viết dùng làm nguồn;
// "≈" là vị trí sát bên được dùng thay khi bài viết gốc không có toạ độ (lệch dưới ~1 km).
// Địa danh trải trên nhiều tỉnh (núi Phú Sĩ, cầu Seto Ohashi, dãy Shirakami, dãy núi Kii, Amami/Iriomote)
// có một điểm riêng nằm trong mỗi tỉnh.
// Thành phố: thủ phủ tỉnh + thành phố chỉ định (政令指定都市) + thành phố trung tâm (中核市).

export type LatLon = [number, number];

export interface PrefectureCity {
  nameJp: string;
  /** Tên Latin (Hepburn, không dấu trường âm) */
  nameVi: string;
  capital: boolean;
  pos: LatLon;
}

/** Vị trí các địa danh của tỉnh, theo id biểu tượng (không gồm đặc sản) */
export const LANDMARK_POSITIONS: Record<number, Record<string, LatLon>> = {
  1: {
    'P_shiretoko': [44.03333, 145.08333], // 知床半島
    'P_lake-mashu': [43.58333, 144.53333], // 摩周湖
  },
  2: {
    'P_nebuta': [40.82885, 140.73469], // ねぶたの家 ワ・ラッセ ≈ 青森駅
    'N_shirakami': [40.55358, 139.98107], // 十二湖
  },
  3: {
    'P_chuson-ji': [39.00153, 141.10272], // 中尊寺
  },
  4: {
    'P_matsushima': [38.3556, 141.0764], // 松島
  },
  5: {
    'P_namahage': [39.92917, 139.76658], // 男鹿真山伝承館 ≈ なまはげ館
    'N_shirakami': [40.27828, 140.26169], // 藤里町
  },
  6: {
    'P_ginzan': [38.5697, 140.5311], // 銀山温泉
  },
  7: {
    'P_sazaedo': [37.50372, 139.95597], // 円通三匝堂 ≈ 飯盛山 (福島県)
  },
  8: {
    'P_kairakuen': [36.37306, 140.45621], // 偕楽園
    'P_kashima-jingu': [35.96886, 140.63149], // 鹿島神宮
    'N_fukuroda-falls': [36.76419, 140.40736], // 袋田の滝
  },
  9: {
    'P_nikko-toshogu': [36.75806, 139.59894], // 日光東照宮
    'N_kegon-falls': [36.73792, 139.50197], // 華厳滝
  },
  10: {
    'P_tomioka': [36.25528, 138.88778], // 富岡製糸場
    'N_kusatsu': [36.62281, 138.59664], // 草津温泉
  },
  11: {
    'P_kawagoe': [35.9275, 139.48853], // 川越氷川神社
  },
  12: {
    'P_shinshoji': [35.78605, 140.31827], // 成田山新勝寺
  },
  13: {
    'P_tokyo-tower': [35.65861, 139.74556], // 東京タワー
    'P_tokyo-skytree': [35.71014, 139.81083], // 東京スカイツリー
    'P_asakusa': [35.71472, 139.79675], // 浅草寺
    'P_imperial-palace': [35.6825, 139.75278], // 皇居
    'P_meiji-jingu': [35.67611, 139.69917], // 明治神宮
    'P_kabukiza': [35.66953, 139.768], // 歌舞伎座
    'P_national-diet-building': [35.6757, 139.7448], // 国会議事堂
    'P_ginza': [35.67283, 139.76325], // 銀座 ≈ 銀座駅
    'P_akihabara': [35.69833, 139.77306], // 秋葉原駅
    'P_harajuku': [35.67022, 139.70267], // 原宿駅
    'P_toyosu-market': [35.64567, 139.78564], // 豊洲市場 ≈ 市場前駅
    'P_kokugikan': [35.69692, 139.79353], // 国技館 ≈ 両国国技館
    'P_budokan': [35.69311, 139.74936], // 日本武道館
    'P_tokyo-dome': [35.70583, 139.75194], // 東京ドーム
    'P_national-stadium': [35.67806, 139.71472], // 国立競技場
    'N_le-corbusier': [35.71556, 139.77583], // 国立西洋美術館
  },
  14: {
    'P_kamakura': [35.31672, 139.53615], // 高徳院
    'P_tsurugaoka-hachimangu': [35.32609, 139.55644], // 鶴岡八幡宮
    'P_enoshima-island': [35.3, 139.48056], // 江の島
    'P_yokohama-chinatown': [35.4427, 139.6459], // 横浜中華街
    'P_yokohama-brick-warehouse': [35.45014, 139.63617], // 横浜赤レンガ倉庫 ≈ 馬車道駅
  },
  15: {
    'P_sado-island': [38.03333, 138.36667], // 佐渡島
  },
  16: {
    'P_tateyama': [36.57583, 137.61972], // 立山
    'P_kurobe-gorge': [36.81708, 137.58153], // 黒部峡谷 ≈ 宇奈月温泉
  },
  17: {
    'P_kenrokuen': [36.56214, 136.6625], // 兼六園
  },
  18: {
    'P_tojinbo': [36.23778, 136.12528], // 東尋坊
    'P_sabae': [35.95647, 136.18428], // 鯖江市
  },
  19: {
    'P_fuji-five-lakes': [35.51778, 138.75611], // 河口湖
    'P_mt-fuji': [35.47075, 138.79242], // 吉田口登山道 ≈ 北口本宮冨士浅間神社
  },
  20: {
    'P_matsumoto-castle': [36.2391, 137.96912], // 松本城
    'P_jigokudani': [36.73281, 138.46269], // 地獄谷野猿公苑
    'N_suwako': [36.04917, 138.08528], // 諏訪湖
    'H_kyu-kaichigakkou-kousha': [36.24306, 137.96825], // 旧開智学校
  },
  21: {
    'P_shirakawa-go': [36.25833, 136.90556], // 白川郷
    'N_gero': [35.80889, 137.24358], // 下呂温泉
  },
  22: {
    'P_mt-fuji': [35.22741, 138.61], // 富士山本宮浅間大社
    'P_miho-no-matsubara': [34.99361, 138.52278], // 三保の松原
  },
  23: {
    'P_nagoya-castle': [35.18556, 136.89861], // 名古屋城
  },
  24: {
    'P_ise-jingu': [34.455, 136.72518], // 伊勢神宮
    'N_kiisanchi': [33.87986, 136.09333], // 熊野古道伊勢路 ≈ 花の窟神社
  },
  25: {
    'P_enryakuji': [35.07045, 135.84092], // 延暦寺
  },
  26: {
    'P_rokuonji': [35.0394, 135.72936], // 鹿苑寺
    'P_fushimi-inari': [34.96694, 135.77306], // 伏見稲荷大社
    'P_kiyomizu': [34.99483, 135.785], // 清水寺
    'P_ginkaku-ji': [35.02687, 135.79825], // 慈照寺
    'P_ama-no-hashidate': [35.56936, 135.19153], // 天橋立
  },
  27: {
    'P_tsutenkaku-tower': [34.65222, 135.50611], // 通天閣 ≈ 新世界 (大阪)
    'P_tower-of-the-sun': [34.80964, 135.53231], // 太陽の塔
    'P_abeno-harukasu': [34.64564, 135.51391], // あべのハルカス ≈ 大阪阿部野橋駅
    'P_tomb-emperor-nintoku': [34.56393, 135.48731], // 大仙陵古墳
  },
  28: {
    'P_himeji-castle': [34.83938, 134.6941], // 姫路城
    'P_koshien': [34.72391, 135.36319], // 阪神甲子園球場 ≈ 甲子園駅
    'N_arima': [34.79806, 135.2475], // 有馬温泉
  },
  29: {
    'P_nara-park': [34.68556, 135.84333], // 奈良公園
    'P_todaiji': [34.68897, 135.83983], // 東大寺
    'P_horyuji': [34.61474, 135.73417], // 法隆寺
    'N_kiisanchi': [34.3564, 135.8706], // 吉野山
  },
  30: {
    'P_nachi-falls': [33.67528, 135.8875], // 那智滝
    'N_kiisanchi': [33.8404, 135.7736], // 熊野本宮大社
  },
  31: {
    'P_tottori-sand-dunes': [35.5425, 134.23028], // 鳥取砂丘
  },
  32: {
    'P_izumo': [35.40194, 132.68544], // 出雲大社
    'H_iwamiginzan': [35.11278, 132.435], // 石見銀山
  },
  33: {
    'P_korakuen': [34.66813, 133.93514], // 岡山後楽園
    'P_seto-bridge': [34.43548, 133.81245], // 鷲羽山
  },
  34: {
    'P_itsukushima': [34.29602, 132.31989], // 厳島神社
    'P_atomic-bomb-dome': [34.39556, 132.45361], // 原爆ドーム
    'P_hiroshima-peace-park': [34.39272, 132.45236], // 広島平和記念公園
    'P_senkoku-ji': [34.41092, 133.19878], // 千光寺 (尾道市)
  },
  35: {
    'P_kintaikyo': [34.17526, 132.17423], // 錦帯橋 ≈ 岩国城
  },
  36: {
    'C_awa-dance': [34.07014, 134.54508], // 阿波おどり会館
  },
  37: {
    'P_kotohiragu': [34.184, 133.80954], // 金刀比羅宮
    'P_seto-bridge': [34.35267, 133.82603], // 瀬戸大橋記念公園
  },
  38: {
    'P_dogo-onsen': [33.85194, 132.78639], // 道後温泉
  },
  39: {
    'P_shimanto-river': [32.93385, 132.99572], // 四万十川
    'H_yosakoi': [33.55994, 133.54264], // はりまや橋
  },
  40: {
    'P_dazaifu-tenmangu': [33.52153, 130.53486], // 太宰府天満宮
    'H_munakata-okinoshima': [33.83117, 130.51422], // 宗像大社
  },
  41: {
    'P_karatsu-float': [33.45222, 129.96956], // 唐津神社
    'P_yoshinogari': [33.32361, 130.39069], // 吉野ヶ里遺跡
  },
  42: {
    'H_gunkanjima': [32.62778, 129.73833], // 端島 (長崎県)
    'P_nagasaki-peace-park': [32.77692, 129.86397], // 平和公園 (長崎市) ≈ 平和祈念像
    'P_oura-church': [32.73417, 129.87014], // 大浦天主堂
    'H_dejima': [32.74352, 129.87302], // 出島
    'H_glovergarden': [32.73436, 129.86915], // グラバー園
    'N_hausutenbosu': [33.08594, 129.78988], // ハウステンボス
    'N_kujukushima': [33.13236, 129.69286], // 九十九島 ≈ 展海峰
    'N_fugendake': [32.76134, 130.29869], // 普賢岳
  },
  43: {
    'P_amakusa': [32.4, 130.11667], // 天草諸島
  },
  44: {
    'P_yufuin': [33.26603, 131.36861], // 由布院温泉
  },
  45: {
    'P_takachiho': [32.70817, 131.29894], // 高千穂峡
  },
  46: {
    'P_yakushima': [30.39025, 130.6515], // 屋久島 ≈ 屋久島町
    'P_tanegashima': [30.58333, 130.98333], // 種子島
    'N_amami-oshima_tokunoshima_iriomotejima': [28.32639, 129.37444], // 奄美大島
  },
  47: {
    'P_shurijo': [26.21703, 127.71948], // 首里城
    'N_amami-oshima_tokunoshima_iriomotejima': [24.2925, 123.86194], // 西表島
  },
};

export const PREFECTURE_CITIES: Record<number, PrefectureCity[]> = {
  1: [
    { nameJp: '札幌市', nameVi: 'Sapporo', capital: true, pos: [43.0619, 141.3544] },
    { nameJp: '函館市', nameVi: 'Hakodate', capital: false, pos: [41.76867, 140.72892] },
    { nameJp: '旭川市', nameVi: 'Asahikawa', capital: false, pos: [43.77064, 142.365] },
  ],
  2: [
    { nameJp: '青森市', nameVi: 'Aomori', capital: true, pos: [40.8228, 140.7469] },
    { nameJp: '八戸市', nameVi: 'Hachinohe', capital: false, pos: [40.51228, 141.48839] },
  ],
  3: [
    { nameJp: '盛岡市', nameVi: 'Morioka', capital: true, pos: [39.70208, 141.1545] },
  ],
  4: [
    { nameJp: '仙台市', nameVi: 'Sendai', capital: true, pos: [38.26822, 140.86942] },
  ],
  5: [
    { nameJp: '秋田市', nameVi: 'Akita', capital: true, pos: [39.71989, 140.10258] },
  ],
  6: [
    { nameJp: '山形市', nameVi: 'Yamagata', capital: true, pos: [38.25542, 140.33961] },
  ],
  7: [
    { nameJp: '福島市', nameVi: 'Fukushima', capital: true, pos: [37.76081, 140.47472] },
    { nameJp: '郡山市', nameVi: 'Koriyama', capital: false, pos: [37.4003, 140.3597] },
    { nameJp: 'いわき市', nameVi: 'Iwaki', capital: false, pos: [37.0505, 140.88772] },
  ],
  8: [
    { nameJp: '水戸市', nameVi: 'Mito', capital: true, pos: [36.36583, 140.47125] },
  ],
  9: [
    { nameJp: '宇都宮市', nameVi: 'Utsunomiya', capital: true, pos: [36.55511, 139.88256] },
  ],
  10: [
    { nameJp: '前橋市', nameVi: 'Maebashi', capital: true, pos: [36.3895, 139.06344] },
    { nameJp: '高崎市', nameVi: 'Takasaki', capital: false, pos: [36.32311, 139.00236] },
  ],
  11: [
    { nameJp: 'さいたま市', nameVi: 'Saitama', capital: true, pos: [35.8614, 139.6456] },
    { nameJp: '川越市', nameVi: 'Kawagoe', capital: false, pos: [35.92514, 139.48578] },
    { nameJp: '川口市', nameVi: 'Kawaguchi', capital: false, pos: [35.80758, 139.72414] },
    { nameJp: '越谷市', nameVi: 'Koshigaya', capital: false, pos: [35.89114, 139.79092] },
  ],
  12: [
    { nameJp: '千葉市', nameVi: 'Chiba', capital: true, pos: [35.60728, 140.10636] },
    { nameJp: '船橋市', nameVi: 'Funabashi', capital: false, pos: [35.69456, 139.98256] },
    { nameJp: '柏市', nameVi: 'Kashiwa', capital: false, pos: [35.86758, 139.97575] },
  ],
  13: [
    { nameJp: '新宿区', nameVi: 'Shinjuku', capital: true, pos: [35.6895, 139.69175] },
    { nameJp: '八王子市', nameVi: 'Hachioji', capital: false, pos: [35.66644, 139.316] },
  ],
  14: [
    { nameJp: '横浜市', nameVi: 'Yokohama', capital: true, pos: [35.45033, 139.63422] },
    { nameJp: '川崎市', nameVi: 'Kawasaki', capital: false, pos: [35.53089, 139.703] },
    { nameJp: '相模原市', nameVi: 'Sagamihara', capital: false, pos: [35.57142, 139.37314] },
    { nameJp: '横須賀市', nameVi: 'Yokosuka', capital: false, pos: [35.28131, 139.67208] },
  ],
  15: [
    { nameJp: '新潟市', nameVi: 'Niigata', capital: true, pos: [37.91619, 139.03639] },
  ],
  16: [
    { nameJp: '富山市', nameVi: 'Toyama', capital: true, pos: [36.69592, 137.21369] },
  ],
  17: [
    { nameJp: '金沢市', nameVi: 'Kanazawa', capital: true, pos: [36.56106, 136.6565] },
  ],
  18: [
    { nameJp: '福井市', nameVi: 'Fukui', capital: true, pos: [36.06406, 136.21958] },
  ],
  19: [
    { nameJp: '甲府市', nameVi: 'Kofu', capital: true, pos: [35.66214, 138.56822] },
  ],
  20: [
    { nameJp: '長野市', nameVi: 'Nagano', capital: true, pos: [36.64867, 138.19469] },
    { nameJp: '松本市', nameVi: 'Matsumoto', capital: false, pos: [36.238, 137.97197] },
  ],
  21: [
    { nameJp: '岐阜市', nameVi: 'Gifu', capital: true, pos: [35.42625, 136.75944] },
  ],
  22: [
    { nameJp: '静岡市', nameVi: 'Shizuoka', capital: true, pos: [34.9756, 138.3825] },
    { nameJp: '浜松市', nameVi: 'Hamamatsu', capital: false, pos: [34.71089, 137.72619] },
  ],
  23: [
    { nameJp: '名古屋市', nameVi: 'Nagoya', capital: true, pos: [35.1814, 136.9064] },
    { nameJp: '豊橋市', nameVi: 'Toyohashi', capital: false, pos: [34.76917, 137.39153] },
    { nameJp: '岡崎市', nameVi: 'Okazaki', capital: false, pos: [34.95472, 137.17303] },
    { nameJp: '一宮市', nameVi: 'Ichinomiya', capital: false, pos: [35.3039, 136.8031] },
    { nameJp: '豊田市', nameVi: 'Toyota', capital: false, pos: [35.08242, 137.15633] },
  ],
  24: [
    { nameJp: '津市', nameVi: 'Tsu', capital: true, pos: [34.71844, 136.50578] },
  ],
  25: [
    { nameJp: '大津市', nameVi: 'Otsu', capital: true, pos: [35.01779, 135.85481] },
  ],
  26: [
    { nameJp: '京都市', nameVi: 'Kyoto', capital: true, pos: [35.01161, 135.76811] },
  ],
  27: [
    { nameJp: '大阪市', nameVi: 'Osaka', capital: true, pos: [34.69375, 135.50211] },
    { nameJp: '堺市', nameVi: 'Sakai', capital: false, pos: [34.57333, 135.483] },
    { nameJp: '豊中市', nameVi: 'Toyonaka', capital: false, pos: [34.7815, 135.46964] },
    { nameJp: '吹田市', nameVi: 'Suita', capital: false, pos: [34.75947, 135.51683] },
    { nameJp: '高槻市', nameVi: 'Takatsuki', capital: false, pos: [34.846, 135.61725] },
    { nameJp: '枚方市', nameVi: 'Hirakata', capital: false, pos: [34.81436, 135.65064] },
    { nameJp: '八尾市', nameVi: 'Yao', capital: false, pos: [34.62692, 135.60083] },
    { nameJp: '寝屋川市', nameVi: 'Neyagawa', capital: false, pos: [34.76608, 135.62808] },
    { nameJp: '東大阪市', nameVi: 'Higashiosaka', capital: false, pos: [34.67936, 135.60089] },
  ],
  28: [
    { nameJp: '神戸市', nameVi: 'Kobe', capital: true, pos: [34.69017, 135.19544] },
    { nameJp: '姫路市', nameVi: 'Himeji', capital: false, pos: [34.81517, 134.68539] },
    { nameJp: '尼崎市', nameVi: 'Amagasaki', capital: false, pos: [34.73383, 135.40633] },
    { nameJp: '明石市', nameVi: 'Akashi', capital: false, pos: [34.64314, 134.99722] },
    { nameJp: '西宮市', nameVi: 'Nishinomiya', capital: false, pos: [34.73764, 135.34175] },
  ],
  29: [
    { nameJp: '奈良市', nameVi: 'Nara', capital: true, pos: [34.685, 135.80478] },
  ],
  30: [
    { nameJp: '和歌山市', nameVi: 'Wakayama', capital: true, pos: [34.23036, 135.17075] },
  ],
  31: [
    { nameJp: '鳥取市', nameVi: 'Tottori', capital: true, pos: [35.49439, 134.22161] },
  ],
  32: [
    { nameJp: '松江市', nameVi: 'Matsue', capital: true, pos: [35.46811, 133.04853] },
  ],
  33: [
    { nameJp: '岡山市', nameVi: 'Okayama', capital: true, pos: [34.65511, 133.91958] },
    { nameJp: '倉敷市', nameVi: 'Kurashiki', capital: false, pos: [34.58508, 133.77211] },
  ],
  34: [
    { nameJp: '広島市', nameVi: 'Hiroshima', capital: true, pos: [34.3914, 132.4519] },
    { nameJp: '呉市', nameVi: 'Kure', capital: false, pos: [34.24922, 132.56572] },
    { nameJp: '福山市', nameVi: 'Fukuyama', capital: false, pos: [34.48586, 133.36231] },
  ],
  35: [
    { nameJp: '山口市', nameVi: 'Yamaguchi', capital: true, pos: [34.17803, 131.47378] },
    { nameJp: '下関市', nameVi: 'Shimonoseki', capital: false, pos: [33.95789, 130.94133] },
  ],
  36: [
    { nameJp: '徳島市', nameVi: 'Tokushima', capital: true, pos: [34.07028, 134.55494] },
  ],
  37: [
    { nameJp: '高松市', nameVi: 'Takamatsu', capital: true, pos: [34.34281, 134.04661] },
  ],
  38: [
    { nameJp: '松山市', nameVi: 'Matsuyama', capital: true, pos: [33.83917, 132.76564] },
  ],
  39: [
    { nameJp: '高知市', nameVi: 'Kochi', capital: true, pos: [33.55883, 133.53122] },
  ],
  40: [
    { nameJp: '福岡市', nameVi: 'Fukuoka', capital: true, pos: [33.59014, 130.40172] },
    { nameJp: '北九州市', nameVi: 'Kitakyushu', capital: false, pos: [33.88342, 130.87519] },
    { nameJp: '久留米市', nameVi: 'Kurume', capital: false, pos: [33.31925, 130.50833] },
  ],
  41: [
    { nameJp: '佐賀市', nameVi: 'Saga', capital: true, pos: [33.2635, 130.30083] },
  ],
  42: [
    { nameJp: '長崎市', nameVi: 'Nagasaki', capital: true, pos: [32.74953, 129.87964] },
    { nameJp: '佐世保市', nameVi: 'Sasebo', capital: false, pos: [33.18, 129.715] },
  ],
  43: [
    { nameJp: '熊本市', nameVi: 'Kumamoto', capital: true, pos: [32.803, 130.70786] },
  ],
  44: [
    { nameJp: '大分市', nameVi: 'Oita', capital: true, pos: [33.23956, 131.60936] },
  ],
  45: [
    { nameJp: '宮崎市', nameVi: 'Miyazaki', capital: true, pos: [31.90772, 131.42019] },
  ],
  46: [
    { nameJp: '鹿児島市', nameVi: 'Kagoshima', capital: true, pos: [31.59681, 130.55714] },
  ],
  47: [
    { nameJp: '那覇市', nameVi: 'Naha', capital: true, pos: [26.2122, 127.6792] },
  ],
};
