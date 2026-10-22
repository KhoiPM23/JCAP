// Biểu tượng (pictogram) đặc trưng của từng tỉnh, dùng bộ EXPERIENCE JAPAN PICTOGRAMS.
// Tên tiếng Nhật lấy đúng theo tên chính thức trên https://experience-japan.info (trang /pict/{id}).
//
// Điều khoản của bộ icon (Terms of use, Nippon Design Center): dùng miễn phí kể cả thương mại;
// được đổi màu/kích thước nhưng KHÔNG được biến dạng hình; không phân phối lại file icon;
// không link trực tiếp tới file trên trang của họ (nên icon được lưu trong public/pictograms).
// File icon được chép vào public/pictograms bằng scripts/copy-pictograms.mjs.
//
// Nguyên tắc gán: chỉ gán icon gắn với một địa phương rõ ràng (địa danh, di sản, lễ hội, đặc sản
// nổi tiếng nhất của tỉnh). Icon chung (sushi, chùa, ramen...) không gán. Icon trải trên nhiều tỉnh
// thì gán cho tất cả các tỉnh đó.

export type PictogramKind = 'landmark' | 'nature' | 'heritage' | 'culture' | 'food';

export interface Pictogram {
  /** Tên file (không có đuôi) trong bộ icon, cũng là đường dẫn /pict/{id viết thường} trên trang gốc */
  id: string;
  nameJp: string;
  nameVi: string;
  kind: PictogramKind;
}

export const PICTOGRAM_KIND_LABEL: Record<PictogramKind, string> = {
  landmark: 'Địa danh',
  nature: 'Thiên nhiên',
  heritage: 'Di sản',
  culture: 'Văn hóa',
  food: 'Đặc sản',
};

export const PICTOGRAM_CREDIT = {
  text: 'Biểu tượng: Nippon Design Center / EXPERIENCE JAPAN PICTOGRAMS',
  short: 'Biểu tượng © NDC',
  url: 'https://experience-japan.info',
};

const P = (id: string, nameJp: string, nameVi: string, kind: PictogramKind): Pictogram => ({ id, nameJp, nameVi, kind });

export const PICTOGRAMS: Record<string, Pictogram> = Object.fromEntries(
  [
    // ---- Địa danh (P_) ----
    P('P_shiretoko', '知床', 'Bán đảo Shiretoko', 'nature'),
    P('P_lake-mashu', '摩周湖', 'Hồ Mashu', 'nature'),
    P('P_nebuta', 'ねぶた祭', 'Lễ hội Nebuta', 'culture'),
    P('P_chuson-ji', '中尊寺', 'Chùa Chuson-ji', 'landmark'),
    P('P_matsushima', '松島', 'Vịnh Matsushima', 'nature'),
    P('P_namahage', 'なまはげ', 'Namahage', 'culture'),
    P('P_ginzan', '銀山温泉', 'Suối nước nóng Ginzan', 'landmark'),
    P('P_sazaedo', '会津さざえ堂', 'Chùa Sazaedo (Aizu)', 'landmark'),
    P('P_kashima-jingu', '鹿島神宮', 'Đền Kashima', 'landmark'),
    P('P_kairakuen', '偕楽園', 'Vườn Kairakuen', 'landmark'),
    P('P_nikko-toshogu', '日光東照宮', 'Đền Nikko Toshogu', 'landmark'),
    P('P_tomioka', '富岡製糸場', 'Xưởng tơ Tomioka', 'heritage'),
    P('P_kawagoe', '川越', 'Phố cổ Kawagoe', 'landmark'),
    P('P_shinshoji', '成田山新勝寺', 'Chùa Naritasan Shinsho-ji', 'landmark'),
    P('P_tokyo-tower', '東京タワー', 'Tháp Tokyo', 'landmark'),
    P('P_tokyo-skytree', '東京スカイツリー', 'Tháp Tokyo Skytree', 'landmark'),
    P('P_asakusa', '浅草', 'Asakusa', 'landmark'),
    P('P_imperial-palace', '皇居', 'Hoàng cung', 'landmark'),
    P('P_meiji-jingu', '明治神宮', 'Đền Minh Trị (Meiji Jingu)', 'landmark'),
    P('P_kabukiza', '歌舞伎座', 'Nhà hát Kabuki-za', 'culture'),
    P('P_national-diet-building', '国会議事堂', 'Tòa nhà Quốc hội', 'landmark'),
    P('P_ginza', '銀座', 'Ginza', 'landmark'),
    P('P_akihabara', '秋葉原', 'Akihabara', 'landmark'),
    P('P_harajuku', '原宿', 'Harajuku', 'landmark'),
    P('P_toyosu-market', '豊洲市場', 'Chợ Toyosu', 'landmark'),
    P('P_kokugikan', '両国国技館', 'Nhà thi đấu Sumo Ryogoku Kokugikan', 'culture'),
    P('P_budokan', '日本武道館', 'Nippon Budokan', 'landmark'),
    P('P_tokyo-dome', '東京ドーム', 'Tokyo Dome', 'landmark'),
    P('P_national-stadium', '国立競技場', 'Sân vận động Quốc gia', 'landmark'),
    P('P_kamakura', '鎌倉大仏', 'Tượng Đại Phật Kamakura', 'landmark'),
    P('P_tsurugaoka-hachimangu', '鶴岡八幡宮', 'Đền Tsurugaoka Hachimangu', 'landmark'),
    P('P_enoshima-island', '江の島', 'Đảo Enoshima', 'nature'),
    P('P_yokohama-chinatown', '横浜中華街', 'Phố Tàu Yokohama', 'landmark'),
    P('P_yokohama-brick-warehouse', '横浜赤レンガ倉庫', 'Kho gạch đỏ Yokohama', 'landmark'),
    P('P_sado-island', '佐渡', 'Đảo Sado', 'nature'),
    P('P_tateyama', '立山', 'Núi Tateyama', 'nature'),
    P('P_kurobe-gorge', '黒部峡谷', 'Hẻm núi Kurobe', 'nature'),
    P('P_kenrokuen', '兼六園', 'Vườn Kenrokuen', 'landmark'),
    P('P_tojinbo', '東尋坊', 'Vách đá Tojinbo', 'nature'),
    P('P_sabae', '鯖江', 'Sabae (thủ phủ gọng kính)', 'culture'),
    P('P_fuji-five-lakes', '富士五湖', 'Ngũ hồ Phú Sĩ', 'nature'),
    P('P_mt-fuji', '富士山', 'Núi Phú Sĩ', 'nature'),
    P('P_matsumoto-castle', '松本城', 'Thành Matsumoto', 'landmark'),
    P('P_jigokudani', '地獄谷野猿公苑', 'Công viên khỉ Jigokudani', 'nature'),
    P('P_shirakawa-go', '白川郷', 'Làng cổ Shirakawa-go', 'heritage'),
    P('P_miho-no-matsubara', '三保の松原', 'Rừng thông Miho no Matsubara', 'nature'),
    P('P_nagoya-castle', '名古屋城', 'Thành Nagoya', 'landmark'),
    P('P_ise-jingu', '伊勢神宮', 'Đền Ise', 'landmark'),
    P('P_enryakuji', '比叡山延暦寺', 'Chùa Enryaku-ji (núi Hiei)', 'landmark'),
    P('P_rokuonji', '鹿苑寺（金閣寺）', 'Chùa Vàng (Kinkaku-ji)', 'landmark'),
    P('P_fushimi-inari', '伏見稲荷大社', 'Đền Fushimi Inari', 'landmark'),
    P('P_kiyomizu', '清水寺', 'Chùa Kiyomizu', 'landmark'),
    P('P_ginkaku-ji', '慈照寺（銀閣寺）', 'Chùa Bạc (Ginkaku-ji)', 'landmark'),
    P('P_ama-no-hashidate', '天橋立', 'Doi cát Amanohashidate', 'nature'),
    P('P_tsutenkaku-tower', '通天閣', 'Tháp Tsutenkaku', 'landmark'),
    P('P_tower-of-the-sun', '太陽の塔', 'Tháp Mặt Trời', 'landmark'),
    P('P_abeno-harukasu', 'あべのハルカス', 'Tòa nhà Abeno Harukas', 'landmark'),
    P('P_tomb-emperor-nintoku', '大山古墳（仁徳天皇陵）', 'Lăng Thiên hoàng Nintoku (Daisen Kofun)', 'heritage'),
    P('P_himeji-castle', '姫路城', 'Thành Himeji', 'heritage'),
    P('P_koshien', '甲子園', 'Sân bóng chày Koshien', 'landmark'),
    P('P_nara-park', '奈良公園', 'Công viên Nara', 'landmark'),
    P('P_todaiji', '東大寺大仏', 'Tượng Đại Phật chùa Todai-ji', 'landmark'),
    P('P_horyuji', '法隆寺', 'Chùa Horyu-ji', 'heritage'),
    P('P_nachi-falls', '那智の滝', 'Thác Nachi', 'nature'),
    P('P_tottori-sand-dunes', '鳥取砂丘', 'Đồi cát Tottori', 'nature'),
    P('P_izumo', '出雲大社', 'Đền Izumo Taisha', 'landmark'),
    P('P_korakuen', '岡山後楽園', 'Vườn Korakuen (Okayama)', 'landmark'),
    P('P_seto-bridge', '瀬戸大橋', 'Cầu Seto Ohashi', 'landmark'),
    P('P_itsukushima', '厳島神社', 'Đền Itsukushima', 'heritage'),
    P('P_atomic-bomb-dome', '原爆ドーム', 'Mái vòm Bom nguyên tử', 'heritage'),
    P('P_hiroshima-peace-park', '広島平和記念公園', 'Công viên Tưởng niệm Hòa bình Hiroshima', 'landmark'),
    P('P_senkoku-ji', '千光寺', 'Chùa Senko-ji (Onomichi)', 'landmark'),
    P('P_kintaikyo', '錦帯橋', 'Cầu Kintai', 'landmark'),
    P('P_kotohiragu', '金刀比羅宮', 'Đền Kotohira-gu (Konpira)', 'landmark'),
    P('P_dogo-onsen', '道後温泉', 'Suối nước nóng Dogo', 'landmark'),
    P('P_shimanto-river', '四万十川', 'Sông Shimanto', 'nature'),
    P('P_dazaifu-tenmangu', '太宰府天満宮', 'Đền Dazaifu Tenmangu', 'landmark'),
    P('P_karatsu-float', '唐津くんち', 'Lễ hội Karatsu Kunchi', 'culture'),
    P('P_yoshinogari', '吉野ヶ里遺跡', 'Di tích Yoshinogari', 'heritage'),
    P('P_nagasaki-peace-park', '長崎平和公園', 'Công viên Hòa bình Nagasaki', 'landmark'),
    P('P_oura-church', '大浦天主堂', 'Nhà thờ Oura', 'heritage'),
    P('P_amakusa', '天草諸島', 'Quần đảo Amakusa', 'nature'),
    P('P_yufuin', '湯布院', 'Yufuin', 'landmark'),
    P('P_takachiho', '高千穂峡', 'Hẻm núi Takachiho', 'nature'),
    P('P_yakushima', '屋久島', 'Đảo Yakushima', 'nature'),
    P('P_tanegashima', '種子島', 'Đảo Tanegashima', 'nature'),
    P('P_shurijo', '首里城', 'Thành Shuri', 'heritage'),

    // ---- Thiên nhiên / di sản / văn hóa gắn với địa phương (N_, H_, C_) ----
    P('N_shirakami', '白神山地', 'Dãy núi Shirakami', 'nature'),
    P('N_fukuroda-falls', '袋田の滝', 'Thác Fukuroda', 'nature'),
    P('N_kegon-falls', '華厳の滝', 'Thác Kegon', 'nature'),
    P('N_kusatsu', '草津温泉', 'Suối nước nóng Kusatsu', 'nature'),
    P('N_le-corbusier', 'ル・コルビジェの建築作品', 'Công trình của Le Corbusier (Bảo tàng Mỹ thuật Phương Tây Quốc gia)', 'heritage'),
    P('N_suwako', '諏訪湖', 'Hồ Suwa', 'nature'),
    P('H_kyu-kaichigakkou-kousha', '旧開智学校校舎', 'Trường cổ Kaichi', 'heritage'),
    P('N_gero', '下呂温泉', 'Suối nước nóng Gero', 'nature'),
    P('N_kiisanchi', '紀伊山地の霊場と参詣道', 'Thánh địa và đường hành hương dãy núi Kii', 'heritage'),
    P('N_arima', '有馬温泉', 'Suối nước nóng Arima', 'nature'),
    P('H_iwamiginzan', '石見銀山遺跡', 'Mỏ bạc Iwami Ginzan', 'heritage'),
    P('C_awa-dance', '阿波おどり', 'Điệu múa Awa Odori', 'culture'),
    P('H_yosakoi', 'よさこい', 'Điệu múa Yosakoi', 'culture'),
    P('H_munakata-okinoshima', '宗像・沖ノ島', 'Đảo thiêng Okinoshima (Munakata)', 'heritage'),
    P('H_gunkanjima', '軍艦島（端島）', 'Đảo Gunkanjima (Hashima)', 'heritage'),
    P('H_dejima', '出島', 'Đảo Dejima', 'heritage'),
    P('H_glovergarden', 'グラバー園', 'Vườn Glover', 'heritage'),
    P('N_hausutenbosu', 'ハウステンボス', 'Huis Ten Bosch', 'landmark'),
    P('N_kujukushima', '九十九島', 'Quần đảo Kujukushima', 'nature'),
    P('N_fugendake', '普賢岳', 'Núi Fugen (Unzen)', 'nature'),
    P('N_amami-oshima_tokunoshima_iriomotejima', '奄美大島・徳之島・西表島', 'Amami Oshima, Tokunoshima và Iriomote', 'nature'),

    // ---- Đặc sản (F_): chỉ những món gắn rõ với một tỉnh ----
    P('F_kelp', '昆布', 'Tảo bẹ kombu', 'food'),
    P('F_apple', 'りんご', 'Táo', 'food'),
    P('F_noodles-wanko-soba', 'わんこそば', 'Mì Wanko soba', 'food'),
    P('F_sasakama', '笹かまぼこ', 'Chả cá Sasa-kamaboko', 'food'),
    P('F_cherry', 'さくらんぼ', 'Anh đào', 'food'),
    P('F_strawberry', 'いちご', 'Dâu tây', 'food'),
    P('F_peanut', '落花生', 'Lạc (đậu phộng)', 'food'),
    P('F_sasa-dango', '笹団子', 'Bánh Sasa-dango', 'food'),
    P('F_kakinotane', '柿の種', 'Bánh gạo Kaki no tane', 'food'),
    P('F_squid-firefly', 'ほたるいか', 'Mực đom đóm', 'food'),
    P('F_grape', 'ぶどう', 'Nho', 'food'),
    P('F_peach', '桃', 'Đào', 'food'),
    P('F_oyaki', 'おやき', 'Bánh Oyaki', 'food'),
    P('F_lobster', '伊勢海老', 'Tôm hùm Ise', 'food'),
    P('F_clam-shijimi', 'しじみ', 'Hến Shijimi', 'food'),
    P('F_kibi-dango', 'きびだんご', 'Bánh Kibi-dango', 'food'),
    P('F_momiji-manju', 'もみじ饅頭', 'Bánh Momiji-manju', 'food'),
    P('F_oyster', '牡蠣', 'Hàu', 'food'),
    P('F_pufferfish', 'ふぐ', 'Cá nóc', 'food'),
    P('F_olive', 'オリーブ', 'Ô liu', 'food'),
    P('F_spicy-cod-roe', '明太子', 'Trứng cá tuyết cay Mentaiko', 'food'),
    P('F_castella', 'カステラ', 'Bánh Castella', 'food'),
    P('F_karasumi', 'からすみ', 'Trứng cá đối khô Karasumi', 'food'),
  ].map((p) => [p.id, p]),
);

/**
 * Icon của từng tỉnh (theo mã JIS). Icon đầu tiên là biểu tượng chính, hiện trên bản đồ cạnh tên tỉnh.
 * Thứ tự: địa danh/thiên nhiên/di sản trước, đặc sản sau.
 */
export const PREFECTURE_PICTOGRAMS: Record<number, string[]> = {
  1: ['P_shiretoko', 'P_lake-mashu', 'F_kelp'], // Hokkaido
  2: ['P_nebuta', 'N_shirakami', 'F_apple'], // Aomori (Shirakami: cùng Akita)
  3: ['P_chuson-ji', 'F_noodles-wanko-soba'], // Iwate
  4: ['P_matsushima', 'F_sasakama'], // Miyagi
  5: ['P_namahage', 'N_shirakami'], // Akita
  6: ['P_ginzan', 'F_cherry'], // Yamagata
  7: ['P_sazaedo'], // Fukushima
  8: ['P_kairakuen', 'P_kashima-jingu', 'N_fukuroda-falls'], // Ibaraki
  9: ['P_nikko-toshogu', 'N_kegon-falls', 'F_strawberry'], // Tochigi
  10: ['P_tomioka', 'N_kusatsu'], // Gunma
  11: ['P_kawagoe'], // Saitama
  12: ['P_shinshoji', 'F_peanut'], // Chiba
  13: [
    'P_tokyo-tower',
    'P_tokyo-skytree',
    'P_asakusa',
    'P_imperial-palace',
    'P_meiji-jingu',
    'P_kabukiza',
    'P_national-diet-building',
    'P_ginza',
    'P_akihabara',
    'P_harajuku',
    'P_toyosu-market',
    'P_kokugikan',
    'P_budokan',
    'P_tokyo-dome',
    'P_national-stadium',
    'N_le-corbusier',
  ], // Tokyo
  14: ['P_kamakura', 'P_tsurugaoka-hachimangu', 'P_enoshima-island', 'P_yokohama-chinatown', 'P_yokohama-brick-warehouse'], // Kanagawa
  15: ['P_sado-island', 'F_sasa-dango', 'F_kakinotane'], // Niigata
  16: ['P_tateyama', 'P_kurobe-gorge', 'F_squid-firefly'], // Toyama
  17: ['P_kenrokuen'], // Ishikawa
  18: ['P_tojinbo', 'P_sabae'], // Fukui
  19: ['P_fuji-five-lakes', 'P_mt-fuji', 'F_grape', 'F_peach'], // Yamanashi (núi Phú Sĩ: cùng Shizuoka)
  20: ['P_matsumoto-castle', 'P_jigokudani', 'N_suwako', 'H_kyu-kaichigakkou-kousha', 'F_oyaki'], // Nagano
  21: ['P_shirakawa-go', 'N_gero'], // Gifu
  22: ['P_mt-fuji', 'P_miho-no-matsubara'], // Shizuoka
  23: ['P_nagoya-castle'], // Aichi
  24: ['P_ise-jingu', 'N_kiisanchi', 'F_lobster'], // Mie (núi Kii: cùng Nara, Wakayama)
  25: ['P_enryakuji'], // Shiga
  26: ['P_rokuonji', 'P_fushimi-inari', 'P_kiyomizu', 'P_ginkaku-ji', 'P_ama-no-hashidate'], // Kyoto
  27: ['P_tsutenkaku-tower', 'P_tower-of-the-sun', 'P_abeno-harukasu', 'P_tomb-emperor-nintoku'], // Osaka
  28: ['P_himeji-castle', 'P_koshien', 'N_arima'], // Hyogo
  29: ['P_nara-park', 'P_todaiji', 'P_horyuji', 'N_kiisanchi'], // Nara
  30: ['P_nachi-falls', 'N_kiisanchi'], // Wakayama
  31: ['P_tottori-sand-dunes'], // Tottori
  32: ['P_izumo', 'H_iwamiginzan', 'F_clam-shijimi'], // Shimane
  33: ['P_korakuen', 'P_seto-bridge', 'F_kibi-dango'], // Okayama (cầu Seto Ohashi: cùng Kagawa)
  34: ['P_itsukushima', 'P_atomic-bomb-dome', 'P_hiroshima-peace-park', 'P_senkoku-ji', 'F_momiji-manju', 'F_oyster'], // Hiroshima
  35: ['P_kintaikyo', 'F_pufferfish'], // Yamaguchi
  36: ['C_awa-dance'], // Tokushima
  37: ['P_kotohiragu', 'P_seto-bridge', 'F_olive'], // Kagawa
  38: ['P_dogo-onsen'], // Ehime
  39: ['P_shimanto-river', 'H_yosakoi'], // Kochi
  40: ['P_dazaifu-tenmangu', 'H_munakata-okinoshima', 'F_spicy-cod-roe'], // Fukuoka
  41: ['P_karatsu-float', 'P_yoshinogari'], // Saga
  42: [
    'H_gunkanjima',
    'P_nagasaki-peace-park',
    'P_oura-church',
    'H_dejima',
    'H_glovergarden',
    'N_hausutenbosu',
    'N_kujukushima',
    'N_fugendake',
    'F_castella',
    'F_karasumi',
  ], // Nagasaki
  43: ['P_amakusa'], // Kumamoto
  44: ['P_yufuin'], // Oita
  45: ['P_takachiho'], // Miyazaki
  46: ['P_yakushima', 'P_tanegashima', 'N_amami-oshima_tokunoshima_iriomotejima'], // Kagoshima (Amami: cùng Okinawa)
  47: ['P_shurijo', 'N_amami-oshima_tokunoshima_iriomotejima'], // Okinawa
};

/** Các tỉnh dùng chung một icon (để ghi chú "cùng với ...") */
export const PICTOGRAM_PREFECTURES: Record<string, number[]> = (() => {
  const out: Record<string, number[]> = {};
  for (const [pref, ids] of Object.entries(PREFECTURE_PICTOGRAMS)) {
    for (const id of ids) (out[id] ||= []).push(Number(pref));
  }
  return out;
})();

/**
 * Đường dẫn file biểu tượng. Id có tiền tố "X_" là biểu tượng riêng của JCAP (public/explore-icons) cho địa điểm
 * bộ NDC không có (vd. sân bay), để không lẫn với bộ NDC (bộ NDC không được sửa hình).
 */
export const pictogramUrl = (id: string) =>
  id.startsWith('X_') ? `${import.meta.env.BASE_URL}explore-icons/${id}.svg` : `${import.meta.env.BASE_URL}pictograms/${id}.svg`;
